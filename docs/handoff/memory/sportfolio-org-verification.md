---
name: sportfolio-org-verification
description: Org verification — Phase 1 schools/colleges LIVE 2026-10-24; Phase 2 every registered type LIVE 2026-10-27 (ab17b4e, migration 20261027100000; education types 6969ed8 live); Phase 3 international pending
metadata:
  type: project
---

Founder decisions 2026-10-24:
- Verification is optional and never blocks running events.
- All three authority routes are accepted: an official email code, a letter signed by the Head plus support's call-back, or the Head confirming by email.
- One verified community per official ID: the ID locks on approval.
- Support only reviews organisations, not appointed age reviewers. The founder wants an easy queue for a future support team.
- Existing communities are asked "registered or informal?".

Built in commit 679f3ad (LIVE 2026-10-24: migration run, functions deployed, web + Android OTA 81f77410):
- migration 20261025190000_org_verification;
- the edge function org-verify;
- OrgVerifyScreen, the public /org-confirm page, and the OrgReview card in VerificationReviewScreen;
- guide verify-your-school.
Design doc: docs/verification/org-verification.md.

Phases:
- Phase 1: Indian schools (UDISE+) and colleges (AISHE).
- Phase 2 BUILT 2026-10-27 (ab17b4e):
  - ORG_VERIFY per type, any-of required IDs (cin / llpin / gstin / udyam / ngo_darpan / society_reg / trust_reg / coop_reg);
  - new types Sports academy and Sports association;
  - local registrar IDs (society / trust / coop / state_board) skip the one-per-ID lock;
  - DOB confirmation only for School, College and Sports club / academy / association (founder to confirm);
  - guide verify-your-organisation.
  - LIVE 2026-10-27: migration run, org-verify + verification-submit deployed, web index-f2a8d10a + OTA 27651d64, guide live.
- Education types BUILT 2026-10-27 (6969ed8, migration 20261027120000):
  - Junior / PU college (UDISE+), University (AISHE U-), Polytechnic / institute (AISHE S-/C-), ITI (new `iti` NCVT MIS code `^[A-Z]{2}\d{8}$`);
  - EDUCATION_TYPES drives isAcademicCommunity, OFFICIAL_ONLY_TYPES and DOB_CONFIRM_TYPES;
  - graduating suggestion by type.
  - LIVE 2026-10-27 (web index-1f6d1fd9, OTA 6015b605).
  - Proposed next: 'Run it again next year' tournament copy (awaiting founder go-ahead).
- Phase 3: international IDs (UK URN, UAE KHDA/ADEK, US NCES), launched with each market.

Support-team next steps (founder's ask): give each person the support role; a web console with filters; claim/assignment; register auto-lookups.

**Why:** schools hold children's data and run inter-school events, so the person creating a school community must be proven to speak for it. Documents alone don't prove this, because CBSE makes schools publish theirs online.

**How to apply:**
- Before publishing app code that reads org verification, the founder must run the migration (the app reads `organizations.registered` and the new RPCs).
- Organisation decisions use is_support(), never is_verification_reviewer.
- Keep OFFICIAL_ID_RULES in sync with valid_official_id() in SQL; a test enforces it.

Related: [[sportfolio-org-architecture]], [[sportfolio-sport-aware-setup]].
