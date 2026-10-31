---
name: sportfolio-cue-sports
description: Pool / snooker / English billiards — integrated 2026-10-28 (5835aa3), founder rule answers + usability built (3399035), not live yet
metadata:
  type: project
---

Founder 2026-10-27: add pool + snooker (+ English billiards), shot-by-shot scoring. Engines (src/sports/{pool,snooker,billiards}/engine.ts) merged 2026-10-28; app plugins built by two worktree agents under the quality mandate and merged + shared wiring 2026-10-28 (records, standings presets, team ties, FRAMES/RACKS scoreboard, demo seed `__sportnnoteDemo.seedCueSports()`, guides score-pool/snooker/billiards.md). NOT published yet — ships with the Waves 3–4 publish (notify-upcoming must be redeployed: prepReminders list).

**Why:** founder wants cue sports in the Sports section, international rules (WPA / WPBSA).
**How to apply:** founder rules decided 2026-10-28: scotch-doubles golden break → the breaker; billiards league tables count POINTS (hand-ended too; snooker/pool stay frames/racks); break-list floors 20+ snooker / 25+ billiards; pool race + sets lock at the first event (no live settings). Usability follow-ups all built (Scotch doubles label, pick-then-record pool fouls, toss row unmarked until tapped + "Toss not recorded", live correction link waits for a finished frame). Break list docs/security/breaks/founder-answers-2026-10-28.md. Live had 0 cue matches on 2026-10-28. Related: [[sportfolio-sport-equality]], [[sportfolio-quality-mandate]].
