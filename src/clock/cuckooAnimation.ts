type CuckooAnimation = {
  active: boolean;
  birdOffset: number;
  doorRotation: number;
};

/** One bird cycle lasts exactly one second. */
export const CUCKOO_CYCLE_MILLISECONDS = 1000;

/** The door stands fully open at a quarter turn. */
export const CUCKOO_DOOR_OPEN_RADIANS = Math.PI / 2;

const CUCKOO_EXIT_MILLISECONDS = 250;
const CUCKOO_HOLD_MILLISECONDS = 500;
const CUCKOO_RETURN_MILLISECONDS = 750;

const IDLE_CUCKOO_ANIMATION: CuckooAnimation = {
  active: false,
  birdOffset: 0,
  doorRotation: 0,
};

/**
 * Returns the cuckoo door and bird placement for the elapsed time of a chime
 * sequence. Each strike runs one cycle: the door opens and the bird leaves
 * during the first quarter second, the bird waits outside until the half
 * second, the bird returns and the door closes by three quarters of a second,
 * and the door stays closed until the second ends.
 */
export function getCuckooAnimation(
  elapsedMilliseconds: number,
  strikes: number,
  strikeOffsetsMilliseconds?: readonly number[],
): CuckooAnimation {
  if (!Number.isFinite(elapsedMilliseconds) || strikes <= 0) {
    return IDLE_CUCKOO_ANIMATION;
  }

  if (strikeOffsetsMilliseconds) {
    const offsets = strikeOffsetsMilliseconds.slice(0, strikes);
    const lastOffset = offsets.at(-1);
    if (lastOffset === undefined || elapsedMilliseconds >= lastOffset + CUCKOO_RETURN_MILLISECONDS) {
      return IDLE_CUCKOO_ANIMATION;
    }
    const strikeOffset = offsets.slice().reverse().find(offset => offset <= elapsedMilliseconds);
    const cycle = strikeOffset === undefined
      ? IDLE_CUCKOO_ANIMATION
      : getCuckooAnimation(elapsedMilliseconds - strikeOffset, 1);
    return { ...cycle, active: true };
  }

  if (
    elapsedMilliseconds < 0 ||
    elapsedMilliseconds >= strikes * CUCKOO_CYCLE_MILLISECONDS
  ) {
    return IDLE_CUCKOO_ANIMATION;
  }

  const phase = elapsedMilliseconds % CUCKOO_CYCLE_MILLISECONDS;
  let birdOffset = 0;

  if (phase < CUCKOO_EXIT_MILLISECONDS) {
    birdOffset = phase / CUCKOO_EXIT_MILLISECONDS;
  } else if (phase < CUCKOO_HOLD_MILLISECONDS) {
    birdOffset = 1;
  } else if (phase < CUCKOO_RETURN_MILLISECONDS) {
    birdOffset =
      1 -
      (phase - CUCKOO_HOLD_MILLISECONDS) /
        (CUCKOO_RETURN_MILLISECONDS - CUCKOO_HOLD_MILLISECONDS);
  }

  return {
    active: true,
    birdOffset,
    doorRotation: birdOffset * CUCKOO_DOOR_OPEN_RADIANS,
  };
}
