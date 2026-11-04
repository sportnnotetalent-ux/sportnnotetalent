# Break-it: badminton 3×15 default + cards per side (2026-11-05)

Source: docs/sport-expert/badminton-rulebook.md (BR-1, BR-2, BR-3). BWF's 3×15
becomes the standard scoring system on Monday 4 January 2027; 3×21 stays as the
alternate. Laws 16.7.1: warnings and faults go to the offending SIDE.

| # | Break | Fix |
|---|-------|-----|
| B15-1 | A match created on or after 4 Jan 2027 still seeds 3×21 | A preset field can name a dated default (`defaultFrom`): from that IST date, new formats seed 3×15 (and its `set`: 15, cap 21, best of 3, golden point) |
| B15-2 | An existing or saved 3×21 match flips to 3×15 after the date (its stored format read with the new default) | Only seeding (`formatDefaults`) is dated. Stored formats, engine fallbacks and every other read keep the static default, so nothing already saved changes |
| B15-3 | Tournaments created before the date for matches after it | Seeding uses the day the format is made; the organiser sees the labels and can switch. (We don't guess from the match date.) |
| B15-4 | The phone's clock or time zone moves the switch | IST date from the device clock; a wrong clock only changes the suggestion, never a saved format |
| B15-5 | Labels don't say which system is official | "Games to 15, best of 3 · BWF standard from 4 Jan 2027", "Games to 21, best of 3 · BWF alternate", "Games to 11, best of 5 · not a BWF system" (plain words kept); option values (`g15`, `bwf21`, `g5x11`) unchanged so old formats still read |
| B15-6 | Doubles: partner B offends after partner A's warning and gets another warning | Badminton escalation counts the side (`perPlayer: false`); the card still names the player |

Tests: tests/badminton-3x15.test.mts; sim in tests/sim-badminton-3x15.test.mts (600 matches either side of the date).
