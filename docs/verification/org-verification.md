# Organisation verification

*Founder decisions, 2026-10-24. Phase 1 (schools and colleges, India) is built. Migration `20261025190000_org_verification.sql`.*

## The rules (decided)

1. **Registered or informal.** Every community is a registered organisation (school, college, company, club, society …) or an informal group (friends, neighbourhood, office team, alumni). Informal groups need no verification and can't be a School or College.
2. **Optional, never blocking.** An unverified community runs everything. Verification adds the ✓ (community page, the certificates it issues) and unlocks confirming members' dates of birth (and, later, "verified schools only" events).
3. **Three things to prove:**
   - the official ID;
   - one recognition document;
   - that the person speaks for the school.
   Documents alone don't prove the third: CBSE schools must publish their affiliation papers on their own websites, so anyone can download and upload them.
4. **All three authority routes are accepted:** an official email code, a letter signed by the Head plus support's call-back, or the Head confirming by email.
5. **One verified community per official ID.** The ID locks on approval. If someone else enters it, they're told the school is already verified and to ask its admins.
6. **SportnNote support reviews organisations** (not the appointed age-check reviewers).
7. **Existing communities** are asked "registered or informal?" on their page. Already verified ones keep the ✓.

## What a school / college provides (Phase 1, India)

| | School | College |
|---|---|---|
| Required ID | UDISE+ code (11 digits) | AISHE code (C-/U-/S- + digits) |
| Optional IDs | CBSE affiliation no., CISCE code, state board code, IB code, Cambridge centre no., NIOS code | — |
| Document (one) | Board affiliation letter, state recognition (RTE) certificate, government sanction order, other official recognition | University affiliation letter, recognition letter (UGC, AICTE or state), other official recognition |
| Public registers support searches | Know Your School (UDISE+), CBSE SARAS, CISCE, IB, Cambridge | AISHE |

ID formats are in `src/core/orgVerification.ts` (`OFFICIAL_ID_RULES`) and must match `valid_official_id()` in SQL; a test checks this.

## How it flows

1. **Create:** "Is it a registered organisation?" → type → for a School / College, the official ID right there. If a verified community already has it, creation stops.
2. **Get verified:** Owner / Admin → community page → 🛡️ Verification → **Get verified** (`OrgVerifyScreen`).
   - **Step 1 — Official ID:** `set_org_official_ids`.
   - **Step 2 — Document:** kind + upload. Files go to the private `verification-docs` bucket under `<uploader>/org-<orgId>/`.
   - **Step 3 — Authority:**
     - **Email:** the `org-verify` edge function sends a 6-digit code (30 minutes, 5 tries), confirmed with `verify_org_email_code`.
     - **Letter:** a template the admin prints; the signed copy is uploaded.
     - **Head:** `org-verify` emails the Head a link to `/org-confirm?c=CODE` (14 days). The public `OrgConfirmScreen` page uses `org_head_preview` and `org_head_decide`.
   - **Send:** `submit_org_verification` checks all three, sets `verification_requested_at`, and `verification-submit` alerts **support only**.
3. **Review (support):** Settings → Review verifications → "Schools & colleges" (`org_verification_queue`, `decide_org_verification`).
   - **The card:** one card per school, oldest first, with:
     - how long it has waited;
     - the IDs, with links to the registers and warnings when another community uses the same ID;
     - the document;
     - the authority proof (a free-mailbox flag; letter call-back instructions; the Head's status).
   - **The checklist:** three ticks before **Approve** is enabled. Approve also stays disabled while the Head hasn't confirmed, or if another community is already verified with the ID.
   - **Send back:** one-tap reasons, or type your own.
   - The community's Owners / Admins get a notification either way.
4. **After:**
   - On approval, the IDs lock.
   - Renaming, changing the type or registration, or changing an official ID removes the ✓ (`guard_org_verification`, `set_org_official_ids`). The IDs then unlock (`org_after_verification_change`).
   - Documents are deleted 30 days after the decision (`privacy-retention` → `due_org_verification_docs`).

## Making it easy for a future support team

The founder asked for a way support staff (not just the founder) can work through requests quickly. Built now:
- **Everything on one card,** in check order (ID → document → authority), with the register links and the exact thing to compare.
- **Checklist, not judgement:** each tick is one concrete check. Approve only unlocks when all three are done. The ticks are stored with the decision (`org_verifications.checks`) for auditing.
- **Guards:** the duplicate-ID warning, and "Head hasn't confirmed" blocking approval.
- **One-tap reasons,** the same wording the school reads.
- **History:** every step is recorded (`org_verifications.history`: email verified, Head asked or confirmed, submitted, approved / sent back, unverified).

Next, when there is a support team:
- **Accounts:** give each person a support role (profiles.role = 'support'), so everyone works in the same queue in the app.
- **A web console** (a desktop page listing pending schools with filters such as waiting time, type and state, and keyboard shortcuts) built on the same `org_verification_queue` / `decide_org_verification` functions.
- **Assignment:** a "claim" so two people don't review the same school; a weekly count of reviews per person.
- **Automation:** pre-fill the register lookup with the school's name and city from UDISE+ / SARAS where those sites allow it. Today support searches by hand.

## Later phases

- **Phase 2 — other registered types:**
  - Clubs and academies: registration number + certificate, and association affiliation.
  - Companies: CIN / LLPIN on MCA; a work email covers authority.
  - NGOs: NGO Darpan ID.
  - Housing societies: society registration + office-bearer resolution.
  - Until then they keep the simple "Ask SportnNote to verify us".
- **Phase 3 — international IDs,** with each market: UK DfE URN, UAE KHDA / ADEK, US NCES ID, IB / Cambridge directories. The model already stores country + ID type + value.
