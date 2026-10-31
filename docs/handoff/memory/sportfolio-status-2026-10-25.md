---
name: sportfolio-status-2026-10-25
description: "Consolidated outstanding-task list, refreshed 2026-10-27 late after the whole backlog went live — founder to-dos, decisions, company-blocked items, dates, my backlog"
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-26T14:28:11.949Z
---

Snapshot given to the founder on 2026-10-26 when they asked to "bring back all the outstanding tasks". It replaces the 2026-10-25 version. Checked against live (read-only) that day: 28–29 players, 0 certificates, 0 verified orgs, 0 pending age or org checks, 1 support account, 0 trusted reviewers. The first weekly API-traffic snapshot ran 2026-10-26 09:00 IST. The minor-names check was clean (0 everywhere) on 2026-10-27; the earlier 1 flagged team name resolved itself.

**Live 2026-10-27 night:** safety-net SQL run + verified (booleans-only test), golf Run it again live — web index-2274b587, OTA 3a66dc4f from 1c71159; DEVLOG afbe83c (unpushed). Founder then asked for proper bulk student upload (class-wise, section-wise, new across classes, recognise existing / no duplicates) — plan + 3 questions given, awaiting answers; existing SD-154 CSV import (RosterImportScreen / data/rosterImport.ts) is the base.

**Decided 2026-10-27:** 1A — DOB confirmation types as built (education + sports club/academy/association); parent confirmation counts for "confirmed", school/club for "verified" (+ children without accounts). 2A — server masks children's names to initials in new match_events + matches.state (migration 20261027200000_match_names_safety_net, commit 1c71159) — founder must run the SQL; nothing refused, fails open. Golf Run it again 4700407. Both await push + "publish web and OTA" (golf) / SQL run (safety net).

**Correction 2026-10-27:** the open decision is "when should the server start REFUSING player-name keys in match events (append_match_event safety net, docs/privacy/ids-only-scoring.md)" — I once mislabelled it "children's names in team names". Live read-only 2026-10-27: 0 match events since IDs-only shipped (24 Oct), 142 old named events (last 12 Oct), so no evidence yet on old app versions. DOB decision = which verified community types may confirm members' DOBs (built: 6 education types + sports club/academy/association; excluded company/hospital/NGO/housing). Golf in Run it again built (4700407), awaiting publish approval.

**Refresh 2026-10-27 late (given again, after the backlog went live):** live read-only: 30 players, 10 accounts, 7 live tournaments, 2 communities, all queues empty, 0 verified orgs, 0 linked editions, 0 sign-up guard hits, 0 client errors in 12 h. Done + live: sign-up guard (hook enabled), CBSE register check, international IDs, DLS v3, SMS cap. My backlog is now empty of committed work; the 1.1.0 APK (sdk57) waits until near go-live (founder decision; suggested week of 23 Nov). New founder to-dos: try the CBSE register check + an international community; optional SMS hard stop; confirm SMS region policy India-only.

**Refresh 2026-10-27 evening (given again):** live read-only: 30 players, 7 live tournaments, 2 communities, all queues empty (0 org / 0 age / 0 reports), 0 verified orgs, 0 certificates, 0 linked editions, 1 support account; 0 client errors since the 26 Oct fix (4 old ones in the 24 h window). Newly done + live: link earlier editions, support console ([[sportfolio-support-console]]). Backlog now: anti-scraping (recommended before 7 Dec), register-lookup automation (UDISE+/SARAS), Phase 3 international IDs, DLS v3, SMS cap, SDK 57. Recommended next: decision 5 (children's names in team names) then anti-scraping.

**Refresh 2026-10-27 (given to the founder):** live read-only: 30 players, 7 live tournaments, 2 communities, 0 verified orgs, 0 pending checks, 0 certificates, 0 linked editions; 0 client errors since the 26 Oct 22:19 IST crash-noise fix (7 old ones were before it).
- Newly done: org verification Phase 2 + education types live; Run it again / Copy this setup + every event sport's pre-fill + web header fit + guide tables live ([[sportfolio-run-it-again]]).
- New founder to-do: try Run it again on a real tournament.
- New decision: DOB confirmation limited to education types + sports clubs/academies/associations (asked 2026-10-27, unanswered).
- (Edition links + support console from this backlog are now done and live.)

**Done since 2026-10-25 (do not re-list):**
- Weekly email explained; false web crash reports fixed (aa0a9e1, 0 errors since). Shared-device + verification privacy fix live (68dfdbb, migration run). Sign-in codes fixed + auth-smoke check (416bbec) — see [[sportfolio-shared-device]], [[sportfolio-auth-smoke]].
- All 8 low-cost go-live steps ([[sportfolio-golive-lowcost]]).
- APK 41 is the download; pilot users told to install it (2026-10-26).
- Stuck verification rejected.
- Guide-fix migration run.
- Custom SMTP.
- App Links and native phone sign-in are no longer company-blocked.
- Cloudflare deploys from the private repo.

**Refresh 2026-10-29 (given to the founder):** live read-only: 30 players, 10 accounts, 7 tournaments, 2 communities, 0 verified orgs, 0 pending org/age checks, 0 certificates, 1 under-18 profile (the test account — remove before go-live), 1 support account, 0 trusted reviewers, SMS sign-up ON, 0 cue matches yet. 9 client errors/24 h: 5 noise (EAS 429 "Unexpected token <", "Script error."), 2 REAL: (a) web keyboard helper calls TextInput.State.currentlyFocusedInput (RN-web only has currentlyFocusedField) — src/components/keyboard.tsx:70/72/134, one-line fix; (b) "cannot execute INSERT in a read-only transaction" ×4 at 03:46 IST on web fdf3a05e — some SELECT/GET path runs an INSERT; screen unknown, needs investigation. Done today (do not re-list): SMS sign-up, CL-04, Waves 3–4, cue sports, claim fix, redesign + logo + sport identity + pad icons + website (all live). New founder items: Firebase SMS region policy + App Check (CL-20); EAS Update code signing with the 1.1.0 APK (CL-29); social uploads; optional delete of the encrypted .enc backup in the repo folder. My backlog: CL-03 parental proof (answers in), anti-scraping at scale, Wave 2b follow-ups (push on new request, Declined requests in Settings, Report on a request), 1.1.0 APK prep, dark mode (after founder call), the two live bugs above. **Both bugs FIXED + LIVE 2026-10-29 (c952dcd):** migration run + verified (provolatile v, 0 read-only writers); web index-9404009f, OTA 7a714337. Lesson: when a migration recreates a function, start from its LATEST body (grep all migrations) — Wave 1 reused a pre-fix body; tests/db-readonly-rpc guards volatility.

**Refresh 2026-10-30 (given to the founder):** plan change: sole proprietorship registering; go live on Play + App Store now with the current version ([[sportfolio-store-launch]]). Live read-only: 30 players, 10 accounts, 7 tournaments, 1 under-18 (test account), 0 parental proofs, 0 client errors/24 h; first morning error report ran fine. Unpushed: cc9f617 (devlog). Store prep is now my top item; SDK 57 is the first store update after launch.

**Founder to-dos (free):**
- Upload the new profile picture and covers to the social accounts (Instagram, Facebook, LinkedIn, YouTube, X, Threads) from docs/marketing/brand-kit/ — README.md there says which file goes where (added 2026-10-29, after the new S:N logo went live).
- 10-min sign-in checklist (docs/testing/sign-in-test-script.md) + shared-phone re-test; verification test script parts C–F (school part untested).
- Monday habit: glance at the weekly email's API TRAFFIC (baseline 572 / 30,058 since 2026-09-22) and crash-free figure.
- Phone test round:
  - APK 41 older features: voice scoring, PDF print, Region, foreign numbers, screen on, WhatsApp QR;
  - never exercised live: certificates, passport, hall of fame, school verification, Players' age.
- Lawyer review of docs/legal + Terms/Privacy (bring the Salesforce agreement).
- 06 assignment from likhithareddy39 (+ SR Edutech if relevant).
- Optional: trusted reviewers.
- Quarterly restore drill (~Jan 2027).

**Decisions:**
- Eligibility gate (TESTING_ALLOW_UNVERIFIED; lean B+C).
- Marketing: soft open, Salesforce clearance, paid budget.
- Football voice AI gets squad names.
- When the server refuses name keys.
- Cheap paid: Supabase Pro, Play Console, .com, trademark.
- WhatsApp OTP: Meta verification now or after the company.
- Speed Wave 3 parked.

**Blocked on company:**
- Salesforce Step 0 → incorporation → deed, board resolution, account transfers, company name in Terms.
- Meta verification and SMS DLT.
- Apple / iOS (also needs GoogleService-Info.plist).
- Play listing in the company's name.
- International I-5.
- WhatsApp Channel.

**Dates:**
- Social readiness Oct–Nov.
- Store accounts before Dec.
- Pre-launch from 7 Dec.
- Launch 11 Jan 2027 10:00 IST.

**My backlog:**
- SDK 57 (held; ship with the next APK and bump to 1.1.0).
- Support console (Phase 2 itself is done and live).
- DLS v3.
- At-scale anti-scraping (sign-up CAPTCHA, cached lists).
- Optional SMS spend cap.

Related: [[sportfolio-ip-protection]], [[sportfolio-master-roadmap]], [[sportfolio-social-marketing]], [[sportfolio-org-verification]].
