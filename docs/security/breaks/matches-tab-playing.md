# Break-it: Matches tab shows only games I play in (2026-11-04)

Founder report: the Matches tab's Live list still showed two "Player A vs Likhi"
games left running since 31 Oct / 1 Nov (Home already hid them), and Upcoming
showed "Fnatic Team 1 … vs Fnatic Team 2 …" though he is on neither team.
Rule asked for: Home may show followed people's games; Matches shows the games
of the teams I play for.

Why Fnatic showed: he created both teams and the match, and is its host and a
listed scorer, so "mine" (play OR organise OR score) included it.

Points (listed before fixing):

| # | Break | Fix |
|---|-------|-----|
| MM1 | A game I host / score / organise but don't play shows as "my match" | Matches splits **Playing** (default) and **Running**; Playing = I'm on a side's roster or team members |
| MM2 | A game I play AND host shows twice | Each game sits in exactly one view; playing wins |
| MM3 | Being a club admin / team creator / captain-not-on-roster counts as playing | Playing reads only roster + team_members (scope `playingTeamIds`), never managed teams |
| MM4 | A side's own roster lists me but the scope missed that team (demo, stale cache) | Either the side's roster or the scope's playing teams is enough |
| MM5 | A live game idle 12h+ stays under Live in Matches | Out of Live; listed under Completed as "Not finished" so its scorer can still open and end it |
| MM6 | A cached scope from before this change has no `playingTeams` | Read as empty, never a crash |
| MM7 | A saved / URL `view` param holds junk | Falls back to Playing |
| MM8 | No player id (guest / no profile) | Playing is empty; nothing throws |
| MM9 | Sport filter applies to one view only | The same sport filter feeds both views and every count |

Not changed: Home (followed games stay), Calendar (keeps everything I run).
Tests: tests/matches-tab-playing.test.mts, tests/sim-matches-tab-playing.test.mts.
