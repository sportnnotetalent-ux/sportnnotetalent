# Deep wave round 2 — invasion-goal family (football, handball, hockey)

The founder answered every open question in [invasion-goal.md](invasion-goal.md). This round builds those answers. The deep-wave rules still apply: scoring stays one tap, optional capture is off by default, old matches replay identically, no false zeros, career keys only when tracked, organiser options come with defaults, and stats go to player ids. No migration.

## Founder answers

| # | Question | Answer | Status |
|---|---|---|---|
| 1 | Football **big chance**: keep it? | Keep | unchanged |
| 2 | Location-based **xG**? | No | unchanged |
| 3 | **Goal ruled out** behind a toggle? | Yes (school matches have no VAR) | **built** (1) |
| 5 | Hockey **possession / referrals** on by default for FIH? | No, keep them off | unchanged |
| 6 | Handball **"EG" / empty-goal goals** wording; show the 7th-court-player time? | Keep the wording; show the time | **built** (2) |
| 7 | **MVP weights** for the new keys? | Yes | **built** (3) |

(Q4, the Summary tab's false 100–0 possession, was fixed at the merge.)

## 1. Football: "Goal ruled out" behind a toggle

- New deep toggle `ruledOut`, format key **`trackRuledOut`**. It is in the "Deeper stats (optional)" live-settings group as **Goals ruled out** ("offside, foul or VAR — the score never moves"). Organisers also get it as an advanced format option, "Track goals ruled out". It is off by default, so `init({})` still has no `deep` key.
- The 🚫 **Goal ruled out** button on the scoring pad appears only when the toggle is on (`deep.ruledOut`), like every other deep control.
- **A match that already logged one still shows it.** The reducer accepts `NO_GOAL` whatever the toggle says, so old logs replay identically. The commentary line, the edit list and the match-centre row all come from the logged events. `ruledOutTracked(s)` = the toggle is on, or any `nogoal` was logged.
- **Match-centre row** "Goals ruled out" (Attack): shown when tracked. With the toggle on and none logged, it reads a true **0 v 0**. With the toggle off and none logged, there is no row. Before this round the row showed only once a goal had been ruled out.
- Like clearances and set pieces, it is **not** listed in the "not tracked" note, because it is an occasional event.

## 2. Handball: minutes with an empty goal (7th-court-player time)

- **Wording kept:** "Empty-goal goals" / IHF "EG" (`emptyGoalGoals`) is unchanged.
- **New figure `emptyGoalMinutes`, "Minutes with an empty goal":**
  - It is derived from the existing log on the game clock. "Empty goal" opens a spell. A second tap while the goal is empty does nothing. "Keeper back" or setting a keeper closes the spell. A spell still open runs to now (or to the end of play).
  - Spells are read in log order, exactly as `goalEmpty` / `keeperAt` read them.
  - Only playing time counts (`playedWindows`). If a half was ended early, its unplayed tail is not counted, even when a spell was left open over the break.
  - When the clock wasn't run, a period's latest logged moment stretches its window.
- **Shown only when the empty goal was used and the clock measured it** (`emptyGoalTimed`). Used means either side tapped it. If the clock was never run, every moment is 0:00, so no minutes show rather than a false 0. Every older match is unchanged.
- **Stats panel:** match centre → Goalkeeping → "Minutes with an empty goal (7th court player)". The row shows for both sides once either side used it, so the side that never emptied its goal reads a true 0.0. It is per half too. The live figure ticks with the clock: `HandballBoxContext.now`, default `Date.now()`, like hockey's possession.
- **Careers:** the "Goalkeeping" section, `hideZero`. The key is **keyed** and **derived** (`DERIVED_KEYS`, SD-19 contract holds). Values are to one decimal (`decimal`, dp 1), because a pull is often under a minute. Careers sum it.
- **Per player — decision.** The log does **not** name the 7th court player: the "Empty goal ›" link is one tap with no player, and no substitution is logged. So a per-replacement-player figure isn't derivable. The per-player figure the log *does* support is the **keeper who was taken off**: `keeperAt` just before the tap. His line carries the minutes his goal stood empty. No other line gets the key, so there is no false 0. If no keeper was set, the team figure still shows but there is no career line.
- Matches since the deep wave that used the empty goal gain the key at their next stat sync (derived, like the keeper-by-position keys).
- **Follow-up (not built):** an optional "who came on as the 7th court player?" pick after "Empty goal". It would sit behind a toggle so the one-tap default stays. It would credit that player's minutes.

## 3. MVP / player-rating weights

The weights fit the existing scale: points per unit, summed over a player's lines (`matchRatings`, Player of the Tournament).

**Football** (goal 10, assist 6, tackle / interception / attacking or defensive play / block 1, shot on target 1.5, shot 0.5):

| Key | Weight | Why |
|---|---|---|
| `keyPasses` | **1** | The pass before a shot that wasn't a goal (the assist is its own key, so no double count). It is worth an attacking play or a tackle, a sixth of an assist. |
| `clearances` | **0.5** | Half a tackle or interception. A clearance relieves pressure but rarely wins the ball, and Opta-style ratings weigh it below both. Defenders log many of them. |

- Both keys are **appended after the golden weights**. Order breaks ties, so the original order is untouched.
- Both are now on the per-match **rating line** (`matchSummary`), for example "3 key passes". Without that, a player whose only figure was a key pass would have no rating line, and `matchRatings` drops such players.
- **Golden expectations updated deliberately** in `tests/stat-schema.test.mts`:
  - MVP weights: football = golden + `[keyPasses 1, clearances 0.5]`.
  - STAT_LABELS: golden + `key passes`, `clearances`.

**Handball, keeper saves by position** (goal 5, assist 3, save 1.5, steal / block 1.5):

- The position keys are a split of `saves`, so a full weight would count each save twice. Each position therefore gets a **bonus on top of the 1.5** (`SAVE_BONUS`).
- The bonus follows how often that attempt scores. IHF / EHF shooting %: 9 m ≈ 45 %, wing ≈ 60 %, 6 m / breakthrough / 7 m ≈ 70–75 %, fast break ≈ 80 %.
- A save is worth 1.5 × that rate ÷ the 9 m rate. The bonus is what that adds to 1.5, rounded to the half point.

| Save from | Bonus | A save is worth |
|---|---|---|
| 9 m | 0 (the baseline) | 1.5 |
| Wing | +0.5 | 2 |
| 6 m | +1 | 2.5 |
| Breakthrough | +1 | 2.5 |
| Fast break | +1 | 2.5 |
| 7 m (`sevenMSaves`) | +1 | 2.5 |

The 7 m key existed before the deep wave, unweighted. It is weighted now so that a penalty save isn't worth less than a 6 m save.

**Hockey (field):** no change. Its only new keeper figure is shoot-out saves (`soSaves`). Shoot-outs never count toward MVP: hockey's award text says so, and football's `shootoutSaves` / `penKicks*` are unweighted. Keeper shots faced by type isn't built (a follow-up). Handball's `soSaves` stays unweighted for the same reason.

## Figures that change on matches already played

No score or result changes.

- **Football:** players with key passes or clearances (matches that tracked them since the deep wave) gain rating points. A match's stars, MVP and Player of the Tournament can move.
- **Handball:** keepers gain the position bonus once their lines carry the keeper-by-position keys, at the next stat sync for older matches. Every 7 m save gains +1 now. A line not yet re-synced keeps its old points until it is.
- **Football:** a match that switches "Goals ruled out" on shows a 0 v 0 row until one is logged.

## Files

- `src/sports/football/engine.ts`: `DeepTrack.ruledOut`, `DEEP_TRACK_KEYS`, `DEEP_TRACKABLE`.
- `src/sports/football/depth.ts`: `ruledOutTracked`; the row only when tracked.
- `src/sports/football/index.tsx`: the button behind `deep.ruledOut`. This is the scoring pad only; no LiveExtras / liveViews change.
- `src/sports/football/stats.ts`: `keyPasses` 1, `clearances` 0.5, on the rating line.
- `src/sports/handball/depth.ts`: `emptyGoalSpells`, `playedWindows`, `emptyGoalSecs`, `emptyGoalTimed`, `egMinutes`, `emptyGoalKeeperMinutes`; the team figure; the derived keeper credit.
- `src/sports/handball/totals.ts`: `DERIVED_KEYS` + `emptyGoalMinutes`.
- `src/sports/handball/box.ts`: `now` in the context.
- `src/sports/handball/stats.ts`: `SAVE_BONUS` weights, `emptyGoalMinutes` def, Goalkeeping career row and centre row.
- Tests:
  - `tests/invasion-goal-round2.test.mts`: new, 21 tests.
  - Pinned lines updated (football only): `tests/football-deep.test.mts`, `tests/football.test.mts` (the Deeper-stats key list + `trackRuledOut`), `tests/stat-schema.test.mts` (golden MVP weights / labels).
