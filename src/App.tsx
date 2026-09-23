/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, Clock3, Trees } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  getHourlyChimeCount,
  playChime,
  type ChimePlayback,
  type ChimeStyle,
  type ChimeTiming,
} from './audio/chimes';
import { playSecondsSound, type SecondsSoundStyle } from './audio/seconds';
import { ClockDisplay } from './clock/ClockDisplay';
import {
  clockModeOptions,
  readClockMode,
  writeClockMode,
  type ChimeAnimation,
  type ClockMode,
} from './clock/clockMode';
import { OptionSelector } from './components/OptionSelector';
import { createSafeStorage } from './safeStorage';
import { SeasonalBackground } from './seasonal/SeasonalBackground';
import {
  backgroundOptions,
  readBackgroundPreference,
  resolveSeason,
  writeBackgroundPreference,
  type BackgroundMode,
} from './seasonal/background';
import { WeatherPanel } from './weather/WeatherPanel';
import {
  useLocalWeather,
  type LocalWeatherState,
} from './weather/useLocalWeather';

const LogoIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="7 9 12 12 17 9" />
  </svg>
);

const commitSha = import.meta.env.VITE_GIT_COMMIT_SHA_8_CHAR as
  string | undefined;

const chimeModeOptions = [
  { value: 'off', label: 'Off' },
  { value: 15, label: 'Quarterly' },
  { value: 30, label: 'Half-Hourly' },
  { value: 60, label: 'Hourly' },
] as const;

const chimeStyleOptions = [
  { value: 'bell', label: 'Bell' },
  { value: 'classic', label: 'Classic' },
  { value: 'cuckoo', label: 'Cuckoo' },
  { value: 'modern', label: 'Modern' },
  { value: 'westminster', label: 'Westminster' },
] as const;

const secondsSoundOptions = [
  { value: 'off', label: 'Off' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'textured', label: 'Textured' },
] as const;

type ChimeMode = (typeof chimeModeOptions)[number]['value'];

/**
 * The number of chime sequences this page session has started. The counter
 * lives in the module rather than in a component, so it keeps increasing no
 * matter how often the clock mounts, unmounts, and mounts again, which is
 * what `chimeAnimationSession.ts` requires of a chime identifier.
 */
let startedChimeCount = 0;

/**
 * Issues the identifier for one chime start. Every start and every restart
 * takes a fresh one.
 *
 * The identifier is never read from the local clock, from the clock corrected
 * against a network time server, or from the hour, because a correction can
 * move a time reading backward, and the session refuses an identifier that
 * does not increase.
 */
function nextChimeAnimation(strikes: number): ChimeAnimation {
  startedChimeCount += 1;

  return { id: startedChimeCount, strikes };
}

/**
 * Returns the callback that asks the browser for a location, when the weather
 * feed has failed and another location attempt could recover it.
 */
function getLocationRequest(state: LocalWeatherState) {
  if (state.status === 'error') {
    return state.requestLocation;
  }

  return undefined;
}

export default function App() {
  // A preference is never worth a blank page or a dead click handler, so
  // every read and every write goes through a storage that cannot throw. The
  // seam belongs to this mount, so a browser that refuses storage keeps the
  // choice for the page session and nothing longer.
  const [storage] = useState(() => createSafeStorage());
  const [time, setTime] = useState(new Date());
  const [chimeMode, setChimeMode] = useState<ChimeMode>('off');
  const [chimeStyle, setChimeStyle] = useState<ChimeStyle>('classic');
  const [chimeAnimation, setChimeAnimation] = useState<ChimeAnimation | null>(
    null,
  );
  const [secondsSoundStyle, setSecondsSoundStyle] =
    useState<SecondsSoundStyle>('off');
  const [clockMode, setClockMode] = useState<ClockMode>(() =>
    readClockMode(storage),
  );
  const [savedBackgroundMode] = useState<BackgroundMode | null>(() =>
    readBackgroundPreference(storage),
  );
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(
    () => savedBackgroundMode ?? 'dynamic',
  );
  const [ntpOffset, setNtpOffset] = useState<number | null>(null);
  const [ntpLoading, setNtpLoading] = useState<boolean>(true);
  const [ntpError, setNtpError] = useState<boolean>(false);
  const [ntpSource, setNtpSource] = useState<'ntp' | 'http' | null>(null);
  const [hideUI, setHideUI] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimePlaybackRef = useRef<ChimePlayback | null>(null);
  const lastCheckedMinute = useRef<number>(new Date().getMinutes());
  const lastCheckedSecond = useRef<number>(new Date().getSeconds());

  // The weather feed stays enabled for the whole page session. It asks for
  // the visitor's location on load and uses Oslo when the browser cannot
  // provide one.
  const weatherState = useLocalWeather({ enabled: true });
  const requestLocation = getLocationRequest(weatherState);
  // `null` while the feed is not reporting an error, so the recovery effect
  // reads one value rather than reaching into a union from inside its body.
  const weatherFailureReason =
    weatherState.status === 'error' ? weatherState.reason : null;
  const activeSeason = resolveSeason(
    backgroundMode,
    weatherState.status === 'success' ? weatherState.season : null,
  );
  const hasSeasonalBackground = activeSeason !== null;

  const dateString = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(time);

  // The analog and cuckoo models draw the time and cannot be read aloud, so
  // both modes carry the same reading as text for assistive technology.
  const clockTimeLabel = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);

  const formatDuration = (ms: number) => {
    const absMs = Math.abs(ms);
    if (absMs < 1000) return `${Math.round(absMs)}ms`;
    if (absMs < 60000) return `${(absMs / 1000).toFixed(1)} seconds`;
    if (absMs < 3600000) return `${(absMs / 60000).toFixed(1)} minutes`;
    return `${(absMs / 3600000).toFixed(1)} hours`;
  };

  // Time & Chime Interval Effect.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date(Date.now());
      setTime(now);

      let currentMinute = now.getMinutes();
      const currentSecond = now.getSeconds();
      const currentHour = getHourlyChimeCount(now);
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          minute: 'numeric',
        }).formatToParts(now);
        const minPart = parts.find((p) => p.type === 'minute')?.value;
        if (minPart) currentMinute = parseInt(minPart, 10);
      } catch (e) {
        // Fallback to local minute.
      }

      // Check if we transitioned to a new minute to trigger the chime.
      if (chimeMode !== 'off') {
        if (currentMinute !== lastCheckedMinute.current) {
          if (currentMinute % chimeMode === 0) {
            const chimeCount = chimeMode === 60 ? currentHour : 1;
            startChime(chimeStyle, chimeCount, chimeMode);
          }
        }
      }

      if (
        secondsSoundStyle !== 'off' &&
        currentSecond !== lastCheckedSecond.current
      ) {
        playSecondsSound(
          audioCtxRef.current,
          secondsSoundStyle,
          currentSecond % 2,
        );
      }

      lastCheckedMinute.current = currentMinute;
      lastCheckedSecond.current = currentSecond;
    }, 200); // 200ms ensures we capture the second change crisply.

    return () => clearInterval(timer);
  }, [chimeMode, chimeStyle, secondsSoundStyle]);

  // Fetch NTP Offset.
  useEffect(() => {
    const fetchNtpOffset = async () => {
      setNtpLoading(true);
      setNtpError(false);

      // Try real NTP via backend (works in dev / self-hosted).
      try {
        const start = Date.now();
        const res = await fetch('/api/ntp?server=2.pool.ntp.org');
        if (!res.ok) throw new Error('no ntp backend');
        const data = await res.json();
        const end = Date.now();
        const latency = (end - start) / 2;
        const offset = data.time - (start + latency);
        setNtpOffset(offset);
        setNtpSource('ntp');
        setNtpLoading(false);
        return;
      } catch {
        // Fall through to HTTP fallback.
      }

      // Fallback: read the Date response header from the server (works on Vercel/Netlify).
      try {
        const t1 = Date.now();
        const res = await fetch(window.location.href, {
          method: 'HEAD',
          cache: 'no-store',
        });
        const t2 = Date.now();
        const dateHeader = res.headers.get('Date');
        if (!dateHeader) throw new Error('no Date header');
        const serverTime = new Date(dateHeader).getTime();
        const latency = (t2 - t1) / 2;
        const offset = serverTime - (t1 + latency);
        setNtpOffset(offset);
        setNtpSource('http');
        setNtpLoading(false);
      } catch (err) {
        console.error('Failed to sync time:', err);
        setNtpError(true);
        setNtpLoading(false);
      }
    };

    fetchNtpOffset();
  }, []);

  useEffect(
    () => () => {
      chimePlaybackRef.current?.stop();
    },
    [],
  );

  // A dynamic background with no reachable location has nothing to draw, so
  // the live selection returns to `None`.
  //
  // A forecast failure leaves a dynamic background with nothing to draw, but
  // the saved choice remains available for a later visit.
  useEffect(() => {
    if (backgroundMode !== 'dynamic') return;
    if (weatherFailureReason === null) return;

    setBackgroundMode('none');
  }, [backgroundMode, weatherFailureReason]);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext =
        window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const stopChime = () => {
    chimePlaybackRef.current?.stop();
    chimePlaybackRef.current = null;
    // Withdrawing the event closes the cuckoo door on the next frame. It
    // leaves the session record alone, so ringing again takes a fresh
    // identifier rather than resuming the sequence that was cancelled.
    setChimeAnimation(null);
  };

  const startChime = (
    style: ChimeStyle,
    count = 1,
    mode: ChimeMode = chimeMode,
  ) => {
    stopChime();
    initAudio();
    const timing: ChimeTiming =
      mode === 60 ? 'hour' : mode === 30 ? 'half-hour' : 'quarter';
    chimePlaybackRef.current = playChime(
      audioCtxRef.current,
      style,
      count,
      timing,
    );
    // The bird runs exactly as many cycles as the sequence has strikes, so
    // the drawing and the sound always agree.
    setChimeAnimation(nextChimeAnimation(count));
  };

  const handleClockModeChange = (mode: ClockMode) => {
    setClockMode(mode);
    writeClockMode(storage, mode);
  };

  const handleBackgroundChange = (mode: BackgroundMode) => {
    setBackgroundMode(mode);
    writeBackgroundPreference(storage, mode);

    // Only `Dynamic` needs a location. A manual season never asks for one.
    // After a transient failure the feed hands back a way to ask again, so
    // choosing `Dynamic` a second time is a real retry rather than a
    // selection that sits there.
    if (mode === 'dynamic') requestLocation?.();
  };

  return (
    <div className="relative isolate min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans transition-colors duration-500 selection:bg-indigo-500/30">
      <SeasonalBackground season={activeSeason} />

      {/* Header */}
      {!hideUI && (
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="p-6 flex items-center justify-center"
        >
          <div
            className={`flex items-center gap-2 ${
              hasSeasonalBackground
                ? 'rounded-2xl border border-white/20 bg-zinc-950/45 px-4 py-2 text-white shadow-lg shadow-zinc-950/30 backdrop-blur-sm'
                : 'text-zinc-800 dark:text-zinc-200'
            }`}
          >
            <LogoIcon className="h-8 w-8" />
            <span className="text-3xl font-semibold tracking-tight">
              Chime Clock
            </span>
          </div>
        </motion.header>
      )}

      {/* Clock Canvas */}
      <motion.main
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
        className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 w-full cursor-pointer"
        onClick={() => setHideUI(!hideUI)}
        title="Click to toggle full-screen clock."
      >
        <div className="flex flex-col items-center w-full max-w-6xl mx-auto">
          <ClockDisplay
            chimeAnimation={chimeAnimation}
            mode={clockMode}
            time={time}
          />
          {clockMode !== 'digital' && (
            <p className="sr-only">{`The time is ${clockTimeLabel}.`}</p>
          )}
          <div
            className={`mt-8 flex flex-col items-center gap-2 text-lg font-medium tracking-wide sm:text-2xl md:mt-12 ${
              hasSeasonalBackground
                ? 'rounded-2xl border border-white/20 bg-zinc-950/45 px-5 py-3 text-white shadow-lg shadow-zinc-950/30 backdrop-blur-sm'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <span>{dateString}</span>
          </div>

          {!hideUI && (
            <div
              className={`mt-4 flex flex-col items-center justify-center gap-3 text-xs tracking-wide transition-opacity duration-500 sm:text-sm ${
                hasSeasonalBackground
                  ? 'rounded-xl border border-white/15 bg-zinc-950/40 px-4 py-2 text-zinc-100 shadow-lg shadow-zinc-950/30 backdrop-blur-sm'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2">
                {ntpLoading && <span>Syncing with NTP...</span>}
                {ntpError && (
                  <span className="text-red-400/80">Failed to sync NTP.</span>
                )}
                {ntpOffset !== null && !ntpLoading && !ntpError && (
                  <div className="flex flex-col items-center gap-1 text-center max-w-xl mx-auto">
                    <span className="leading-relaxed md:leading-normal">
                      The time difference is{' '}
                      <code className="bg-zinc-200/50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                        {formatDuration(ntpOffset)}
                      </code>{' '}
                      {ntpOffset > 0 ? 'behind' : 'ahead of'}{' '}
                      <code className="bg-zinc-200/50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                        {ntpSource === 'ntp' ? '2.pool.ntp.org' : 'this server'}
                      </code>
                      .
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.main>

      {/* Settings Footer */}
      {!hideUI && (
        <motion.footer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
          className="p-6 pb-12 flex flex-col items-center gap-6"
        >
          <div className="flex flex-col items-center p-6 bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl shadow-xl shadow-zinc-200/50 dark:shadow-none border border-zinc-200/60 dark:border-zinc-800 transition-all duration-300">
            <OptionSelector
              activation="manual"
              icon={<Clock3 className="h-5 w-5" />}
              layoutId="clock-mode-active"
              onChange={handleClockModeChange}
              options={clockModeOptions}
              title="Clock"
              value={clockMode}
            />
            <OptionSelector
              icon={
                chimeMode === 'off' ? (
                  <BellOff className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )
              }
              layoutId="chime-mode-active"
              onChange={(mode) => {
                setChimeMode(mode);
                if (mode !== 'off') {
                  const chimeCount =
                    mode === 60 ? getHourlyChimeCount(new Date()) : 1;
                  startChime(chimeStyle, chimeCount, mode);
                } else {
                  stopChime();
                }
              }}
              options={chimeModeOptions}
              title="Chime Interval"
              value={chimeMode}
            />
            <AnimatePresence initial={false}>
              {chimeMode !== 'off' && (
                <motion.div
                  key="chime-sound"
                  initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="flex w-full justify-center"
                >
                  <OptionSelector
                    layoutId="chime-style-active"
                    onChange={(style) => {
                      setChimeStyle(style);
                      startChime(style);
                    }}
                    options={chimeStyleOptions}
                    title="Chime Sound"
                    value={chimeStyle}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <OptionSelector
              layoutId="seconds-sound-active"
              onChange={(style) => {
                setSecondsSoundStyle(style);
                if (style !== 'off') {
                  initAudio();
                  playSecondsSound(audioCtxRef.current, style, 0);
                }
              }}
              options={secondsSoundOptions}
              title="Seconds Sound"
              value={secondsSoundStyle}
            />
            <OptionSelector
              activation="manual"
              icon={<Trees className="h-5 w-5" />}
              layoutId="background-active"
              onChange={handleBackgroundChange}
              options={backgroundOptions}
              title="Background"
              value={backgroundMode}
            />
          </div>
          <div
            className={`flex w-full max-w-2xl flex-col items-center gap-1 text-center text-xs ${
              hasSeasonalBackground
                ? 'text-zinc-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <WeatherPanel
              hasSeasonalBackground={hasSeasonalBackground}
              showSeasonalAttribution={activeSeason !== null}
              state={weatherState}
            />
            <p>
              Built from{' '}
              {commitSha ? (
                <a
                  href={`https://github.com/sheeeng/chime-clock/commit/${commitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {commitSha}
                </a>
              ) : (
                'dev'
              )}
              . Made with 💚 by Leonard.
            </p>
          </div>
        </motion.footer>
      )}
    </div>
  );
}
