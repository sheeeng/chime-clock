import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalWeather } from './useLocalWeather';

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

describe('useLocalWeather', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the forecast for the coordinates when granted', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 59.9139, longitude: 10.7522 },
      } as GeolocationPosition);
    });

    stubNavigator({
      permissions: {
        query: vi.fn().mockResolvedValue(createPermissionStatus('granted')),
      },
      geolocation: { getCurrentPosition },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => createForecast(),
    } as Response);

    const { result } = renderHook(() => useLocalWeather({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.met.no/weatherapi/locationforecast/2.0/compact' +
        '?lat=59.9139&lon=10.7522',
      { cache: 'no-store' },
    );

    if (result.current.status !== 'success') {
      throw new Error('Expected a success state.');
    }

    expect(result.current.latitude).toBe(59.9139);
    expect(result.current.season).toBe('summer');
    expect(result.current.weather.summary).toContain('Current Location 📍');
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

  it('returns an error without fetching when denied', async () => {
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
    expect(result.current.message).toBe('Local weather is unavailable.');
    expect(fetch).not.toHaveBeenCalled();
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

  it('returns the unavailable message when the forecast fails', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 59.9139, longitude: 10.7522 },
      } as GeolocationPosition);
    });

    stubNavigator({
      permissions: {
        query: vi.fn().mockResolvedValue(createPermissionStatus('granted')),
      },
      geolocation: { getCurrentPosition },
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
  });
});
