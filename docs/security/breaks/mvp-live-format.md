# MVP B6 / T9: change the format of a live match, break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**How a match is rebuilt today:** the board is the match's format (`matches.format`) plus its event log, replayed through the sport's pure reducer, on every device. Live settings in "config mode" (football half length) already change `matches.format` mid-match and replay.

| # | Failure | Status |
|---|---|---|
| LF1 | **The format is locked once live.** A wrong preset (15 points instead of 21, the tennis "match tiebreak only" trap) has no fix after the 5-minute restart window; the scorer must end the match and lose the games played. | **Fixed:** a live friendly's host, on the device scoring it, can change the format in "Edit date, venue & format"; every tap is replayed under the new format (`src/data/formatChange.ts`). Tests; 500 simulated matches; demo-checked (badminton 21 → 11: 13-4 became 11-4, 2-0). |
| LF2 | **A change can silently drop taps.** Replayed under a shorter format, the match may already be over part-way through the log; every later tap is ignored by the reducer and the points vanish. | **Fixed:** a preview shows the new score before saving; a change under which the match would already be over (taps lost) or end on the spot is refused, with the reason. Tests; simulation. |
| LF3 | **Viewers keep the old format.** A device loads the format once (on open). After a change it would keep replaying new taps under the old format, so the spectator's score is wrong until they reopen the match. | **Fixed:** the change writes a `FORMAT` marker row to the log; every device's live channel sees it and reloads the format, then replays. `effectiveLog` drops the row, and the live dispatch / realtime path never reduce it, so no sport's reducer ever sees it. Tests; simulation (the marker never changes a board). |
| LF4 | **A format change can't be undone.** Undo only pops log rows; a format change isn't one. | **Fixed:** "Undo: format change" puts the old format back (`prev` on the row) and then pops the row; viewers reload when the row leaves the log. Test; demo-checked (back to game 1, best of 3, 13-4). |
| LF5 | **Tournament matches.** A tournament's format is the organiser's; one match changing it mid-way breaks the event's rules. | **Fixed:** friendlies only, not cricket, hosts / managers only, and only from the device scoring now (its row is what tells viewers). Tests. |

## Follow-on breaks to check while fixing
- **No reducer ever sees the marker row:** every replay goes through `effectiveLog`, which must drop it; the live dispatch and the realtime fast path must skip the reducer for it.
- **Older logs** (no marker rows) replay exactly as before.
- **Who:** only the match's hosts / managers, friendlies only, not cricket (overs changes there are a rain rule, not a fix).
- **Preview:** the scorer sees the new score before saving; a change that would end the match or drop taps is refused, with the reason.
- **Undo:** "Undo: format change" restores the old format first, then pops the row; viewers follow.

## Order on Undo
The old format is saved **before** the row is popped, so every viewer that reloads on the row's removal gets the old format.

## Results
Full suite 5,983 tests, 0 failing; tsc clean.
