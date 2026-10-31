---
name: sportfolio-parental-proof
description: CL-03 parental proof for every under-18 — founder decisions 2026-10-28/29; LIVE 2026-10-29 (182166e): migration run + verified, guardian-proof + privacy-retention deployed, web f6dee86e, OTA 14b5597b
metadata:
  type: project
---

Founder decisions: (2026-10-28) every under-18 account in every country (India self_declared route ends); proof = parent/guardian photo ID + relationship document; documents deleted 30 days after the review decision; account limited until approved. (2026-10-29) parent needs their OWN SportnNote account (18+, null age refused, not the child) to approve — on approval they become the linked guardian (messages, data rights); "limited" = can play, be on teams, be scored, see own stats, but hidden from search/Discover/leaderboards/Hall of Fame, no certificates/passport/share links, no follows/coach messages; parents told "We'll check this within 2 days".

Design: docs/security/cl03-parental-proof-design.md — table guardian_proofs, files in verification-docs bucket under <parent uid>/guardian-<child>/, RPCs guardian_proof_submit / decide_guardian_proof / retention helpers, edge fn guardian-proof, privacy-retention (cron live 03:30 UTC) deletes files; consent link alone no longer confirms/links/DOB-confirms; guardian_set_consent needs an approved proof; claim_guardian_link needs a matching verified contact; null age = minor for guardian checks. Live 2026-10-29: 10 profiles, 1 under-18 (test account, self_declared → becomes pending), 0 consent requests, 0 linked guardians.

**Why:** audit CL-03 (anyone with the emailed link could approve / become guardian) + India DPDP verifiable parental consent.
**How to apply:** follow the quality mandate ([[sportfolio-quality-mandate]]); founder runs the migration; deploy edge fns; publish web + OTA after founder approval; add a guide page ([[sportfolio-feature-guides]]).

**Built 2026-10-29 (182166e, not live).** Release ORDER matters (new app calls new RPCs): (1) founder runs supabase/migrations/20261029140000_parental_proof.sql in the SQL Editor; (2) verify read-only (guardian_proofs exists, hook requires dob, 0 self_declared); (3) deploy edge fns guardian-proof (new) + privacy-retention; (4) auth-smoke, then web + Android OTA after founder's "publish". Founder test: a reviewer can't decide a proof they sent themselves — submit from one adult account, review from the support account. Old apps (PP-13) show "locked" text after "I agree" until updated. Break-it list docs/security/breaks/parental-proof.md; sim 500 families.

**LIVE 2026-10-29:** migration verified read-only; guardian-proof + privacy-retention deployed (boot-checked); web index-f6dee86e, OTA 14b5597b. Website guide waits for founder's git push. Founder to test end to end (two adult accounts: one sends, support reviews; any photos, not real IDs).
