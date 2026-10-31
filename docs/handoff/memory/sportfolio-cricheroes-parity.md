---
name: sportfolio-cricheroes-parity
description: "CricHeroes-parity build queue (docs/cricheroes-parity/) — protocol, state at 2026-10-09 (all 25 DONE), founder actions pending"
metadata:
  node_type: memory
  type: project
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-09T02:35:35.202Z
---

The user runs a research→coding loop in `docs/cricheroes-parity/`: README (protocol), BACKLOG (READY → IN-PROGRESS → DONE + hash), CHANGELOG (new specs/updates — re-read between features), REVIEW.md (binding, wins over specs; fixed migration names `2026101912NN00_<slug>.sql`), PROGRESS.md (newest-first entries for the founder). The docs folder itself is left untracked (never staged).

Protocol the user set: one feature at a time in queue order, one local commit per feature (own files only), `npm run check`, demo check on 8093 (8091 is LIVE), update DEVLOG, never push/deploy/run live migrations — write migration + `supabase/release/` bundle and list it in PROGRESS. Ask only on real product decisions; otherwise pick simplest and note it. When no READY items remain, write "Queue empty at <time>; waiting for specs" in PROGRESS and stop.

State 2026-10-09 08:05: items 01–25 DONE (last commit e3783a8), 803 tests. Migrations 0038–0047 RUN by founder 2026-10-09 (runbook supabase/release/2026-10-parity-0038-0047-RUNBOOK.md). Vault secrets set 2026-10-09 (WEBHOOK_SECRET regenerated). notify-followers + notify-upcoming deployed 2026-10-09. Pushed + Android OTA 056ef4d3 2026-10-09. Staging alert check passed 2026-10-10; web published; APK 36 built. Open: decisions made 2026-10-10: #12 → same-school staff (0048 + org-integrity 0049, both run live 2026-10-10); #18 → keep method, research to source full DLS table (drop in as dlsV=3).

**How to apply:** if the user says "continue the queue", re-read CHANGELOG/BACKLOG for new READY items and follow the same loop. Related: [[sportfolio-devlog]], [[sportfolio-repo]].
