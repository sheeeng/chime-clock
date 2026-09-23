import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ChimeAnimation } from './clockMode';

/**
 * The chime identifier contract.
 *
 * `ChimeAnimation.id` names one chime start. The producer of the event owes
 * the clock four guarantees, and the clock owes the producer one behavior in
 * return.
 *
 * 1. **Unique.** Two different chime starts never share an identifier during
 *    one page session.
 * 2. **Increasing.** Each new start carries an identifier greater than every
 *    identifier issued before it in the same page session. The source is an
 *    incrementing counter that outlives every component, for example one
 *    stored in a module or in `App.tsx`. The identifier must never derive
 *    from wall clock time or from time corrected against a network time
 *    server, because a clock correction can move that reading backward and
 *    turn a new start into a stale one.
 * 3. **Fresh on every start.** A restart is a start. Stopping a sequence and
 *    ringing again is two starts and therefore two identifiers. Task 9 issues
 *    a newly incremented identifier for every start and every restart.
 * 4. **Constant strike count.** An identifier carries one strike count for
 *    its whole life. A producer must never send the same identifier again
 *    with a different count.
 *
 * In return the clock treats a repeated identifier and strike count as the
 * same sequence seen again rather than as a new one, which is what lets a
 * chime survive a remount or a mode change without replaying. For this to
 * hold, `useChimeAnimationSession` must stay mounted for the whole page
 * session, in every clock mode, because a chime that rings while the hook is
 * unmounted is observed by nothing and cannot be resumed later. Identifiers
 * reset when the page reloads, because the session record resets with it.
 *
 * **Stop semantics.** Withdrawing the event, that is passing `null`, cancels
 * the drawing that is on screen: the door closes and the bird hides on the
 * next frame. It does not erase the session record and it does not rewind the
 * sequence. Passing the same identifier again therefore resumes the original
 * sequence at its true elapsed phase, and a sequence that has already run out
 * stays out. Ringing again after a stop requires a new identifier.
 *
 * The contract is enforced rather than assumed. An identifier below the
 * current record, or a repeated identifier with a different strike count, is
 * refused: it never replaces the record and never draws. A refusal also
 * leaves whatever sequence a consumer already resolved running untouched, so
 * a producer that breaks guarantee 2 or guarantee 4 loses its own animation
 * instead of corrupting or rewinding the sequence that is running. Development
 * builds report each refusal with `console.warn`, naming the identifier that
 * was refused and the identifier the session recorded; production builds
 * never log it, because the check compiles away with `import.meta.env.DEV`.
 */
type ObservedChimeAnimation = {
  id: number;
  strikes: number;
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
 * The newest chime sequence this application session has seen. The record
 * lives in the module rather than in a component, so it survives every mount,
 * unmount, and remount of the clock until the page reloads.
 */
let observedChimeAnimation: ObservedChimeAnimation | null = null;

/**
 * Warns in development only. Vite replaces `import.meta.env.DEV` with the
 * literal `false` in a production build, so the minifier removes this call
 * along with the branch that guards it, and nothing reaches a user's console.
 */
function warnInDevelopment(message: string): void {
  if (import.meta.env.DEV) console.warn(message);
}

/**
 * Records the arrival of a chime sequence and returns the moment the sequence
 * began, measured on the same monotonic clock the renderer reads.
 *
 * An identifier greater than the record, or no record at all, starts a new
 * sequence now. The identifier of the record, carrying the same strike count
 * the record holds, returns the start time already fixed for it, so a
 * sequence advances toward its end no matter how often the clock remounts. A
 * finished sequence therefore stays finished, and a sequence that arrived
 * while another mode was on screen is already spent by the time the cuckoo
 * appears.
 *
 * An identifier below the record is stale and is refused without disturbing
 * the record. The identifier of the record with a different strike count is
 * also refused, because accepting it would change how long the sequence
 * already running plays for. Both refusals warn in development, naming the
 * identifier that was refused and the identifier the session recorded.
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

  const record = observedChimeAnimation;

  if (record !== null && animation.id === record.id) {
    if (animation.strikes !== record.strikes) {
      warnInDevelopment(
        `Chime animation ${animation.id} arrived with ${animation.strikes} ` +
          `strikes, but the session already recorded ${record.strikes} ` +
          `strikes for that identifier. An identifier must carry one strike ` +
          `count for its whole life, so the new count was refused.`,
      );

      return null;
    }

    return record.startedAtMilliseconds;
  }

  if (record !== null && animation.id < record.id) {
    // A stale identifier belongs to a sequence the session has already moved
    // past. Replacing the record with it would restart an old chime and lose
    // the origin of the one that is running.
    warnInDevelopment(
      `Chime animation ${animation.id} arrived after the session already ` +
        `recorded ${record.id}. Identifiers must increase with every ` +
        `chime start, so the stale identifier was refused.`,
    );

    return null;
  }

  observedChimeAnimation = {
    id: animation.id,
    strikes: animation.strikes,
    startedAtMilliseconds: performance.now(),
  };

  return observedChimeAnimation.startedAtMilliseconds;
}

/**
 * Clears the record. Tests use this to isolate one case from the next.
 *
 * Nothing in the application calls this, so the bundler drops it from the
 * production build. The Task 8 report records the evidence.
 */
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
 * finished before a remount cannot start again. This is also why the hook
 * must stay mounted for the whole page session: unmounting it, even briefly,
 * creates a window in which a chime is observed by nothing.
 *
 * The ref holds `null` only when the event is explicitly withdrawn, which
 * cancels the drawing that is on screen. A stale identifier or a repeated
 * identifier with a changed strike count is a different case: the session
 * refuses it and leaves whatever sequence this consumer already resolved
 * running untouched, so a producer that breaks the identifier contract does
 * not rewind or restart the chime that is playing. The hook owns this ref. A
 * consumer reads it every frame and never writes to it.
 */
export function useChimeAnimationSession(
  animation: ChimeAnimation | null,
): RefObject<ChimeSequence | null> {
  const sequenceRef = useRef<ChimeSequence | null>(null);
  const id = animation?.id ?? null;
  const strikes = animation?.strikes ?? 0;

  useEffect(() => {
    if (id === null) {
      // Stopping cancels the drawing without erasing the record, so ringing
      // again needs a new identifier.
      sequenceRef.current = null;
      return;
    }

    const startedAtMilliseconds = observeChimeAnimation({ id, strikes });

    // A refusal is not a withdrawal. Whatever sequence this consumer already
    // resolved keeps running exactly as it was.
    if (startedAtMilliseconds === null) return;

    sequenceRef.current = { strikes, startedAtMilliseconds };
  }, [id, strikes]);

  return sequenceRef;
}
