/// <reference types="vite/client" />
import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

export default function App() {
  const [time, setTime] = useState(new Date());
  const [chimeMode, setChimeMode] = useState<'off' | 15 | 30 | 60>('off');
  const [ntpOffset, setNtpOffset] = useState<number | null>(null);
  const [ntpLoading, setNtpLoading] = useState<boolean>(true);
  const [ntpError, setNtpError] = useState<boolean>(false);
  const [ntpSource, setNtpSource] = useState<'ntp' | 'http' | null>(null);
  const [hideUI, setHideUI] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastCheckedMinute = useRef<number>(new Date().getMinutes());

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
            playChime();
          }
        }
      }

      lastCheckedMinute.current = currentMinute;
    }, 200); // 200ms ensures we capture the second change crisply.

    return () => clearInterval(timer);
  }, [chimeMode]);

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

  const playChime = () => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Generates a soft, pleasant 2-tone bell.
    const playNote = (freq: number, delay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.05);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + delay + 2,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 2);
    };

    playNote(523.25, 0); // C5 note.
    playNote(659.25, 0.4); // E5 note.
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
              Chime Time
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
            <div className="flex items-center gap-2 mb-4 text-zinc-500 dark:text-zinc-400">
              {chimeMode !== 'off' ? (
                <Bell className="w-5 h-5" />
              ) : (
                <BellOff className="w-5 h-5" />
              )}
              <span className="font-semibold uppercase tracking-widest text-xs">
                Chime Interval
              </span>
            </div>
            <div className="relative flex flex-wrap justify-center bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl p-1.5 w-full sm:w-auto border border-zinc-200 dark:border-zinc-700">
              {(
                [
                  { mode: 'off', label: 'Off' },
                  { mode: 15, label: 'Quarterly' },
                  { mode: 30, label: 'Half-Hourly' },
                  { mode: 60, label: 'Hourly' },
                ] as const
              ).map(({ mode, label }) => (
                <motion.button
                  key={mode}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChimeMode(mode);
                    if (mode !== 'off') {
                      initAudio();
                      playChime();
                    }
                  }}
                  className={`relative flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 z-10 ${
                    chimeMode === mode
                      ? 'text-zinc-900 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'
                  }`}
                >
                  {chimeMode === mode && (
                    <motion.div
                      layoutId="chime-mode-active"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                      transition={{
                        type: 'spring',
                        bounce: 0.2,
                        duration: 0.6,
                      }}
                      style={{ zIndex: -1 }}
                    />
                  )}
                  {label}
                </motion.button>
              ))}
            </div>
          </div>
          <div className="pt-8 pb-4 text-center text-xs text-slate-400 dark:text-slate-500">
            <p>
              Built from{' '}
              {commitSha ? (
                <a
                  href={`https://github.com/sheeeng/chime-time/commit/${commitSha}`}
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
