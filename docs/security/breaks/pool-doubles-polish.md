# Pool scotch doubles: display polish, break it (2026-11-02)

Found while taking the founder's screenshots of a scotch doubles 8-ball friendly.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| PP1 | **Codes instead of names on the Stats tab.** The comparison and per-player tables label the pairs "AMRN" / "RPRB" (initials of four names): the tabs get the short code, while the board and the controls already say "Aarav / Rohan". Carrom doubles has the same pattern. | **Fixed:** a two-player side reads its players' short names ("Aarav / Rohan") on every tab, through the same name masking as the board; singles keep the player's name and team sides their team name (pool and carrom). Tests; demo-checked. |
| PP2 | **Cut-off column headings.** Pool's per-player table has no short headers, so a phone shows "Racks …", "Balls p…". | **Fixed:** pool's per-player table has short headers RW · BP · POT · MISS · SAF · FLS. Test; demo-checked on a phone-sized screen. |
| PP3 | **Doubled words in the key:** "Racks won Racks won · Balls pocketed Balls pocketed …", because a column with no short header prints its label twice. Any sport's box with such a column does it. | **Fixed:** `boxLegend` prints a column's label once when it has no short header (every sport's box). Tests; demo-checked. |
| PP4 | **Two taps to start.** Pool asks "Start the match", then "Who breaks rack 1?" (one-tap start covered racket sports and kabaddi). The first break pick must keep its first-event stamp (rack, game, race, sets). | **Fixed:** pool's start panel asks "Who breaks rack 1? (the lag winner chooses)"; one tap logs the same `lagAction` the second tap did, with its stamp. Buttons show the side's name only (fits a phone). Tests; 1,000 simulated starts; demo-checked. |

## Follow-on breaks to check while fixing
- **Privacy:** pair names come through the same masking as the board (a disputed or protected name never shows in full).
- **Singles** keep the player's name; team sides keep their names; saved matches read the same.
- **One tap** logs exactly the action the second tap logged (`lagAction`, with its stamp).
