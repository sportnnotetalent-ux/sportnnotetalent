# Deep stats wave (2026-10-22) — review index

The founder asked for broadcast-depth scoring, commentary and stats for every sport, with the option to choose what to track, built in one go with recommended options where unsure, and doubts listed for a later review. This page collects **every decision taken on your behalf and every open question**, per family. Full gap audits, what was built and follow-ups are in each family doc.

**Ground rules every family followed:** scoring stays one tap; all new depth is an optional "Stats to track" toggle (off by default) unless it is free from the existing log; old matches replay identically; nothing untracked shows as 0; career keys are written only when tracked; no migrations.

## ⚠️ Figures that change on matches already played

No score or result changes anywhere. These derived figures do:

- **Tennis:** career keys `winnersFh` / `winnersBh` / `ueFh` / `ueBh` now count every shot on that wing (volleys included); a one-off `resyncSportLines('tennis')` brings older match lines onto the new keys.
- **Ice hockey:** power-play opportunities no longer count a 4-on-4 from coincident minors, so some past PP counts drop.
- **American football:** a touchdown from scrimmage now counts as a first down (NFL / NCAA), so first-down totals rise on old play-by-play games.
- **Baseball & softball / golf:** older games gain the new exact keys (RISP, two-out RBI, inherited runners; golf scoring-by-par etc.) on their next stat sync or re-finish.
- **Football:** the Summary tab no longer shows a false "100% – 0%" possession when the possession bar was never used.
- **Chess:** the new "checks given" career key is `checksGiven` (renamed at merge — ice hockey's body checks use `checks`).

## Tennis (SD-157, SD-158) — docs/sport-depth/tennis.md

### Decisions taken

- **Return points in play** = serves in play that were returned (not an ace, service winner or return error); double faults are left out; counted only where the point's ending is known (point detail or the Ace button).
- **Doubles:** net, rally-length and return-in-play figures are per side (both players get them); serve speed goes to the named server.
- **Old career keys:** `winnersFh` / `winnersBh` / `ueFh` / `ueBh` now mean every shot on that wing; `winnersFhVolley` / `winnersBhVolley` retired (career rows add them back so old and new lines read the same). Running `resyncSportLines('tennis')` once moves older lines onto the new keys.
- **Serve speed** must be 30–270 km/h and is saved as soon as a valid value is typed (so it can't land on the next point).
- **Commentary** shows the server's score first (broadcast style) and match time only when the match was timed from its first point.

### Open questions

- Should serve speed also offer mph (US / UK venues)?
- Should "Fastest serve" be a tournament leader (it is wired, with no minimum)?

## Racket — badminton, table tennis, squash, padel, pickleball — [racket.md](racket.md)

### Decisions taken

1. **Model reuse.** Chosen: the tennis fields `pd.wing` / `pd.shot` with per-sport shot lists, and the SD-107 winner ids reused as shot ids (no migration, career keys continue). Alternative: a new `pd.rshot` field and a stroke → shot mapping table — rejected (parallel model, renamed keys).
2. **Badminton "Push / lift".** Chosen: split into **Push** and **Lift** (BWF coaching vocabulary); an older "push" winner reads as Push. Alternative: keep one combined chip.
3. **Table tennis "serve".** Chosen: the serve's outcomes stay **Ace** and **Service fault** (with type); the shot list starts at the **Receive**. Alternative: a "Serve" shot chip on winners — duplicates Ace.
4. **Rally-length buckets.** Chosen: three per sport, countable by one scorer (badminton 0–4 / 5–10 / 11+, squash 0–5 / 6–15 / 16+, padel / pickleball as tennis 0–4 / 5–8 / 9+). Table tennis uses the phase buckets 1–2 / 3–4 / 5+ so the three-phase analysis comes free. Alternative: a typed exact shot count — too slow live.
5. **Score in the commentary.** Chosen: the score as the umpire / marker / server calls it after the rally — the next server's score first (badminton, TT, squash) and the 3-number call in side-out doubles; padel like tennis (the game's server first). Alternative: always home-away.
6. **Game-row score.** Chosen: the game score winner first ("21-18") with the match situation as the note; padel keeps tennis' set games score (home-away).
7. **Squash lets per player.** Chosen: two one-tap Let buttons (who appealed); older lets without a side are counted as "not named". Lets are in the panel only, not careers. Alternative: keep one Let button and lose the per-player count.
8. **Pickleball kitchen line.** Chosen: reuse the tennis net mark ("who was forward") with its own keys `kitchenPts` / `kitchenWon` (labels differ from tennis' net points, and a shared key must read the same everywhere). Kitchen *arrival %* is not shown (no "nobody arrived" window).
9. **3rd shot.** Chosen: the serving team's 3rd shot (drop / drive / lob), credited to the serving side; "won" = the serving team won the rally. Alternative: also who hit it (doubles) — one more tap.
10. **Wing on every sport.** Chosen: offered everywhere (BWF analysis is mostly by shot, but backhand clears / net shots matter in coaching); one optional row, skippable.
11. **No new leaderboards.** Chosen: the new figures are career rows with labels; leader lists, award slots and MVP weights are unchanged (their pins are untouched). See open question 3.
12. **Volleyball adapter in serveStats.** Kept: tests still import it (`serveStats('volleyball')` in sd58-71 and sd136 tests).
13. **One renderer.** `tennis/Commentary.tsx` now renders through the shared `CommentaryFeed` (same rows, same 🎾, "Show all N games").

### Open questions

1. **Badminton shot list.** Is smash / drop / clear / net shot / net kill / drive / lift / push / serve the right school-level set, or add "jump smash" and "block"?
2. **Rally buckets.** Are badminton 0–4 / 5–10 / 11+ and squash 0–5 / 6–15 / 16+ right for school matches, or should they be organiser options?
3. **Leaders.** Should any new figure become a leaderboard / award: padel net points won %, pickleball 3rd-shot drop success %, table tennis serve & 3rd-ball won % (each with a minimum)?
4. **Squash lets in careers.** PSA shows lets per match only; should careers carry "lets asked" too?
5. **Pickleball kitchen arrival %.** Worth a "nobody got there" chip so arrival % can be computed?
6. **Commentary on the Summary tab / share image** (needs a shared-screen change).
7. **Hindi / regional-language commentary** later?

## Cricket — [cricket.md](cricket.md)

### Decisions taken

1. **The commentary is derived, not stored.** It joins the ball log to the timeline by stamp + kind (`ballEventMatches`). *Alternative:* store an event id on each ball record. That would change the replayed state of every old match, which the frozen replay test pins.
2. **Ball detail is its own score-neutral action** (`BALL_DETAIL`), keyed by delivery ordinal with a stamp guard. *Alternative:* extra keys on the ball action itself. That would need a second tap before the ball is sent, or editing a past event.
3. **"Stats to track" lives in Match rules** (event mode, one chip row). *Alternative:* a separate settings card per match. Match rules already holds the wagon wheel, and event mode gives "from the next ball" for free.
4. **Pitch-map vocabulary**: 6 lengths (bouncer, short, good, full, yorker, full toss) × 5 lines (wide off, off, stumps, leg, wide leg), relative to the batter. *Alternative:* a tap on a pitch picture (more precise, slower and harder at 375 px), or a coarser 3 × 3.
5. **Shot control**: a tracked ball the scorer doesn't tag counts as **in control**, so only false shots are tagged. *Alternative:* an explicit "in control" tap on every ball, which doubles the taps.
6. **Bowler type** is stored per match by player id, set once per bowler, from the profile when known (even with the toggle off: it's free). *Alternative:* only when the toggle is on; or per-ball.
7. **Phases**:
   - The powerplay is the format's own (The Hundred 25 balls; none if the format has none).
   - The death is the last ¼ of the innings (T20 16–20, T10 8–10), or the last 10 overs from 40 overs up (ODI 41–50).
   - There are no phases for 100+ overs (Test / timeless) or under 4 overs.
   - *Alternative:* organiser-set phase lengths (follow-up).
8. **Speed** is a manual km/h, 40–180, from a speed gun. Anything automatic is out of scope.
9. **Catch position** reuses the wagon-wheel field (8 zones × ring / deep → named positions such as long-on and the slips) and is only offered with the wagon wheel on. *Alternative:* its own toggle.
10. **Minutes at the crease** are shown only when every delivery of the innings is stamped. They are never estimated.
11. **No new leader rails yet.** "Fastest ball" and "Best control %" have labels, but the cricket leader list is pinned in two shared tests and other engineers are editing those files. Enabling them is a one-line append plus updating the pins.
12. **No "free" derived career keys** (dots faced, boundary %, phase economy), because writing them would change every old match's totals. They show per match in Stats.
13. **The Scorecard's "Ball by ball" list moved to the Commentary tab**, which is a superset of it. The Scorecard keeps a pointer line.
14. **A no-ball with 4 or 6 off the bat counts as a boundary** in the derived stats. The ball log doesn't keep a no-ball's all-run flag; the scorecard's 4s / 6s are unaffected.
15. **Over-summary batter lines show runs (balls)**, which are exact from the log. The wicket line uses the batter's final card (with 4s / 6s).
16. **The UI files are named CommentaryView.tsx / MatchStatsView.tsx.** The filesystem is case-insensitive and they would clash with commentary.ts / matchStats.ts.

### Open questions

1. **Leader rails.** Turn on "Fastest ball" and "Best control %" (with a minimum, e.g. 60 balls tracked) as tournament leaders?
2. **Phase lengths.** Keep the automatic powerplay / death? Should a school T20 with no fielding restrictions still show "overs 1–6" as a powerplay? Or make them organiser options?
3. **Bowling type from the profile** is applied even when "Bowler type" is off. OK? Or only when switched on?
4. **Speed entry.** Is a speed gun realistic at any of our events? If not, should we hide the toggle until asked?
5. **Commentary language.** English only for now. Add Hindi / regional language templates later?
6. **Sharing.** A WhatsApp "end of over" or "end of innings" summary card from the commentary?
7. **Next detail items** from the SD-113 list:
   - wide / no-ball reason (D2);
   - direct-hit run outs (D5);
   - a bouncers-per-over warning (R4, which could read the pitch map's "Bouncer").
8. **Free figures in careers** (dot %, boundary %, phase economy) for matches scored from now on. This needs a "new-era" marker so old totals don't move. Wanted?
9. **Verify.**
   - The CricViz phase convention for T10 / The Hundred death.
   - The Hawk-Eye pitch-map orientation used in Indian broadcasts (we draw it from behind the bowler, off side on the left).

## Football, field hockey, handball — [invasion-goal.md](invasion-goal.md)

### Decisions taken · Football

- Recommended option chosen: depth toggles live in a new optional `state.deep`, **alternative:** extending `TrackConfig` — rejected because legacy-replay tests deep-compare the state and the shared `boxSources.ts` types a map on `TrackConfig`.
- Recommended option chosen: two shot zones (inside / outside the box) + big-chance flag as pre-selected chips, **alternative:** a tap-the-pitch shot map / 6 zones (feeds xG) — too slow for one phone.
- Recommended option chosen: key pass asked *after* the shot (skippable), **alternative:** pick the passer before the shot.
- Recommended option chosen: "Goal ruled out" always available (an occasional button, no cost to the default path), **alternative:** behind a toggle.
- Recommended option chosen: possession shown in the summary / match centre only once the ball changed hands (kick-off alone gives one side 100%), **alternative:** show whenever the timer toggle is on (today's flat compare on the Summary tab still does — see follow-ups).
- Recommended option chosen: team save % = saves ÷ (saves + opponent's goals), own goals excluded (Opta), **alternative:** include own goals.
- Recommended option chosen: no MVP weights for the new keys (football's weights are golden-pinned), **alternative:** weight key passes / clearances like other defensive plays.

### Decisions taken · Field hockey (FIH)

- Recommended option chosen: split "Off target / blocked" into Wide / Blocked (still one tap), **alternative:** keep one button and add an optional chip.
- Recommended option chosen: split the shoot-out "Missed / saved" into Saved / Missed with the keeper filled in, **alternative:** a separate keeper step.
- Recommended option chosen: possession and referrals off by default, also for the FIH preset, **alternative:** on by default for "FIH 4 × 15".

### Decisions taken · Handball (IHF)

- Recommended option chosen: empty goal as a per-side link under the keeper (always available), goals while empty tagged EG automatically, **alternative:** an "Empty goal" shot type the scorer picks — rejected, the toggle is needed anyway so the keeper isn't charged.
- Recommended option chosen: keeper-by-position keys derived from the existing log (older matches gain them at their next sync), **alternative:** only for new matches. Note: a save logged without a shot type is read as 9 m (the engine's existing default).
- Recommended option chosen: top three scorers per side as "goals / attempts" in the match summary (handball has too many goals for a minute list), **alternative:** every scorer.
- Recommended option chosen: fault kinds stay off the "not tracked" note (seven labels would be noise); only "7 m won" is listed.

### Open questions

1. Football **big chance** is Opta's (subjective) definition — keep it, or drop it to stay objective?
2. A simple **location-based xG** from the two zones + big chance + penalty — recommended **no** (looks precise, isn't); OK?
3. Should **Goal ruled out** sit behind a toggle for school matches without VAR?
4. The **Summary** tab's flat comparison still shows possession (100 – 0) when the bar was never used; fix it in the shared `boxSources.ts` (another owner) the way the match centre does?
5. Hockey: switch **possession / referrals on by default** for the FIH 4 × 15 preset in tournaments?
6. Handball: is "**EG** / empty-goal goals" the wording you want on profiles? Should the 7th-court-player time be shown (minutes with an empty goal)?
7. Should the new keys get **MVP weights** (key passes, clearances, keeper saves by position)? Football's weights are golden-pinned, so this is a deliberate change.

## Basketball, netball — [court-team.md](court-team.md)

### Decisions taken · Basketball

- **Live settings mode** — *chosen:* config mode, as the existing "Track missed shots" uses, with every play stamping its own detail. That already gives "applies from the next play". *Alternative:* an event-mode `SET_TRACK` action, which needs no format patch but adds a new action type and the shared card's "Apply from next ball" wording.
- **Zone capture** — *chosen:* zone buttons replace +2 / +3 (one tap). *Alternative:* a zone prompt after each basket (two taps), or a tap-the-court picker (slower on a phone).
- **Zones** — *chosen:* 4 zones (paint, mid-range, corner 3, above-the-break 3), with both corners counted together. *Alternative:* the NBA's 7 (left / right corner, restricted area vs non-RA paint). Too fine for a one-phone scorer.
- **Fast break** — *chosen:* tag after the basket (⚡ chip). Fast-break points = field-goal points of tagged baskets; an and-one free throw isn't added. *Alternative:* a pre-shot toggle, or counting the and-one FT too (NBA counts all points of the possession).
- **Second-chance points / points off turnovers** — *chosen:* derived from play order. A window opens on an offensive rebound / turnover / steal / offensive foul and closes when possession ends. An offensive foul counts as a turnover (FIBA records it as one). *Alternative:* the scorer tags each basket (more taps).
- **2P / zone keys in 3×3** — *chosen:* not written (their 1s and 2s aren't 5×5 shots). The match panel and commentary still show 3×3 zones with "Corner 2" labels.
- **Commentary clock** — *chosen:* time left in the period (FIBA scoresheet convention); the minute on old logs.
- **Group name** — *chosen:* "Stats to track" (the founder's words). Football and racket sports still say "Stats captured" (see open questions).

### Decisions taken · Netball

- **Gains** — *chosen:* intercepts + deflections with gain + defensive rebounds + pick-ups + the other team's turnovers (a player's gains: the first four). The scorer logs **either** an intercept **or** a turnover for one play, not both. Gain-to-goal % is hidden when goals from gains exceed the gains logged (incomplete logging). *Alternative:* the ball-winning plays only (without opposition turnovers), which can make gain-to-goal exceed 100%.
- **Turnover types** — *chosen:* 9 types named after the World Netball rule infringements. No "unforced" split (Champion Data's judgement call). *Alternative:* forced / unforced.
- **CPR receivers** — *chosen:* WA / GA / WD / GD (who may legally receive in the centre third). *Alternative:* any on-court player.
- **Super shot** — *chosen:* an organiser rule, regular quarters only, armed per shot. The reducer accepts 2 points whenever the format has super shots, so a correction stays possible. *Alternative:* separate "Super GS / Super GA" buttons (4 more buttons in the window).
- **Commentary clock** — *chosen:* time into the period, the existing netball timeline convention (the scorer's clock counts down).
- **Goals vs points** — *chosen:* `goals` counts goals (a super shot = 1 goal + 1 super shot); the team score is points. The box "G" total equals the score only without super shots.

### Open questions · Basketball

1. Should **"Track missed shots"** default on for the FIBA preset in tournaments (audit-2 P2)? I left everything off.
2. Should **fast-break points** include the and-one free throw (NBA counts all points of the possession)?
3. Should the zone buttons be the **default** layout once a school scorer has used them, or stay opt-in per match?
4. Should "Stats to track" be one name across all sports (football and racket still say "Stats captured")?

### Open questions · Netball

1. Do any **Indian / Gulf / UK** competitions use 2-point shots? (The Netball Super League may have adopted one; I couldn't verify.) If so, is the window "last 5 minutes" there too, and does it apply in extra time?
2. Should **gains** include the opposition's turnovers (my choice) or only the ball-winning plays?
3. Is **CPR** worth surfacing by default on the 4 × 15 international preset (it's a tap per centre pass, about 120 a match)?
4. The commentary shows time **into** the quarter. Do you want time **left** (as the clock face shows)?

## Volleyball, kabaddi — [volleyball-kabaddi.md](volleyball-kabaddi.md)

### Decisions taken

1. **Set assists.** Chosen: count the setter named on a kill (NCAA-style "assist", labelled "Set assists"), and rank FIVB Best Setter by set assists per set. Alternative: FIVB's "excellent sets" (sets judged excellent whether or not they become a kill), which needs a grade on every set, too much for one scorer.
2. **Reception error.** Chosen: "who was aced" only, which counts as a reception and an error. Alternative: also grade overpasses or reception errors that don't end the rally. That is folded into "− Poor" today.
3. **Reception efficiency.** Chosen: VIS (perfect − errors) ÷ receptions, only over matches that named aced receivers (min 10 receptions). Alternative: positive % (already shown).
4. **Rotation analysis.** Chosen: by the player at position I (the server of that rotation). This holds up across sets and substitutions without knowing who the setter is. Alternative: P1–P6 by setter position, which needs the setter marked.
5. **Serve attempts.** Chosen: written only when every served rally of the match names its server; otherwise "not tracked". Alternative: a partial count with a coverage note on the career. Rejected because the absolute sync can't express partial coverage.
6. **Volleyball serve panel.** Chosen: volleyball now draws its own Serve / Reception categories from `rotation.ts` instead of the racket-owned `MatchStatsPanel` / `serveStats.ts`, which stays untouched. Its volleyball adapter is now unused by the UI; the racket engineer may drop it.
7. **Kabaddi super-tackle chance.** Chosen: the raid *faced* 3 or fewer defenders (before the touches). Alternative: the engine's own super-tackle test, which runs after the touches. Both are shown: the chance figure, and super tackles as scored.
8. **Kabaddi tackle attempts.** Kept SD-41's proxy: successful tackles + raids that touched and got back. A true per-defender attempt count is out of scope.
9. **Raid skill on empty raids.** Chosen: only "Escape" is kept on a raid that scored nothing. The other skills describe points.
10. **Tackle-type chip.** Left always visible, as since SD-117b, so nothing scorers know disappears. The new Raid skill row is gated by the toggle.
11. **Commentary replaces the flat timeline** on the Score tab for both sports. The substitution list (volleyball) and the box score's comparison rows (kabaddi) are folded into the new panels.

### Open questions

1. Volleyball **Best Setter / Libero**. Is "set assists per set" acceptable as the Best Setter basis? Should a Best Libero slot be added (FIVB: digs + receptions per set)?
2. Should the three new FIVB award slots (Best receiver / digger / setter) appear only when some match in the tournament tracked that category? Today they behave like the existing Best attacker slot.
3. Kabaddi **raid skills list**. Is hand / running hand / toe / kick / dubki / escape the right school-level set? PKL also uses "scorpion kick", "frog jump" and "bonus".
4. Kabaddi **raid strike rate minimum**: 10 raids, the same scale as volleyball's 10 attempts. Is that right for 2×10-minute school matches?
5. Should **Defenders touched** later also produce a per-defender "unsuccessful tackle" figure? That needs to know who attempted the tackle, not just who was touched.
6. Volleyball **commentary language**. Points are worded "Point {team} — kill by …" (the VNL style). Should Hindi or regional-language commentary come later?

## Ice hockey, rugby, American football, baseball & softball — [north-american-and-rugby.md](north-american-and-rugby.md)

### Decisions taken · Ice hockey

- **One-tap faceoffs credit remembered centres.** Alternative: pick the winner on every draw (2 taps × ~60 draws).
- **PP opportunity = a penalty that left the other side a skater up at some point.** A 4-on-4 isn't one; a double minor that outlasts its 4-on-4 is.
  - This changes the PP count shown for past matches that had coincident minors at full strength. It is a team figure; the score is unchanged.
  - Alternative: keep counting every non-cancelled penalty.
- **PP time comes from the penalties only** (NHL convention). An empty net doesn't make it a power play.
- **Shot attempts appear only when both missed shots and blocks are tracked.** Alternative: show partial attempts.
- **Commentary time is elapsed in the period** ("12:34", the IIHF / NHL game-sheet way). Alternative: time remaining, as the scoreboard shows.
- **New key `checks` (label "Hits")**, so it doesn't share baseball's `hits` key. **`shotBlocks`** is used because `blocks` is football / basketball.

### Decisions taken · Rugby (union 15s, tens, sevens)

- **Penalty offences get their own toggle and button**, not a field on the existing detail event. On the detail event, any detail event makes every detail key (tackles…) read 0, which would give false zeros. Offloads get their own toggle for the same reason.
- **Points per 22 entry (house definition):** the points the entering side scores until the next entry by either side, or the end of the period. A try scored with no entry tapped for that side counts as an entry. Alternative: end an entry when play leaves the 22, which needs a second tap per entry.
- **Possession and territory are time on the playing clock**, not ball-in-play time, and carry across half-time. Territory = time play is in the other side's half.
- **Free kicks are team only.** No player key.
- **No leaderboard for turnovers conceded.** A lower-is-better count rewards not playing.

### Decisions taken · American football (flag + tackle)

- **A touchdown from scrimmage counts as a first down** (NFL / NCAA convention). `firstDowns` therefore changes for old play-by-play games (a team figure; the score is unchanged), and one existing assertion was updated from 1 to 2. Alternative: keep TDs out.
- **Flag football has no red zone.** The equivalent row is "Past midfield — TDs / trips", with a note.
- **Drive "plays" are scrimmage plays only** (no punts, FG attempts or penalties). Drive net yards are by field position, so penalty yards count.
- **Old play-by-play logs gain only `rushLong` / `recLong`** (derived, exact). Scores-only logs gain nothing.
- **Times sacked is tracked once any sack names a QB.**
- **A tackle for loss needs both "who made the tackle" and "Defensive detail" on.**
- **Possession time:** the rest of a half stays with the last offence.
- **The Box score view shows tables only;** Match stats carries the team comparison.

### Decisions taken · Baseball & softball

- **The free keys (RISP, two-out RBI, GO-AO, inherited runners) are written for every game, older logs included.** They are exact from the log, so never a false 0. Pitch-count keys need pitch-by-pitch on.
- **Pitch counts:** a hit batter counts as a ball. Strikes are called, swinging, foul and in play.
- **First-pitch strike %** is over batters who saw a pitch.
- **GO-AO:** ground outs = groundouts and double plays; fly outs = flyouts, lineouts and sac flies. Sac bunts and fielder's choices count as neither.
- **The spray section shows only when spray tracking is on** (or a zone was tapped). Notation alone doesn't make a spray chart, though it fills zones once spray is on.
- **Pitch mix shows in the sheet and box notes only**, not as career keys.
- **The play-by-play running score reads visitors first** (line-score order). Alternative: home first like the other sports.

### Open questions · Ice hockey

1. Should faceoffs record the zone (offensive / neutral / defensive)? It's one extra tap per draw.
2. Should 5-on-3 count as one power-play opportunity or two? Today it is one per penalty.
3. Is the house 20-draw minimum for FO % right?
4. Should a line-change helper (tap a line of 5) give skater time on ice? It is heavy for one scorer.

### Open questions · Rugby (union 15s, tens, sevens)

1. **Rugby league:** build it as a separate sport id (`rugby_league`: 13s / 9s, six-tackle set, 4-point try, golden point)? Recommended: yes, separately, not as a union variant.
2. Is the points-per-22-entry definition acceptable, including tries counting as entries?
3. Should free kicks credit a player?
4. Should possession pause on stoppages (a "ball dead" switch)?
5. Do you want a "fewest turnovers conceded" leaderboard?

### Open questions · American football (flag + tackle)

1. Should drive charts count punts and FG attempts as plays?
2. Should passes defended include interceptions (as the NFL counts them)?
3. Do you want a flag "no-run zone" stat?
4. Should a toggle switched on mid-game say "recorded from …"? Today only the start of play-by-play is noted ("Play by play from Q2 4:12").

### Open questions · Baseball & softball

1. Running score visitors first, or home first like the other sports?
2. Should sac bunts count as ground outs for GO-AO?
3. Are the house minimums right? 10 at bats with RISP, 100 pitches for strike %, 30 batters faced for first-pitch strike %.
4. Should hits record a batted-ball type (ground ball / line drive / fly ball)? It's one more tap.

## Golf, chess, carrom — [golf-chess-carrom.md](golf-chess-carrom.md)

### Decisions taken · 1. Golf

- **Who sets the stats:** the round's organiser for every marker, else the marker's phone. *Alternative:* per phone only, as SD-45 did; that leaves cards inconsistent within a round.
- **Units:** yards for drives and feet for putts, as the PGA TOUR and DP World Tour publish. *Alternative:* an organiser option for metres.
- **Measured drive holes:** the organiser picks them (the PGA TOUR uses two, played in opposite directions). With none picked, any par 4 / 5 the marker measures counts. *Alternative:* force two holes.
- **Putt buckets:** < 3 ft, 3–10 ft, 10–20 ft, 20 ft+ (the PGA TOUR's "inside 10 ft" splits). *Alternative:* the full 3–5 / 5–10 / 10–15 / 15–20 / 20–25 / 25+ ladder, which is too many chips for one tap.
- **Sand save:** as SD-45 already defines it (out of a greenside bunker and down in one putt or fewer, whatever the score), which is the PGA TOUR definition. In the commentary the scramble line reads "saved par" / "up and down for birdie".
- **Free figures on older rounds:** a round re-finished later (handicap edit, course recompute) gains the free keys (par-3/4/5, bounce back, one- / three-putts). Its score and every older key are unchanged. The golf test that pinned an old card's keys now lists these additions explicitly.
- **The golf key `aces` became `holesInOne`,** because tennis owns `aces` with other labels.

### Decisions taken · 2. Chess

- **Legality:** a full legal-move check, not syntax only, because a scorer's typo is caught at once. *Alternative:* "legality-lite" regex SAN, which is smaller but would accept impossible games.
- **Phases:**
  - The opening is the first 10 moves.
  - The endgame starts once both sides have ≤ 13 points of pieces besides pawns (Q 9, R 5, B / N 3).
  - *Alternative:* a lichess-style "mixedness" phase division, which is heavier and harder to explain.
- **Opening name:** a typed ECO beats a PGN tag, which beats the moves. Transpositions aren't detected.
- **Move lists in knockout mini-matches are not kept** (one list per fixture). *Alternative:* a list per KO game, which is a follow-up.
- **The move list doesn't change the result.** A mate on the board doesn't auto-record 1-0; the arbiter still records it, and the method chips stay the source of truth.
- **Stale keys after a full undo:** if a pasted list is undone after the game, the synced move keys can stay on the line until the next correction. This is a rare edge case and the totals are recomputed on any later change.

### Decisions taken · 3. Carrom

- **Foul types:** striker pocketed · touching · line / hand · thumbing · other. **Thumbing is legal under ICF**, so it is counted only where an event's own rules ban it (the guide says so). *Alternative:* drop thumbing, as the founder's list included it.
- **Doubles fouls and missed covers are not credited to players:** the board log doesn't say which partner fouled. They appear in the match panel per side. *Alternative:* a "who" chip per foul in doubles (one more tap).
- **Defaults when tracking is on:** no foul taps means "no fouls" (counted as 0). Coins on the break stay "not recorded" until tapped, so there is no false 0.
- **Coins pocketed is not written to careers.** It is a match-panel figure only, which avoids changing every line's keys.
- **Leaders and award slots are unchanged** (pinned by shared tests). The audit's "Most slams" award and the new figures are a follow-up.

### Open questions · 1. Golf

1. Should the drive also be entered in metres for Indian school events (with a format option), or are yards fine?
2. Should driving distance, putting by distance and par-3/4/5 averages join the **tournament leaders / award slots**? Leaders are pinned by shared tests (`tests/stat-schema.test.mts`, `tests/leaders-awards.test.mts`), so this wave adds the stats with qualifiers but doesn't list them as leaders.
3. Should up-and-downs be tracked as a separate stat from scrambling? That would need a "shots from off the green" count; today scrambling stands in for it.

### Open questions · 2. Chess

1. Should a checkmate or stalemate on the entered moves **pre-select** the result (still asking to confirm)?
2. Should openings get a career "repertoire" view (record by ECO family)? It needs the ECO kept per line, for example as a numeric key.
3. Should there be a **Performance rating** leader slot (TPR, minimum games)? It needs the ratings data layer, and leaders are pinned by shared tests.
4. Should KO mini-matches keep one move list per game?

### Open questions · 3. Carrom

1. Is the foul list right for AICF events? Should "Line / hand" split into base line, arrow and elbow-crossing?
2. Should a foul's penalty (returning a coin / a due) be enforced in the score? Today it is a record only, and the board result is what the referee writes.
3. Should doubles fouls get a "who" chip so careers can carry them?

## Athletics, swimming, cycling, rowing, canoe sprint — [timed-races.md](timed-races.md)

### Decisions taken

1. **Where the toggles live.** Recommended option chosen: the sport's settings (⚙ Points & timing → "Stats to track"), always editable — capture choices never change a result. Alternative: the Competition rules screen, which locks once results exist (would block switching lap times on at lunchtime).
2. **Athletics lap points.** Chosen: the finish-line passes one timekeeper can read (1500 m: 300 / 700 / 1100 m; 3000 m: 200, 600 … 2600 m; 800 m: the bell; 400 m: 200 m). Alternative: round 400 m points from the start (Diamond League style) — needs a second timekeeper on the back straight.
3. **"Wins" for athletes.** Chosen: `heatWins` = heats / semi-finals / repechages won (not finals: a final won is already a gold). Alternative: count every race won including finals (cycling's `raceWins`) — double-counts golds.
4. **Lead-off times.** Chosen: count as an individual time by default (World Aquatics publishes and accepts them), only for a valid relay (status ok), never for mixed relays, organiser can switch off. Alternative: relay only.
5. **Take-over tolerance.** Chosen: flag below −0.03 s for the take-off judge, never auto-DQ (pads assist, judges decide). Alternative: auto-DQ on the pad reading.
6. **Commentary is derived, not stored.** Chosen: rebuilt from results each view, ordered by the phase's scheduled time then round / heat / trial / height / start order (no per-mark timestamps exist). Alternative: store a timestamped event log per save (exact timing, but corrections then need their own lines).
7. **Records in the commentary.** Chosen: a "New meet / school record" line only after the final is locked, against the book as it stood before (`recordsBefore`), and never for an unconfirmed out-of-range mark; live heats show the MR / PB flags the screen computes. Alternative: announce live — but every first final at a new meet "sets" a record (noise).
8. **Chip time.** Chosen: shown beside the gun time; the gun time ranks and counts for PBs / records (TR 19.25). Alternative: let the organiser pick chip as official (already possible: road timing = chip).
9. **Fastest relay leg** ignores leg 1 when flying legs exist (leg 1 includes the reaction and a standing start).
10. **Field-event "wins"**: none — a field final won is a gold; heats don't exist.

### Open questions

1. **Rule numbers to verify** (from memory): WA TR 17.2 / 17.3 / 17.5 / 22.6 / 24.6 / 24.7 / 6 / 7.1 (the DQ picker); SW 10.13 and the −0.03 s pad tolerance; SW 11.6 / 12.12 for lead-off times.
2. **National / state records (NR):** should organisers type reference marks (AFI / SFI / state lists) shown as "NR" targets, with "beats the national record — subject to ratification"? Who maintains the lists, and per age group?
3. **Heats won in a timed final** (heats ranked across heats) don't count today — fine?
4. **Lap points**: keep finish-line passes, or offer 400 m-from-start as a choice?
5. **Commentary alerts**: should followers get pushes for heat wins / PBs (today only finals and records alert)?
6. **"Records set" on profiles**: wanted? It needs a holder id on record-book entries (today holder is a name) — see §5.
7. Should "Stats to track" also appear on the event setup screen (per event), or stay meet-wide?

## Weightlifting, shooting, archery — [precision-strength.md](precision-strength.md)

### Decisions taken

- **Where the switches live.** Recommended option chosen: the Competition rules screen (SD-141), new group **Stats to track**, copied onto the phases. It is locked once results exist, like every other rule. Alternative: per-event switches that can change mid-meet. Mitigation: lights can still be used per attempt without the switch, and an attempt that already has a jury reversal always shows its button.
- **Weight-change limit default.** Recommended option chosen: IWF two changes, and the app **asks** before a third (SD-112 pattern, never refuses). Alternative: no limit by default. This is the only new prompt on the default path, and it fires only on a third change.
- **What counts as a change.** Recommended option chosen: replacing the app's automatic +1 kg / same-weight declaration is the coach's declaration, not a change. Changes on the weigh-in card (openings before the session) are not counted. Alternative: count every edit.
- **Jury mechanics.** Recommended option chosen:
  - the decision flips and `jury: true` is stored;
  - the referees' lights are kept, so the commentary reads "no lift — jury reversed the referees' 2-1";
  - an automatic next declaration follows, and a coach's declaration is left alone.

  Alternative: record a separate "coach challenge requested / upheld" (open question).
- **Lights notation.** Recommended option chosen: white–red always. A good lift reads "(3-0)" / "(2-1)", a no lift "(1-2)" / "(0-3)". Alternative: majority first ("no lift 2-1").
- **Penalties.** Recommended option chosen:
  - per series, in 2-point taps;
  - totals, ties and records use the net score;
  - "best series" and "perfect series" use the series as shot.

  Alternative: deduct from the stored series value (loses the shot score). Final-shot penalties are not built (open question).
- **Commentary order.** Recommended option chosen:
  - Weightlifting follows the competition attempt number. Attempts entered on the grid without one come last.
  - Shooting and archery go series by series and end by end, in firing / target order. No timestamps are stored.
  - Per-athlete lines appear for fields up to 12; bigger fields get the summaries only.

  Alternative: store timestamps (needs an event log the results engine doesn't have).
- **Face rings.** Recommended option chosen: restrict only compound 50 m (80 cm 6-ring, 5–X) and compound indoor (triple face, 6–X). Recurve indoor is left on the full keypad, because schools often shoot a single 40 cm face (open question). Old results with lower arrows still load; only new entry is checked.
- **Programme breadth.** Recommended option chosen: not adding the missing ISSF events (50 m prone, 25 m standard / centre-fire, 50 m pistol) in this wave. They are programme breadth, not depth, and adding them changes a shared SD-137b test that pins the 9-event list. Alternative: add them now (about 4 catalogue lines plus that test). Listed under follow-ups.
- **No false 0.** Recommended option chosen: new career rates are computed only over lines that carry their keys (filters `hasREnds` / `hasFShots`; per-lift rates need both keys). Old sessions show "–" / nothing, never 0%.

### Open questions

1. **Robi points.** IWF's newer best-lifter formula needs the current world record of each category. Should we build it with an organiser-entered reference total per category, or keep Sinclair only?
2. **Coach challenge (IWF).** Should a challenge be recorded on its own (requested, upheld or rejected), or is "jury reversed" enough?
3. **Switch timing.** Should **Stats to track** stay locked with the other rules once results exist, or be allowed to change mid-meet (they don't change results, apart from penalties)?
4. **Weightlifting clock.** Is a competition clock (1 min, or 2 min for consecutive attempts) in scope? It's a scorer aid, not a result (audit-2 P1).
5. **Shooting final penalties.** Do we need penalties in finals (a deduction from a shot)?
6. **More ISSF events.** Should we add 50 m Rifle Prone (decimal), 25 m Standard Pistol, 25 m Centre-Fire Pistol and 50 m Pistol, plus NRAI 10 m peep-sight / open-sight school classes?
7. **Recurve indoor face.** Should recurve indoor use the triple face (6–X only, as at WA indoor championships), or keep the full 40 cm face for schools?
8. **Team classification.** Should we add IWF team classification (28-25-23-… per gender) as its own result, not only house points?
9. **Team-match arrows.** Should arrows in team matches be attributed to each archer, for individual stats from team events?
