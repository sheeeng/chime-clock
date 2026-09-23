import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { playChime } from './audio/chimes';
import { playSecondsSound } from './audio/seconds';
import { CLOCK_MODE_STORAGE_KEY } from './clock/clockMode';
import { BACKGROUND_STORAGE_KEY } from './seasonal/background';
import { waitForCondition } from './test/waiting';
import type { SeasonId } from './weather/weather';

const stopPlayback = vi.fn();

vi.mock('./audio/chimes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./audio/chimes')>();

  return {
    ...original,
    playChime: vi.fn(() => ({ stop: stopPlayback })),
  };
});

vi.mock('./audio/seconds', () => ({
  playSecondsSound: vi.fn(),
}));

// The real module pulls Three.js, the loaders, and the models. The stub keeps
// the lazy boundary intact and reports the props the integration owes it.
// Whether the boundary holds is proved in `App.lazyClock.test.tsx`, where a
// single case can answer that question without depending on the order of the
// cases around it.
vi.mock('./clock/ThreeClock', () => ({
  default: ({
    mode,
    time,
    chimeAnimation,
  }: {
    mode: string;
    time: Date;
    chimeAnimation: { id: number; strikes: number } | null;
  }) => (
    <div
      data-testid="three-clock"
      data-mode={mode}
      data-time={time.toISOString()}
      data-chime-id={chimeAnimation ? String(chimeAnimation.id) : 'none'}
      data-strikes={chimeAnimation ? String(chimeAnimation.strikes) : 'none'}
    />
  ),
}));

// The real scene mounts the Three UI document, which is far heavier than the
// contract under test: the season the application resolved.
vi.mock('./seasonal/SeasonalScene', () => ({
  default: ({ season }: { season: SeasonId }) => (
    <div data-testid="seasonal-scene" data-season={season} />
  ),
}));

class AudioContextStub {
  state = 'running';

  resume = vi.fn();
}

const FORECAST_HOST = 'api.met.no';

const UNAVAILABLE_MESSAGE = 'Local weather is unavailable.';

const ENABLE_LABEL = 'Enable Local Weather';

const systemTime = new Date(2026, 7, 16, 12, 0, 0);

function futureDayIso(daysAhead: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);

  return date.toISOString();
}

/**
 * A forecast whose seven future daily means all sit above ten degrees, which
 * `getSeasonFromForecast` reads as summer in either hemisphere.
 */
function createForecast() {
  return {
    properties: {
      timeseries: [
        {
          time: new Date().toISOString(),
          data: {
            instant: {
              details: {
                air_temperature: 12,
                air_pressure_at_sea_level: 1012,
                cloud_area_fraction: 50,
                relative_humidity: 60,
                wind_speed: 3,
                wind_from_direction: 180,
              },
            },
            next_1_hours: {
              summary: { symbol_code: 'fair_day' },
              details: { precipitation_amount: 0 },
            },
          },
        },
        ...Array.from({ length: 7 }, (_, index) => ({
          time: futureDayIso(index + 1),
          data: {
            instant: {
              details: { air_temperature: 15 },
            },
          },
        })),
      ],
    },
  };
}

function ntpResponse() {
  return { ok: true, json: async () => ({ time: Date.now() }) } as Response;
}

function forecastResponse() {
  return { ok: true, json: async () => createForecast() } as Response;
}

function unavailableResponse() {
  return { ok: false, status: 503, json: async () => ({}) } as Response;
}

function createFetchStub() {
  return vi.fn(async (input: unknown) => {
    if (String(input).includes(FORECAST_HOST)) {
      return forecastResponse();
    }

    return ntpResponse();
  });
}

/**
 * A forecast feed that fails the given number of times before it answers.
 * The count of attempts is returned so a retry can be proved rather than
 * inferred from the screen.
 */
function stubFailingForecast(failures: number) {
  const attempts = { forecast: 0 };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      if (!String(input).includes(FORECAST_HOST)) {
        return ntpResponse();
      }

      attempts.forecast += 1;

      return attempts.forecast <= failures
        ? unavailableResponse()
        : forecastResponse();
    }),
  );

  return attempts;
}

type GeolocationOptions = {
  permission?: PermissionState;
  position?:
    | { latitude: number; longitude: number }
    | 'denied'
    | 'unavailable';
  supported?: boolean;
};

/**
 * Replaces the geolocation surfaces the weather hook reads. Omitting
 * `permission` leaves the permissions API absent, which the hook treats the
 * same way it treats a browser that cannot answer the query. Setting
 * `supported` to false removes geolocation altogether.
 */
function stubGeolocation(options: GeolocationOptions = {}) {
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, failure?: PositionErrorCallback) => {
      if (options.position === undefined || options.position === 'denied') {
        failure?.({ code: 1, message: 'Denied.' } as GeolocationPositionError);
        return;
      }

      if (options.position === 'unavailable') {
        failure?.({
          code: 2,
          message: 'No position.',
        } as GeolocationPositionError);
        return;
      }

      success({ coords: options.position } as GeolocationPosition);
    },
  );

  const permissions =
    options.permission === undefined
      ? undefined
      : {
          query: vi.fn().mockResolvedValue({
            state: options.permission,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }),
        };

  vi.stubGlobal('navigator', {
    language: 'en-GB',
    userAgent: 'vitest',
    permissions,
    geolocation:
      options.supported === false ? undefined : { getCurrentPosition },
  });

  return getCurrentPosition;
}

/**
 * Finds one option inside a named selector. Several selectors share option
 * labels, `Off` and `Cuckoo` among them, so a page wide query would be
 * ambiguous.
 */
function optionRadio(title: string, label: string) {
  const group = screen.getByRole('radiogroup', { name: title });

  return within(group).getByRole('radio', { name: label });
}

function waitForText(text: string | RegExp) {
  return waitForCondition(
    `the text ${String(text)}`,
    () => screen.queryByText(text) !== null,
  );
}

function waitForTestId(testId: string) {
  return waitForCondition(
    `the element ${testId}`,
    () => screen.queryByTestId(testId) !== null,
  );
}

function clockTimeText(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(systemTime);
    vi.stubGlobal('AudioContext', AudioContextStub);
    vi.stubGlobal('fetch', createFetchStub());
    stubGeolocation();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('shows the clock, date, title, and disabled chime controls', () => {
    render(<App />);

    expect(screen.getByText('Chime Clock')).toBeInTheDocument();
    expect(screen.getByText('Sunday, 16 August 2026')).toBeInTheDocument();
    expect(screen.getByText('Chime Interval')).toBeInTheDocument();
    expect(screen.getByText('Seconds Sound')).toBeInTheDocument();
    expect(screen.queryByText('Chime Sound')).not.toBeInTheDocument();
  });

  it('reveals chime choices and previews twelve strikes at noon', () => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));

    expect(screen.getByText('Chime Sound')).toBeInTheDocument();
    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      12,
      'hour',
    );
  });

  it('stops the active chime before previewing another style', () => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
    fireEvent.click(optionRadio('Chime Sound', 'Modern'));

    expect(stopPlayback).toHaveBeenCalledOnce();
    expect(playChime).toHaveBeenLastCalledWith(
      expect.any(AudioContextStub),
      'modern',
      1,
      'hour',
    );
  });

  it.each([
    ['Bell', 'bell'],
    ['Cuckoo', 'cuckoo'],
    ['Modern', 'modern'],
    ['Westminster', 'westminster'],
  ] as const)('previews the %s chime style', (label, style) => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
    fireEvent.click(optionRadio('Chime Sound', label));

    expect(playChime).toHaveBeenLastCalledWith(
      expect.any(AudioContextStub),
      style,
      1,
      'hour',
    );
  });

  it.each([
    ['Quarterly', 'quarter'],
    ['Half-Hourly', 'half-hour'],
  ] as const)('previews %s once', (label, timing) => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', label));

    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      1,
      timing,
    );
  });

  it('stops playback when chimes are disabled', () => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
    fireEvent.click(optionRadio('Chime Interval', 'Off'));

    expect(stopPlayback).toHaveBeenCalledOnce();
  });

  it('marks the chosen interval and leaves the rest unchosen', () => {
    render(<App />);

    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));

    expect(optionRadio('Chime Interval', 'Hourly')).toBeChecked();
    expect(optionRadio('Chime Interval', 'Off')).not.toBeChecked();
  });

  it('plays the matching hour count at an hourly boundary', () => {
    vi.setSystemTime(new Date(2026, 7, 16, 10, 59, 59, 900));
    render(<App />);
    fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
    vi.mocked(playChime).mockClear();

    vi.setSystemTime(new Date(2026, 7, 16, 11, 0, 0, 100));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      11,
      'hour',
    );
  });

  // The preview a click makes and the strike the scheduler makes travel
  // different paths, so the scheduled boundary is proved on its own rather
  // than left to the preview to stand in for.
  it.each([
    [
      'Quarterly',
      new Date(2026, 7, 16, 10, 14, 59, 900),
      new Date(2026, 7, 16, 10, 15, 0, 100),
      'quarter',
    ],
    [
      'Half-Hourly',
      new Date(2026, 7, 16, 10, 29, 59, 900),
      new Date(2026, 7, 16, 10, 30, 0, 100),
      'half-hour',
    ],
  ] as const)(
    'rings %s exactly once at a scheduled boundary',
    (label, before, after, timing) => {
      vi.setSystemTime(before);
      render(<App />);
      fireEvent.click(optionRadio('Chime Interval', label));
      vi.mocked(playChime).mockClear();

      vi.setSystemTime(after);
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(playChime).toHaveBeenCalledOnce();
      expect(playChime).toHaveBeenCalledWith(
        expect.any(AudioContextStub),
        'classic',
        1,
        timing,
      );
    },
  );

  it.each(['Mechanical', 'Cinematic', 'Textured'])(
    'previews the %s seconds sound',
    (label) => {
      render(<App />);

      fireEvent.click(optionRadio('Seconds Sound', label));

      expect(playSecondsSound).toHaveBeenCalledWith(
        expect.any(AudioContextStub),
        label.toLowerCase(),
        0,
      );
    },
  );

  it('shows successful server time synchronization', async () => {
    render(<App />);

    await waitForText(/The time difference is/);

    expect(screen.getByText('2.pool.ntp.org')).toBeInTheDocument();
  });

  it('shows a synchronization error when both sources fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable.'));
    render(<App />);

    await waitForText('Failed to sync NTP.');
  });

  it('hides and restores the interface from the clock canvas', () => {
    render(<App />);
    const clockCanvas = screen.getByTitle('Click to toggle full-screen clock.');

    fireEvent.click(clockCanvas);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Chime Clock')).not.toBeInTheDocument();

    fireEvent.click(clockCanvas);
    expect(screen.getByText('Chime Clock')).toBeInTheDocument();
  });

  describe('clock mode', () => {
    it('opens in digital mode on a first visit', () => {
      render(<App />);

      expect(screen.getByTestId('digital-clock')).toBeInTheDocument();
      expect(screen.queryByTestId('three-clock')).not.toBeInTheDocument();
      expect(optionRadio('Clock', 'Digital')).toBeChecked();
    });

    it.each([
      ['Analog', 'analog'],
      ['Cuckoo', 'cuckoo'],
    ] as const)('saves %s and renders the lazy model', async (label, mode) => {
      render(<App />);

      fireEvent.click(optionRadio('Clock', label));
      await waitForTestId('three-clock');

      expect(window.localStorage.getItem(CLOCK_MODE_STORAGE_KEY)).toBe(mode);
      expect(screen.getByTestId('three-clock')).toHaveAttribute(
        'data-mode',
        mode,
      );
      expect(screen.queryByTestId('digital-clock')).not.toBeInTheDocument();
      expect(optionRadio('Clock', label)).toBeChecked();
    });

    it('restores the saved clock mode on the next visit', async () => {
      window.localStorage.setItem(CLOCK_MODE_STORAGE_KEY, 'analog');
      render(<App />);

      await waitForTestId('three-clock');

      expect(screen.getByTestId('three-clock')).toHaveAttribute(
        'data-mode',
        'analog',
      );
    });

    it('reads the time as text while a model is on screen', async () => {
      render(<App />);

      expect(screen.queryByText(/^The time is /)).not.toBeInTheDocument();

      fireEvent.click(optionRadio('Clock', 'Analog'));
      await waitForTestId('three-clock');

      expect(
        screen.getByText(`The time is ${clockTimeText(systemTime)}.`),
      ).toBeInTheDocument();
    });

    it('returns to the digital clock without losing the session', async () => {
      render(<App />);

      fireEvent.click(optionRadio('Clock', 'Analog'));
      await waitForTestId('three-clock');
      fireEvent.click(optionRadio('Clock', 'Digital'));

      expect(screen.getByTestId('digital-clock')).toBeInTheDocument();
      expect(screen.queryByTestId('three-clock')).not.toBeInTheDocument();
      expect(window.localStorage.getItem(CLOCK_MODE_STORAGE_KEY)).toBe(
        'digital',
      );
    });
  });

  describe('cuckoo animation', () => {
    async function renderCuckoo() {
      render(<App />);
      fireEvent.click(optionRadio('Clock', 'Cuckoo'));
      await waitForTestId('three-clock');
    }

    function chimeStrikes() {
      return screen.getByTestId('three-clock').getAttribute('data-strikes');
    }

    function chimeIdentifier() {
      return screen.getByTestId('three-clock').getAttribute('data-chime-id');
    }

    it('emits the hour strike count at an hourly boundary', async () => {
      vi.setSystemTime(new Date(2026, 7, 16, 10, 59, 59, 900));
      await renderCuckoo();
      fireEvent.click(optionRadio('Chime Interval', 'Hourly'));

      vi.setSystemTime(new Date(2026, 7, 16, 11, 0, 0, 100));
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(chimeStrikes()).toBe('11');
    });

    it.each([
      [
        'Quarterly',
        new Date(2026, 7, 16, 10, 14, 59, 900),
        new Date(2026, 7, 16, 10, 15, 0, 100),
      ],
      [
        'Half-Hourly',
        new Date(2026, 7, 16, 10, 29, 59, 900),
        new Date(2026, 7, 16, 10, 30, 0, 100),
      ],
    ] as const)(
      'emits one scheduled cycle for the %s chime',
      async (label, before, after) => {
        vi.setSystemTime(before);
        await renderCuckoo();

        fireEvent.click(optionRadio('Chime Interval', label));
        const previewIdentifier = Number(chimeIdentifier());

        vi.setSystemTime(after);
        act(() => {
          vi.advanceTimersByTime(200);
        });

        expect(chimeStrikes()).toBe('1');
        expect(Number(chimeIdentifier())).toBeGreaterThan(previewIdentifier);
      },
    );

    it('cancels the animation when chimes are disabled', async () => {
      await renderCuckoo();

      fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
      expect(chimeStrikes()).toBe('12');

      fireEvent.click(optionRadio('Chime Interval', 'Off'));

      expect(chimeStrikes()).toBe('none');
      expect(chimeIdentifier()).toBe('none');
    });

    it('issues a new identifier for every start', async () => {
      await renderCuckoo();

      fireEvent.click(optionRadio('Chime Interval', 'Hourly'));
      const first = Number(chimeIdentifier());

      fireEvent.click(optionRadio('Chime Sound', 'Modern'));
      const second = Number(chimeIdentifier());

      expect(Number.isFinite(first)).toBe(true);
      expect(second).toBeGreaterThan(first);
    });
  });

  describe('background and weather', () => {
    it('defaults to Dynamic and draws the computed season when granted', async () => {
      stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      render(<App />);

      await waitForTestId('seasonal-scene');

      expect(optionRadio('Background', 'Dynamic')).toBeChecked();
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'summer',
      );
      expect(screen.getByLabelText('Current conditions')).toBeInTheDocument();
      expect(
        screen.getByText('Seasonal background by Three UI.'),
      ).toBeInTheDocument();
    });

    it('defaults to None and offers the enable button when prompting', async () => {
      const getCurrentPosition = stubGeolocation({ permission: 'prompt' });
      render(<App />);

      await waitForText(ENABLE_LABEL);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(
        screen.queryByText('Seasonal background by Three UI.'),
      ).not.toBeInTheDocument();
    });

    it('defaults to None when the permissions API is missing', async () => {
      render(<App />);

      await waitForText(ENABLE_LABEL);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
    });

    it('requests the location when Dynamic is chosen', async () => {
      const getCurrentPosition = stubGeolocation({
        permission: 'prompt',
        position: { latitude: 1.3521, longitude: 103.8198 },
      });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(optionRadio('Background', 'Dynamic'));
      await waitForTestId('seasonal-scene');

      expect(getCurrentPosition).toHaveBeenCalledOnce();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'summer',
      );
    });

    it('returns to None and saves it when the location is refused', async () => {
      stubGeolocation({ permission: 'prompt', position: 'denied' });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(optionRadio('Background', 'Dynamic'));
      await waitForText(UNAVAILABLE_MESSAGE);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('none');
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
    });

    it('returns to None and keeps a saved Dynamic when the browser cannot locate', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'dynamic');
      stubGeolocation({ permission: 'granted', supported: false });
      render(<App />);

      await waitForText(UNAVAILABLE_MESSAGE);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
      // An environment without geolocation decided nothing on the visitor's
      // behalf, so the wish it cannot grant is not erased.
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
    });

    it('keeps a chosen Dynamic when the browser cannot locate', async () => {
      stubGeolocation({ permission: 'prompt', supported: false });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(optionRadio('Background', 'Dynamic'));
      await waitForText(UNAVAILABLE_MESSAGE);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
    });

    it('keeps a saved Dynamic when a forecast request fails', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'dynamic');
      stubFailingForecast(1);
      stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      render(<App />);

      await waitForText(UNAVAILABLE_MESSAGE);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
    });

    it('keeps a saved Dynamic when the device cannot fix a position', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'dynamic');
      stubGeolocation({ permission: 'granted', position: 'unavailable' });
      render(<App />);

      await waitForText(UNAVAILABLE_MESSAGE);

      expect(optionRadio('Background', 'None')).toBeChecked();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
    });

    it('retries the location and the forecast when Dynamic is chosen again', async () => {
      const attempts = stubFailingForecast(1);
      const getCurrentPosition = stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      render(<App />);
      await waitForText(UNAVAILABLE_MESSAGE);

      expect(getCurrentPosition).toHaveBeenCalledOnce();
      expect(attempts.forecast).toBe(1);

      fireEvent.click(optionRadio('Background', 'Dynamic'));
      await waitForTestId('seasonal-scene');

      expect(getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(attempts.forecast).toBe(2);
      expect(optionRadio('Background', 'Dynamic')).toBeChecked();
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'summer',
      );
    });

    it('saves a manual season without requesting the location', async () => {
      const getCurrentPosition = stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(optionRadio('Background', 'Winter'));
      await waitForTestId('seasonal-scene');

      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'winter',
      );
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'winter',
      );
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('restores the saved background and ignores the permission default', async () => {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, 'autumn');
      stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      render(<App />);

      await waitForTestId('seasonal-scene');

      expect(optionRadio('Background', 'Autumn')).toBeChecked();
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'autumn',
      );
    });

    it('keeps the interface visible when weather or background is clicked', async () => {
      stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(screen.getByLabelText('Local weather'));
      fireEvent.click(optionRadio('Background', 'Summer'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('Chime Clock')).toBeInTheDocument();
      expect(screen.getByText('Background')).toBeInTheDocument();
    });

    it('reports an unavailable forecast and still draws a manual season', async () => {
      stubFailingForecast(Number.POSITIVE_INFINITY);
      stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      render(<App />);
      await waitForText(UNAVAILABLE_MESSAGE);

      fireEvent.click(optionRadio('Background', 'Spring'));
      await waitForTestId('seasonal-scene');

      expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument();
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'spring',
      );
    });

    it('hides the weather panel with the rest of the interface', async () => {
      stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await waitForText(ENABLE_LABEL);

      fireEvent.click(screen.getByTitle('Click to toggle full-screen clock.'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.queryByLabelText('Local weather')).not.toBeInTheDocument();
    });
  });

  describe('unavailable storage', () => {
    function refuseStorage() {
      const getItem = vi
        .spyOn(Storage.prototype, 'getItem')
        .mockImplementation(() => {
          throw new Error('Storage is blocked.');
        });
      const setItem = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('Storage is blocked.');
        });

      return () => {
        getItem.mockRestore();
        setItem.mockRestore();
      };
    }

    it('paints the first visit when the saved preferences cannot be read', async () => {
      const restore = refuseStorage();

      try {
        stubGeolocation({ permission: 'prompt' });
        render(<App />);

        await waitForText(ENABLE_LABEL);

        expect(screen.getByTestId('digital-clock')).toBeInTheDocument();
        expect(optionRadio('Clock', 'Digital')).toBeChecked();
        expect(optionRadio('Background', 'None')).toBeChecked();
      } finally {
        restore();
      }
    });

    it('keeps a choice for the session when it cannot be written', async () => {
      const restore = refuseStorage();

      try {
        stubGeolocation({ permission: 'prompt' });
        render(<App />);
        await waitForText(ENABLE_LABEL);

        expect(() =>
          fireEvent.click(optionRadio('Background', 'Winter')),
        ).not.toThrow();
        await waitForTestId('seasonal-scene');

        expect(optionRadio('Background', 'Winter')).toBeChecked();
        expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
          'data-season',
          'winter',
        );

        expect(() =>
          fireEvent.click(optionRadio('Clock', 'Analog')),
        ).not.toThrow();
        await waitForTestId('three-clock');

        expect(optionRadio('Clock', 'Analog')).toBeChecked();
      } finally {
        restore();
      }
    });
  });
});
