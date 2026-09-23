import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ChimeAnimation } from './clockMode';

type ObservedChimeAnimation = {
  id: number;
  startedAtMilliseconds: number;
};

/**
 * One chime sequence resolved against the durable session record. The start
 * time is the moment the sequence first arrived, not the moment a component
 * mounted, so the renderer always measures the sequence from its true origin.
 */
export type ChimeSequence = {
  strikes: number;
  startedAtMilliseconds: number;
};

/**
 * The chime sequence this application session has already seen. The record
 * lives in the module rather than in a component, so it survives every mount,
 * unmount, and remount of the clock until the page reloads.
 */
let observedChimeAnimation: ObservedChimeAnimation | null = null;

/**
 * Records the arrival of a chime sequence and returns the moment the sequence
 * began, measured on the same monotonic clock the renderer reads.
 *
 * The first observation of an identifier fixes its start time. Every later
 * observation of that identifier returns the original start time, so a
 * sequence advances toward its end no matter how often the clock remounts. A
 * finished sequence therefore stays finished, and a sequence that arrived
 * while another mode was on screen is already spent by the time the cuckoo
 * appears.
 *
 * Returns `null` when there is nothing to animate.
 */
export function observeChimeAnimation(
  animation: ChimeAnimation | null,
): number | null {
  if (
    animation === null ||
    !Number.isFinite(animation.id) ||
    animation.strikes <= 0
  ) {
    return null;
  }

  if (observedChimeAnimation?.id !== animation.id) {
    observedChimeAnimation = {
      id: animation.id,
      startedAtMilliseconds: performance.now(),
    };
  }

  return observedChimeAnimation.startedAtMilliseconds;
}

/** Clears the record. Tests use this to isolate one case from the next. */
export function resetChimeAnimationSession(): void {
  observedChimeAnimation = null;
}

/**
 * Reports each chime sequence to the session record and returns the resolved
 * sequence in a ref, so an animation loop can read it without re-rendering.
 *
 * Every clock mode calls this hook, including the modes that draw nothing.
 * A sequence that rings while the digital or analog clock is on screen is
 * therefore already spent when the cuckoo appears, and a sequence that
 * finished before a remount cannot start again.
 *
 * The ref holds `null` whenever there is nothing to animate, which cancels a
 * stopped sequence on the next frame.
 */
export function useChimeAnimationSession(
  animation: ChimeAnimation | null,
): RefObject<ChimeSequence | null> {
  const sequenceRef = useRef<ChimeSequence | null>(null);
  const id = animation?.id ?? null;
  const strikes = animation?.strikes ?? 0;

  useEffect(() => {
    if (id === null) {
      sequenceRef.current = null;
      return;
    }

    const startedAtMilliseconds = observeChimeAnimation({ id, strikes });

    sequenceRef.current =
      startedAtMilliseconds === null
        ? null
        : { strikes, startedAtMilliseconds };
  }, [id, strikes]);

  return sequenceRef;
}
