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
import { drainPendingWork, waitForCondition } from '../test/waiting';
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

  describe('refused permission', () => {
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
      expect(result.current.reason).toBe('refused');
      expect('requestLocation' in result.current).toBe(false);
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
      expect(failed.reason).toBe('refused');
      expect('requestLocation' in failed).toBe(false);
    });
  });

  describe('unsupported environment', () => {
    it('reports a browser without geolocation as unsupported, not refused', async () => {
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
      // The visitor refused nothing, so nothing downstream may treat this as
      // a decision the visitor made.
      expect(result.current.reason).toBe('unsupported');
      expect(result.current.message).toBe('Local weather is unavailable.');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('offers no retry, because there is nothing left to ask', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: undefined,
      });

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect('requestLocation' in result.current).toBe(false);
    });
  });

  describe('transient failures', () => {
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
      expect(result.current.reason).toBe('transient');

      if (result.current.reason !== 'transient') {
        throw new Error('Expected a transient failure.');
      }

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

      expect(result.current.reason).toBe('transient');

      if (result.current.reason !== 'transient') {
        throw new Error('Expected a transient failure.');
      }

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

      const retry =
        result.current.reason === 'transient'
          ? result.current.requestLocation
          : undefined;

      if (!retry) {
        throw new Error('Expected a retry callback.');
      }

      act(() => retry());

      await waitFor(() => expect(result.current.status).toBe('success'));

      expect(getCurrentPosition).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('callbacks that outlive their effect', () => {
    function promptPermissions() {
      return {
        query: vi.fn().mockResolvedValue(createPermissionStatus('prompt')),
      };
    }

    function renderToggleable() {
      return renderHook(
        ({ enabled }: { enabled: boolean }) => useLocalWeather({ enabled }),
        { initialProps: { enabled: true } },
      );
    }

    async function capturePromptRequest(result: {
      current: ReturnType<typeof useLocalWeather>;
    }) {
      await waitFor(() => expect(result.current.status).toBe('prompt'));

      if (result.current.status !== 'prompt') {
        throw new Error('Expected a prompt state.');
      }

      return result.current.requestLocation;
    }

    it('does not strand the feed in loading after it is disabled', async () => {
      const getCurrentPosition = positionAt(OSLO);

      stubNavigator({
        permissions: promptPermissions(),
        geolocation: { getCurrentPosition },
      });
      resolveForecast();

      const { result, rerender } = renderToggleable();
      const captured = await capturePromptRequest(result);

      rerender({ enabled: false });

      await waitFor(() =>
        expect(result.current.status).toBe('checking-permission'),
      );

      act(() => captured());
      await drainPendingWork();

      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(result.current.status).toBe('checking-permission');
    });

    it('does not ask for a location after the hook unmounts', async () => {
      const getCurrentPosition = positionAt(OSLO);

      stubNavigator({
        permissions: promptPermissions(),
        geolocation: { getCurrentPosition },
      });
      resolveForecast();

      const { result, unmount } = renderToggleable();
      const captured = await capturePromptRequest(result);

      unmount();

      act(() => captured());
      await drainPendingWork();

      expect(getCurrentPosition).not.toHaveBeenCalled();
      expect(result.current.status).toBe('prompt');
    });

    it('drives the current request after the feed is enabled again', async () => {
      const getCurrentPosition = positionAt(OSLO);

      stubNavigator({
        permissions: promptPermissions(),
        geolocation: { getCurrentPosition },
      });
      resolveForecast();

      const { result, rerender } = renderToggleable();
      const captured = await capturePromptRequest(result);

      rerender({ enabled: false });
      await waitFor(() =>
        expect(result.current.status).toBe('checking-permission'),
      );

      rerender({ enabled: true });
      await waitFor(() => expect(result.current.status).toBe('prompt'));

      act(() => captured());

      await waitFor(() => expect(result.current.status).toBe('success'));

      expect(getCurrentPosition).toHaveBeenCalledOnce();
    });

    it('withdraws a retry handed out before the feed was disabled', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionError(2) },
      });

      const { result, rerender } = renderToggleable();

      await waitFor(() => expect(result.current.status).toBe('error'));

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      if (result.current.reason !== 'transient') {
        throw new Error('Expected a transient failure.');
      }

      const retry = result.current.requestLocation;

      rerender({ enabled: false });
      await waitFor(() =>
        expect(result.current.status).toBe('checking-permission'),
      );

      act(() => retry());
      await drainPendingWork();

      expect(result.current.status).toBe('checking-permission');
    });
  });

  describe('bounded requests', () => {
    type ForecastRequest = {
      signal: AbortSignal;
      timeoutId: ReturnType<typeof setTimeout>;
    };

    let forecastRequests: ForecastRequest[] = [];
    let setTimeoutSpy: MockInstance;
    let clearTimeoutSpy: MockInstance;

    /**
     * Records the timer each forecast request carries, then answers with the
     * supplied response.
     *
     * The hook schedules the forecast timeout and calls `fetch` in the same
     * synchronous step, so the timer scheduled most recently when a request
     * starts is that request's own timer. Identifying it this way ties the
     * timer to the request that owns it. Searching the scheduled timers for
     * a ten second delay would not: the geolocation bound is also ten
     * seconds, and a second forecast makes "the first ten second timer"
     * ambiguous on its own terms.
     */
    function recordForecast(
      respond: (signal: AbortSignal) => Promise<Response>,
    ) {
      vi.mocked(fetch).mockImplementation(
        (_input: unknown, init?: RequestInit) => {
          const signal = init?.signal;

          if (!signal) {
            throw new Error('The forecast request carried no abort signal.');
          }

          const scheduled = setTimeoutSpy.mock.results.at(-1);

          if (!scheduled) {
            throw new Error(
              'The forecast request started without scheduling a timer.',
            );
          }

          forecastRequests.push({ signal, timeoutId: scheduled.value });

          return respond(signal);
        },
      );
    }

    /**
     * A forecast request that never answers on its own, so the only thing
     * that can end it is the hook's own timeout or its cleanup.
     */
    function stubUnansweredForecast() {
      recordForecast(
        (signal) =>
          new Promise<Response>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted.', 'AbortError'));
            });
          }),
      );
    }

    function stubRecordedForecast() {
      recordForecast(
        async () =>
          ({ ok: true, json: async () => createForecast() }) as Response,
      );
    }

    /** Advances the fake clock inside `act`, without waiting for anything. */
    async function advanceFakeClock(milliseconds: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
      });
    }

    beforeEach(() => {
      forecastRequests = [];
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

      await waitForCondition(
        'the forecast request to start',
        () => forecastRequests.length === 1,
      );

      expect(result.current.status).toBe('loading');
      expect(forecastRequests[0].signal.aborted).toBe(false);

      await advanceFakeClock(FORECAST_TIMEOUT_MS);
      await waitForCondition(
        'the abandoned forecast to be reported',
        () => result.current.status === 'error',
      );

      expect(forecastRequests[0].signal.aborted).toBe(true);

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.reason).toBe('transient');
    });

    it('clears the forecast timer once the forecast answers', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubRecordedForecast();

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitForCondition(
        'the forecast to arrive',
        () => result.current.status === 'success',
      );

      expect(clearTimeoutSpy).toHaveBeenCalledWith(
        forecastRequests[0].timeoutId,
      );
    });

    it('abandons a forecast in flight when the permission changes', async () => {
      const status = createPermissionStatus('granted');

      stubNavigator({
        permissions: { query: vi.fn().mockResolvedValue(status) },
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubUnansweredForecast();

      const { result } = renderHook(() => useLocalWeather({ enabled: true }));

      await waitForCondition(
        'the forecast request to start',
        () => forecastRequests.length === 1,
      );

      expect(forecastRequests[0].signal.aborted).toBe(false);

      const [, handlePermissionChange] = status.addEventListener.mock
        .calls[0] as [string, () => void];

      status.state = 'denied';
      act(() => handlePermissionChange());

      await waitForCondition(
        'the refusal to be reported',
        () => result.current.status === 'error',
      );

      expect(forecastRequests[0].signal.aborted).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(
        forecastRequests[0].timeoutId,
      );

      // The abandoned request settles as a rejection, and it must not write
      // its answer over the one the permission change produced.
      await drainPendingWork();

      if (result.current.status !== 'error') {
        throw new Error('Expected an error state.');
      }

      expect(result.current.reason).toBe('refused');
    });

    it('aborts the forecast and clears its timer when unmounted', async () => {
      stubNavigator({
        permissions: grantedPermissions(),
        geolocation: { getCurrentPosition: positionAt(OSLO) },
      });
      stubUnansweredForecast();

      const { result, unmount } = renderHook(() =>
        useLocalWeather({ enabled: true }),
      );

      await waitForCondition(
        'the forecast request to start',
        () => forecastRequests.length === 1,
      );

      expect(forecastRequests[0].signal.aborted).toBe(false);

      unmount();

      expect(forecastRequests[0].signal.aborted).toBe(true);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(
        forecastRequests[0].timeoutId,
      );

      // Nothing is left to fire, so the abandoned request cannot report and
      // the last state the hook published stands.
      await advanceFakeClock(FORECAST_TIMEOUT_MS);
      await drainPendingWork();

      expect(result.current.status).toBe('loading');
      expect(fetch).toHaveBeenCalledOnce();
    });
  });
});
