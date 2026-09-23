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
 * (arrowing past Analog and Cuckoo without committing, then committing
 * neither) and the positive (an explicit selection) are parts of one case,
 * and the file holds nothing else.
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

  // The Clock selector holds manual activation, so arrowing from Digital,
  // through Analog, and on to Cuckoo must not load the module either one
  // needs.
  const digitalRadio = screen.getByRole('radio', { name: 'Digital' });
  digitalRadio.focus();
  fireEvent.keyDown(digitalRadio, { key: 'ArrowRight' });

  const analogRadio = screen.getByRole('radio', { name: 'Analog' });

  expect(analogRadio).toHaveFocus();
  fireEvent.keyDown(analogRadio, { key: 'ArrowRight' });

  const cuckooRadio = screen.getByRole('radio', { name: 'Cuckoo' });

  expect(cuckooRadio).toHaveFocus();
  await drainPendingWork();

  expect(threeClock.imported).not.toHaveBeenCalled();
  expect(screen.getByTestId('digital-clock')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Digital' })).toBeChecked();

  fireEvent.click(analogRadio);

  await waitForCondition(
    'the Three.js clock to arrive',
    () => screen.queryByTestId('three-clock') !== null,
  );

  expect(threeClock.imported).toHaveBeenCalledOnce();
  expect(screen.queryByTestId('digital-clock')).not.toBeInTheDocument();
});
