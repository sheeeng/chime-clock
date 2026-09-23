import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { playChime } from './audio/chimes';
import { playSecondsSound } from './audio/seconds';
import { CLOCK_MODE_STORAGE_KEY } from './clock/clockMode';
import { BACKGROUND_STORAGE_KEY } from './seasonal/background';
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
// the lazy boundary intact and reports the props the integration owes it, so
// the digital bundle assertion stays meaningful.
const threeClock = vi.hoisted(() => ({ imported: vi.fn() }));

vi.mock('./clock/ThreeClock', () => {
  threeClock.imported();

  return {
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
  };
});

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

function createFetchStub() {
  return vi.fn(async (input: unknown) => {
    if (String(input).includes(FORECAST_HOST)) {
      return { ok: true, json: async () => createForecast() } as Response;
    }

    return ntpResponse();
  });
}

type GeolocationOptions = {
  permission?: PermissionState;
  position?: { latitude: number; longitude: number } | 'denied';
};

/**
 * Replaces the geolocation surfaces the weather hook reads. Omitting
 * `permission` leaves the permissions API absent, which the hook treats the
 * same way it treats a browser that cannot answer the query.
 */
function stubGeolocation(options: GeolocationOptions = {}) {
  const getCurrentPosition = vi.fn(
    (success: PositionCallback, failure?: PositionErrorCallback) => {
      if (options.position === undefined || options.position === 'denied') {
        failure?.({ code: 1, message: 'Denied.' } as GeolocationPositionError);
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
    geolocation: { getCurrentPosition },
  });

  return getCurrentPosition;
}

/**
 * Drains the microtask queue inside `act` so lazily imported modules, the
 * permission query, and the forecast request all settle. Fake timers are
 * active for every case, so `findBy` queries cannot serve the same purpose.
 */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/**
 * Finds one option inside a named selector. Several selectors share option
 * labels, `Off` and `Cuckoo` among them, so a page wide query would be
 * ambiguous.
 */
function optionButton(title: string, label: string) {
  const group = screen.getByText(title).closest('div')?.parentElement;

  if (!group) throw new Error(`No selector is titled ${title}.`);

  return within(group).getByRole('button', { name: label });
}

/**
 * `OptionSelector` marks the chosen option by darkening its label rather than
 * by setting an ARIA state, so the class is the only selection signal the
 * component exposes.
 */
function isSelected(title: string, label: string) {
  return optionButton(title, label).classList.contains('text-zinc-900');
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

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(optionButton('Chime Sound', 'Modern'));

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

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(optionButton('Chime Sound', label));

    expect(playChime).toHaveBeenLastCalledWith(
      expect.any(AudioContextStub),
      style,
      1,
      'hour',
    );
  });

  it.each([
    ['Quarterly', 15, 'quarter'],
    ['Half-Hourly', 30, 'half-hour'],
  ] as const)('previews %s once', (label, _interval, timing) => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      1,
      timing,
    );
  });

  it('stops playback when chimes are disabled', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(optionButton('Chime Interval', 'Off'));

    expect(stopPlayback).toHaveBeenCalledOnce();
  });

  it('plays the matching hour count at an hourly boundary', () => {
    vi.setSystemTime(new Date(2026, 7, 16, 10, 59, 59, 900));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
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

  it.each(['Mechanical', 'Cinematic', 'Textured'])(
    'previews the %s seconds sound',
    (label) => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(playSecondsSound).toHaveBeenCalledWith(
        expect.any(AudioContextStub),
        label.toLowerCase(),
        0,
      );
    },
  );

  it('shows successful server time synchronization', async () => {
    render(<App />);

    await settle();

    expect(screen.getByText(/The time difference is/)).toBeInTheDocument();
    expect(screen.getByText('2.pool.ntp.org')).toBeInTheDocument();
  });

  it('shows a synchronization error when both sources fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable.'));
    render(<App />);

    await settle();

    expect(screen.getByText('Failed to sync NTP.')).toBeInTheDocument();
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
      expect(isSelected('Clock', 'Digital')).toBe(true);
    });

    it('never requests the Three.js clock chunk in digital mode', async () => {
      threeClock.imported.mockClear();
      render(<App />);

      await settle();

      expect(threeClock.imported).not.toHaveBeenCalled();
    });

    it.each([
      ['Analog', 'analog'],
      ['Cuckoo', 'cuckoo'],
    ] as const)('saves %s and renders the lazy model', async (label, mode) => {
      render(<App />);

      fireEvent.click(optionButton('Clock', label));
      await settle();

      expect(window.localStorage.getItem(CLOCK_MODE_STORAGE_KEY)).toBe(mode);
      expect(screen.getByTestId('three-clock')).toHaveAttribute(
        'data-mode',
        mode,
      );
      expect(screen.queryByTestId('digital-clock')).not.toBeInTheDocument();
    });

    it('restores the saved clock mode on the next visit', async () => {
      window.localStorage.setItem(CLOCK_MODE_STORAGE_KEY, 'analog');
      render(<App />);

      await settle();

      expect(screen.getByTestId('three-clock')).toHaveAttribute(
        'data-mode',
        'analog',
      );
    });

    it('reads the time as text while a model is on screen', async () => {
      render(<App />);

      expect(
        screen.queryByTestId('clock-time-fallback'),
      ).not.toBeInTheDocument();

      fireEvent.click(optionButton('Clock', 'Analog'));
      await settle();

      expect(screen.getByTestId('clock-time-fallback').textContent).toContain(
        clockTimeText(systemTime),
      );
    });

    it('returns to the digital clock without losing the session', async () => {
      render(<App />);

      fireEvent.click(optionButton('Clock', 'Analog'));
      await settle();
      fireEvent.click(optionButton('Clock', 'Digital'));

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
      fireEvent.click(optionButton('Clock', 'Cuckoo'));
      await settle();
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
      fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));

      vi.setSystemTime(new Date(2026, 7, 16, 11, 0, 0, 100));
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(chimeStrikes()).toBe('11');
    });

    it.each(['Quarterly', 'Half-Hourly'])(
      'emits one cycle for the %s chime',
      async (label) => {
        await renderCuckoo();

        fireEvent.click(screen.getByRole('button', { name: label }));

        expect(chimeStrikes()).toBe('1');
      },
    );

    it('cancels the animation when chimes are disabled', async () => {
      await renderCuckoo();

      fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
      expect(chimeStrikes()).toBe('12');

      fireEvent.click(optionButton('Chime Interval', 'Off'));

      expect(chimeStrikes()).toBe('none');
      expect(chimeIdentifier()).toBe('none');
    });

    it('issues a new identifier for every start', async () => {
      await renderCuckoo();

      fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
      const first = Number(chimeIdentifier());

      fireEvent.click(optionButton('Chime Sound', 'Modern'));
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

      await settle();

      expect(isSelected('Background', 'Dynamic')).toBe(true);
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

      await settle();

      expect(isSelected('Background', 'None')).toBe(true);
      expect(
        screen.getByRole('button', { name: 'Enable Local Weather' }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(
        screen.queryByText('Seasonal background by Three UI.'),
      ).not.toBeInTheDocument();
    });

    it('defaults to None when the permissions API is missing', async () => {
      render(<App />);

      await settle();

      expect(isSelected('Background', 'None')).toBe(true);
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
    });

    it('requests the location when Dynamic is chosen', async () => {
      const getCurrentPosition = stubGeolocation({
        permission: 'prompt',
        position: { latitude: 1.3521, longitude: 103.8198 },
      });
      render(<App />);
      await settle();

      fireEvent.click(optionButton('Background', 'Dynamic'));
      await settle();

      expect(getCurrentPosition).toHaveBeenCalledOnce();
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe(
        'dynamic',
      );
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'summer',
      );
    });

    it('returns to None when the location request is denied', async () => {
      stubGeolocation({ permission: 'prompt', position: 'denied' });
      render(<App />);
      await settle();

      fireEvent.click(optionButton('Background', 'Dynamic'));
      await settle();

      expect(isSelected('Background', 'None')).toBe(true);
      expect(window.localStorage.getItem(BACKGROUND_STORAGE_KEY)).toBe('none');
      expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
      expect(
        screen.getByText('Local weather is unavailable.'),
      ).toBeInTheDocument();
    });

    it('saves a manual season without requesting the location', async () => {
      const getCurrentPosition = stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await settle();

      fireEvent.click(optionButton('Background', 'Winter'));
      await settle();

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

      await settle();

      expect(isSelected('Background', 'Autumn')).toBe(true);
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'autumn',
      );
    });

    it('keeps the interface visible when weather or background is clicked', async () => {
      stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await settle();

      fireEvent.click(screen.getByLabelText('Local weather'));
      fireEvent.click(optionButton('Background', 'Summer'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('Chime Clock')).toBeInTheDocument();
      expect(screen.getByText('Background')).toBeInTheDocument();
    });

    it('reports an unavailable forecast and still draws a manual season', async () => {
      stubGeolocation({
        permission: 'granted',
        position: { latitude: 59.9139, longitude: 10.7522 },
      });
      vi.mocked(fetch).mockImplementation(async (input: unknown) => {
        if (String(input).includes(FORECAST_HOST)) {
          return { ok: false, status: 503, json: async () => ({}) } as Response;
        }

        return ntpResponse();
      });
      render(<App />);
      await settle();

      fireEvent.click(optionButton('Background', 'Spring'));
      await settle();

      expect(
        screen.getByText('Local weather is unavailable.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('seasonal-scene')).toHaveAttribute(
        'data-season',
        'spring',
      );
    });

    it('hides the weather panel with the rest of the interface', async () => {
      stubGeolocation({ permission: 'prompt' });
      render(<App />);
      await settle();

      fireEvent.click(screen.getByTitle('Click to toggle full-screen clock.'));
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.queryByLabelText('Local weather')).not.toBeInTheDocument();
    });
  });
});
