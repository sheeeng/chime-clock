import { lazy, Suspense } from 'react';
import type { SeasonId } from '../weather/weather';

type SeasonalBackgroundProps = {
  season: SeasonId | null;
};

const SeasonalScene = lazy(() => import('./SeasonalScene'));

export function SeasonalBackground({ season }: SeasonalBackgroundProps) {
  if (!season) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Suspense fallback={null}>
        <SeasonalScene season={season} />
      </Suspense>
      <div className="absolute inset-0 bg-zinc-50/55 dark:bg-zinc-950/60" />
    </div>
  );
}
