# Break it: the app on an iPad

2026-11-05. `app.json` has `ios.supportsTablet: true`, so the iOS build is a real
iPad app. Expo writes all four orientations into
`UISupportedInterfaceOrientations~ipad` and `UIRequiresFullScreen` is false, so
the app must work in portrait, in landscape, and in Split View / Slide Over
(widths down to about 320 pt). Apple's reviewers test iPad builds on an iPad.

Checked in the browser at iPad sizes: 1180×820 (iPad Air landscape) and
744×1133 (iPad mini portrait), over every stack screen, the five tabs, live
scoring for each demo sport and the shared links. Scanner: each screen loads in
a frame of that size and lists anything drawn past the edge outside a
scrolling row, plus any error screen.

## Points (listed before fixing)

| # | Break | Risk |
|---|-------|------|
| IP1 | Every screen stretches edge to edge: on a landscape iPad (1180 pt) cards, buttons and lines of text run 1,100+ pt wide — hard to read, "phone app blown up" look a reviewer can flag. | Review / quality |
| IP2 | A fix that narrows content must not narrow screens that need the width: standings tables, brackets, timetables, the support console's two columns, the usage dashboard, the TV overlay. | Regression |
| IP3 | Screens that size things from the *window* width (`useWindowDimensions`) would overflow if their content sat in a narrower column (golf leaderboard caps at `window − 34`, standings starts at `window − 64`). | Overflow |
| IP4 | Bottom sheets stretched across a landscape iPad. | Quality |
| IP5 | Split View at 320–507 pt must behave exactly like a phone (no column, no lost buttons). | Breakage |
| IP6 | Rotating mid-match must keep the score and the open tab (sizes come from hooks, not read once). | Data loss |
| IP7 | Opening live scoring from a URL without `sport` (`/LiveScoring?matchId=…`) shows "Something went wrong" (`useLiveMatch` reads the engine of an unknown sport). Not iPad-only; found by the scan. | Crash |
| IP8 | iPad keyboard (floating, split, hardware) covering a field. | Native only — needs the iPad simulator |
| IP9 | Share sheet on iPad is a popover and needs an anchor. React Native's `Share.share` anchors it to the screen; check once on the simulator. | Native only |
| IP10 | App Store Connect asks for 13-inch iPad screenshots when the build supports iPad. | Store listing |

## Findings and fixes

- IP1: fixed. Stack screens and the tab screens lay their content out in a
  centred column at most 840 pt wide (`src/core/readableWidth.ts`). The header
  and the tab bar stay full width, like other iPad apps. Phones and iPad
  portrait (744–834 pt) are untouched, because the cap is wider than they are.
  On a 13" iPad in portrait (1024) and in every landscape, the column shows.
- IP2: fixed. `FULL_WIDTH_SCREENS` (bracket, meet timetable, golf round,
  support console, usage dashboard) keeps the full width. A test fails if a
  name in the list stops being a real screen. Standings went into the column
  on purpose: at full width the numbers sat 1,000 pt from the team names.
- IP3: safe. The golf leaderboard caps itself at 760, which fits the 808 pt
  inside the column. Standings re-measures its own box with `onLayout`.
  Live scoring, Home and onboarding only compare the window against phone
  breakpoints (< 360, < 420).
- IP4: already fine. Every `Modal` sheet caps its own width (ConfirmSheet 560,
  QuickOptionsSheet 640, the others similar).
- IP5: fine. Key screens at 375 pt and 744 pt show no overflow.
- IP6: fine. Every size read is the `useWindowDimensions` hook, so it follows
  rotation. The keyboard reads the screen height on each keyboard event.
- IP7: logged, not fixed here. A URL like this is never produced by the app
  (every link to live scoring carries `sport`). It is a hand-typed edge case.
- IP8–IP9: wait for Xcode's iPad simulator (the founder is installing Xcode).
- IP10: added to `docs/launch/store-launch.md` (B4 and section D).

## Checks

- Tests: `tests/readable-width.test.mts` (8), `tests/header-fit.test.mts`
  updated for the new stack options.
- Scan before the fix: 95 screens at 1180×820 with no overflow and no error
  screens. The only errors were the live-scoring URLs without `sport`, which
  is IP7.
- Scan after the fix: 112 screens at 1180×820 (all stack screens, five tabs,
  live scoring for 10 demo matches across 7 sports, shared match and
  tournament links), plus 14 key screens at 744×1133 and at 375×1024. No
  overflow and no error screens.
- In place of the 500-user simulation: this change has no data path. It is one
  layout rule, so the screen scan above stands in for it.
