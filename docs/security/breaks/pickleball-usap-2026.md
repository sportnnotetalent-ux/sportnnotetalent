# Break-it: pickleball USA Pickleball 2026 standings + rally labels (2026-11-05)

Source: docs/sport-expert/pickleball-rulebook.md (PR-1, PR-3).

| # | Break | Fix |
|---|-------|-----|
| PU-1 | Ties ranked by games difference, not USAP 15.B.4 | Pickleball default (new tournaments and the pool-play preset): matches won; then (b) head-to-head wins among the tied, (c) rally-point difference over all games, (d) head-to-head rally-point difference, (e) rally-point difference against the team ranked just above, (f) total rally points scored, then lots |
| PU-2 | "Method that breaks the tie ranks all tied teams" vs the ITTF-style restart | No restart for pickleball: a criterion that separates some teams ranks them, and teams still level go on to the NEXT criterion |
| PU-3 | "vs the next-highest team" when the tie is for first (no team above) | The criterion gives 0 to everyone, so it can't separate them and the next one is used |
| PU-4 | A withdrawn / retired / forfeited team's results still count (15.B.4.a) | `dropWithdrawn` (pickleball default, organiser can turn it off): a withdrawn team's matches are left out of everyone's record; the team is listed last, marked withdrawn |
| PU-5 | Saved tournaments change order without the organiser knowing | Only new tournaments and the "Pool play" preset get the new order; a saved `tieBreak` keeps its own |
| PU-6 | Other sports change | New criteria are only offered for games-scored sports; their defaults don't change |
| PU-7 | Rally scoring labelled "Rec", though it's a sanctioned (provisional) 2026 format | Plain labels: "Rally · 1 game to 11", "Rally · best of 3 to 11", "Rally · best of 3 to 11 · win by 1"; new "Rally · best of 3 to 15" (USAP 15.C.2.b); values unchanged |

Tests: tests/pickleball-usap-2026.test.mts; sim tests/sim-pickleball-usap-2026.test.mts (600 pools).
