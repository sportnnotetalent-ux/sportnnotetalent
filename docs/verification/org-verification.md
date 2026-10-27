# Organisation verification

*Founder decisions, 2026-10-24. Phase 1 (schools and colleges, India) built 2026-10-24, migration `20261025190000_org_verification.sql`. Phase 2 (every registered type) built 2026-10-27, migration `20261027100000_org_verification_phase2.sql`.*

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

## Phase 2: every registered type (built 2026-10-27)

Migration `20261027100000_org_verification_phase2.sql`. The same three steps, with the right IDs, documents and words for each type (`ORG_VERIFY` in `src/core/orgVerification.ts`; `org_required_id_types()` in SQL).

| Type | Step 1: any one of | Extra (optional) | Who signs / confirms |
|---|---|---|---|
| Sports club | Society · Trust · CIN · LLPIN · GSTIN · Udyam | — | President / Secretary |
| Sports academy | Society · Trust · CIN · LLPIN · GSTIN · Udyam | — | Director / Owner |
| Sports association | Society · Trust · CIN | — | President / Secretary |
| Company | CIN · LLPIN | GSTIN | Director / authorised signatory |
| Hospital chain | CIN · LLPIN · Trust · Society | GSTIN | Director / authorised signatory |
| NGO | NGO Darpan · Society · Trust · CIN (Section 8) | — | President / Secretary |
| Housing society | Co-operative registration · Society | — | Chairman / Secretary |

- **ID formats and public searches:**
  - CIN, 21 characters: MCA master data.
  - LLPIN (`AAB-1234`): MCA master data.
  - GSTIN, 15 characters: GST taxpayer search.
  - Udyam (`UDYAM-KA-03-0012345`): Udyam verification.
  - NGO Darpan (`KA/2019/0123456`): ngodarpan.gov.in.
  - Society, trust and co-operative registrations have no national format or public search. The reviewer compares the number, name and place with the certificate, and the checklist line says so.
  - Typed IDs are tidied: upper-cased, spaces removed, and the LLPIN / Udyam / Darpan separators put back.
- **Local registrars' numbers** (society, trust and co-operative registrations, and state board school codes) can repeat in another state or district. They never block another community from verifying (`org_local_id_types()`). Support still sees "another verified community has the same number — check it's a different registrar".
- **Members' dates of birth:** only a verified school, college, sports club, academy or association may confirm them, because these keep members' records for sport. A verified company, hospital, NGO or housing society gets the ✓ but no age confirmations (`org_dob_access_or_raise`, `DOB_CONFIRM_TYPES`). *Founder to confirm.*
- **New community types:** Sports academy and Sports association.
- **Wording:**
  - the head's confirmation page and emails (`org-verify`) use the type's noun and title;
  - the support alert names the type;
  - the review queue heading is "🏛️ Organisations";
  - the send-back reason "School already verified here" is now "Already verified here".
- **Custom types** (e.g. "Gymkhana") keep the simple "Ask SportnNote to verify us" until they pick a standard type.

## Later phases

- **Phase 3 — international IDs,** with each market: UK DfE URN / Charity Commission / Companies House, UAE KHDA / ADEK / trade licence, US NCES ID / EIN, IB / Cambridge directories. The model already stores country + ID type + value.
