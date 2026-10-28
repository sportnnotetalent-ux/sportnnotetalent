# Security Wave 4: the low findings

**Process:** quality mandate steps 4–5. For each finding, the fix's own break-it points were listed before fixing; each fix starts with a failing test. Plan: `../audit-2026-10-27/PLAN.md`.

## 4A: the database (migration `20261028230000_security_wave4a`; tests `tests/db-wave4.test.mts`)
| # | Finding | Status |
|---|---|---|
| DB-17 | An unverified holder squats a phone number. | Accepted for now. Coach-made profiles are released by Wave 2b's verify-to-link, and the phone sign-in already clears a "not me" flag after an SMS proof. Squatting by an unverified account is a support case. |
| DB-18 | The audit trail of ownership transfers trusted the caller. | **Fixed:** "from" (and an organisation's "to" name) come from the server. Co-hosts keep transfer rights: accepted, since the owner added them and the trail shows who did it. |
| DB-19 | Privileged helpers are callable by visitors. | Accepted. They evaluate only the caller and are needed by the policies. Wave 3's test fails for any new one that isn't. |
| DB-20 | Any adult could make SportnNote email a child's guardian. | **Fixed:** only someone in the child's agreed circle. The refusal comes first, so it doesn't say whether a guardian email is on file. |
| DB-21 | A push token can be moved by someone who holds it. | Accepted. Tokens can't be read by others; a sign-in claims its own. |
| DB-22 | Unbounded inputs. | **Fixed:** event payloads up to 32 KB, match snapshots 2 MB, support questions 4,000 characters, push targets 1,000, record merges 500. On live (read-only, 2026-10-28) the largest snapshot is 3 KB and the largest payload 1 KB. |
| DB-23 | A verification document could be swapped after review. | **Fixed:** no UPDATE. The app always uploads to a new path, so a new upload means a new review. Showing reviewers that the authority email was self-asserted is a follow-up. |
| DB-24 | Editing a golf course changed other organisers' live rounds. | **Fixed:** their open and finished rounds keep the course as it was; the creator's own open rounds follow the edit. |

### Break-it on 4A
| # | Attempt, or what could break | Status |
|---|---|---|
| W4B-01 | **Wave 3B broke course edits.** The course-freeze trigger updated other organisers' finished rounds as the editing user, which the finished-result guard refused. | **Fixed:** the freeze runs as a trusted step (DB-24's test). |
| W4B-02 | **A coach who added a child without agreement can't message the parent.** | Accepted, by design: the same rule as Wave 2's circle. |
| W4B-03 | **Organisers sharing a course in one school.** A colleague's rounds keep the old course when one of them fixes it. | Accepted. The colleague can recompute their round (`recomputeFinishedRounds`). |
| W4B-04 | **The caps reject a real match.** | Accepted. 2 MB is about 700 times the largest live snapshot. |

## 4B: edge functions and the app (tests `tests/security-wave4.test.mts`)
| # | Finding | Status |
|---|---|---|
| EF-13 | `stripLinks` missed bare domains. | **Fixed:** also strips `host.tld/…` and shorteners (`_shared/text.ts`, tested). |
| EF-14 | Rate limits fail open. | **Fixed for money:** the email and SMS limits fail closed (parent emails, contact codes, guardian consent). Others stay open, by design. |
| EF-15 | CORS `*` on JWT functions. | Accepted. They authenticate with a bearer token, not cookies, so another site can't act as the user. |
| EF-16 | Methods not restricted. | **Fixed:** nine POST-only functions refuse others (`join` / `join-club` keep GET for their redirects); `push-send` now answers the browser's preflight. |
| EF-17 | Reminder emails used venue names verbatim. | **Fixed:** links stripped, 80 characters. |
| EF-18 | Cron secret handling. | Holds. No change needed. |
| EF-19 | `verification-submit` checked admin rights itself. | **Fixed:** asks the database (`org_is_admin`, as the caller). |
| EF-20, EF-22 | Message delivery window; support escalation. | Holds (idempotent / handle from the profile). |
| EF-21 | No ceiling on follower pushes. | Accepted. It runs only from database events, never from the app, and pages its sends. |
| CL-19 | Sign-in messages say whether an email has an account. | Accepted. Sign-up says so anyway, and the clearer message saves real users. |
| CL-20 | The SMS cap is only on the device. | **Founder (console):** Firebase SMS region policy (India + target markets) and App Check. |
| CL-21 | Team names in a match link can be spoofed. | Follow-up (low): the screen should prefer the names it loads. |
| CL-22 | `/get/<id>` followed its sender without asking. | **Fixed:** "Follow {name}?" first. Declining also skips the "joined from your invite" push. |
| CL-23 | Two public invite endpoints use a bare player id. | Limited per address since Wave 3 (EF-11). Signed tokens are a follow-up. |
| CL-24 | Every match view loads the whole player directory. | Accepted here: a speed item (Speed Wave 3). |
| CL-25 | Console helpers in production. | **Fixed:** test hooks only in development and the demo; the founder's admin tools only for a signed-in support account (`core/devGlobals.ts`, tested). |
| CL-26 | No CSP or framing protection. | Follow-up: needs response headers from the web host (a `<meta>` can't set `frame-ancestors`). |
| CL-27 | CSV and calendar injection. | **Fixed:** formula cells get a `'`; calendar text drops bare CRs (`core/exportCells.ts`, tested). |
| CL-28 | Crash reports could carry personal data. | Holds. The server scrubs emails and long numbers (`report_client_error`). |
| CL-29 | OTA updates aren't code-signed. | **Founder / build:** turn on EAS Update code signing with the 1.1.0 APK (it needs a key in the build). |
| CL-30 | Web voice audio goes to Google. | **Fixed:** the voice panel says so on the web. |

### Break-it on 4B
| # | Attempt, or what could break | Status |
|---|---|---|
| W4B-05 | **`stripLinks` eats ordinary text** ("e.g.", "3.5 overs", "Dr. Rao"). | Holds (test). It needs a known top-level domain after a dot. |
| W4B-06 | **The support console loses its tools.** | Holds. They appear once a support account's profile loads. |
| W4B-07 | **A failed rate-limit ledger now blocks parent emails.** | Accepted, intended: no email is better than unlimited emails. The error is logged. |
| W4B-08 | **The CSV template gains a `'` before a venue that starts with `-`.** | Accepted. It only affects odd names, and the import keeps the text. |
