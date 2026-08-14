/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  playChime,
  type ChimePlayback,
  type ChimeStyle,
  type ChimeTiming,
} from './audio/chimes';
import {
  playSecondsSound,
  type SecondsSoundStyle,
} from './audio/seconds';
import { OptionSelector } from './components/OptionSelector';

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

const NumberTicker = ({ value }: { value: string }) => (
  <div className="relative overflow-hidden inline-flex items-center justify-center -my-4 py-4">
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ y: '50%', filter: 'blur(4px)', opacity: 0 }}
        animate={{ y: '0%', filter: 'blur(0px)', opacity: 1 }}
        exit={{ y: '-50%', filter: 'blur(4px)', opacity: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
        className="inline-block"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  </div>
);

const Colon = () => (
  <motion.span
    animate={{ opacity: [1, 0.2, 1] }}
    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    className="inline-block mx-0.5 md:mx-1 -translate-y-[0.05em] text-zinc-300 dark:text-zinc-700"
  >
    :
  </motion.span>
);

const commitSha = import.meta.env.VITE_GIT_COMMIT_SHA_8_CHAR as
  | string
  | undefined;

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

export default function App() {
  const [time, setTime] = useState(new Date());
  const [chimeMode, setChimeMode] = useState<ChimeMode>(60);
  const [chimeStyle, setChimeStyle] = useState<ChimeStyle>('classic');
  const [secondsSoundStyle, setSecondsSoundStyle] =
    useState<SecondsSoundStyle>('off');
  const [ntpOffset, setNtpOffset] = useState<number | null>(null);
  const [ntpLoading, setNtpLoading] = useState<boolean>(true);
  const [ntpError, setNtpError] = useState<boolean>(false);
  const [ntpSource, setNtpSource] = useState<'ntp' | 'http' | null>(null);
  const [hideUI, setHideUI] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chimePlaybackRef = useRef<ChimePlayback | null>(null);
  const lastCheckedMinute = useRef<number>(new Date().getMinutes());
  const lastCheckedSecond = useRef<number>(new Date().getSeconds());

  // Formatting time gracefully adapting to the user's local timezone & locale.
  const formatParts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(time);

  let hour = '';
  let minute = '';
  let second = '';
  let ampm = '';

  formatParts.forEach((part) => {
    if (part.type === 'hour') hour = part.value;
    if (part.type === 'minute') minute = part.value;
    if (part.type === 'second') second = part.value;
    if (part.type === 'dayPeriod') ampm = part.value;
  });

  const dateString = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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
      const currentHour = now.getHours() % 12 || 12;
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
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 flex flex-col font-sans transition-colors duration-500 selection:bg-indigo-500/30">
      {/* Header */}
      {!hideUI && (
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="p-6 flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5 text-zinc-800 dark:text-zinc-200">
            <LogoIcon className="w-6 h-6" />
            <span className="text-xl font-semibold tracking-tight">
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
          <div className="text-[14vw] sm:text-[12vw] md:text-[11vw] lg:text-[9rem] xl:text-[12rem] leading-none font-semibold tracking-tighter flex items-baseline justify-center gap-2 md:gap-4 w-full">
            <div className="flex items-center justify-center font-mono text-zinc-900 dark:text-white">
              <NumberTicker value={hour} />
              <Colon />
              <NumberTicker value={minute} />
              <Colon />
              <NumberTicker value={second} />
            </div>
            {ampm && (
              <span className="text-[5vw] sm:text-[4vw] md:text-[3.5vw] lg:text-5xl xl:text-6xl text-zinc-500 dark:text-zinc-600 font-semibold uppercase ml-1 md:ml-4">
                {ampm}
              </span>
            )}
          </div>
          <div className="mt-8 md:mt-12 text-lg sm:text-2xl text-zinc-500 dark:text-zinc-400 font-medium tracking-wide flex flex-col items-center gap-2">
            <span>{dateString}</span>
          </div>

          {!hideUI && (
            <div className="mt-4 text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 tracking-wide flex flex-col items-center justify-center gap-3 transition-opacity duration-500">
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
                  startChime(chimeStyle, 1, mode);
                } else {
                  stopChime();
                }
              }}
              options={chimeModeOptions}
              title="Chime Interval"
              value={chimeMode}
            />
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
          </div>
          <div className="pt-8 pb-4 text-center text-xs text-slate-400 dark:text-slate-500">
            <p>
              Built from{' '}
              {commitSha ? (
                <a
                  href={`https://github.com/sheeeng/chime-clock/commit/${commitSha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 no-underline transition-colors"
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
