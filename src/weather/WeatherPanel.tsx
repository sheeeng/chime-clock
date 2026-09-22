import type { MouseEvent, ReactNode } from 'react';
import type { LocalWeatherState } from './useLocalWeather';
import type { WeatherReading } from './weather';

type WeatherPanelProps = {
  state: LocalWeatherState;
};

const cardClassName =
  'rounded-2xl border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-700 dark:bg-zinc-800/60';

export function WeatherPanel({ state }: WeatherPanelProps) {
  return (
    <section
      aria-label="Local weather"
      onClick={(event: MouseEvent) => event.stopPropagation()}
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-3xl border border-zinc-200/60 bg-white p-6 shadow-xl shadow-zinc-200/50 transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none"
    >
      {renderPanelBody(state)}
    </section>
  );
}

function renderPanelBody(state: LocalWeatherState) {
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
      return <ForecastContent weather={state.weather} />;
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

function ForecastContent({ weather }: { weather: WeatherReading }) {
  return (
    <>
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Forecast for{' '}
        <time dateTime={weather.forecastTime}>
          {weather.forecastTimeLabel}
        </time>
        .
      </p>
      <p className="whitespace-nowrap text-center text-sm text-zinc-500 dark:text-zinc-400">
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
      <ul
        aria-label="Current conditions"
        className="grid w-full grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {weather.summary.map((item) => (
          <li
            key={item}
            className={`${cardClassName} text-center text-sm font-medium text-zinc-700 dark:text-zinc-200`}
          >
            {item}
          </li>
        ))}
      </ul>
      <dl
        aria-label="Weather details"
        className="grid w-full grid-cols-1 gap-3 lg:grid-cols-3"
      >
        {weather.details.map((detail) => (
          <div
            key={detail.label}
            className={`${cardClassName} flex flex-col items-center gap-1`}
          >
            <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {detail.label}
            </dt>
            <dd className="m-0 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
      <div
        aria-label="Forecast periods"
        className="grid w-full grid-cols-1 gap-3 lg:grid-cols-3"
      >
        {weather.periods.map((period) => (
          <div
            key={period.label}
            className={`${cardClassName} flex flex-col items-center gap-1`}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {period.label}
            </span>
            <span aria-hidden="true" className="text-2xl">
              {period.emoji}
            </span>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {period.condition}
            </span>
            {period.precipitation !== null && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Precipitation: {period.precipitation}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
