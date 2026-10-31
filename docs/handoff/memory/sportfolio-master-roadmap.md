---
name: sportfolio-master-roadmap
description: 2026-10-06 master roadmap (docs/roadmap/MASTER_ROADMAP.md) — 3 lanes (engineering/company/agent-OS), company formation is the critical path, golf needs a new field-competition core; awaiting 5 decisions
metadata:
  type: project
---

On 2026-10-06 the user asked for a company-level plan covering 11 initiatives: Golf, company formation, OTP/comms infrastructure, AI-agent org, an agent operating model, daily improvement reports, a website + website agent, an agent→founder→implementation workflow, P0–P3 prioritization, a master roadmap, and how to work together. I wrote `docs/roadmap/MASTER_ROADMAP.md` (living doc).

Key calls:
- **Company formation is the critical path.** A legal entity unblocks Meta Business Verification (WhatsApp OTP), Indian DLT SMS, Play/Apple organisation accounts, banking and contracts.
- **Golf** needs a new field-competition core (N players + leaderboard). The `measured` archetype exists but is unimplemented, and the whole core is home/away. The same core later unlocks athletics and swimming.
- **Three parallel lanes:** E (me: commit + deploy → instrumentation → golf), C (user: incorporation), O (agent OS: Decision Inbox + 4 agents, weekly first).

**Answered 2026-10-06:** A1 — Indian citizen, based in Hyderabad, Telangana. The registered office would be in Telangana (RoC Hyderabad). Earlier notes assumed a Bengaluru pilot; confirm the pilot city. Rest of A, answered 2026-10-06:
- Wife and father can be directors.
- No investors for 18 months.
- **Currently employed at Salesforce.** Gating risk: the employment agreement's IP-assignment and outside-business/directorship clauses must be cleared first.
- No revenue in 12 months, so GST isn't needed (Telangana services threshold ₹20L).

**Recommended:** Private Limited company. Plan in `docs/company/COMPANY_SETUP.md`.

Decisions pending from the user:
- **A. Company:** residency/state, 2nd director/shareholder, fundraising/foreign investors, current employment/IP, revenue in 12 months. My lean: Indian Private Limited company + DPIIT recognition; One Person Company as fallback.
- **B. Golf v1 scope:** stroke/Stableford/match play, self-entered WHS index; is golf launch or post-pilot?
- **C. New pilot date + KPIs.**
- **D. Website:** code-based site in the repo.
- **E. Tooling budget:** Sentry/PostHog free tiers, Supabase Pro.

The security/privacy/messaging work (0025–0027) is still uncommitted; the user will commit everything at once.

**How to apply:** follow the roadmap's sequencing and P0–P3 rubric. Ask only the §3 decisions. User wants me to act as CTO+PM+COO etc., inspect before changing, and ask only genuine decisions. See [[sportfolio-security-hardening]], [[sportfolio-launch-plan]].


**Progress 2026-10-06:**
- Golf design written: `docs/sports/GOLF_DESIGN.md` (field-event core; v1 = stroke play, Stableford, match play).
- Sports expansion plan written: `docs/sports/SPORTS_EXPANSION.md`.
- **Wave 1 SHIPPED:** table tennis, chess, carrom, throwball, plus profile linking for individual sports.
- Pilot is now **Hyderabad, adult friends playing open tournaments** (not schools). The friend pilot can run on the preview APK + email login, so it doesn't need the company/WhatsApp/store accounts.
- Next: Golf build G1–G6 (awaiting the user's go).
- All work since commit 914b2a7 is still uncommitted; the user wants a single commit later.

**Golf v1 BUILT 2026-10-06:** engine, field core, screens, migration 0028, tests. Uncommitted.
- Web fixes: deep-link/refresh crash (getStateFromPath fallback with a STACK_SCREENS list in RootNavigator — keep it in sync when adding screens); `core/confirm.ts` instead of Alert on web.
- **iPhone plan agreed:** a temporary web version (free) for pilot testers; Apple Developer account later, after the company exists.
- **SMS:** India needs DLT (₹5,900 + business docs), so it's blocked on the company like WhatsApp. Interim option: Firebase Phone Auth (Google sends; ~$0.07 ≈ ₹6 per SMS; Blaze billing) — offered, not built.

**Web pilot + Firebase SMS, 2026-10-06 (approved by the user):**
- EAS Hosting dev domain = `sportnnote`; production will be https://sportnnote.expo.app.
- Demo-data preview deployed: https://sportnnote--hfy8phv5cd.expo.app.
- The EAS CLI is logged in on this Mac (account sportnnote), so I can deploy.
- The Supabase CLI is NOT logged in; the user must run `npx supabase login`.
- Publish with `scripts/publish-web.sh` (reads the live keys from `.env.local.bak`).
- Firebase SMS code-complete (`core/firebasePhone.ts` + edge fn `verify-phone-firebase`). Waits on the user's Firebase project setup (`docs/firebase-phone-setup.md`).
- Ordered checklist: `docs/web-pilot-launch.md`.
