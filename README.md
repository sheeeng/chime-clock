# Chime Clock

Chime Clock is a simple client-side application built with React and Tailwind CSS that displays the current time with configurable chimes.

## Run Locally

1. Clone the repository.

    ```shell
    git clone https://github.com/sheeeng/chime-clock.git
    cd chime-clock
    ```

2. Install [just](https://github.com/casey/just).

3. Install dependencies.

    ```shell
    just install
    ```

4. Run the development server.

    ```shell
    just dev
    ```

5. Open your browser and navigate to the URL provided in the terminal.

    `http://localhost:3000`

### Alternative

If you prefer not to install [`just`](https://github.com/casey/just), use [`npm`](https://github.com/npm/cli) directly.

1. Install dependencies.

    `npm install`

2. Run the development server.

    `npm run dev`

3. Open your browser and navigate to the URL provided in the terminal.

    `http://localhost:3000`

## Deployments

- [chime-clock.firebaseapp.com](https://chime-clock.firebaseapp.com/)
- [chime-clock.web.app](https://chime-clock.web.app/)
- [chime-clock.netlify.app](https://chime-clock.netlify.app/)
- [chime-clock.vercel.app](https://chime-clock.vercel.app/)
- [sheeeng.github.io/chime-clock](https://sheeeng.github.io/chime-clock/)

## Local Weather and Seasonal Background

The weather panel shows current conditions for the browser's reported
location. Enabling it requests the browser's location permission, and once
granted, the panel shows the current temperature, condition, wind, pressure,
cloud cover, and humidity, along with forecasts for the next hour, the next
six hours, and the next twelve hours. The first current conditions card is
labeled exactly `Current Location 📍`. The forecast timestamp and
`Obtained from MET Norway.` appear before the current conditions cards.
Every reading comes from [MET Norway][met-norway]'s Locationforecast API.

On a first visit, the `Background` selector defaults to `None` while the
browser's location permission is still at `prompt`, and to `Dynamic` once the
browser already granted it. The selector offers six options: `None`,
`Dynamic`, `Spring`, `Summer`, `Autumn`, and `Winter`.

Selecting `Dynamic` requests the browser's location and renders a season
computed from the forecast. Selecting a named season renders it immediately
and never requests location access. If the browser denies a request made
while `Dynamic` is selected, the selector returns to `None`, and that choice
is saved; a transient failure leaves a saved `Dynamic` choice in place, and
the user can retry by selecting `Dynamic` again in the `Background`
selector. Unsupported and refused states do not offer a retry callback, and
the weather panel error state has no retry button. The chosen background
persists in local storage under the key `chime-clock-background`, and
reloading the page restores it.

`Dynamic` derives the season from the daily mean temperatures for the next
seven days in the forecast. A mean above ten degrees Celsius on every one of
those days selects summer, and a mean below zero degrees Celsius on every one
selects winter. Otherwise, the season follows a six-month calendar window
read against the reported latitude's hemisphere: February through July
resolves to spring north of the equator and to autumn south of it, and the
remaining months resolve the other way.

The seasonal scene itself is [Three UI][three-ui]'s Sylva Living World scene,
vendored into this repository rather than requested from Three UI's servers
at runtime; see [Lazy Loading and Self-Hosted Assets][lazy-loading]. The
application credits Three UI in a line below the settings panel whenever a
seasonal background is showing.

The seasonal background renders behind the clock and the settings panel at
all times. Clicking the weather panel or a setting does not hide the
interface; only clicking the clock canvas toggles it.

## Clock Modes

The `Clock` selector offers three display modes, shown in this order:
`Analog`, `Cuckoo`, and `Digital`. `Digital` is the default on a first visit.
The chosen mode persists in local storage under the key `chime-clock-mode`,
and reloading the page restores it.

`Analog` and `Cuckoo` render a licensed three-dimensional model with
[Three.js][three-js], synchronized to the same time the digital clock shows.
Both modes load lazily: selecting `Digital` never downloads Three.js, its
model loader, or any model asset, and selecting `Analog` or `Cuckoo`
downloads only the one model that mode needs.

### The Cuckoo Bird

While `Cuckoo` is selected, a procedural wooden bird runs one complete cycle
for every chime strike. Over the first quarter second of a cycle, the door
opens and the bird moves out; the bird then holds outside until the half
second mark; over the next quarter second, the bird returns and the door
closes; and the door stays shut for the final quarter second. An hourly chime
therefore runs one cycle for every hour struck, and a quarterly or
half-hourly chime runs a single cycle.

Turning the chime off while a cycle is in progress cancels the cycle on
screen: the door closes and the bird hides on the next frame. Ringing the
chime again always starts a fresh cycle rather than resuming the one that
was cancelled.

The door and the procedural bird are enlarged to 150 percent of their
modeled size. The door's width and height scale up; its depth and hinge stay
as modeled. The bird's size, resting position, and travel scale with the
door, so the enlarged bird stays centered under the roof and clears the
enlarged opening without collision.

### Model Attribution

The `Analog` model is [Simple Wall Clock][simple-wall-clock] by Jerovdl. The
`Cuckoo` model is [Cuckoo Clock][cuckoo-clock] by FFeller. Both models come
from Sketchfab and are licensed under a [Creative Commons
Attribution][cc-by] license. The same attribution lives in
`public/models/ATTRIBUTION.md`, which ships with the built site.

## Debugging the MET Norway Forecast

Query the same MET Norway endpoint the weather panel calls, and inspect the
fields the panel and the season reader consume, with [Nushell][nushell]:

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

## Lazy Loading and Self-Hosted Assets

Every three-dimensional model, every model texture, and the seasonal scene's
shader code ship from this repository rather than from a third party's
servers. Only two requests leave the application at runtime: the `/api/ntp`
endpoint for time synchronization, and MET Norway's forecast endpoint for
local weather.

`ClockDisplay` lazily imports the Three.js renderer, so `Digital` mode never
downloads Three.js, its model loader, or any model asset. `SeasonalBackground`
lazily imports the seasonal scene, so a visitor who has not enabled a
background never downloads the vendored scene code.

## License

This work is dual licensed under the [Apache License 2.0](LICENSE-APACHE) and the [MIT License](LICENSE-MIT).

You may choose either license when you use this work.

`SPDX-License-Identifier: Apache-2.0 OR MIT`

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cuckoo-clock]: https://skfb.ly/6AWAF
[lazy-loading]: #lazy-loading-and-self-hosted-assets
[met-norway]: https://api.met.no/
[nushell]: https://www.nushell.sh/
[simple-wall-clock]: https://skfb.ly/pL9IG
[three-js]: https://threejs.org/
[three-ui]: https://threeui.com/
