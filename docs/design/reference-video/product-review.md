# Setup flows: what the reference app does well, and what SportnNote should change

PM review, 2026-11-06. Source: founder's 7-minute iPhone recording (reference app from 0:24 on). The code was read on branch `feat/sport-formats-and-scoring`. This review is read-only: no repo changes.

**Frames I could not use:** 0:00–0:23 is a different app and the launch screen (out of scope). 4:38 is blank (a transition). 4:45 and 5:43 are loading skeletons. 5:46 shows a "screenshot restricted" toast over the tab. The long team-link URL at 2:34 is too small to read. Everything else was readable.

## 1. Reference flows, step by step

**A. Create tournament (0:47–1:09, then 3:08–4:45)**
1. "+" (top right) opens a menu: Start a match, Go live, Create tournament, Create team, Looking for, Get help, plus a paid upsell.
2. **One long form** with a fixed Register button: banner, logo, name\*, city\* (filled in), ground\* (searchable, multi-select, with "N matches" counts), organiser name\* and number\* (filled in), start/end date\*, category\* (8 chips), ball type\* (default set), pitch type, match type\* (default set), and 3 opt-in checkboxes (a rule, "need more teams?", "need officials?").
3. After Register: "Any additional details?" (prize, entry fee, rules) as free text, with **Skip**.
4. Lands on the tournament home with tabs: About, Teams, Matches, Points Table, Sponsors, Gallery. **Each empty tab says the next action:**
   - Teams: "Invite captains to add teams" with **Share with captains** as the main button and "Add manually" as a link.
   - Matches: "Start a match" and "Schedule matches". Schedule asks "Auto or Manual?"; Manual opens "Select rounds".
   - Points Table: Create, then Groups, then Rounds. A diagram explains Round → Group → Teams, but an alert blocks you: "add rounds first".
5. A gear icon opens "Manage tournament", grouped as Tournament, Matches, People (scorers, officials, livestreamers) and More.

Count: about 25 taps, 9 required fields (3 filled in for you), 2 screens to create, then a guided home.

**B. Start a match with existing teams, squad and roles (1:10–2:50)**
1. "+" → Start a match: two big "+" slots, Team A and Team B.
2. Team A screen: tabs Your Teams / Opponents / Add. **Your teams are listed before you type anything.** Each row has logo, name, city and captain's name, which tells apart three teams with the same name. Search and a QR scan are in the header. Tap a team, then Done.
3. **"Select playing squad (optional)":** quick search plus "Add new player". People who **played last match** are listed first and tagged. Each tap adds a check, and the header counts them. Then Next.
4. **Roles, as one segmented sheet:** Captain / Wicket-keeper / 12th man, choosing only from the squad just picked. Then Done.
5. Back on the match screen the team shows "Squad (3)". For Team B, **the Opponents tab opens first**.
6. **Same screen** shows the match settings: type, overs, city (filled in), ground, date and time (filled in: now), ball, a wagon-wheel toggle, pitch, and **Match officials** (Umpires, Scorers, Live streamer, Others) as 4 icons.
7. The footer has **two clear endings: "Schedule match" or "Next (toss)".**

Count: about 20 taps plus 1 per player, about 8 screens. Squad, roles and officials are all optional and none blocks the start.

**C. Add a player to a team (2:34–2:40):** one sheet with 4 routes: team link (WhatsApp, copy, share), phone number, phone contacts, team QR code.

**D. Create team (2:52–2:57):** photo, name\*, captain name, captain mobile (with a contacts picker), city\*, "Add myself to the team", and "Let the captain add players" (on by default). Saved with a single ✓.

## 2. Side by side

| Flow | Reference | SportnNote today (code) | Friction / who is ahead |
|---|---|---|---|
| Create tournament | 1 long form, 9 required, cricket-specific fields; Skip-able details; guided tabs | **Quick tournament** (`QuickTournamentScreen`): sport, name, format required; teams optional ("not known yet" slots); Today/Tomorrow; "Create & make fixtures" goes to fixtures. Full form (`CreateTournamentScreen`): name, sport(s), dates filled in (today to +5); optional parts folded; lands on Settings with `SetupChecklist` (teams → format → schedule) | **SportnNote ahead** on required fields and on reaching fixtures. Behind on empty-tab guidance (only the checklist guides) and on ground multi-select |
| Teams into a tournament | "Share with captains" link is the main action | `TournamentTeamsScreen`: join link (on/off, copy, WhatsApp, QR) plus `TournamentTeamPicker` (search 2+ letters, or a new team with captain name and mobile, who gets an invite) | Close to even. Our link is a toggle further down, not the main action of an empty Teams tab |
| Pick teams for a match | Your teams listed at once, Opponents tab, rows with city and captain | `ScheduleMatchScreen` `TeamPicker` (team mode): **search only, 3+ letters** (line 754), no "your teams" or recent list (recent lists exist only for pairs), chips show name and colour dot only | **Reference ahead.** At least 5 taps per side and you must remember the name; same-name teams can't be told apart |
| Quick friendly | Teams required | Empty sides become "Team A/B"; "Create & score now" opens scoring at once (about 3 taps); creator is the scorer | **SportnNote clearly ahead** (MVP bar 1) |
| Playing squad | Inside setup, optional, last match's players first | `MatchSquadScreen` (Start/Bench, "copy last XI", counter) and `CricketLineupScreen`, reachable **only from the live match** (`LiveScoringScreen.editSquad`) | Behind on findability: organisers don't know it exists before kickoff |
| Match roles | Captain / WK / 12th man in one sheet from the squad | Captain and vice-captain are **team-level** (`SquadScreen`); football lineup has `isCaptain`; cricket keeper is `MatchSquad.keeperId`; cricket captain at the toss. **No match-day captain** for other sports | Behind: scattered, and only cricket has a match role |
| Officials | 4 icons on the setup screen | `setMatchOfficials` only in the live match Info tab; tournament scorers via `AssignScorersScreen` (share-out modes, ahead of the reference) | Even. Match-level officials can't be set at setup |
| Add players | Link, phone, contacts, QR on one sheet | `AddInvitePlayer`: one box (mobile, name or email), contacts, WhatsApp/SMS invite, jersey number; captain-claim invite | Close. **check** whether a player self-join link or QR exists for a team (`JoinTeamScreen`) and how prominent it is |
| Create team | Name and city; captain mobile, "add myself", "captain adds players" | `TeamsScreen`: name **and a 2–4 letter short code required**, sport chips default to `'football'` (hard-coded); goes straight to Squad | Small friction: the short code is extra work, and the default ignores your sport |

## 3. Recommendations

**R1. Show your teams before typing in the match team picker.**
- Problem: you must type 3+ letters to find your own team.
- Change: with an empty search, list "Your teams" (this sport) and "Played before" (recent opponents). Rows show the extra detail that tells them apart: city · captain's first name · number of players. Search still works.
- Files: `ScheduleMatchScreen.tsx` (`TeamPicker`, team mode), repos (my teams, recent opponents by sport).
- Impact **High**. Size **S**.
- Risk: privacy. If the captain is under 18, show initials (`core/minorPrivacy`). Works the same in every sport.

**R2. Optional "Who's playing" step inside match setup.**
- Problem: squads can only be set after the match is created.
- Change: after a side is picked, show a "Pick who plays (optional)" link that opens the existing Start/Bench picker as a sheet. Last match's players come first and are tagged. Include "Add player" (`AddInvitePlayer`) and a counter against players-a-side.
- Files: `ScheduleMatchScreen`, extract the body of `MatchSquadScreen` into a component, plus `CricketLineup` for cricket.
- Impact **High**. Size **M**.
- Risk: individual sports skip it (sport meta `participantKind`). The draft is saved with `setMatchSquad` right after `createMatch`. "Create & score now" must never wait on it.

**R3. Match-day roles from the squad, sport-aware.**
- Problem: roles are scattered, and only cricket has a match role.
- Change: a role row in the same sheet, with tabs from `data/teamRoles` (football: Captain, Goalkeeper; cricket: Captain, Wicket-keeper; basketball and kabaddi: Captain; volleyball: Captain, Libero). The captain defaults to the team captain when they are playing. Use our own labels.
- Files: `MatchSquad` type, `setMatchSquad`, `LiveScoringScreen` (cricket toss reads it).
- Impact **Med-High**. Size **M**.
- Risk: **data model**. Add `captainId` and a role map to the match squad (**check** whether the storage is jsonb; if not, it needs a migration). Every sport must get the same treatment (founder rule). Security break-it is needed: a captain may only set their own side, as the server already enforces for squads.

**R4. Officials at setup (optional).**
- Problem: officials can only be added once the match exists.
- Change: under More options, an "Officials" row with the sport's own titles (referee, umpire, judge, scorer), picked with `PersonPicker`.
- Files: `ScheduleMatchScreen`, `setMatchOfficials`.
- Impact **Med**. Size **S**.
- Risk: invited people only by an exact number (as today).

**R5. Two clear endings on match setup.**
- Problem: whether you start now or later depends on the kickoff field, which is easy to miss.
- Change: footer buttons "Save for later" and "Start now". The kickoff time still fills in from the choice.
- Files: `ScheduleMatchScreen` footer (`isImmediate`).
- Impact **Med**. Size **S**.
- Risk: none in the data. Clone and tournament matches keep today's behaviour.

**R6. Empty tournament tabs say the next action.**
- Problem: only the checklist guides an organiser after creating a tournament.
- Change: an empty Teams tab leads with "Share the join link with captains" (it turns the link on if it's off), with "Add a team myself" as a link. An empty Matches tab offers "Make fixtures automatically" (GenerateFixtures) or "Add one match".
- Files: `TournamentProfileScreen`, `TournamentTeamsScreen`.
- Impact **Med-High** (MVP bar 4: 8 teams to standings). Size **S**.
- Risk: turning the link on is a visible change, so say so in a one-line note.

**R7. Lighter team creation.**
- Problem: the short code is required, and the sport chips ignore your sport.
- Change: make the short code optional (worked out from the name; the code already exists in `quickSideShort`). Default the sport to your last or main sport (`useMySports`). Add optional "Captain's mobile → invite", "I play in this team", and "Captain can add players" (on).
- Files: `TeamsScreen`, `createTeam`, `EditTeamScreen`.
- Impact **Med**. Size **S**.
- Risk: invites to minors go through the guardian, as today.

**R8. One "Invite players" sheet on a team.**
- Problem: the ways to add players are spread out.
- Change: one sheet with four routes: team join link (WhatsApp, copy), QR, mobile number, contacts. Reuse `InviteQrShare` and `AddInvitePlayer`.
- Files: `SquadScreen`, `JoinTeamScreen`.
- Impact **Med**. Size **M**.
- Risk: **privacy and security**. A self-join must be a request the captain approves; under-18s need guardian consent; the link must not reveal the squad's contact details. Security break-it is needed.

**R9. Pick several grounds for a tournament.**
- Problem: you can't pick several grounds at once.
- Change: multi-select in `VenueField` for tournaments, showing how many games each ground has hosted.
- Impact **Low-Med**. Size **S**.

**R10. "Auto or by hand?" when scheduling.**
- Problem: "make fixtures" and "add one match" are two separate actions.
- Change: one Schedule entry asking Automatic (GenerateFixtures) or One at a time (ScheduleMatch).
- Impact **Low**. Size **S**.

**Keep (already better):** the no-names quick friendly, Quick tournament slots, per-sport defaults, one record per team, "copy last XI", Assign scorers, the setup checklist.

## 4. Ranked top 10
1. R1 Your teams before typing (H/S)
2. R6 Empty tabs say the next action (H/S)
3. R2 Optional "Who's playing" in setup (H/M)
4. R5 Save for later / Start now (M/S)
5. R7 Lighter team creation (M/S)
6. R3 Match-day roles, sport-aware (M-H/M, model change)
7. R4 Officials at setup (M/S)
8. R8 Invite players sheet (M/M, security)
9. R9 Pick several grounds (L-M/S)
10. R10 Auto or by hand (L/S)

Each needs tests first, unit and integration tests, a break-it list, and a 500-user simulation before publishing (quality mandate). R3 and R8 also need Security; R1, R2, R3 and R6 need a Design review.

## 5. What NOT to copy
- **Paid upsells inside creation** (menu, Home sheet, ₹299 sponsor tab, "find your city rank"). They interrupt the organiser at the ground, which goes against the MVP loop.
- **One sport's fields at tournament level** (ball type and pitch type required). Our per-sport basics with standard defaults respect "every sport equal".
- **The 9-field long form.** Our quick tournament and folded options are faster.
- **Rules about order in the structure** ("add rounds before groups" alert). The organiser picks a format; we build the structure.
- **Everyone's photo and "played last match" shown to anyone.** For under-18s use initials and show the tag only to the team's managers.
- **The organiser's phone number on the public tournament page**, and helpline call buttons on every page.
- **Asking for camera permission on opening the team list** (1:24). Ask only when the person taps Scan.
- **Duplicate teams with the same name.** Keep one record and reuse it.
- **Their wording and screens** ("Captain, WK, 12th man", the "+" menu labels, the two "+" circles with VS). Learn the pattern, not the copy.
