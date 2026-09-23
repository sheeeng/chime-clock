import { describe, expect, it } from 'vitest';
import {
  CLOCK_MODE_STORAGE_KEY,
  clockModeOptions,
  readClockMode,
  writeClockMode,
} from './clockMode';

function storageWith(value: string | null) {
  return {
    getItem: () => value,
  };
}

describe('clockModeOptions', () => {
  it('keeps the required order and labels', () => {
    expect(clockModeOptions.map(({ label }) => label)).toEqual([
      'Analog',
      'Cuckoo',
      'Digital',
    ]);
  });
});

describe('readClockMode', () => {
  it('defaults to digital when nothing is stored', () => {
    expect(readClockMode(storageWith(null))).toBe('digital');
  });

  it('reads a saved clock mode', () => {
    expect(readClockMode(storageWith('analog'))).toBe('analog');
  });

  it('falls back to digital for an invalid stored value', () => {
    expect(readClockMode(storageWith('invalid'))).toBe('digital');
  });
});

describe('writeClockMode', () => {
  it('stores the selected value under the clock mode key', () => {
    const values: Record<string, string> = {};
    const storage = {
      setItem(key: string, value: string) {
        values[key] = value;
      },
    };

    writeClockMode(storage, 'cuckoo');

    expect(values).toEqual({
      [CLOCK_MODE_STORAGE_KEY]: 'cuckoo',
    });
  });
});
