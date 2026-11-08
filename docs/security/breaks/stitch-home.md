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
