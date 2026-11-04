# UI audit — round 1 (2026-11-05)

Founder: the app should be pleasing on the eye, use lookups instead of typing, take the fewest taps for each job, and highlight what matters (for example, who is playing right now in scoring).
Design system page (tokens from `src/core/theme.ts`, plus the proposed rules): https://claude.ai/artifact/HKMekuw3Am4h7KYDCdwUGg
Checked in the offline demo: Home → Score a match → snooker friendly → live scoring; New tournament.

## Ranked findings

| # | Where | Problem | Fix (proposed) |
|---|-------|---------|----------------|
| 1 | Live scoring | While you tap balls, the score card and "who's at the table" are scrolled off-screen. You score blind. | Keep a compact sticky score bar at the top of Scoring: both scores, frame, and the player at the table in a lime band. |
| 2 | Live scoring | "A at the table · break 1" is plain body text, the same weight as everything around it. The "At the table" pill names no one. | Live highlight rule: the player/pair in play gets a lime band and bold name, in the score bar and on their row. Same component in every sport. |
| 3 | Live scoring | Weak feedback where you tapped: after potting a red, the screen jumps (the toss row disappears). An "Undo: red · break 1" bar does confirm it, but it sits above, away from the buttons. | Brief flash on the scored side plus a one-line "Red · A · break 1" toast near the buttons; keep the layout stable (reserve the toss row's space or move it above). |
| 4 | Create & score now → Start the match | Two taps to begin: "Create & score now", then "Start the match" on the next screen. | "Create & score now" starts the match straight away; keep Start only for scheduled games. |
| 5 | Match set-up | Player 1 shows "Demo (me)" and an empty search box under it, so it's unclear whether Player 1 is set. | Picked players show as chips with ✕; the search box appears only for an empty slot. |
| 6 | Match set-up | One long form: sport, format, players, kickoff, rules, scoring, venue, Maps link, stream link. | Show sport, players and Create first; fold rules, venue, Maps and stream under "More options" with the defaults shown in one line. |
| 7 | Match set-up and New tournament | Venues are a fixed row of chips (the same 6 Bengaluru venues everywhere) plus a free-text field. | One venue lookup: recent and nearby first, search, "Add a new venue". |
| 8 | New tournament | City is free text ("e.g. Hyderabad") although the app has a city list with search. | Use the city lookup from personalised Home. |
| 9 | New tournament | One very long page: banner, logo, name, city, grounds, time zone, category, host, contested by, co-hosts, divisions, dates, 34 sports, contact, rules, reminders, registration. | Three short steps: 1) name, sport(s), dates, city; 2) format and teams; 3) everything optional, prefilled. Create works after step 1. |
| 10 | New tournament | All 34 sports shown as a grid every time. | Show the organiser's own sports first, then "More sports". |

## Round 2 (2026-11-05): Home, Matches, Discover, pool doubles scoring, Organize, Quick tournament, Profile

| # | Where | Problem | Fix (proposed) |
|---|-------|---------|----------------|
| 11 | Pool doubles scoring | Your example exactly: "Rohan Nair shoots next" is bold body text, same as the lines around it; the score card above shows neither who's at the table nor who's next. | Rule 1 + 2: the score bar shows "🎱 Rohan Nair (Aarav / Rohan)" in a lime band; the partner is shown muted beside them. |
| 12 | Score card (all sports) | Side names are coloured text on white using the team's colour: yellow (#FFD60A) is nearly unreadable, and names cut off ("Aarav / Roh…"). | Names in `text` ink with a colour dot (as on match cards); wrap to two lines or use short names, never a cut-off. |
| 13 | Score card | Large empty band under the card before the scoring controls. | Remove; the sticky score bar replaces it. |
| 14 | Matches tab | Three stacked filter rows (Playing / Running, Live / Upcoming / Completed, 10 sport chips) before any game. | One row: Live · Upcoming · Done tabs; sport and "running" go in a single Filter button. |
| 15 | Matches → Live | Two pool doubles games with the same players look identical: no score, no start time, no table. Each card has both "Tap to score ›" and a "Continue scoring" button. | Show the score and "started 7:40 pm" on every live card; one action per card. |
| 16 | Matches → overdue | Every overdue card repeats the same long sentence and its own full-width lime "Start scoring" button; a screen of lime buttons means nothing stands out. | One "3 games are past their date" note at the top; cards get a small outline "Start" button; lime is kept for the one main action. |
| 17 | Home | Live now lists every live game as a tall card (one line of content each, 65 games); 0–0 games show "vs" with no score. | Compact two-line rows with the score always shown (0–0 too); show 5, then "See all". |
| 18 | Home | The tournament chip row has three identical "Football Cup · Nov 2026" chips. | Add a telling detail (host or city) when names repeat. |
| 19 | Home | The hero ("READY TO PLAY?") takes about a third of the first screen above the three main actions. | Shorter hero (greeting + the three actions inside it). |
| 20 | Organize | Ways to start something are scattered: New tournament (big lime), friendly / series / invite / dashboard tiles, then "Start a session" far below under My teams. "Organizer dashboard" sits among "start" actions. | One "Start" group: Game, Tournament, Session, Series, in the same tile style; dashboard and invite go elsewhere. |
| 21 | Quick tournament | "Players not known yet" is a typed number field; the count says "0 players" while "Demo (me)" is already added; no format is selected by default. | A − / + stepper; the count includes everyone added; League pre-selected. |
| 22 | Profile | One very long page that mixes the player's record (stats, teams, pairs) with admin work (Review verifications, set-up checklist, contacts, guardian). Stats come after the admin cards; Settings is at the very bottom. | Profile = the player's record first. Admin and set-up move to a "To do" card at the top only when something is pending, and to Settings; a gear icon in the header opens Settings. |
| 23 | Discover | Two full-width primary bars stacked (Connect / Search toggle in green, Post a listing in lime). | Search as a field in the header; Post a listing as a small "+" button. |

## Round 3 (2026-11-05): football scoring, tournament page, team page, settings, notifications, squad session, first run

| # | Where | Problem | Fix (proposed) |
|---|-------|---------|----------------|
| 24 | Scoring, across sports | Each sport's scoring screen has a different shape: football has a compact score strip; pool and snooker have a tall card with a big empty band. Side names are short codes in football ("RED · BLU") and full names in cue sports. | One shared score bar for every sport (same height, names, clock or frame, who's in play), sport-specific controls below it. |
| 25 | Football scoring | One very long page of ~12 action groups (goal, voice, possession, stoppage, penalty, attacking, defensive, discipline, subs, backfill, timeline, added time). "Added time / End 1st half" — the thing due at 45:00 — is at the very bottom. | Time-based prompts (added time, end of half) appear in the score bar when due. Frequent actions (goal, card, sub, shot) on top; the rest under "More actions". Voice scoring as a mic button in the bar, not a large panel. |
| 26 | Football scoring | "Possession — RED 100% : 0% BLU" right after kick-off reads as broken. | Show possession only after a minute of play, or as "—". |
| 27 | Tournament page | A live tournament opens on Info (hosts, format), not on today's matches and scores. | Open on Matches while live (Info otherwise). |
| 28 | Tournament page | Dates print as "2026-10-29 → 2026-11-12"; "Manage" appears both in the header and as a tab; the organiser sees a big lime "Follow tournament" on their own tournament; "Add a host" is a raw field on Info. | Dates as "29 Oct – 12 Nov"; one Manage entry; hide Follow for hosts; adding hosts moves to Manage. |
| 29 | Team page | Every number sits in its own card at the same weight (played, won, win rate, goals for/against…), so nothing leads. The next fixture (Fri 18:00) is buried among past results near the bottom. "Stats" and "Squad" look like buttons, not tabs. Each squad row repeats "⚽ Football". | Lead with Next match and Form; one compact stats block; real tabs; drop the repeated sport on rows. |
| 30 | Squad session | All 34 sports as a grid with none chosen (Quick tournament shows 8 + "More"); "No team" is pre-selected although you have a team (Fnatic); team name is typed. The reason Start is disabled ("Tick at least 3 players") is at the very bottom. | Same sport picker as Quick tournament, defaulting to the team's sport; pre-select your team; explain the disabled button next to it. |
| 31 | Settings | Clear, but "Messages", "Following" and "Join a team with a code" sit under Account although they're features, not account settings. | Move them to Profile; keep Settings for preferences, account, help and legal. |
| 32 | Notifications | Only "alerts from players you follow"; things you need to act on (invites, "you're scoring at 6 pm", join requests) live elsewhere. | One inbox: "Needs you" on top, then follows. |
| 33 | First run (Personalise) | Clean. The choices look like plain rows; nothing shows they're multi-select until you tap. | A tick box on each row. |


## Round 4 (2026-11-05): sign-in (live site, viewed only), cricket and badminton scoring, tournament Manage, parent link

| # | Where | Problem | Fix (proposed) |
|---|-------|---------|----------------|
| 34 | Sign-in (app.sportnnote.in) | Four lime / primary controls compete on the first screen: "Continue your game", "Send code", the Sign in tab, then Sign in; phone and email forms are both fully open. A new visitor can't tell which path is theirs. | Phone first and alone, one primary button; "Use email instead" as a link; "Continue your game" as a quiet banner above. |
| 35 | Cricket scoring | The score card changes shape the moment you press Start (a big two-score card, then a compact strip), so the screen jumps. The big card shows "0/0 : 0/0", which reads as a ratio rather than two innings. | The shared score bar from #24, the same before and after start; cricket shows "RED 0/0 (0.0 ov)" for the batting side only. |
| 36 | Cricket scoring | Before the first ball you must record the toss, its choice, and tap captain and keeper for both sides (each a separate tap) — the scoring buttons don't appear until all are done. "Tap a player to make them captain or keeper" doesn't say which a tap sets. | Default captain and keeper to the first two in the line-up (changeable later); toss as one row "Who bats first?"; scoring buttons visible at once. |
| 37 | Badminton scoring | The best live highlight in the app: two big side buttons with a "SERVING" badge. But "Who serves first?" is asked again below, right after you picked it on the Start button; and the green side's name is light green on white. | Keep this as the model for the shared live highlight; remove the repeat question; names in ink with a colour dot (#12). |
| 38 | Matches → Running | A cricket game that hasn't started shows under Running (all not-finished), next to games in play. | Running = live only; not-started games stay in Upcoming. |
| 39 | Tournament → Manage | The checklist says "Add teams — none yet" while the Teams tab lists 4 teams and the tournament is live. | Count the teams already in matches; investigate the data mismatch (may be a real bug, not just display). |
| 40 | Tournament → Manage | About 20 rows at equal weight: everyday jobs (schedule, scorers, share fixtures) sit among rare ones (link an earlier edition, qualifies to, ownership, delete). | Everyday jobs on top as tiles; the rest under "More". |
| 41 | Parent / guardian | The code-entry box comes first even when you're already linked; the screen is about linking, not about the child's games. | Linked: show the child first (next games, results, messages); "Link another child" below. |

Not covered: fixtures generation, the Awards and Stats tabs, store-style screenshots on a real phone.

## Patterns behind most findings
- **Lime is overused.** It should mean one thing per area (the main action, or who's playing now); today it's on every card button.
- **Every screen shows everything.** Options, help sentences and admin items sit at full weight next to the main job. The fix is "main job first, the rest folded".
- **No shared live-state component.** Each sport writes its own "at the table / serving / batting" line, so none of them stand out.
- **Team colours are used as text colours.** They're chosen for shirts, not for reading.
- **The same job looks different in different places.** Sport pickers (34-grid vs 8 + More), score cards, dates and "start" actions each have several versions.
- **What's due now isn't brought forward.** Added time, the next fixture, a live tournament's matches and "needs you" items sit where they were defined, not where you look.

## Fix plan (proposed order)
1. **Shared score bar + live highlight** (#1–3, 11–13, 24, 35, 37): one component for every sport, based on badminton's side buttons. Fixed at the top of Scoring; names in ink with a colour dot; the player/pair/side in play in a lime band; a short flash and a one-line note after each tap; time prompts (added time, end of half) appear in it when due.
2. **Fewer taps to start** (#4, 5, 36, 37): Create & score starts the match; captain/keeper defaults; no repeated questions.
3. **Lime only for one thing** (#16, 20, 23, 34): one main action per screen; outline buttons elsewhere.
4. **One of each** (#7, 8, 10, 30): one sport picker (yours first + More), one venue lookup, one city lookup, one date format.
5. **Lists that show the state** (#14, 15, 17, 18, 38): scores on every live card, compact rows, Running = live.
6. **Main job first** (#6, 9, 22, 25, 27, 29, 40, 41): fold rare options; open live tournaments on Matches; Profile and team pages lead with the record and the next game.
7. **Data check** (#39): the teams mismatch.

## Next
Build rules 1–3 and findings 11–13 (sticky score bar + live highlight + tap feedback + readable side names) on pool and snooker doubles first, then roll out to every sport; then 4–5 (fewer taps), then the lookups (7–8), then the tournament steps (9–10). Each change: before/after screenshots and tap counts, tests, demo check, founder approval to publish.
