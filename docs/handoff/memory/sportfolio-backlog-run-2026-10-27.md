---
name: sportfolio-backlog-run-2026-10-27
description: Whole backlog built 2026-10-27; items 1-5 LIVE (web 554fcf47, OTA 16f9b0a6, register-lookup deployed, both migrations run, auth hook ENABLED); SDK 57 waits on branch sdk57 — 1.1.0 APK to be built near go-live (founder decision)
metadata:
  type: project
---

Founder 2026-10-27: "go ahead with your entire backlog one after the other and give me the things you would need from me at once". All six built and committed on the main branches (cfc6141 → 037abb9), not yet live:
1. Sign-up guard — Postgres Before User Created hook (migration 20261027180000_signup_guard); needs founder to enable in Auth → Hooks. No CAPTCHA (APK 41 has no WebView; Supabase CAPTCHA covers all sign-ins).
2. Register lookup — edge fn register-lookup reads CBSE SARAS by affiliation no. (UDISE+ needs CAPTCHA per search → copy only). Needs deploy.
3. Org verification Phase 3 — intl IDs per market (migration 20261027190000; org_id_requirements generated from app MARKET_IDS; unique index local list extended).
4. DLS v3 — full ICC over-by-over Standard Edition table (dls.ts TABLE_V3), engine dlsT fixed by first t:3 event; old logs replay unchanged.
5. SMS spend cap — 5/device/day, 3/number/day in app; optional billing hard-stop Cloud Function (ops/gcp/sms-billing-cap, docs/ops/sms-spend-cap.md).
6. SDK 57 — on branch sdk57 (3f07fc2, Expo 57.0.31, RN 0.86.3, version 1.1.0). NEVER publish OTA from sdk57; merge only when building the 1.1.0 APK. Expo latest is SDK 58 (separate decision).

**Status 2026-10-27 (late):** founder pushed both branches (main = feat = c88f6e0, sdk57 = 3f07fc2 on origin) and confirmed the Before User Created hook is enabled. Founder decision: build the 1.1.0 APK (merge sdk57) **near go-live** — not now. Suggested window: week of 23 Nov 2026, so it's the download before pre-launch 7 Dec; at that point re-check SDK 57 vs 58 and consider Firebase App Check (Play Integrity) for SMS in the same build.

**Why:** clear the backlog before pre-launch (7 Dec). **How to apply:** after founder runs SQL + enables hook + approves, deploy register-lookup then publish web/OTA from main; verify live read-only (functions/tables exist). Related: [[sportfolio-status-2026-10-25]], [[sportfolio-org-verification]], [[sportfolio-support-console]].
