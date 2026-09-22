export type ClockMode = 'analog' | 'cuckoo' | 'digital';

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
