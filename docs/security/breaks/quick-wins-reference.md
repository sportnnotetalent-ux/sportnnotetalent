# Break it: reference-video quick wins + silent launch animation

2026-11-06. The founder approved the "quick wins" batch and the silent launch
animation from `docs/design/reference-video/README.md`:
- B1 lime only when asked;
- B2 one title per screen;
- B5 empty states with a next step;
- B8 icon rules;
- C1 your teams first;
- C2 empty tabs say what to do;
- C4 two clear endings;
- A1 the silent launch animation.

Points listed before fixing.

| # | Item | Break | Risk |
|---|---|---|---|
| QW1 | B1 | Flipping the button default to outline also flips the sports scoring pads (Goal, Try, +1…), which are deliberately strong. Scorers lose the big targets mid-match. | Scoring |
| QW2 | B1 | A screen loses its only lime, so the main action no longer stands out (the opposite of the goal). | UX |
| QW3 | B1 | A later change brings lime back everywhere silently. | Regression |
| QW4 | B2 | Hiding the big title also hides it where there is no header (tab screens, the Auth screen, modals with `headerShown: false`), leaving a screen with no title. | UX / a11y |
| QW5 | B2 | The subtitle disappears with the title. It often carries the only instruction ("Pick sport, teams & time"). | UX |
| QW6 | B5 | Adding actions to `EmptyState` breaks its 43 existing callers (props renamed or required). | Regression |
| QW7 | B5 | An empty-state action shown to someone who can't do it (a viewer sees "Make fixtures"), which leads to a permission error. | Permission |
| QW8 | C1 | "Your teams" leaks other people's teams. It must list only teams I'm on or played against in my own matches, for this sport. | Privacy |
| QW9 | C1 | Suggestions from another sport, or quick-game placeholders ("Team A"), appear. Or the same team appears in both sides' lists, so you could pick it against itself. | Data |
| QW10 | C1 | A detail line names a captain or shows a child's name. | Under-18 privacy |
| QW11 | C1 | Thousands of matches make the picker slow (it runs on each render). | Perf |
| QW12 | C4 | "Start now" with a future kickoff time still files the match for later, or "Save for later" with kickoff = now jumps into scoring. The two buttons must do what they say whatever the time field holds. | Logic |
| QW13 | C4 | Tournament matches (not friendlies) get the friendly buttons. | Scope |
| QW14 | C2 | The empty Matches tab offers "Make fixtures" on the Completed tab, or to viewers. | UX / Permission |
| QW15 | A1 | The animation delays the app: the user waits for the art when the app is ready, or it plays its full length every launch. | Speed |
| QW16 | A1 | It never ends (a timer is lost, or the app stays hidden behind it). That is the "endless spinner" the founder banned. | Breakage |
| QW17 | A1 | It ignores the OS reduced-motion setting. | a11y |
| QW18 | A1 | It plays on the OBS overlay (`/o/…`) or a shared live-link page, where a viewer opens a score and should see it at once. | UX |
| QW19 | A1 | A storage failure (private mode, blocked storage) throws, or replays the full version forever. | Robustness |
| QW20 | B8 | Emoji used as UI icons in buttons; icons at random stroke and size. | Consistency |

## Fixes and checks

- **QW1:** all 121 buttons in `src/sports/**` now name their variant, so the scoring pads look exactly as before. A test fails if any of them loses it.
- **QW2/QW3:** `Button` defaults to the outline style. Lime is set explicitly on:
  - each form's bottom-bar main action (30);
  - 62 chosen main actions (sign-in steps, Start / Save / Publish, scoring "next" steps);
  - the 8 results-sport "Set up the event" buttons.
  Consent buttons ("Allow analytics") stay neutral on purpose. A test caps written lime buttons at 3 per screen file, with one named exception: match setup, whose set-up buttons show one at a time.
- **QW4/QW5:** `ScreenTitle` reads React Navigation's `HeaderShownContext`. Under a visible header only the subtitle shows; tab and header-less screens keep the big title. `@react-navigation/elements` is now declared at exactly 2.9.23, the copy the navigators use. A newer copy would mean a second context that never matches.
- **QW6:** `EmptyState` keeps every old prop; `action` and `secondaryAction` are optional.
- **QW7/QW14:** the empty-tab actions are only for people who can manage the tournament, and only on Upcoming.
- **QW8–QW11:** `core/teamSuggestions`.
  - "Your teams" = on the roster. "Played before" = teams from matches I played in, hosted or scored, newest first.
  - Same sport only, never the other side's pick, at most 6, detail = player count only.
  - Falls back to the team name when a match carries its own copy of a team under another id.
  - 600-user simulation checks each suggestion came from that user's own games.
- **QW12/QW13:** `core/matchEnding`. "Start now" = kick-off now plus scoring; "Save for later" = the chosen time, no scoring. Friendlies only; clones and tournament matches keep their single button.
- **QW15:** the first build drove the animation from the JS thread, and in the web demo it ran about 5× slow while the app loaded. It now uses one timeline (`launchTracks`):
  - on phones, one native-driven value;
  - on the web, CSS keyframes from prebuilt stylesheets (react-native-web builds keyframes only from `StyleSheet.create`, and only from CSS transform text).
  Checked on the web, frozen at 0 / 0.3 / 0.8 / 1.3 / 1.78 s: the mark centred → dots tick → slide and wordmark → line drawn → fade. It's gone at 1.91 s.
- **QW16:** a hard stop at 4.5 s, and `pointerEvents="none"`.
- **QW17:** reduced motion gets a 0.25 s fade.
- **QW18:** the TV overlay and any shared-link path on the web are skipped.
- **QW19:** an unknown "seen" plays the short version.
- **Found in the demo check:** the wordmark is 183 px in Barlow, but about 228 px in the platform font, which would have clipped it. The animation now waits up to 1 s for the font (the app waits for it anyway), and otherwise uses a 36 px size that fits.
- **QW20:** one `ICON_STROKE = 1.75` for every converted icon.

**Tests:** `tests/quick-wins-reference.test.mts` (25), `tests/sim-team-suggestions.test.mts` (600 users). `tests/football-single-period.test.mts` was updated for the explicit variant. Full suite: 7,556 pass, 0 fail; tsc clean.

**Not covered here:** how it looks on a real phone (native-driven values); that needs the next APK or simulator check. The voice (A2) and the native splash (A3) wait for the next app build.
