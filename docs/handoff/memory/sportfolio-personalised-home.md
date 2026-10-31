---
name: sportfolio-personalised-home
description: "First-run questions + Home \"Near you\" + match views (2f1534b, 2026-10-31); needs cities SQL via terminal + main migration + publish"
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-31T05:31:51.982Z
---

Founder brief 2026-10-31: first-login questions saved straight to the profile; one-tap Skip (someone at the ground in a hurry); Home shows live matches near them.

Founder decisions:
- The first question is how they'll use the app (play / organise / score / parent / fan).
- Location is "while using" only.
- View counts show from 25.
- **Under-18 matches show in Near you like any match** (I recommended city-only; founder chose this; flagged for the lawyer review).

**LIVE 2026-10-31:** both migrations run by the founder (8,079 cities), web index-a63038dc, Android OTA 919078ce, from ace696f. Built in 2f1534b:
- `PersonaliseScreen`.
- `NearYouSection`.
- `core/personalise.ts`, `core/location.ts`, `data/personalise.ts`.
- `SPORT_POSITIONS` in `sportProfileFields.ts`.
- Migrations `20261031110000_cities` (GeoNames, 8,079 towns, 529 KB: founder runs it with `npx supabase db query --linked --project-ref mpgbvbylmkwasjgupsbq -f supabase/migrations/20261031110000_cities.sql`) and `20261031120000_personalised_home`.
- expo-location 56.0.26 (native, guarded by `requireOptionalNativeModule`): phones get location only from the store builds.

Rules:
- Opens from Home only (never over deep links), once per account; skip is stored server-side.
- Location is adults only (PH-10), sent via POST (PH-03).
- Anonymous views count per IP (PH-01).
- `near_matches` places candidates once (PH-08: 335 → 14 ms).

**How to apply:** the publish order is cities SQL (terminal) → main migration → auth-smoke → web + OTA. Store data-safety now declares approximate location, processed ephemerally. Related: [[sportfolio-store-launch]], [[sportfolio-quality-mandate]].

**Follow-up 2026-10-31 (f8e8fa7, migration `20261031130000_near_places` — founder to run, server only):** the founder's own live match was missing because live data has no places (no pins or tournament cities). Matches are now also placed by the home city of their hosts, scorers and tournament hosts (adults), then the organiser's; "live" matches untouched for 12 hours are skipped. Lesson: real data rarely has venue pins or cities, so place by people; and lateral lookups beat joining CTEs (generic plans rescanned them per row, ~4.6× slower).

