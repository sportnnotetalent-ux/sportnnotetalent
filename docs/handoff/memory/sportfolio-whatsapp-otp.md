---
name: sportfolio-whatsapp-otp
description: "WhatsApp phone-OTP verification — code-complete + partly provisioned, BLOCKED on a production WABA (test WABA can't create templates)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-25T18:46:48.769Z
---

Phone-number verification over WhatsApp (mirrors email OTP). Goal: enter phone → Verify → 6-digit code on WhatsApp → enter it → `phone_verified` flips. Entry point = Profile → ContactCard → phone-row "Verify" (works post-signup; can't verify at signup itself since edge fns need the auth session — a post-signup "verify now" nudge is an optional add the user hasn't requested).

**Code: DONE.** `supabase/functions/send-contact-otp` sends via Meta Cloud API (Graph v21) using an approved AUTHENTICATION template; `verify-contact-otp` checks the hashed code (10-min expiry, attempt cap) and sets `phone_verified`. Uses secrets `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, optional `WHATSAPP_OTP_TEMPLATE` (default `sportnnote_otp`) / `WHATSAPP_TEMPLATE_LANG` (default `en`). Body param = code + copy-code URL button param = code. Falls back to an on-screen demo code when unconfigured, so nothing breaks. Doc: `docs/whatsapp-otp-setup.md`.

**Provisioning state (2026-08-31):** `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` secrets SET; `send-contact-otp` needs a redeploy after any secret change (`npx supabase@latest functions deploy send-contact-otp --project-ref mpgbvbylmkwasjgupsbq`).

**BLOCKED HERE:** the `sportnnote_otp` template can't be created. The account is a **Test WhatsApp Business Account** (WABA ID `1603842007942377`, owned by SportnNote). Both the WhatsApp Manager UI and the Graph API return **error subcode 2388185 "This WhatsApp Business account does not have permission to create message template"** — a hard test-WABA restriction.

**UPDATE 2026-09-26 — real blocker is BUSINESS VERIFICATION, not tokens.** User completed the production WABA + real number + payment: production WABA **SportnNote, ID `2782613618805997`** (owned by SportnNote business; test WABA is `1603842007942377`; system user id `122093377929500098` — NOT a WABA, don't use as one). Template `sportnnote_otp` STILL can't be created — fails with err 2388185 "does not have permission to create message template" via API (all tokens) AND in the **full-admin WhatsApp Manager UI** on the correct production WABA. That proves it's an **account-level gate: the SportnNote business must complete Business Verification** (Business Settings → Security Center) before templates can be created. Nothing code/token-side will fix it. Once verified: create the `sportnnote_otp` auth template (UI or curl), set WHATSAPP_TOKEN (system-user token, both wa perms) + WHATSAPP_PHONE_NUMBER_ID (the +91 91547 93211 number's id) secrets, redeploy send-contact-otp, test. Decision pending: push through verification vs defer WhatsApp OTP (email verify already works; phone uses on-screen fallback meanwhile).

**(superseded) earlier remaining step:** graduate to a **production WABA** — WhatsApp → API Setup → Add phone number → add a REAL dedicated number not already on WhatsApp, verify it. That yields a new production Phone Number ID (+ its own WABA ID). Then: (1) create the auth template on the production WABA, (2) set `WHATSAPP_PHONE_NUMBER_ID` to the new production id, (3) redeploy send-contact-otp, (4) test. For scale, complete Business Verification (Security Center) — unverified tier ~250 convos/day is fine for pilot. Template-create curl (needs token with `whatsapp_business_management`):
`curl -X POST "https://graph.facebook.com/v21.0/<PROD_WABA_ID>/message_templates" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"name":"sportnnote_otp","language":"en","category":"AUTHENTICATION","components":[{"type":"BODY","add_security_recommendation":true},{"type":"FOOTER","code_expiration_minutes":10},{"type":"BUTTONS","buttons":[{"type":"OTP","otp_type":"COPY_CODE"}]}]}'`

Email OTP (Resend) already works. See [[sportfolio-sport-aware-setup]] (verification backend), [[sportfolio-repo]].
