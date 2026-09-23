import type { MouseEvent, ReactNode } from 'react';
import type { LocalWeatherState } from './useLocalWeather';
import type { WeatherReading } from './weather';

type WeatherPanelProps = {
  showSeasonalAttribution: boolean;
  state: LocalWeatherState;
};

export function WeatherPanel({
  showSeasonalAttribution,
  state,
}: WeatherPanelProps) {
  return (
    <section
      aria-label="Local weather"
      onClick={(event: MouseEvent) => event.stopPropagation()}
      className="mt-6 flex w-full flex-col items-center gap-1 border-t border-zinc-200 pt-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
    >
      {renderPanelBody(state, showSeasonalAttribution)}
    </section>
  );
}

function renderPanelBody(
  state: LocalWeatherState,
  showSeasonalAttribution: boolean,
) {
  switch (state.status) {
    case 'checking-permission':
      return <PanelMessage message="Checking local weather access." />;
    case 'prompt':
      return (
        <PanelMessage message="Enable local weather to see current conditions.">
          <button
            type="button"
            onClick={() => state.requestLocation()}
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Enable Local Weather
          </button>
        </PanelMessage>
      );
    case 'loading':
      return <PanelMessage message="Loading local weather." />;
    case 'error':
      return <PanelMessage message={state.message} />;
    case 'success':
      return (
        <ForecastContent
          showSeasonalAttribution={showSeasonalAttribution}
          weather={state.weather}
        />
      );
  }
}

function PanelMessage({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
      <p>{message}</p>
      {children}
    </div>
  );
}

function ForecastContent({
  showSeasonalAttribution,
  weather,
}: {
  showSeasonalAttribution: boolean;
  weather: WeatherReading;
}) {
  return (
    <>
      <p>
        Forecast for{' '}
        <time dateTime={weather.forecastTime}>
          {weather.forecastTimeLabel}
        </time>
        .
      </p>
      <p>
        Obtained from{' '}
        <a
          href="https://api.met.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 no-underline transition-colors hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          MET Norway
        </a>
        .
      </p>
      <p>
        Currently, {weather.current.temperature}, {weather.current.condition}{' '}
        at {weather.current.location}.
      </p>
      {showSeasonalAttribution && <p>Seasonal background by Three UI.</p>}
    </>
  );
}
