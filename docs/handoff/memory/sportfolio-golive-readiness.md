---
name: sportfolio-golive-readiness
description: SportnNote go-live readiness audit (2026-08-24) — all 7 pilot blockers SHIPPED (1-7). User to run migrations 0010+0011 + confirm confirm-email OFF.
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-25T22:43:14.682Z
---

Go-live readiness audit run 2026-08-24 (user wants to share the app with a few pilot users to generate data, then refine). Four parallel Explore audits (auth/security, spectating, tournament types, career/stats) → findings published as the **"SportnNote Pilot Readiness"** artifact (private; https://claude.ai/code/artifact/ef4c2189-1020-4eba-b5f2-4124525ad0b5). Verdict: 4 of 5 pillars solid; **7 blockers**.

**The 7 pilot blockers:**
1. ✅ **SHIPPED (commit `fd0ccf6`)** — Match results never persisted (winner/score). Fixed via new `SportPlugin.result(state)` for all 10 sports + `toMatch` derives winner/score from state + `updateMatchSnapshot` writes `matches.winner`.
2. ✅ **SHIPPED (same commit)** — `stat_lines.won` never set → wins/win-rate all 0. Now set on completion for the winning side.
3. ✅ **SHIPPED (commit `44005d9`) — pending the user running migration 0010** (`20260824120000_players_write_scope.sql`). Replaced `players` blanket "authed write FOR ALL" with scoped insert/update/delete (own claimed row `profile_id=auth.uid()` or unclaimed provisional `profile_id IS NULL`). Pure migration, no app code. **Follow-up still open:** public SELECT still exposes PII *columns* (phone/email/dob/guardian) — RLS is row-level; needs a public-safe view to hide columns. Same blanket-write pattern also on `organizations`/`listings`/`teams`/`team_invites`(token enumeration)/etc. — tighten in a later pass (audit "Important").
4. ✅ **SHIPPED (commit `837ded4`) — Path A (pilot) + pre-built B.** Pilot stays confirm-email OFF (works today). Made sign-up mode-agnostic so turning verification ON later = dashboard flip + run migration 0011, no code: migration `20260825120000_profile_on_signup.sql` (handle_new_user trigger creates profile as DB from user metadata, works with/without session, de-dupes handle); `signUp` passes fields as `options.data` + idempotent client upsert fallback + returns `needsEmailConfirm`; AuthScreen shows "check your email". Runbook: `docs/email-verification.md` (ORDER: migrate BEFORE flipping confirm-email ON). **User to run 0011 whenever + confirm the dashboard setting.**
5. ✅ **SHIPPED (commit `c5dc250`)** — SMS login was a silent dead-end (no SMS provider, phone not on auth.users). Gated the channel picker behind `SMS_LOGIN_ENABLED=false` in `AuthScreen.tsx` → sign-in is email-code + password only; phone code paths kept behind the flag (re-enable = one line once an SMS provider is wired). Pure code. NOTE: AuthScreen is live-only (never mounts in demo) so not browser-previewable — verify on real sign-in.
6. ✅ **SHIPPED (commit `adbbb79`)** — `updateTournament(id, patch)` + `EditTournamentScreen` (name/dates/sports/structure/knockout/formats/open), route + "✎ Edit tournament" on the tournament page (hosts only). Pure code, no migration; verified the edit form loads+populates live.
7. ✅ **SHIPPED (commit `4e1c725`)** — Confirmed broken: `overallStandings` keyed the merge by `teamId`, but each house is a separate single-sport team row → multi-sport house showed as several rows, points never combined. Fixed: merge by name (case/whitespace-insensitive). Pure code + `tests/standings.test.mts`. Renders on multi-sport tournament pages (`TournamentProfileScreen`, `!singleSport`).

**⚠️ GO-LIVE BLOCKER added 2026-09-26 — eligibility gate temporarily OFF for testing.** The user (account owner) deliberately reversed the earlier "never bypass matchEligibility / even friendlies" standing rule *for the testing phase only*: `TESTING_ALLOW_UNVERIFIED = true` in `src/core/eligibility.ts` lets unverified players (no verified mobile / no DOB / guardian not verified) be picked into squads + placed on the pitch, so lineup/formation flows can be tested before verification is built out. Enforcement routes through `canFieldPlayer(p)` (= override OR `matchEligibility(p).ok`); `matchEligibility()` itself is unchanged so screens still show the real reason; MatchSquad shows a "⚠️ Testing mode" banner. **BEFORE GO-LIVE: set `TESTING_ALLOW_UNVERIFIED = false`** to re-arm the child-safeguarding gate everywhere. This is the one switch. See [[sportfolio-devlog]].

**Later (not pilot-blocking):** Olympics-style medal ranking, first-party in-app live video (currently BYO YouTube/Twitch link, link-out on mobile), global "Live now" discovery, career/global leaderboards, trends-over-time, per-sport structure.

**Verify on the LIVE Supabase project (not just repo):** realtime publication + `replica identity full` for matches/match_events actually applied; Auth "confirm email" setting; run the whole auth flow on the real project (the demo build never exercises AuthScreen). See [[sportfolio-repo]] and [[sportfolio-devlog]].

**Eligibility decision 2026-10-23 (founder chose Option A):** keep `TESTING_ALLOW_UNVERIFIED = true` (gate OFF) until mobile verification works everywhere: WhatsApp OTP after Meta verification, or SMS (e.g. Firebase) in the Android app. Don't flip it without the founder.
- Enforced only at: match squad picks, cricket lineup, and the live-scoring player list (unverified players hidden, so team-only credit).
- Live snapshot that day: 22 players, 4 signed up, 18 with no DOB, only 2 adults fully eligible, 0 under-18s.
- Under-18s can't become eligible today: guardian phone OTP needs WhatsApp, and the proof document is support-approved.
- Options discussed for later: B, an organiser choice per tournament ("Verified players only"; on by default for under-18 events, off for friendlies); C, soften the adult rule to DOB + verified mobile OR email; D, everyone allowed but only verified players' stats count as official. My lean was B+C.
