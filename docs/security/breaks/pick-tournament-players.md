# Break-it: pick a tournament's players / pairs (2026-11-06)

Follow-on to pick-tournament-teams.md for sports played by individuals or
pairs (tennis, badminton, pool …): Quick tournament still took a typed list,
making a new player record per typed name.

| # | Break | Fix |
|---|-------|-----|
| PP1 | Typed names make new player records | Pick each player (or both of a pair) by name or mobile with the people picker; "Me" one tap |
| PP2 | The same player entered twice (singles) | Refused: "X is already in" |
| PP3 | One person in two pairs (doubles) | Refused the same way |
| PP4 | The same pair entered twice | Refused (same two people, any order) |
| PP5 | A pair's existing record is ignored (duplicates, split history) | Each entry reuses the person's / pair's record in this sport (`sideForEntrants`) |
| PP6 | Doubles chosen but the tournament plays singles | A Singles / Doubles choice sets the tournament's players a side |
| PP7 | Players not known yet | "Not known yet" adds slots, as for team sports |

Tests: tests/pick-tournament-players.test.mts.
