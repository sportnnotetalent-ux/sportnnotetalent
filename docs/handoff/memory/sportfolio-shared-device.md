---
name: sportfolio-shared-device
description: One phone/browser acts for one account — sign-out releases push token + alerts + reminders; claim_push_token on sign-in; others see only "verified" (68dfdbb, migration 20261026120000)
metadata:
  type: project
---

Found 2026-10-26 in the founder's verification test on a shared phone. A friend's pushes and in-app alert followed the phone to the next account. Live had 1 Expo token on 3 profiles, because push_tokens was keyed (profile_id, token) and sign-out never removed it.

**Fix (68dfdbb):**
- **Sign-out:** `src/core/deviceSignOut.ts` runs before supabase signOut:
  - releases the phone's push_tokens row;
  - unsubscribes web push;
  - clears notifyStore;
  - cancels scheduled reminders;
  - 3 s cap when offline.
- **Sign-in:** `savePushToken` calls rpc `claim_push_token` (fallback upsert). Web runs `resaveWebPushIfOn`.
- **Migration 20261026120000:**
  - dedupes tokens and adds a unique index on token, plus `claim_push_token`;
  - `players_view` gives others the verification only as `{"status":"approved"}` (it used to expose pending/rejected).

**UI in the same commit:** status pills wrap (verifyHead/reviewCardRow/live-scoring header); `docKindLabel()` replaces raw uploaded file names.

**Why:** shared phones are common for families and schools; a child's notices must not reach the next person.

**How to apply:** any new per-user device state must also be cleared in `releaseDeviceForSignOut`. Status: LIVE 2026-10-26 (migration run, web index-3c654682 + OTA 73bc9e58).

Related: [[sportfolio-push-notifications]], [[sportfolio-org-verification]], [[sportfolio-web-crash-noise]].
