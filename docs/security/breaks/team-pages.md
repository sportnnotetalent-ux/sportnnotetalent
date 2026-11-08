# Teams for doubles, phase 5: doubles teams open team pages — break it first

2026-11-08. Phase 5 of docs/product/teams-for-doubles.md. "One team, any sport" already exists as a **club** (one name and squad, a team row per sport, one page across sports). Phase 6's migration turns each pair into one. This phase makes every place that showed a "pair" show a team.

| # | Break | Kind | Fix |
|---|---|---|---|
| PG1 | A two-person team still redirects to the separate "Pair" page, where it can't be renamed or given more players. | Function | `teamRoute` no longer has a Pair route: a team opens its team page, or its club's page. Tested. |
| PG2 | Old shared links and notifications to "Pair" (a, b) break. | Links | The Pair screen redirects to the team (`pairTarget`): its club page if it has one, else its team page. Tested. |
| PG3 | After phase 6 the migrated teams are no longer one-off, so a lookup limited to one-off teams finds nothing and old links dead-end. | Links | The redirect looks up every team with both players (`getTeamsWithPlayers`), one-off or not. Tested. |
| PG4 | Profiles still list "Pairs" and My teams lists "Your pairs". | Wording | They read "Doubles teams" / "Your doubles teams" and open the team page. "My teams" no longer says "and your pairs". Tested. |
| PG5 | A pair with several teams (one per sport) opens a random one. | Function | A club wins (all sports on one page); else the team with the most recent id order is used consistently (the first by id). Tested. |
| PG6 | A link for two people with no team shows a broken page. | Robustness | "No team found for these two players" with a way back. Tested. |
| PG7 | Founder: "either of them can edit the team name later". The team page has no way to rename. | Function | Team managers (`useTeamPermission`) get "✎ Rename or edit team" on the team page, opening Edit team (name, short name, colour, logo). Others don't see it. Tested. |
