# Break it: match-day roles (reference-video C6)

2026-11-06. The founder's order: A2+A3, then C6. Each side of a match gets a
match-day captain plus the sport's keeper role (cricket wicket-keeper;
football, handball and hockey goalkeeper; ice hockey goalie), picked from that
match's squad, in every team sport.

Storage: `match_squads.keeper_id` already exists live and already feeds the
scoring screens (🧤). This adds `match_squads.captain_id` (migration
`20261111120000_match_roles.sql`).

| # | Break | Risk |
|---|---|---|
| MR1 | A captain or keeper who isn't in that side's squad, someone from the other team, or a made-up id. | Data integrity |
| MR2 | The other side's captain or manager sets *our* captain. | Authorisation |
| MR3 | The app is published before the founder runs the SQL: saving a squad with `captain_id` fails, or reading squads fails because the column is missing, which empties every squad. | Breakage |
| MR4 | The Matchday Squad screen saves `{starters, subs}` only, wiping a keeper set from the cricket lineup screen. This is an existing bug, found while reading the code. | Data loss |
| MR5 | Taking a player out of the squad leaves them as captain or keeper. | Data |
| MR6 | Individual and doubles sports, or sports without a keeper, get role pickers that make no sense. | Scope |
| MR7 | Existing rows whose keeper isn't in the squad suddenly can't be saved after the guard is added. | Breakage |
| MR8 | Signed-out viewers learn more than before. | Privacy |

## Fixes and checks

- **MR1:** the trigger `guard_match_squad_roles` refuses a captain or keeper not in that side's starters or subs (errcode 22023).
- **MR2:** unchanged and still in force. `match_squads_write` = `can_manage_match_side`, so the other side's captain changes nothing (database test).
- **MR3:** the app reads `captain_id` and falls back to the old columns when the column is missing; it writes with the captain and retries without it. Publishing before the SQL is run is safe; the captain just isn't kept until it is.
- **MR4:** fixed. The Matchday Squad screen loads and saves `keeperId` and `captainId`.
- **MR5:** taking a player out of the squad clears their role, both in the trigger and in the app (`cleanSquadRoles`, applied in `setMatchSquad`, so the demo matches).
- **MR6:** a captain for every team sport; a keeper only for cricket (Wicket-keeper), football, handball and hockey (Goalkeeper) and ice hockey (Goalie). "Who's playing" and the squad screen are team-sport only.
- **MR7:** the keeper is only checked when it or the squad changes, so older rows still save (database test).
- **MR8:** no new policies or grants. `captain_id` sits on `match_squads`, which signed-out viewers of a shared match can already read, like the squad itself.

**Tests:**
- `tests/db-match-roles.test.mts` (6, PGlite);
- `tests/match-roles.test.mts` (6);
- `tests/sim-match-roles.test.mts` (600 sides × 30 changes).

**Demo check:**
- set Rohan Nair as captain and Kiran Rao as goalkeeper on Red House's Matchday Squad;
- the Info tab showed "This match: Rohan Nair";
- reopening the screen showed both roles kept.

**Not done:** volleyball's libero (it can be two players, and it touches the rotation) and pre-filling cricket's toss captain from the squad — follow-ups. The SQL (`20261111120000_match_roles.sql`) is for the founder to run.
