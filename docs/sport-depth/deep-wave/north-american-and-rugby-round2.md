# Deep wave, round 2: north-american-and-rugby family

Ice hockey · rugby union · **rugby league (new sport)** · American football · baseball & softball.

**Founder answers (2026-10-22)** to the open questions in [north-american-and-rugby.md](north-american-and-rugby.md). This round builds them.

**Rules followed (unchanged):**
- Scoring stays one tap.
- Optional capture is off by default.
- Old matches replay identically.
- There are no false zeros.
- Career keys are written only when tracked.
- Rule details are organiser options with standard defaults.
- Credits go to player ids.

## ⚠️ Figures that change on matches already played

No score or result changes anywhere. These derived figures do:

- **Baseball & softball:** pitcher GO-AO (`pitchGroundOuts`, the sheet's GO–AO row and the box note) rises wherever a sac bunt was recorded. This happens on the game's next stat sync.
- **American football:** drive-chart "plays" go up by one for each drive that ended in a punt or a field-goal attempt. This shows in the Drives view and in the commentary's drive summaries. It is display only; drives are not career keys.
- **Rugby union, ice hockey:** nothing changes. New capture applies only from matches that use it.

---

## Ice hockey

**Founder:**
- Record the faceoff zone as an optional toggle (one extra tap per draw).
- Show FO % by zone in the panel and in careers.
- Keep the 20-draw minimum.
- Keep power plays counted per penalty: a 5-on-3 from two penalties is two opportunities (NHL convention).

### Built
- **Toggle.** `trackFaceoffZones` ("Faceoff zones", in Stats to track and the format's advanced fields, off by default).
  - It counts only when Faceoffs are tracked.
  - With it off, a faceoff is still one tap and the payload is unchanged.
- **The extra tap.** After **⚪ Faceoff won**, a "Where was the draw?" row: **<other team> end** · **Neutral zone** · **<winner> end**, plus **Skip the zone**.
- **Model.** `payload.zone` is `'oz' | 'nz' | 'dz'` from the winner's view, as NHL play-by-play reads it ("won Off. Zone"). The losing centre's zone is the mirror: `oz` ↔ `dz`, `nz` stays.
- **Credits.** These are live, through `eventCredits`, so statTotals equal the live increments. Each centre gets his own zone key:
  - `faceoffWinsOz` / `Nz` / `Dz`;
  - `faceoffLossesOz` / `Nz` / `Dz`.
  - The keys read 0 on every line only when the match tracked zones (`zonesTracked`: the toggle on with faceoffs tracked, or any zoned draw).
- **Match stats.** Offensive / neutral / defensive zone faceoffs won of taken (%) per team, each from its own end. Shown only when zones were tracked.
- **Careers.** Won-lost and FO % per zone under "Faceoffs", each with the same 20-draw minimum.
- **Not added:** zone leaderboards and box columns (to keep the box lean).
- **Commentary:** "… wins the faceoff in the offensive zone".
- **Voice:** "faceoff Rao offensive / neutral / defensive zone".
- **Power plays.** No code change. A test now pins the per-penalty count: a 5-on-3 from two minors = 2 opportunities.
- **Tests:** `tests/ice-hockey-round2.test.mts`. One existing assertion changed on purpose: the "Stats to track" field count in `tests/ice-hockey-deep.test.mts` went from 4 to 5.
- **Replay check (one-off):** 300 random games (≈20 k actions) through the c0a19a6 engine and the new one gave identical state, totals, sheet and commentary.

### Decisions (recommended option chosen)
- **Zone buttons name the END of the rink** ("Wolves end"), not "Offensive / Defensive". Relative labels flip with whoever won the draw, so a scorer could enter them backwards. Alternative rejected: OZ / NZ / DZ buttons.
- **Zone stored from the winner's view; the loser's is derived.** Alternative: store a rink-absolute end. That needs the period's ends, and teams switch ends.

### Open questions
1. Zone leaderboards (for example defensive-zone FO %)?
2. Noticed, not changed: `ppOpportunities` doesn't count a penalty while the clock is stopped at its whistle. The live PP count lags until play resumes; final figures are right.

---

## Rugby union

**Founder:**
- Free kicks credit a player (optional).
- The possession timer pauses on stoppages, through a "ball dead" switch on the possession bar.

### Built: free kicks credit a player
- **🏳 Free kick conceded** now opens the same picker as a penalty. Tap the player, or **Team (no name)**. With "Penalties by offence & free kicks" on, that is 2 taps instead of 1.
- **New key `freeKicksConceded`.** FKC, Discipline group, keyed, lower is better.
  - It appears in the box column, the career Discipline row and the comparison.
  - An unnamed free kick lands on the box's Team row.
- **Commentary:** "Free kick against Lions — conceded by H4."
- **Corrections:** a free kick can now be **✎ Edit**ed (re-entered through the picker), not only removed.

### Built: "Ball dead" switch
- **⏸ Ball dead** / **▶ Ball live** sits on the possession bar. The action is `BALL_DEAD { dead }`, stored as a `dead: true` possession mark.
- While the ball is dead, neither side's possession or territory clock runs.
- It comes back to life when:
  - a team is tapped (the same team too), or
  - **▶ Ball live** is tapped (back with the team that had it).
- It does nothing:
  - before anyone has had the ball;
  - when the ball is already in that state;
  - after full time.
- **Match stats.** When the switch was used in the scope, the possession note adds "Ball in play 34:10 — "Ball dead" spells left out". Ball-in-play time was out of scope last round; it is now available whenever the switch is used.
- A spell left on over half-time holds until the next tap. Per-half scopes clip it.
- **Tests:** `tests/rugby-round2.test.mts` (17 tests). One existing assertion in `tests/rugby-deep.test.mts` changed on purpose: a free kick with a player now credits `freeKicksConceded`; it was `{}`.

### Decisions (recommended option chosen)
- **`freeKicksConceded` is tracked once the match recorded a free kick with the player asked** (an `asked` mark from the new flow, or a named player). The "Penalties by offence" toggle alone doesn't track it.
  - Why: matches scored with last round's one-tap free kicks never gain a false 0.
  - Cost: a match with the toggle on and no free kicks shows "–", not 0.
  - Alternative rejected: track it from the toggle. That is simpler but writes false zeros on one-tap matches.
  - Editing an old one-tap free kick goes through the picker, so it then tracks the key for that match. That is the scorer's explicit choice.
- **"Ball dead" pauses territory as well as possession.** World Rugby / Opta report both on ball-in-play time. Alternative rejected: pause possession only.
- **Ball dead is never automatic.** A try, a kick at goal or a stopped clock doesn't set it. The playing clock already stops when the referee stops it. Alternative (follow-up): auto "ball dead" after a try or a kick at goal, until the restart tap.
- **No free-kick leaderboard.** It is a lower-is-better count, as with turnovers conceded.

### Follow-ups
- Auto ball-dead after scores.
- Voice for tallies.
- Free-kick reasons (early engagement, numbers at the lineout, time-wasting) if wanted.

---

## Rugby league (new sport `rugby_league`)

**Founder:** build rugby league as a separate sport (not a union variant), with:
- 13s and 9s;
- six-tackle sets;
- a 4-point try, 2-point conversion / penalty goal and 1-point drop goal;
- golden point (organiser option);
- the sin bin.

**Sources:**
- International Rugby League Laws of the Game.
- NRL / Super League competition rules: golden point, the two-point field goal.
- NRL Nines / Auckland Nines laws.
- 2015 NRL Grand Final (Wikipedia) for the replay test.

### Built
- **A sport of its own.** `src/sports/rugby_league/`: engine, sets, totals, box, stats, sheet, commentary, timeline, ticker, voice, discipline, records, pitch.tsx and index.tsx.
  - Nothing imports or changes `../rugby/*`, so a union change can't break league.
  - Name "Rugby league", icon 🏉.
- **Presets:**
  - **13s** · 2 × 40, sin bin 10, 8 interchanges.
  - **U18 / U16 / U14** · 2 × 35 / 30 / 25, unlimited interchange.
  - **Nines** · 9 a side, 2 × 9, sin bin 3, unlimited interchange.
  - All are organiser-editable.
- **Scoring:**
  - try 4;
  - conversion 2;
  - penalty goal 2;
  - field goal (drop goal) 1.
  - A **penalty try** is 4 points *and* the conversion is still taken, from in front.
- **Scoring options (off by default):**
  - the NRL **two-point field goal** from 40 m (the scorer picks 1 or 2);
  - the Nines **bonus try zone** (a try under the posts = 5);
  - Nines **golden try**.
- **Golden point (decider):**
  - none (the draw stands);
  - 2 × 5 min, then the draw stands (NRL / Super League regular season);
  - until someone scores (finals).
  - The first score of any kind ends it; a try ends it with no conversion.
  - A knockout always gets "until someone scores" (`KO_DECIDER` / `stageAwareFormat`). A league game is never given that option.
- **Discipline:**
  - **Sin bin:** on the playing clock; the team plays short.
  - **Send-off:** off for good.
  - **On report:** no in-match effect; it is listed for discipline.
  - **Interchanges:** count against the limit. HIA / blood-bin interchanges are temporary and don't count.
- **Six-tackle sets.** An optional "Stats to track" item, off by default.
  - **The panel:** "Tackle n · <team> in possession", a one-tap **Tackle**, and one-tap endings: Kick, Error, Penalty against, Six again.
  - The 6th tackle hands over by itself.
  - A score ends the set.
  - Kept in a `setLog`, not as events (there are hundreds); `walkSets` derives every set.
  - **Derived for free:** sets, completed sets and completion rate, tackles per set, and possession % from set time on the playing clock.
- **Other "Stats to track"** (each off, each owning its own keys): Tackles & missed tackles · Runs, line breaks & offloads · Errors & penalties. With sets on, the set panel's Error and Penalty-against buttons ask for the player, so one tap records both.
- **Views.** Commentary is grouped by half / golden point, with rugby minutes and the running score. The match stats sheet has Scoring, Sets & completions (tracked), Attack, Defence, Discipline and Points by half.
  - Box score, timeline, ticker, voice ("try {name}", "field goal {name}"…), match records and game flow are all included.
  - **LiveExtras** chips (Play-by-play · Match stats · Box score · Key moments) are composed exactly like union's.
- **Keys:**
  - **Reused from union** (same meaning, same labels): points, tries, tryAssists, conversions(+Attempts), penGoals(+Attempts), tackles, missedTackles, carries (shown as "Runs" on the sheet), lineBreaks, offloads, penaltiesGivenAway, plus the derived kicking % / per-game / bests.
  - **Reused from football:** `sinBins`.
  - **New:** `dropFieldGoals` / `dropFieldGoalAttempts` ("Field goals (drop goals)"), `sendOffs`, `handlingErrors` ("Errors").
  - **Team only:** `sets`, `completedSets`.
- **Standings and walkover:**
  - NRL / Super League 2-1-0, ties on points difference, then points scored.
  - Walkover 24-0 (house default, verify).
- **Guide:** website/guides/score-rugby-league.md, a league line in score-by-voice.md, and the website sport list.
- **Tests:** `tests/rugby-league.test.mts` (50 tests). They cover every pure function, the SD-19 contract over every undo prefix, a REMOVE_EVENT correction and an AMEND, plus three replays:
  - **2015 NRL Grand Final**, Brisbane 16–17 North Queensland: 14–12 at half-time; 16–16 after Feldt's try on the siren and the missed conversion; Thurston's field goal in golden point. Totals were checked against the published result; minutes are approximate (commented).
  - **A Nines match** with golden try and the bonus zone.
  - **A 13s match** with a sin bin, a send-off, on report, HIA and interchanges.

### Decisions (recommended option chosen)
- **Separate engine, not a parameterised union engine.** Union's old matches can't move. Alternative rejected: one engine with a code switch.
- **Sin bins reuse football's `sinBins`** (same meaning and labels). Alternative rejected: union's `yellowCards`, because the NRL shows no cards and discipline reads league's own spec.
- **New key `dropFieldGoals`.** Union's `dropGoals` is labelled "Drop goals" and a shared key must read the same everywhere; hockey's `fieldGoals` means something else.
- **The tackle count is optional, off by default.** It costs about 300 taps a match; one school scorer can't keep it up next to the score. Alternative rejected: on by default.
- **Set completion (house definition — verify against NRL / Champion Data):**
  - **Complete:** a kick, a score, six again, or a kick at goal after a penalty.
  - **Incomplete:** an error, a penalty against, or the 6th-tackle handover.
  - **Neither:** cut off by half-time, or an untagged handover.
  - **Dropped:** a set with no tackle that ends without a play.
- **The app never guesses who restarts after a score.** The scorer taps who has the ball.
- **A second sin bin does not become a send-off automatically.** That is the referee's call in league.

### Verify / open questions
1. **Nines rules:**
   - sin-bin length (Auckland Nines 3 min; 5 in 2014);
   - 5-tackle sets?
   - golden try and the bonus zone, and whether kicks score in golden try;
   - drop-kicked conversions (not modelled).
2. Are NRL HIA / blood-bin interchanges free?
3. Junior half lengths.
4. The 24-0 walkover.
5. The NRL / Champion Data definitions of completion and six again.
6. Does the two-point field goal also apply in Super League?
7. Bye points (the NRL gives 2) and an "on report" ban default.
8. The website lists "Rugby" next to "Rugby league". Rename the first to "Rugby union"? It is not changed: that would change union's name across the site.

---

## American football

**Founder:**
- Passes defended include interceptions (NFL).
- Drive charts count punts and FG attempts as plays.

### Built
- **Passes defended.** An interception recorded while **Defensive detail** ("Pass breakups & tackles for loss") is on is marked `pdef`.
  - The mark is set at record time in `buildPlay`, so the controls and voice ("interception Smith") both get it.
  - The interceptor is credited `passDef` + `defInt`.
  - A marked pick makes defence detail "tracked" (the key reads 0 for everyone).
  - Undo reverses both credits.
- **Drive plays.** Punts and field-goal attempts count as drive plays, so a lone FG / punt after a turnover is a 1-play drive.
  - Penalties are still not plays, and kickoffs are never part of a drive.
  - A 4th-down punt still ends the drive as "Punt", not "Downs".
- **Guide:** website/guides/score-american-football.md (both points).
- **Tests:** `tests/american-football-round2.test.mts` (9 tests). One existing assertion changed on purpose in `tests/american-football-deep.test.mts`: the pinned drive plays went from 3 to 4 (punt drive) and from 4 to 5 (FG drive).

### Decisions (recommended option chosen)
- **An INT counts as a PD only when defence detail was on when it was recorded.** Interceptions in untracked or older games never write `passDef`. That would be an INT-only "passes defended", which understates breakups.
- **The match-stats "Total plays" and yards per play stay scrimmage-only.** The NFL team "total plays" excludes punts and FGs. Only the drive chart changed.

---

## Baseball & softball

**Founder:**
- Sac bunts count as ground outs for GO-AO.
- Keep the minimums: 10 AB with RISP, 100 pitches, 30 batters faced.
- Add batted-ball type (ground ball / line drive / fly ball / popup) as an optional toggle, in the panel and in careers (GB %, LD %, FB %).

### Built
- **GO-AO.** `GROUND_OUT` = groundout, double play and **sac bunt**. A fielder's choice is still neither, because the batter isn't out. The minimums are unchanged and now pinned by tests.
- **Toggle.** `battedBallTypes` ("Batted-ball type", off by default). It adds an optional "Batted ball?" chip row next to "Where?" on the in-play sheets: **Grounder · Liner · Fly ball · Popup**.
  - The pick rides on that ball in play only, as optional `btype`; unknown values are ignored.
  - With the toggle off, the flow is exactly as before.
- **Outs fill in their type** when stats are built, in tracked games only; the tap always wins:
  - groundout / DP / sac bunt / fielder's choice = ground ball;
  - lineout = line drive;
  - sac fly = fly ball;
  - fly out = popup if an infielder or the catcher took it (by notation or zone), else fly ball;
  - letter notation also works: L6, P4, IF, F8 / F6, G6-3.
  - Hits and errors are typed only by the tap. The sheet shows "Balls in play with no type".
- **Keys (derived in statTotals, keyed).**
  - Batters: `groundBalls`, `lineDrives`, `flyBalls`, `popups`.
  - Pitchers (allowed): `pitchGroundBalls` …
  - Derived GB / LD / FB / PU % for each, over all typed balls (Statcast families), with a house minimum of 30 batted balls.
  - Leaders: pitcher ground-ball %.
- **Match stats:** a batted-ball section per team (counts and %).
- **Commentary:** a tapped type changes the sentence ("hits a line-drive single", "lines out", "pops out").
- **Tests:** `tests/baseball-round2.test.mts` (21 tests). One existing assertion changed on purpose in `tests/baseball-deep.test.mts`: `TRACK_FIELDS` and `LIVE_SETTINGS.read()` now include `battedBallTypes`.
- **Replay check (one-off):** 200 random games (≈28 k actions) through the old and new engines.
  - State and commentary are identical.
  - Totals and sheet differ only in GO-AO, in the 186 games with a sac bunt.

### Decisions (recommended option chosen)
- **Inferred types are not written into the log.** They are worked out at read time, like spray zones from notation. Alternative rejected: write the inferred type into the payload.
- **Statcast families:** popups are their own category, and each % is over all typed balls. Alternative: FanGraphs, where FB % includes infield flies.

### Open questions
1. Should home runs (or other hits) default to a type, such as fly ball, instead of needing a tap? Untyped hits with typed outs tilt GB % up when the scorer skips the tap on hits.
2. Batter line-drive % leader? Zone leaderboards?
3. A fly out with no fielder or zone counts as a fly ball, not a popup. OK?

---

## Needs wiring (match-screen tabs restructure) — done 2026-10-22

Both league items below are wired: league fills `matchTabs` like union (Commentary = the play-by-play with its Key moments filter; Stats = Match stats · Box score), is in the match-tabs guard test, and the Info card reads e.g. "9-a-side · 2 × 9 min" / "13-a-side · 2 × 40 min · golden point". The website naming stays open.

Another engineer is moving match screens to the tabs Info · Commentary · Stats · Summary · Scoring. Nothing in this round changed a plugin's `LiveExtras` / views composition, and `src/screens/LiveScoringScreen.tsx` was not edited.

- **Rugby league:** its `LiveExtras` has the same four chips as union (Play-by-play → `GroupedFeed` + `leagueCommentary`, Match stats → `StatSheetView` + `leagueSheet`, Box score → `MatchBoxScore`, Key moments → `LiveTimeline`). Slot them into the new tabs the same way union's are.
- **Rugby league format summary line:** `LiveScoringScreen.tsx` (around line 2505) has per-sport lines (`if (sport === 'rugby' && fmt.periodMinutes != null) …`). League needs one, e.g. `Nines · 2 × 9 min` / `2 × 40 min`. It currently shows none.
- **Union, ice hockey, AF, baseball:** no wiring needed. The new rows sit inside the existing sheet / box / career views.
- **Website:** "Rugby" and "Rugby league" now sit side by side in the sport list (scripts/build-website.mjs). Renaming the first to "Rugby union" is a product call; it was not made.

## Shared-file edits

All additive and all for the new sport. No existing sport's behaviour changed through a shared file.

- **`rugby_league` registered in:** src/core/types.ts (`SportId`), src/sports/registry.ts, statSchemas.ts, discipline.ts, boxSources.ts, matchRecordHooks.ts, matchRecords.ts, gameFlow.ts, onField.ts, voiceParsers.ts.
- **Core and components:** src/core/matchSafety.ts, src/components/DisciplineSettings.tsx, src/screens/HeadToHeadScreen.tsx (`CAN_DRAW`).
- **Data:** src/data/lineContext.ts, matchFormat.ts (`KO_DECIDER` + the `stageAwareFormat` branch), matchOfficials.ts, scheduleConflicts.ts, sportProfileFields.ts, standings.ts (NRL 2-1-0 preset), standingsColumns.ts, teamRecords.ts, teamRoles.ts, walkover.ts.
- **Website:** scripts/build-website.mjs (sport list) and website/guides/score-by-voice.md (one league line).
- **Not touched:** src/core/markets.ts. "Rugby league" needs no market override; union keeps its AU "Rugby union" name.

**Registry-wide test pins changed (deliberately):**
- tests/stat-schema.test.mts (~line 70): `rugby_league` added to the expected `STAT_SPORTS` list.
- tests/a11y-labels.test.mts (~line 57): `rugby_league` added to the audited sports. It passes the scan.

**Per-sport assertions changed (founder decisions):**
- tests/american-football-deep.test.mts: drive plays 3 → 4 and 4 → 5.
- tests/rugby-deep.test.mts: a named free kick now credits `freeKicksConceded`.
- tests/ice-hockey-deep.test.mts: the "Stats to track" field count went from 4 to 5.
- tests/baseball-deep.test.mts: `TRACK_FIELDS` and the live-settings read include `battedBallTypes`.

## Checks (2026-10-22)

- `npx tsc --noEmit`: clean.
- `npm test`: 4101 tests, 4099 pass, 0 fail, 2 todo (the existing squash SQ-07 replays). The baseline at c0a19a6 was 3981 tests, 3979 pass.
- **New tests (120):**
  - tests/rugby-league.test.mts: 50.
  - tests/ice-hockey-round2.test.mts: 23.
  - tests/baseball-round2.test.mts: 21.
  - tests/rugby-round2.test.mts: 17.
  - tests/american-football-round2.test.mts: 9.
- One-off replay checks of random old logs: ice hockey 300 games and baseball 200 games through the old and new engines (results above).
- Not run on a device. The founder's session verifies on screen after merging.
