# Break-it: one team page wherever it's opened (2026-11-05)

Founder report: Organize → My teams → Fnatic shows the team home (Game days,
members); Discover → Fnatic shows a different page (Follow, stats, "Squad (0)").
A team should look the same from every entry point, with management buttons
only for its admins / members. Discover also listed one-off sides ("Fnatic
Team 1 Thursday hotfut game"), and every game-day session adds more.

Points (listed before fixing):

| # | Break | Fix |
|---|-------|-----|
| TP1 | A club's sport row opened from Discover / a match / standings / a tournament shows the old single-sport page | The Team screen opens the club's team page instead (same sport selected); `teamRoute` decides |
| TP2 | The sport view inside a club redirects again (loop) | The club's sport links pass `inClub`, which never redirects |
| TP3 | Visitors see a stripped club page (no Follow, no results) | Follow, 🔔 and recent results show for everyone; edit / add / start-session only for members / admins |
| TP4 | Following a club follows one sport only | Follow covers every sport row; "Following" only when all are followed; unfollow removes all |
| TP5 | A club sport with no squad picked shows "Squad (0)" | The squad falls back to the club's members |
| TP6 | One-off sides (ad-hoc, game-day "Fnatic 1/2/3") fill Discover search and browse | Left out of Discover; their matches still open them, follows stay |
| TP7 | A club shows twice in Discover browse (one row per sport) | Collapsed into one entry listing its sports |
| TP8 | Following list rows can't be opened | Tapping a followed team opens its team page |
| TP9 | A team row that no longer exists / has no club | Old page as before, no crash |

Tests: tests/one-team-page.test.mts, tests/sim-one-team-page.test.mts.
