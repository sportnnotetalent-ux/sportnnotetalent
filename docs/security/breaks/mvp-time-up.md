# MVP PD2 / PB6: "Time up" ending, break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**No migration needed (corrects batch 5's note).** The server never lists result kinds for winners: `matches.winner` carries the outcome, the stat-line backfill falls through to it, `team_tie_ops` and `notify-followers` only single out no result / abandoned. A new kind with `matches.winner` set (home / away / draw) is counted like any finished match.

| # | Failure | Status |
|---|---|---|
| TU1 | **No "time up" ending.** A padel / pickleball game on a court booking stops mid-set. The only hand endings are Retired, Default, Draw, No result and Abandoned; none reads "won 6-4, 3-2 (time)". | **Fixed:** a "Time up" chip on the end sheet for every set / game racket sport (tennis, padel, badminton, pickleball, squash, table tennis). Reads "Asha won on time", scoreline "6-4, 3-2 (time)". Reason prefilled "Time up". Tests; demo-checked in padel. |
| TU2 | **The scorer picks the winner by hand.** With Default / Retired the scorer can give the match to the side that was behind. A time-up winner must be the leader. | **Fixed:** `timeUpLeader` (`src/core/timeUp.ts`) sets the winner from the score: sets (games), then every game (point) played. No pick. The sheet says why ("A leads on games, so wins on time"). Tests; 500 simulated stops. |
| TU3 | **A time-up win counted as a forfeit.** If it rode on Awarded, the table would use the federation walkover score instead of the real games, and the leg would count as "settled by a decider". | **Fixed:** its own kind `time_up`: no forfeit score (only awarded / conceded get one), not a decider leg; the table uses the real score. Test. |
| TU4 | **Level at time in a knockout.** A knockout needs a winner; "Time up" must not end a level knockout. | **Fixed:** a level knockout can't end on time ("Level — a knockout needs a winner, so play on"). Test. |
| TU5 | **Level at time in a league.** Must be a draw for the table, profiles (D) and the result line, not a loss for both or "no winner". | **Fixed:** level saves `matches.winner = 'draw'`: draw points in the table, D on profiles, "Level when time ran out — match drawn". Tests; simulation. |

## Follow-on breaks to check while fixing
- **Leader rule:** sets (games in badminton / pickleball / squash / TT) first, then all games (points) played; level on both = level. Never reads a live "40" / "Ad".
- **Saved results:** every older kind reads, scores and counts exactly as before.
- **Where it shows:** the result line ("Asha won on time"), the scoreline mark ("6-4, 3-2 (time)"), the end-sheet preview (who gets the points), profiles (W / L / D), standings with the real score.
- **Who sees it:** only set / game racket sports get the chip.

## Doubt for the founder
The tie-break after sets is **all games played** (4-6, 6-2, 3-1 → 13-9). Some clubs use only the set in play. Easy to make an organiser option if wanted.

## Results
Full suite 5,954 tests, 0 failing; tsc clean.
