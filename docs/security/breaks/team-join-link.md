# Break it: team join link + "Invite players" (reference-video C8)

2026-11-06. The founder's order ends with C8. A team gets one join link (QR / WhatsApp / copy) next to the existing "add by mobile or contacts". Joining by link is a request the team's managers accept. Migration: `20261112120000_team_join_link.sql`.

| # | Break | Risk |
|---|---|---|
| TJ1 | Anyone with the link lands straight in the squad (spam, strangers, wrong team). | Abuse |
| TJ2 | Someone who isn't a manager makes, sees or turns off the link, or answers requests. | Authorisation |
| TJ3 | The link reveals the squad, the captain's phone or other contact details before anyone is accepted. | Privacy |
| TJ4 | An under-18 joins without their parent, or someone asks on behalf of a stranger. | Child safety |
| TJ5 | The managers see an under-18's full name in the request list. | Child privacy |
| TJ6 | Accepting into a school house team with no squad list replaces the house's whole squad with one player. | Data loss |
| TJ7 | A flood of requests, or link-guessing at speed. | Abuse |
| TJ8 | An old link keeps working after the captain changes it, or after it's turned off. | Authorisation |
| TJ9 | The same person asks twice, or is accepted twice (duplicate in the squad). | Data |
| TJ10 | Accepted players then get a second "Requests to confirm" for a team they asked to join. | UX |

## Fixes and checks

- **TJ1:** the link only creates a **request** (`request_team_join`). Nobody is in the squad until a manager accepts (`decide_team_join`).
- **TJ2:** making, replacing or turning off the link, listing requests and answering them all require `can_manage_team` (database tests: a stranger is refused at each step). The card shows only to `canManage` on the squad page.
- **TJ3:** `team_join_preview` returns the team's id, name and sport only; the join screen reads nothing else (tests).
- **TJ4:** you ask for your own player only if you're 18+ (unknown date of birth counts as under 18). A teen gets "ask your parent". A parent asks for their child (`guardian_profile_id`); nobody can ask for anyone else (database test).
- **TJ5:** managers see an under-18 as initials ("K. N. H."), marked "Under 18 · asked by their parent". The 600-person simulation checks no child's full name appears.
- **TJ6:** school house teams with no squad list of their own get no link (`team_squad_from_house`), and accepting re-checks. So a house's derived squad is never replaced by one player.
- **TJ7:**
  - rate limits (30 previews and 20 requests an hour per person);
  - at most 100 pending requests per team;
  - tokens from `new_invite_token`;
  - the tables have no grants, so they're reached only through the functions (database test).
- **TJ8:** "Turn off" stops the link at once; "New link" kills the old token (database test).
- **TJ9:** one pending request per player per team (unique index), and "already asked" / "already in this team". Accepting twice changes nothing, and the squad never holds the same person twice (simulation).
- **TJ10:** accepting records `member_consents` 'joined' for the player's side, so they aren't asked to confirm a team they asked to join.

**Tests:**
- `tests/db-team-join-link.test.mts` (9, PGlite);
- `tests/team-join-link.test.mts` (4);
- `tests/sim-team-join-link.test.mts`: 600 people (adults, teens, parents) across 20 teams, with captains accepting or declining.
- The privileged-function guard (db-wave3) passes: the app calls all six functions.

**Demo check:**
- the squad page's Join link card (get the link, Share, New link, Turn off);
- `/tj/NOTALINK` shows "This link isn't active".
- The demo keeps links in memory, so the full ask-and-accept flow is covered by the database tests and the simulation.

**Not done (follow-ups):**
- a printable QR for the team link (Share is in);
- telling the person when they're accepted (they see the team on their profile);
- the SQL (`20261112120000_team_join_link.sql`) is for the founder to run. Until then the card shows an error when getting the link, and nothing else changes.
