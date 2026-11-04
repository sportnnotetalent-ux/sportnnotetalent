# Table tennis: rulebook audit (2026-11-05)

Third sport checked against the federation's own text, read with Firecrawl. It builds on `racket.md` §2 (TT-a and TT-b are built: expedite, lets, edge / net).

## Source

| Document | Version | Link |
|---|---|---|
| ITTF Laws of Table Tennis (from the 2026 ITTF Statutes), as reproduced by Table Tennis England | 2026–27 | https://www.tabletennisengland.co.uk/content/uploads/2026/07/Laws-of-Table-Tennis-2026-27-2.pdf |
| ITTF Statutes 2026 (the original) | Jan 2026 | https://documents.ittf.sport/document/389 |

## Findings

| # | Priority | Law | Gap | Status |
|---|---|---|---|---|
| TT-1 | **P1** | 2.15.2: the expedite system "shall not be introduced in a game if at least 18 points have been scored" | We used the older test ("both on 9 points"), so expedite was allowed at 10-8. | **Fixed:** blocked from 18 points played (2 × (target − 2) for other game lengths). Message and hint updated. |
| TT-2 | P3 | 2.6.6.1: one service warning per match, then any doubtful serve is a fault | Not tracked. A service fault is recorded as a fault anyway. | Leave. |
| TT-3 | P3 | 2.9.1.5, 2.10.1.14–15: para (wheelchair) serve lets and faults | No para option. | Same as the badminton BR-7 idea: one shared "Para class" organiser option for later. |

## Checked and fine

- 2.11: game to 11, two clear at 10-all. ✓ Formats: best of 3 / 5 / 7, and legacy 21. ✓
- 2.13.3: two serves each, one each from 10-all and under expedite. ✓
- 2.13.4–2.13.6: doubles serving order, and the receiving order switching at 5 in the last game (`doublesOrder.ts`). ✓
- 2.13.7: change of ends at 5 in the last possible game (`tableTennisCue`). ✓
- 2.14: an order error keeps the points scored; the server is derived from the score. ✓
- 2.9: lets (net serve, not ready, disturbance) as a marker. ✓
- 2.10: ways a point is lost (incorrect serve / return, obstruction, double hit, moving the table, net touch, free hand) as service fault and "Lost by rule" kinds. ✓
- 2.15.4: expedite, 13 good returns win the point for the receiver. ✓ 2.15.6: stays on for the rest of the match. ✓
