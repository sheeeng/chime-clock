import { describe, expect, it } from 'vitest';
import {
  CUCKOO_CYCLE_MILLISECONDS,
  CUCKOO_DOOR_OPEN_RADIANS,
  getCuckooAnimation,
  getHandRotations,
} from './ThreeClock';

// Local date construction keeps the expectations independent of the time
// zone used by the test environment.
function localDate(
  hour: number,
  minute: number,
  second: number,
  millisecond = 0,
): Date {
  return new Date(2026, 8, 22, hour, minute, second, millisecond);
}

describe('getHandRotations', () => {
  it('turns the hands clockwise from the local time', () => {
    expect(getHandRotations(localDate(3, 15, 30))).toEqual({
      hour: expect.closeTo(-((3 + 15 / 60 + 30 / 3600) / 12) * Math.PI * 2),
      minute: expect.closeTo(-((15 + 30 / 60) / 60) * Math.PI * 2),
      second: expect.closeTo(-Math.PI),
    });
  });

  it('points every hand up at twelve o clock', () => {
    expect(getHandRotations(localDate(12, 0, 0))).toEqual({
      hour: expect.closeTo(0),
      minute: expect.closeTo(0),
      second: expect.closeTo(0),
    });
  });

  it('folds afternoon hours onto the twelve hour dial', () => {
    expect(getHandRotations(localDate(15, 0, 0)).hour).toBeCloseTo(
      getHandRotations(localDate(3, 0, 0)).hour,
    );
  });

  it('ignores milliseconds so the second hand ticks', () => {
    expect(getHandRotations(localDate(3, 15, 30, 750))).toEqual(
      getHandRotations(localDate(3, 15, 30)),
    );
  });
});

describe('getCuckooAnimation', () => {
  const idle = { active: false, birdOffset: 0, doorRotation: 0 };

  it('opens the door and sends the bird out in the first quarter second', () => {
    expect(getCuckooAnimation(0, 1)).toEqual({
      active: true,
      birdOffset: 0,
      doorRotation: 0,
    });
    expect(getCuckooAnimation(125, 1)).toEqual({
      active: true,
      birdOffset: expect.closeTo(0.5),
      doorRotation: expect.closeTo(CUCKOO_DOOR_OPEN_RADIANS / 2),
    });
  });

  it('holds the bird out between 250 and 500 milliseconds', () => {
    for (const elapsed of [250, 375, 499]) {
      expect(getCuckooAnimation(elapsed, 1)).toEqual({
        active: true,
        birdOffset: 1,
        doorRotation: CUCKOO_DOOR_OPEN_RADIANS,
      });
    }
  });

  it('returns the bird and closes the door between 500 and 750 milliseconds', () => {
    expect(getCuckooAnimation(500, 1)).toEqual({
      active: true,
      birdOffset: 1,
      doorRotation: CUCKOO_DOOR_OPEN_RADIANS,
    });
    expect(getCuckooAnimation(625, 1)).toEqual({
      active: true,
      birdOffset: expect.closeTo(0.5),
      doorRotation: expect.closeTo(CUCKOO_DOOR_OPEN_RADIANS / 2),
    });
  });

  it('stays closed between 750 and 1,000 milliseconds', () => {
    for (const elapsed of [750, 875, 999]) {
      expect(getCuckooAnimation(elapsed, 1)).toEqual({
        active: true,
        birdOffset: 0,
        doorRotation: 0,
      });
    }
  });

  it('runs one cycle for each strike', () => {
    expect(CUCKOO_CYCLE_MILLISECONDS).toBe(1000);
    expect(getCuckooAnimation(1125, 2)).toEqual(getCuckooAnimation(125, 2));
    expect(getCuckooAnimation(1999, 2).active).toBe(true);
    expect(getCuckooAnimation(2000, 2)).toEqual(idle);
  });

  it('ends a single strike after one cycle', () => {
    expect(getCuckooAnimation(999, 1).active).toBe(true);
    expect(getCuckooAnimation(1000, 1)).toEqual(idle);
  });

  it('never runs without a strike', () => {
    expect(getCuckooAnimation(0, 0)).toEqual(idle);
    expect(getCuckooAnimation(125, 0)).toEqual(idle);
    expect(getCuckooAnimation(125, -3)).toEqual(idle);
  });

  it('stays closed for an unusable elapsed time', () => {
    expect(getCuckooAnimation(-1, 2)).toEqual(idle);
    expect(getCuckooAnimation(Number.NaN, 2)).toEqual(idle);
  });
});
