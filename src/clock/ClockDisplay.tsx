import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ClockMode } from './clockMode';
import type { ChimeAnimation } from './ThreeClock';

// Three.js, the loaders, and the model assets only arrive with this chunk, so
// the digital mode never downloads them.
const ThreeClock = lazy(() => import('./ThreeClock'));

export type ClockDisplayProps = {
  mode: ClockMode;
  time: Date;
  chimeAnimation: ChimeAnimation | null;
};

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

function DigitalClock({ time }: { time: Date }) {
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

  return (
    <div
      data-testid="digital-clock"
      className="text-[14vw] sm:text-[12vw] md:text-[11vw] lg:text-[9rem] xl:text-[12rem] leading-none font-semibold tracking-tighter flex items-baseline justify-center gap-2 md:gap-4 w-full"
    >
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
  );
}

const modelLabels = {
  analog: 'analog clock',
  cuckoo: 'cuckoo clock',
} as const;

export function ClockDisplay({
  mode,
  time,
  chimeAnimation,
}: ClockDisplayProps) {
  if (mode === 'digital') return <DigitalClock time={time} />;

  return (
    <div className="relative w-full max-w-3xl aspect-[16/10]">
      <Suspense
        fallback={
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            {`Loading the ${modelLabels[mode]}.`}
          </p>
        }
      >
        <ThreeClock mode={mode} time={time} chimeAnimation={chimeAnimation} />
      </Suspense>
    </div>
  );
}
