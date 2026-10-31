---
name: sportfolio-scorer-model
description: "Sportfolio/SportnNote match scorer & host data model — PLAYER ids, RLS, multi-scorer (avoid regressions)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-25T21:35:46.336Z
---

Match `scorer_id`, `scorer_ids[]`, and `host_ids[]` all hold **PLAYER ids** (not profile ids). The app compares against the viewer's player id (`getMyPlayerId`), e.g. `canScore = scorerIds.includes(myPlayerId)`.

RLS `can_manage_match()` grants: `scorer_ids && auth_player_ids()` OR `scorer_id = any(auth_player_ids())` OR `host_ids && auth_player_ids()` OR tournament organizer (`t.organizer_id = auth.uid()`, a PROFILE id) OR `t.host_ids && auth_player_ids()`.

**Original bug (fixed 2026-09-26, migration `20260927120000_multi_scorer.sql`):** `matches.scorer_id` FK pointed at `profiles(id)` and `can_manage_match` compared it to `auth.uid()`, but the app always wrote a player id → FK violation → UPDATE silently rejected (error unchecked) → scorer never persisted in live mode (worked in demo, no FK). Fix: FK → `players(id)`, added `scorer_ids uuid[]` for **multiple scorers**, `setMatchScorers()`/`setMatchHosts()` now throw on error and the UI reverts + Alerts. `scorer_id` kept = `scorer_ids[0]` (primary, for reminders).

Gotchas when touching this: anything reading `scorer_id` as a profile id is wrong — e.g. `notify-upcoming` must map scorer player id → `players.profile_id` before pushing. Requires redeploying `notify-upcoming` after the migration. See [[sportfolio-devlog]] (2026-09-26 entries) and [[sportfolio-golive-readiness]].
