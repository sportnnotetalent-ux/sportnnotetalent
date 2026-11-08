# Teams for doubles: no more "pairs" (proposal, 2026-11-08)

## Founder's ask
"Pairs" confuse match setup. Every side with more than one person should be a **team**, with a squad of any size. Setting up a game means picking **individuals** (individual-level games) or **teams** (more than one person a side). Before scoring starts, the scorer picks the **playing 2 / 5 / 7** from each squad. If the scorer can't see a squad, they send a **reminder** to its captain or any member. Existing pairs become teams named "A / B", which either player can rename and add people to.

## What exists today (read-only map + live counts)
- **There is no separate pair record.** A doubles side is already a `teams` row whose `roster` has exactly 2 players (usually `adhoc`). "Pair" is a label the app computes: `pairKey` = the two player ids sorted, used for pair pages, "Your pairs" and partner records.
- **Live data:**
  - 86 teams, 20 of them two-person adhoc teams covering 15 distinct pairs (5 duplicates across sports);
  - 6 empty "Pair A / Pair B" placeholders;
  - 10 doubles matches, 0 in tournaments.
- **Already built and reusable:**
  - squads (`teams.roster`, captain / vice);
  - the matchday squad (`match_squads.starters`, capped at players-per-side);
  - the "Who's playing" sheet;
  - the doubles court line-up editor;
  - team ties, which already pick 1–2 players per rubber from a captain's squad;
  - the "📋 Squad needed" captain reminder and the server cron that sends squad reminders (switched off for racket / cue sports today);
  - clubs (one team, many sports).
- **Scoring needs only an ordered list of 2 players per side**, which `match_squads.starters` already supplies.

## Proposed structure
1. **One concept, the Team.** A team has a squad (any size), a captain and admins, and can play any sport its members play. Doubles is just a team match where 2 play.
2. **Match setup asks one question per side:**
   - an individual-level game (singles): pick a **player**;
   - otherwise: pick a **team** (or "＋ New team" with two names; that's the old pair flow, now creating a real team).
3. **Before the first point, a "Who's playing?" step for each side:**
   - **Squad of exactly 2 (or exactly the number needed):** chosen automatically. No prompt, nothing changes for today's doubles.
   - **Larger squad, and the scorer can manage it** (a captain / admin / member of that team, or the match host): pick the playing 2 / 5 / 7 in the existing squad picker.
   - **Larger squad, and the scorer can't manage it:** "Ask Team B to pick" sends the existing squad reminder to the captain and admins, with one tap to resend to any other squad member.
   - **Scoring is never blocked.** The scorer can start before anyone picks. Points are then credited to the side only, and players can be filled in later (as wave 2's "describe after" pattern).
4. **Migrating existing pairs** (a database migration the founder runs; small):
   - Each two-person adhoc team becomes a normal team named "A / B", with both players as squad members and as captain / admin, so either can rename it or add people.
   - Duplicate pairs (same two people, different sports) merge into one team. Its matches and tournament entries are repointed to the kept team.
   - The 6 empty "Pair A / B" placeholders stay as unnamed quick-game sides.
5. **Pages:**
   - The pair page becomes the team page (stats by team id, plus each player's own stats as today).
   - "Your pairs" becomes part of "Your teams".
   - Partner records on a player's sport page stay; they're built from who played together.

## Things this structure should also fix
- The rule "an adhoc team with exactly 2 players is a pair" is repeated in 4 places. Adding a third member would silently re-route the team today.
- Renaming "A / B" drops the child-name masking trigger (`entry_names`). Masking must work on squad members, not on the team name.
- Tournament doubles entries aren't adhoc, so pair pages miss them today. Teams fix that.

## Product ideas that fit the same model (for the product team)
- **Squad sessions** (rotating club sessions) already split a squad into teams. Teams for doubles makes "today's doubles pairs" a session output.
- **Relays** (athletics / swimming 4 × 100): a team with a squad, picking the 4 legs per race. Same "who's playing" step and reminder.
- **Team ties** (Davis-Cup-style): the team picks its doubles pair per rubber. That already exists and becomes the same flow.
- **Tournament registration:** a team registers once and picks its playing players per match. Late substitutes become a squad change, not a new entry.
- **Golf fourballs / foursomes, chess team boards, carrom and cue doubles:** the same squad + playing-N step.

## Founder decisions (2026-11-08)
1. **One team, any sport.** The same two people are one team (club-style) wherever they play. Their history shows per sport on the team page. The 5 duplicate pairs in live data merge.
2. **Start anyway.** Scoring is never blocked. If a side's playing players aren't picked, the side gets placeholder players named **"{Team name} Player 1", "{Team name} Player 2" …** (as many as play). Points and stats are credited to them. Later, anyone from that squad who manages it can say who they really were, and **every stat moves automatically to those players' own profiles**.
3. **Captain + admins** rename the team, change the squad and pick the playing players. Migrated pairs: both players are admins. New teams: the creator is captain and can add admins.

## Build phases (each: break-it doc → failing tests → fix → 600-user sim → full suite + tsc → demo → DEVLOG)
| Phase | What |
|---|---|
| 1 | Team rules (pure): who manages a team; "who's playing" is automatic when the squad equals the number needed; placeholder players per side; mapping a placeholder to a real player, which moves its event credits and stat lines. |
| 2 | Match setup: each side picks a **player** (singles) or a **team** (more than one a side), with "＋ New team" from names / contacts. No "Pair" wording anywhere. |
| 3 | Before the first point: "Who's playing?" per side (squad picker for managers; "Ask {Team} to pick" sends the squad reminder to the captain / admins / any member). Squad reminders switched on for racket and cue sports. |
| 4 | Placeholders: "{Team} Player 1/2" when nobody picked. "Who played?" on the team / match page maps them later, moving every credit and stat line to the real player. |
| 5 | Pages: the pair page becomes the team page; "Your pairs" folds into "Your teams"; the four "roster of exactly 2 = pair" rules are removed; name masking for children moves onto squad members. |
| 6 | Live migration SQL for the founder: 20 two-person teams become normal teams (both admins), 5 duplicates merge (matches and entries repointed), placeholders kept. A read-only preview comes first. |
