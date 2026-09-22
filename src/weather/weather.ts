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
  time: string;
  data?: unknown;
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
  const data = getRecord(currentEntry.data);
  const primarySymbol = getPrimarySymbolCode(currentEntry);
  const condition = describeSymbolCode(primarySymbol);
  const airTemperature = requireFiniteNumber(
    details.air_temperature,
    'air_temperature',
  );
  const pressure = requireFiniteNumber(
    details.air_pressure_at_sea_level,
    'air_pressure_at_sea_level',
  );
  const cloudCover = requireFiniteNumber(
    details.cloud_area_fraction,
    'cloud_area_fraction',
  );
  const humidity = requireFiniteNumber(
    details.relative_humidity,
    'relative_humidity',
  );
  const windSpeed = requireFiniteNumber(details.wind_speed, 'wind_speed');
  const windDirection = requireFiniteNumber(
    details.wind_from_direction,
    'wind_from_direction',
  );

  return {
    forecastTime: compactIso(currentEntry.time),
    forecastTimeLabel: formatForecastTimeLabel(currentEntry.time),
    summary: [
      'Current Location 📍',
      `${formatFiniteNumber(airTemperature)}°C`,
      `${condition.condition} ${condition.emoji}`.trim(),
      `Wind ${formatFiniteNumber(windSpeed)} m/s from ${toCompassDirection(windDirection)}`,
    ],
    details: [
      {
        label: 'Pressure',
        value: `${formatFiniteNumber(pressure)} hPa`,
      },
      {
        label: 'Cloud cover',
        value: `${formatFiniteNumber(cloudCover)}%`,
      },
      {
        label: 'Humidity',
        value: `${formatFiniteNumber(humidity)}%`,
      },
    ],
    periods: [
      buildPeriod('Next Hour', data.next_1_hours),
      buildPeriod('Next 6 Hours', data.next_6_hours),
      buildPeriod('Next 12 Hours', data.next_12_hours),
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
  const properties = getRecord(forecast).properties;
  const timeseries = getRecord(properties).timeseries;

  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    throw new Error('A time series is required.');
  }

  return timeseries.map((entry) => {
    const record = getRecord(entry);
    const time = requireForecastTime(record.time);

    return {
      time,
      data: record.data,
    };
  });
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
  return getRecord(getRecord(getRecord(entry.data).instant).details);
}

function getPrimarySymbolCode(entry: WeatherEntry) {
  const data = getRecord(entry.data);

  return (
    getSymbolCode(data.next_1_hours) ??
    getSymbolCode(data.next_6_hours) ??
    getSymbolCode(data.next_12_hours) ??
    ''
  );
}

function buildPeriod(label: string, period?: unknown) {
  const symbolCode = getSymbolCode(period) ?? '';
  const condition = describeSymbolCode(symbolCode);
  const precipitation = getRecord(getRecord(period).details)
    .precipitation_amount;

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
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
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
    if (dayKey(time) <= anchorDay) {
      return;
    }

    const instant = getRecord(entry.data).instant;
    const temperature = requireFiniteNumber(
      getRecord(getRecord(instant).details).air_temperature,
      'air_temperature',
    );

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

function getRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function getSymbolCode(value: unknown) {
  const summary = getRecord(getRecord(value).summary);
  const symbolCode = summary.symbol_code;

  return typeof symbolCode === 'string' ? symbolCode : undefined;
}

function requireFiniteNumber(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Malformed weather data: ${fieldName} must be a finite number.`);
  }

  return value;
}

function requireForecastTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error('Malformed weather data: time must be a valid ISO timestamp.');
  }

  return value;
}

function toTime(value: string) {
  return new Date(value).getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
