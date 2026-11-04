# Break-it: choose each team's group (2026-11-06)

Founder's real case (Winter Shield): 8 teams, fixed groups A = 1a–4a and
B = 1b–4b. The fixtures screen dealt teams into groups alternately by pick
order (1st → A, 2nd → B …), so a list typed A-then-B put 1a, 3a, 1b, 3b in
Group A, with no way to say which team goes where.

| # | Break | Fix |
|---|-------|-----|
| CG1 | No way to put a team in a chosen group | Under "Number of groups", every picked team has group chips (A, B …); the preview uses them |
| CG2 | The default dealing isn't visible | The same section lists each group's teams before generating |
| CG3 | A choice for a group that no longer exists (groups reduced 4 → 2) | Ignored: that team falls back to the default dealing |
| CG4 | A choice for a team no longer picked | Ignored |
| CG5 | A group left with 0 or 1 team | Generating is blocked with "Group X needs at least 2 teams" |
| CG6 | The same team in two groups | Impossible: one choice per team |
| CG7 | Uneven groups chosen on purpose (5 + 3) | Allowed; each group plays its own round robin |
| CG8 | Changing the sport / division resets picks but keeps stale choices | Choices are cleared with the picks |

Tests: tests/choose-groups.test.mts, tests/sim-choose-groups.test.mts.
