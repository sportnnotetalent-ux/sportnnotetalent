# Break-it: My teams = teams I'm part of; every pair is a team (2026-11-05)

Founder: My teams lists only teams I'm part of (in the squad, or played at
least one game for). Follows live on my profile. Every doubles pair (tennis,
badminton, padel, pool …) is a team: one pair across all sports, easy to pick
again, with a page like a player profile for the games those two played together.

Points (listed before fixing):

| # | Break | Fix |
|---|-------|-----|
| PT1 | A team I only created or run shows as "mine" | My teams: teams I'm on (roster / team members) or played for (match squads); the rest under "Teams you run" |
| PT2 | One-off sides fill My teams | Ad-hoc sides never listed as teams; two-person ones become pairs |
| PT3 | The same pair splits into many records (one per sport, duplicates) | Pair = the two people (sorted ids); every row with exactly them merges |
| PT4 | A side of one person, three people, the same person twice, or a quick-game placeholder counts as a pair | Only exactly two different people |
| PT4b | A two-person side in a team sport (a game-day football side) shows as a pair | Pairs only in sports played by individuals or pairs (`isPairSport`, the sport's participant kind) |
| PT5 | A pair's record counts unfinished games, or games of another pair with one shared player | Finished games only; only rows whose roster is exactly the pair |
| PT6 | Pair stats mix in a third player's numbers | Only the two players' stat lines from the pair's games |
| PT7 | Opening a pair's side from a match shows a one-sport page | A two-person one-off side opens the pair page |
| PT8 | Picker can't offer a pair from another sport | "Your pairs" in the picker offers every pair you've played in; picking one reuses or makes this sport's entry |
| PT9 | Pair page with a missing player (deleted) | Shows what's there, no crash |
| PT10 | Following is hidden in Settings | A Following section on my own profile; never on someone else's |

Tests: tests/pairs-and-my-teams.test.mts, tests/sim-pairs.test.mts.
