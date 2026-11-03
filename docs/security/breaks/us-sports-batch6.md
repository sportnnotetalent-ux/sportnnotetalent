# US sports batch 6: P2 depth — basketball jump ball / arrow, coach & bench technicals, NBA bonus; baseball dropped third strike, catcher's interference, triple play, pitch types; American football returns, blocked kicks, onside, fumbles kept, penalty on a play: break it (2026-11-03)

From the expert audit `docs/sport-expert/us-sports.md` (P2 items 16 and 18; item 17 was done in batch 5) and the "Not done" rows of `us-sports-batch5.md`: NBA last-2-minutes bonus (BK8), baseball fix 7 (BS13), American football fixes 8 and 9 (AF6), flag school "2 custom" (AF5 limit), softball DP / FLEX (SB1).

**Founder chain rule:** every capture option visible in Info → offered in Scoring → shown in Stats and Commentary.
**Hard rules:** old match logs replay identically; new payload keys and actions are additive; hostile values are ignored; one scorer on one phone, so every new tap is optional.

**Status: Fixed / Holds / Not done** (2026-11-03). Listed after reading the code and **before** any fix (quality mandate step 4). Each fix then got a failing test first (`tests/us-sports-batch6.test.mts`, 38 tests, written first: the file failed before the fix — the builders, keys and outcomes did not exist) and the seeded simulation (`tests/sim-us-sports-batch6.test.mts`: 600 basketball games, 600 baseball games, 600 American football play-by-play games, every AF preset).

**Old logs replay identically — proof:** besides the tests and the simulation, a one-off oracle replayed 800 random old-format logs per sport through the code at HEAD (before this batch) and through this batch: the same state JSON, statTotals, commentary, Stats panel / sheet and drives in every game, and the same bonus answer (basketball, at any clock second); American football team figures equal apart from the six new figures (all 0 on an old log).

## Basketball

| # | Break | Status |
|---|---|---|
| BK15 | **NBA last-2-minutes bonus missing.** NBA Rule 12B V: one free team foul in the last 2:00 of a period, the 2nd is in the penalty; overtime quota 3. | **Fixed:** format key `nbaBonus` (NBA preset true; only on the state when stored, so every older match counts as before). `inBonus(s, side, sec?)` reads the clock second (the game clock's now by default); overtime quota = `foulsForBonus − 1`. The free-throw prompt and the commentary's "team foul n, free throws" follow it. Without the game clock the late rule can't apply (no clock second). Tests BK15; sim. |
| BK16 | **No jump ball / held ball / possession arrow.** | **Fixed:** `JUMP_BALL` (`jumpBallAction(side, held)`), event `jump`. Format key `possArrow` (FIBA / NCAA / school presets on; NBA / 3×3 / 2v2 / 1v1 off). `arrowSide(s)`: the team not winning the opening tip, flipped by every arrow possession and every later period start. Under the arrow a held ball is one tap ("Held ball → Reds") and the reducer gives it to the arrow's team; without it the scorer taps the jump's winner. Commentary "Jump ball — Blues win the tip", "Held ball — Reds' ball (alternating possession; arrow → Blues)", "Held ball — jump ball won by Reds"; Stats row "Jump balls / held balls (ball)" once logged; Info shows the rule (format field). Tests BK16; sim. |
| BK17 | **Hostile jump-ball payloads.** | **Holds (guarded):** under the arrow the payload side of a held ball is ignored; a 2nd opening tip is dropped; a non-side is dropped; a finished game takes none. Tests BK17; sim (hostile sides in every game). |
| BK18 | **Coach (C) / bench (B) technicals.** | **Fixed:** `foulAction(side, null, 'technical', { bench: 'C' \| 'B' })` — chips "Coach tech (C)" / "Bench tech (B)" in the team-foul panel, 1 free throw opens. Not a team foul (`countsAsTeamFoul`), not a personal foul in the panel; `coachTechnicals`, `coachDisqualified` ('2C', or '3B' = 3 with a bench one — FIBA 2024 Art. 36.3.3), shown on the pad and in the commentary ("Coach technical (C) — Reds · 1 free throw · coach disqualified (2 coach technicals)"); Stats row "Coach / bench technicals" once logged. Tests BK18; sim. |
| BK19 | **Hostile bench payloads.** | **Holds (guarded):** `bench` only `C` / `B`, only on a technical with no player; anything else reads as the plain foul. An older team technical (no `bench`) keeps its team-foul count. Tests BK19; sim. |
| BK20 | **Chain** (Info rule, Stats row, commentary). | **Fixed** (above): both rules are format fields (Info lists them), the rows show once something was logged (never a false row). |
| BK21 | **Old logs replay identically.** | **Holds:** oracle (800 logs) + sim (a format without the keys keeps the old state shape; jump balls and bench techs credit nobody — statTotals equal without them). |

## Baseball / softball

| # | Break | Status |
|---|---|---|
| BS14 | **Pitch types shown with pitch-by-pitch off.** | **Fixed:** `hideWhen: { key: 'pitches', value: false }` on the toggle (format editor and ⚙️ Scoring settings). The other half of audit #18 (the "Stats to track" keys out of Edit format) was already done by info-chain IC3 (`liveOwnedKeys`). Tests BS14. |
| BS15 | **Dropped third strike.** | **Fixed:** a K with `d3: 'WP' \| 'PB' \| 'E'` (More → "Dropped third strike — strikeout, batter reaches on: Wild pitch · Passed ball · Error", one tap instead of strike three; with runners on, the runner sheet opens with the batter on first). The batter's K and AB, the pitcher's K (no out); WP to the pitcher, PB to the catcher (derived figures); E = a team error and the runner unearned; PB / E runs unearned; no RBI by default. Commentary "… strikes out swinging but reaches first on a wild pitch (dropped third strike)". Allowed only with first base open or two out (UI). Tests BS15; sim. |
| BS16 | **Catcher's interference.** | **Fixed:** outcome `CI` (More → "Catcher's interference", one tap; runners forced up): PA, no AB, E2 on the play (the catcher's fielding error), a team error, the runner and runs on the play unearned. Commentary "… reaches on catcher's interference (E2)." Tests BS16; sim. |
| BS17 | **Triple play.** | **Fixed:** outcome `TP` ("Triple play" in the out row, enabled with no outs and two runners on): the batter and the two lead (forced) runners out by default, the half ends, AB, no GIDP, no RBI, a fielded out (fielders chips). Tests BS17; sim. |
| BS18 | **Hostile payloads.** | **Holds (guarded):** `d3` kept only on a K whose batter reached, with a known value; CI / TP only change what their moves say. Tests BS18; sim (hostile d3 on random plays). |
| BS19 | **Old logs replay identically; outcome tables cover the new outcomes.** | **Holds:** oracle (800 logs); `OUTCOME_LABEL` and the commentary / icons cover CI and TP (tsc checks the `Record<Outcome, …>` tables). |

## American football

| # | Break | Status |
|---|---|---|
| AF7 | **Flag school reads "2 custom".** | **Fixed:** `defaultsFor` treats a flag game of 15-minute halves as the school preset (1 timeout per half). Limit: a 15-minute IFAF game with 2 timeouts reads "1 custom". Tests AF7; sim (every preset reads Standard). |
| AF8 | **Returns and the returner.** | **Fixed:** kickoff returner (`p1`) + return yards; punt returner (`p2`, the other side) + yards; interception return yards to the defender — each optional, tapped before the spot (one tap when unused). Keys `kickRet`, `kickRetYds`, `puntRet`, `puntRetYds`, `intRetYds` (keyed: on a line once the match recorded one), on the schema; Stats sheet rows "Kickoff returns – yards", "Interception return yards"; commentary "Kickoff — returned 27 yds by X …", "… returned 8 yds by X". Tests AF8; sim. |
| AF9 | **Fumble kept by the offence; forced fumble.** | **Fixed:** Fumble → "🔁 Lions kept it" → recoverer (optional) → net yards: no turnover, the down advances; fumbler `fumKept`, recoverer `fumRec`. `FORCED_FUMBLE` (optional prompt after a fumble with defensive detail on) → `forcedFum`, joined to the fumble line ("Forced by X."). Tests AF9; sim. |
| AF10 | **Blocked punt / field goal.** | **Fixed:** "Blocked" on the punt-distance and field-goal steps, then the blocker (optional): `kicksBlocked` to the blocker, the punter keeps the punt (0 yds), the defence's ball at the line; Stats row "Kicks blocked"; commentary "… blocked by X". A made field goal can't be blocked. Tests AF10; sim. |
| AF11 | **Onside kick.** | **Fixed:** "Onside · kickers recover" / "Onside · receivers recover" on the kickoff panel (one tap; the ball at the kickers' own 45 / the receivers' 55 — 📍 Set to adjust). Stats row "Onside kicks recovered"; commentary "Onside kick — recovered by Lions". Tests AF11; sim. |
| AF12 | **Penalty on a play.** | **Fixed:** "Flag on the play" toggle on the drive panel → the next scrimmage play (run / pass / incomplete / sack / kneel) asks the foul, the penalised player (optional) and how it was settled: accepted from the previous spot (the play doesn't count — no credits, no yards, `nul`), accepted from where the play ended (it counts), declined, offsetting (down replayed). Team penalties count the accepted ones; commentary "… Penalty: Holding (offence) on Lions (Rao), 10 yds — accepted — play nullified." Limit: the penalised player is in the log and the commentary, not on a stat line (an action carries two credits). Tests AF12; sim. |
| AF13 | **Hostile payloads.** | **Holds (guarded):** `penIn` drops a malformed penalty (unknown settlement, a side that isn't one, non-number yards; foul text ≤ 60 chars, yards ≤ 99); `blocked` only on a punt / a missed FG, `onside` only on a kickoff, `kept` only on a fumble / an onside kick; kickoff / interception return yards clamped; a wiped-out play credits nobody even if the action carries credits (statTotals is the log's). Tests AF13; sim (hostile penalties in every game). |
| AF14 | **Old logs; keyed figures; live credit = statTotals.** | **Holds:** oracle (800 logs; a punt's `ret` reads exactly as before); sim (live credits = statTotals on 600 games). |

## Softball

| # | Break | Status |
|---|---|---|
| SB2 | DP / FLEX and the once-only starter re-entry (audit fix 15). | **Not done — re-sized L on reading:** it needs a 10th, non-batting FLEX slot through LINEUP, derive, the box and the sheets, the four DP / FLEX swaps, and a re-entry rule on subs — the engine today accepts any sub, so enforcing re-entry is a new validation that must stay off for every older softball match. Left for a dedicated batch. |

## Pinned tests updated
- None. (`tests/basketball-deep.test.mts` pins `const drawn = … ; fire(foulAction(side, fouler, type, drawn))` — kept as is; the coach / bench technical takes its own early branch in `recordFoul`.)

## Files touched outside the sport folders
- None (`src/screens/LiveScoringScreen.tsx` and `src/sports/types.ts` untouched).
