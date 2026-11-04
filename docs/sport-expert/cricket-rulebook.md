# Cricket: rulebook audit (2026-11-05)

Eighteenth sport. Cricket has the deepest scoring in the app (`docs/sport-expert/cricket.md`, the CricHeroes parity pass, dismissals / penalties / NRR batches).

## Sources

| Document | Version | Link |
|---|---|---|
| MCC Laws of Cricket, 2026 code (73 updates) | In force 1 Oct 2026 | https://www.lords.org/mcc/about-the-laws-of-cricket |
| Summary of the 2026 changes | Feb 2026 | https://organiser.org/2026/02/04/338433/world/crickets-new-rulebook-what-has-changed-mcc-unveils-73-updates-to-the-laws-of-cricket-effective-from-october-2026/ |

## Result

The 2026 changes are about umpiring definitions, not how a ball is scored:
- the last over of a day isn't ended by a wicket;
- overthrows are defined (when runs from a throw count);
- "receiving the ball" lasts until the batter regains balance;
- a ball must be held with complete control for a run-out or stumping;
- boundary catches (an airborne fielder beyond the boundary may touch the ball once, as ICC since 2025).

The scorer still records the umpire's outcome (runs and overthrows, catch / six, run-out), which the app already covers.

| # | Priority | Gap | Status |
|---|---|---|---|
| CK-1 | P3 | Multi-day "last over of the day" timing | The app has no day structure for multi-day matches yet (cricket multi-innings is on the backlog). |

No scoring findings.
