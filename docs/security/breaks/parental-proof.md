# Parental proof (CL-03): break it

**Process:** quality mandate step 4. These points were listed after the build and before any fix. Each fix then got its own failing test first (step 5).

**What is under test:**
- migration `20261029140000_parental_proof.sql`;
- the edge function `guardian-proof` and the `privacy-retention` step;
- the app: `GuardianConsentScreen`, `GuardianProofForm`, `GuardianProofScreen`, `GuardianPendingCard`, and the reviewer lane in `VerificationReviewScreen`.

Design: `../cl03-parental-proof-design.md`.

| # | Attack or failure | Status |
|---|---|---|
| PP-01 | **The child makes a second "adult" account** (fake date of birth) and uploads a parent's ID they photographed at home. | **Reviewer gate.** The reviewer sees which account sent it and that account's name next to the name on the ID. Follow-up idea: show the account's age and whether its verified phone matches the guardian phone the child entered. |
| PP-02 | The child approves from their own account. | **Holds:** refused (test). |
| PP-03 | An account under 18, or with no age, acts as the parent. | **Holds:** refused, "18 or over" (test). |
| PP-04 | The paths point at someone else's files, to show the reviewer another person's ID. | **Holds:** both files must sit in the caller's own `<uid>/guardian-<child>/` folder and exist in the bucket (test). |
| PP-05 | `..` in a path. | **Holds:** storage keys are literal. A key with `..` must itself be the caller's own upload; nothing is resolved. |
| PP-06 | Someone else who saw the emailed link (a coach on a shared inbox) uploads their own ID and a forged relationship document. | **Reviewer gate.** The relationship document must name them as the parent. |
| PP-07 | Flooding the queue. | **Holds:** one open proof per child (test); 10 submissions a day per account. |
| PP-08 | A reviewer decides their own child's proof (they sent it, they are the child, or they are already its linked guardian). | **Holds:** refused (test). |
| PP-09 | A reviewer approves without opening the documents. | **Accepted.** The app makes them tick three checks; the server can't see what a person looked at. Decisions are logged with the reviewer's name. |
| PP-10 | A rejected parent resends forever. | **Accepted:** 10 a day per account. |
| PP-11 | **The child deletes their account while the proof waits.** The proof rows cascade away, so the parent's two files would never be deleted. | **Fixed:** the row stays with no child, and its files are due for deletion at once (test). |
| PP-12 | The parent deletes their account after approval. | **Holds:** `delete-account` removes their whole folder, and their proofs go with it. The child stays approved. Messages about the child have no parent account to go to until another parent is linked. |
| PP-13 | **An app older than this release** (no update yet) taps "I agree". | **Accepted.** The server now answers "documents needed" and changes nothing, but the old screen shows its "locked" text. The web updates at once and Android gets the over-the-air update, and the link opens in the browser on most phones. |
| PP-14 | The child changes the guardian's email after approval. | **Holds:** consent goes back to "waiting" (wave 3c), and a new proof is needed. |
| PP-15 | A parent with two children. | **Holds:** one link and one proof per child. |
| PP-16 | **A second adult submits after the child is approved** and, if approved, replaces the first parent as the linked guardian and takes over the messages. | **Fixed:** no new proof once approved by documents, by link or by resending. Withdraw first (tests). |
| PP-17 | The link still works after a rejection. | **Holds:** 7 days, then the child sends a new one. |
| PP-18 | The documents leak later. | **Holds:** reviewers only, through 1-hour signed links; deleted 30 days after the decision (test). |
| PP-19 | The child edits their date of birth after the parent confirmed it. | **Holds:** the parent's confirmation keeps the date it confirmed; the existing verification rules compare them. |
| PP-20 | "Self-declared" India accounts. | **Holds:** the migration moves the one live account to "waiting", and new sign-ups never get that state (tests). |
| PP-21 | **A hand-made email sign-up with no date of birth.** Without a date of birth the account is never treated as a minor, so none of this applies. The app always asks for it; the server didn't. | **Fixed:** the sign-up guard (`hook_before_user_created`, enabled on live) refuses an email sign-up without a valid YYYY-MM-DD date of birth (test). Phone sign-in already refuses one. |
| PP-22 | An unapproved child shows up in search, Discover, leaderboards or Hall of Fame, or gets certificates, a passport or share links. | **Fixed:** the server refuses certificates, passport links and honours, and takes an existing passport link down if consent is withdrawn (tests). Search, Discover and leaderboards leave them out using `limited_player_ids` (tests). |
| PP-23 | The parent re-sends the "submitted" alert (or a reviewer the "decided" one) over and over, spamming reviewers or the family. | **Fixed:** each proof alerts reviewers once and tells the family once (`reviewers_alerted_at`, `family_told_at`; test). |

**500 families** (`tests/sim-parental-proof.test.mts`): random journeys covering imposters, declines, approvals, rejections and resends, deleted children, certificates for everyone, and deletion 30 days later. Every rule holds for every family.
