# Age & guardian verification: fast lanes (founder, 2026-10-24)

## Before

1. The player uploaded a proof of date of birth.
2. The profile went "Pending review".
3. Support got an email with a 7-day link to the document.
4. The one support account approved or rejected it in Settings → Review verifications.

Under-18s also had three separate parent steps: parent mobile code, parent email (by linking their account), and the parent's DPDP consent code.

**Live, 2026-10-24:**
- 1 submission ever (30 Aug), still pending, and **no file**: the upload failed silently but the row still went "pending".
- 0 approvals.
- 1 reviewer.

## The founder's decisions

| | |
|---|---|
| Fast lanes | **all four:** school/club confirms, parent confirms, faster document review, one checklist card |
| Reviewers | **trusted reviewers:** the founder plus people they appoint |
| Requirement | **organiser chooses per tournament:** none / parent-confirmed / school or document verified. The default is none, which keeps today's Option A. |

## How a date of birth gets verified (levels)

| Level | How | Speed |
|---|---|---|
| **Document** | A reviewer checks an uploaded proof (birth certificate, school ID, passport) | the same day: push alert, 12-hour reminder |
| **School / club** | A **verified** organisation's Owner/Admin confirms its members' dates of birth against its records, in bulk or by roster import | minutes, a whole school at once |
| **Parent** | The parent confirms the child's name and date of birth when approving consent (or later from Manage child) | instant |
| *(later)* DigiLocker | Government-issued record, with consent | instant; needs the company registered |

A changed date of birth (or guardian identity) voids every level, as it voids document approval today.

## Phase 1: faster document review (live 2026-10-24)

- **Upload:** a failed upload shows an error and nothing is marked pending without a file.
- **Reviewers:**
  - Table `verification_reviewers` and `is_verification_reviewer()` (support/admin, or appointed).
  - Support grants and revokes reviewers from the review screen.
  - Reviewers act only through server functions. Support's blanket bypass of player-row guards is not extended to them.
- **Review flow:**
  - `pending_verifications()` gives reviewers the fields they need. The storage policy lets reviewers open documents.
  - Edge function `verification-review` records the decision (reviewer identity from the server, history appended, `reviewedAt` for retention) and pushes the result to the player and their linked parent.
- **Alerts:**
  - `verification-submit` now pushes reviewers and emails "new verification waiting — open the app". **The document link is no longer emailed.**
  - Edge function `verification-reminders` runs hourly (cron). It re-alerts reviewers about anything waiting over 12 hours, at most every 12 hours per item.
- **Review screen:** the document shown inline (image) or opened (PDF), next to the entered name, date of birth, age and parent; preset reject reasons; one-tap approve. Support sees a Reviewers section.
- **Entry points:** Settings and the profile show "Review verifications (N waiting)" to every reviewer.

## Phase 2: new lanes (built 2026-10-24; migration 20261024180000_verification_lanes)

- `organizations.verified_at` / `verified_by`, set by reviewers (SportnNote verifies a school once).
- `players.dob_confirmations` (`{ parent?, org? }`), written only by server functions:
  - `guardian_consent_decide` (+ DOB confirmation) and `guardian_confirm_dob`
  - `org_member_dobs` / `org_confirm_dobs` (Owner/Admin of a verified org)
  - roster import: imported dates of birth show up on the bulk-confirm screen (`OrgDobs`), where Select all then Confirm takes two taps
- `players_view` exposes `age_verified_by` (`document` / `school` / `parent` / null): non-sensitive, for organisers' eligibility checks.

## Phase 3: together (built 2026-10-24; migration 20261024190000_age_requirement)

- One checklist card on the profile: date of birth, parent consent, parent mobile, parent email, age verified via …, each with its next step.
- `tournaments.age_verification` (`none` / `confirmed` / `verified`): enforced at squad, line-up and live-scoring roster in that tournament's matches. Friendlies stay `none`.
