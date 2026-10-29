# Parental proof for under-18 accounts (CL-03): design

**Status:** approved by the founder 2026-10-29 (all three questions as recommended). Being built.

**The founder's answers (2026-10-28):**
1. **Who:** every under-18 account, in every country (India's "self-declared" route ends).
2. **Proof:** the parent or guardian's photo ID, plus a document showing they are the child's parent or legal guardian.
3. **Retention:** documents are deleted 30 days after the review decision.
4. **Before approval:** the child's account works, but limited.

## Why

Today a guardian "consents" by tapping a link sent to an email the child typed in (security audit CL-03). This has three problems:
- **The child can approve themselves.** They can type their own second email and tap Agree. That also records their date of birth as "parent-confirmed".
- **Anyone with the link becomes the guardian.** Any adult account that opens the link is linked as the guardian, and the child's messages are re-addressed to it. Nothing checks it is the person the email went to.
- **A missing age counts as adult.** An account with no date of birth is treated as an adult.

India's DPDP Act also asks for *verifiable* parental consent before a child's data is processed. A link click doesn't prove who clicked.

## The flow

**Child.** At sign-up, every under-18 account starts as **Waiting for a parent**. The app asks for a parent's email or mobile and sends them a link (as today). The Home card shows where things stand:
- "Waiting for your parent"
- "In review"
- "Approved"
- "Not accepted: {reason}" → send again

**Parent.** Opening the link shows the child's name and age, and two choices:
- **Decline.** Works without signing in, as today. The child stays limited.
- **Approve.** This needs the parent's **own SportnNote account**. They sign in, or create one; sign-up already proves a mobile number by SMS. The account must be **18 or over**. An account with no date of birth is refused. It cannot be the child's own account. Then they:
  1. pick the relationship: mother, father, or legal guardian;
  2. type their name exactly as it is on the ID;
  3. upload a **photo ID**: Aadhaar (masked), passport, driving licence, voter ID or PAN;
  4. upload a **relationship document**: the child's birth certificate naming them, a school record or ID card naming them as parent, the child's passport, or a court guardianship order;
  5. confirm the child's date of birth.

  Then they submit. "We'll check this within 2 days. You and {child} will be told."

**Reviewer** (the support team / trusted reviewers). A new **Parental proof** lane in the review console shows:
- both documents side by side;
- the parent's stated name and relationship;
- the child's name and date of birth;
- a short checklist:
  - the ID is readable and its name matches;
  - the second document links that name to the child;
  - the date of birth matches.

The reviewer can **Approve** or **Reject**. Reject needs a reason: unreadable, name doesn't match, doesn't show the relationship, date of birth doesn't match, or other. Reviewers can't review their own child. Claims work as in the existing console.

**After approval:**
- the child's account becomes **Approved by a parent** (method: documents);
- the parent's account is linked as the guardian: messages about the child go to them, and they can view, export, withdraw or delete the child's data;
- the date of birth counts as parent-confirmed;
- both are notified.

**After a rejection:** the parent is told why and can upload again. The child stays limited.

**Deletion:** the daily `privacy-retention` job (already scheduled on live, 03:30 UTC) deletes both files 30 days after the decision. The record keeps only who decided, when, and the outcome. We never store ID numbers: only the images, and only until then.

## "Limited until approved"

Today only two rules read the consent state: no follows, and no messages about the child. The proposal keeps those and adds what lowers risk without breaking school use. Most children play in school or club events run by adults.

| | Waiting / in review / rejected | Approved |
|---|---|---|
| Play, be added to teams, be scored, see own stats | ✅ | ✅ |
| Name to people outside their own teams | initials only | initials only (as today for all under-18s) |
| Appear in search, Discover, leaderboards, Hall of Fame | ❌ hidden | as today |
| Be followed / get follower alerts about them | ❌ (as today) | ✅ within their circle |
| Messages about them from coaches | ❌ (as today) | ✅, to the parent |
| Certificates, career passport, share links | ❌ | ✅ |

Players added by a school without an account (student lists) aren't affected. They already go through the school's parent-approval step.

## Also fixed (audit CL-03)
- The consent link alone no longer confirms anything, links a guardian, or records a parent-confirmed date of birth.
- A linked guardian can't switch consent to "confirmed" without an approved proof (`guardian_set_consent`). They can still withdraw it.
- "Become the guardian by invite code" (`claim_guardian_link`) needs the account's verified email or phone to match the one the invite was sent to.
- An account with no date of birth is treated as a minor for every guardian check.
- The one live under-18 account (the test account, "self-declared") moves to "Waiting for a parent".

## How it's built
- **Table `guardian_proofs`:**
  - who: child profile, the parent's account;
  - what: relationship, name as on the ID, the two file paths;
  - outcome: status (pending / approved / rejected), reason, reviewer;
  - dates: submitted, reviewed, files deleted;
  - history.

  Only one open proof per child. Rate-limited.
- **Files:** the existing private `verification-docs` bucket, under the parent's own folder `<parent uid>/guardian-<child>/…`. Reviewers can already read it; nobody else can. Uploads are limited to 10 MB and to JPEG / PNG / WebP / HEIC / PDF.
- **Functions:**
  - `guardian_proof_submit`: the parent, with a valid link code;
  - `decide_guardian_proof`: reviewers only;
  - `due_guardian_proof_docs` / `mark_guardian_proof_docs_deleted`: retention.
- **Edge function `guardian-proof`:** checks the files exist in the parent's folder, records the proof, and alerts reviewers. On a decision it notifies the parent and the child, using the same push and email as today.
- **App:**
  - the parent's upload screen (from the link);
  - the child's status card;
  - the reviewer lane;
  - the limits above.
- **Website:** a step-by-step guide, "Approving your child's account", at sportnnote.in/guides/.
- **Quality process:** each piece is test-first, with unit and database (PGlite) tests. Then a break-it list written before fixing, with each fix test-first. Then a 500-family simulation: 500 children, parents submitting, reviewers deciding, and deletion after 30 days.

## The founder's decisions (2026-10-29)
1. The parent needs their **own SportnNote account** to approve (18+, SMS-verified at sign-up).
2. **Limited** as in the table: plays and is scored; hidden from search, Discover, leaderboards and Hall of Fame; no certificates, passport or share links; no follows or coach messages, until approved.
3. Parents are told **"We'll check this within 2 days."**
