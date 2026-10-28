# SMS verification required at sign-up (founder, 2026-10-29)

**Process:** quality mandate steps 1–6. The tests came first; the break-it points below were listed before fixing.

**What changed:**
- Migration `20261029100000_signup_sms`.
- `phone-login` gained `purpose: 'signup-ticket'`.
- The app: **Create account** now has **Text me a code**, then **Verify mobile**; the ticket is sent with the sign-up; the spent ticket is cleared from the account's metadata.
- The smoke check now confirms the app explains the hook's refusal.
- Tests: `tests/db-signup-sms.test.mts` (16) and `tests/sim-signup-sms.test.mts`.

**How it works:**
1. The Firebase SMS code proves the mobile.
2. `phone-login` turns the proof into a one-time ticket: 20 minutes, only its hash is kept, one live ticket per number.
3. The Auth **Before User Created** hook refuses an email sign-up without a live ticket for the same number.
4. The new profile spends the ticket, and its player starts with the mobile verified.
5. The mobile route (`phone-login`) needs no ticket: it proves the number itself.

**Founder step:** the hook must be on (Supabase → Authentication → Auth Hooks → **Before User Created** → `public.hook_before_user_created`). Check it once with step 9a of `docs/testing/sign-in-test-script.md`.

| # | Attempt, or what could break | Status |
|---|---|---|
| SS-01 | **Sign up through the Auth API directly, with no ticket.** | **Fixed:** the hook refuses, in words the app shows (test, and 100 in the simulation). |
| SS-02 | **Use someone else's ticket** for another number. | **Fixed:** a ticket is bound to its number (test; 50 in the simulation). |
| SS-03 | **Replay a spent ticket**, or use an expired one. | **Fixed** (tests; 50 replays in the simulation). Two sign-ups racing with one live ticket: the hook only checks, but the unique number on profiles lets just one through, and the ticket is spent once. |
| SS-04 | **The hook is off in the dashboard.** Nothing in the database can see that setting. | Accepted, with a check: step 9a of the sign-in test script. The smoke check confirms the app's message for the refusal. |
| SS-05 | **The hook errors** (it fails open). | Accepted, by design: a broken guard must never stop real sign-ups. Accounts made that way start with the mobile unverified. |
| SS-06 | **Run up SMS costs** with **Text me a code**. | Holds: this device's SMS cap (`takeSms`), `phone-login`'s limits (10 an hour per number, 30 per address) and Firebase's quotas. |
| SS-07 | **An older APK without the SMS module.** | Accepted: the form says to update the app or use sportnnote.in, and **Create account** is disabled. APK 41 and the web have it. |
| SS-08 | **A parent's number on a child's profile.** Mobile sign-up linked a coach-made profile by number alone, so the parent got the child's profile. | **Fixed** on both routes: `phone_login_attach_player` uses Wave 2b's checks (the same first name and birth year, no other parent). The parent gets their own profile, and support links the child's (tests; 40 in the simulation). |
| SS-09 | **A "not me" flag on a coach-made profile.** | Holds (0037): proving the number clears it; the checks above still apply. |
| SS-10 | **The raw ticket sits in the account's metadata.** | **Fixed:** cleared after the first sign-in with the other sign-up-only fields; it is spent by then anyway (test). |
| SS-11 | **A child proves a parent's phone.** SMS proves possession, not identity. | Accepted: parental proof (CL-03) covers every under-18. |
| SS-12 | **SMS can't reach some countries** (Firebase region policy, CL-20). | Accepted: a founder console item. Those people can't create an account until it's set. |
| SS-13 | **A number gets an account by the mobile route while its email-form ticket is still live.** | Accepted: the email sign-up then fails on the unique number. Rare. |

**Simulation** (`tests/sim-signup-sms.test.mts`):
- 600 email sign-ups through the hook:
  - all 400 honest ones were made, each with the mobile verified and its ticket spent once;
  - all 200 others were refused (100 with no ticket, 50 with someone else's, 50 replays), and none made an account.
- 100 mobile sign-ups onto numbers a coach had typed: 60 people were linked to their own profile; 40 parents kept their own profile and didn't get the child's.
- About 1.8 s for the email sign-ups.
