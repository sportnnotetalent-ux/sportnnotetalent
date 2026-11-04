# Break-it: two players a side must score as doubles (2026-11-06)

From a real game (pool scotch doubles, 4 Nov, Sudeep Nayak / Vivek C v Abhra
Chowdhury / Ram Ballampalli): the game was made with one-player placeholder
sides (singles format), then two players were added to each side on the
scoring screen. The sides were renamed to the pairs, but the format stayed
"1 a side", so the first 30 shots (9 minutes) credited no shooter and the
"Vivek C breaks · Change" rotation never showed until someone switched the
format. Info hides Singles/Doubles for these sports, so nothing caught it.

| # | Break | Fix |
|---|-------|-----|
| PD1 | Both sides have two players but the game is singles | Before the first shot the format follows the sides: both pairs → 2 a side (`perSideFromRosters`) |
| PD2 | Both sides back to one player but the game is doubles | Before the first shot → 1 a side |
| PD3 | One side 2, the other 1 (still being set up) | No change; the existing "uneven sides" check at start covers it |
| PD4 | The mismatch is found after play started | A banner: "Both sides have two players — score as doubles"; one tap saves the format and replays the shots so far (viewers follow the format marker) |
| PD5 | A team sport (football) with two players | Never touched: only sports played as singles or doubles |
| PD6 | A viewer (not a scorer) triggers the change | Only someone who can score changes it |

Tests: tests/pairs-play-as-doubles.test.mts.
