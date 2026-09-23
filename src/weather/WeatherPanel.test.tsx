import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WeatherPanel } from './WeatherPanel';
import type { LocalWeatherState } from './useLocalWeather';
import type { WeatherReading } from './weather';

function getByCompleteText(text: string) {
  return screen.getByText((_content, element) => {
    if (!element || element.textContent !== text) {
      return false;
    }

    return Array.from(element.children).every(
      (child) => child.textContent !== text,
    );
  });
}

function createWeather(
  overrides: Partial<WeatherReading> = {},
): WeatherReading {
  return {
    forecastTime: '2026-09-22T12:00:00Z',
    forecastTimeLabel: 'September 22, 2026, at 12:00 UTC',
    current: {
      location: 'Current Location 📍',
      temperature: '14.4°C',
      condition: 'few clouds',
    },
    ...overrides,
  };
}

function createSuccessState(
  overrides: Partial<WeatherReading> = {},
): LocalWeatherState {
  return {
    status: 'success',
    permission: 'granted',
    latitude: 59.9139,
    weather: createWeather(overrides),
    season: 'autumn',
  };
}

describe('WeatherPanel', () => {
  it('shows the permission check message while checking permission', () => {
    render(
      <WeatherPanel
        showSeasonalAttribution={false}
        state={{ status: 'checking-permission', permission: null }}
      />,
    );

    expect(
      screen.getByText('Checking local weather access.'),
    ).toBeInTheDocument();
  });

  it('shows the unavailable message on error', () => {
    render(
      <WeatherPanel
        showSeasonalAttribution={false}
        state={{
          status: 'error',
          permission: 'denied',
          message: 'Local weather is unavailable.',
          reason: 'transient',
          requestLocation: vi.fn(),
        }}
      />,
    );

    expect(
      screen.getByText('Local weather is unavailable.'),
    ).toBeInTheDocument();
  });

  it('shows the loading message while the forecast loads', () => {
    render(
      <WeatherPanel
        showSeasonalAttribution={false}
        state={{ status: 'loading', permission: 'granted' }}
      />,
    );

    expect(
      screen.getByText('Loading local weather.'),
    ).toBeInTheDocument();
  });

  it('renders compact current conditions and attribution', () => {
    render(
      <WeatherPanel
        showSeasonalAttribution
        state={createSuccessState()}
      />,
    );

    expect(
      getByCompleteText('Current Location 📍 · 14.4°C · Few clouds.'),
    ).toBeInTheDocument();
    expect(
      getByCompleteText(
        'Forecast for September 22, 2026, at 12:00 UTC · MET Norway · Seasonal background by Three UI.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'MET Norway' }),
    ).toHaveAttribute('href', 'https://api.met.no/');
    expect(
      screen.queryByRole('list', { name: 'Current conditions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Forecast periods'),
    ).not.toBeInTheDocument();
  });

  it('omits seasonal attribution without an active scene', () => {
    render(
      <WeatherPanel
        showSeasonalAttribution={false}
        state={createSuccessState()}
      />,
    );

    expect(
      screen.queryByText(/Seasonal background by Three UI/),
    ).not.toBeInTheDocument();
  });

  it('stops click propagation so the panel does not toggle the clock', () => {
    const onOuterClick = vi.fn();

    render(
      <div onClick={onOuterClick}>
        <WeatherPanel
          showSeasonalAttribution={false}
          state={createSuccessState()}
        />
      </div>,
    );

    fireEvent.click(
      getByCompleteText('Current Location 📍 · 14.4°C · Few clouds.'),
    );

    expect(onOuterClick).not.toHaveBeenCalled();
  });
});
