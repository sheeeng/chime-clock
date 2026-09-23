import { describe, expect, it } from 'vitest';
import {
  backgroundOptions,
  BACKGROUND_STORAGE_KEY,
  readBackgroundPreference,
  resolveInitialBackground,
  resolveSeason,
  writeBackgroundPreference,
} from './background';

function storageWith(value: string | null) {
  return {
    getItem: () => value,
  };
}

describe('backgroundOptions', () => {
  it('keeps the required order and labels', () => {
    expect(backgroundOptions).toEqual([
      { value: 'none', label: 'None' },
      { value: 'dynamic', label: 'Dynamic' },
      { value: 'spring', label: 'Spring' },
      { value: 'summer', label: 'Summer' },
      { value: 'autumn', label: 'Autumn' },
      { value: 'winter', label: 'Winter' },
    ]);
  });
});

describe('readBackgroundPreference', () => {
  it('reads a saved season preference', () => {
    expect(readBackgroundPreference(storageWith('winter'))).toBe('winter');
  });

  it('returns null when nothing is stored', () => {
    expect(readBackgroundPreference(storageWith(null))).toBeNull();
  });

  it('rejects an unknown saved value', () => {
    expect(readBackgroundPreference(storageWith('invalid'))).toBeNull();
  });
});

describe('writeBackgroundPreference', () => {
  it('writes the selected preference immediately', () => {
    const values: Record<string, string> = {};
    const storage = {
      setItem(key: string, value: string) {
        values[key] = value;
      },
    };

    writeBackgroundPreference(storage, 'spring');

    expect(values).toEqual({
      [BACKGROUND_STORAGE_KEY]: 'spring',
    });
  });
});

describe('resolveInitialBackground', () => {
  it('defaults to dynamic only when permission is granted', () => {
    expect(resolveInitialBackground(null, 'granted')).toBe('dynamic');
  });

  it('defaults to none for prompt, denied, and unsupported states', () => {
    expect(resolveInitialBackground(null, 'prompt')).toBe('none');
    expect(resolveInitialBackground(null, 'denied')).toBe('none');
    expect(resolveInitialBackground(null, 'unsupported')).toBe('none');
  });

  it('keeps the saved preference over permission state', () => {
    expect(resolveInitialBackground('summer', 'denied')).toBe('summer');
    expect(resolveInitialBackground('summer', 'granted')).toBe('summer');
  });
});

describe('resolveSeason', () => {
  it('maps the dynamic mode to the resolved season', () => {
    expect(resolveSeason('dynamic', 'autumn')).toBe('autumn');
  });

  it('returns null when the background is disabled', () => {
    expect(resolveSeason('none', 'summer')).toBeNull();
  });
});
