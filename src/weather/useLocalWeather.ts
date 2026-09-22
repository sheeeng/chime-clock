import { useEffect, useState } from 'react';
import {
  getSeasonFromForecast,
  parseWeather,
  type SeasonId,
  type WeatherReading,
} from './weather';

type UseLocalWeatherOptions = {
  enabled: boolean;
};

export type LocalWeatherState =
  | { status: 'checking-permission'; permission: null }
  | { status: 'prompt'; permission: 'prompt'; requestLocation: () => void }
  | { status: 'loading'; permission: 'granted' }
  | {
      status: 'success';
      permission: 'granted';
      latitude: number;
      weather: WeatherReading;
      season: SeasonId;
    }
  | {
      status: 'error';
      permission: PermissionState | 'unsupported';
      message: string;
      requestLocation?: () => void;
    };

const UNAVAILABLE_MESSAGE = 'Local weather is unavailable.';

export function useLocalWeather(
  options: UseLocalWeatherOptions,
): LocalWeatherState {
  const { enabled } = options;
  const [state, setState] = useState<LocalWeatherState>({
    status: 'checking-permission',
    permission: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'checking-permission', permission: null });
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | undefined;
    let handlePermissionChange: (() => void) | undefined;

    const loadForecast = async (latitude: number, longitude: number) => {
      try {
        const endpoint = new URL(
          'https://api.met.no/weatherapi/locationforecast/2.0/compact',
        );
        endpoint.searchParams.set('lat', latitude.toFixed(4));
        endpoint.searchParams.set('lon', longitude.toFixed(4));

        const response = await fetch(endpoint.toString(), {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(
            `MET Norway responded with status ${response.status}.`,
          );
        }

        const forecast = await response.json();

        if (cancelled) {
          return;
        }

        setState({
          status: 'success',
          permission: 'granted',
          latitude,
          weather: parseWeather(forecast),
          season: getSeasonFromForecast(forecast, latitude),
        });
      } catch {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          permission: 'granted',
          message: UNAVAILABLE_MESSAGE,
        });
      }
    };

    const requestLocation = () => {
      setState({ status: 'loading', permission: 'granted' });

      if (!navigator.geolocation) {
        setState({
          status: 'error',
          permission: 'unsupported',
          message: UNAVAILABLE_MESSAGE,
        });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) {
            return;
          }

          void loadForecast(
            position.coords.latitude,
            position.coords.longitude,
          );
        },
        () => {
          if (cancelled) {
            return;
          }

          setState({
            status: 'error',
            permission: 'denied',
            message: UNAVAILABLE_MESSAGE,
          });
        },
      );
    };

    const applyPermissionState = (permissionState: PermissionState) => {
      if (cancelled) {
        return;
      }

      if (permissionState === 'granted') {
        requestLocation();
        return;
      }

      if (permissionState === 'denied') {
        setState({
          status: 'error',
          permission: 'denied',
          message: UNAVAILABLE_MESSAGE,
        });
        return;
      }

      setState({ status: 'prompt', permission: 'prompt', requestLocation });
    };

    setState({ status: 'checking-permission', permission: null });

    if (!navigator.permissions?.query) {
      setState({ status: 'prompt', permission: 'prompt', requestLocation });

      return () => {
        cancelled = true;
      };
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) {
          return;
        }

        permissionStatus = status;
        applyPermissionState(status.state);
        handlePermissionChange = () => applyPermissionState(status.state);
        status.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ status: 'prompt', permission: 'prompt', requestLocation });
      });

    return () => {
      cancelled = true;

      if (permissionStatus && handlePermissionChange) {
        permissionStatus.removeEventListener('change', handlePermissionChange);
      }
    };
  }, [enabled]);

  return state;
}
