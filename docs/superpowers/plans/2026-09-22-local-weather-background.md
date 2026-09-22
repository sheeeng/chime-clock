# Local Weather and Seasonal Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser location weather, forecast period cards, persistent optional Three UI seasonal backgrounds, and Digital, Analog, and Cuckoo clock modes to Chime Clock.

**Architecture:** Pure weather functions parse MET Norway responses and classify seasons. A geolocation hook owns permission and network effects, a presentational panel renders weather states, and a lazy seasonal background component mounts the exact self hosted Three UI scene. A second lazy Three.js renderer loads either a wall clock or cuckoo clock model and adds procedural synchronized hands. `App.tsx` coordinates saved weather, background, clock mode, and chime animation state without moving existing audio behavior out of its component.

**Tech Stack:** React 19, TypeScript 7, Tailwind CSS 4, Vite 8, Vitest 5, Testing Library, browser Geolocation API, browser Permissions API, MET Norway Locationforecast 2.0 Compact API, Three.js for clock models, and Three.js r149 through the exact Three UI registered source.

**Spec:** `docs/superpowers/specs/2026-09-22-local-weather-background-design.md`

## Global Constraints

- Use `https://api.met.no/weatherapi/locationforecast/2.0/compact` with browser coordinates.
- Label the weather location as `Current Location 📍`.
- Store only the background preference in local storage. Do not store coordinates or forecast responses.
- Support `none`, `dynamic`, `spring`, `summer`, `autumn`, and `winter`.
- Use `none` when location permission is denied or a dynamic forecast request fails.
- Use seven daily forecast means and the MET Norway 10°C and 0°C thresholds for dynamic season selection.
- Reverse transitional spring and autumn month ranges for negative latitudes.
- Lazy load Three.js, scene code, and scene styles only when a seasonal background is active.
- Preserve the exact registered Three UI source files and verify their SHA-256 hashes.
- Keep the clock, NTP synchronization, chimes, and interface hiding behavior operational when weather or scene loading fails.
- Attribute weather data to MET Norway and active seasonal backgrounds to Three UI.
- Support clock modes in this order: `analog`, `cuckoo`, and `digital`.
- Use `digital` as the first visit clock mode and save the selection in local storage.
- Use the supplied Simple Wall Clock and Cuckoo Clock archives as self hosted assets.
- Add procedural synchronized hands to both 3D clocks.
- Animate one cuckoo bird cycle per chime strike and stop the sequence when playback stops.
- Credit FFeller and Jerovdl under the Creative Commons Attribution license.
- Do not add a weather cache, reverse geocoding service, state management
  library, or runtime dependency other than `three`.

---

## File Structure

- `src/weather/weather.ts`: Pure forecast parsing, formatting, and season classification.
- `src/weather/weather.test.ts`: Unit tests for all weather and season behavior.
- `src/weather/useLocalWeather.ts`: Permission, geolocation, and MET Norway request state.
- `src/weather/useLocalWeather.test.tsx`: Hook tests with browser API stubs.
- `src/weather/WeatherPanel.tsx`: Weather loading, permission, error, and success presentation.
- `src/weather/WeatherPanel.test.tsx`: Presentational and interaction tests.
- `src/seasonal/background.ts`: Background option types, persistence, and season to scene mapping.
- `src/seasonal/background.test.ts`: Preference and mapping tests.
- `src/seasonal/SeasonalBackground.tsx`: Lazy scene mounting and readability wash.
- `src/seasonal/SeasonalBackground.test.tsx`: Scene loading and inactive state tests.
- `src/clock/clockMode.ts`: Clock mode types and local storage persistence.
- `src/clock/clockMode.test.ts`: Clock mode preference tests.
- `src/clock/ThreeClock.tsx`: Three.js model renderer, procedural dial and hands, and cuckoo animation.
- `src/clock/ThreeClock.test.ts`: Pure hand rotation and cuckoo timing tests.
- `src/clock/ClockDisplay.tsx`: Lazy Digital, Analog, and Cuckoo display selection.
- `src/clock/ClockDisplay.test.tsx`: Mode selection and lazy loading tests.
- `public/models/analog/`: Optimized Simple Wall Clock FBX and textures.
- `public/models/cuckoo/`: Optimized Cuckoo Clock FBX and textures.
- `public/models/ATTRIBUTION.md`: Model authors, source URLs, and CC BY terms.
- `src/shaders/sylva-living-world/SylvaLivingWorldScene.tsx`: Exact registered Three UI component.
- `src/shaders/sylva-living-world/sources/inner-green-3d.html`: Exact canonical scene source.
- `src/shaders/sylva-living-world/sources/inner-green-assets/three.min.js`: Exact Three.js r149 runtime.
- `src/shaders/threeui.css`: Exact registered Three UI stylesheet.
- `vite.config.ts`: Strip the unused Lexend font declaration from the runtime raw HTML string.
- `src/App.tsx`: Coordinate weather, background preference, selector, and attribution.
- `src/App.test.tsx`: Verify integration without regressing clock and chime behavior.
- `README.md`: Document local weather permission, MET Norway endpoint, background choices, and attribution.

---

### Task 1: Weather Domain Module

**Files:**
- Create: `src/weather/weather.ts`
- Create: `src/weather/weather.test.ts`

**Interfaces:**
- Consumes: A MET Norway Locationforecast Compact JSON value, current `Date`, and latitude.
- Produces:

```ts
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

export function parseWeather(
  forecast: unknown,
  now?: Date,
): WeatherReading;

export function getSeasonFromForecast(
  forecast: unknown,
  latitude: number,
  now?: Date,
): SeasonId;
```

- [ ] **Step 1: Write failing parser and formatter tests**

Create a compact fixture with one current entry, seven future days, and all
three forecast periods. Assert these exact outputs:

```ts
expect(parseWeather(forecast, new Date('2026-09-22T12:20:00Z'))).toEqual({
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
});
```

Add tests that assert:

```ts
expect(getSeasonFromForecast(summerForecast, 59.9, now)).toBe('summer');
expect(getSeasonFromForecast(winterForecast, 59.9, now)).toBe('winter');
expect(getSeasonFromForecast(transitionForecast, 59.9, march)).toBe('spring');
expect(getSeasonFromForecast(transitionForecast, -33.9, march)).toBe('autumn');
expect(() => parseWeather({})).toThrow('time series');
```

- [ ] **Step 2: Run the weather tests and verify failure**

Run:

```shell
npm test -- src/weather/weather.test.ts
```

Expected: FAIL because `src/weather/weather.ts` does not exist.

- [ ] **Step 3: Implement weather parsing**

Implement these rules:

1. Validate that `properties.timeseries` is a nonempty array.
2. Select the entry nearest to `now`.
3. Read current values from `data.instant.details`.
4. Prefer `next_1_hours.summary.symbol_code`, then six hours, then twelve hours.
5. Normalize `_day`, `_night`, and `_polartwilight` suffixes.
6. Map conditions to the same labels and emoji used by Slides:

```ts
const conditionLabels = {
  clearsky: ['Clear Sky', '☀️'],
  cloudy: ['Cloudy', '☁️'],
  fair: ['Few Clouds', '🌤️'],
  fog: ['Fog', '🌫️'],
  partlycloudy: ['Partly Cloudy', '⛅'],
} as const;
```

Use `🌧️` for codes containing `rain`, `🌨️` for codes containing `sleet`,
and `❄️` for codes containing `snow`.

7. Convert wind degrees to one of sixteen compass directions.
8. Format finite numbers with one decimal place at most and no grouping.
9. Format forecast time with the browser locale while including the time zone.
10. Build one, six, and twelve hour period values from the nearest entry.
11. Aggregate seven future calendar days. Use all available days only when
    fewer than seven future days exist.
12. Require seven daily means. Throw
    `Seven daily mean temperatures are required.` otherwise.
13. Return summer when all means exceed 10, winter when all means are below
    zero, and a transitional season otherwise.
14. For nonnegative latitude, use spring from February through July and autumn
    otherwise. Reverse those two results for negative latitude.

- [ ] **Step 4: Run the weather tests**

Run:

```shell
npm test -- src/weather/weather.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the weather domain**

```shell
git add src/weather/weather.ts src/weather/weather.test.ts
git commit --signoff --message "feat(weather): parse local forecast"
```

---

### Task 2: Browser Location and Forecast Hook

**Files:**
- Create: `src/weather/useLocalWeather.ts`
- Create: `src/weather/useLocalWeather.test.tsx`

**Interfaces:**
- Consumes:

```ts
type UseLocalWeatherOptions = {
  enabled: boolean;
};
```

- Produces:

```ts
export type LocalWeatherState =
  | { status: 'checking-permission'; permission: null }
  | { status: 'prompt'; permission: 'prompt'; requestLocation: () => void }
  | { status: 'loading'; permission: 'granted' }
  | {
      status: 'success';
      permission: 'granted';
      latitude: number;
      weather: WeatherReading;
      season: SeasonId;
    }
  | {
      status: 'error';
      permission: PermissionState | 'unsupported';
      message: string;
      requestLocation?: () => void;
    };

export function useLocalWeather(
  options: UseLocalWeatherOptions,
): LocalWeatherState;
```

- [ ] **Step 1: Write failing permission and fetch tests**

Use `renderHook` and stub `navigator.permissions.query`,
`navigator.geolocation.getCurrentPosition`, and `fetch`.

Add tests for:

1. Permission `granted` obtains coordinates and requests:

```text
https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.9139&lon=10.7522
```

2. Permission `prompt` does not call geolocation until `requestLocation`.
3. Permission `denied` returns an error without calling `fetch`.
4. `enabled: false` does not query location or fetch.
5. A failed MET Norway response returns
   `Local weather is unavailable.`.

- [ ] **Step 2: Run the hook tests and verify failure**

Run:

```shell
npm test -- src/weather/useLocalWeather.test.tsx
```

Expected: FAIL because `useLocalWeather` does not exist.

- [ ] **Step 3: Implement the hook**

Use this request flow:

```ts
const endpoint = new URL(
  'https://api.met.no/weatherapi/locationforecast/2.0/compact',
);
endpoint.searchParams.set('lat', latitude.toFixed(4));
endpoint.searchParams.set('lon', longitude.toFixed(4));
```

Do not set a browser `User-Agent` header. Use `cache: 'no-store'`.

When the Permissions API is unavailable, return the prompt state and request
geolocation only after `requestLocation`. Subscribe to
`PermissionStatus.change` when the API exists and remove the listener during
cleanup. Ignore async results after unmount with a local cancellation flag.

Call `parseWeather` and `getSeasonFromForecast` once for each successful
response. Do not persist coordinates or forecast data.

- [ ] **Step 4: Run the hook tests**

Run:

```shell
npm test -- src/weather/useLocalWeather.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the browser weather hook**

```shell
git add src/weather/useLocalWeather.ts src/weather/useLocalWeather.test.tsx
git commit --signoff --message "feat(weather): load browser forecast"
```

---

### Task 3: Weather Panel

**Files:**
- Create: `src/weather/WeatherPanel.tsx`
- Create: `src/weather/WeatherPanel.test.tsx`

**Interfaces:**
- Consumes:

```ts
type WeatherPanelProps = {
  state: LocalWeatherState;
};
```

- Produces: A responsive, presentational weather panel with no network or
  geolocation side effects.

- [ ] **Step 1: Write failing panel tests**

Assert these states:

```tsx
render(<WeatherPanel state={{ status: 'checking-permission', permission: null }} />);
expect(screen.getByText('Checking local weather access.')).toBeInTheDocument();
```

For prompt state, assert an `Enable Local Weather` button calls
`requestLocation`.

For error state, assert `Local weather is unavailable.`.

For success state, assert:

- `Forecast for September 22, 2026, at 12:00 UTC.`
- `Obtained from MET Norway.`
- Four summary cards.
- Three detail cards.
- `Next Hour`, `Next 6 Hours`, and `Next 12 Hours`.
- No precipitation row when the period precipitation value is `null`.

- [ ] **Step 2: Run the panel tests and verify failure**

Run:

```shell
npm test -- src/weather/WeatherPanel.test.tsx
```

Expected: FAIL because `WeatherPanel` does not exist.

- [ ] **Step 3: Implement the panel**

Use a centered panel with Tailwind classes that match the existing Zinc color
system. Use semantic lists:

```tsx
<section aria-label="Local weather">
  <p>Forecast for <time dateTime={weather.forecastTime}>...</time>.</p>
  <p>
    Obtained from{' '}
    <a href="https://api.met.no/" target="_blank" rel="noopener noreferrer">
      MET Norway
    </a>.
  </p>
  <ul aria-label="Current conditions">...</ul>
  <dl aria-label="Weather details">...</dl>
  <div aria-label="Forecast periods">...</div>
</section>
```

Use four columns for summary cards on large screens, two columns on small
screens, three columns for detail and forecast cards on large screens, and one
column for those cards on small screens.

Stop click propagation on the entire panel so weather interaction does not
toggle the full-screen clock.

- [ ] **Step 4: Run the panel tests**

Run:

```shell
npm test -- src/weather/WeatherPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the weather panel**

```shell
git add src/weather/WeatherPanel.tsx src/weather/WeatherPanel.test.tsx
git commit --signoff --message "feat(weather): add forecast panel"
```

---

### Task 4: Background Preference Model

**Files:**
- Create: `src/seasonal/background.ts`
- Create: `src/seasonal/background.test.ts`

**Interfaces:**
- Produces:

```ts
export type BackgroundMode =
  | 'none'
  | 'dynamic'
  | 'spring'
  | 'summer'
  | 'autumn'
  | 'winter';

export const BACKGROUND_STORAGE_KEY = 'chime-clock-background';

export const backgroundOptions: readonly {
  value: BackgroundMode;
  label: string;
}[];

export function readBackgroundPreference(
  storage: Pick<Storage, 'getItem'>,
): BackgroundMode | null;

export function writeBackgroundPreference(
  storage: Pick<Storage, 'setItem'>,
  mode: BackgroundMode,
): void;

export function resolveInitialBackground(
  savedMode: BackgroundMode | null,
  permission: PermissionState | 'unsupported',
): BackgroundMode;

export function resolveSeason(
  mode: BackgroundMode,
  dynamicSeason: SeasonId | null,
): SeasonId | null;
```

- [ ] **Step 1: Write failing preference tests**

Assert:

```ts
expect(readBackgroundPreference(storageWith('winter'))).toBe('winter');
expect(readBackgroundPreference(storageWith('invalid'))).toBeNull();
expect(resolveInitialBackground(null, 'granted')).toBe('dynamic');
expect(resolveInitialBackground(null, 'prompt')).toBe('none');
expect(resolveInitialBackground(null, 'denied')).toBe('none');
expect(resolveInitialBackground('summer', 'denied')).toBe('summer');
expect(resolveSeason('dynamic', 'autumn')).toBe('autumn');
expect(resolveSeason('none', 'summer')).toBeNull();
```

- [ ] **Step 2: Run the preference tests and verify failure**

Run:

```shell
npm test -- src/seasonal/background.test.ts
```

Expected: FAIL because `background.ts` does not exist.

- [ ] **Step 3: Implement preference parsing and mapping**

Define all six options in the required order:

```ts
export const backgroundOptions = [
  { value: 'none', label: 'None' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'winter', label: 'Winter' },
] as const;
```

Reject unknown stored strings. Write the selected value immediately when the
user changes it.

- [ ] **Step 4: Run the preference tests**

Run:

```shell
npm test -- src/seasonal/background.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the preference model**

```shell
git add src/seasonal/background.ts src/seasonal/background.test.ts
git commit --signoff --message "feat(background): save season choice"
```

---

### Task 5: Exact Three UI Scene and Lazy Background

**Files:**
- Create: `src/shaders/sylva-living-world/SylvaLivingWorldScene.tsx`
- Create: `src/shaders/sylva-living-world/sources/inner-green-3d.html`
- Create: `src/shaders/sylva-living-world/sources/inner-green-assets/three.min.js`
- Create: `src/shaders/threeui.css`
- Create: `src/seasonal/SeasonalScene.tsx`
- Create: `src/seasonal/SeasonalBackground.tsx`
- Create: `src/seasonal/SeasonalBackground.test.tsx`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes:

```ts
type SeasonalBackgroundProps = {
  season: SeasonId | null;
};
```

- Produces: A fixed, decorative background. It renders nothing and imports no
  scene code when `season` is `null`.

- [ ] **Step 1: Write the failing lazy loading test**

Mock `./SeasonalScene` and assert:

1. `season={null}` does not render the scene.
2. `season="spring"` renders the `sakura-sunset` variant.
3. `season="summer"` renders the `living-green` variant.
4. `season="autumn"` renders the `maple-autumn` variant.
5. `season="winter"` renders the `sequoia-mist` variant.
6. The container has `aria-hidden="true"` and does not intercept page clicks.

- [ ] **Step 2: Run the background test and verify failure**

Run:

```shell
npm test -- src/seasonal/SeasonalBackground.test.tsx
```

Expected: FAIL because the seasonal background files do not exist.

- [ ] **Step 3: Retrieve and extract the exact source**

Run this Node.js script from the repository root:

```shell
node --input-type=module <<'EOF'
import { mkdir, writeFile } from 'node:fs/promises';

const response = await fetch(
  'https://threeui.com/source-code/sylva-living-world.json',
);
if (!response.ok) throw new Error(`Three UI returned HTTP ${response.status}.`);
const bundle = await response.json();

for (const file of bundle.files) {
  await mkdir(new URL(`./${file.path.substring(0, file.path.lastIndexOf('/'))}/`, import.meta.url), {
    recursive: true,
  });
  await writeFile(new URL(`./${file.path}`, import.meta.url), file.code);
}
EOF
```

Verify:

```shell
shasum --algorithm 256 \
  src/shaders/sylva-living-world/SylvaLivingWorldScene.tsx \
  src/shaders/sylva-living-world/sources/inner-green-3d.html \
  src/shaders/sylva-living-world/sources/inner-green-assets/three.min.js \
  src/shaders/threeui.css
```

Expected:

```text
e29b92a16596bc9383e1dbd4630e83b70ec2a59dbae48de1d3b7ddc48c0b2082
69c3694bd63f44ef9f007ebe4dac57a83e4402e0cdf6b54dd10b96dd4f05e197
8a5f7249903b54d30f79f708699d2fed2d6a1d0741a4cd41377d1f01bb5a2271
efe4447139f1358dd8e9be68edf6fa46cbefbd1de423a4d6c439ca61d2c8eccf
```

- [ ] **Step 4: Add the Vite raw source adapter**

Add a pre plugin before `react()` in `vite.config.ts`:

```ts
{
  name: 'remove-unused-sylva-font',
  enforce: 'pre',
  load(id) {
    if (!id.endsWith('inner-green-3d.html?raw')) return null;
    const source = readFileSync(id.slice(0, -4), 'utf8').replace(
      /@font-face\s*\{[^}]*lexend-latin\.woff2[^}]*\}/,
      '',
    );
    return `export default ${JSON.stringify(source)};`;
  },
},
```

Import `readFileSync` from `node:fs`. This changes only the runtime imported
string. Do not edit the registered source files.

- [ ] **Step 5: Implement lazy scene components**

`SeasonalScene.tsx` imports `SylvaLivingWorldScene` and `threeui.css`, maps
seasons to variants, and renders the scene.

`SeasonalBackground.tsx` uses `lazy` and `Suspense`:

```tsx
const SeasonalScene = lazy(() => import('./SeasonalScene'));

export function SeasonalBackground({ season }: SeasonalBackgroundProps) {
  if (!season) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Suspense fallback={null}>
        <SeasonalScene season={season} />
      </Suspense>
      <div className="absolute inset-0 bg-zinc-50/55 dark:bg-zinc-950/60" />
    </div>
  );
}
```

Ensure the inner Three UI iframe still receives pointer input if parallax is
required. Keep the outer application content above the scene with a stacking
context in `App.tsx`.

- [ ] **Step 6: Run the background test and verify hashes**

Run:

```shell
npm test -- src/seasonal/SeasonalBackground.test.tsx
shasum --algorithm 256 \
  src/shaders/sylva-living-world/SylvaLivingWorldScene.tsx \
  src/shaders/sylva-living-world/sources/inner-green-3d.html \
  src/shaders/sylva-living-world/sources/inner-green-assets/three.min.js \
  src/shaders/threeui.css
```

Expected: Tests pass and all hashes match Step 3.

- [ ] **Step 7: Commit the exact scene integration**

```shell
git add vite.config.ts src/seasonal src/shaders
git commit --signoff --message "feat(background): add seasonal scenes"
```

---

### Task 6: Clock Mode Preference

**Files:**
- Create: `src/clock/clockMode.ts`
- Create: `src/clock/clockMode.test.ts`

**Interfaces:**
- Produces:

```ts
export type ClockMode = 'analog' | 'cuckoo' | 'digital';

export const CLOCK_MODE_STORAGE_KEY = 'chime-clock-mode';

export const clockModeOptions: readonly {
  value: ClockMode;
  label: string;
}[];

export function readClockMode(
  storage: Pick<Storage, 'getItem'>,
): ClockMode;

export function writeClockMode(
  storage: Pick<Storage, 'setItem'>,
  mode: ClockMode,
): void;
```

- [x] **Step 1: Write failing clock mode tests**

Assert:

```ts
expect(clockModeOptions.map(({ label }) => label)).toEqual([
  'Analog',
  'Cuckoo',
  'Digital',
]);
expect(readClockMode(storageWith(null))).toBe('digital');
expect(readClockMode(storageWith('analog'))).toBe('analog');
expect(readClockMode(storageWith('invalid'))).toBe('digital');
```

Assert that `writeClockMode` stores the selected value under
`chime-clock-mode`.

- [x] **Step 2: Run the tests and verify failure**

Run:

```shell
npm test -- src/clock/clockMode.test.ts
```

Expected: FAIL because `clockMode.ts` does not exist.

- [x] **Step 3: Implement the preference module**

Use a constant set of valid modes and return `digital` for missing or invalid
stored values.

- [x] **Step 4: Run the clock mode tests**

Run:

```shell
npm test -- src/clock/clockMode.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the clock mode preference**

```shell
git add src/clock/clockMode.ts src/clock/clockMode.test.ts
git commit --signoff --message "feat(clock): save display mode"
```

---

### Task 7: Prepare 3D Clock Assets

**Files:**
- Create: `public/models/analog/wall-clock.fbx`
- Create: `public/models/analog/clock-base-color.png`
- Create: `public/models/analog/clock-normal.png`
- Create: `public/models/analog/clock-metallic.png`
- Create: `public/models/analog/clock-roughness.png`
- Create: `public/models/cuckoo/cuckoo-clock.fbx`
- Create: `public/models/cuckoo/cuckoo-base-color.png`
- Create: `public/models/cuckoo/cuckoo-normal.png`
- Create: `public/models/cuckoo/cuckoo-orm.png`
- Create: `public/models/ATTRIBUTION.md`

**Interfaces:**
- Consumes:
  - `/Users/leonardlee/Downloads/simple-wall-clock.zip`
  - `/Users/leonardlee/Downloads/cuckoo-clock.zip`
- Produces: Self hosted model URLs under `${import.meta.env.BASE_URL}models/`.

- [ ] **Step 1: Extract the model archives outside the repository**

Use a temporary directory:

```shell
temporary_directory=$(mktemp -d)
unzip '/Users/leonardlee/Downloads/cuckoo-clock.zip' \
  -d "$temporary_directory/cuckoo"
unzip '/Users/leonardlee/Downloads/simple-wall-clock.zip' \
  -d "$temporary_directory/analog"
unrar x \
  "$temporary_directory/analog/source/Meshy_AI_Blurred_Time_0615101307_texture_fbx.rar" \
  "$temporary_directory/analog/source/"
```

- [ ] **Step 2: Copy model files and resize textures**

Create the destination directories, copy each FBX file, and use `sips` to
resize textures to a maximum width and height of 1024 pixels while preserving
their formats:

```shell
mkdir --parents public/models/analog public/models/cuckoo
cp "$temporary_directory/cuckoo/source/cuckoo clock.fbx" \
  public/models/cuckoo/cuckoo-clock.fbx
cp "$temporary_directory/analog/source/Meshy_AI_Blurred_Time_0615101307_texture_fbx/Meshy_AI_Blurred_Time_0615101307_texture.fbx" \
  public/models/analog/wall-clock.fbx
```

Map the inner Simple Wall Clock textures to the four `clock-*` names and the
Cuckoo Clock textures to the three `cuckoo-*` names. Run:

```shell
sips --resampleHeightWidthMax 1024 source.png --out destination.png
```

for every copied texture. Do not commit either original archive, the nested
RAR file, or extracted duplicate textures.

- [ ] **Step 3: Add model attribution**

Create `public/models/ATTRIBUTION.md` with:

```markdown
# Model Attribution

## Cuckoo Clock

["Cuckoo Clock"][cuckoo-clock] by FFeller is licensed under
[Creative Commons Attribution][cc-by].

## Simple Wall Clock

["Simple Wall Clock"][simple-wall-clock] by Jerovdl is licensed under
[Creative Commons Attribution][cc-by].

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cuckoo-clock]: https://skfb.ly/6AWAF
[simple-wall-clock]: https://skfb.ly/pL9IG
```

- [ ] **Step 4: Verify model structure and asset sizes**

Install the Three.js runtime:

```shell
npm install three
```

Use `FBXLoader` in a one-time Node.js inspection script. Confirm the Cuckoo
Clock includes `CuckooClock`, `arm`, `arm001`, `face`, and `door`. Confirm the
Simple Wall Clock loads as one mesh.

Run:

```shell
du --human-readable public/models/analog/* public/models/cuckoo/*
```

Expected: No committed texture exceeds its original dimensions, and no archive
file appears under `public/models/`.

- [ ] **Step 5: Commit model assets**

```shell
git add package.json package-lock.json public/models
git commit --signoff --message "feat(clock): add licensed 3d models"
```

---

### Task 8: Three.js Analog and Cuckoo Clock

**Files:**
- Create: `src/clock/ThreeClock.tsx`
- Create: `src/clock/ThreeClock.test.ts`
- Create: `src/clock/ClockDisplay.tsx`
- Create: `src/clock/ClockDisplay.test.tsx`

**Interfaces:**
- Consumes:

```ts
type ChimeAnimation = {
  id: number;
  strikes: number;
};

type ClockDisplayProps = {
  mode: ClockMode;
  time: Date;
  chimeAnimation: ChimeAnimation | null;
};
```

- Produces:

```ts
export function getHandRotations(date: Date): {
  hour: number;
  minute: number;
  second: number;
};

export function getCuckooAnimation(
  elapsedMilliseconds: number,
  strikes: number,
): {
  active: boolean;
  birdOffset: number;
  doorRotation: number;
};
```

- [ ] **Step 1: Write failing time and cuckoo animation tests**

Assert:

```ts
expect(getHandRotations(new Date('2026-09-22T03:15:30Z'))).toEqual({
  hour: expect.closeTo(
    -((3 + 15 / 60 + 30 / 3600) / 12) * Math.PI * 2,
  ),
  minute: expect.closeTo(-((15 + 30 / 60) / 60) * Math.PI * 2),
  second: expect.closeTo(-Math.PI),
});
```

Use local date construction if the test environment changes UTC parsing.

For `getCuckooAnimation`, define a one-second cycle:

- 0 to 250 milliseconds: door opens and bird moves out.
- 250 to 500 milliseconds: bird remains out.
- 500 to 750 milliseconds: bird returns and door closes.
- 750 to 1,000 milliseconds: closed pause.

Assert two strikes remain active before 2,000 milliseconds and become inactive
at 2,000 milliseconds. Assert zero strikes is always inactive.

- [ ] **Step 2: Run the clock tests and verify failure**

Run:

```shell
npm test -- src/clock/ThreeClock.test.ts src/clock/ClockDisplay.test.tsx
```

Expected: FAIL because the clock components do not exist.

- [ ] **Step 3: Implement the Three.js renderer**

Use `FBXLoader` from `three/examples/jsm/loaders/FBXLoader.js`. Create the
renderer, scene, perspective camera, ambient light, directional light, resize
observer, and animation frame loop inside one effect. Dispose geometries,
materials, textures, renderer, animation frames, and observers during cleanup.

Normalize the loaded model with `Box3` so its largest dimension fits a stable
camera frame.

For both models:

1. Add a circular procedural dial slightly in front of the model face.
2. Add hour, minute, and second hand meshes.
3. Update their rotations from `getHandRotations(time)` during render.

For the Cuckoo model:

1. Hide `arm` and `arm001`.
2. Keep a reference to `door`.
3. Create a small wooden bird from sphere, cone, and box geometries.
4. Place it behind the door.
5. On a new `chimeAnimation.id`, save the animation start time.
6. Apply `getCuckooAnimation` on each frame.
7. Reset the door and bird when the sequence completes or the component
   unmounts.

Load textures manually from `${import.meta.env.BASE_URL}models/` and apply
them to the loaded meshes. Use sRGB color space for base color textures and
linear color space for normal, roughness, metallic, and ORM textures.

- [ ] **Step 4: Implement lazy display selection**

`ClockDisplay.tsx` renders the existing digital JSX for `digital`. Lazy import
`ThreeClock` for `analog` and `cuckoo`. Use a stable 16:10 container with an
accessible loading label while the model downloads.

Do not load `three`, `FBXLoader`, or model assets in Digital mode.

- [ ] **Step 5: Run focused clock tests**

Run:

```shell
npm test -- src/clock/ThreeClock.test.ts src/clock/ClockDisplay.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit 3D clock rendering**

```shell
git add src/clock
git commit --signoff --message "feat(clock): render analog clock modes"
```

---

### Task 9: Application Integration

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes:
  - `useLocalWeather({ enabled })`
  - `WeatherPanel`
  - `backgroundOptions`
  - `readBackgroundPreference`
  - `writeBackgroundPreference`
  - `resolveInitialBackground`
  - `resolveSeason`
  - `SeasonalBackground`
  - `ClockDisplay`
  - `clockModeOptions`
  - `readClockMode`
  - `writeClockMode`

- Produces: The complete user flow without changing public clock or chime
  interfaces.

- [ ] **Step 1: Add failing integration tests**

Extend the existing fetch mock so `/api/ntp` returns time data and the MET
Norway URL returns the weather fixture.

Add tests that assert:

1. Granted permission with no saved setting selects `Dynamic`, shows weather,
   and renders the computed seasonal scene.
2. Prompt permission with no saved setting selects `None` and shows
   `Enable Local Weather`.
3. Clicking `Dynamic` requests geolocation.
4. Denied permission after selecting `Dynamic` changes the selection to
   `None`.
5. Clicking `Winter` stores `winter`, renders the winter scene, and does not
   request geolocation when permission is not granted.
6. Clicking the weather panel or background selector does not hide the
   interface.
7. Existing NTP, chime, seconds sound, and clock visibility tests still pass.
8. Digital mode is the first visit default.
9. Selecting Analog or Cuckoo saves the mode and renders the lazy 3D clock.
10. An hourly chime emits a cuckoo animation event with the hour strike count.
11. Quarterly and half hourly chimes emit one cuckoo animation cycle.
12. Disabling chimes cancels the active cuckoo animation.

- [ ] **Step 2: Run the application tests and verify failure**

Run:

```shell
npm test -- src/App.test.tsx
```

Expected: New weather and background assertions fail.

- [ ] **Step 3: Integrate state into `App.tsx`**

Add `Trees` from `lucide-react`.
Add `Clock3` from `lucide-react`.

Initialize the saved preference once:

```ts
const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
  return readBackgroundPreference(window.localStorage) ?? 'none';
});
```

Track whether a saved setting existed so permission state can choose the first
default only once. Enable weather when permission is granted or when the user
selects `Dynamic`.

When the permission check completes and there is no saved setting:

- Set `dynamic` for granted permission.
- Set `none` for prompt, denied, or unsupported permission.

When a dynamic request returns an error, set and save `none`.

Resolve the active season:

```ts
const activeSeason = resolveSeason(
  backgroundMode,
  weatherState.status === 'success' ? weatherState.season : null,
);
```

Render `SeasonalBackground` as the first child of the root. Add
`relative isolate` to the root container.

Render `WeatherPanel` below the date and above NTP status while `hideUI` is
false.

Replace the current digital clock JSX with `ClockDisplay`. Pass the existing
`time`, selected clock mode, and current chime animation event. Preserve the
existing digital markup inside the Digital branch so typography and animation
remain unchanged.

Initialize clock mode with `readClockMode(window.localStorage)` and save each
change with `writeClockMode`.

When `startChime` runs, increment a chime event identifier and store the strike
count. Clear that event in `stopChime`. This makes the cuckoo animation follow
both scheduled chimes and preview actions without changing audio scheduling.

Add an `OptionSelector` titled `Background` below `Seconds Sound`:

```tsx
<OptionSelector
  icon={<Trees className="h-5 w-5" />}
  layoutId="background-active"
  onChange={handleBackgroundChange}
  options={backgroundOptions}
  title="Background"
  value={backgroundMode}
/>
```

Add a `Clock` selector before `Chime Interval`:

```tsx
<OptionSelector
  icon={<Clock3 className="h-5 w-5" />}
  layoutId="clock-mode-active"
  onChange={handleClockModeChange}
  options={clockModeOptions}
  title="Clock"
  value={clockMode}
/>
```

Show `Seasonal background by Three UI.` above the build footer only when
`activeSeason` is not `null`.

- [ ] **Step 4: Run application and focused tests**

Run:

```shell
npm test -- src/App.test.tsx src/weather src/seasonal
```

Expected: PASS.

- [ ] **Step 5: Commit application integration**

```shell
git add src/App.tsx src/App.test.tsx
git commit --signoff --message "feat(app): integrate clocks and weather"
```

---

### Task 10: Documentation and Final Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: The completed application behavior.
- Produces: User and developer documentation.

- [ ] **Step 1: Update the README**

Document:

- Browser location permission.
- `Current Location 📍` behavior.
- The MET Norway endpoint.
- The six background options.
- Dynamic forecast threshold behavior.
- The local storage key `chime-clock-background`.
- Three UI and MET Norway attribution.
- The fact that all scene assets are self hosted.
- Digital, Analog, and Cuckoo clock modes.
- Clock mode persistence under `chime-clock-mode`.
- Cuckoo bird behavior for hourly, quarterly, and half hourly chimes.
- FFeller and Jerovdl model attribution under CC BY.

Add this Nushell debugging example:

```nu
let latitude = 59.9139
let longitude = 10.7522
let url = $"https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=($latitude)&lon=($longitude)"
let data = (http get $url)

let first_forecast = $data.properties.timeseries.0
{
  updated_at: $data.properties.meta.updated_at
  instant: $first_forecast.data.instant.details
  next_1_hours: $first_forecast.data.next_1_hours
  next_6_hours: $first_forecast.data.next_6_hours
  next_12_hours: $first_forecast.data.next_12_hours
}
```

- [ ] **Step 2: Run the complete verification suite**

Run:

```shell
npm run lint
npm test
npm run build
```

Expected: All commands exit successfully.

- [ ] **Step 3: Verify browser behavior**

Run:

```shell
npm run dev
```

Check at desktop and 390 pixel mobile widths:

1. The first visit with prompt permission uses `None`.
2. `Dynamic` requests browser location.
3. Granted permission loads all weather cards.
4. Denied permission returns the selector to `None`.
5. Manual seasons change immediately without location access.
6. Reload restores the selected background.
7. The scene remains behind the clock and controls.
8. Clicking weather and settings does not hide the interface.
9. Clicking the clock canvas still toggles the interface.
10. NTP synchronization and audio previews still work.
11. Digital mode does not request 3D model assets.
12. Analog and Cuckoo modes load only their selected model.
13. Analog and Cuckoo hands match the digital time.
14. The cuckoo bird completes one cycle per active chime strike.
15. Reload restores the saved clock mode.

- [ ] **Step 4: Verify source integrity**

Run the four `shasum --algorithm 256` commands from Task 5 and confirm every
hash remains unchanged.

- [ ] **Step 5: Commit documentation**

```shell
git add README.md
git commit --signoff --message "docs(readme): explain local weather"
```

- [ ] **Step 6: Review the complete branch**

Run:

```shell
git status --short
git --no-pager diff origin/main...HEAD --stat
git --no-pager log --oneline origin/main..HEAD
```

Expected: Only the planned weather, seasonal background, 3D clock assets,
tests, Vite adapter, dependency lock changes, and documentation changes
appear. Existing `.firebase/` and `extracted/` directories remain untracked
and unmodified.
