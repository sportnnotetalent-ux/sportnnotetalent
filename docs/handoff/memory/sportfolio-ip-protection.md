---
name: sportfolio-ip-protection
description: Founder priority 2026-10-24 (before paid promotion) — stop easy replication; GitHub repo was found PUBLIC + MIT; moat/USP plan
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-24T08:16:29.053Z
---

On 2026-10-24 the founder made two things a priority, ahead of paid promotion:
1. Make sure what they've taught Claude can't easily be reused by competitors.
2. Give the app USPs and moats so it's hard to replicate.

**Found the same day:**
- The GitHub repo `sportnnote-lgtm/sportnnote` was **public** from its creation (2026-10-06) and showed 0 forks and 0 stars.
- Its LICENSE was the Expo template's MIT file, so GitHub labelled the whole repo MIT.
- No server secrets were ever committed: the only JWT in history is the public anon key.
- Nothing live depends on the repo being public. Cloudflare deploys sportnnote.in from `main` via its GitHub app; EAS builds from local.

**Why:** the code, DEVLOG and every strategy doc in `docs/` (roadmap, marketing, international, security, sport-depth) were readable and copyable by anyone.

**How to apply:**
- Making the repo private is the founder's job (a GitHub setting). Claude replaces LICENSE with a proprietary notice and sets package.json `"license": "UNLICENSED"` once approved.
- On the founder's own Claude account, the "Help improve Claude" privacy toggle controls training use. Commercial (Team/Enterprise/API) terms don't train by default. Tell them to verify in their settings rather than asserting current policy.
- Moat themes to push: data network effects (career records, rankings), the verification/eligibility trust layer, institutional distribution, multi-sport rules depth, DPDP minors compliance, trademark + IP assignment.

Related: [[sportfolio-master-roadmap]], [[sportfolio-security-hardening]], [[sportfolio-repo]].

**Done 2026-10-24:**
- The founder made the repo private; confirmed via the GitHub API returning 404.
- Commit 6aa1e78 replaced LICENSE with the proprietary notice and set package.json UNLICENSED.

Pending:
- Check that Cloudflare still deploys sportnnote.in from the private repo.
- ToS clause "Our app and its data": commit d8b9f70; live on web and Android OTA 01a16d15 (2026-10-24).
- The API audit is done: docs/security/api-exposure-audit-2026-10-24.md. Private columns are safe. Anyone can bulk-read public sports data with the anon key; signed-in users can read every child's full name and age.
- Children's restriction: migration 20261024120000_minor_names_signed_in.sql, commit 01bf0ce, verified read-only. Pending: the founder runs it in the SQL editor; the reduced-card wording ships with the next OTA/web publish.
- Found: singles/doubles entry teams are named after the players, and team names are public (even logged out), so they leak children's full names. Also activity_log.by_name, listings.author_name and match_disputes names. A fix proposal (teams_view masking) is with the founder.
- Trademark filing.
- A moat plan before paid promotion.

**2026-10-24, after the founder ran 0024120000 (verified live):** the teams-view work found that player names are also copied into PUBLIC scoring data.
- `match_events.attribution.playerName` is on every attributed event (142 on live).
- `matches.state` holds names for racket sports (badminton and tennis confirmed).
- Both are readable by anon, so masking entry-team names alone wouldn't protect a child in singles.
- Other spots: `activity_log.by_name`, `match_disputes.*_name` / `history.byName`, `match_events.payload.byName` (score edits), and listings, where the author's real name plus contact phone are public (stamp_listing forces `author_name` to the real name).

Paused for a founder decision: ids-only scoring data with names resolved via players_view, OR members-only children's matches, OR keep names public under guardian consent.
- **Live 2026-10-24:**
  - Listings SQL (20261024150000) was run and verified.
  - Web and Android OTA 01a16d39 (commit 285d957) carry the "initials only" note and the listing form.
  - The IDs-only scoring refactor is next. The agent inventory of name write/read sites is pending; then a staged plan (racket sports and cricket first).
- **IDs-only scoring (founder chose 2026-10-24):**
  - Plan: docs/privacy/ids-only-scoring.md, plus the inventory doc.
  - Stage 0 committed as 8557c16: core/playerNames.ts, disputeMask carries `people`, `useMask().nameOf`, and the ticker/overlay/useLiveMatch take `nameOf`.
  - Groups A (racket + volleyball) and E (cricket) were launched as worktree agents. Then come B (invasion), C (kabaddi), D (basketball), F+G (baseball, chess, golf, carrom).
  - Close-out, kept by me:
    - useLiveMatch strips names at dispatch
    - append_match_event safety net
    - data clean-up script (the founder runs it)
    - records / discipline / AMEND / appearances
    - entry team names (trigger + entry_ids + client reveal)
    - match_lineups, potm / awards, disputes, field_entries
- **Entry names:** migration 20261024160000_entry_names was RUN and verified live on 2026-10-24 (3 entries flagged, triggers on, mask works, home_feed returns entry_ids). Commit 5b235ec; the app side ships with the next release.
- **Live 2026-10-24 (f604904):**
  - The verification_review SQL was run.
  - verification-review, verification-reminders and verification-submit are deployed.
  - Web and Android OTA 01a16d77 shipped (IDs-only groups A + E, verification Phase 1, entry-name reveal).
  - Phase 2 migration 20261024180000_verification_lanes is being written: parent confirms, school confirms, players_view.age_verified_by.
- **2026-10-24:** IDs-only groups B (invasion, which owns PlayFeed/feedModel/playerLink/onField/discipline.ts), C (kabaddi), D (basketball) and F+G (baseball, carrom, chess, golf match play) were launched as worktree agents from f604904.
- **Live 2026-10-24 (a356e24): web + Android OTA 01a16dd8.**
  - IDs-only scoring for ALL sports.
  - Verification Phases 1–3: reviewers, parent/school confirm, checklist, tournament age_verification.
  - Name masking: entries, POTM/awards/disputes/activity/relay, line-ups.
  - Migrations 0024170000–0024210000 all run.
  - `scripts/check-minor-names.sql` = 0 except 1 team (a custom name that matches a no-DOB "player" record).
- **Pending:**
  - The founder's phone test across sports.
  - Server safety net DECIDED 2026-10-27 (founder 2A = strip, not refuse): built as masking triggers on match_events + matches.state (migration 20261027200000_match_names_safety_net, 1c71159); founder to run the SQL.
  - Football voice LLM receives squad names (founder decision).
- **"Hard to copy" plan offered:** QR-verified certificates (recommended first), career passport, school hall-of-fame pages, anti-scraping later, NDA/IP templates.
- **QR-verified certificates (2026-10-25):**
  - Commit 367b62e. Migration run and LIVE 2026-10-25: web + Android OTA 01a16e0f.
  - Organiser screen: Tournament hub → 📜 Certificates.
  - Public verify page: /c/CODE.
  - Profile card: My certificates.
  - Next "hard to copy" items: career passport, school hall-of-fame pages, anti-scraping later, NDA / IP templates.
- **Career passport (2026-10-25, commit 03a2959):** migration 20261025110000_career_passport (players.passport_code, owner-only make/reset, anon resolve_passport with official tournament lines + honours). Public `pp/:code`; profile + ManageChild entry. LIVE 2026-10-25: migration run, web published, Android OTA 57236cfa; founder to test own link signed out.
- **School hall of fame (2026-10-25, commit 940dfff):** migration 20261025130000_hall_of_fame (organizations.hall_public default false = private until Owner/Admin publishes; org_honours closed table + save/delete RPCs; anon org_hall_of_fame returns certs earned while member + manual + hosted, ids only). Public `h/:orgId`; entry on org Details tab. LIVE 2026-10-25: migration run, web published, Android OTA 533ba500; founder to publish a school and test signed out.
- **NDA / IP-assignment templates (2026-10-25, commits a2f13bd + 7e8e5d7):** docs/legal/ — 01 one-way NDA, 02 mutual NDA, 03 contractor, 04 employee/intern, 05 founder→company deed, 06 confirmatory assignment; Word copies via `python3 scripts/legal-docx.py` (stdlib, deterministic); README = when to use, Telangana stamping, wet-ink for POA docs (03–06), register, lawyer questions. Every template has an AI-tools clause (no code/docs into unapproved or training AI tools).
  - Open for the founder: lawyer review of the pack; get a 06 from git contributor likhithareddy39 (commit bec3655, initial Expo scaffold, 12 Jun 2026), and from sredutech if it is a business that did/paid for work; 05 at incorporation.
  - Next "hard to copy": anti-scraping hardening (later).
- **Live 2026-10-25 (7e8e5d7):** web + Android OTA d291cad3 — confirm-sheet nested-button fix (ee0e3c3, from a separate session) on top of certificates / passport / hall of fame. Founder is doing one combined phone test of all of it.
- **Anti-scraping (2026-10-25, commit d5c1759):** migration 20261025150000_anti_scraping — PostgREST pre-request `api_gate()` (blocklist ip/user/agent regex → 403 PT403, fails open, service_role + root exempt, `api_gate_settings.enabled` off switch, undo = `alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config'`), `api_whoami()`, trap records (players Ojasvin Talluri / Ruthvel Kandregula / Sahasra Pennada + team Kondapur Kestrels FC, registry `canary_records`), `api_traffic_report(p_save)` → weekly-report API TRAFFIC section. Runbook docs/security/anti-scraping.md. GET requests are read-only in PostgREST, so no DB rate limits — blocking is reactive. LIVE 2026-10-25: SQL run, weekly-report deployed, curl-verified on live (python/curl UA → 403 PT403; Safari/okhttp → 200; api_whoami ok); first saved traffic snapshot = Monday weekly email.
