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
      /**
       * Whether asking again could answer differently. A refused permission
       * and a browser without geolocation answer the same way every time. A
       * position the device could not fix and a forecast that did not arrive
       * may well answer differently a minute later.
       */
      recoverable: boolean;
      /** Present exactly when `recoverable` is true. */
      requestLocation?: () => void;
    };

const UNAVAILABLE_MESSAGE = 'Local weather is unavailable.';

const FORECAST_ENDPOINT =
  'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * Two decimal places place a request within roughly a kilometre, which is
 * finer than the MET Norway grid and far finer than a season needs. The hook
 * rounds at the geolocation callback, so a more precise reading is never held
 * in state and never leaves the page.
 */
const COORDINATE_DECIMALS = 2;

const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * A ten minute old fix still names the right season and the right forecast
 * grid square, and costs the device nothing to reuse.
 */
const GEOLOCATION_MAXIMUM_AGE_MS = 10 * 60 * 1000;

const FORECAST_TIMEOUT_MS = 10_000;

const PERMISSION_DENIED = 1;

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

    // Every attempt takes the next serial. An answer that arrives under an
    // earlier serial belongs to work the hook has already replaced, so it is
    // dropped rather than written over the current state.
    let serial = 0;
    let lastPermission: PermissionState | 'unsupported' = 'prompt';
    let activeRequest: {
      controller: AbortController;
      timeoutId: ReturnType<typeof setTimeout>;
    } | null = null;
    let permissionStatus: PermissionStatus | undefined;
    let handlePermissionChange: (() => void) | undefined;

    function isCurrent(requestSerial: number) {
      return !cancelled && requestSerial === serial;
    }

    function cancelActiveRequest() {
      if (!activeRequest) return;

      clearTimeout(activeRequest.timeoutId);
      activeRequest.controller.abort();
      activeRequest = null;
    }

    function failDurably(permission: PermissionState | 'unsupported') {
      setState({
        status: 'error',
        permission,
        message: UNAVAILABLE_MESSAGE,
        recoverable: false,
      });
    }

    function failRecoverably(permission: PermissionState | 'unsupported') {
      setState({
        status: 'error',
        permission,
        message: UNAVAILABLE_MESSAGE,
        recoverable: true,
        requestLocation,
      });
    }

    async function loadForecast(
      latitude: number,
      longitude: number,
      requestSerial: number,
    ) {
      const endpoint = new URL(FORECAST_ENDPOINT);
      endpoint.searchParams.set('lat', latitude.toFixed(COORDINATE_DECIMALS));
      endpoint.searchParams.set('lon', longitude.toFixed(COORDINATE_DECIMALS));

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        FORECAST_TIMEOUT_MS,
      );

      activeRequest = { controller, timeoutId };

      try {
        const response = await fetch(endpoint.toString(), {
          cache: 'no-store',
          // The address carries a location. Nothing about this page travels
          // alongside it.
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `MET Norway responded with status ${response.status}.`,
          );
        }

        const forecast = await response.json();

        if (!isCurrent(requestSerial)) {
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
        if (!isCurrent(requestSerial)) {
          return;
        }

        // A forecast that timed out, was refused, or arrived malformed may
        // arrive intact on the next attempt, so the visitor keeps a way back.
        failRecoverably('granted');
      } finally {
        clearTimeout(timeoutId);

        if (activeRequest?.controller === controller) {
          activeRequest = null;
        }
      }
    }

    function requestLocation() {
      serial += 1;
      const requestSerial = serial;
      cancelActiveRequest();

      if (!navigator.geolocation) {
        failDurably('unsupported');
        return;
      }

      setState({ status: 'loading', permission: 'granted' });

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isCurrent(requestSerial)) return;

          void loadForecast(
            roundCoordinate(position.coords.latitude),
            roundCoordinate(position.coords.longitude),
            requestSerial,
          );
        },
        (error) => {
          if (!isCurrent(requestSerial)) return;

          if (error.code === PERMISSION_DENIED) {
            failDurably('denied');
            return;
          }

          // The device could not fix a position in time. Asking again is
          // worth doing, so the caller is handed the way to do it.
          failRecoverably(lastPermission);
        },
        {
          timeout: GEOLOCATION_TIMEOUT_MS,
          maximumAge: GEOLOCATION_MAXIMUM_AGE_MS,
        },
      );
    }

    function applyPermissionState(permissionState: PermissionState) {
      if (cancelled) return;

      lastPermission = permissionState;

      if (permissionState === 'granted') {
        requestLocation();
        return;
      }

      // The answer has changed under any work already running, so that work
      // is abandoned rather than allowed to report later.
      serial += 1;
      cancelActiveRequest();

      if (permissionState === 'denied') {
        failDurably('denied');
        return;
      }

      setState({ status: 'prompt', permission: 'prompt', requestLocation });
    }

    function cleanUp() {
      cancelled = true;
      cancelActiveRequest();

      if (permissionStatus && handlePermissionChange) {
        permissionStatus.removeEventListener('change', handlePermissionChange);
      }
    }

    setState({ status: 'checking-permission', permission: null });

    if (!navigator.permissions?.query) {
      setState({ status: 'prompt', permission: 'prompt', requestLocation });

      return cleanUp;
    }

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;

        permissionStatus = status;
        applyPermissionState(status.state);
        handlePermissionChange = () => applyPermissionState(status.state);
        status.addEventListener('change', handlePermissionChange);
      })
      .catch(() => {
        if (cancelled) return;

        setState({ status: 'prompt', permission: 'prompt', requestLocation });
      });

    return cleanUp;
  }, [enabled]);

  return state;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}
