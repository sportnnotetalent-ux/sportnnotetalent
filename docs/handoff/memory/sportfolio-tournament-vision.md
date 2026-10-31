---
name: sportfolio-tournament-vision
description: "Sportfolio's core purpose + the tournament-organization acceptance test (schedule real international tournaments as-is)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-08-07T17:24:44.116Z
---

Stated by the user 2026-08-07. Sportfolio is for people playing a sport **at any level** (not just pro) to track their own gameplay — and, longer term, an ecosystem to identify talent across sports/globe at the same level, and a way for amateurs to come back and see how they did when friends discuss a past game. Three pillars must all be excellent: (1) **scoring** on point for all sports; (2) **statistics** rolling up correctly and as in-depth as possible; (3) **tournament organization** — the end-to-end experience of organizing, conducting and tracking a real ground-level tournament must be replicable in-app. Pillar 3 is the main draw ("everyone comes to track tournaments mainly").

**Acceptance test (litmus):** you should be able to schedule a real international tournament *as-is* in the app — e.g. FIFA World Cup 2026, an Asia Cup cricket edition. If you can schedule it end-to-end, the options exist; where you can't, that's the work.

**Progress (all shipped 2026-08-07, see [[sportfolio-devlog]]):**
- ✅ **Tournament participants** — register the teams in a tournament + count (migration 0003 `tournament_teams`); drives the auto-fixtures picker default.
- ✅ **Groups config** (# groups, top-K, best-placed wildcards) — Phase 2a/2b, migration 0002.
- ✅ **Custom-control (a)** manual stage tagging + a real, advancing stage-driven bracket ("Create next round" from winners).
- ✅ **Custom-control (b)** organizer picks who advances (override rule-based qualifiers; `qualifiersFromSelection`).
- ✅ **Custom-control (c)** play-in rounds for odd fields — top seeds bye, `planKnockout`/`seedPlayIn`, byes stored on play-in matches (migration 0004 `byes uuid[]`), bracket merges byes+winners into a clean round. This covers the 12→8 / non-power-of-2 case the user described.

- ✅ **Litmus validation pass** — `tests/litmus.test.mts` drives the real engine at full scale for FIFA WC 2026 (48→12 groups→32→R32→…→Final) and Asia Cup (6→2 groups→Super Four→Final); both spot-checked in demo.
- ✅ **Super Four / multi-phase** — Advance from the group stage can target "🔁 To Super round-robin" (a 2nd round-robin, `stage:'super'`); advance is phase-aware and advances Super→Final; tournament page shows the Super table. Unblocks Asia Cup / Super Six/Eight.
- ✅ **3rd-place playoff** — BracketScreen "🥉 Create 3rd-place playoff" pairs the two SF losers (`stage:'third'`).

**Litmus status: both FIFA WC 2026 and an Asia Cup are now schedulable end-to-end in-app.**

**Still open / nice-to-have:** bracket subtitle count excludes the 3rd-place match (cosmetic); no automated seeding for a pure-knockout (participant order is the seed).

**Live migrations:** 0002, 0003, 0004 must be run in Supabase before live use (user ran 0002 + 0003; **0004 (byes) pending** as of this note). Additive/idempotent.

See [[sportfolio-launch-plan]] and [[sportfolio-product-mandate]].
