# MVP audit: football and basketball scoring

2026-10-31. Read-only audit from the scorer's seat: an adult at a turf 5-a-side, a park 3x3 or a weekend league, phone in one hand, in a hurry.

**How I checked it:** I read the code: `src/sports/football/*`, `src/sports/basketball/*`, `src/screens/LiveScoringScreen.tsx`, `src/data/useLiveMatch.ts`, `src/screens/ScheduleMatchScreen.tsx` and `src/components/AddInvitePlayer.tsx`. I replayed the real engines in node scripts to confirm every "verified" finding below. The existing tests all pass: 13 files, 247 tests.

**Not repeated here:**
- The eligibility gate (`TESTING_ALLOW_UNVERIFIED`) is L1 in `audit-loop.md`.
- Generic setup defaults are L4/L5 in `audit-loop.md`.
- Items still open in `docs/sport-depth/` are only re-listed where they matter for the MVP.

## Summary

| Sport | P0 | P1 | P2 |
|---|---|---|---|
| Football | 0 | 9 | 6 |
| Basketball | 1 | 10 | 6 |
| **Total** | **1** | **19** | **12** |

**The three most important things:**
1. **Basketball: one tap ends a level 3x3 game early (P0).** "Start Overtime" shows in place of End Match whenever the score is level in the last period, including 0-0 at tip-off in 3x3. The text above it says the game is over. The button has no confirm. In 3x3 the next 2 points then end the game.
2. **Pickup games without proper rosters fall apart.**
   - Football: most buttons dead-end with no players listed.
   - Football: rolling subs can't be logged without a lineup.
   - Basketball: no team fouls without a roster.
   - Basketball: a team basket can't be given a scorer later.
   - Both sports: adding a friend mid-match needs their mobile number.
3. **The defaults produce wrong data, and the correction tools mislead.**
   - Football defaults to 11-a-side with 45-minute halves, so a 2x20 turf game gives every player 90 minutes.
   - Basketball defaults to a stoppable clock that stops itself after every foul and waits for a tap.
   - In both sports, Undo doesn't say what it will remove. An assist picked after an Undo lands on the wrong goal, or on no basket at all.

## Football

No P0. Draws, extra time and penalties all finish correctly, and the score engine held up in every replay I ran.

| # | P | Finding | Where (file:line) | Fix | Size |
|---|---|---|---|---|---|
| F1 | P1 | **Undo doesn't say what it removes.** Football events have no label and the plugin has no `undoLabel`, so the bar just reads "Undo · rewind step-by-step". Several actions log more than one entry: a goal with an assist (2), a saved shot (shot + save), a penalty won and scored (2), a second yellow (yellow + red), and kick-off (kick-off + lineup stamps). The scorer can't tell how many taps undo one goal. Verified: `undoLabel` returns null for GOAL, ASSIST and STAT. | `src/sports/undoLabel.ts:47,69`; `src/sports/football/index.tsx:1620-1673`; `src/sports/football/actions.ts:51-58` | Add `footballUndoLabel`: "goal · Ravi (2-1)", "assist · Ajay", "shot · saved", as cricket and rugby have. Better still, make a goal and its assist undo as one step. | S |
| F2 | P1 | **An assist picked after an Undo rewrites an earlier goal's assist.** The goal panel ("Goal recorded. Assist?") stays open after the global Undo removes its goal. Picking an assister then attaches to the side's latest remaining goal. Verified: goal 1 was assisted by p2; after the Undo and a pick, it shows p4, and p2 has silently lost the assist. | `src/sports/football/engine.ts:602-625`; `src/sports/football/index.tsx:846-897` | Put the goal's event id on ASSIST (`ref`) and attach only to that goal. Close the goal flow when its goal leaves the state. | S |
| F3 | P1 | **The default format is 11-a-side with 45-minute halves, so turf games get wrong minutes.** Minutes played come from the format's half length, not the real clock. Verified: a 2x20 game scored on the default gives each starter 90 minutes (40 on the "5s turf" preset). Second-half events are stamped from 46'. Goals per 90 and Golden Boot tie-breaks are then wrong. | `src/sports/football/meta.ts:39-41`; `src/sports/football/keepers.ts:42-56`; `src/sports/football/engine.ts:364-367` | Default a friendly to the last-used preset (see L5), else 5s/7s. When "End 1st half" is tapped well short of the format, ask "Halves are 20 min?" and patch `halfMinutes`. | S |
| F4 | P1 | **No single-period game.** The only control in the first half is "End 1st Half". A 1x40 game has to go End half, then Start 2nd half, then End Match, and players are credited two halves of minutes. | `src/sports/football/index.tsx:1312`; `src/sports/football/meta.ts:50`; `src/sports/football/keepers.ts:44` | Add a "Periods: 2 halves / 1 period" format field. With one period, the button reads "End Match". | S |
| F5 | P1 | **A pickup game with no players listed dead-ends.** Goals (team goal) and corners work. 12 of the 13 default stat buttons (all but Corner), the penalty's "taken by" step and subs open "No players on the field." with only Cancel. Card offers only "Team official". | `src/sports/football/index.tsx:85-87, 303, 935-939, 979-983, 1009-1024` | When a side has no players, skip the player step and log a team-level stat. Make Goal one tap (a team goal). Hide player-only actions. | S |
| F6 | P1 | **Adding a friend mid-match needs their mobile number.** The Scoring tab's "Add / invite a player" box takes new people by number only. The name-only option already exists in `PersonPicker` (clubs and disputes use it) but isn't wired in here. | `src/components/AddInvitePlayer.tsx:216-246`; `src/screens/LiveScoringScreen.tsx:1358-1365`; `src/components/PersonPicker.tsx:182-184` | Pass `onNameOnly` so the scorer can add a name-only player to that team, to be claimed later. Shared with basketball (B9). | S |
| F7 | P1 | **Rolling subs can't be logged without a lineup.** With no lineup, everyone in the squad counts as on the pitch, so "Player ON (from the bench)" is empty. It also wrongly says "No players on the field." Most friendlies never set a lineup. | `src/sports/football/index.tsx:316-320, 347-354, 698-708` | With no lineup, offer every squad player except the one going off (as basketball's Quick sub does). Or ask once who's on. | S |
| F8 | P1 | **The scoring screen is overloaded by default, and Goal sits below the fold.** 14 stat types are tracked by default (13 buttons plus the possession bar). The order is: voice bar (with a text box), then possession bar, then Stoppage, then Goal. Possession also ticks for home from kick-off. A single foul hands possession over, which makes a made-up split public (e.g. 33-67). | `src/sports/football/engine.ts:170-175`; `src/sports/football/index.tsx:656-678, 1156-1176`; `src/sports/football/depth.ts:150-156` | Use a "Quick" default for friendlies: goals, assists, cards and subs; everything else opt-in in Scoring settings. Possession off by default. Goal buttons first. Shrink the voice bar to a mic icon. | S |
| F9 | P1 | **Both Goal buttons can carry the same label.** Teams made on the fly get auto-initials, and the controls show only those short names. "Kondapur FC" and "Kukatpally FC" are both "KF", so both buttons read "Goal — KF" and only the colour differs. The colour can match too if both teams are created before the list refreshes. | `src/screens/ScheduleMatchScreen.tsx:53-57, 199, 333`; `src/sports/football/index.tsx:1173-1174` | Make short names unique when a team is created (KF / KUK). Show the full team name on the two Goal buttons, wrapping if needed. | S |
| F10 | P2 | **The clock freezes at the half's length when no added time is entered.** Verified: 27 real minutes into a 20-minute half, a goal is stamped 20'. Followers see the clock stuck at 20:00 with the live dot on. The "+1…+8 added time" box appears every half, even with no fourth official. | `src/sports/football/engine.ts:373-383, 430-439`; `src/sports/football/index.tsx:1277-1290` | Amateur default: let the clock run on as 20+x without asking. Keep the added-time chips as an option. | S |
| F11 | P2 | **"Stoppage / injury" logs a public row in one tap, right above Goal,** with the side guessed from possession (prior F6). It is also sent without a minute, so every replay re-stamps it. Verified: logged at 13', the same log replayed 30 minutes later shows 43'. | `src/sports/football/index.tsx:1166`; `src/sports/football/engine.ts:465, 628-631` | Send it through `fire()` so it carries a minute and half. Move it into Quick options, or ask for the reason first. | S |
| F12 | P2 | **Two start taps, and no way to the lineup.** The scorer taps "Start the match" (shared screen), then "Kick off". The kick-off screen says "Set the lineup, then kick off" but has no lineup button. | `src/screens/LiveScoringScreen.tsx:1415-1419`; `src/sports/football/index.tsx:720, 734` | Make one "Kick off" tap start both. Add a "Set lineup" button on the kick-off screen. | S |
| F13 | P2 | **A friendly that ends level can't go to penalties on the spot.** "If level at full time" is only set during setup. It's not in Scoring settings. | `src/sports/football/engine.ts:197-216`; `src/sports/football/meta.ts:59-66` | Add `decider` to the live settings, or offer "Penalties?" on the level full-time confirm. | S |
| F14 | P2 | **Two misleading status lines for followers.** A level knockout reads "Full Time" while the scorer is still choosing extra time or penalties. A finished shootout reads "Home win 4–3 on pens" instead of the team's name. | `src/sports/football/index.tsx:1651-1657` | Show "Level, extra time / penalties next" until it's decided. Use the team name, or a neutral "Won 4–3 on pens" with the winner highlighted. | S |
| F15 | P2 | **Logging a shot takes 4–5 taps** (Shot, team, player, on/off target, outcome), and offside forces a player pick (prior F11, still open). | `src/sports/football/index.tsx:303, 1077-1091, 1129-1136` | Shot buttons per side. Offside logged for the team by default. | S |

## Basketball

| # | P | Finding | Where (file:line) | Fix | Size |
|---|---|---|---|---|---|
| B1 | **P0** | **"Start Overtime" shows mid-game whenever the score is level in the last period, with no confirm.** In 3x3 that is the whole game, including 0-0 at tip-off. In 5x5 it is any tie in Q4. The text above the button says "Scores level at the end of Q1 — basketball plays overtime", which is false mid-game. The reducer doesn't check that time is up. Verified: 3x3 at 2-2 with 6:00 left, one tap goes to overtime (first to 2), and the next away 2-pointer ends the game 2-4. In 5x5 the tap jumps to OT and resets the clock to 5:00. Undo can rescue it only if the scorer notices. | `src/sports/basketball/index.tsx:821-841`; `src/sports/basketball/engine.ts:618-622` | Show the "level" panel only when the clock shows 0:00, or always when the game has no clock. Otherwise show End Match. Confirm "Start overtime?". Make the reducer refuse START_OVERTIME before time is up when there is a game clock. | S |
| B2 | P1 | **No running-clock mode.** The FIBA, school and 3x3 presets use a stoppable clock that stops itself on every foul, time-out and late basket, then waits for a Start tap. A scorer working alone forgets. Verified: after a foul at 1:00, the clock still shows 9:00 left eight real minutes later, so the 3x3 10-minute limit never arrives. Switching the clock off loses the countdown and the 0:00 prompt altogether. | `src/sports/basketball/meta.ts:27, 30, 64`; `src/sports/basketball/engine.ts:465-467, 480, 560, 570`; `src/sports/basketball/index.tsx:887-889` | Add a third mode, "Running clock" (stops only for time-outs and the end of a period), as the friendly / pickup default. Table-run games keep the stoppable clock. | M |
| B3 | P1 | **A drawn game shows a trophy for the home team on the public line score,** and greys out the away row. Verified: at 0-0 ended, the `winner` prop is "home". This is reachable from "End level, no overtime…" or the "Allow a draw" option. | `src/sports/basketball/index.tsx:985`; `src/components/LineScoreboard.tsx:69-74` | Set `winner` from a strict comparison, and leave it undefined on a draw. | S |
| B4 | P1 | **The score buttons jump after every basket.** The "Assist?" box appears above both scoring pads and disappears at the next play, so the pads move down and then back up. A quick second tap lands on the wrong button or the wrong team. | `src/sports/basketball/index.tsx:665-700` (box) vs `714-715` (pads) | Give the prompt a fixed slot below the pads, or show it as an overlay. Never move the pads. | S |
| B5 | P1 | **Undo doesn't say what it removes** (as F1). Basketball events have no label and there is no `undoLabel`. A foul that disqualifies logs 2 entries (foul + eject). An and-one logs 2 (basket + free throw). A bonus foul logs the foul plus 2 free throws. Verified: `undoLabel` returns null for SCORE. | `src/sports/undoLabel.ts:47,69`; `src/sports/basketball/index.tsx:1011-1037` | Add `basketballUndoLabel`: "+3 · Arjun (54-50)", "foul · Rahul", "free throw made". | S |
| B6 | P1 | **An assist picked after an Undo is logged with no basket** (as F2). The "Assist?" box survives the global Undo. Verified: ASSIST is accepted with no make, so a player gets a phantom assist. | `src/sports/basketball/index.tsx:106, 129-133, 682`; `src/sports/basketball/engine.ts:549-550` | Clear `assistFor` when the log shrinks from outside the controls (Undo), and tie the assist to the basket's id. | S |
| B7 | P1 | **With no roster, fouls can't be logged at all.** Fouls only start from a player row, which reads "No roster set." So team fouls, the bonus banner and bonus free throws never work in a pickup or no-roster school game. | `src/sports/basketball/index.tsx:54-66, 404, 725-728` | Add a "Team foul" button per side that opens the foul-type chips with the team as fouler. The free throws follow as now. | S |
| B8 | P1 | **A team basket can't be given a scorer later.** Edit is offered only for plays that already name a player. The fast path logs team baskets ("or the basket goes to the team"), so the only fix is delete, then backfill. That loses the clock second and the order of play. Football allows this edit. | `src/sports/basketball/index.tsx:167, 811`; `src/sports/basketball/names.ts:46` | Allow Edit on a team basket to pick the scorer, keeping its points, zone and second. | S |
| B9 | P1 | **Adding a friend mid-match needs their mobile number** (same as F6). | `src/components/AddInvitePlayer.tsx:216-246` | Same fix as F6: wire in `onNameOnly`. | S |
| B10 | P1 | **The two teams' scoring pads are stacked and look the same.** Each reads "+2 Paint / +2 Mid / +3 Corner / +3 Top", with the team only in a small heading ("Basket — KF", with the same short-name collision as F9). With a squad's player chips in between, the away pad is below the fold. | `src/sports/basketball/index.tsx:578-651, 714-715` | Put home and away side by side, with the team name or colour on every button. Move the player chips into an optional "Who scored?" after the tap. | M |
| B11 | P1 | **Every basket is a zone call by default** ("Paint or Mid?", "Corner or Top?"): four buttons instead of +2/+3. In this layout the and-one sits in the after-basket box. This was the founder's default on 2026-10-22, but it slows the hurried scorer and adds judgement errors. | `src/sports/basketball/meta.ts:14, 60`; `src/sports/basketball/index.tsx:593-619` | For friendlies, default to plain +2/+3 and make zones opt-in ("shot chart"). Founder to confirm. | S |
| B12 | P2 | **Between quarters only "Start Q2" is shown.** Subs, backfill, the timeline editor and a technical at the break can't be reached until the next period starts. | `src/sports/basketball/index.tsx:494-502` | Show subs, the timeline and backfill on the break screen, as football does at half-time. | S |
| B13 | P2 | **A time-out logs in one tap and stops the clock** (prior B5, still open). The buttons sit just under the player rows. | `src/sports/basketball/index.tsx:559-570, 738-741` | Show a short "Time-out logged · Undo" toast. | S |
| B14 | P2 | **Scoring is player-first.** Forgetting to pick the scorer gives a team basket with no player stats. | `src/sports/basketball/index.tsx:583-592` | Points first, then an optional "Who scored?" (Skip = team), merged with the Assist prompt. | M |
| B15 | P2 | **A coach or bench technical can't be logged:** the fouler must be a player (prior B13). | `src/sports/basketball/index.tsx:337-384` | Add a "Coach / bench" fouler option. It counts as a team foul and gives 1 free throw. | M |
| B16 | P2 | **Two start taps:** "Start the match", then "Start Q1" (as F12). | `src/screens/LiveScoringScreen.tsx:1415-1419`; `src/sports/basketball/index.tsx:494-501` | One tap starts both. | S |
| B17 | P2 | **A fouled-out player stays in the on-court five, greyed out, with no "sub needed" prompt** (prior B11 remainder). | `src/sports/basketball/index.tsx:209-213, 467-474` | Show a "Sub required for X" banner with a one-tap sub. | S |

## Already good

- **The generic safety items G1–G7 are fixed in the current code.**
  - End, Restart and Cancel are at the bottom behind confirms (SD-106).
  - Walkover and Discard confirm first.
  - The deciding tap's result is held for 60 s with Undo (SD-111).
  - The screen stays awake, and taps buzz (SD-110; the phone needs a new APK).
- **Football results always come out right.**
  - A friendly draw stands.
  - Extra time and penalties finish correctly, with the toss winner picking who kicks first.
  - Sudden death works.
  - A second yellow brings its red, and removing the yellow removes the red too.
  - The earlier double-goal bug and the goal lost on Cancel are fixed (SD-114).
- **Ends of halves, quarters and matches confirm first,** in both sports.
- **Basketball 3x3 rules are complete:** first to 21 ends the game, the 10-minute limit prompts at 0:00, overtime is first to 2, the 3x3 foul ladder is applied, and points are 1s and 2s.
- **Basketball foul-outs and ejections are tracked by team and player id,** so two same-named players can't be mixed up (SD-122). Ejecting asks first.
- **Free throws after a foul open with the count already filled in,** including bonus free throws.
- **A team goal works with no players listed,** and its scorer can be filled in later in football.
- **"Joining late" works:** football can start the clock at the current minute, and both sports can backfill missed plays.
- **The timeline editor confirms before deleting,** and Edit then Cancel keeps the original play.
- **The scoring logic is well covered by tests:** 247 tests across 13 files, all passing.
