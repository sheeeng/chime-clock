export type ClockMode = 'analog' | 'cuckoo' | 'digital';

/**
 * The modes drawn by the lazily loaded Three.js clock. The union is derived
 * from `ClockMode` so a new mode cannot be added without deciding whether the
 * 3D renderer handles it.
 */
export type ThreeClockMode = Exclude<ClockMode, 'digital'>;

/**
 * One chime sequence to animate. The identifier distinguishes one sequence
 * from the next, and the strike count sets how many bird cycles run.
 *
 * Identifiers are unique and strictly increasing for each chime start during
 * one page session, and every start or restart takes a fresh one.
 * `chimeAnimationSession.ts` documents and enforces the full contract.
 *
 * This type lives here rather than in the Three.js module so that a consumer
 * who imports it without the `type` keyword still cannot pull Three.js, the
 * loaders, or the model assets into the digital bundle.
 */
export type ChimeAnimation = {
  id: number;
  strikes: number;
};

export const CLOCK_MODE_STORAGE_KEY = 'chime-clock-mode';

export const clockModeOptions = [
  { value: 'analog', label: 'Analog' },
  { value: 'cuckoo', label: 'Cuckoo' },
  { value: 'digital', label: 'Digital' },
] as const satisfies readonly { value: ClockMode; label: string }[];

const clockModeSet = new Set<ClockMode>(
  clockModeOptions.map(({ value }) => value),
);

export function readClockMode(
  storage: Pick<Storage, 'getItem'>,
): ClockMode {
  const value = storage.getItem(CLOCK_MODE_STORAGE_KEY);

  return isClockMode(value) ? value : 'digital';
}

export function writeClockMode(
  storage: Pick<Storage, 'setItem'>,
  mode: ClockMode,
): void {
  storage.setItem(CLOCK_MODE_STORAGE_KEY, mode);
}

function isClockMode(value: string | null): value is ClockMode {
  return value !== null && clockModeSet.has(value as ClockMode);
}
