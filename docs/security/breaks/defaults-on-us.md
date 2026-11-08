# US sports: stats to track on by default (new matches): break it first (2026-11-08)

Wave 3 of `docs/sport-expert/defaults-on/PLAN.md` for basketball, American football and baseball / softball, following `docs/sport-expert/defaults-on/us-sports.md` (US-DON-1, 2, 4, 6, 7). Wave 1 made "tracked = captured" (`no-false-zeros-us.md`); wave 2 made the follow-ups non-blocking cards (`describe-us.md`).

**What turns on (new matches only):**
- Basketball: `trackFastBreak`, `trackFoulsDrawn` (misses and shot zones were already on).
- American football: `trackTargets`, `trackDefence`. `trackTackles` stays OFF (US-DON-6).
- Baseball: `sprayZones`, `battedBallTypes`. `pitchTypes` stays OFF. `askFielders` stays on and moves to "Stats to track".

**Status: Fixed / Holds** (2026-11-08). Listed after reading the code and **before** any change (quality mandate step 4). Each fix has a failing test first in `tests/defaults-on-us.test.mts` (14 of 27 failed before the fix); the 600-user simulation is in the same file.

## How each sport decides what's tracked

- **Basketball:** one const `BB_TRACK_DEFAULTS` (meta.ts) feeds the format fields and the live settings' `defaults`. `init` sets a key only when the stored config carries it.
- **American football:** the defaults were written in three places: the format fields (`TRACK_FIELDS` + `trackTackles` in meta.ts), the live settings `defaults` and `defaultsFor` (engine.ts). `init`: `bool(config?.k, false)`.
- **Baseball:** two places: the format fields (meta.ts) and the live settings `defaults` (engine.ts, the track flags hard-coded `false`). `init`: `bool(config?.k, false)`.

## Breaks

| # | Break | Status |
|---|---|---|
| DOU1 | **An old match changes.** If a default change reached `init` / replay, every old match without the key would replay with prompts on and new columns. | **Holds:** only the new-match defaults change; every `init` fallback stays OFF (a missing key reads off). Tested: a stored config without the keys reads off in all three sports; the sim replays old-format games and compares every output. |
| DOU2 | **Reset turns options off (duplicated-defaults drift).** AF keeps its defaults in three places and baseball in two. Flipping only the format leaves the live "Standard" (`defaults` / `defaultsFor`) at OFF, so "Reset to standard" on a new match switches the new stats off, and the card shows "2 custom" on a brand-new match. | **Fixed:** one const per sport (`AF_TRACK_DEFAULTS`, `BASEBALL_TRACK_DEFAULTS`, `BB_TRACK_DEFAULTS`) in meta.ts; the format fields, the live fields, `defaults` and `defaultsFor` all read it. Tested: for every preset, the standard equals the new-match format and `customCount` is 0. |
| DOU3 | **The Info card shows ON while the engine has OFF.** `matchCaptures` reads `ls.read(state)[key] ?? field.default`; if `read` left a key out, an old match would show the new default (ON) for a stat it never captured. | **Holds:** every `read` returns each toggle as a boolean from the state (`=== true`). Tested: an old match's Info shows Off for every newly-on stat; a new match shows On. |
| DOU4 | **"N changed" on the settings card.** A new match must read 0 custom; an old match reads its count against the new standard. And `customCount` (shared by every sport) also counts toggles hidden by `hideWhen`: every old AF flag game (Scores only, the default) would read "2 custom" over switches nobody can see. | **Fixed:** a new match reads 0 (DOU2). AF `defaultsFor`: in Scores only the hidden stats switches are their own standard (they do nothing there), so an old flag game still reads Standard; play by play, the standard is `AF_TRACK_DEFAULTS`. An old play-by-play game (and an old baseball game) shows "N custom" against the new standard (accepted, as carrom DC4 and tennis: it is the truth about that match). Tested; pinned tests that built a "new" game without the stats keys now build it as a new match is stored (`// defaults-on DOU4`). |
| DOU5 | **False zeros.** With the defaults on, a scorer who taps only the score gets "Fast-break points 0", "Fouls drawn 0", PD / TFL / TGT 0, or batted-ball 0 for everyone. | **Holds (wave 1):** a column or career key needs at least one capture. The 600-user sim scores new games with the new defaults and random skipping and checks every key. |
| DOU6 | **One-tap scoring blocked.** A newly-on stat must never stand between the scorer and the next play. | **Holds (wave 2):** a basket, a foul, an incompletion and a baseball out are each one action that lands on the score / log at once with the defaults on; the detail is a later, optional action. Baseball's spray / batted chips are optional pre-play pickers (`needsSheet` does not read them). Tested (engine + source guards; sim). |
| DOU7 | **Voice.** Voice plays carry no capture flags; with the defaults on, a voice-scored game must still score in one call and show no zeros. | **Holds:** voice actions are unchanged one-shot actions; the sim includes voice-only games (no ⚡, no fouled-by, no target) and checks no capture keys appear. Tested. |
| DOU8 | **The stats that must stay off turn on.** AF tackles block every scrimmage play (US-DON-6); baseball pitch types need expertise (PLAN "Stays OFF"). | **Holds:** `trackTackles` and `pitchTypes` stay OFF in the const, the format and the live standard. Tested. |
| DOU9 | **A stats toggle outside "Stats to track".** The tournament "Use the new defaults" button and the Info chain find the stats by `group: 'Stats to track'`. AF `trackTackles` (format) had no group; baseball `askFielders` sat in "Detail" (live) and nowhere (format); basketball `trackMisses` (format) had no group. | **Fixed:** all of them carry `group: 'Stats to track'` in the format and the live settings. Tested: every stats toggle of the three sports, both lists. |
| DOU10 | **AF Scores only.** The default preset (flag) is Scores only; turning the track flags on there must not add prompts or keys. | **Holds:** the switches are hidden in Scores only and the engine acts on them only in play by play; no capture without a play. Tested in the sim (flag games). |
| DOU11 | **A tournament seeds a different value.** `formatDefaults(fields, 'tournament')` must give the same stats defaults as a friendly. | **Holds:** none of the stats fields has a `tournamentDefault`. Tested. |

## Tests
- `tests/defaults-on-us.test.mts` (28 tests): DOU1–DOU11 plus the 600-user simulation (200 games per sport, every preset: new defaults with random skipping and voice-only games; every play lands on its tap; no key for a kind with zero captures; old-format games replay exactly as with the keys stored off).
- Pinned defaults updated on purpose, marked `// defaults-on DOUx`: `baseball-deep` (TRACK_FIELDS defaults, live `sprayZones`), `baseball-round2` (`battedBallTypes`), `basketball-deep` (test title only; the source regex still holds), `court-team-round2` and `defaults-court` (`BB_TRACK_DEFAULTS`), `us-sports-batch5`, `sim-us-sports-batch5`, `sim-us-sports-batch6` (a "fresh" AF play-by-play game now carries the stats keys, as a new match's format does).
- Full suite: no failure in these sports or the cross-sport tests; `tsc --noEmit` clean.

## Not verified
- Not checked in the demo preview (defaults and a settings standard; no scorer UI code changed).
