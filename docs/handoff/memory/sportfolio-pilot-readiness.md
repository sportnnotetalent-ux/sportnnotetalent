---
name: sportfolio-pilot-readiness
description: 2026-10-07 pilot readiness pack — legal pages, feedback, account deletion (0030), minors-anonymous analytics; founder said keep ALL live tournaments as is
metadata:
  type: project
---
Committed a972b9f. Privacy Policy + Terms (src/data/legal.ts, LEGAL_VERSION; /privacy, /terms public; sign-up "I agree" recorded as auth meta legal_accepted). Send feedback (FeedbackScreen → support-escalate). Delete my account (delete-account edge fn DEPLOYED + migration 0030 delete_account_data: scrub PII, soft-delete login, keep stats as "Deleted player"). analytics_actor(): under-18/unknown-age never linked in analytics (DPDP s.9). Pilot guide docs/share/PILOT_GUIDE.md.

**Founder decision:** leave all live tournaments (incl. test ones: Hello, Local, Annual, Inter-School Championship 2026) as is — do NOT clean up unless asked again.

**Pending:** founder runs supabase/release/2026-10-readiness-0030.sql → I republish web (npm run web:publish). Legal text needs lawyer review + company legal name after incorporation. Related: [[sportfolio-analytics]], [[sportfolio-security-hardening]].
