# Deep wave: north-american-and-rugby family

Ice hockey · rugby (union 15s / tens / sevens) · American football (flag + tackle) · baseball & softball.

**Founder ask (2026-10-22):** capture each sport at broadcast depth, as the ATP "Match Stats" page did for tennis. That means a live commentary grouped by the sport's natural unit, a team-vs-team match stats sheet with period and category filters, and optional "Stats to track" for anything deeper than today's one-tap scoring.

**Rules followed:**
- Default scoring is as fast as before.
- Every new capture is off by default.
- Figures that can be derived from the existing log are just shown.
- Old logs replay identically.
- A stat that wasn't tracked never shows as 0.
- Player credits stay absolute through each sport's `statTotals`.

## Shared pieces (new files, used by all four sports)

| File | What it is |
|---|---|
| `src/sports/feedGroups.ts` | Pure model of the grouped commentary: `FeedLine` (time, icon, sentence, running score, key flag, tags) and `FeedGroup` (title, summary line, scope). Helpers: `groupLines` (oldest-first lines into groups), `newestFirst`, `filterFeed` (scope / tag / key moments), `feedScopes`, `feedTags`, `scoreText`, `andList`, `nth`, `plural`. |
| `src/sports/GroupedFeed.tsx` | The commentary UI: one card per period / half / drive / half-inning with its summary, lines newest first with the team colour on the rail. It has scope chips, tag chips (Everything / Key moments / Goals …) and a "Show earlier" fold. |
| `src/sports/compareSheet.ts` | Pure model of the broadcast stats sheet. Sections of team-vs-team rows built with `countRow`, `madeRow` ("1/4 (25%)"), `rateRow`, `shareRow` (possession %), `timeRow`, `decRow` and `textRow`. A helper returns `null` when there is nothing behind a row, and `section` / `sheet` drop empty rows and sections, so untracked stats never show. Also `rowLeader` (lower-is-better aware), `rowShares`, `sheetCategories`, `pickCategory`. |
| `src/sports/StatSheetView.tsx` | The sheet UI: scope chips (Overall / P1 / H2 / Q3 / inning), category chips (All / each section), rows with split bars and the leader highlighted. |

Each sport's Score tab keeps its single tab and gains sub-view chips: **Play-by-play · Match stats · Box score · Key moments** (American football adds **Drives**). The old timeline lives on as "Key moments".

**Decision (whole family): "Stats to track" toggles use each sport's existing `mode: 'config'` live settings.** These four sports already use config mode. So a toggle turned on mid-match is replayed as on for the whole match, and the counts are what was recorded.
- Alternative: switch the sports to event mode (`SET_…` actions so a change applies from the next play). That would change how the existing settings (period length, clock rules) behave, so it was not done.
- The same toggles sit in each sport's match format (`advanced`), so an organiser can switch them on for a whole event.

---

## Ice hockey

**Sources:** IIHF Official Game Summary and IIHF tournament statistics (team, player and goaltender reports); NHL Official Game Summary, Event Summary and Real-Time Scoring System play-by-play.

### Gap audit

| Item | Before | Now |
|---|---|---|
| Goals with up to 2 assists, game time, strength EV / PP / SH, empty net, penalty shot | ✅ captured | Shown in the commentary and as "goals by strength" (free) |
| Shots on goal (team, player, period) | ✅ | Shots by period on the sheet (free) |
| Saves, SV %, GA, SA, GAA, shutouts | ✅ (player) | Team save % on the sheet; empty-net goals don't count against (free) |
| Power-play opportunities | ⚠️ counted 4-on-4 coincident minors | Fixed: only penalties that left the other side a skater up |
| PP %, PK % | ❌ | ✅ derived (free) |
| Power-play time | ❌ | ✅ derived from the penalty-box replay (free) |
| PIM, penalties by kind | ✅ | ✅ |
| Penalties by infraction | ✅ optional chip at entry | Sheet rows per infraction (free) |
| Faceoffs won / lost by player, FO % | ❌ | ✅ optional **Faceoffs** |
| Hits, blocked shots | ❌ | ✅ optional **Hits & blocked shots** |
| Giveaways / takeaways | ❌ | ✅ optional **Giveaways & takeaways** |
| Missed shots, shot attempts (Corsi-style) | ❌ | ✅ optional **Missed shots** (attempts need both missed shots and blocks tracked) |
| +/- | ✅ optional | ✅ |
| Shoot-out detail | ✅ | Own commentary group, attempt by attempt |
| Skater time on ice / shifts | ❌ | **Out of scope**: one scorer can't follow line changes |
| Faceoff zone, shot type / location | ❌ | Follow-up (optional chips) |

### Built
- **Capture.** `TALLY` action with `payload.kind`: `faceoff | hit | block | giveaway | takeaway | missed`. `side` is the team credited. On a faceoff, `attribution2` is the losing centre, on the other side.
  - Four toggles (`trackFaceoffs`, `trackPhysical`, `trackPuck`, `trackAttempts`) in **⚙️ Match settings → Stats to track** and in the format.
  - Chips appear under each team only when a toggle is on.
  - **⚪ Faceoff won** is one tap that credits the two remembered centres ("Centres: A v B · change"), or the team when no centres are set.
  - The other chips open a player picker with a **Team (no name)** skip.
  - Voice works when tracked: "faceoff Rao", "hit Nair", "blocked shot Khan", "takeaway …", "giveaway …", "missed shot …".
- **Commentary** (`ice_hockey/commentary.ts`).
  - Grouped by period (then the shoot-out), newest first, with elapsed time in the period ("01:40", as game sheets read).
  - Sentences like "GOAL! H4 scores for Kings on the power play, assisted by H3 and H2." and "A3 (Wolves) — minor 2′ for tripping. Kings on the power play." Coincident penalties, ejections, pulled goalies and tallies are covered too.
  - Running score after each goal. Period-end and final lines carry the score and shots so far.
  - Tags: key moments, goals, penalties, shots, faceoffs.
- **Match stats** (`ice_hockey/sheet.ts`, scope Overall / P1 / P2 / P3 / OT). Sections:
  - Goals: by strength, empty net, penalty shot.
  - Shots: SOG; missed, blocked and attempts when tracked; shooting %.
  - Power play: PP x/y (%), penalty kill, PP time, SH goals.
  - Penalties: count, PIM, minors / majors / misconducts / ejections, by infraction.
  - Goaltending: saves, save %.
  - Faceoffs (tracked).
  - Hits & puck battles (tracked).
  - Shots on goal by period.
  - Time-outs.
- **Keys** (keyed coverage; zeros only when the toggle is on): `faceoffWins`, `faceoffLosses`, `faceoffPct` (FO %, 20-draw minimum), `checks` (label "Hits"), `shotBlocks`, `takeaways`, `giveaways` (lower is better), `missedShots`.
  - Box columns: FO won-lost, FO%, HIT, BLK, TK, GV, MS. They are hidden when untracked.
  - Career sections: "Faceoffs" and "Hits, blocks & puck battles". These show a coverage note, e.g. "tracked in 2 of 3 games".
  - Leaders: FO %, hits, blocked shots, takeaways.
- **Tests:** `tests/ice-hockey-deep.test.mts` (25 tests), `tests/feedgroups-comparesheet.test.mts` (10 tests).

### Decisions (recommended option chosen)
- **One-tap faceoffs credit remembered centres.** Alternative: pick the winner on every draw (2 taps × ~60 draws).
- **PP opportunity = a penalty that left the other side a skater up at some point.** A 4-on-4 isn't one; a double minor that outlasts its 4-on-4 is.
  - This changes the PP count shown for past matches that had coincident minors at full strength. It is a team figure; the score is unchanged.
  - Alternative: keep counting every non-cancelled penalty.
- **PP time comes from the penalties only** (NHL convention). An empty net doesn't make it a power play.
- **Shot attempts appear only when both missed shots and blocks are tracked.** Alternative: show partial attempts.
- **Commentary time is elapsed in the period** ("12:34", the IIHF / NHL game-sheet way). Alternative: time remaining, as the scoreboard shows.
- **New key `checks` (label "Hits")**, so it doesn't share baseball's `hits` key. **`shotBlocks`** is used because `blocks` is football / basketball.

### Open questions
1. Should faceoffs record the zone (offensive / neutral / defensive)? It's one extra tap per draw.
2. Should 5-on-3 count as one power-play opportunity or two? Today it is one per penalty.
3. Is the house 20-draw minimum for FO % right?
4. Should a line-change helper (tap a line of 5) give skater time on ice? It is heavy for one scorer.

### Follow-ups not built
- Faceoff zone, shot type / location chips.
- Skater TOI by lines.
- A printable IIHF-style game summary.

---

## Rugby (union 15s, tens, sevens)

**Sources:** World Rugby match statistics; Rugby World Cup 2023 match stats; URC / Premiership (Opta) match centre.

**Variants:** union 15s, tens, sevens and age-grade presets already exist. **Rugby league does not exist and was not built** (see open questions).

### Gap audit

| Item | Before | Now |
|---|---|---|
| Tries, penalty tries, conversions / penalty goals / drop goals (made-attempted, kicker), try assists, goal-kicking % | ✅ | Commentary and sheet |
| Yellow / red cards, sin-bin on the playing clock, 20-min red trial, replacements (HIA / blood), minutes, kicking competition | ✅ | Plus sin-bin time served on the sheet (free) |
| Tackles / missed, carries, line breaks, turnovers won, penalties conceded, lineouts and scrums on own throw / feed | ✅ optional (`trackDetail`) | Plus tackle %, lineout / scrum success %, lineout steals, scrums won against the feed (free) |
| Points by half | ❌ | ✅ free |
| Penalties conceded by offence, free kicks conceded | ❌ | ✅ optional **Penalties by offence & free kicks** |
| Turnovers conceded (by cause) | ❌ | ✅ optional **Turnovers conceded** |
| 22 entries, points per entry | ❌ | ✅ optional **22 entries** |
| Possession %, territory % | ❌ | ✅ optional **Possession & territory** (switch taps, timed on the playing clock) |
| Offloads | ❌ | ✅ optional **Offloads** |
| Metres made, defenders beaten, passes, kicks from hand, rucks / mauls won, time in the opposition 22, ball-in-play time | ❌ | **Out of scope**: needs tracking or a second scorer |

### Built
- **Capture.** A `TALLY` action with `payload.kind`: `penalty | freeKick | turnover | entry | offload`.
  - Optional `infringement` (offside, ruck / breakdown, not releasing, high tackle / foul play, scrum, lineout / maul, obstruction, other) and optional `cause` (knock-on, forward pass, handling, lost at ruck / maul, kicked out on the full, other).
  - Separate `POSSESSION` / `TERRITORY` switches are kept in an optional `state.ball[]`.
  - Five new toggles: `trackPenalties`, `trackTurnovers`, `trackEntries`, `trackPossession`, `trackOffloads`. The existing `trackDetail` now sits in the same "Stats to track" row; its label is unchanged.
  - "⏩ 22 entry" and "🏳 Free kick conceded" are one tap.
  - Penalty, turnover and offload: optional offence / cause chips, then the player or **Team (no name)**.
  - The possession panel has "Ball: A | B", "In A half | In B half" and live %.
  - With penalties tracked, the detail panel's "Penalty conceded" button hides, so nothing is counted twice.
- **Commentary** (`rugby/commentary.ts`).
  - Grouped by half / extra-time half / sudden death, then the kicking competition, with rugby minutes ("40+1'").
  - Running score after every score.
  - Sentences like "TRY! H11 scores for Lions, assisted by H10." and "Wolves lose their lineout — Lions steal it."
  - Half-time / full-time lines.
  - Tags: key, scores, cards, set piece, discipline, detail, replacements.
- **Match stats** (`rugby/sheet.ts`, Overall / each half). Sections: Scoring, Attack, Defence, Set piece, Possession & territory, Discipline, Penalties by offence, Turnovers conceded, Points by half. Possession says "(from 10')" when the taps started late.
- **Keys:** `offloads` (OL) and `turnoversConceded` (TC, lower is better), both keyed. Penalties use the existing `penaltiesGivenAway`.
  - Box columns, the Attack career section, and comparison rows.
  - Leaders gain line breaks and offloads.
  - A penalty / turnover with no player lands on the Team row.
- **Tests:** `tests/rugby-deep.test.mts` (25 tests).

### Decisions (recommended option chosen)
- **Penalty offences get their own toggle and button**, not a field on the existing detail event. On the detail event, any detail event makes every detail key (tackles…) read 0, which would give false zeros. Offloads get their own toggle for the same reason.
- **Points per 22 entry (house definition):** the points the entering side scores until the next entry by either side, or the end of the period. A try scored with no entry tapped for that side counts as an entry. Alternative: end an entry when play leaves the 22, which needs a second tap per entry.
- **Possession and territory are time on the playing clock**, not ball-in-play time, and carry across half-time. Territory = time play is in the other side's half.
- **Free kicks are team only.** No player key.
- **No leaderboard for turnovers conceded.** A lower-is-better count rewards not playing.

### Open questions
1. **Rugby league:** build it as a separate sport id (`rugby_league`: 13s / 9s, six-tackle set, 4-point try, golden point)? Recommended: yes, separately, not as a union variant.
2. Is the points-per-22-entry definition acceptable, including tries counting as entries?
3. Should free kicks credit a player?
4. Should possession pause on stoppages (a "ball dead" switch)?
5. Do you want a "fewest turnovers conceded" leaderboard?

### Follow-ups not built
- Voice for the new tallies ("penalty offside Rao", "22 entry home").
- Dominant / tackle-type detail.
- Metres as an optional manual figure.
- Time in the opposition 22.

---

## American football (flag + tackle)

**Sources:** NFL Game Book and ESPN / NFL.com team box and drive summaries; NCAA Football Statisticians' Manual; NFHS box score; IFAF Flag Football rules.

### Gap audit

| Item | Before | Now |
|---|---|---|
| TD / FG / XP / 2-pt / safety / returned tries; play by play (downs, spot, run, pass, inc, sack, INT, fumble, punt, kickoff, penalty, downs) | ✅ (play by play optional) | ✅ |
| Player C/ATT, YDS, TD, INT, CAR, REC, SCK, DINT, FR, punts, tackles (optional); 3rd down; time of possession | ✅ | ✅ |
| Drives: start, plays, net yards, time, result, how obtained, points | ❌ | ✅ derived from the play-by-play log (free) |
| Red-zone trips / TDs, 4th-down efficiency, first downs by rush / pass / penalty | ❌ | ✅ free |
| Total plays, yards per play, net passing, yards per pass / rush, punting average, punt-return yards, longest FG / run / reception | ❌ / ⚠️ | ✅ free (`rushLong` / `recLong` are derived keys) |
| Points and yards per drive, scoring drives, average start | ❌ | ✅ free |
| Times sacked / sack yards per QB | ❌ | ✅ credited from the passer on the sack, no extra tap |
| Targets | ❌ | ✅ optional **Targets** (intended receiver on incompletions) |
| Passes defended, tackles for loss | ❌ | ✅ optional **Defensive detail** |
| Kickoff-return yards, net punting, QB hits, targets on interceptions, air yards / YAC, snap counts | ❌ | Out of scope / follow-up (no catch spot recorded; air yards needs tracking) |

### Built
- **Capture.** Toggles `trackTargets` and `trackDefence`. The existing `trackTackles` moved into the same "Stats to track" group, in live settings and the format (advanced). They go into the state only when on.
  - Event marks `tgt` (pass, incompletion, TD pass) and `tfl` (tackle). A new `PASS_DEF` action creates a `pd` event.
  - Credits: `targets` (marked passes only), `passDef`, `tackles` + `tfl`. A sack credits the QB `timesSacked` / `sackYdsLost` as well as the defender.
  - A bug was fixed: ✗ Incomplete with no earlier passer opened an empty flow that couldn't be cancelled.
- **Drives** (`american_football/drives.ts`): drive segmentation, `driveRows`, possession per quarter. `DriveChart.tsx` lists team, start, plays-yards, time and result.
- **Commentary** (`american_football/commentary.ts`). Grouped by DRIVE in play-by-play games (by quarter in scores-only games), newest first. Lines include:
  - plays with the game clock, e.g. "1st & 10 at Own 25 — Rao pass complete to Khan for 12 yds (1st down)";
  - the running score after every score;
  - kickoffs, tries, penalties, timeouts (with how many are left), the two-minute warning;
  - end of quarter / half / regulation / OT, and the final;
  - tackles and breakups joined onto their play.
  - Tags: key moments, scoring, turnovers, penalties, passing, rushing.
- **Match stats** (`american_football/sheet.ts`; game or one quarter). Sections: Overview, Passing, Rushing, Efficiency, Turnovers, Penalties, Scoring, Kicking, Drives, Other. A scores-only game shows only scoring, kicking and timeouts, never play-by-play zeros.
- **Box / keys.** New columns SKD, YPC, RLNG, TGT, YPR, RCLNG, TFL, PD, FR, FGLNG and a Punting block (PUNT / PNYDS / PAVG). Each shows only when tracked. Flag rows no longer carry FG / XP / punt zeros. New career rows; leaders gain receptions, TFL and passes defended.
- **Live views:** Play-by-play · Match stats · Drives (when the game has drives) · Box score · Key moments.
- **Tests:** `tests/american-football-deep.test.mts` (33 tests). One assertion in `tests/american-football.test.mts` changed (see the first decision below).

### Decisions (recommended option chosen)
- **A touchdown from scrimmage counts as a first down** (NFL / NCAA convention). `firstDowns` therefore changes for old play-by-play games (a team figure; the score is unchanged), and one existing assertion was updated from 1 to 2. Alternative: keep TDs out.
- **Flag football has no red zone.** The equivalent row is "Past midfield — TDs / trips", with a note.
- **Drive "plays" are scrimmage plays only** (no punts, FG attempts or penalties). Drive net yards are by field position, so penalty yards count.
- **Old play-by-play logs gain only `rushLong` / `recLong`** (derived, exact). Scores-only logs gain nothing.
- **Times sacked is tracked once any sack names a QB.**
- **A tackle for loss needs both "who made the tackle" and "Defensive detail" on.**
- **Possession time:** the rest of a half stays with the last offence.
- **The Box score view shows tables only;** Match stats carries the team comparison.

### Open questions
1. Should drive charts count punts and FG attempts as plays?
2. Should passes defended include interceptions (as the NFL counts them)?
3. Do you want a flag "no-run zone" stat?
4. Should a toggle switched on mid-game say "recorded from …"? Today only the start of play-by-play is noted ("Play by play from Q2 4:12").

### Follow-ups not built
- Kickoff-return capture (catch spot).
- QB hits.
- Targets on interceptions.
- Longest run / reception in the match records.
- Catch % (needs its own numerator for games where targets were switched on mid-match).

---

## Baseball & softball

**Sources:** MLB Official Baseball Rules 9.00 (the official scorer); the MLB box score with its notes and Gameday play-by-play; WBSC scoring rules and box score.

### Gap audit

| Item | Before | Now |
|---|---|---|
| Line score R-H-E, team LOB, batting / pitching boxes, W-L-SV, earned runs, SB / CS, pitch counts, PO / A / E from notation | ✅ | ✅ |
| RISP (team "2-for-9" and per batter), two-out RBI, LOB per half-inning | ❌ | ✅ derived from the bases before each plate appearance (free) |
| Double plays turned, ground outs – fly outs (GO-AO), inherited runners – scored, batters faced | ❌ / ⚠️ | ✅ free |
| Pitches – strikes, strike %, first-pitch strikes | ❌ | ✅ free when pitch-by-pitch is on; "not tracked" otherwise |
| Pitch type / pitch mix | ❌ | ✅ optional **Pitch types** |
| Spray chart / hit location | ❌ | ✅ optional **Where the ball went (spray)**; a zone is also read from the fielders' notation (F8 → CF, 6-3 → SS) |
| Inning-by-inning play-by-play | ⚠️ flat timeline | ✅ grouped by half-inning, with sentences |
| Pitch speed / location / spin, batted-ball type on hits, individual batter LOB | ❌ | Out of scope (speed, location and spin need tracking tech) / follow-ups |

### Built
- **Engine (derived only).** Each event's derived annotation gains optional fields: bases occupied before a plate appearance, pitcher on the mound, first pitch, pitches in the plate appearance, LOB at a half's end, and runners a reliever inherited. Runners and run credits carry an optional `ir`.
  - `withAnn(s)` re-derives a state saved before these fields existed.
  - New optional payload fields: `ptype` (on a pitch or a play's final pitch) and `zone` (balls in play only). Unknown values are ignored.
  - New flags `pitchTypes` and `sprayZones` are added to the config only when on.
- **Capture UI.**
  - Pitch-type chips (baseball FB SI CT SL CB CH SPL KN; softball Rise Drop Curve CH Screw) sit above the pitch pad. A pick applies to the NEXT pitch only, then clears.
  - An optional "Where?" zone row (LF · LC · CF · RC · RF · 3B · SS · 2B · 1B · P · C) appears on in-play and runner-advance sheets.
  - With both toggles off, the flow is exactly as before.
- **Figures** (`baseball/situational.ts`): `pitcherFigures`, `batterFigures`, `teamSplit(side, scope)`.
- **New player keys** (all DERIVED by statTotals, keyed coverage):
  - Batters: `rispAb`, `rispHits`, `twoOutRbi`.
  - Pitchers: `pitchGroundOuts`, `pitchFlyOuts`, `inheritedRunners`, `inheritedScored`.
  - Pitch-by-pitch only: `strikesThrown`, `ballsThrown`, `firstPitchStrikes`, `firstPitches`.
  - Career rates: `rispAvg` (AVG with RISP), `goAo`, `strikePct`, `firstPitchStrikePct`. A new "Situational hitting" section.
  - Leaders: RISP AVG, two-out RBI, strike %, first-pitch strike %.
  - A "P-S" pitching box column replaces NP when pitch-by-pitch is on.
  - MLB-style notes sit under the batting and pitching tables.
- **Match stats** (`baseball/sheet.ts`; scope = game or one inning, both halves). Sections: Batting, Situational, Base running, Pitching, Pitch mix, Fielding, Spray.
- **Commentary** (`baseball/commentary.ts`).
  - Grouped by half-inning ("Top 3rd", with "Owls · 2 runs, 3 hits, 0 errors, 1 left on base"), newest first.
  - Sentences like "A5 homers to left-centre — 3 RBI. A1 and A2 score." and "Khan grounds out, shortstop to first (6-3)."
  - The count and pitches seen on strikeouts and walks.
  - Runner plays, pitching changes (with inherited runners), subs, ejections and tie-break runners.
  - Running score after every run; "Middle / End of the 3rd" lines; the final line (walk-off, run rule, called, extras).
  - Filters: key moments, scoring, hits, strikeouts, walks, pitching changes, running.
- **Tests:** `tests/baseball-deep.test.mts` (37 tests). A one-off check replayed 200 random games (≈29 k actions, all presets, pitches on and off) through the old and new engine: identical game state apart from the new optional fields.

### Decisions (recommended option chosen)
- **The free keys (RISP, two-out RBI, GO-AO, inherited runners) are written for every game, older logs included.** They are exact from the log, so never a false 0. Pitch-count keys need pitch-by-pitch on.
- **Pitch counts:** a hit batter counts as a ball. Strikes are called, swinging, foul and in play.
- **First-pitch strike %** is over batters who saw a pitch.
- **GO-AO:** ground outs = groundouts and double plays; fly outs = flyouts, lineouts and sac flies. Sac bunts and fielder's choices count as neither.
- **The spray section shows only when spray tracking is on** (or a zone was tapped). Notation alone doesn't make a spray chart, though it fills zones once spray is on.
- **Pitch mix shows in the sheet and box notes only**, not as career keys.
- **The play-by-play running score reads visitors first** (line-score order). Alternative: home first like the other sports.

### Open questions
1. Running score visitors first, or home first like the other sports?
2. Should sac bunts count as ground outs for GO-AO?
3. Are the house minimums right? 10 at bats with RISP, 100 pitches for strike %, 30 batters faced for first-pitch strike %.
4. Should hits record a batted-ball type (ground ball / line drive / fly ball)? It's one more tap.

### Follow-ups not built
- Batted-ball type, pitch location chips, a per-batter spray-chart drawing.
- The pitch sequence of the at-bat in progress.
- Individual batter LOB; holds and blown saves.
- Shared edit suggested (not made): pass team names into `matchBoxSource`'s context (`src/sports/boxSources.ts`). Without them, the Summary tab's baseball box notes read "Visitors" / "Home".

---

## Shared-file edits

None. No existing shared file was changed (types.ts, statSchema.ts, statSchemas.ts, liveEvents.ts, LiveTimeline.tsx, boxScore.ts, boxSources.ts, components, data, screens). The four new shared modules are additive: `feedGroups.ts`, `compareSheet.ts`, `GroupedFeed.tsx`, `StatSheetView.tsx`.

## Checks (2026-10-22)

- `npx tsc --noEmit`: clean.
- `npm test`: 3537 tests, 3535 pass, 0 fail, 2 todo (the existing squash SQ-07 replays).
- New tests: ice hockey deep 25, feed / sheet helpers 10, rugby deep 25, American football deep 33, baseball deep 37.
- Not run on a device. The founder's session verifies on screen after merging.
