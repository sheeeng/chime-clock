import type { MouseEvent } from 'react';
import type { LocalWeatherState } from './useLocalWeather';
import type { WeatherReading } from './weather';

type WeatherPanelProps = {
  hasSeasonalBackground?: boolean;
  showSeasonalAttribution: boolean;
  state: LocalWeatherState;
};

export function WeatherPanel({
  hasSeasonalBackground = false,
  showSeasonalAttribution,
  state,
}: WeatherPanelProps) {
  return (
    <section
      aria-label="Local weather"
      onClick={(event: MouseEvent) => event.stopPropagation()}
      className="flex flex-col items-center gap-1 text-center text-xs"
    >
      {renderPanelBody(state, hasSeasonalBackground, showSeasonalAttribution)}
    </section>
  );
}

function renderPanelBody(
  state: LocalWeatherState,
  hasSeasonalBackground: boolean,
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
          hasSeasonalBackground={hasSeasonalBackground}
          showSeasonalAttribution={showSeasonalAttribution}
          weather={state.weather}
        />
      );
  }
}

function PanelMessage({ message }: { message: string }) {
  return <p>{message}</p>;
}

function ForecastContent({
  hasSeasonalBackground,
  showSeasonalAttribution,
  weather,
}: {
  hasSeasonalBackground: boolean;
  showSeasonalAttribution: boolean;
  weather: WeatherReading;
}) {
  const condition =
    weather.current.condition.charAt(0).toUpperCase() +
    weather.current.condition.slice(1);

  return (
    <>
      <p
        className={`text-sm font-medium ${
          hasSeasonalBackground
            ? 'text-white'
            : 'text-zinc-500 dark:text-zinc-400'
        }`}
      >
        {weather.current.location} · {weather.current.temperature} · {condition}
        .
      </p>
      <p>
        Forecast for{' '}
        <time dateTime={weather.forecastTime}>{weather.forecastTimeLabel}</time>
        {' · '}
        <a
          href="https://api.met.no/"
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 transition-colors ${
            hasSeasonalBackground
              ? 'text-blue-300 hover:text-blue-200'
              : 'text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300'
          }`}
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
              className={`underline underline-offset-2 transition-colors ${
                hasSeasonalBackground
                  ? 'text-blue-300 hover:text-blue-200'
                  : 'text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300'
              }`}
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
