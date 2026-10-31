# MVP loop (live link, light page, result card, quick game, quick tournament): break it

**Process:** quality mandate step 4. These points were listed after the build and before any fix. Each fix then got its own failing test first (step 5).

**What's under test:**
- migration `20261031140000_share_match.sql` (`matches.summary`, `share_match`);
- the website Worker (`worker/`), which serves `app.sportnnote.in/m/<id>` and `/m/<id>.json`;
- the result card (`core/resultCard.ts`, `core/resultCardImage.ts`, `shareMessageWithCard`);
- the quick game (`core/quickGame.ts`, ScheduleMatchScreen);
- the quick tournament (`core/quickTournament.ts`, QuickTournamentScreen).

| # | Attack or failure | Status |
|---|---|---|
| LL-01 | **Load from open pages.** Every open live page asked the database for the score every 5 s, so 1,000 people watching one match meant about 200 database calls a second. The page also carried the database address and public key. | **Fixed:** pages refresh from the Worker (`/m/<id>.json`). Its database read is cached at Cloudflare's edge for 5 s, so a match costs about one read every 5 s however many people watch. The page has no database address or key. The refresh answer holds only status, summary and winner (tests). |
| LL-02 | Requests for random `/m/<uuid>` links, each costing a database read. | **Accepted.** One small indexed read each, a missing match is cached for 60 s, and Cloudflare's own protections apply. Add a rate-limit rule if the logs ever show it. |
| LL-03 | A team or tournament name injecting HTML or breaking the preview tags. | **Holds:** everything is escaped, and the refresh writes with `textContent` (tests; 500 hostile names in the simulation). |
| LL-04 | Children's names on the public page or preview. | **Holds:** the summary is team-level and never holds a player's name. Children's entries are stored as initials. Under-18 matches show like any match (founder, 2026-10-31). |
| LL-05 | A cancelled or postponed match previewed as "upcoming". | **Fixed:** it says CANCELLED or POSTPONED (test). |
| LL-06 | A match in a deleted tournament still shown through the link. | **Holds:** `share_match` returns nothing and the page is a 404 (tests). |
| LL-07 | Someone faking the score a link shows. | **Holds:** only the people who can run a match can change it (test). |
| LL-08 | The database is slow or down when a link is opened. | **Holds:** after 2.5 s the page still answers and points to the full match (tests; checked in Cloudflare's local runtime). |
| LL-09 | The public key committed in `wrangler.jsonc`. | **Accepted.** It's the same publishable key every visitor's browser gets from the web app. The database's access rules are the protection. |
| LL-10 | Older app versions don't save the summary. | **Accepted.** Their links preview as "LIVE · A vs B" without the score until the update reaches them (over the air, quickly). |
| RC-01 | Sharing a picture fails (browser blocks it, no file sharing, drawing error). | **Holds:** any failure falls back to the text share as before. Phone apps use the text share until the store builds (test). |
| QG-01 | Every quick game makes a new "Team A" and "Team B", which clutters the team pickers over time. | **Accepted for now.** Follow-up: reuse your own quick sides, or hide them from pickers. |
| QG-02 | An empty side in a tournament match. | **Holds:** only friendlies fill empty sides; tournament matches still need both (test). |
| QT-01 | **Some teams fail to save** (network) after the tournament is made, so a second try would create a duplicate tournament. | **Fixed:** the organiser lands on the tournament, told to add the rest under Teams (test). |
| QT-02 | **Tapping Create the instant the list is typed** said "Pick a format" while the suggested format showed as picked (found in the browser). | **Fixed:** the suggestion is worked out on every render, not set a moment later. |
| QT-03 | A pasted list with numbering, bullets, blank lines, repeats, or one comma-separated line. | **Holds:** it's cleaned up, with repeats removed (tests; 500 messy lists in the simulation). |
| QT-04 | The quick form says "Today", but the fixtures screen's first kick-off defaults to tomorrow 10:00. | **Open (P2).** The organiser sets the time on that screen. Follow-up: pass the chosen day through. |

**Simulation (500):** `tests/sim-live-link.test.mts`.
- 500 matches, every sport and status, with hostile names and some deleted tournaments, go through `share_match`, the page and the refresh. Every answer matches a recomputation, and no name leaks unescaped.
- 500 messy pasted lists parse to exactly the right names.
