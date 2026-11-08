# Break it: existing doubles pairs become teams (teams for doubles, phase 6)

Migration `supabase/migrations/20261116120000_doubles_pairs_to_teams.sql` runs the
one-off function `pairs_to_teams()`. Each existing two-person quick-game side in a
doubles sport joins a **team** (a club: one team, any sport), and both players
become its admins. It changes live data, so the founder runs it after the
read-only preview (`docs/product/pairs-to-teams-preview.sql`).

Live, 2026-11-08 (read-only):
- 20 two-person adhoc teams. 17 of them are in doubles sports (badminton, pickleball, pool, snooker), covering 12 distinct pairs. 4 pairs play in 2–3 sports.
- The other 3 are a football and a cricket side with their own names ("Gavva Team", "Happiendings", "Rudy Reddy team").
- No pair has two teams in the same sport. None are in a club or a tournament.

## Points (listed before fixing)

| # | How it could go wrong | Expected |
|---|---|---|
| DP1 | A two-person **football / cricket** side is swept up and turned into a "pair". | Only the 10 doubles sports (`TEAM_DOUBLES_SPORTS`). Team-sport sides are untouched. |
| DP2 | The same two people in pool and snooker get **two** teams, so "one team, any sport" fails. | One club per pair of players. Every sport row of that pair joins it. |
| DP3 | A **child's full name** reaches the new team's name, because it is rebuilt from `players.full_name`. | The club takes the pair's oldest stored team name, which the `entry_names` trigger already masked. It is never rebuilt from full names. |
| DP4 | Neither player can rename the team or add people. Or the wrong people can: a third person, or an existing captain gets removed. | Both players are club admins and join the team row's `admin_ids`. The captain / vice-captain stay as they are. Nobody else is added. |
| DP5 | Renaming or flipping `adhoc` breaks quick-game reuse (`entry_ids`), old pair links (`getTeamsWithPlayers` reads `adhoc`) or the "Recent teams" picker. | Team rows keep name, `entry_ids`, `adhoc`, roster, matches and entries. Only `club_id` and `admin_ids` change. |
| DP6 | Running it twice creates duplicate teams. Or a team already in a club is moved. | Idempotent. A team already in a club is left alone. A later run attaches new rows to the pair's existing club. |
| DP7 | The empty "Pair A / Pair B" placeholders, or rosters with stand-ins / junk ids, get a club. | Only rosters of exactly two distinct real players who exist. |
| DP8 | An app user calls the function and gives themselves admin of other people's teams. | Execute is revoked from `public`, `anon` and `authenticated`. Only the SQL editor (postgres) / service role can run it. |
| DP9 | Scale: hundreds of pairs across sports make wrong counts or slow work. | A 600-player sim (300 pairs, up to 3 sports each) gives exactly one club per pair, with 2 admins each. |

## Not changed (by design)
- Same pair, same sport, two rows (none live): both join the pair's club. Nothing is deleted or repointed, so no match or stat moves.
- The club appears on the players' "My teams" (club_members), not in Discover (adhoc rows stay out of Discover, which keeps them private).
