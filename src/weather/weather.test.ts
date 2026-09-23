import { describe, expect, it } from 'vitest';
import { getSeasonFromForecast, parseWeather } from './weather';

type TimeseriesEntry = {
  time: string;
  data: {
    instant: {
      details: Record<string, unknown>;
    };
    next_1_hours?: {
      summary: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
    next_6_hours?: {
      summary: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
    next_12_hours?: {
      summary: {
        symbol_code: string;
      };
      details?: {
        precipitation_amount?: number;
      };
    };
  };
};

function createForecast(
  temperatures: readonly number[],
  options: {
    includePeriods?: boolean;
    firstEntryDetails?: Record<string, unknown>;
    firstEntryTime?: string;
    dailyHour?: number;
  } = {},
) {
  const firstEntryTime = options.firstEntryTime ?? '2026-09-22T12:00:00Z';
  const dailyHour = options.dailyHour ?? 12;
  const firstEntryDetails = options.firstEntryDetails ?? {
    air_temperature: temperatures[0] ?? 0,
    air_pressure_at_sea_level: 1012,
    cloud_area_fraction: 50,
    relative_humidity: 50,
    wind_speed: 1,
    wind_from_direction: 0,
  };

  const timeseries: TimeseriesEntry[] = [
    {
      time: firstEntryTime,
      data: {
        instant: {
          details: firstEntryDetails,
        },
        ...(options.includePeriods
          ? {
              next_1_hours: {
                summary: {
                  symbol_code: 'fair_day',
                },
                details: {
                  precipitation_amount: 0,
                },
              },
              next_6_hours: {
                summary: {
                  symbol_code: 'rain',
                },
                details: {
                  precipitation_amount: 2.4,
                },
              },
              next_12_hours: {
                summary: {
                  symbol_code: 'partlycloudy_night',
                },
              },
            }
          : {}),
      },
    },
  ];

  for (let day = 1; day <= 7; day += 1) {
    const date = new Date(
      Date.UTC(2026, 8, 22 + day, dailyHour, 0, 0),
    ).toISOString();

    timeseries.push({
      time: date,
      data: {
        instant: {
          details: {
            air_temperature: temperatures[day] ?? temperatures[0] ?? 0,
          },
        },
      },
    });
  }

  return {
    properties: {
      timeseries,
    },
  };
}

describe('parseWeather', () => {
  it('formats the current weather and forecast periods', () => {
    const forecast = createForecast(
      [14.4, 11, 12, 13, 14, 15, 16, 17],
      {
        includePeriods: true,
        firstEntryDetails: {
          air_temperature: 14.4,
          air_pressure_at_sea_level: 1026.5,
          cloud_area_fraction: 38.8,
          relative_humidity: 47.5,
          wind_speed: 3.2,
          wind_from_direction: 202.5,
        },
        firstEntryTime: '2026-09-22T12:00:00Z',
      },
    );

    expect(
      parseWeather(forecast, new Date('2026-09-22T12:20:00Z')),
    ).toEqual({
      forecastTime: '2026-09-22T12:00:00Z',
      forecastTimeLabel: 'September 22, 2026, at 12:00 UTC',
      current: {
        location: 'Current Location 📍',
        temperature: '14.4°C',
        condition: 'few clouds',
      },
    });
  });

  it('rejects malformed numeric data', () => {
    const forecast = createForecast([14.4, 11, 12, 13, 14, 15, 16, 17], {
      firstEntryDetails: {
        air_pressure_at_sea_level: 1026.5,
        cloud_area_fraction: 38.8,
        relative_humidity: 47.5,
        wind_speed: 3.2,
        wind_from_direction: 202.5,
      },
    });

    expect(() =>
      parseWeather(forecast, new Date('2026-09-22T12:20:00Z')),
    ).toThrow('air_temperature');
  });

  it('uses the runtime locale when formatting the forecast time label', () => {
    const forecast = createForecast([14.4, 11, 12, 13, 14, 15, 16, 17], {
      firstEntryTime: '2026-09-22T12:00:00Z',
    });
    const originalDateTimeFormat = Intl.DateTimeFormat;
    const locales: unknown[] = [];

    function MockDateTimeFormat(
      this: unknown,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      locales.push(locale);

      return new originalDateTimeFormat(locale, options);
    }

    try {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        value: MockDateTimeFormat,
      });

      expect(parseWeather(forecast, new Date('2026-09-22T12:20:00Z')))
        .toMatchObject({
          forecastTimeLabel: 'September 22, 2026, at 12:00 UTC',
        });
      expect(locales).toEqual([undefined, undefined]);
    } finally {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        value: originalDateTimeFormat,
      });
    }
  });

  it('rejects a missing time series', () => {
    expect(() => parseWeather({})).toThrow('time series');
  });
});

describe('getSeasonFromForecast', () => {
  const now = new Date('2026-09-22T12:20:00Z');
  const march = new Date('2026-03-15T12:00:00Z');

  it('returns summer when all daily means exceed 10 degrees', () => {
    const summerForecast = createForecast([
      12, 11, 12, 13, 14, 15, 16, 17,
    ]);

    expect(getSeasonFromForecast(summerForecast, 59.9, now)).toBe('summer');
  });

  it('returns winter when all daily means are below zero', () => {
    const winterForecast = createForecast([
      -2, -3, -4, -5, -6, -7, -8, -9,
    ]);

    expect(getSeasonFromForecast(winterForecast, 59.9, now)).toBe('winter');
  });

  it('returns spring in the northern hemisphere during transitional months', () => {
    const transitionForecast = createForecast([5, 4, 3, 2, 1, 0, 1, 2]);

    expect(getSeasonFromForecast(transitionForecast, 59.9, march)).toBe(
      'spring',
    );
  });

  it('returns autumn in the southern hemisphere during transitional months', () => {
    const transitionForecast = createForecast([5, 4, 3, 2, 1, 0, 1, 2]);

    expect(getSeasonFromForecast(transitionForecast, -33.9, march)).toBe(
      'autumn',
    );
  });
});
