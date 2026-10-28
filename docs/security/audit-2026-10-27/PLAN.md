# Hardening plan: the 2026-10-27 break-it audits

**Sources:**
- `database.md`: 24 findings, of which 4 are Critical and 2 High.
- `edge-functions.md`: 22 findings, of which 1 is Critical and 4 High.
- `client.md`: 30 findings, of which 4 are High (CL-01 to CL-04).
- `../breaks/student-lists.md`: SL-19.

The critical findings were re-checked in the code before planning: DB-02, DB-03, EF-01 / DB-04 and DB-09 / CL-02.

**Process:** quality mandate steps 5–6. Fix the points one by one, each with a failing test first. Integration tests are needed for SQL, so the PGlite harness comes first if the founder approves it.

## The root cause behind most of the serious findings
**A "relationship" with a child can be made by one side alone.** Today a stranger can do any of these without the child, their parent or the team agreeing:
- create a team listing any player;
- create a friendly match against any team;
- enter any team in their tournament;
- name anyone as a co-host;
- add anyone to a community they run.

The app then treats that as a real relationship. The person sees the child's full name, sends them pushes, gets roster rights, and in the worst chain, replaces the child's guardian.

Findings that come from this: DB-01, DB-04, DB-05, DB-14, EF-02, EF-03, SL-19.

## Wave 1: urgent, small, no change to how the app is used — BUILT 2026-10-28
**Built:** migration `20261028120000_security_wave1`, edge functions, client.
**Tests:** `tests/db-wave1.test.mts`, `tests/security-wave1.test.mts`, `tests/sim-security-wave1.test.mts`.
**The fixes' own break list:** `../breaks/security-wave1.md`.
**Follow-up W1-2b (BUILT 2026-10-28, Wave 2b):** "Verify your number to bring your history" (a Firebase SMS code, then the server links the coach-added profile), for email sign-ups.

1. **Guardian takeover (EF-01 / DB-04, part):** in the non-creator admin branch of `guard_player_write`, lock `guardian`, `dob` and `guardian_profile_id`. Only the owner, the profile's creator, the guardian or support can change them.
2. **Claiming with an unverified phone (DB-02):**
   - the claim and `my_claimable_player()` use a VERIFIED phone (`auth.users.phone_confirmed_at`, or the contact OTP record), never `profiles.phone` text;
   - `profiles.phone` becomes server-set.

   Check first that phone sign-in (Firebase → `phone-login`) records the verified number, so the "added by phone → install → claim" flow still works.
3. **Birth dates from the age check (DB-03):**
   - `meet_ages()` only for players entered in that tournament;
   - the `'meet'` cutoff follows the month-boundary rule;
   - rate-limited.

   Fully closed once Wave 2 makes entries consent-based.
4. **Series hijack (DB-06):** a series is bound to one tournament the caller manages, and `__seriesId` is server-assigned.
5. **Guardian mail bombing (EF-05):** one rate limit per destination email across `guardian-consent`, `guardian-link` and `message-notify`.
6. **Phishing relay (EF-04):** invite links must match exact shapes (`/i/<uuid>`, `/get/<handle>`, `/join-club/<code>`…).
7. **Lookups return full names (DB-09 / CL-02):** the phone and email lookups return a possible minor's name as initials (`public_person_name`).
8. **Private data cached on shared devices (CL-08):** the web service worker never caches signed-in API responses.
9. **Developer screen live (CL-13):** the Results lab is hidden outside demo and development builds.
10. **Unsafe links (CL-11 / CL-12):** links opened from user data allow only `https:` and our own app links (no `intent:`, `upi:` or `javascript:`).

## Wave 2: the consent model — 2a (server) BUILT 2026-10-28
**Founder decision:** 1A.
**Built:** migration `20261028140000_security_wave2`.
**Design:** `../wave2-consent-design.md`.
**Tests:** `tests/db-wave2.test.mts` and `tests/sim-security-wave2.test.mts`.
**The change's own break list:** `../breaks/security-wave2.md`.
**Wave 2b (the app side) BUILT 2026-10-28:**
- migration `20261028160000_security_wave2b`, plus `verify-phone-firebase` channel `claim`;
- "Requests to confirm" for a player's side;
- friendly acceptance;
- W1-2b, verify your number to link.

Tests: `tests/db-wave2b.test.mts`, `tests/requests.test.mts`, `tests/sim-security-wave2b.test.mts`. Break list: `../breaks/security-wave2b.md`.

Follow-ups, not built:
- a push to the player's side when a request arrives (pushes to someone else's child are blocked by design, so v1 is the Home card);
- a "waiting to confirm" hint on rosters;
- "Declined requests" in Settings;
- "Report" on a request.

A relationship counts (circle, roster rights, admin rights, pushes) only when the other side confirmed it:
- adding someone else's player to a team, club, community or field event sends a request. The player accepts, or their parent does for under-18s;
- a friendly against another team, and entering someone else's team in a tournament, need that team's manager to accept;
- co-hosts must accept;
- players you created yourself, invites people accepted, and communities a child joined by choice count straight away.

This fixes DB-01, DB-04, DB-05, DB-14, EF-02, EF-03 and SL-19.

Also in this wave, because the founder already has open decisions on them:
- **CL-01:** the child-safety fielding gate (`TESTING_ALLOW_UNVERIFIED`) is off, and it only exists on the client. That's the eligibility-gate decision; the fix moves the rule to the server.
- **CL-03 / CL-04:** how parental consent is proven (the link holder, the country the client sends).

## Wave 3: Medium findings
- **Database:** DB-07 to DB-16.
- **Edge functions:** EF-06 to EF-12.
- **Client:** CL-05 to CL-18 (the four above excepted): offline sign-out, offline queues bound to an account, child data in the session token, Android backups, guardian flags, upload limits, photo GPS, server-side result locks, re-authentication before deleting an account.

Order: anything touching children's data first (DB-07, DB-09, DB-10, DB-11, DB-15), then integrity (DB-12, DB-13), then cost and leaks.

## Wave 4: Low findings
- **Database:** DB-17 to DB-24.
- **Edge functions:** EF-13 to EF-22.
- **Client:** CL-19 to CL-30.

## Tests these waves add
- **Characterisation tests** for every function touched, before it changes.
- **RLS / policy integration tests** in PGlite (the repo has none that run SQL today).
- **A simulation:** 500 users (coaches, parents, children, strangers) trying every self-made relationship, asserting that a stranger never sees a child's full name, birth date or contact. Once staging exists, the same runs concurrently there.
