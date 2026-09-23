import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { BACKGROUND_STORAGE_KEY } from './seasonal/background';
import { drainPendingWork, waitForCondition } from './test/waiting';

/**
 * The seasonal scene boundary is proved in a file of its own, and by a
 * single case, for the reason `App.lazyClock.test.tsx` gives: a module is
 * imported at most once per test file, so a case that asks whether
 * `SeasonalScene` has been imported can only answer honestly while it is the
 * only case that could have imported it.
 *
 * The negative here is wider than a missing import. Arrowing past `Dynamic`
 * must not ask the browser for a location or write it over a saved
 * preference either, so both are asserted alongside the import before the
 * one commit the case makes.
 */
const seasonalScene = vi.hoisted(() => ({ imported: vi.fn() }));

vi.mock('./seasonal/SeasonalScene', () => {
  seasonalScene.imported();

  return {
    default: ({ season }: { season: string }) => (
      <div data-testid="seasonal-scene" data-season={season} />
    ),
  };
});

function stubGeolocation() {
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success({
      coords: { latitude: 59.9139, longitude: 10.7522 },
    } as GeolocationPosition);
  });

  vi.stubGlobal('navigator', {
    language: 'en-GB',
    userAgent: 'vitest',
    permissions: {
      query: vi.fn().mockResolvedValue({
        state: 'prompt',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    },
    geolocation: { getCurrentPosition },
  });

  return getCurrentPosition;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ time: Date.now() }) })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

it('arrowing past Dynamic does not request a location, save it, or load the seasonal scene', async () => {
  const getCurrentPosition = stubGeolocation();
  render(<App />);

  await waitForCondition(
    'the permission check to settle on None',
    () => screen.queryByRole('radio', { name: 'None', checked: true }) !==
      null,
  );

  // The Background selector holds manual activation, so arrowing from None,
  // through Dynamic, and on to Spring must not act on any of them.
  const noneRadio = screen.getByRole('radio', { name: 'None' });
  noneRadio.focus();
  fireEvent.keyDown(noneRadio, { key: 'ArrowRight' });

  const dynamicRadio = screen.getByRole('radio', { name: 'Dynamic' });

  expect(dynamicRadio).toHaveFocus();
  fireEvent.keyDown(dynamicRadio, { key: 'ArrowRight' });

  const springRadio = screen.getByRole('radio', { name: 'Spring' });

  expect(springRadio).toHaveFocus();
  await drainPendingWork();

  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBeNull();
  expect(seasonalScene.imported).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'None' })).toBeChecked();

  fireEvent.click(dynamicRadio);

  await waitForCondition(
    'the location to be requested',
    () => getCurrentPosition.mock.calls.length > 0,
  );

  expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('dynamic');
});
