# MVP P1s, batch 3: break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| B2 | **Basketball has no running clock.** The stoppable clock stops itself on every foul, time-out and late basket, then waits for a Start tap. A scorer working alone forgets, so the clock sits still (a 3×3 game's 10 minutes never run out). Turning the clock off loses the countdown and the 0:00 prompt. | **Fixed:** a "Clock stops on" choice: **Time-outs only** (running clock, the friendly default) or **Every whistle** (the tournament default). Saved matches run as before. Tests; 500 + 500 simulated games; in the demo a team foul left the clock running. Website guide updated. |
| B4 | **Basketball's score pads jump after every basket:** the "Assist?" box opens above both pads and closes at the next play, so a quick second tap lands on the wrong button or team. | **Fixed:** the Assist box sits below both pads. Test. |
| B8 | **A team basket can't be given a scorer later.** Edit is offered only for plays that name a player, so the only fix is delete and backfill, losing the clock second and the order. | **Fixed:** Edit is offered on a team basket; the re-entry keeps its clock second. Test. |
| F7 | **Football: rolling subs can't be logged without a lineup.** With no lineup the whole squad counts as on the pitch, so "Player ON (from the bench)" is empty. | **Fixed:** with no lineup, everyone in the squad except the player going off (`benchFor`). Tests; 500 simulated squads. |
| F8 (part) | **Football: Goal sits below the fold,** under the voice bar, the possession bar and the Stoppage button. | **Fixed (order only):** Goal comes first, above voice, possession and Stoppage. Test; seen in the demo. |
| F6 / B9 | **Adding a friend mid-match needs their mobile number.** The Scoring tab's "Add / invite a player" takes new people by number only. | **Fixed:** for a typed name not on SportnNote, "“Ravi” without a number" adds a name-only player to that side's squad; nothing is sent. Tests; in the demo the name was then a scorer choice. |

## Follow-on breaks to check while fixing
- **Running clock, saved matches:** a match saved with the stoppable clock (no new key) must replay and run exactly as before. Tournaments keep the stoppable clock by default.
- **Running clock, time-outs:** a time-out still stops it; the end of a period still holds it at 0:00 (the overtime guard from earlier today still applies).
- **Running clock, Set clock / Start / Stop:** the scorer can still stop and set it by hand.
- **Team basket edit:** keeps its points, zone and clock second; the score doesn't change; the scorer's stats gain the basket.
- **Subs with no lineup:** the player going off is not offered as coming on; a player sent off is never offered; fixed subs still exclude withdrawn players.
- **Name-only player:** goes on the chosen side's squad only; no message is sent; a blank or 1-letter name isn't accepted; they can be claimed later like other name-only players.

## Found during the demo check: a batch 2 bug, now fixed
The batch 2 side names (live since 2026-10-31) treated a sport with **no `participantKind`** as an individual sport, but an omitted kind means a team sport (`types.ts`). So in football, basketball, cricket, kabaddi, volleyball, hockey and the other team sports, a side with only 1–2 players listed showed a player's name on its buttons and board instead of the team name (seen here: "Goal — Zubin Test"). Fixed: an omitted kind counts as a team; test added. It goes live with this batch's publish.

## Results
Full suite 5,889 tests, 0 failing; tsc clean. Simulation: 500 running-clock and 500 stoppable-clock games, 500 squads, 1,000 typed entries. Demo: Goal first, a name-only friend added and offered as scorer, a running clock through a team foul.

## Still to decide (founder)
- **F8 "Quick" default for football friendlies:** track only goals, assists, cards and subs by default, everything else opt-in, possession off. This would change the 2026-10-22 "deep stats" defaults, so it waits for a decision.
