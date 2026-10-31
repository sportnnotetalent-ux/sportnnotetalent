---
name: sportfolio-resend-email
description: Resend email — key was invalid 2026-10-07, founder replaced it same day; domain sportnnote.in verified; sender SportnNote <no-reply@sportnnote.in>; working
metadata:
  type: project
---
2026-10-07: live RESEND_API_KEY was invalid (401) → founder created a new key in the EXISTING Resend account (sportnnote.in already verified there) and set it via `npx supabase secrets set`. Verified: weekly-report sent, From = `SportnNote <no-reply@sportnnote.in>` (SUPPORT_FROM secret), so mail reaches any recipient. Used by send-contact-otp, send-invite, support-escalate, message-notify, guardian-link, verification-submit, weekly-report.

**How to apply:** if emails fail again, test with weekly-report POST {} (returns Resend's error). Founder sets secrets themself; never take keys in chat. Related: [[sportfolio-analytics]].
