import { act } from '@testing-library/react';

const MAX_ATTEMPTS = 100;

/**
 * Lets React and any already resolved promises settle.
 *
 * Use this only to prove that something does not happen. Anything that does
 * happen has a condition worth waiting for, and `waitForCondition` waits for
 * exactly as long as that condition needs.
 */
export async function drainPendingWork(turns = 5) {
  await act(async () => {
    for (let turn = 0; turn < turns; turn += 1) {
      await Promise.resolve();
    }
  });
}

/**
 * Waits until a condition holds, then returns. Fails with the description
 * rather than with a stale assertion when it never holds.
 *
 * Testing Library's `waitFor` cannot serve here: the cases that need this run
 * on fake timers, and `waitFor` only advances fake timers when a `jest`
 * global exists, which Vitest does not provide. Advancing the fake clock here
 * would also move the clock under test.
 */
export async function waitForCondition(
  description: string,
  condition: () => boolean,
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (condition()) return;

    await drainPendingWork(1);
  }

  throw new Error(`Timed out waiting for ${description}.`);
}
