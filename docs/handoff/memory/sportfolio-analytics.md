---
name: sportfolio-analytics
description: First-party analytics + crash reporting (migration 0029) — chose own Supabase over PostHog/Sentry; KPI views; status of live rollout
metadata:
  type: project
---
Built 2026-10-07, committed 2e31672. Migration 0029 `20261010120000_analytics.sql`: DB triggers log core KPI events (signed_up, match_*, tournament_created, round_*, message_sent, phone/email_verified); app sends only app_open/screen_view + errors via track_events/report_client_error RPCs (src/core/telemetry.ts, ErrorBoundary). KPI views kpi_weekly/kpi_sport_weekly/kpi_activation/kpi_scorer_retention/kpi_crash_free/errors_top — service role only (SQL editor). Doc: docs/analytics.md.

**Why first-party:** OTA-shippable (no native module) to the APK, DPDP (minors, no third-party processor), free. Roadmap had suggested Sentry+PostHog; Sentry deferred to next native build for native crashes.

**How to apply:** LIVE 2026-10-07 (0029 run, web republished, events arriving). New client event names must be added to the track_events allow-list in SQL. Related: [[sportfolio-master-roadmap]], [[sportfolio-security-hardening]].
