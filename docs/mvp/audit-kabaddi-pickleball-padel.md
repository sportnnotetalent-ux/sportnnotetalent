# MVP audit: kabaddi, pickleball, padel (from the scorer's seat)

Date: 2026-10-31. Read-only audit against [docs/product/MVP.md](../product/MVP.md). The user is an adult organiser or scorer at a friendly or club game, phone in one hand, in a hurry, on a weak network.

How it was checked: I read the engines, the scoring controls, the shared racket parts, the live screen, the friendly setup and the format presets. I ran the existing tests for these sports (`pickleball-server`, `kabaddi`, `kabaddi-rules`, `replay-racket`, `racket-fixes`, `sd117c-scorer-flow`, `sd135-racket-p1s`): 138 pass, 0 fail, 2 known todos (MLP freeze, squash English scoring). Each P0 was confirmed with a small node script that replays the engine (kept in the session scratchpad, not in the repo).

## Summary

| Sport | P0 | P1 | P2 |
|---|---|---|---|
| Kabaddi | 2 | 2 | 9 |
| Pickleball | 0 | 4 | 5 |
| Padel | 0 | 4 | 5 |
| **Unique total** (shared rows counted once) | **2** | **8** | **16** |

Shared rows: doubles setup, the double-tap guard, the "time up" ending, the preset label, and the Info format line. They appear in both racket tables.

The 3 most important:
1. **Kabaddi: the 5-raid shootout can end early and name the wrong winner.** It assumes each raid scores at most 1 point, but a raid can score several (K2).
2. **Kabaddi: a failed do-or-die raid against 3 or fewer defenders scores +2 ("Super tackle") instead of +1.** No tackle was made (K1).
3. **Pickleball and padel doubles: you can't start a quick game without naming all four players.** Each one goes through a search, then a "name only" link (PB2 / PD3). Close behind: pickleball's default "Rec (rally · 11)" is secretly best of 3, so a normal one-game rec match never finishes on its own (PB1).

Generic findings G1–G8 from `docs/sport-depth/scorer-ux-audit.md` are all fixed now, so they aren't repeated:
- Undo sits above the controls; End and Restart are at the bottom behind confirms.
- Cancel-start, walkover and discard each ask first.
- The deciding tap holds the result for 60 s, and Undo cancels it.
- The screen stays awake, and taps give haptic feedback.

## Kabaddi

| # | P | Finding | Where (file:line) | Fix | Size |
|---|---|---|---|---|---|
| K1 | P0 | **A failed do-or-die raid against 3 or fewer defenders gives the defence +2 and is called a "Super tackle".** The raider is out because the raid was empty, not because he was tackled, so the defence should get +1. Verified: a 3rd empty raid against 2 defenders replays to `tacklePts: 2, superTackle: true`. It also shows up as a super tackle in the timeline, the commentary and the stats. Do-or-die is on in the Standard and Women/Junior presets. | `src/sports/kabaddi/rules.ts:305-308`, `:322-326`; label `src/sports/kabaddi/engine.ts:635` | Write the failing test first. Then set `superTackle` only when `!dodFail`. Old completed matches would re-score on replay, so gate the change (stamp a rules version on new matches, or mark new raids `v: 3`). Confirm the wording in the AKFI / PKL rulebook first: a failed do-or-die puts the raider out and gives the defence 1 point. | S |
| K2 | P0 | **The 5-raid shootout ends too early and can name the wrong winner.** The early finish treats each remaining raid as worth at most 1 point, but a shootout raid can score several (the buttons go up to +3). Verified: home +3, away 0, home +2 ends the match 5-0 after 3 of 10 raids, though away could still score 12. The existing test asserts the wrong rule (`tests/kabaddi.test.mts:46-48`). The shootout is a standard knockout tie-breaker, and it's offered on every tied friendly. | `src/sports/kabaddi/rules.ts:166-175`; `src/sports/kabaddi/engine.ts:923-935` | Only finish early when the trailing side can't catch up at the most points one raid can score (the defenders on the mat plus a bonus, so 8 for 7-a-side). Or simply play all five raids each. Fix the test, and gate the change for old logs. | S |
| K3 | P1 | **Every raid needs the full form, and "Record raid" sits below the fold on a phone.** The form stacks raider chips, 0–7 touch chips, line-out chips, three toggles, the tackler and tackle-type chips, and a preview. There's no one-tap path for the common outcomes (empty, 1 touch, bonus, raider out), and a raid comes every 30 seconds or so. | `src/sports/kabaddi/index.tsx:347-489` | Pin the preview and the Record button at the top (or sticky at the bottom) of the panel. Add a quick row (Empty · +1 · Bonus · Raider out) that records at once when nobody needs crediting. | M |
| K4 | P1 | **The pause and the two Timeout buttons sit just above the raid buttons and fire on the first tap.** A Timeout also pauses the clock. Undoing it takes two taps (PAUSE, then TIMEOUT), and the bar just says "Undo" for both, so a thumb slip costs a timeout and freezes the minute stamps. | `src/sports/kabaddi/index.tsx:310-331` (auto-pause `:326`); `src/sports/undoLabel.ts:44-45` | Move the clock and timeout row below the raid buttons. Make a timeout a single step (TIMEOUT implies the pause), and give PAUSE, RESUME and TIMEOUT their own Undo labels. | S |
| K5 | P2 | Starting takes two taps with almost the same words: "Start the match" on the live screen, then "Start match" to run the kabaddi clock. | `src/screens/LiveScoringScreen.tsx:1414`; `src/sports/kabaddi/index.tsx:184-192` | For clock sports, have the first Start also send KICKOFF, or skip the second button when the match was just started. | S |
| K6 | P2 | Editing a raid logs two steps: a stat-reversal carrier, then the replacement. One Undo brings the old raid back but leaves the carrier, so the raider's and tackler's live stats stay reversed until full time. The next Undo seems to do nothing, and the bar just says "Undo". | `src/sports/kabaddi/engine.ts:547-556`; `src/sports/kabaddi/index.tsx:157-164` | Make the edit one logged step (the replacing RAID_OUTCOME carries its own reversal), or have Undo pop the pair together. | M |
| K7 | P2 | With no players listed, the screen still shows the Substitutions buttons, which open an empty list. Backfill (a minute box) and "Correct the timeline" also take up space under the controls. | `src/sports/kabaddi/index.tsx:613-670` | Hide substitutions when a side has no squad. Fold Backfill and Correct into one collapsed "Fix a mistake" row. | S |
| K8 | P2 | There's no toss or "who raids first" step: before the first raid both raid buttons are full colour. Already known (audit-2). | `src/sports/kabaddi/engine.ts:341-348`; `index.tsx:336-345` | Add a one-tap "Who raids first?" before the first raid. | S |
| K9 | P2 | Shootout raid buttons only go up to +3, so a 4-point shootout raid can't be entered. | `src/sports/kabaddi/index.tsx:276` | Use the same touch chips as the raid form (0 to the defenders on the mat, plus a bonus). | S |
| K10 | P2 | One "Players per side" covers both teams. A side that turns up a player short reaches its all-out one out too late, so the +2 comes late. | `src/sports/kabaddi/rules.ts:229-240`; `src/sports/kabaddi/meta.ts:28` | Add an optional "playing short" count per side, used like the existing card "short" count. | M |
| K11 | P2 | A super tackle is also awarded when a defender steps out (line-out) and the raider is then caught, with 4 defenders before the raid (3 after the line-out). Check whether the 3-defender test is "before the raid" or "at the tackle". | `src/sports/kabaddi/rules.ts:311-326` | Check the AKFI rule, then use `defendersBefore` if that's the rule. | S |
| K12 | P2 | The clock stops at the half's length but nothing prompts the scorer to end the half. If they forget, the 2nd-half raids are stamped 1st half at the last minute. | `src/sports/kabaddi/engine.ts:302-311`; `index.tsx:676` | When the clock reaches the cap, show a banner: "Time's up — end the 1st half?". | S |
| K13 | P2 | Jargon in setup: "Revival style: Sanjeevani / Amar / Gaminee". The timeline says "All out" where Indian amateurs say "Lona". | `src/sports/kabaddi/meta.ts:30-35`; `engine.ts:642` | Lead with plain words ("Out players come back (Sanjeevani)"), and label the all-out "All out (Lona) +2". | S |

## Pickleball

| # | P | Finding | Where (file:line) | Fix | Size |
|---|---|---|---|---|---|
| PB1 | P1 | **The default "Rec (rally · 11)" is best of 3, but the label doesn't say so, and no preset offers the common single game to 11.** "Match length" is hidden behind "Customize". A rec game ends 11-x, then the match runs on into game 2. The scorer either ends it by hand (Retired / Default plus a typed reason) or leaves it live, which breaks MVP bar 6 (no match stuck on "live"). | `src/sports/pickleball/meta.ts:29`, `:66-72`; `src/components/FormatEditor.tsx:133-136` | Add "1 game to 11" presets (side-out and rally) and make one the friendly default. Put "best of 3" in the preset labels, and show Match length without Customize. | S |
| PB2 | P1 | **A doubles game can't start until all four players are named.** A pair is people, not a typed name. Each player needs a 3-letter search, a wait for the network, then a muted "name only" link. Two pairs take about 15 taps, three typed names and three searches. Teams in other sports are one typed name each. (Shared with padel.) | `src/screens/ScheduleMatchScreen.tsx:478-484`; `src/components/EntrantPicker.tsx:96-105`; `src/components/PersonPicker.tsx:182-185` | Add a "Quick pairs" path: type two first names per pair, with no search, and link them to real players later. Or offer "Pair A vs Pair B" with players added from the scoring screen. | M |
| PB3 | P1 | **With players listed, doubles scoring is locked until "Who starts on the right?" is picked for both teams,** on top of "Who serves first?". That's three required, jargon-heavy taps before the first point, even in rally scoring, where the pick only names the server. | `src/sports/rallyCore.tsx:148-151`, `:167-172`, `:200-202` | Default to the roster order (as older matches do). Keep the picker optional and collapsed; the mid-game "Fix who started on the right" already exists. | S |
| PB4 | P1 | **There's no double-tap guard on the point buttons.** Two quick taps log two rallies: two points, or a side-out plus a point. Undo fixes it, but only if the scorer notices. (Shared with padel.) | `src/sports/PointButtons.tsx:64-69`, `:76-79` | Ignore a second tap on either button within about 400 ms, and flash a tick on the one that counted. | S |
| PB5 | P2 | In side-out scoring, "Fix who served first" disappears after the first rally (in rally scoring it stays). The only fix is to Undo back to 0-0, and nothing tells the scorer that. | `src/sports/rallyCore.tsx:192`; `src/sports/rallyEngine.ts:185-190` | Show a hint: "Wrong server? Undo back to 0-0 and pick again". Or replay the rallies with the other opener (EDIT_LOG with `opening` swapped). | S |
| PB6 | P2 | There's no "time up, leader wins" ending (see PD2). It matters less here because games are short. | `src/screens/LiveScoringScreen.tsx:1011-1021`; `src/core/types.ts:893` | Same fix as PD2. | — |
| PB7 | P2 | The preset label and the "Scoring" chip can disagree. Changing a single option leaves the old preset highlighted, so "Rec (rally · 11)" can stay lit while Side-out is picked. (Shared with padel.) | `src/components/FormatEditor.tsx:110-115`, `:133-145` | When a field moves away from the preset's values, switch the preset to Custom, or to the preset that matches. | S |
| PB8 | P2 | The Info tab's "Format" line shows only "2-a-side". It doesn't say rally or side-out, the points to win, or the match length, so followers can't tell. (Shared with padel.) | `src/screens/LiveScoringScreen.tsx:2610-2633` | Add pickleball (scoring · to N · best of N) and padel (deuce rule · sets · decider) to `formatLine`. | S |
| PB9 | P2 | The side-out screen leans on jargon: "Side-out scoring", the call "4-2-1", "server 2", "0-0-2". It's fine for regulars but opaque to a newcomer. | `src/sports/rallyCore.tsx:216-230` | Add a one-line "?" that explains the three-number call. | S |

## Padel

| # | P | Finding | Where (file:line) | Fix | Size |
|---|---|---|---|---|---|
| PD1 | P1 | **"Single set" plus a match-tiebreak decider turns the whole match into one 10-point tiebreak.** Verified: at 0-0 the board reads "Match tiebreak", and 10 points end the match [10-0]. You get there by picking "Short (to 4, match TB)", then Customize, then Single set; the decider stays on "Match tiebreak". Someone who wanted one quick short set gets 10 points, and the scorer may only notice once the match is over. (Tennis has a deliberate "Match tiebreak only" preset; padel has none, so here it's a trap.) | `src/sports/padel/engine.ts:87-92`; `src/sports/padel/meta.ts:25`, `:53-66` | Hide "Deciding set" when the match is a single set, and reset the decider to "set" when the length becomes 1. If a standalone match tiebreak is wanted, add it as its own named preset. | S |
| PD2 | P1 | **There's no "time up" ending.** Amateur padel is played on a 60–90 minute court booking and often stops mid-set. The only options are Retired, Default, Draw, No result and Abandoned, each with a typed reason. None of them reads "won 6-4, 3-2 (time)". (Shared; P2 for pickleball.) | `src/screens/LiveScoringScreen.tsx:1011-1021`; `src/core/types.ts:893` | Add a "Time up" result kind: the leader on sets, then games, wins; level is a draw. Add a reason chip, a result-line mark, and its standings handling. | M |
| PD3 | P1 | A doubles game needs four named people before scoring (same as PB2). Padel is doubles nearly always. | see PB2 | see PB2 | M |
| PD4 | P1 | There's no double-tap guard on the point buttons (same as PB4). | `src/sports/PointButtons.tsx:64-69` | see PB4 | S |
| PD5 | P2 | Every preset is best of 3, so a quick one-set game needs Customize. | `src/sports/padel/meta.ts:19-27` | Add "1 set, golden point" (and its short-set version) as presets. | S |
| PD6 | P2 | In doubles with players listed, the serving-order picker (four rows of chips) sits above the point buttons at the start of every set, pushing them down. If it's skipped, the server's name and the Ace / Double fault credit follow the roster order, and they can't be fixed mid-set. | `src/sports/padel/index.tsx:89-91`; `src/sports/serve.ts:79-92` | Collapse it to one line ("Serving order: A, then B · change"). Allow a mid-set fix (display only, `v: 2`, as pickleball's right-court fix does). | S |
| PD7 | P2 | The default preset is called "Golden point (WPT style)". WPT no longer exists, and players just say "golden point". | `src/sports/padel/meta.ts:21` | Rename it "Golden point (best of 3)". | S |
| PD8 | P2 | The Info "Format" line leaves out the deuce rule, the set count and the decider (same as PB8). | `src/screens/LiveScoringScreen.tsx:2610-2633` | see PB8 | S |
| PD9 | P2 | The preset label can disagree with the chosen options (same as PB7). | `src/components/FormatEditor.tsx:110-115` | see PB7 | S |

## Already good

- **Padel scoring is right.** Verified by replay: advantage, golden point at 40-40, and Star Point (deciding point at the 3rd deuce). The 7-point tiebreak works at 6-6 (and at 4-4 in short sets), and so does the match tiebreak shown as [10-x]. Serve rotation inside the tiebreak runs A, BB, AA… and the side that received first serves the next set.
- **Pickleball side-out is right.** It has the 0-0-2 start, server 1 to server 2 to side-out, the server named by court position, singles side-out, and the change-ends cue. Rally scoring hands the serve to the rally winner, with rally-doubles positions. Games to 11, 15 or 21, win by 1 or 2, best of 1, 3 or 5 all work. Tests pass.
- **The kabaddi engine is solid apart from K1 and K2.** It covers the bonus with 6 or more defenders, a caught raider's touches voided, all-out +2 with revival, a super tackle on a real tackle, do-or-die, line-outs, technical points, cards, extra time and the Golden Raid.
- **Kabaddi can be scored with no players listed**, since raider and tackler are optional. A raid can be edited in place, and removing one asks first.
- **The racket point buttons are big and in team colours.** They mark the serving side and never default the first server silently. Ace and Double fault sit below them and are smaller.
- **Undo names what it removes** for points and rallies, and the timeline editor replays corrections (EDIT_LOG).
- **The live-screen safety work (G1–G8) is all in.**
