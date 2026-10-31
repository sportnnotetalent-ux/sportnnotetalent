---
name: sportfolio-mvp
description: MVP defined 2026-10-31 — live score link loop for community/friends' games; 7 sports to perfect first; bar + funnel in docs/product/MVP.md; audit in docs/mvp/
metadata:
  type: project
---

Founder 2026-10-31: "understand the MVP and perfect it right away" (stores going live now).

**MVP:** score any match live from your phone, everyone follows it from a link, and the results, standings and stats build themselves. The hook is the live score link. The loop is set up → score → share → follow → result.

Founder decisions:
- **Primary user:** community and friends' games (adult organisers and scorers at the ground). Schools are wave 2.
- **Sports to perfect first:** football, basketball, kabaddi, badminton, tennis, pickleball, padel. Cricket is NOT in the first polish; it stays as is.
- **Eligibility gate:** friendlies are never gated; a tournament can opt into "verified players only" (off by default). This replaces "flip TESTING_ALLOW_UNVERIFIED to false before go-live".

The bar (6 checks) and the weekly funnel are in `docs/product/MVP.md`. Baseline (60 days to 31 Oct): 74 people, 10 accounts, 34 matches created → 5 started → 5 completed; only 2 matches ever scored, by 2 people; 39 of 44 matches are football.

Audit files are in `docs/mvp/`: `audit-loop.md` (my shared loop: L1–L11) plus the per-sport files from 3 parallel reviewers.

**How to apply:** prioritise MVP-loop fixes over breadth. Fix P0 first, in loop order, test-first. Then the founder runs 3–5 real games in Hyderabad. Related: [[sportfolio-store-launch]], [[sportfolio-personalised-home]], [[sportfolio-quality-mandate]].

**LIVE 2026-10-31 (2c144db; web df1fae98, OTA 0f861a23; SQL run; Worker deployed). Cloudflare still: fix .well-known route (was edited to /.well-known/m/* → assetlinks 522) + add /m/ redirect exception. Built:** the founder's five loop items.
1. **Live link:** the website Worker `worker/` answers `app.sportnnote.in/m/<id>`.
   - OG preview text plus per-sport pictures in `website/share/`.
   - A ~15 KB light page that refreshes via `/m/<id>.json`, edge-cached 5 s.
   - Scores come from `matches.summary` and `share_match()` (migration 20261031140000).
2. **Result card:** a web canvas card shared alongside the text.
3. **Quick game:** sport pre-picked, empty friendly sides become A/B.
4. **QuickTournamentScreen:** name, sport, pasted teams, format, then GenerateFixtures pre-picked, on top of the tournament page.

Founder steps:
- Run SQL 20261031130000 and then 20261031140000.
- Push; Cloudflare builds the Worker.
- Cloudflare route `app.sportnnote.in/m/*` plus a redirect-rule exception for `/m/` (`docs/launch/live-link.md`).
- Publish web + OTA.

The audits' 4 P0 bugs are still to fix:
- tennis: custom games/set doesn't move the tiebreak;
- basketball: one-tap overtime;
- kabaddi: shootout ends too early;
- kabaddi: a failed do-or-die gives +2.
