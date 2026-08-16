import { describe, expect, it } from 'vitest';
import { getHourlyChimeCount } from './chimes';

describe('getHourlyChimeCount', () => {
  it.each([
    [0, 12],
    [1, 1],
    [11, 11],
    [12, 12],
    [13, 1],
    [23, 11],
  ])('maps hour %i to the expected strike count', (hour, expected) => {
    expect(getHourlyChimeCount(new Date(2026, 0, 1, hour))).toBe(expected);
  });
});
