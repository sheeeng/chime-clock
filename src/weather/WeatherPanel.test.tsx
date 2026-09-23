import { fireEvent, render, screen, within } from '@testing-library/react';
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
    summary: [
      'Current Location 📍',
      '14.4°C',
      'Few Clouds 🌤️',
      'Wind 3.2 m/s from SSW',
    ],
    details: [
      { label: 'Pressure', value: '1026.5 hPa' },
      { label: 'Cloud cover', value: '38.8%' },
      { label: 'Humidity', value: '47.5%' },
    ],
    periods: [
      {
        label: 'Next Hour',
        condition: 'Few Clouds',
        emoji: '🌤️',
        precipitation: '0 mm',
      },
      {
        label: 'Next 6 Hours',
        condition: 'Rain',
        emoji: '🌧️',
        precipitation: '2.4 mm',
      },
      {
        label: 'Next 12 Hours',
        condition: 'Partly Cloudy',
        emoji: '⛅',
        precipitation: null,
      },
    ],
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
      <WeatherPanel state={{ status: 'checking-permission', permission: null }} />,
    );

    expect(
      screen.getByText('Checking local weather access.'),
    ).toBeInTheDocument();
  });

  it('requests location when the enable button is pressed', () => {
    const requestLocation = vi.fn();

    render(
      <WeatherPanel
        state={{ status: 'prompt', permission: 'prompt', requestLocation }}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Enable Local Weather' }),
    );

    expect(requestLocation).toHaveBeenCalledOnce();
  });

  it('shows the unavailable message on error', () => {
    render(
      <WeatherPanel
        state={{
          status: 'error',
          permission: 'denied',
          message: 'Local weather is unavailable.',
          recoverable: false,
        }}
      />,
    );

    expect(
      screen.getByText('Local weather is unavailable.'),
    ).toBeInTheDocument();
  });

  it('shows the loading message while the forecast loads', () => {
    render(
      <WeatherPanel state={{ status: 'loading', permission: 'granted' }} />,
    );

    expect(
      screen.getByText('Loading local weather.'),
    ).toBeInTheDocument();
  });

  it('renders the forecast time and attribution', () => {
    render(<WeatherPanel state={createSuccessState()} />);

    expect(
      getByCompleteText('Forecast for September 22, 2026, at 12:00 UTC.'),
    ).toBeInTheDocument();
    expect(
      getByCompleteText('Obtained from MET Norway.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'MET Norway' }),
    ).toHaveAttribute('href', 'https://api.met.no/');
  });

  it('renders four summary cards', () => {
    render(<WeatherPanel state={createSuccessState()} />);

    const summaryList = screen.getByRole('list', {
      name: 'Current conditions',
    });

    expect(within(summaryList).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('14.4°C')).toBeInTheDocument();
  });

  it('renders three detail cards', () => {
    const { container } = render(
      <WeatherPanel state={createSuccessState()} />,
    );
    const detailsList = container.querySelector(
      'dl[aria-label="Weather details"]',
    );

    expect(detailsList).not.toBeNull();
    expect(within(detailsList as HTMLElement).getAllByRole('term')).toHaveLength(
      3,
    );
    expect(screen.getByText('1026.5 hPa')).toBeInTheDocument();
  });

  it('renders the three forecast periods', () => {
    render(<WeatherPanel state={createSuccessState()} />);

    expect(screen.getByText('Next Hour')).toBeInTheDocument();
    expect(screen.getByText('Next 6 Hours')).toBeInTheDocument();
    expect(screen.getByText('Next 12 Hours')).toBeInTheDocument();
  });

  it('omits the precipitation row when precipitation is null', () => {
    render(<WeatherPanel state={createSuccessState()} />);

    const periodsPanel = screen.getByLabelText('Forecast periods');
    const nextTwelveHours = within(periodsPanel)
      .getByText('Next 12 Hours')
      .closest('div');

    expect(
      within(nextTwelveHours as HTMLElement).queryByText(/Precipitation/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Precipitation: 0 mm')).toBeInTheDocument();
    expect(screen.getByText('Precipitation: 2.4 mm')).toBeInTheDocument();
  });

  it('stops click propagation so the panel does not toggle the clock', () => {
    const onOuterClick = vi.fn();

    render(
      <div onClick={onOuterClick}>
        <WeatherPanel state={createSuccessState()} />
      </div>,
    );

    fireEvent.click(
      getByCompleteText('Forecast for September 22, 2026, at 12:00 UTC.'),
    );

    expect(onOuterClick).not.toHaveBeenCalled();
  });
});
