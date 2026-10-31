# MVP P1s, batch 2: break it (2026-10-31)

**Process:** quality mandate step 4. These points were listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| F1 | **Football: Undo doesn't say what it removes.** The bar reads only "Undo · rewind step-by-step". A goal with an assist, a saved shot, a second yellow and kick-off each log more than one step, so the scorer can't tell how many taps undo one goal. | **Fixed:** `football/undoLabel.ts` — "goal · Ravi (2-1)", "assist · Ajay", "shot on target · Ravi", "yellow card · Ravi", "kick-off". Tests; seen in the demo ("↶ Undo: goal (1-0)"). |
| B5u | **Basketball: Undo doesn't say what it removes** (as F1). An and-one, a bonus foul's free throws and a disqualifying foul each log several steps. | **Fixed:** `basketball/undoLabel.ts` — "+3 · Arjun (54-50)", "free throw made", "shooting foul · Rahul", "team foul (personal)". Tests; seen in the demo. |
| F2 | **Football: an assist picked after an Undo rewrites an earlier goal's assist.** The "Assist?" step stays open after Undo removes its goal; picking then attaches to the side's latest remaining goal, and its real assister silently loses the assist. | **Fixed:** the prompt's assist carries its goal's id (`ref`); the engine attaches it only to that goal; the prompt finds its goal once on the board and closes if Undo removes it. Old assists (no `ref`) replay as before. Tests; 500 simulated matches. |
| B6 | **Basketball: an assist picked after an Undo is logged with no basket** (a phantom assist). The "Assist?" box survives Undo. | **Fixed:** the same for baskets; the player-row Assist button is unchanged. Tests; 500 simulated games. |
| B3/T5 | **Racket sports: sides show as initials** ("RKAS" for a pair, "RK" for a player) on the point buttons, the toss chips, the board and the game/break-point chips. | **Fixed:** `entryDisplayName` — a player's name, or the pair's first names; team sports and 3+ keep the stored name (controls and both boards). Tests; not shown in the demo (needs named singles players). |
| B4/T6 | **Racket sports: no "swap sides".** Home is always the left button, but players change ends every game (badminton) or every odd game (tennis), so the button for the player on your left flips. | **Fixed:** "⇄ Swap sides" under the point buttons swaps their places on this device only. Tests; in the demo the left button became BLU and scored for BLU. |

## Follow-on breaks to check while fixing
- **Old logs:** an older assist has no goal / basket id; it must replay exactly as before (attach to the latest goal / be accepted).
- **The player-row "Assist" button in basketball** (an assist not tied to a just-made basket) must still work.
- **A goal's assist picked normally** (no Undo) must still attach to that goal.
- **Undo labels never print "undefined", "null" or "NaN"**; with nothing to name, the bar falls back to plain "Undo".
- **Team-level stats** (no player, from batch 1) must read as the team, not "undefined".
- **Side names:** a team sport keeps its team name; a side with 3+ players, or an unknown player, keeps the stored name; a masked (disputed) name stays masked.
- **Swap sides:** must only change the left/right order on this device — never which side a tap scores for, and never the log.

## Results
Full suite 5,869 tests, 0 failing; tsc clean. Simulation: 500 football and 500 basketball games with random Undos, 1,000 random sides. Found while checking the follow-on list: the first version of the side names read `fullName` directly, which would have shown a disputed player's real name; it now goes through the dispute mask (test). Not done: swap is per screen visit (it resets when the scorer leaves the match), not remembered per device.
