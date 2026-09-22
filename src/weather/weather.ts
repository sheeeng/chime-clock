export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export type WeatherReading = {
  forecastTime: string;
  forecastTimeLabel: string;
  summary: readonly string[];
  details: readonly { label: string; value: string }[];
  periods: readonly {
    label: string;
    condition: string;
    emoji: string;
    precipitation: string | null;
  }[];
};

type WeatherSymbol = {
  summary?: {
    symbol_code?: string | null;
  };
  details?: {
    precipitation_amount?: number | null;
  };
};

type WeatherEntry = {
  time?: string;
  data?: {
    instant?: {
      details?: Record<string, unknown>;
    };
    next_1_hours?: WeatherSymbol;
    next_6_hours?: WeatherSymbol;
    next_12_hours?: WeatherSymbol;
  };
};

type WeatherForecast = {
  properties?: {
    timeseries?: WeatherEntry[];
  };
};

const conditionLabels = {
  clearsky: ['Clear Sky', '☀️'],
  cloudy: ['Cloudy', '☁️'],
  fair: ['Few Clouds', '🌤️'],
  fog: ['Fog', '🌫️'],
  partlycloudy: ['Partly Cloudy', '⛅'],
} as const;

const compassDirections = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  useGrouping: false,
});

export function parseWeather(
  forecast: unknown,
  now = new Date(),
): WeatherReading {
  const timeseries = getTimeseries(forecast);
  const currentEntry = selectNearestEntry(timeseries, now);
  const details = getInstantDetails(currentEntry);
  const primarySymbol = getPrimarySymbolCode(currentEntry);
  const condition = describeSymbolCode(primarySymbol);

  return {
    forecastTime: compactIso(currentEntry.time),
    forecastTimeLabel: formatForecastTimeLabel(currentEntry.time),
    summary: [
      'Current Location 📍',
      `${formatFiniteNumber(getNumber(details.air_temperature))}°C`,
      `${condition.condition} ${condition.emoji}`.trim(),
      `Wind ${formatFiniteNumber(getNumber(details.wind_speed))} m/s from ${toCompassDirection(getNumber(details.wind_from_direction))}`,
    ],
    details: [
      {
        label: 'Pressure',
        value: `${formatFiniteNumber(getNumber(details.air_pressure_at_sea_level))} hPa`,
      },
      {
        label: 'Cloud cover',
        value: `${formatFiniteNumber(getNumber(details.cloud_area_fraction))}%`,
      },
      {
        label: 'Humidity',
        value: `${formatFiniteNumber(getNumber(details.relative_humidity))}%`,
      },
    ],
    periods: [
      buildPeriod('Next Hour', currentEntry.data?.next_1_hours),
      buildPeriod('Next 6 Hours', currentEntry.data?.next_6_hours),
      buildPeriod('Next 12 Hours', currentEntry.data?.next_12_hours),
    ],
  };
}

export function getSeasonFromForecast(
  forecast: unknown,
  latitude: number,
  now = new Date(),
): SeasonId {
  const timeseries = getTimeseries(forecast);
  const currentEntry = selectNearestEntry(timeseries, now);
  const means = getFutureDailyMeans(timeseries, currentEntry.time);

  if (means.length < 7) {
    throw new Error('Seven daily mean temperatures are required.');
  }

  if (means.every((value) => value > 10)) {
    return 'summer';
  }

  if (means.every((value) => value < 0)) {
    return 'winter';
  }

  const month = now.getUTCMonth();
  const northernSpring = month >= 1 && month <= 6;
  const transitionalSeason = northernSpring ? 'spring' : 'autumn';

  if (latitude < 0) {
    return transitionalSeason === 'spring' ? 'autumn' : 'spring';
  }

  return transitionalSeason;
}

function getTimeseries(forecast: unknown): WeatherEntry[] {
  const properties = getRecord(forecast)?.properties;
  const timeseries = properties && getRecord(properties)?.timeseries;

  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    throw new Error('A time series is required.');
  }

  return timeseries as WeatherEntry[];
}

function selectNearestEntry(timeseries: readonly WeatherEntry[], now: Date) {
  const nowTime = now.getTime();

  return timeseries.reduce((bestEntry, candidate) => {
    if (!bestEntry) {
      return candidate;
    }

    const bestTime = toTime(bestEntry.time);
    const candidateTime = toTime(candidate.time);

    return Math.abs(candidateTime - nowTime) < Math.abs(bestTime - nowTime)
      ? candidate
      : bestEntry;
  });
}

function getInstantDetails(entry: WeatherEntry) {
  return getRecord(entry.data?.instant?.details);
}

function getPrimarySymbolCode(entry: WeatherEntry) {
  return (
    entry.data?.next_1_hours?.summary?.symbol_code ??
    entry.data?.next_6_hours?.summary?.symbol_code ??
    entry.data?.next_12_hours?.summary?.symbol_code ??
    ''
  );
}

function buildPeriod(label: string, period?: WeatherSymbol) {
  const symbolCode = period?.summary?.symbol_code ?? '';
  const condition = describeSymbolCode(symbolCode);
  const precipitation = period?.details?.precipitation_amount;

  return {
    label,
    condition: condition.condition,
    emoji: condition.emoji,
    precipitation:
      typeof precipitation === 'number' && Number.isFinite(precipitation)
        ? `${formatFiniteNumber(precipitation)} mm`
        : null,
  };
}

function describeSymbolCode(symbolCode: string) {
  const normalizedCode = normalizeSymbolCode(symbolCode);

  if (normalizedCode.includes('rain')) {
    return { condition: 'Rain', emoji: '🌧️' };
  }

  if (normalizedCode.includes('sleet')) {
    return { condition: 'Sleet', emoji: '🌨️' };
  }

  if (normalizedCode.includes('snow')) {
    return { condition: 'Snow', emoji: '❄️' };
  }

  const condition =
    conditionLabels[normalizedCode as keyof typeof conditionLabels];

  if (condition) {
    return { condition: condition[0], emoji: condition[1] };
  }

  return {
    condition: formatFallbackCondition(normalizedCode),
    emoji: '',
  };
}

function normalizeSymbolCode(symbolCode: string) {
  return symbolCode.toLowerCase().replace(/_(day|night|polartwilight)$/, '');
}

function formatFallbackCondition(symbolCode: string) {
  return symbolCode
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function formatForecastTimeLabel(value: string) {
  const date = new Date(value);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);

  return `${dateLabel}, at ${timeLabel}`;
}

function compactIso(value: string) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatFiniteNumber(value: number) {
  return numberFormatter.format(value);
}

function toCompassDirection(degrees: number) {
  const normalizedDegrees = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalizedDegrees / 22.5) % compassDirections.length;

  return compassDirections[index];
}

function getFutureDailyMeans(
  timeseries: readonly WeatherEntry[],
  currentTime: string,
) {
  const anchorDay = dayKey(currentTime);
  const groups = new Map<string, number[]>();

  timeseries.forEach((entry) => {
    const time = entry.time;
    if (!time || dayKey(time) <= anchorDay) {
      return;
    }

    const temperature = getNumber(entry.data?.instant?.details?.air_temperature);
    if (!Number.isFinite(temperature)) {
      return;
    }

    const key = dayKey(time);
    const values = groups.get(key);

    if (values) {
      values.push(temperature);
      return;
    }

    groups.set(key, [temperature]);
  });

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 7)
    .map(([, values]) => average(values));
}

function average(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toTime(value: string | undefined) {
  return value ? new Date(value).getTime() : Number.NaN;
}
