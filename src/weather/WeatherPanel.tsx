import type { MouseEvent } from 'react';
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
      className="flex w-full max-w-2xl flex-col items-center gap-1 text-center text-xs text-slate-400 dark:text-slate-500"
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
}: {
  message: string;
}) {
  return <p>{message}</p>;
}

function ForecastContent({
  showSeasonalAttribution,
  weather,
}: {
  showSeasonalAttribution: boolean;
  weather: WeatherReading;
}) {
  const condition =
    weather.current.condition.charAt(0).toUpperCase() +
    weather.current.condition.slice(1);

  return (
    <>
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {weather.current.location} · {weather.current.temperature} · {condition}.
      </p>
      <p>
        Forecast for{' '}
        <time dateTime={weather.forecastTime}>
          {weather.forecastTimeLabel}
        </time>
        {' · '}
        <a
          href="https://api.met.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 no-underline transition-colors hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          MET Norway
        </a>
        {showSeasonalAttribution && (
          <>
            {' · '}
            Seasonal background by{' '}
            <a
              href="https://threeui.com/browse"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 no-underline transition-colors hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Three UI
            </a>
          </>
        )}
        .
      </p>
    </>
  );
}
