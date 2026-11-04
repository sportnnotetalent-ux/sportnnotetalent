# Break-it: shared score bar and live highlight (2026-11-05)

UI audit step 1 (docs/design/ui-audit.md #1–3, 11–13, 24, 35, 37). One score bar for every sport, fixed above the scoring controls: the status line, each side's name in ink with a colour dot and its score, the side or player in play in a lime band ("🎱 Rohan Nair at the table", "🏸 Red House serving"), and the last thing scored with a short flash on the side that changed. First sports with a named player in play: pool, snooker, billiards, badminton. Other sports show the bar without the player line until their own `inPlay` is added.

| # | Break | Fix |
|---|-------|-----|
| SB1 | A stored or hostile match state (old snapshot, missing frame, junk ids) crashes the bar | Each `inPlay` reads defensively and returns null when it can't tell; the bar then shows no highlight |
| SB2 | The highlight names the wrong player (a doubles partner, the other side's player, someone not on the roster) | The player comes from the same rotation the controls use (atTable / shooterPick / badmintonDoublesTurn) and must be on that side's roster; otherwise only the side is highlighted |
| SB3 | A highlight before play starts or after the match ends ("serving" before the toss) | null until the first server / breaker is known, and after the match ends |
| SB4 | Team colours used as text are unreadable (yellow, pale green on white) | Names and scores in ink; the team colour only as a dot |
| SB5 | Long names push the score off-screen or are cut mid-word | Names wrap to two lines at most; the score column has a fixed width |
| SB6 | The flash fires on every re-render, or animates for people who asked for less motion | Flash only when a side's score text changes; no animation with reduce-motion on (the lime band still shows) |
| SB7 | Screen readers hear nothing about who's in play | The in-play line is part of the bar's spoken label and a polite live region |
| SB8 | The bar covers controls or the keyboard on a small phone | The bar sits above the scroll area (not over it), one compact block |

Tests: tests/score-bar.test.mts (rows, in-play text, flash, every inPlay against real engines), tests/sim-score-bar.test.mts (600 random matches: never throws, the named player is always on the in-play side's roster).
