---
name: sportfolio-sport-equality
description: "Founder's core principle — every sport equally important; scoring depth and match/team/tournament/player stats must meet international standard for all 14 sports (sport-depth audit 2026-10-10)"
metadata:
  node_type: memory
  type: project
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-10T09:39:40.748Z
---

**Founder direction (2026-10-10):** SportnNote is not a cricket app. Every sport carries equal importance, and depth of scoring across all sports is "the crux of this app". Statistics at the match, team, tournament and individual-player levels must meet the international standard of each sport's governing body.

**Why:** the pilot audience is multi-sport school and college meets in India. A thin sport undermines trust in the whole product.

**How to apply:**
- Treat cricket's post-parity depth as the floor for every sport, not the ceiling.
- When adding any feature (stats, awards, standings, guides), build it generically for all sports, or at least plan each sport's version. Never ship a cricket-only capability without noting the per-sport follow-up.
- The audit lives in `docs/sport-depth/`: a README with the method, one file per sport, `cross-sport.md`, and `PLAN.md` as the build queue. Seven auditors ran in parallel on 2026-10-10. At the time, the thinnest engines were table tennis, pickleball and squash (about 80 lines each) and chess and carrom; cricket had about 3,800 lines.
- Build the resulting queue with the same protocol as [[sportfolio-cricheroes-parity]]: one item at a time, tests, demo on 8093, a public guide per [[sportfolio-feature-guides]], and no push or deploy without asking.

Related: [[sportfolio-sport-coverage-audit]], [[sportfolio-sports-policy]].

**Founder decisions (2026-10-10):**
- Order: (1) live correctness bugs, (2) shared foundations, (3) per-sport depth plus new sports.
- New sports to add after the foundations: all timed or measured sports (athletics, swimming, archery, shooting, weightlifting, cycling, rowing, canoe/kayak, as proposed), plus hockey (FIH) and handball (IHF).
- Skip NFL, rugby and other team sports not widely played in India for now.
- Judged sports (gymnastics, diving, boxing) are not in this batch.
- The foundations must cover timed/measured results (a golf-like field-results engine generalised) and hockey/handball from day one.
