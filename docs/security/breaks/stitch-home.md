# Home, Stitch picks 12–17 — break it first

2026-11-08. From docs/design/stitch-picks/4-home.png:
- **12:** your sports as chips, one lime "Score a match" plus two outline buttons;
- **13:** "N matches this week · M active tournaments";
- **14:** set scores on live racket cards;
- **15:** Near you with spots and Join;
- **16:** progress on your tournament;
- **17:** an offline note.

| # | Break | Kind | Fix |
|---|---|---|---|
| HM1 | Three equal coloured tiles hide the main job, and the lime is used for more than one action. | UX | One full-width lime "Score a match"; Organize and Find players as outline buttons. Tested. |
| HM2 | "3 matches this week" counts cancelled or finished games, or games outside the next 7 days. | Trust | It counts scheduled/live games starting in the next 7 days from the same personal feed Home lists. "Active tournaments" are the user's tournaments with a live or upcoming game. Zero parts are left out; with both zero, no line. Tested. |
| HM3 | Sport chips in the hero overflow on a phone. | Layout | At most 3, then "+N". Tested. |
| HM4 | The progress bar says 100 % for a tournament with no fixtures, or counts cancelled games as left to play. | Trust | % = completed ÷ (fixtures − cancelled). No bar without fixtures. Tested. |
| HM5 | The set line on a live racket card shows nonsense when the sport has no set summary. | Robustness | Only sports scored in sets/games show it, through the sport's own summary (the same one the live bar uses), guarded by `safeLine`. |
| HM6 | The offline note shows while online, or never shows when offline. | Trust | It reads the same online flag the scorer's outbox uses; shown only while offline. |
| HM7 | "4 spots left · Join match" (pick 15) promises a join the app doesn't have: listings carry contact details, not places or a join. | Trust | **Not built.** A follow-up: an open-game feature with places and a join request (needs a database change). |

## Round 2 — founder 2026-11-08 (from the Stitch "Home Page" screen)

- **Tiles:** three equal tiles. Score a match is lime; Organize and Find players are white, each with an icon in a circle.
- **Greeting:** one line, "Ready to play, Aarav?".
- **Your tournaments:** cards you swipe sideways.

| # | Break | Kind | Fix |
|---|---|---|---|
| HM8 | Three tiles bring back more than one strong colour. | UX | Only Score a match is lime; the other two are white cards. Tested: exactly one lime tile. |
| HM9 | A long first name pushes "Ready to play, …?" onto two lines or off screen. | Layout | The font shrinks to fit the measured width (down to a floor). A name over 12 letters is left out ("Ready to play?"). No name means no comma. Tested. |
| HM10 | The greeting shows a child's full name, or someone else's name on a shared device. | Privacy | It uses only the signed-in user's own first name (as before). Sign-out clears the profile (shared-device rule). |
| HM11 | Tournament cards show wrong counts (cancelled games in progress, teams counted twice). | Trust | Progress = scheduleProgress (HM4). Teams = distinct teams in that tournament's games. Sports = the tournament's own list. Tested. |
| HM12 | Dozens of tournaments make Home slow. | Perf | At most 10 cards, then "See all ›" to Organize. |

## Round 3 — founder 2026-11-08: Your sports, compact

"The your sports section should look similar to Try a new sport … we don't want too much scrolling if someone has played multiple sports."

| # | Break | Kind | Fix |
|---|---|---|---|
| HM13 | A player with 20+ sports gets a full screen of sport rows before anything else. | UX | More than 4 sports: one row like "Try a new sport" ("Your sports · Football, Cricket, Basketball +18 more"); tapping it opens the full grid in place, with "Show less". Four or fewer stay as the small grid. Tested. |
| HM14 | The summary names sports out of order or counts wrong. | Trust | It uses the same `mySports` order as the grid: the first 3 names, then "+N more" for the rest. Tested. |
