# Break-it: lists that show the state (UI audit step 5, 2026-11-05)

Audit #14, #15, #16, #17, #18 (#38 dropped: "Running" means games you run — host or score — by design, so a game you host that hasn't started belongs there). A live card always shows its score (0–0 before the first point); the overdue explanation shows once above the group instead of on every card; Home's lists use a compact card; repeated tournament names on Home get the detail that tells them apart; the Matches tab's sport row folds into one "Sport: All ▾" control using the shared sport picker.

| # | Break | Fix |
|---|-------|-----|
| LS1 | A live card with no stored score shows "undefined – undefined" | 0–0 until the first score arrives |
| LS2 | A walkover shows 0–0 | Walkovers keep "W/O" (no score shown) |
| LS3 | Two same-named tournaments still look identical when host and city also match | Host, else city, else start date — whichever differs for every one; else "(1)", "(2)" |
| LS4 | Folding the sport row hides an active filter | The control shows the chosen sport ("Sport: 🏀 Basketball ▾") |
| LS5 | The overdue line miscounts | Built from the group's own length; singular / plural |

Tests: tests/list-state.test.mts.
