---
name: sportfolio-auth-smoke
description: Run `node scripts/auth-smoke.mjs` before every publish — probes live Supabase Auth errors/settings vs friendlyAuthError; Supabase email OTP is 8 digits (app is length-agnostic since 416bbec)
metadata:
  type: feedback
---

The founder was frustrated on 2026-10-26 at spending time on basic sign-up/sign-in problems: an 8-digit email code vs the app's "6-digit" label; "no account" shown as "sign-ups disabled"; a wrong code shown as "expired". They asked for everything in this area to be checked thoroughly, not issue by issue.

**Why:** basic sign-in failures cost the founder's time and users' trust; they want to move on to important product work.

**How to apply:**
- Before any web/OTA publish, run `node scripts/auth-smoke.mjs` (made-up address; no accounts created, no emails sent). Fix anything ✗ first.
- For any auth change, check the real API message, not an assumed one.
- The human inbox/SMS steps are in `docs/testing/sign-in-test-script.md`.
- Supabase settings: email OTP length is 8 on this project; Supabase phone provider is off (Firebase does mobile); `mailer_autoconfirm` is true (pilot).
- Proactively sweep sibling flows when one auth bug appears.

Related: [[sportfolio-shared-device]], [[sportfolio-resend-email]], [[sportfolio-app-lifecycle]].
