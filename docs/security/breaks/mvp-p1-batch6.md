# MVP P1s, batch 6: break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**Left for its own batch:** B6/T9 (change the format of a live match). It replays the whole log under a new format, so it needs its own break-it list.

| # | Failure | Status |
|---|---|---|
| T3a | **Tennis / padel doubles: a wrong serving-order pick can't be fixed once the set has started.** `withServeOrder` accepts a pick only before the set's first point; a `v:2` fix is ignored. | **Fixed:** a `v:2` pick fixes the order any time before the match ends; the picker shows "✎ Fix serving order — set N" once a pair has served. The score never moves. Older logs (no `v:2`) replay as before. Tests; 500 simulated sets. |
| T3b | **Aces and double faults stay on the wrong partner.** Each ace / double fault stores the server's id when it's tapped, so even a fixed order would leave every earlier ace / double fault of that set on the wrong player. | **Fixed:** the fix names the pair, so that set's aces (and service winners) and double faults by it move to the partner; rally points stay with their hitter; fixing back restores every event. Tests; 500 simulated sets. |
| T3c | **The receiving pair must choose before game 1.** It doesn't serve until game 2, but the picker closes at the set's first point, so its pick is a guess or the roster order. | **Fixed:** `serveOrderOpenFor`: the receiving pair can pick until game 2 starts. Tests. |
| K3 | **Kabaddi: every raid needs the full form, and "Record raid" sits below the fold on a phone.** Raider chips, 0–7 touches, line-outs, three toggles, tackler, tackle type, preview, then the button. A raid comes every ~30 seconds; the common ones (empty, 1 touch, bonus, raider out) need no extra detail. | **Fixed:** a one-tap row at the top of the raid panel (Empty · +1 touch · Bonus · Raider out), new raids only; it records exactly what the full form records for the same answers (a picked raider is credited); Bonus shows only when it would count. Not done: moving the full form's Record button (the one-tap row covers the common raids). Tests; 500 simulated halves; demo-checked. |

## Follow-on breaks to check while fixing
- **Fix:** the score never moves; only the serve rotation and the serve credits of that set change; other sets and the other pair stay as they are; a fix to the same order changes nothing; a finished match can't be changed.
- **Credits:** only aces and double faults move (to the partner); a rally point's credit (the hitter) never does.
- **Saved matches:** older logs (no `v:2` fix) replay exactly as before.
- **Quick raid:** records exactly what the full form would for the same answers (same actions, same do-or-die, all-out and bonus rules); a picked raider is still credited; editing an old raid still opens the full form; a bonus that wouldn't count (under 6 defenders) isn't offered.

## Not shown in the demo
The serving-order fix needs named doubles pairs; covered by tests and the simulation.

## Results
Full suite 5,974 tests, 0 failing; tsc clean.
