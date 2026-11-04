# Kabaddi: rulebook audit (2026-11-05)

Fifteenth sport.

## Sources

| Document | Version | Link |
|---|---|---|
| PKL Season 12 format (tie-breaker in every match) | 23 Aug 2025 | https://www.prokabaddi.com/news/pkl-season-12-new-format-2025 |

## Result

Already built:
- the PKL tie-breaker: a 5-raid shoot-out (5 different raiders alternate; no outs or revivals, only points count), then a Golden Raid, then a toss (`START_SHOOTOUT`, `decideRaidShootout`);
- the Golden Raid straightaway, or extra time then a Golden Raid, as organiser deciders;
- super tackle (+2 with 3 or fewer defenders), do-or-die raid, bonus line, Sanjeevani revival style.

| # | Priority | Gap | Status |
|---|---|---|---|
| KB-1 | P3 | The decider list names "Extra time" and "Golden Raid" but not "5-raid tie-breaker (PKL)". The shoot-out is started from the scoring screen. | Possible wording tweak. |

No scoring findings.
