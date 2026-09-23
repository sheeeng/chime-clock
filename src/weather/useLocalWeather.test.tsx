import { act, renderHook, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { useLocalWeather } from './useLocalWeather';

const FORECAST_URL =
  'https://api.met.no/weatherapi/locationforecast/2.0/compact';

const GEOLOCATION_TIMEOUT_MS = 10_000;

const GEOLOCATION_MAXIMUM_AGE_MS = 600_000;

const FORECAST_TIMEOUT_MS = 10_000;

const OSLO = { latitude: 59.9139, longitude: 10.7522 };

function futureDayIso(daysAhead: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString();
}

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

function createPermissionStatus(state: PermissionState) {
  return {
    state,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function stubNavigator(overrides: {
  permissions?: { query: ReturnType<typeof vi.fn> };
  geolocation?: { getCurrentPosition: ReturnType<typeof vi.fn> };
}) {
  vi.stubGlobal('navigator', {
    permissions: overrides.permissions,
    geolocation: overrides.geolocation,
  });
}

function grantedPermissions() {
  return {
    query: vi.fn().mockResolvedValue(createPermissionStatus('granted')),
  };
}

function positionAt(coords: { latitude: number; longitude: number }) {
  return vi.fn((success: PositionCallback) => {
    success({ coords } as GeolocationPosition);
  });
}

function positionError(code: number) {
  return vi.fn(
    (_success: PositionCallback, failure?: PositionErrorCallback) => {
      failure?.({ code, message: 'No position.' } as GeolocationPositionError);
    },
  );
}

function resolveForecast() {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => createForecast(),
  } as Response);
}

describe('useLocalWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the forecast for the coordinates when granted', async () => {
    const getCurrentPosition = positionAt(OSLO);

    stubNavigator({
      permissions: grantedPermissions(),
      geolocation: { getCurrentPosition },
    });
    resolveForecast();

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(getCurrentPosition).toHaveBeenCalledOnce();

    if (result.current.status !== 'success') {
      throw new Error('Expected a success state.');
    }

    expect(result.current.season).toBe('summer');
    expect(result.current.weather.summary).toContain('Current Location 📍');
  });

  it('sends two decimal coordinates and no referrer', async () => {
    stubNavigator({
      permissions: grantedPermissions(),
      geolocation: { getCurrentPosition: positionAt(OSLO) },
    });
    resolveForecast();

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(fetch).toHaveBeenCalledWith(`${FORECAST_URL}?lat=59.91&lon=10.75`, {
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps no coordinate more precise than it sends', async () => {
    stubNavigator({
      permissions: grantedPermissions(),
      geolocation: { getCurrentPosition: positionAt(OSLO) },
    });
    resolveForecast();

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('success'));

    if (result.current.status !== 'success') {
      throw new Error('Expected a success state.');
    }

    expect(result.current.latitude).toBe(59.91);
  });

  it('bounds the geolocation request in time and accepts a recent fix', async () => {
    const getCurrentPosition = positionAt(OSLO);

    stubNavigator({
      permissions: grantedPermissions(),
      geolocation: { getCurrentPosition },
    });
    resolveForecast();

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      {
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAXIMUM_AGE_MS,
      },
    );
  });

  it('does not call geolocation until requestLocation is invoked', async () => {
    const getCurrentPosition = vi.fn();

    stubNavigator({
      permissions: {
        query: vi.fn().mockResolvedValue(createPermissionStatus('prompt')),
      },
      geolocation: { getCurrentPosition },
    });

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('prompt'));

    expect(getCurrentPosition).not.toHaveBeenCalled();

    if (result.current.status !== 'prompt') {
      throw new Error('Expected a prompt state.');
    }

    result.current.requestLocation();

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledOnce());
  });

  it('does not query location or fetch when disabled', async () => {
    const query = vi.fn();
    const getCurrentPosition = vi.fn();

    stubNavigator({
      permissions: { query },
      geolocation: { getCurrentPosition },
    });

    const { result } = renderHook(() => useLocalWeather({ enabled: false }));

    expect(result.current).toEqual({
      status: 'checking-permission',
      permission: null,
    });
    expect(query).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('durable failures', () => {
    it('reports a refused permission as final and offers no retry', async () => {
      stubNavigator({
        permissions: {
          query: vi.fn().mockResolvedValue(createPermissionStatus('denied')),
        },
        geolocation: { getCurrentPosition: vi.fn() },
      });

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.permission).toBe('denied');
      expect(result.current.recoverable).toBe(false);
      expect(result.current.requestLocation).toBeUndefined();
      expect(result.current.message).toBe('Local weather is unavailable.');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('reports a refused prompt as final and offers no retry', async () => {
      stubNavigator({
        permissions: {
          query: vi.fn().mockResolvedValue(createPermissionStatus('prompt')),
        },
        geolocation: { getCurrentPosition: positionError(1) },
      });

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('prompt'));

      const prompted = result.current;

      if (prompted.status !== 'prompt') {
        throw new Error('Expected a prompt state.');
      }

      act(() => prompted.requestLocation());

      await waitFor(() => expect(result.current.status).toBe('error'));

      const failed = result.current;

      if (failed.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(failed.permission).toBe('denied');
      expect(failed.recoverable).toBe(false);
      expect(failed.requestLocation).toBeUndefined();
    });

    it('reports a browser without geolocation as final', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: undefined,
      });

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.permission).toBe('unsupported');
      expect(result.current.recoverable).toBe(false);
      expect(result.current.requestLocation).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('recoverable failures', () => {
    it('offers a retry when the forecast request fails', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.message).toBe('Local weather is unavailable.');
      expect(result.current.recoverable).toBe(true);
      expect(result.current.requestLocation).toBeTypeOf('function');
    });

    it('offers a retry when the device cannot fix a position', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionError(2) },
      });

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.recoverable).toBe(true);
      expect(result.current.requestLocation).toBeTypeOf('function');
    });

    it('asks the browser and MET Norway again on retry', async () => {
      const getCurrentPosition = positionAt(OSLO);

      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition },
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response);
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => createForecast(),
      } as Response);

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      const retry = result.current.requestLocation;

      if (!retry) {
        throw new Error('Expected a retry callback.');
      }

      act(() => retry());

      await waitFor(() => expect(result.current.status).toBe('success'));

      expect(getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('bounded requests', () => {
    let pendingSignals: AbortSignal[] = [];
    let setTimeoutSpy: MockInstance;
    let clearTimeoutSpy: MockInstance;

    /**
     * A forecast request that never answers on its own, so the only thing
     * that can end it is the hook's own timeout or its cleanup.
     */
    function stubUnansweredForecast() {
      vi.mocked(fetch).mockImplementation(
        (_input: unknown, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;

            if (!signal) return;

            pendingSignals.push(signal);
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted.', 'AbortError'));
            });
          }),
      );
    }

    /** The identifier of the timer the hook set for the forecast request. */
    function forecastTimeoutId() {
      const index = setTimeoutSpy.mock.calls.findIndex(
        (call) => call[1] === FORECAST_TIMEOUT_MS,
      );

      if (index === -1) {
        throw new Error('No forecast timeout was scheduled.');
      }

      return setTimeoutSpy.mock.results[index].value;
    }

    async function settleFakeTimers(milliseconds = 0) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);

        for (let turn = 0; turn < 10; turn += 1) {
          await Promise.resolve();
        }
      });
    }

    beforeEach(() => {
      pendingSignals = [];
      vi.useFakeTimers();
      setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
      vi.useRealTimers();
    });

    it('abandons a forecast that has not answered in ten seconds', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubUnansweredForecast();

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await settleFakeTimers();

      expect(result.current.status).toBe('loading');
      expect(pendingSignals).toHaveLength(1);
      expect(pendingSignals[0].aborted).toBe(false);

      await settleFakeTimers(FORECAST_TIMEOUT_MS);

      expect(pendingSignals[0].aborted).toBe(true);
      expect(result.current.status).toBe('error');

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.recoverable).toBe(true);
    });

    it('clears the forecast timer once the forecast answers', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      resolveForecast();

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await settleFakeTimers();

      expect(result.current.status).toBe('success');
      expect(clearTimeoutSpy).toHaveBeenCalledWith(forecastTimeoutId());
    });

    it('abandons a forecast in flight when the permission changes', async () => {
      const status = createPermissionStatus('granted');

      stubNavigator({
        permissions: { query: vi.fn().mockResolvedValue(status) },
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubUnansweredForecast();

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await settleFakeTimers();

      const timeoutId = forecastTimeoutId();

      expect(pendingSignals).toHaveLength(1);
      expect(pendingSignals[0].aborted).toBe(false);

      const [, handlePermissionChange] = status.addEventListener.mock
        .calls[0] as [string, () => void];

      status.state = 'denied';
      act(() => handlePermissionChange());
      await settleFakeTimers();

      expect(pendingSignals[0].aborted).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId);
      expect(result.current.status).toBe('error');

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      // The abandoned request settles as a rejection, and it must not write
      // its answer over the one the permission change produced.
      expect(result.current.recoverable).toBe(false);
    });

    it('aborts the forecast and clears its timer when unmounted', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubUnansweredForecast();

      const { unmount } = renderHook(() => useLocalWeather({ enabled: true }));

      await settleFakeTimers();

      const timeoutId = forecastTimeoutId();

      expect(pendingSignals[0].aborted).toBe(false);

      unmount();

      expect(pendingSignals[0].aborted).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutId);

      // Nothing is left to fire, so the abandoned request cannot report.
      await settleFakeTimers(FORECAST_TIMEOUT_MS);
    });
  });
});
