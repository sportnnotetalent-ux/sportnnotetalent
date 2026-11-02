# Cue & board batch 1: break it (2026-11-02)

**Source:** expert audit `docs/sport-expert/cue-board.md`, fix list rows 1 (carrom Queen) and 2 (snooker foul value). Both are places where skipping a tap silently changes the score.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| Q1 | **Carrom: Record enables with the Queen question unanswered** (`ready = penalty \|\| coins != null`). A skipped Queen chip drops the winner's +3 with no warning. | **Fixed:** `boardReady` (carrom/engine.ts) needs the coins AND a Queen answer; the form reads "· tap one" and the button "pick the Queen". Test Q1; 800 simulated boards. |
| Q2 | **Carrom: under the ICF format "Not covered" is offered** although under ICF the Queen is always covered before a board can end (or the board is a foul / penalty board). | **Fixed:** `init` keeps `icf` from the ICF preset; `queenChoices` gives Winner / Loser only, so "Not covered" is hidden and never ready. Test Q2; sim. |
| Q3 | **Carrom: a penalty board must not ask about the Queen** (it is not a board won, a Queen or a slam). Making the question required must not block it. | **Fixed:** a penalty board is ready without the Queen (unchanged payload). Test Q3; sim. |
| Q4 | **Carrom: old boards replay as before.** Boards stored without `queenBy` (old `queen` flag only, or nothing) must give the same score, sheet and credits. | **Fixed (no engine change needed):** the reducer is untouched; old `queen`-only boards give the same score. Test Q4/Q6. |
| Q5 | **Carrom: casual / custom formats keep "Not covered"** (friendly play where the board was abandoned). | **Fixed:** single, casual, custom and older formats (no preset) keep "Not covered". Test Q5; sim. |
| Q6 | **Carrom: the board editor** (✎ correct a board) must still accept an old board without a Queen answer; the requirement is for new boards only. | **Fixed:** the board editor is unchanged and replays old boards to the same score (EDIT_LOG). Test Q4/Q6; the sim replays every match. |
| Q7 | **Carrom: the score after a required answer** — "Loser" and "Not covered" add 0, "Winner" adds 3 under 22 and 0 at 22+ (unchanged engine rule). | **Fixed (unchanged rule):** Test Q7; the sim checks every board's points against `boardValue`. |
| S1 | **Snooker: the foul value never follows the ball.** "Wrong ball first" hitting the pink while on a red records 4, not 6 (WPBSA S3 R11: the highest of 4, the ball on, the ball involved). | **Fixed:** a "Ball involved" chip row (red … black) on the foul sheet sets the value with `foulValue` (snooker/controls.ts). Test S1. |
| S2 | **Snooker: the ball involved must never lower the value** below the minimum (4, the ball on, 7 on the re-spotted black). | **Fixed:** `foulValue` = max(min, ball value), capped at 7. Test S2; 600 simulated fouls. |
| S3 | **Snooker: the manual value chips stay an override** after a ball is picked; clearing the ball returns to the minimum. | **Fixed:** the value chips still set any value; tapping the picked ball again clears it and returns to the minimum. Test S3/S5 (score). |
| S4 | **Snooker: old fouls replay identically.** The engine and payload are unchanged (`value` only); a log replays to the same scores. | **Fixed (no change needed):** engine and payload unchanged (`value` only). Test S4; the sim replays every foul twice to the same state. |
| S5 | **Snooker: undo / stats / commentary** read the stored `value`, so a value set from the ball shows the same everywhere (frame score, fouls conceded, the feed line "Foul … N to …"). | **Fixed:** the stored value reaches the frame score and the feed ("6 to A"). Test S3/S5; the sim checks the score. |

## Follow-on breaks to check while fixing
- No new payload keys: both fixes work on keys already stored (`queenBy`, `value`).
- The voice parser for carrom builds its own BOARD (a spoken "queen" or not); not changed here (out of scope, noted).

## Results
`tests/cue-board-batch1.test.mts` (10) and `tests/sim-cue-board-batch1.test.mts` (800 boards, 600 fouls). Carrom, snooker and every test importing these plugins: 158 tests, 0 failing; `tsc --noEmit` clean. Not checked on a device or in the browser.

Files: `src/sports/carrom/engine.ts`, `src/sports/carrom/index.tsx`, `src/sports/snooker/controls.ts`, `src/sports/snooker/index.tsx`. No shared files changed.

## Follow-on fixed by the lead (2026-11-02)
- **Voice could still record an ICF board without the Queen answer.** **Fixed:** under ICF rules a spoken board must say "queen" (the winner covered it) or "no queen" (the loser did), else it is not taken; other rules unchanged. Test: `tests/carrom-voice-queen.test.mts`.
