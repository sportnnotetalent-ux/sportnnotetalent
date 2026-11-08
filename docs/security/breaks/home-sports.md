# Home: Your sports page, its icon, no tournament filter — break it first

2026-11-08, founder:
- "Your sports" opened in place, while "Try a new sport" opens a new page with a back arrow. Both should behave the same.
- The folded row showed a football. It should show either a generic symbol or the sport you've played most.
- The "Tournament" chip row at the top isn't needed now that tournament cards sit lower on Home.

| # | Break | Kind | Fix |
|---|---|---|---|
| HS1 | The fold's icon is just the first sport in the list (football for most people), not something that is really theirs. | Content | It shows the sport with the most games you took part in: played, scored or hosted, every game on the app. With no games yet it shows a generic 🏅. Ties go to the sport listed first. Tested. |
| HS2 | Your sports expands in place while Try a new sport opens a page, so the two look the same but behave differently. | Consistency | The folded row opens a "Your sports" page with a back arrow. The in-place "Show less" is gone. Four sports or fewer still show as a short list on Home, as before. Tested. |
| HS3 | Tapping a sport on the new page goes somewhere other than tapping it on Home. | Consistency | Both use one function, `sportTarget`. It opens one of *your* tournaments that has the sport, else your stats in that sport, else Discover. It never opens a stranger's tournament. Tested. |
| HS4 | The new page is empty or broken when opened from an old link or with no sports. | Robustness | It works out your sports itself (no route params) and shows an empty state with a way to Try a new sport. Tested. |
| HS5 | Removing the tournament filter quietly hides matches: a person with one tournament was auto-filtered to it. | Content | Live now and Up next always show every match of yours. The tournament cards lower down open each tournament. Tested. |
| HS6 | A sport opened from Home picks the "selected" tournament, which no longer exists. | Logic | `sportTarget` has no selected-tournament input. Tested. |
| HS7 | Founder: from Your sports → a sport → "＋ Organize a game", match setup asks for the sport again. | Consistency | The sport page passes its sport, so setup opens with that sport chosen. An unknown sport id still falls back to the picker. Tested. |
