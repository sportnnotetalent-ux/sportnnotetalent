# Athletics batch 1: retired (r) and no clearance after three failures, break it (2026-11-02)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**Source:** expert audit `docs/sport-expert/measured.md`, fixes 1 (P0) and 2 (P1).

**How it works today:** a field athlete's statuses are DNS / DQ / WD (`ResultsEventScreen.tsx statusesFor`). WD is an explicit status, so `effectiveStatus` returns it and `rankEntries` lists the athlete unranked; `attemptNextUp` / `verticalState` / `firstRoundsDone` / `fieldFinalists` drop the athlete. On the vertical row (`HeightRow`) the O / X / – chips are disabled only when `done || (eliminated && !tries)`.

| # | Failure | Status |
|---|---|---|
| A1 | **No "r" (retired, TR 25.18 / 26 notation).** An athlete who stops competing after a valid mark can only be marked WD, which **erases the mark and the place** (unranked). The real result is lost. | **Fixed:** `EntryResult.retired` (`{ afterRound | atHeight }`, not a status) keeps the row ranked on the marks made; "r Retired" chip on the field row (`toggleRetired`). Tests: `athletics-batch1` A1 group; sim. |
| A2 | **Retiring early blocks the final.** Rounds 4–6 open only when every athlete has taken 3 trials (`firstRoundsDone`). An athlete who retires after round 1 never does, so nobody gets trials 4–6. | **Fixed:** `firstRoundsDone` counts a retired athlete as done. Test: "next-up skips a retired athlete; rounds 4–6 open"; sim (every competition finishes). |
| A3 | **The next-up card keeps calling a retired athlete** (horizontal: `attemptNextUp`; vertical: `verticalState`), and the vertical "still in" count and trial clock count them. | **Fixed:** `attemptNextUp` skips retired rows; `verticalState` leaves them out of `active`. Tests: next-up / bar-card tests; sim asserts a retired athlete is never called. |
| A4 | **A retired athlete with no valid mark** would sit in the "pending" rows forever (status ok, no best) instead of NM. | **Fixed:** `effectiveStatus` returns NM for a retired athlete with no valid mark / no clearance. Test: "retired with no valid mark is NM". |
| A5 | **"r" not shown** in the results row, the sheet, the shared results text or the commentary. | **Fixed:** `r` result flag (row, sheet, shared text via flags); commentary adds ", then retires (r)" and shows the flag. Tests: "r flag", "commentary says the athlete retired". |
| A6 | **Carried failures, then O.** "X–" at one height then "XX" at the next is three failures in a row (TR 26.5: out). The row's chips stay enabled (`tries` is non-empty), so a third tap O is accepted and `summarizeHeights` ranks the clearance. Wrong result. | **Fixed:** `heightTries(heights, h)` (marks.ts) counts failures carried across passes; `HeightRow` disables O / X / – when it's closed. Tests: A6–A8 group; sim with adversarial row taps (fails with the old guard). |
| A7 | **Same, at a later height:** eliminated athletes at a later bar are already blocked when the row is empty, but the guard lives only in the UI; `saveTry` (guided card) has no check of its own. | **Fixed:** `saveTry` refuses a try when `heightTries` is closed or the athlete retired. Sim asserts the guided card only calls athletes who may still jump. |
| A8 | **Remaining tries not shown:** after "X–" the official isn't told the athlete has 2 tries left at the next height. | **Fixed:** the row shows "N tries left" when failures are carried. Test: "carried failure: 2 tries left". |

## Follow-on breaks to check while fixing
- **F1 Existing results read identically:** rows without `retired` rank, show and score exactly as before (no new keys written). **Checked:** test "rows without `retired` rank exactly as before"; existing athletics-field / results-engine suites unchanged and passing.
- **F2 Ties / count-back:** a retired athlete's countback uses only the marks made; ties with a non-retired athlete still go by the series (TR 25.22) and the high-jump failures rule (TR 26.8). **Checked:** countback and HJ failures tests.
- **F3 WD unchanged:** WD still drops the athlete from the ranking and the trial order. **Checked:** test "WD still drops"; sim asserts WD is never ranked.
- **F4 Career stats:** a retired athlete's best mark still reaches `phaseLines` (mark, PB key, place). **Checked:** test "career line keeps the mark and the place".
- **F5 Finalists:** a retired athlete in the top 8 still holds their place in the cut (they just take no more trials). **Checked:** test "holds their place in the cut".
- **F6 Undo:** unretiring (tapping the chip again) offers trials again. **Checked:** `toggleRetired` test.
- **F7 Old rows that already break TR 26.5** still rank as stored (no rewrite). **Checked:** F7 test.

## Results
`node --test` athletics-batch1 (17), sim-athletics-batch1 (600 competitions), athletics-field, athletics-track, results-engine, timed-races-commentary, weightlifting: 165 tests, 0 failing; `tsc --noEmit` clean. Not checked in the demo preview (the r chip and the disabled chips are unverified on screen).
