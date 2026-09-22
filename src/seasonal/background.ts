import type { SeasonId } from '../weather/weather';

export type BackgroundMode =
  | 'none'
  | 'dynamic'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter';

export const BACKGROUND_STORAGE_KEY = 'chime-clock-background';

export const backgroundOptions = [
  { value: 'none', label: 'None' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
] as const satisfies readonly { value: BackgroundMode; label: string }[];

const backgroundModeSet = new Set<BackgroundMode>(
  backgroundOptions.map(({ value }) => value),
);

export function readBackgroundPreference(
  storage: Pick<Storage, 'getItem'>,
): BackgroundMode | null {
  const value = storage.getItem(BACKGROUND_STORAGE_KEY);

  return isBackgroundMode(value) ? value : null;
}

export function writeBackgroundPreference(
  storage: Pick<Storage, 'setItem'>,
  mode: BackgroundMode,
): void {
  storage.setItem(BACKGROUND_STORAGE_KEY, mode);
}

export function resolveInitialBackground(
  savedMode: BackgroundMode | null,
  permission: PermissionState | 'unsupported',
): BackgroundMode {
  if (savedMode) {
    return savedMode;
  }

  return permission === 'granted' ? 'dynamic' : 'none';
}

export function resolveSeason(
  mode: BackgroundMode,
  dynamicSeason: SeasonId | null,
): SeasonId | null {
  if (mode === 'dynamic') {
    return dynamicSeason;
  }

  if (mode === 'none') {
    return null;
  }

  return mode;
}

function isBackgroundMode(value: string | null): value is BackgroundMode {
  return value !== null && backgroundModeSet.has(value as BackgroundMode);
}
