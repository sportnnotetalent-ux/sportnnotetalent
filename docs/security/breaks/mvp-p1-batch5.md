# MVP P1s, batch 5: break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**Moved out of this batch:** PD2 "Time up" ending. A real result kind reaches 23 files and the server's stat-line stamping (`20261019122800_stat_line_result.sql` reads winners only for awarded / conceded), so it gets its own batch. (On reading the server code it turned out no migration was needed: see `mvp-time-up.md`.)

| # | Failure | Status |
|---|---|---|
| F4 | **Football has no single-period game.** A 1×40 game must go End 1st half → Start 2nd half → End match, and players are credited two halves of minutes. | **Fixed:** a "Periods" option (2 halves · 1 period, no half-time); with 1 period the first period's button ends the match, minutes count one period, and extra time (if any) starts after it. No `periods` key = two halves, so saved matches replay exactly as before. Tests; 500 simulated games of each kind. |
| B1/T4 | **Racket point buttons jump under the thumb.** At the start of a doubles game / set the serving-order picker opens above the buttons, then folds after the first rally (the buttons move up ~150 px). The change-ends cue shows twice (banner + board line) and vanishes after the next point; game / break / set-point rows grow the board. Tennis's Ace / Double fault sit right under the buttons. | **Fixed:** in badminton, tennis, padel and every rallyCore sport the point buttons come first; pickers, the serve banner and the change-ends cue sit below them; PointButtons' "pick who serves first" hint is under the buttons; the board keeps one fixed-height line (alerts, else the cue); a gap before Ace / Double fault. Found in the demo: the Undo bar appeared after the first action (the toss) and pushed the controls down 55 px, so it now holds its place, greyed ("Nothing to undo yet"), from the start. Tests; demo-checked in tennis: the buttons stay at the same height before the toss, after it, through game 1 and the change-ends cue, and into game 2. |

## Follow-on breaks to check while fixing
- **Two-half games and saved matches:** every minute, half and offset stays exactly as before (no `periods` key = two halves).
- **One period:** minutes played are one period; the end-of-period button is the full-time one; a level knockout still goes to the decision; extra time (if the format has it) starts after the single period.
- **Buttons:** pickers, cues and alerts move below the buttons, never above; nothing is lost (each still shows, once); the change-ends cue still appears.

## Results
Full suite 5,940 tests, 0 failing; tsc clean.
