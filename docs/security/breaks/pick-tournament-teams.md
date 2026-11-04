# Break-it: pick tournament teams, don't type them (2026-11-06)

Founder: typing team names into Quick tournament makes a new team every time,
though every team is one record. Teams are searched and picked from a list; a
team not on SportnNote is quick-created with its captain's mobile and the
captain gets an invite (WhatsApp / SMS) to add the players. Fill slot's "new
team" does the same.

| # | Break | Fix |
|---|-------|-----|
| PK1 | Typed names make duplicate teams | Team sports: search and pick from the sport's teams; no free-typed list |
| PK2 | Search shows one-off sides, slots, other sports' teams | Only real teams of this sport (`searchPickTeams`) |
| PK3 | The same team picked twice | Already-picked teams are hidden from the results |
| PK4 | A "new" team that already exists (same name, this sport) | Warned and the existing one is offered first ("Pick it instead") |
| PK5 | A new team with no captain — nobody can add players | The captain's mobile is required; they become captain and get the invite |
| PK6 | A bad mobile number | Refused before anything is made |
| PK7 | A team someone else runs is picked | Entered as invited (the existing tournament rule), not confirmed |
| PK8 | Fill slot → new team has no captain | Same captain fields; the captain is invited |

Tests: tests/pick-tournament-teams.test.mts, tests/sim-pick-tournament-teams.test.mts.
