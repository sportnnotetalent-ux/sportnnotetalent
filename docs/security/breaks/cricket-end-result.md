# Cricket: ending a match with the chase unfinished: break it (2026-11-02)

**Expert audit C1 / fix 1 (P0)** (`docs/sport-expert/cricket.md`). `End match` with the chase still alive (wickets and overs left, target not reached) sends a bare `END`, and `outcome()` then gives the defending side "Won by N runs". A Test / 2-day game has no "No more play" (the Overs & target card is hidden at 100+ overs), so it can't end as a draw. The hand-closed dialog calls the level result "Tie" even in a timed game, where it is a draw.

**Wanted:** an early end asks how it ended (No result · Draw (timed game) · Award to a side, optional reason) and sends `END { v: 2, how }`. Old logs (`END` without `v: 2`) replay exactly as before.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| E1 | **Unfinished chase → defending side wins by runs.** A bare `END` mid-chase reads "Won by N runs" for the side batting first. | **Fixed:** `End match` with the chase alive (`chaseAlive`) opens "How did the match end?" (No result · Draw in a timed game · Award to either side, optional reason) and sends `END { v: 2, how }`; `outcome()` reads "No result" / "Match drawn" / "Awarded the match — reason". Tests (E1). |
| E2 | **No draw for a timed game.** A Test / 2-day match (oversLimit ≥ 100) has no way to end as a draw from the scoring screen. | **Fixed:** the End-match question offers Draw when oversLimit ≥ 100 (Test / multi-day). Tests (E2). |
| E3 | **"Tie" for a draw.** The hand-closed dialog (`manualEnd.drawLabel`) says "Tie" in a timed game; a tie and a draw are different results. | **Fixed:** `manualEnd.drawLabel` can be a function of the state; cricket's is `drawWord` ("Draw" at 100+ overs, else "Tie"). Tests (E3). |
| E4 | **Old logs change.** A legacy `END` (no `v`) must replay to the exact same state and result text. | **Holds:** a plain `END` still returns `{ ...s, ended: true }` and the old margin. Test (E4); the frozen legacy-log replay passes; 600-run sim (plain END equals the old state). |
| E5 | **Bad payloads.** `END {v:2}` with an unknown `how`, an award with no / a bad side, a draw in a limited-overs game, or a huge reason must not end the match with a made-up result. | **Fixed:** unknown `how`, an award without home / away, a draw at < 100 overs or `v` other than 2 return the state unchanged; a non-string reason is dropped, a long one cut to 120. Tests (E5); sim with bad payloads. |
| E6 | **Overwriting a decided result.** A `v: 2` END after the match already ended (target reached, all out), while a tie waits for the Super Over call, or during a Super Over, must not replace the real result. | **Fixed:** a `v: 2` END is ignored once ended, while a tie awaits the call, and during a Super Over (root and nested innings). Tests (E6); sim. |
| E7 | **Standings: a no result counted as a tie.** `plugin.result` only knows home / away / draw, so a no result would take draw points and count its runs and overs in NRR. It must be an NR (NR points, played, nothing towards for / against or NRR). | **Fixed:** `plugin.result` carries `kind` (`endResult`); the data layer reads it as a result (`stateResult` in `toMatch`), so the table counts an NR (NR points, played, nothing to for / against / NRR). Tests (E7). |
| E8 | **Standings: draw / award.** A draw takes draw points; an award is a win for the side named. The unfinished chase's runs and overs stay out of NRR. | **Fixed:** draw → draw points, award → a win for the side named; `countNrr: false` keeps the unfinished chase out of NRR. Tests (E8). |
| E9 | **Players' W/D/L/T/NR.** A cricket draw must read D (today `winner: 'draw'` reads T for cricket), a no result NR, an award W / L. | **Fixed:** draw → D (not T), no result → NR, award → W / L through `sideResults`. Tests (E9); sim. |
| E10 | **Result text everywhere.** The final banner, the summary line, the ticker and the share text read "No result" / "Match drawn" / "<Team> awarded the match — reason", never "won by N runs"; the records margin ("won by N runs") is not logged for them. | **Fixed:** banner, summary, ticker and share text all go through `outcome()`; the records' margin regex no longer matches. Tests (E10). |
| E11 | **Undo.** Undoing the END must reopen the chase with no stored result (the result is not written as a hand-closed result that a later snapshot keeps). | **Holds:** the result is derived from the state on every read, never written to `matches.result`, so replaying the log without the END is the live chase again. Tests (E11); sim (every accepted END). |
| E12 | **Winner column for a no result.** The saved `winner` must be empty, not 'draw'. | **Fixed:** `savedWinner` writes no winner for a no result (live and demo snapshot paths). Tests (E7). |

## Follow-on breaks to check while fixing
- A chase that is NOT alive (all out / overs done / target reached) keeps the plain `END`: its result is the real one.
- The Super Over and pending-tie paths (`END` to accept a tie) are unchanged.
- A real hand-closed result (`matches.result`) still beats the derived one.

## Results
`node --test tests/cricket*.test.mts tests/sim-cricket*.test.mts`: 440 tests, 0 failing (24 new in `tests/cricket-end-result.test.mts`, a 600-match simulation in `tests/sim-cricket-end-result.test.mts`). `npx tsc --noEmit -p .` clean.

## Not verified
- The new panel on a device (not run in the app).
- Server-side readers of the `matches` columns only (SQL backfill of appearances, edge functions such as notify-followers) see `winner` empty for a no result and no `result`; they don't read the state's kind.
- "No more play" (rain / par) stays limited-overs only; a Test ends through End match → Draw / No result.
