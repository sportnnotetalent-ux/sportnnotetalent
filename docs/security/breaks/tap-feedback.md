# Tap feedback: break it (2026-11-03)

**Founder request:** every press visibly responds, and every scoring step (a point, an ace, a fault, a "how was it won" chip, in any sport) gives the scorer a smooth, evident sign that it was captured.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**Design:** one dispatch wrapper in `LiveScoringScreen` (`captureDispatch`, pure core in `src/core/tapCapture.ts`) reads the state before and after each step. Only a step that changed the state counts as captured: then a light haptic (phones only, preference on), a pulse and ✓ on the Undo bar, and the changed scoreboard number pops. Press states live in the shared `usePressFeedback` (Button, SelectChip, PointButtons, SecondaryAction).

| # | Failure | Status |
|---|---|---|
| T1 | **A refused tap confirms anyway.** `useLiveMatch.dispatch` buzzed on every dispatch, even when the reducer refused the step (match over, wrong phase, stale tap) and the state stayed the same, so the scorer felt "captured" for nothing. | **Fixed:** the buzz left `useLiveMatch.dispatch`; `captureDispatch` (LiveScoringScreen `scoreDispatch`) confirms only when `stepCaptured(prev, next)`. Tests T1; sim (600 scorers). |
| T2 | **A reducer that copies an unchanged state** (`{ ...state }`) would look like a change by reference and confirm a refused tap. | **Fixed:** `stepCaptured` is a structural compare that stops at shared references. The sim found a real case first: clearing a detail that was never set rebuilds the events list unchanged (tennis POINT_DETAIL `pd: null`); now refused. Tests T1/T2; sim. |
| T3 | **Reduced motion ignored.** Scale pops and pulses play for people who turned on Reduce Motion (iOS) / Remove animations (Android). They must get a static ✓, no scale, no pulse. | **Fixed:** `useReduceMotion` (AccessibilityInfo, followed live); `motionPlan(true)` = no press scale, no pop, no pulse; the ✓ badge still shows. Tests T3; sim. |
| T4 | **Web buzzes.** `haptics.ts` (web) vibrates on Android browsers; the brief says haptics on phones only, never on web. | **Fixed:** `shouldBuzz` is false on web. Tests T4; sim. |
| T5 | **Haptics preference off** (Settings → Preferences) must silence the captured buzz too. | **Fixed:** `shouldBuzz` reads `hapticsPref`. Tests T5; sim. |
| T6 | **A viewer (cannot score) or read-only screen** must never buzz or flash "captured". | **Fixed:** `shouldBuzz` needs `canScore`; viewers never dispatch, so nothing is emitted. Tests T6; sim. |
| T7 | **Double taps.** Two fast taps: the 400 ms tap guard drops the second (no step, so no confirm); two accepted steps confirm twice, and the second pulse restarts the first instead of stacking. | **Fixed:** the tap guard is unchanged; each accepted step emits once, and the pulse stops and restarts (`stopAnimation`) instead of stacking. Tests T7; sim (double taps). |
| T8 | **Performance.** The confirm must not re-render the whole scoring screen per tap (no new screen state), animations stay under 250 ms, use the native driver on phones, and nothing changes size (no layout jump). | **Fixed:** the Undo bar listens to `captureBus` (no screen state); press / pop / pulse are Animated transforms + opacity (native driver on phones), 80–220 ms; the ✓ is an absolute corner badge, so nothing moves. Source checks. |
| T9 | **Disabled controls** must not show a press state (a disabled point button before "who serves first?" is answered). | **Fixed:** `usePressFeedback` returns early when disabled and the disabled style replaces the press style. Source checks. |
| T10 | **Detail chips** (POINT_DETAIL: winner / error / forehand / shot) must confirm like a point: the chip animates into its selected look and the ✓ summary line fades in. Toggling a chip off changes the state, so it is still captured (the summary updates). | **Fixed:** detail chips dispatch through the same wrapper; SelectChip fades its lime fill in (`useSelectAnim`); the ✓ summary line is a `FadeInLine` (PointDetailRow, tennis PointCapture). Source checks; sim (POINT_DETAIL steps). |
| T11 | **A throwing listener** (an animation on an unmounted bar) must never break scoring: the step is already applied. | **Fixed:** `captureDispatch` and the bus swallow a throwing listener. Tests T7/T11. |
| T12 | **Web native driver.** `useNativeDriver: true` on react-native-web warns and falls back; the web build must use the JS driver. | **Fixed:** `nativeDriver(Platform.OS)` is false on web. Tests T12. |

## Accepted, out of scope
- A refused step is still written to the event log by `useLiveMatch` (existing behaviour; no scoring/engine changes allowed here). It is no longer *confirmed*.
- Shared scoring's stale-tap check is async (server side); its own note ("your tap wasn't added") already covers that case.

## Results
`tests/tap-feedback.test.mts` (25) and `tests/sim-tap-feedback.test.mts` (600 scorers, 20,000+ steps through the real tennis / badminton / football reducers, double taps and refused steps: captured exactly when the state changed). Every test file mentioning PointButtons / components/ui / LiveScoringScreen / Scoreboard / haptics / undo plus leading-emoji and pad-icons: 140 files, 2,434 tests, 0 failing (one pool replay-timing test flaked under the parallel run and passes alone); `tsc --noEmit` clean. Two source checks updated for the wrapped dispatch name (side-display-names, undo-labels-quick-sheet). Not checked on a device or in the browser.
