# Break-it: every account can start a friendly from Home (2026-11-06)

Found while making the marketing demo screenshots: Home's big **Score a match** button (and the menu's **Start a friendly**) only worked for accounts whose role is scorer, organiser or support. A **player** account was sent to the Matches tab with no way to start a game — 16 of 19 live accounts are players. Founder decision 2026-10-31 (docs/product/MVP.md): friendlies are never gated. Founder 2026-11-06: "Yes, fix it".

Fix: both Home entry points open the match set-up for every signed-in account (`canStartFriendly` in src/core/roles.ts). The role check stays where it belongs: opening someone else's match to score it (LiveScoring decides per match).

| # | Break | Fix / why it's safe |
|---|-------|-----|
| SF1 | A player starts a match inside someone's tournament | The server only lets a match into a tournament the person manages (policy "authed create match": `tournament_id is null or can_manage_tournament(…)`); the set-up screen's tournament option is unchanged |
| SF2 | A player scores someone else's match from Home's live list | Unchanged: `openScorer` still passes the role-based flag, and LiveScoring decides scoring rights per match (scorers, hosts) |
| SF3 | An under-18 starts a friendly and exposes names | Same as any friendly today: names are protected server-side (initials for strangers, IDs-only scoring) — nothing new is shown. Friendlies are never gated (founder 2026-10-31) |
| SF4 | Spam: someone creates many matches | Not new — the server already accepted these inserts from any signed-in account; only the button was hidden. API abuse limits (anti-scraping / wave 3–4) apply as before |
| SF5 | The "Start a friendly" menu item and the tile disagree again later | Both read one helper; a wiring test checks Home uses it for both and no longer routes players to Matches |

Tests: tests/start-a-friendly.test.mts (every role; wiring; 600 random accounts).
