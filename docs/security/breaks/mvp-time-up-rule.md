# MVP: "Time up" tiebreak as an organiser option, break it (2026-10-31)

**Founder's choice (2026-10-31):** when a racket match stops on time with the sets (games) level, the organiser chooses the tiebreak: all games (points) played, or only the set (game) in play. Default: all games played (as shipped).

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| TR1 | **One fixed rule.** `timeUpLeader` always counts every game played; clubs that decide on the set in play get the wrong winner (6-0, 4-6, 1-3 → home on all games, away on the set in play). | **Fixed:** `timeUpLeader(ls, rule)`: `games` (default, unchanged) or `set` (only the set / game in play; none started = level). Tests; 500 simulated stops under both rules. |
| TR2 | **The rule must be the organiser's**, set with the format (tournament or friendly), not picked by the scorer at the end. | **Fixed:** a format option "Time up, sets (games) level" (`timeUpRule`, advanced, default all games) in tennis, padel, badminton, pickleball, squash and table tennis; the end sheet reads it from the match's format. Tests; demo-checked (badminton, under Custom). |
| TR3 | **The sheet must say which rule decided it** ("leads on games in the set in play"), so the scorer can see why. | **Fixed:** the sheet says "leads on games in the set in play" (or "on games" / "on sets"). Test. |

## Follow-on breaks to check while fixing
- **Default unchanged:** a match with no rule saved behaves exactly as now (all games played).
- **Sets first** under both rules; level under the chosen rule is still a draw (or "play on" in a knockout).
- **The set in play with none started** (time ran out right after a set): level on that set → level.
- **Every racket sport** with "Time up" gets the option: tennis, padel, badminton, pickleball, squash, table tennis; it sits under Customize (advanced).

## Found while simulating
The simulations' random generator returned `seed % k`; that generator's lowest bit just alternates, so every "random" point went home, away, home, away. All 12 simulation files written for the MVP batches used it: their scenarios were narrower than they claimed (for example, few sets ever finished). Each now uses the generator's high bits, and all 12 still pass.

## Results
Full suite 6,038 tests, 0 failing; tsc clean.
