# Cuckoo door and bird enlargement

## Status

Done. The door and the procedural bird now scale to 150 percent of their
modeled size, hinge behavior and door depth are unchanged, the bird's rest
position and travel recenter on the enlarged opening, and the one-second,
one-cycle-per-strike timing is untouched. All checks pass; see below.

## Change

`src/clock/ThreeClock.tsx`:

- Added an exported constant, `CUCKOO_ENLARGEMENT_SCALE = 1.5`, next to the
  other cuckoo constants.
- In `createCuckooParts`, the door's `scale.x` and `scale.y` multiply by
  `CUCKOO_ENLARGEMENT_SCALE` before the door's bounding box and pivot are
  computed. `scale.z` is untouched, so the door's depth stays as modeled.
  `createDoorPivot` runs after the scaling, so the hinge lands on the
  enlarged door's own right edge, exactly as it did before this change for
  the unscaled door.
- The bird's `scale` uses the door's size captured before scaling
  (`modeledDoorSize`), multiplied by `0.34 * CUCKOO_ENLARGEMENT_SCALE`. Using
  the pre-scale size applies the enlargement factor exactly once; using the
  post-scale door size here would have doubled it.
- `createBird` changed from a private function to an exported one, so tests
  can build a reference bird at an arbitrary scale for comparison.
- The rest-position and travel formulas (`birdRestZ`, `birdTravel`) are
  unchanged in form. Both already derive from the bird's `scale` and the
  door's box, so the enlarged bird and door move them out proportionally
  without any separate edit.

No change reached `src/clock/ThreeClock.test.ts`, `getCuckooAnimation`, or
any file outside the cuckoo door and bird construction; the licensed FBX
asset is not modified, and no new bird asset was created.

## Tests added

`src/clock/ThreeClock.lifecycle.test.tsx` gained a `cuckoo sizing` block with
three scene-level tests, run against the suite's fake FBX model (door box: 5
by 6 by 1 model units). They assert bounding boxes and positions computed
from the live scene graph, not snapshots, so a regression in either scaling
formula fails a concrete numeric expectation:

1. **Door enlarges, depth stays modeled.** The door pivot's world bounding
   box is `7.5 by 9 by 1`, that is, `5 * 1.5` by `6 * 1.5` by the unscaled
   `1`.
2. **Bird enlarges by the same factor and stays hidden and centered.** The
   bird's world bounding box matches a reference bird built with
   `createBird(min(5, 6) * 0.34 * 1.5)`, that is, scale `2.55`. While the
   door is closed, the bird's `x` position is centered near 0 and its `z`
   position stays behind the door's near face (`z < 4.5`), with
   `visible === false`.
3. **Bird clears the opening and returns fully inside on the existing
   timing.** Stepping the animation to `now = 250` (fully out, unchanged
   `CUCKOO_EXIT_MILLISECONDS`) shows the bird past the door's enlarged far
   face (`z > 5.5`), still centered (`x ≈ 0`), and visible. Stepping to
   `now = 1_000` (one full `CUCKOO_CYCLE_MILLISECONDS` cycle) shows the bird
   back behind the near face (`z < 4.5`) and hidden. This exercises exactly
   one chime strike's cycle, confirming the one-cycle-per-strike behavior is
   unaffected by the size change.

## Test, lint, and build results

- Focused clock tests (`ThreeClock.test.ts` and
  `ThreeClock.lifecycle.test.tsx`): 31 of 31 passed, including the three new
  sizing tests.
- Full suite (`npm test`): 206 of 206 passed across 16 files.
- `npm run lint` (`tsc --noEmit`): clean.
- `npm run build`: succeeded. The `ThreeClock` chunk is unchanged at 622.76
  kB, matching the pre-change baseline.

## Browser verification

Verified against the worktree's own dev server at `http://localhost:3000`,
Cuckoo mode selected, triggering a one-strike chime preview through the
Chime Interval and Chime Sound controls.

- `captures/cuckoo-closed.png`: door closed at rest. No visible change from
  the unscaled clock; the enlarged door and hidden bird stay fully behind
  the case front.
- `captures/cuckoo-bird-out.png` and the cropped
  `captures/cuckoo-bird-out-zoom.png`: door open, bird held out mid-cycle.
  The bird sits centered under the roof peak and above the dial, with clear
  margin on both sides. The open door panel is visible swung to its hinge
  side. No collision with the roof or the dial.
- `captures/cuckoo-bird-returned.png`: door closed again after the cycle
  completes, bird hidden, matching the closed capture.

## Concerns

- The real FBX door's local origin and pivot geometry are unverified beyond
  this session's fake test model. The code recomputes the door's bounding
  box and center from the live scene after scaling, rather than assuming a
  symmetric local origin, so it should hold regardless of the real asset's
  authored pivot, but the browser capture is the only check against the real
  asset, and it showed no collision or off-center bird at any observed point
  in the cycle.
- Capture screenshots are not part of the source diff and are not
  referenced by any test; they are evidence for this report only.

## Follow-up

The review found one remaining frame-fit gap. `normalizeModel` measured the
Cuckoo root before the enlarged door was in the box, so the case fit still
tracked the unscaled geometry and any later measurement could pick up the
procedural bird.

The scene now captures a `frameBox` after the door is enlarged and pivoted,
before the bird is added, and `normalizeModel` uses that box only for Cuckoo
mode. The scene-level travel test now checks the fixture geometry directly:
the bird is fully out at `z = 5.5 + birdScale * 1.3`, and it returns to
`z = 4.5 - birdScale * 1.6` at rest. That keeps the test tied to the known
fixture values instead of a broad threshold.

## Follow-up Checks

- Focused clock tests: passed.
- Full test suite: passed.
- Lint: passed.
- Build: passed.
- Browser capture: `captures/cuckoo-frame-check.png`.
