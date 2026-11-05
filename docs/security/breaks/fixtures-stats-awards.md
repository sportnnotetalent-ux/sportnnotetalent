# Break-it: fixture generator, Stats and Awards (UI audit round 5, 2026-11-05)

Audit #42–48. The fixture generator lists this tournament's teams (registered + already in its fixtures for the sport), pre-selected, with look-alike names told apart; every other team only behind "＋ Show other teams"; steps are numbered (1 · Teams, 2 · Format, 3 · When & where) and "Preview fixtures" is the main button until there's a preview. Stats: a knockout leads with its bracket (main button) and, while games remain, shows "Results so far" with plain ranks — no 🥇🥈🥉. Awards: "Awards so far — N games still to play"; publishing early is an outline button that asks first; awards with no stats and no winner are hidden; "1 m" reads "1 match".

| # | Break | Fix |
|---|-------|-----|
| FA1 | The generator schedules teams from other tournaments by default | Only this tournament's teams are listed and pre-selected; others need "Show other teams" and a tap each |
| FA2 | A division's generator shows teams from other divisions | The division filter still applies on top |
| FA3 | Pre-selection overwrites the organiser's picks on refetch | Unchanged rule: once they touch the selection it's theirs |
| FA4 | Medals disappear from a finished knockout | Only while games remain (or none played yet) — a finished knockout keeps its podium |
| FA5 | A league tournament loses its medals | The rule applies only to structure = knockout |
| FA6 | Publishing early is blocked when an organiser really needs it (rain-out) | Still possible: "Publish early…" with a confirm that says how many games remain |
| FA7 | Hiding empty awards hides one already picked by hand | A category with a winner always shows |
| FA8 | Cancelled games keep the awards "so far" forever | Cancelled games don't count as remaining |

Tests: tests/fixtures-stats-awards.test.mts.
