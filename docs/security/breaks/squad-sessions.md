# Break-it: squad sessions (2026-11-04)

Design: docs/product/squad-sessions.md. A club game day: the players present
choose captains, the captains pick teams, and the teams play short games in
turn. Any player present may change the rules; only captains pick, and only on
their turn. Session games are ordinary friendlies (no tournament).

Points (listed before fixing; each gets a failing test first):

| # | Break | Fix |
|---|-------|-----|
| SS1 | Someone who isn't in the session changes rules, captains or picks, or ends it | Every change is a server function that checks the caller is one of the session's players (`auth_player_ids()`) |
| SS2 | A player picks for a captain, or a captain picks out of turn | The server works out whose turn it is from the pick order and the picks so far; only that captain may pick |
| SS3 | The same player picked twice, a captain picked, or someone not present picked | Refused on the server (`not_available`) |
| SS4 | Two phones pick (or change rules) at the same moment | Every change carries the session version it saw; a stale one is refused (`session_changed`) and the phone reloads |
| SS5 | Captains changed after picking started, quietly wiping picks | Captains only change before the first pick; "Start picks again" is explicit |
| SS6 | Wrong number of captains, a captain who isn't present, the same captain twice | Refused (`bad_captains`) |
| SS7 | Junk rules (0 or 50 teams, negative points, unknown rotation) | Rules are cleaned to safe ranges in the app and checked on the server (`bad_rules`) |
| SS8 | A second game started while one is still being played | `next_game` refuses while a session game is scheduled or live (`game_open`) |
| SS9 | A game between teams from another session, or a team against itself | Refused (`bad_teams`) |
| SS10 | Players removed after teams are made | The player list only changes before captains are set |
| SS11 | Round robin is unfair (a team plays three in a row while another waits) | Next game: the teams that waited longest come on; tested over long runs for 2–8 teams |
| SS12 | Winner stays forever | Cap on wins in a row (default 2); on a draw, the team that has been on longer goes off |
| SS13 | A session game doesn't count for the players | Session teams are teams whose roster is the picked players, and games have no tournament, so they count under Friendly |
| SS14 | Huge lists (thousands of "players") | At most 100 players and 8 teams |
| SS15 | An ended session changed | Every change refuses once ended (`session_ended`) |
| SS16 | Signed-out caller | Refused (`sign_in`) |

Tests: tests/squad-session.test.mts (logic), tests/db-squad-sessions.test.mts
(server), tests/sim-squad-sessions.test.mts (600 sessions).
Migration: supabase/migrations/20261105120000_squad_sessions.sql.
