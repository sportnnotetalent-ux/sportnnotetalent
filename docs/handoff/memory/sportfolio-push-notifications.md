---
name: sportfolio-push-notifications
description: "SportnNote push/notification architecture — local vs remote, edge fns, and the FCM/cron/webhook ops steps needed for background delivery"
metadata:
  node_type: memory
  type: reference
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-26T06:09:48.057Z
---

Notification paths in SportnNote:
- **Local** (`src/core/notifications.ts`): `notify()` → in-app feed (`notifyStore`) + immediate local OS banner on the current device; `syncScheduledLocal()` schedules future dated reminders that fire when closed. Android needs a channel (`default`, created in notifications.ts) or nothing shows.
- **Remote push** (Expo Push API `https://exp.host/--/api/v2/push/send`): tokens live in `push_tokens` (RLS = owner only). Registered on login (`registerForPush` → `savePushToken`).
- Since 2026-09-26: `notify()` routes a message addressed to **another** user (playerId ≠ `currentPlayerId`, set via `setCurrentPlayerId` on login) to remote push via `repos.pushToPlayers()` → **`push-send`** edge fn (auth-required; player→profile→tokens→Expo, service role). Messages for me stay local.

Edge functions: `push-send` (client-triggered app-event push), `notify-upcoming` (cron pre-match reminders; scorer targeting maps player→profile), `notify-followers` (DB webhook on `stat_lines`).

**Background delivery needs these OPS steps (user does them; I can't):**
1. **FCM V1 credentials in EAS** — Firebase project → service-account JSON → `eas credentials` → Android → FCM V1. One-time, no rebuild. Without it `getExpoPushTokenAsync` returns null and Android delivers nothing. THE gating blocker.
2. `supabase functions deploy push-send` (+ redeploy `notify-upcoming` after the multi-scorer change).
3. Enable schedules: `notify-upcoming` cron (pg_cron/scheduled function) + `notify-followers` DB webhook on `stat_lines` (Dashboard → Database → Webhooks).
4. Grant the OS notification permission on the device.

Pilot caveat: `push-send` lets any authed user notify any player — tighten to a match/team/tournament relationship check before scaling. See [[sportfolio-scorer-model]], [[sportfolio-golive-readiness]].
