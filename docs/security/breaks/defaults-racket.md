# Racket sports: point detail on for new matches: break it (2026-11-03)

Batch 3 of `docs/sport-expert/PLAN.md` (racket.md fix 2). The tennis defect TF2 (`tennis-serve-and-endings.md`) is in all five other racket sports: Point detail is off by default, so winners, errors, forehand / backhand and shot types are never asked and never reach Stats.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix.

| # | Failure | Status |
|---|---|---|
| DR1 | **Point detail off by default** in badminton, table tennis, squash, padel, pickleball (`pointDetailSettings.ts` trackFields: every toggle `default: false`). | **Fixed:** `trackFields` gives point detail `on: true` (format default and Scoring settings standard) in all five. Tests; simulation. |
| DR2 | **Old matches must not change:** a format without the key keeps point detail off and replays as before. | **Holds:** engines read the switch only from the stored format (`initDetailFlags`), so an old format without it stays off; detail never changes the score. Tests; 1,000 simulated matches. |
| DR3 | **Padel 1st / 2nd serve must stay off for now:** padel has no Fault button, so with serve tracking on every point would be stamped a 1st serve (a false "100 % 1st serves in"). On only once the Fault button reaches padel (Batch 4). | **Holds:** padel's 1st / 2nd serve stays off for new matches until Batch 4 brings the Fault button. Test. |
| DR4 | **The other switches stay off** (net / kitchen line, rally length, 3rd shot): each adds a row to every point. | **Holds:** net / kitchen line, rally length and 3rd shot stay off. Tests (pinned deep-wave test updated to the new rule). |
