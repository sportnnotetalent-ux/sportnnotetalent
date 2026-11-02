# Results official's audit: measured sports (2026-11-02)

**Sports:** golf, athletics, swimming, cycling, rowing, canoe sprint, archery, shooting, weightlifting.
**Angle:** what the official actually types, entry by entry, against the governing body's results rules, then the founder's chain: **Info / setup → entry → results, stats, commentary**.
**Method:** read-only code review. Nothing was run. Items already solved or already listed in `docs/sport-depth/golf.md`, `deep-wave/timed-races*.md`, `deep-wave/precision-strength*.md`, `deep-wave/golf-chess-carrom*.md` and `audit-2/measured.md` are not repeated (for example shotgun and 25 m finals, IWF 2026 categories, four-ball and foursomes). They are only named when the entry angle adds something new.

**Gap key:** ✓ = the official can record it and it ranks correctly · partial = there is a workaround, or it records but loses detail · ✗ = it can't be recorded, or it ranks wrongly.

**Where the "Info" is for these sports.** Golf match play uses the match screen (`LiveScoringScreen.tsx` Info tab ~2689, from `golf/meta.ts formatFields`). Every other sport here (golf stroke play and the eight event sports) is a *field event*. Their "Info" is spread over four places:
- the sport's `formatFields` (the ⚙ points and timing settings);
- the **Competition rules** screen (`competitionRules.ts` + `precisionRules.ts`, locked once any result exists, `CompetitionRulesScreen.tsx:73-74`);
- the event's **setup** screen;
- the header lines plus "⚙ Stats to track — this event" on `ResultsEventScreen.tsx` (~655-695).

Most chain breaks below come from that split.

---

## 1. Golf (R&A / USGA Rules of Golf 2023, WHS)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Strokes on a hole (penalties included) | Gross, to par, net, Stableford | −/+ per hole on the round card, `GolfRoundScreen.tsx` ~440-462 | ✓ |
| Penalty strokes (1 stroke: Rules 17/18/19; 2 strokes: the general penalty) | Already inside the hole score; the count is a stat | "Penalty strokes" ± on the hole, only when the round tracks `penalties`, `GolfRoundScreen.tsx:225-228` | partial. Off by default. There is no 1-stroke / 2-stroke kind and no rule, and nothing checks the count against the strokes (3 penalties on a 2). |
| Pick up / no return | Stroke play NR; Stableford 0 pts | "Pick up (NR)" / "Pick up", `:297-300,462` | ✓ |
| Maximum score format (Rule 21.2): a hole capped at a limit | Pickup = the cap; the round still counts | ✗ as a format. `maxScore` exists (`golfLeaderboard.ts:38`, default `ndb`), but only for the adjusted-gross stat. No field sets it. | ✗ |
| Par / bogey (Rule 21.3) | Hole won / lost against par | none | ✗ (P2) |
| WD / DQ / DNS with a reason (Rule 3.3b wrong score, Rule 5.3 late, …) | Ranked below the finishers | ⋯ menu → `GolfEntryAdminSheet.tsx:18-19,96-98`, stored in `card.admin` | ✓ |
| Card signed by marker and player (Rule 3.3b) | Certifies the card | "Marker ✓ / Player ✓", `GolfRoundScreen.tsx:313,494-495`. Any score change clears it. | ✓ |
| Ties: countback, shared, or playoff for 1st | Order | Format field `tieBreak` + playoff winner, `:290` | ✓ |
| Match play: hole won / halved, conceded match, extra holes | UP / AS / dormie / 3&2 | Match screen (`golf/index.tsx`, `match.ts`) | ✓ |
| Match play: hole lost by penalty (general penalty = loss of hole), or a hole / next stroke conceded | Hole result | "X wins hole", but no "by penalty" / "conceded" marker | partial (P2) |

**Chain breaks (golf)**
1. **Hidden setting:** `maxScore` decides the adjusted gross (a stat on profiles, `stats.ts:78`) and isn't in `formatFields`, setup or Info. Events default to net double bogey, the demo seed uses `none`, and nobody can see which one applies.
2. **Settings with no effect:** in match play the setup and Info show stroke-play-only fields: `netScoring`, `tieBreak`, `prizes`, `distUnit` (`golf/meta.ts:43,52,62,72`). The cause is that `FormatField` has no "show if".
3. **Capture not in Info:** golf "Stats to track" (putts, fairway, bunker, up-and-down, penalties, first putt, drive) is set on the round card (`GolfRoundScreen.tsx:153-160`), falling back to the phone's own choice. It isn't on the round setup or in the round's format summary, so two markers can keep different depth unless the organiser opens the card. Match play offers no stats to track at all.
4. **Entered, never shown:** WD / DQ / DNS and their reason reach the leaderboard but not the commentary feed. `feed.ts` handles `P` (`:119`) and penalties (`:58-59`), but not `admin`.

---

## 2. Athletics (World Athletics TR, 2024 edition)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Time (FAT 1/100, photo 1/1000), hand time | Rank, `h`, records | `TimeField`, `ResultsEventScreen.tsx:1031` | ✓ |
| Race wind (100 / 200 / hurdles), aided `w` | Records / PB only | `WindField`, `:981`, one per heat | ✓ |
| Reaction time; under 0.100 = false start | FS cue | `ReactionField`, `:1145` (when tracked) | ✓ |
| False start (TR 16.8), or the one-per-race meet rule | DQ shown as FS | FS chip, `:1305`; `falseStart()` `:452-486` warns or charges the race | ✓ |
| Start-conduct yellow / red card (TR 16.5) | Warning, then DQ | No warning record. DQ + typed rule only. | partial (P2) |
| DNS / DNF / DQ with a TR code (lane, break line, hurdle, relay zone, obstruction, assistance, conduct) | Unranked | Status chips `:1298-1317`; `AthDqChips` (`raceDepth.ts:399-407`) + free `RuleRef` `:1319` | ✓ |
| Tie at the last qualifying spot after thousandths (TR 21.3: lots drawn if there are no lanes for both) | Who goes through | Both go through (`progression.ts tieAtLine`). There's **no draw-place box for track**; it exists only for swim-off, crew re-row and archery (`:842-861`). | ✗ (P1, common with hand times to 0.1) |
| Field trial: mark, X foul, – pass, wind per trial (LJ / TJ) | Best, then countback (TR 25.22) | `AttemptCells` `:1331-1380` (✓ / X / –) | ✓ |
| **Retired, "r" (TR 25.18 / 26.x notation): stops competing but keeps the marks** | Ranked on the marks made | ✗. Field statuses are DNS / DQ / WD (`:90`). **WD drops the athlete from the ranking** (`rank.ts:208-210`, `field.ts:145`). The only workaround is "–" for every remaining trial or height. | ✗ (P0: a real result is lost if WD is used) |
| No valid mark, NM | Unranked | Automatic (`marks.ts:206-215`) | ✓ |
| Vertical: O / X / – per height, failures carried after a pass (TR 26.5: three in a row at any heights) | Elimination | `HeightRow` `:1402-1431`. The guided card (`verticalState`) stops calling an eliminated athlete. **The row itself still lets the official tap O after a carried elimination**: "X–" then "XX" leaves the chips enabled (`disabled = done ‖ (eliminated && !tries)`), and `summarizeHeights` then accepts a clearance. | partial (P1, wrong result possible) |
| Vertical ties (TR 26.8) and jump-off for 1st (TR 26.9) | Order | Automatic keys + `JumpOffCard` | ✓ |
| Race walk red cards (TR 54.7), penalty zone | DQ on the 3rd or 4th card | `RoadPanel.tsx:67-89` | ✓ |
| Combined events: FS warning (TR 39.8.3), DNS ends the event | Per event | `CombinedPanel`, `ceDns` rule | ✓ |

**Chain breaks (athletics)**
1. **Rules not visible at entry:** the results header shows swim, crew, shooting, archery and lifting rule lines (`:659-670`). For **athletics track there's no rule line**: nothing says whether false starts are zero-tolerance or one per race, which wind limit applies, or that the meet is hand-timed. Field events show only implement, board and gauge (`:545`).
2. **Entered, never shown:** red cards aren't in the commentary (`raceCommentary.ts` reads `status` / `ruleRef` / `reason` only, `:103,135`). An FS is stored in the career as `dq` (`athletics.ts:436`), so a stats row "false starts" can't exist.
3. **Entered, not in stats:** field fouls and passes are entered trial by trial, but only the best mark reaches the stat line (`athletics.ts:455-462`). There's no foul count and no series. This is depth (P2), not a wrong result.

---

## 3. Swimming (World Aquatics SW, 2023–2025)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Touchpad time 1/100; manual time from the lane's watches (SW 11.3) | Rank | `TimeField` / `WatchesField` `:1162` | ✓ |
| Ties stand (SW 13.4.2); swim-off for a qualifying spot (SW 3.2.3) | Shared place / who goes through | Automatic; "Swim-off place" `:842-847` | ✓ |
| False start: SW 4.4 DQ, or the meet's recall rule | DQ | `SwimStatusChips` `:1241-1280`, `swimFalseStart` | ✓ |
| DQ with the stroke code and the relay leg (SW 5–10) | Unranked, no time | `SWIM_DQ` (`swimming.ts:335-363`), chips by stroke | ✓ |
| Did not finish (SW 10.2 = DQ) | DQ | The SW 10.2 chip | ✓ |
| Reaction time, relay take-overs (−0.03 tolerance) | Flag for the take-off judge | When tracked, `:832` | ✓ |
| Splits (50 m) | Lap times, lead-off time | `SplitsField` `:1208` | ✓ |
| Withdrawn after seeding / declared false start (a scratch, not a DQ) | Not ranked, no penalty | Scratch (SD-128) or DNS | ✓ |

**Chain breaks (swimming)**
1. A take-over earlier than −0.03 s is *flagged* for the judge. If the judge then DQs the team, the DQ is a separate SW 10.13 tap. There's no link from the flag to the DQ chip with the leg pre-filled. Small (P2).
2. Otherwise swimming holds all four links: `formatFields` (`swimming/meta.ts`) → `EventTrackCard` → entry boxes → commentary and stats.

---

## 4. Cycling (UCI Part 2 road, Part 3 track)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| TT time (road 1/100, track 1/1000), caught in a pursuit | Rank; the catcher wins | `TimeField`, "Caught" `:836-837` | ✓ |
| Order on the line (road, keirin, scratch, elimination) | Rank | `CyclingPanel` | ✓ |
| Points race: sprint places, laps gained / lost | Points | `CyclingPanel` `:368` | ✓ |
| DNS / DNF / OTL (road) / DQ | Unranked | `cycStatuses` (`cycling.ts:202`) | ✓ |
| **Relegation (keirin, sprint, scratch: UCI 3.2.x)**: placed last in the heat, still classified | Order | Sprint: tap the other rider (`:491`). Keirin / scratch: only "DQ: disqualified / relegated out" (`CyclingPanel.tsx:34`), which **takes the rider out**. | partial (P2) |
| Stage race: GC time, bonuses, points, KOM | Classifications | Stage screens | ✓ |
| Warning / fine (commissaires' communiqué) | None to the result | none | n/a |

**Chain breaks (cycling)**
1. **Setup doesn't show capture:** `cycSplits` is in `formatFields` (`cycling/meta.ts`) and on the results screen's "Stats to track", but **`CyclingEventSetup.tsx` doesn't render `EventTrackCard`**. Only `AthleticsEventSetupScreen` does. An organiser setting up a pursuit can't see or set intermediate times there.
2. The DQ rule box is free text (hint "irregular sprint / relegated", `:91`). There's no UCI code list like athletics' `ATH_DQ`, so DQ reasons can't be counted or compared (P2).

---

## 5. Rowing (World Rowing Rules of Racing) and 6. Canoe sprint (ICF)

They share one engine, so they share one table.

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Finish time 1/100, photo 1/1000, hand timing | Rank | `TimeField` | ✓ |
| Dead heat on a qualifying line: re-row or draw | Who goes through | "Re-row / draw place" `:848-853` | ✓ |
| Progression routes, Finals A / B, carried crews | Next round | Automatic (`crews.ts`) | ✓ |
| DNS / DNF / DQ (exclusion) | Unranked | `statusesFor` → DNS / DNF / DQ (`:90`); free-text rule, hint "Excluded — e.g. 2nd false start" | partial |
| **First false start = yellow card; second = red card and exclusion** (World Rowing; ICF has its own false-start rule, verify) | Warning, then out | ✗. There's no FS chip for crews and no per-race warning (`fsWarned` is athletics and swimming only, `:486`). The official has to remember the first false start. | ✗ (P1) |
| Exclusion from the race vs disqualification from the regatta (World Rowing distinguishes the two) | Scope of the penalty | Both are "DQ" | partial (P2) |
| Boat / cox under weight (World Rowing), boat check fail (ICF) | Exclusion / DQ | Free-text DQ only | partial (P2) |
| Seat order, cox | Credit per rower | Members, bow first; cox last (`model.ts:441`) | ✓ |

**Chain breaks (rowing / canoe)**
1. **Setup doesn't show capture:** `splits` (500 m / 250 m) is in `formatFields` and on the results screen, but `CrewEventSetup.tsx` has no `EventTrackCard` (same as cycling).
2. **Entered, never counted:** the rule text of a DQ reaches the commentary but not the stats. The schema has `dnf` / `dq` (`crewStats.ts`), but no false starts or exclusions.

---

## 7. Archery (World Archery Book 3)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Arrow X / 10 … 1 / M per end, ends in order | Total, 10s, X | `EndCard` keypad, or typed "X 10 9 … = 53" (`ArcheryPanel.tsx:2-5`) | ✓ |
| Line cutter / judge call (higher value) | Arrow value | The keypad value as decided | ✓ |
| Ranking ties: 10s (incl. X), then X; shoot-off / coin toss for the cut and seeds | Order | Automatic + "Shoot-off place" / "Coin-toss place" `:854-861` | ✓ |
| Match: set points (2 / 1 / 0, first to 6) or cumulative; one-arrow shoot-off, closest to centre | Winner | `BracketCard` | ✓ |
| Walkover (did not shoot the match) | Opponent through | "Walkover" `:353-355` | ✓ |
| **Penalty: an arrow shot before or after the signal, or too many arrows (Book 3: the highest arrow(s) don't count; in matches, points deducted, verify)** | Score | ✗. The only way is to type that arrow as M, which falsifies the arrow record (an X becomes an M). | ✗ (P1) |
| Equipment failure / make-up arrows | Arrows shot later | The arrows are typed when shot | ✓ |
| End total only (school scorecards with no per-arrow sheet) | Total | ✗. Already a known follow-up. | ✗ (known) |
| DNS / DQ / WD | Unranked | Status chips (`:90`, target → DNS / DQ / WD) | ✓ |

**Chain breaks (archery)**
1. **Capture locked with the rules:** "Arrows per archer in team matches" (`precisionRules.ts:95`) is a Competition rule, not an event-level "Stats to track". It locks for the whole sport once any result exists (`CompetitionRulesScreen.tsx:73-74`). A meet that decides on day 2 to credit arrows to archers can't. Timed sports can change capture per event at any time (`EventTrackCard`).
2. **Not visible at entry:** the archery header line (`:668`) states faces, ties and the shoot-off rule, but not whether team arrows are credited per archer.

---

## 8. Shooting (ISSF General Technical Rules; Rule Book 2025)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Series total (decimal 0.1 / integer + inner tens / hits) or shot by shot | Total, X, countback | `SeriesCard` / `SeriesInput` (`ShootingPanel.tsx:40-150`); the mode is set per event at setup (`shootEntry`) | ✓ |
| Qualification ties (inner tens → last series back → shot by shot) | Order | Automatic (`rank.ts:91-99`) | ✓ |
| Final shot by shot, eliminations, shoot-off, corrections | Medals | `FinalCard`, `ShotFixer` (`:172-314`) | ✓ |
| A shot not fired in time / cross-fire / a shot after "stop" (scored 0, or the shot annulled) | 0 for that shot | Type 0 / 0.0 | ✓ |
| **2-point penalty** (GTR: e.g. sighting after the match started, equipment) | Net score | Only when the meet switched on `shootPen` (`precisionRules.ts:77`). **Off by default and locked once results exist.** Without it the official has to type the series 2 lower, which falsifies the shots. | ✗ (P1) |
| Dry fire in a final (−1) | Net shot | "−1 dry fire" in `ShotFixer` `:313`, behind the same switch | partial |
| Malfunction / extra time | No score change | none needed | n/a |
| DNS / DNF (couldn't finish, e.g. gun failure beyond the allowance) / DSQ | Unranked | Target → DNS / DQ / WD (`:90`). There's no DNF; WD drops the shots already fired. | partial (P2) |

**Chain breaks (shooting)**
1. **Settings in the wrong home:** `shooting/meta.ts` has one format field (position points). Every capture choice (penalties) and rule (ties, final size) is on the Competition rules screen, which locks after the first result. A penalty is part of the official score, not an optional stat, so "a default that hides depth" here becomes a wrong score.
2. **Not visible at entry:** the shooting header (`:667`) doesn't say whether penalties are on, so the official at the range doesn't know the −2 button exists or why it's missing.

---

## 9. Weightlifting (IWF TCRR)

| Outcome | Effect | How the official records it now | Gap |
|---|---|---|---|
| Declared weight, calling order, lot, bodyweight | Order | `WeighInCard`, next-lift card (`LiftingPanel.tsx`) | ✓ |
| Good lift / no lift, or the 3 referees' lights | Best lift, total | Two big buttons `:212-215`, or the lights `:220-230` | ✓ |
| Jury reversal | Decision flipped | `LastDecision` `:255-272`, but **only when `wlJury` is on** (or the attempt already has one) | partial (locked switch) |
| Declined attempt (lifter forfeits) | No lift, not "attempted" | "Declined" `:189-191,239` | ✓ |
| Clock expired / late to the bar | No lift | ✗ No lift | ✓ |
| **Bar loaded wrongly, or a technical fault: the lifter gets another attempt** (IWF, verify the clause) | Re-attempt at the right weight | Clear the attempt (`:312`), which **also removes the later attempts** | partial (P2) |
| Bomb-out in one lift: no total, but the other lift still ranks (IWF World Championships) | Snatch / C&J medals | Automatic NM (`marks.ts:216-220`) | ✓ |
| **Withdraws after the snatch (injury)** | No total; **the snatch result stands** | Status WD (`:90`) **removes the lifter from the snatch ranking too** (`rank.ts:208-210`). The workaround is "Declined" ×3. | partial (P1: a snatch medal can vanish) |
| Equal totals: whoever lifted the total first (bodyweight no longer decides) | Order | Automatic (`rank.ts:67-77`) | ✓ |
| DQ (e.g. anti-doping, conduct) | Unranked | DQ + rule | ✓ |

**Chain breaks (weightlifting)**
1. `wlLights` / `wlJury` are Competition rules (`precisionRules.ts:25,31`), locked once a session has a result. The lights work anyway through the per-attempt "3 lights" chip, but a **jury reversal can't be recorded** unless the switch was on before the first lift. A reversal changes the result, so it isn't an optional stat.
2. The lifting header (`:670`) shows the step, repeat and order rules but not lights or jury.
3. `sinclair` and `liftMedals` live in both `formatFields` and Competition rules (`existing: true`). That works, but there are two places to look.

---

## Ranked fix list

Practicality filter: each fix is a tap or a chip for one official on one phone, optional where possible, and **old results read identically** (every new field is additive and absent means today's behaviour).

| # | Pri | Size | Sport | What changes | Log / data impact | One official, one phone |
|---|---|---|---|---|---|---|
| 1 | **P0** | S | Athletics field | Add **"r Retired"** on the trial / height row (and as a field status). It keeps every mark made and ranks on them. Next-up skips the athlete, and the sheet and commentary show "r". | New `EntryResult.retired?: {afterRound?: number; atHeight?: number}`, *not* a new status, so WD rows stay unranked as now. No migration. | One chip on the row |
| 2 | P1 | S | Athletics vertical | `HeightRow`: disable O / X / – once `summarizeHeights().eliminated` is true, counting failures carried after a pass. Show the remaining tries ("2 tries left") at the next height. | Pure UI guard. Old rows that already break the rule still rank as stored. | Fewer wrong taps |
| 3 | P1 | S | Weightlifting, shooting (+ field) | **WD after competing keeps what was done**: a lifter's snatch stays in the snatch ranking; a shooter's fired series stay on the sheet. Add **DNF** to shooting statuses. | `phaseLines` and ranking read the per-lift / partial result when `status: 'WD'` and the lift has a good attempt. Old WD rows have no good attempts in practice, so read-back is unchanged. Pin it with a test. | None |
| 4 | P1 | M | Shooting, weightlifting, archery | **Result-changing rules are never opt-in and locked.** Show "＋ Penalty −2" (shooting), "⚖ Jury reverses" (weightlifting) and a new "Penalty: highest arrow / −N points" (archery) behind a ⋯ on any saved series / attempt / end, whatever the switch. The switch only decides whether the button sits *in view*. | Same stored keys (`pen`, `fpen`, `jury`; new `ends`-level `pen` for archery). Absent = no penalty, as today. | One ⋯ per row |
| 5 | P1 | M | Precision sports (chain) | Move "Stats to track" for weightlifting / shooting / archery (`wlLights`, `archTeamArrows`) into `EventTrackCard` (per event, changeable while the event is open, like timed sports). Competition rules keep only the real rules. | Rule keys stay readable on old phases. Event overrides go on `PhaseFormat.track`. | Same card as athletics |
| 6 | P1 | S | Athletics track | **Draw-place box for a tie at the qualifying line** (TR 21.3), shown when `tieAtLine` has more entrants than the next round has lanes, as already done for swim / crew / archery. | Uses `decider` (already ranked for `photo`). | One box |
| 7 | P1 | S | Rowing, canoe | **FS chip with the yellow-card step** for crews: the first false start in a race is a warning and the second is exclusion (World Rowing; ICF per its current rule, verify). Reuse `fsWarned` + `falseStartStep`. | `fsWarned` already exists on `PhaseFormat`. | Same as athletics |
| 8 | P1 | S | All timed (chain) | **Rule line on the athletics results header** (FS rule, wind limit, hand-timed) like the other sports. Add "penalties on", "lights / jury on" and "team arrows credited" to the precision header lines. | Display only | Reads at a glance |
| 9 | P1 | S | Cycling, rowing, canoe (chain) | Render `EventTrackCard` on `CyclingEventSetup` and `CrewEventSetup`, as on athletics / swimming setup. | Display + existing `track` | None |
| 10 | P2 | S | Golf (chain) | Add a `maxScore` field ("Adjusted gross: net double bogey / par + 3 / par + 5 / none"). Add `showIf` to `FormatField` so match play hides net / ties / prizes / distances. | Absent `maxScore` = `ndb` as now. `showIf` is display only. | Fewer irrelevant fields |
| 11 | P2 | S | Golf (chain) | Golf "Stats to track" on the round setup screen and in the round's format summary. Commentary lines for WD / DQ / DNS with the reason. | `format.track` already exists; the feed is derived. | None |
| 12 | P2 | M | Golf | **Maximum score** competition (Rule 21.2): pickup = cap, the round still counts. Then par / bogey. | New `competition` value; old rounds unchanged. | One format chip |
| 13 | P2 | S | Golf | Penalty strokes ≤ strokes − 1 guard; optional kind (1 / 2 strokes). Match play "wins hole (penalty / concession)" note. | Optional keys | Optional |
| 14 | P2 | S | Cycling | **Relegated** in keirin / scratch: placed last of the heat, classified (not DQ). UCI DQ code list for the rule box. | New `relegated?: true`; ranking puts the rider last of those who finished. | One chip |
| 15 | P2 | S | Athletics | Separate `fs` stat key (today FS counts as `dq`). Red cards and start-conduct cards in the commentary. Optional field foul count on the stat line. | New keys only from now; old lines read "not tracked". | None |
| 16 | P2 | S | Weightlifting | "Re-attempt (loading error)" on a decided attempt: clears **that** attempt only, keeping later declarations. | Uses the existing `chg` / `seq` | One chip |
| 17 | P2 | S | Rowing, canoe | Exclusion (this race) vs disqualification (regatta) as two DQ reasons; a boat / cox weight reason chip. | `reason` text | Chips |

---

## Shared fixes

1. **One home per capture, visible at entry.** Every "Stats to track" for every measured sport sits in `formatFields` (meet default) plus `EventTrackCard` (per event, changeable until the event is locked), and it shows on every setup screen. Competition rules keep only rules. This removes chain breaks golf 3, cycling 1, rowing 1, archery 1, shooting 1 and weightlifting 1.
2. **Result-changing outcomes are never behind an optional switch:** penalties, jury reversals, retirements, relegations. Optional switches only *declutter*.
3. **The results header always states the governing rules in force** (false starts, wind, timing, penalties, ties) for every sport. Today athletics track has none.
4. **"Partial-competition" statuses keep earned results:** `r` in the field, WD after the snatch, DNF in shooting. Today WD is the only exit and it erases.
5. **`FormatField.showIf`** (golf match play first) so a setting that has no effect in this format is not offered. The same switch can hide crew-only and road-only fields elsewhere.
6. **Commentary reads every entered status detail:** golf `admin`, walk red cards, start cards, crew false-start warnings. It's derived, so old events gain the lines without any data change.
