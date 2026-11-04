# Break-it: one tournament team list (UI audit step 7, 2026-11-05)

Audit #39. The setup checklist and the Manage row counted only registered teams (tournament_teams), while the Teams tab listed teams found in the tournament's matches — a live tournament with four scheduled teams showed "Add teams — none yet". Now all three use the same list: registered teams first, then any team already in its matches. The Manage row says how many are "only in fixtures" so the organiser can register them.

| # | Break | Fix |
|---|-------|-----|
| TT1 | A team counted twice (registered and in a match) | De-duplicated by id |
| TT2 | Junk match rows (no team, missing id) add phantom teams | Only real string ids are counted |
| TT3 | The checklist ticks "teams" from fixtures alone, hiding that teams aren't registered | The Manage row shows "N only in fixtures" |

Data note: not a database bug — the demo (and any tournament scheduled before its teams were registered) simply has fixture teams that aren't registered entries. No migration.

Tests: tests/tournament-teams.test.mts.
