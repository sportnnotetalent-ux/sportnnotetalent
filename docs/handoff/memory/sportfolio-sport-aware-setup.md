---
name: sportfolio-sport-aware-setup
description: "Sport-aware match/tournament setup (individual vs team vs pairs) + verification backends — multi-slice initiative, remaining slices listed"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-22T06:23:03.618Z
---

Started 2026-08-29 from a big user request: make the app **sport-aware, not sport-labelled** — setup must adapt to whether a sport is individual / team / both, and Tennis Singles must not show "Teams". Plus: audit + wire the Profile age/ID + phone/WhatsApp verification workflows.

Four read-only audit agents mapped reality; user chose **"Tennis end-to-end first"** + **"build both verification backends now"**.

**Architecture shipped (branch feat/sport-formats-and-scoring):**
- `SportPlugin.participantKind: 'team' | 'individual' | 'both'` (the 5 racket sports = 'both'; team sports omit = 'team'). Helper `participantMode(sport, format)` in registry.ts resolves a format → 'team' | 'individual' (Singles, playersPerSide 1) | 'pairs' (Doubles, ≥2).
- ScheduleMatchScreen is now participant-aware: structure-first (Singles/Doubles) for 'both' sports, then Player 1/2 (+"(me)") or Pair 1/2 pickers. All still resolve to **ad-hoc teams** (`createTeam adhoc:true`) — NO Match-schema change (the bridge). `TeamPicker` took a `noun` prop ('team'|'pair'|'player') + `onPickMe`.
- Verification: migration **0016** (private `verification-docs` bucket + Storage RLS + players support-UPDATE policy), edge fn `verification-submit` (Resend signed-link email to sportnnote@gmail.com), client uploads real bytes + `verificationDocUrl`, reviewer "View document" button. WhatsApp OTP is code-complete — only provisioning left (copy fixed to "WhatsApp isn't set up on this server yet").

**DONE since:** Tennis serve tracking + doubles rotation (tennis/engine.ts extracted RN-free; `firstServer`+`SET_FIRST_SERVER`, `serveInfo()` derived, tiebreak-aware, doubles slot; serve banner + scoreboard 🎾; +5 tests). Individual tournament draws (TournamentTeamsScreen labels entries player/pair/team by participantMode; manager capture hidden for individuals; bracket gen already pairs ids).

**DONE (2026-08-30 batch):** doubles two-name capture (pairs picker creates 2 player rows as a roster; serve names them for VERIFIED players — the `matchEligibility` safeguarding gate filters unverified ad-hoc players, so casual friendly pairs show "Server 1/2"). Padel + badminton serve tracking (shared `src/sports/serve.ts` for tennis+padel; badminton has its own rally-winner-serves `serve()`).

**DONE (2026-08-31):** verification review from the profile (support reviewer viewing any profile gets View doc + Approve/Reject inline; own profile shows "Verification review · N pending" card → queue) — fixes the "notification is the only way in / no actions on the profile" gaps. Pickleball/squash doubles: rally/PAR now shows a "Serving: <name>" banner (side-out already named server 1/2 from the roster).

**FOLLOW-UP (noted 2026-09-22): custom SMTP for Supabase auth emails.** Email confirmation is ON (user wants it on) and sign-up now shows a prominent "check your inbox" callout (AuthScreen, commit 7192ad7, in preview build versionCode 14 / bd6f93cd — the one shared with friends to sign up). But Supabase's DEFAULT auth-email sender is rate-limited + often lands in spam, which can break a real signup test. Follow-up when needed: set a custom SMTP sender in Supabase → Authentication → SMTP (reuse the existing Resend key already wired for app emails) so confirmation/reset emails deliver reliably. Not yet done.

**Verification provisioning: LIVE (2026-08-31).** Migration 0016 run; `verification-submit` edge fn DEPLOYED (via `npx supabase@latest`, since brew CLT was too old); support role granted to sportnnote@gmail.com (handle `sportnnote`, "Sportnnote Admin") — grant matched via `auth.users.email` (profiles has no email col). RESEND_API_KEY assumed set (shared with support-escalate). WhatsApp OTP still = Meta provisioning (theirs).

**STANDING RULE (user-decided 2026-08-31):** the `matchEligibility` safeguarding gate applies to ALL matches, **friendlies included — never bypass it**. Unverified players (no DOB / adult without verified mobile+email / minor without verified guardian) stay unscoreable everywhere; a consequence is doubles friendly pairs show "Server 1/2" until their players are verified. Do NOT add a friendly-exemption. (`src/core/eligibility.ts`.)

**Remaining slices (optional):**
1. Apply participant-aware picker to EditMatch/CreateSeries entry points too.
2. Deeper option (deferred): individuals as first-class Match participants (schema, scoring contract, nav) instead of the ad-hoc-team bridge.

**Verification backend provisioning (user-side, 2026-08-30):** migration 0016 run. Still: deploy `verification-submit` edge fn (they have supabase CLI in their own shell, not in the assistant's sandbox), grant support role (SQL), RESEND_API_KEY likely already set (shared with support-escalate). WhatsApp = Meta provisioning (theirs).

User must: run migration 0016, deploy verification-submit, set RESEND/SUPPORT secrets, grant one account the support role; and do the Meta WhatsApp provisioning (docs/whatsapp-otp-setup.md). See [[sportfolio-repo]] [[sportfolio-product-mandate]] [[sportfolio-devlog]].
