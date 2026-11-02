# Invasion batch 1: break it (2026-11-02)

**Source:** the expert audit `docs/sport-expert/invasion.md`, ranked fixes 1, 2 and 3 (football and hockey).

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| B1 | **Football: a saved or missed penalty is no shot.** `finishPenalty` logs `penaltyMissed` (+ the keeper's save) but no shot, while a scored penalty counts as a shot on target. Shots, shots on target and conversion are skewed, and a saved penalty gives a save with no shot on target behind it. | **Fixed:** `penaltyMissActions` (football/actions.ts) logs the miss, the keeper's save (saved) and the attempt as a shot (saved = on target, missed = off), flagged `pen`; no taker = a team shot. `finishPenalty` uses it. Tests B1 in tests/invasion-batch1.test.mts; sim. |
| B2 | **Football: the grid's 🧤 Save logs no shot.** The save is credited to the keeper, but the other side gets no shot on target, so a match can show more saves than the other side's shots on target. | **Fixed:** `gridSaveActions`: the other side's shot on target, then the save. After the keeper, a "Who took the shot?" step with "Not sure — skip" (skipped when the other side lists nobody); a spoken save logs the team's shot. Tests B2; sim. |
| B3 | **Hockey: a saved / missed stroke is no shot.** A scored stroke credits `shots` + `shotsOnGoal`; a saved one only `strokesMissed` while the keeper gets a save. Saves can exceed the other side's shots on goal. Same for the voice "stroke saved" path. | **Fixed:** `strokeAction` (hockey/engine.ts) flags new strokes `shot`; `eventCredits` / `teamFigures` count them as shots (saved = on goal). Controls and voice both use it. An old STROKE (no flag) keeps its figures. Tests B3; sim. |
| B4 | **Football career keys:** crosses, dribbles, offsides, handballs, penalties won and penalties missed are credited live but are not in `trackedKeys()`, and their rows have no `opt()` / coverage, so `trackedIn()` reads them "not tracked" on any line that carries a `tracked` list. Suspected: the rows vanish from careers. To be confirmed by a test before any change. | **Not lost, no change.** Tests B4 show the six rows reach a career: their schema rows are plain sums with no `coverage`, and `careerSections` / `rankPlayers` count every line that carries the key; `trackedIn` only gates optional / keyed rows. `trackedKeys()` left as is. Side note (not fixed): a leader rail's "N of M games" note (`rankPlayers.trackedGames`) reads these six as untracked on lines with a tracked list (display only). |
| B5 | **Football: "Cards" off hides the Card button**, so a red card (a player sent off, the side a man down) cannot be recorded at all. | **Fixed:** the Card button always shows; `cardChoices(t.cards)`: Cards on = Yellow / Red, off = "🟥 Red card" (red only, team official too). Tests B5, incl. the red sending off with Cards off. |

## Follow-on breaks to check while fixing
- F1 **Old logs replay identically.** No reducer reads a new key on an old action; an old saved penalty / grid save / stroke keeps its figures (no new shot). New keys only on new taps. **Proved:** "old logs" tests; sim replays 300 old-style football and 300 old hockey logs with no new shot.
- F2 **Undo:** each new action is its own log entry, so Undo takes one step at a time and every prefix of the log is consistent (statTotals contract: live sums = replayed totals). **Proved:** sim undoes whole taps (rule holds on the prefix) and runs the statTotals contract on every 5th prefix.
- F3 **Shoot-outs unaffected:** shoot-out kicks (`PEN` / hockey shoot-out) stay apart from match shots and saves. **Proved:** no PEN / SO code touched; the existing football and hockey shoot-out tests pass.
- F4 **Stat keys:** the penalty's shot credits `shots` (+ `shotsOnTarget` when saved) to the taker on the line and in statTotals; a missed penalty is off target; no shot is credited to anybody when the taker is unknown (team shot). **Proved:** B1 / B3 credit tests; statTotals contract in the sim.
- F5 **Commentary:** a saved penalty still reads as one line ("Penalty saved! … saved by …"), not an extra "Attempt saved" line; a grid save reads as one line ("Attempt saved … saved by GK"). **Proved:** B1 / B2 commentary tests (the `pen` shot folds into its penalty row).
- F6 **Editing a grid save** re-logs only the save (the shot it came with stays), so an edit never doubles the shot. **Proved:** `gridSaveActions(…, { edit: true })` test; the controls pass `edit` while re-entering.
- F7 **Red card with Cards off** still triggers the sending off (side a man down) and the red-card credit; yellows stay hidden when Cards is off. **Proved:** B5 tests.
- F8 **Hockey removal / edit** of a new stroke reverses exactly what it credited (its own `shot` flag rides on the event). **Proved:** removal uses `eventCredits(e)` with the flag; statTotals contract in the sim.

## Results
Simulation: tests/sim-invasion-batch1.test.mts, 600 football + 600 hockey random matches (over 10,000 football taps): a side's saves never exceed the other side's shots on target that didn't go in, after every tap.

Run: football*, hockey*, invasion-batch1, sim-invasion-batch1 and the 39 other tests that import these plugins or voiceParsers: 847 tests, 0 failing; `npx tsc --noEmit -p .` clean. Not checked in the running app.
