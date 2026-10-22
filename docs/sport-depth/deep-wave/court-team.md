# Deep wave: court-team family (basketball, netball)

The founder's ask (2026-10-22), from the ATP Grand Slam "Match Stats" page: capture broadcast depth, let the scorer **choose which stats to track**, and build the scoring, the match summary (a live commentary) and the stats. This doc covers the court-team family: **basketball** (FIBA) and **netball** (World Netball).

**Standard sources**
- **Basketball:** FIBA Official Basketball Rules 2024. The FIBA LiveStats / fiba.basketball box score and team stats (2PM-A, 3PM-A, FTM-A, OREB / DREB, FD, +/-, EFF, points in the paint, second-chance points, fast-break points, points from turnovers, bench points, biggest lead, lead changes, times tied, time leading). NBA.com / ESPN play-by-play and the shot chart by zone (paint, mid-range, corner 3, above-the-break 3) as the cross-check.
- **Netball:** World Netball Rules of Netball 2024. Champion Data's match statistics as Suncorp Super Netball, the Netball World Cup and the Netball Super League publish them: goals / attempts by shooter, super shots (SSN only), centre pass receives, feeds, goal assists, gains, intercepts, deflections (with / without gain), rebounds, pick-ups, general-play turnovers by type, penalties (contact / obstruction), centre-pass-to-goal and gain-to-goal %, and stats by quarter.

**Founder rules followed**
- Default scoring is still one tap per play. All new capture is optional and **off by default**.
- Each detail is stamped on its own play (`zone`, `fbt`, `fdt`, `gain`, `tt`, CPR events). So switching a toggle on mid-game applies from the next play, and earlier plays keep what they had.
- Old logs replay identically: no reducer path changed for an action without the new payload keys. The legacy-oracle and shared tests are green.
- A figure that wasn't tracked is hidden or marked "not tracked", never shown as 0. Line keys are `coverage: 'keyed'`. The panels add coverage notes ("Shot zones charted on 30 of 42 field goals").
- New player figures are written **only by `statTotals`**: absolute, recomputed at completion or correction, by player id, never live increments. Walkover rules are unchanged.

---

## Basketball

### 1. Gap audit (vs FIBA LiveStats / NBA box score)

| Item | Before this wave | Now |
|---|---|---|
| FGM-A, 3PM-A, FTM-A, %, OREB / DREB, AST, STL, BLK, TO, PF, +/-, MIN, EFF | ✅ (SD-31 / 40 / 29 / 132) | ✅ unchanged |
| **2PM-A, 2P%** (FIBA box) | ❌ derivable, not shown | ✅ box columns + career (full court, misses tracked) |
| **Shot chart by zone** (paint / mid-range / corner 3 / above-the-break 3) | ❌ (was "out of scope") | ✅ optional "Shot zones": zone buttons, still one tap |
| **Points in the paint** | ❌ | ✅ from charted shots |
| **Second-chance points** | ❌ | ✅ derived from typed offensive rebounds and play order |
| **Points off turnovers** | ❌ | ✅ derived from turnovers / steals / offensive fouls and play order |
| **Fast-break points** | ❌ | ✅ optional "⚡ Fast break" tag after a basket |
| **Fouls drawn (FD)** | ❌ | ✅ optional "who was fouled?" step (pre-picks the free-throw shooter) |
| Bench points, biggest lead, lead changes, times tied, largest run | ✅ SD-50 | ✅ (bench points also per period in the panel) |
| **Time leading** (FIBA team stat) | ❌ | ✅ from the game clock (only when every scoring play carries the clock second) |
| Points from 2s / 3s / FT (share), team EFF | ❌ | ✅ panel |
| **Play-by-play commentary** with running score, per quarter | ⚠️ flat timeline, no score, terse labels | ✅ grouped by period, newest first, sentences, assist merged, FT "1 of 2", team-foul count, lead-change tags |
| **Team stats panel** by period, with categories | ⚠️ the shared comparison panel (9 rows) | ✅ Shooting · Scoring · Rebounds & ball · Fouls, period chips |
| Team rebounds, block linked to its miss, steal paired with the opponent's turnover | ❌ | ❌ follow-up (see below) |

### 2. What I built
- **Stats to track** (⚙️ Scoring settings, config mode, and Customize in the match format): Track missed shots (existing), **Shot zones**, **Fast-break points**, **Fouls drawn**. State flags exist only when the format has the key.
- **Capture**
  - *Shot zones on:* the +2 / +3 row becomes **+2 Paint · +2 Mid · +3 Corner · +3 Top** (3×3: +1 / +2). With missed shots tracked, misses become **⭕ Paint / Mid / Corner / Top**. Still one tap. The and-one moves into the post-basket box as **🔗 And-one**.
  - *Fast-break points:* the post-basket box ("Assist?") gets **⚡ Fast break**, which dispatches `TAG` (tags the side's latest made field goal). Baskets logged with tracking on carry `fbt`, so coverage is known.
  - *Fouls drawn:* after the foul type comes "who was fouled?" (opponents on court, or Skip). Then the shooting foul's free throws open with that shooter already picked, so it costs no extra tap.
  - Edits keep the zone and the fast-break tag. A charted basket can be re-entered with a zone chip.
- **Commentary** (`basketball/commentary.ts`, shared `PlayFeed`): "Arjun makes a corner 3 on the fast break (assist: Ben) · off a turnover", "Shooting foul on Xavi (drawn by Ben) · team foul 5, free throws", "Ben makes free throw 2 of 2", tagged "Blues take the lead" / "Level at 54–54". Each row shows the game clock (time left) and the running score. Filters: one period, and scoring plays only.
- **Team stats panel** (`basketball/panel.ts`, shared `CategoryStatsPanel`): rows as listed above, filtered by period and category. **Shot chart** (`ShotChart.tsx`): a half court shaded by FG% per zone for each team.
- **Live view:** three chips: **Play-by-play · Team stats** (+ shot chart + the SD-50 game-flow card) **· Box score** (FIBA box with **2PM-A / 2P% / FD**).
- **Career / leaders keys** (statTotals only, `keyed`): `twosMade`, `twosAtt`, `paintMade/Att`, `midMade/Att`, `c3Made/Att`, `ab3Made/Att`, `foulsDrawn`, `fastBreakPoints`. Derived: `twoPct`, `twosMA`, `paintPct`, `midPct`, `c3Pct`, `ab3Pct`, `fdpg`. New career section "Shot zones"; 2P in Shooting; FD and FD/G in Discipline.

### 3. Decisions (recommended options chosen)
- **Live settings mode** — *chosen:* config mode, as the existing "Track missed shots" uses, with every play stamping its own detail. That already gives "applies from the next play". *Alternative:* an event-mode `SET_TRACK` action, which needs no format patch but adds a new action type and the shared card's "Apply from next ball" wording.
- **Zone capture** — *chosen:* zone buttons replace +2 / +3 (one tap). *Alternative:* a zone prompt after each basket (two taps), or a tap-the-court picker (slower on a phone).
- **Zones** — *chosen:* 4 zones (paint, mid-range, corner 3, above-the-break 3), with both corners counted together. *Alternative:* the NBA's 7 (left / right corner, restricted area vs non-RA paint). Too fine for a one-phone scorer.
- **Fast break** — *chosen:* tag after the basket (⚡ chip). Fast-break points = field-goal points of tagged baskets; an and-one free throw isn't added. *Alternative:* a pre-shot toggle, or counting the and-one FT too (NBA counts all points of the possession).
- **Second-chance points / points off turnovers** — *chosen:* derived from play order. A window opens on an offensive rebound / turnover / steal / offensive foul and closes when possession ends. An offensive foul counts as a turnover (FIBA records it as one). *Alternative:* the scorer tags each basket (more taps).
- **2P / zone keys in 3×3** — *chosen:* not written (their 1s and 2s aren't 5×5 shots). The match panel and commentary still show 3×3 zones with "Corner 2" labels.
- **Commentary clock** — *chosen:* time left in the period (FIBA scoresheet convention); the minute on old logs.
- **Group name** — *chosen:* "Stats to track" (the founder's words). Football and racket sports still say "Stats captured" (see open questions).

### 4. Open questions for the founder
> **Answered 2026-10-22, built in [court-team-round2.md](court-team-round2.md).**

1. Should **"Track missed shots"** default on for the FIBA preset in tournaments (audit-2 P2)? I left everything off.
2. Should **fast-break points** include the and-one free throw (NBA counts all points of the possession)?
3. Should the zone buttons be the **default** layout once a school scorer has used them, or stay opt-in per match?
4. Should "Stats to track" be one name across all sports (football and racket still say "Stats captured")?

### 5. Follow-ups not built
- **Team rebounds** (a "Team" rebounder chip). **Block linked to its missed shot.** **Steal paired with the opponent's turnover** (FIBA). Each is optional and needs one more tap.
- **Shot chart per player** (the data is there per player in the career; the per-match chart is per team).
- **Coach / bench technicals**, alternating-possession arrow (audit-2 P2), unchanged.
- Leaderboards for the new keys (e.g. FD/G, Paint FG%). The keys and labels exist; they aren't in `leaders` yet, to keep tournament pages unchanged.

### 6. Out of scope (needs tracking tech)
Exact shot x/y, shot distance, contested shots, deflections / screen assists / hustle stats, player speed / distance, a live shot-clock countdown, and "time of possession".

---

## Netball

### 1. Gap audit (vs Champion Data / World Netball)

| Item | Before this wave | Now |
|---|---|---|
| Goals / attempts / % by GS and GA, feeds, goal assists, intercepts, deflections, rebounds, turnovers, penalties (contact / obstruction), sanctions, quarters per position | ✅ SD-146 | ✅ unchanged |
| Centre passes, centre-pass goals, goals from gains | ✅ match totals | ✅ **by quarter** too, + centre-pass-to-goal % |
| **Centre pass receives (CPR)** | ❌ | ✅ optional, one tap on the centre-pass strip (WA / GA / WD / GD) |
| **Gains** (+ gain-to-goal %) | ❌ | ✅ optional "Gains & pick-ups": deflection with / no gain, pick-ups |
| **Deflections with / without gain** | ❌ | ✅ |
| **Pick-ups** | ❌ | ✅ |
| **Turnover types** (bad pass, bad hands, footwork, held ball, offside, over a third, breaking, out of court) | ❌ | ✅ optional chip after the player |
| **Offensive / defensive rebounds** | ⚠️ implied by the linked miss | ✅ derived (panel) |
| **Super shots** (SSN 2-pointers, power 5) | ❌ | ✅ organiser rule (off by default): "⭐ Super shot" arms the next shot in the window |
| **Commentary** with running score by quarter | ⚠️ flat timeline, no score | ✅ grouped by quarter, positions at the moment, feeds, linked rebounds, "from a gain", lead tags |
| **Team stats panel** by quarter, with categories | ⚠️ the shared comparison (17 rows, match only) | ✅ Shooting · Centre pass & possession · Defence · Turnovers & penalties |

### 2. What I built
- **Stats to track** (⚙️ Match settings, and Customize): Feeds & rebounds (existing), **Centre pass receives**, **Gains & pick-ups**, **Turnover types**.
- **Organiser rule:** **2-point super shots**, with a window of the last N minutes of each quarter (Super Netball 5; 0 = the whole quarter).
- **Capture**
  - *CPR:* while a centre pass is in play, the strip offers **WA · GA · WD · GD** by name. One optional tap logs `CPR`. It hides once logged, until the next goal.
  - *Gains:* after the deflecting player comes **Gain — won it / No gain / Skip**, and **🤲 Pick-up** joins "More".
  - *Turnover types:* after the player, the type chips, or Skip.
  - *Super shots:* in the window, each side shows **⭐ Super shot**. Arm it, then tap the goal / miss as usual: a goal scores 2, a miss counts as a super-shot attempt. The scoreboard, game flow, ticker ("SUPER SHOT!") and removals all use the goal's value.
- **Commentary** (`netball/commentary.ts`): "Sharks take the first centre pass", "Centre pass Sharks — received by Meera (WA)", "Asha (GS) scores — fed by Meera (WA) · from a gain", "Kavya (GA) misses — defensive rebound Priya (GK), Kites", "Turnover — Riya (C) (footwork)", "Riya (GD) suspended for 2 minutes — Kites play a player short". Positions are as at that moment of the log.
- **Team stats panel** (`netball/panel.ts`) by quarter. **Live view:** **Play-by-play · Team stats · Players** (box with **CPR / GN / SS** when tracked).
- **Career / leaders keys** (statTotals only, `keyed`): `centrePassReceives`, `gains`, `pickups`, `deflectionsGain`, `deflectionsNoGain`, `superShots`, `superShotAttempts`. Derived: `superShotPct`, `gainsPerGame`. The career shows them under Shooting / Attack / Defence. The Summary comparison lists super shots, CPR, gains and pick-ups when present.

### 3. Decisions (recommended options chosen)
- **Gains** — *chosen:* intercepts + deflections with gain + defensive rebounds + pick-ups + the other team's turnovers (a player's gains: the first four). The scorer logs **either** an intercept **or** a turnover for one play, not both. Gain-to-goal % is hidden when goals from gains exceed the gains logged (incomplete logging). *Alternative:* the ball-winning plays only (without opposition turnovers), which can make gain-to-goal exceed 100%.
- **Turnover types** — *chosen:* 9 types named after the World Netball rule infringements. No "unforced" split (Champion Data's judgement call). *Alternative:* forced / unforced.
- **CPR receivers** — *chosen:* WA / GA / WD / GD (who may legally receive in the centre third). *Alternative:* any on-court player.
- **Super shot** — *chosen:* an organiser rule, regular quarters only, armed per shot. The reducer accepts 2 points whenever the format has super shots, so a correction stays possible. *Alternative:* separate "Super GS / Super GA" buttons (4 more buttons in the window).
- **Commentary clock** — *chosen:* time into the period, the existing netball timeline convention (the scorer's clock counts down).
- **Goals vs points** — *chosen:* `goals` counts goals (a super shot = 1 goal + 1 super shot); the team score is points. The box "G" total equals the score only without super shots.

### 4. Open questions for the founder
> **Answered 2026-10-22, built in [court-team-round2.md](court-team-round2.md).**

1. Do any **Indian / Gulf / UK** competitions use 2-point shots? (The Netball Super League may have adopted one; I couldn't verify.) If so, is the window "last 5 minutes" there too, and does it apply in extra time?
2. Should **gains** include the opposition's turnovers (my choice) or only the ball-winning plays?
3. Is **CPR** worth surfacing by default on the 4 × 15 international preset (it's a tap per centre pass, about 120 a match)?
4. The commentary shows time **into** the quarter. Do you want time **left** (as the clock face shows)?

### 5. Follow-ups not built
- **Shooting by circle zone** (close / mid / long, Champion Data's "shot distance"), as an optional zone chip like basketball's.
- **Second-phase receives**, "feeds with attempt" and "goal assists per feed" %.
- **Possession changes** and "time in possession" (need continuous possession logging; out of scope for one phone).
- Per-player **turnover-type** keys (only the team panel splits by type today).
- Leaderboards for gains / CPR (keys exist; not in `leaders` yet).

### 6. Out of scope (needs tracking tech)
Player tracking (distance, speed, court heat maps), exact shot location, and possession time.

---

## Event-log impact (no migration)
- **Basketball** (new optional payload keys, new logs only): `SCORE.zone/fbt/fb`, `MISS.zone`, `FOUL.fdt/drawn/drawnPid`. New action `TAG` {side | id, fb} (also accepted after a first-to-N game ends). State flags `trackZones / trackFastBreak / trackFoulsDrawn` exist only when the format has the key.
- **Netball:** `GOAL.points: 2` (formats with `superShot`), `MISS.ss`, `STAT.kind: 'pickup'`, `STAT.gain` (deflection), `STAT.tt` (turnover). New action `CPR` {side, playerId, playerName, pos}. State flags `trackCpr / trackGains / trackTurnovers / superShot / ssMinutes` exist only when the format has the key.

## Shared-file edits (minimal, additive)
- `src/sports/boxSources.ts` — `basketballBox` merges the deep rows (2PM / 2PA / FD / zones) into each player row and the Team row, so the box shows 2PM-A / FD. Basketball-only lines.
- `src/sports/gameFlow.ts` — netball gets its own case (split from hockey / handball / ice hockey) so a 2-point super shot counts 2 in game flow. Unchanged for every other sport.
- `tests/box-score.test.mts` — the pinned basketball header list now includes 2PM-A, 2P% and FD (they hide unless tracked).
- `tests/stat-totals-contract.test.mts` — the basketball case lists `twosMade` / `twosAtt` as derived (statTotals-only) keys.
- New shared files (mine): `src/sports/feedModel.ts`, `src/sports/PlayFeed.tsx`, `src/sports/statPanel.ts`, `src/sports/CategoryStatsPanel.tsx`. Any sport can reuse them.
