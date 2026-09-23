import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { drainPendingWork, waitForCondition } from './test/waiting';

/**
 * The lazy clock boundary is proved in a file of its own, and by a single
 * case.
 *
 * A module is imported at most once per test file, so a case that asks
 * whether `ThreeClock` has been imported can only answer honestly while it is
 * the only case that could have imported it. Sharing a file with other cases
 * would make the answer depend on which of them ran first. Here the negative
 * and the positive are two halves of one case, and the file holds nothing
 * else.
 */
const threeClock = vi.hoisted(() => ({ imported: vi.fn() }));

vi.mock('./clock/ThreeClock', () => {
  threeClock.imported();

  return {
    default: ({ mode }: { mode: string }) => (
      <div data-testid="three-clock" data-mode={mode} />
    ),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ time: Date.now() }) })),
  );
  vi.stubGlobal('navigator', {
    language: 'en-GB',
    userAgent: 'vitest',
    geolocation: { getCurrentPosition: vi.fn() },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('loads the Three.js clock only once a model clock is selected', async () => {
  render(<App />);

  await drainPendingWork();

  expect(threeClock.imported).not.toHaveBeenCalled();
  expect(screen.getByTestId('digital-clock')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'Analog' }));

  await waitForCondition(
    'the Three.js clock to arrive',
    () => screen.queryByTestId('three-clock') !== null,
  );

  expect(threeClock.imported).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('digital-clock')).not.toBeInTheDocument();
});
