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
