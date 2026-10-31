---
name: sportfolio-support-console
description: Support console (07254c8) + link earlier editions (04594e8) LIVE 2026-10-27 — both migrations run, verification-review deployed, web 1f2f5ffe, OTA 1a6f6065
metadata:
  type: project
---

Built 2026-10-27 at the founder's request ("go ahead with linking earlier editions and then support console"):
- **Link an earlier edition** (04594e8): Manage › 🔗 Link an earlier edition; trusted RPC link_tournament_edition (both organised, earlier, no branch, no loop). Migration 20261027160000_link_editions also makes Run it again refuse a second next edition.
- **Support console** (07254c8): Settings › Support tools › Support console (support role only). Tiles, filters, claims (support_claims, 2 h, server-enforced via guard_org_decision_claim + verification-review edge fn), J/K/C/Esc, this week per person. Migration 20261027170000_support_console. Adding a support person = SQL `update profiles set role='support'` (docs/verification/org-verification.md).

**Why:** schools link pre-feature editions; a future support team shares the verification queues ([[sportfolio-org-verification]], [[sportfolio-run-it-again]]).
**How to apply:** live and verified read-only 2026-10-27. Still to do from the doc: register-lookup automation (UDISE+/SARAS). Founder hasn't added any second support person yet.
