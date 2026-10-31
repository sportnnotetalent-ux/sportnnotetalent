---
name: sportfolio-error-tracking
description: Daily error triage — email labels new/older/noise; scheduled morning check (08:30 IST) prepares fixes on fix/errors-<date> branches
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-29T17:02:20.407Z
---

Founder asked 2026-10-29 for automatic daily error handling; chose "Both".

- Labels in `supabase/functions/_shared/errorTriage.ts`: new (live web build or phone), older (web bundle hash ≠ live one at app.sportnnote.in), noise (bare "Unexpected token '<'" with no bundle; "Script error." always — its stack is our reporter's).
- Daily email (weekly-report, period day) uses it; subject counts new errors only. Committed 6f45917; deployed LIVE 2026-10-29.
- `scripts/error-triage.mjs [hours]` = same rules on live data, read-only, JSON out.
- Scheduled task `sportnnote-morning-errors` (08:30 local, Auto mode): runs the script, fixes ≤3 new real bugs test-first in worktree `~/Desktop/rudy/sportfolio-fixes/errors-<date>` on branch `fix/errors-<date>`, report to `~/Desktop/rudy/error-reports/<date>.md`. Never pushes/deploys/writes DB.

**Why:** error text is attacker-writable (anon inserts), so the agent's actions are bounded (break-it ET-01..08 in docs/security/breaks/error-triage.md).
**How to apply:** when the founder says "publish" for a fix branch, review it, merge into the main branch, then the usual publish flow. Related: [[sportfolio-quality-mandate]], [[sportfolio-web-crash-noise]].
