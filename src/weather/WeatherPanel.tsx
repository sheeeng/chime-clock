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
      className="flex flex-col items-center gap-[2px] text-center text-xs"
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
        {'. Obtained from '}
        <a
          href="https://api.met.no/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-[0.15em] text-[#0969da] dark:text-[#58a6ff]"
        >
          MET Norway
        </a>
        .
      </p>
      {showSeasonalAttribution && (
        <p>
          Seasonal background by{' '}
          <a
            href="https://threeui.com/browse"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-[0.15em] text-[#0969da] dark:text-[#58a6ff]"
          >
            Three UI
          </a>
          .
        </p>
      )}
    </>
  );
}
