# Local Weather and Seasonal Background Design

## Purpose

Add local weather information, optional seasonal backgrounds, and three clock
display modes to Chime Clock. The weather display will use the browser location
and the MET Norway Locationforecast Compact API. The background will use the
exact self hosted Three UI Sylva Living World source.

## Weather Behavior

The application will query the browser geolocation permission before it
requests a position.

When location permission is granted, the application will:

1. Request the current coordinates from the browser.
2. Request forecast data from MET Norway.
3. Show the forecast time and MET Norway attribution.
4. Show four current condition cards for location, temperature, conditions,
   and wind.
5. Show three detail cards for pressure, cloud cover, and humidity.
6. Show forecast cards for the next hour, next six hours, and next twelve
   hours.

The location card will show `Current Location 📍`. The application will not
send location data to a service other than MET Norway.

When permission has not been requested, the weather area will explain that
location access enables local weather. Selecting `Dynamic` will request
permission. When permission is denied or a request fails, the weather area
will show a concise error and the clock will continue to work.

## Background Selection

Add a Background selector to the existing settings panel with these options:

- `None`
- `Dynamic`
- `Spring`
- `Summer`
- `Autumn`
- `Winter`

Save the selected option in local storage.

If a saved option exists, restore it. If no saved option exists, use
`Dynamic` when location permission is granted. Use `None` when permission is
denied or still requires a prompt.

Selecting `Dynamic` requests location permission when necessary. If permission
is denied or the forecast request fails, switch the background to `None`.
Manual season options do not require location permission.

For dynamic selection, calculate seven daily mean temperatures from the MET
Norway forecast:

- Select summer when all seven means are above 10°C.
- Select winter when all seven means are below 0°C.
- Select spring or autumn for transitional temperatures.
- Reverse the transitional spring and autumn month ranges in the Southern
  Hemisphere.

## Scene Integration

Copy the exact registered Three UI files from the Slides repository. Preserve
their content and verify their SHA-256 hashes.

Load React scene code, Three.js, and scene styles only when the selected
background is not `None`. Keep the clock usable while the scene loads or if it
fails. Place the scene behind the application and add a light readability wash
that supports light and dark color schemes.

Show `Seasonal background by Three UI.` when a seasonal scene is active.

## Clock Modes

Add a Clock selector with these options in this order:

- `Analog`
- `Cuckoo`
- `Digital`

Use `Digital` as the first visit default and save the selected mode in local
storage.

The Analog mode will use ["Simple Wall Clock"][simple-wall-clock] by Jerovdl.
The source model contains one combined mesh, so the application will place a
procedural dial and synchronized hour, minute, and second hands in front of the
model.

The Cuckoo mode will use ["Cuckoo Clock"][cuckoo-clock] by FFeller. The source
model contains separate clock body, face, hand, and door meshes but no separate
bird mesh. Hide the static hand meshes, add synchronized procedural hands, and
add a small procedural wooden bird behind the animated door.

The cuckoo bird will animate only when a chime plays. It will complete one out
and back cycle for each strike. Quarterly and half hourly chimes use one cycle.
Hourly chimes use the current hour count, including twelve cycles at noon and
midnight. Stopping or disabling a chime will stop the active bird sequence.

Load Three.js and each model only when its clock mode is active. Resize the
model textures before committing them so the original 17 MB and 41 MB archives
are not shipped directly. Keep the model files and optimized textures self
hosted.

Credit both models under the [Creative Commons Attribution][cc-by] license.

## Components and Data Flow

Add a weather module for:

- MET Norway requests.
- Forecast parsing.
- Weather labels and emoji.
- Forecast period formatting.
- Seven day season classification.

Add a weather panel component that owns loading, permission, success, and error
presentation. Keep geolocation and network effects outside the pure parsing
functions.

Add a seasonal background component that lazy loads the copied Three UI scene.
The application owns the saved background setting and passes the active season
to the background component.

Add a clock mode module for persistent mode selection. Add one Three.js clock
component that loads the selected model, creates a procedural dial and hands,
and receives the current time. The component also receives a numbered chime
event with a strike count so each event starts one cancellable cuckoo sequence.

## Testing

Add unit tests for:

- Current condition parsing.
- One, six, and twelve hour forecast periods.
- Northern and Southern Hemisphere season selection.
- Weather formatting.

Add component tests for:

- Granted location permission and successful weather loading.
- Denied location permission.
- The `Dynamic` selection requesting location.
- Manual season selection without a location request.
- Saved background selection restoration.
- Digital mode as the first visit default.
- Saved Analog and Cuckoo mode restoration.
- Analog hand rotation from the current time.
- One cuckoo cycle per chime strike.
- Cancellation of an active cuckoo sequence when playback stops.

Run the existing type check, tests, and production build.

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cuckoo-clock]: https://skfb.ly/6AWAF
[simple-wall-clock]: https://skfb.ly/pL9IG
