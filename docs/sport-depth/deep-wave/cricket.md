# Deep wave: cricket

**The ask (founder, 2026-10-22).** Bring every sport up to a broadcast "match stats + live commentary" standard. The founder's model was the ATP Grand Slam page. Users choose which stats they track and get in-depth analysis for those. Default scoring stays one tap per event.

**Standard used (cricket).**
- **ESPNcricinfo**:
  - Ball-by-ball commentary: "over.ball Bowler to Batter, outcome, description", plus the end-of-over block (runs, score, CRR / RRR, the batters, the bowler's figures).
  - Match centre "Live stats": Manhattan, worm, partnerships, wagon wheel and pitch map.
  - Statsguru batting card: **M** minutes, BF, 4s, 6s.
- **CricViz** (used by Cricinfo and broadcasters):
  - Phases: powerplay, middle and death.
  - Control % / false-shot %, and dot-ball %, boundary % and scoring-shot %.
  - Bowling economy by phase, and batter-vs-bowler matchups.
- **CricHeroes**: wagon wheel, shot types, and player insights "vs pace / vs spin".
- **Hawk-Eye / broadcast pitch maps**, drawn from behind the bowler with the off side on the left: length × line.
- **ICC Playing Conditions** (T20I / ODI): powerplay lengths; The Hundred (ECB): 25-ball powerplay.

Clause and convention details were taken from memory and are marked "verify" in Open questions where they matter.

## 1. Gap audit

Before this wave, cricket was already the deepest sport. The CricHeroes parity queue, SD-11…SD-133 and the wagon wheel / shot type work (CK-11) had all shipped. These gaps remained against the standard above:

| Item | Standard | Before | Now |
|---|---|---|---|
| Ball-by-ball commentary in sentences | Cricinfo | Generic timeline ("Kohli works it for 2") under the scorecard | ✅ **Commentary tab**: Cricinfo-style sentences from the captured detail |
| End-of-over summary (runs, score, CRR / RRR, batters, bowler figs) | Cricinfo | ❌ | ✅ Every over block |
| Running score after every ball | Cricinfo | ❌ | ✅ |
| Time of each ball / minutes batted (Statsguru M) | Cricinfo / Statsguru | ❌ (no time stamp on balls) | ✅ The device stamps each ball (`payload.at`). Times show in the commentary; minutes show in Stats → Batting (only when every ball is stamped) |
| Milestones, new batter, end of powerplay, rain / rule notes in place | Cricinfo | Partly (timeline) | ✅ Placed in the right over |
| Wagon wheel + shot type | CricHeroes | ✅ SD-133 | ✅ Now also in the commentary ("pulled to deep mid-wicket"), plus a team wheel and a shot-type table |
| Pitch map (line & length) | Hawk-Eye / Cricinfo | ❌ | ✅ Optional: 6 lengths × 5 lines; grid + length mix |
| Bowler type, batting vs pace / spin | CricViz / CricHeroes | ❌ (profile had only the arm) | ✅ Optional chip once per bowler, free from the new profile field; career SR / Avg vs pace and spin |
| Ball speed | Broadcast (radar) | ❌ | ✅ Optional manual km/h (speed gun); fastest and average speed |
| Control / false-shot % | CricViz | ❌ | ✅ Optional Beaten / Edged / Mistimed tag; control %, false shots induced % |
| Dismissal detail (fielder) | Cricinfo | ✅ | ✅ Plus an optional catch position (wagon-wheel field → "caught at long-on") |
| Partnerships, fall of wickets, extras breakdown | Cricinfo | ✅ | ✅ (best partnership and extras also in Compare) |
| Manhattan / worm | Cricinfo | Manhattan per innings only | ✅ Worm and Manhattan for **both** innings with wickets marked |
| Phase splits (powerplay / middle / death) | CricViz | ❌ | ✅ Team compare by phase, a phase table, bowler economy by phase |
| Dot-ball %, boundary %, scoring-shot %, balls per boundary | CricViz | ❌ | ✅ Team and per batter |
| Bowling economy by phase, dots %, boundaries conceded | CricViz | ❌ | ✅ Per bowler |
| Batter vs bowler matchups | CricViz | ❌ | ✅ |
| Fielding: catches, drops, run outs, misfields | Cricinfo / CricViz | ✅ (#20) | ✅ Also in Compare |
| Match summary card (top 3 bat / bowl per innings) | Cricinfo | ❌ | ✅ Summary tab, live and final |

**Out of scope** (needs tracking technology or a dedicated analyst):
- Ball-tracking metrics: release point, swing / seam in degrees, bounce height, beehive, predicted path / impact for LBW, interception point.
- Radar speeds without a speed gun (manual entry is offered instead).
- Fielder GPS / distance run, DRS / UltraEdge.
- CricViz model figures (xRuns, xWickets, WinViz) and CricViz-grade control %, which needs an analyst on every ball. Ours is a scorer's tag.

## 2. What was built

**Capture: "Stats to track".** These are optional toggles, all off by default. They sit in Match rules as one chip row and in the format editor. The match is event-mode, so a change applies from the next ball.

- **Toggles** (rules.ts, `TRACK_KEYS`):
  - **Pitch map (line & length)**
  - **Shot control (beaten / edged)**
  - **Ball speed (speed gun)**
  - **Bowler type (pace / spin)**
  - The existing **Wagon wheel** now sits in the same group.
  - Rules keys exist only when a toggle is on, so older states keep their exact shape.
- **BallDetailPanel.tsx** shows under the pad after a delivery, only for what was tracked on that ball (`BallRec.trk`). It offers:
  - length and line chips;
  - Beaten / Edged / Mistimed (not on a wide);
  - a km/h field;
  - "Where was the catch taken?" (wagon wheel on + a catch).

  A tap on an active chip clears it. Skip, Done or the next ball closes the panel. It sends `BALL_DETAIL` (v:2, score-neutral, allowed after the end, routed into a live Super Over), keyed by innings + side + delivery ordinal, with the stamp as a drift guard.
- **Bowler type** (`BowlTypeChips`): one row under "Bowling: X", shown once per bowler: Fast / Medium / Finger spin / Wrist spin + Left-arm. It sends `SET_BOWL_TYPE` (v:2).
  - The new profile field **Bowling type** (sportProfileFields.ts) rides **free** on the bowler pick as `SET_BOWLER.btype`. It never overwrites a type already set and is never carried on a refused pick.
  - Codes are the ESPNcricinfo set: RF RM OB LB LF LM SLA LWS (detail.ts).
- **Time stamps**: ScoringControls stamps ball actions with `payload.at` (device ms). The reducer ignores the key; `BallRec.t` carries it.

**Commentary** (commentary.ts + CommentaryView.tsx, the **Commentary** tab).
- Derived from the replayed ball log + the timeline + shots + detail, so corrections show at once.
- Sentences, outcome tones, the wicket line and the end-of-over block (runs, wickets, maiden, score, CRR, the chase "Need N from B · RRR", the batters and bowler figures).
- Notes: openers, new batters, fifties and hundreds, 50 / 100 / 150 / 200 partnerships, five-fors, the end of the powerplay. Timeline moments (rain, rules, subs, keeper, penalties, innings closed) sit in their place.
- Innings duration when stamped. The latest Super Over round gets its own section.
- Filters: All / Wickets / 4s & 6s / Overs. Pages of 6 overs.
- Every older log's records are matched to their timeline entries (tested on all 10 frozen logs).

**Stats** (matchStats.ts + MatchStatsView.tsx, the **Stats** tab).
- **Compare**: team vs team with bars and an All / Powerplay / Middle / Death filter. Sections:
  - Batting: runs, overs, RR, wickets lost, 4s, 6s, boundary %, dot %, scoring-shot %, balls per boundary, best partnership, best over.
  - Bowling: economy, wickets, dots, maidens, how the wickets fell (c / b / lbw / ro / st), extras, wides, no-balls.
  - Fielding.
  - Tracked only: Shot control, Pace (speed gun), Pace vs spin.
- **Batting**: R, B, SR, dot %, boundary %, plus 4s / 6s / dots / control / vs pace / vs spin / minutes.
- **Bowling**: O, R, W, Econ, dot %, plus type, maidens, 4s / 6s conceded, wd / nb, economy per phase, false shots induced, speed.
- **Phases**, **Matchups**, and **Graphs** (worm + Manhattan, both innings, react-native-svg).
- **Pitch map**: a grid from behind the bowler, a per-bowler filter, a wicket marker and the length mix.
- **Shots**: the team wagon wheel and a shot-type table.

**Summary.** A Cricinfo summary card (each innings: total, top 3 batters, the opposition's top 3 bowlers) in the live and final Summary.

**Careers** (scorecard.ts `deepTotals`, stats.ts). The new keys are written ONLY for a match that captured the data, so older totals are byte-identical:
- `bPace rPace oPace bSpin rSpin oSpin`: every batter, once any bowler is typed;
- `ctlBalls falseShots`: batters, and `ctlBowled fsInduced`: bowlers (control tracked);
- `kphN kphSum kphMax` (bowlers with clocked balls).

New career rows, hidden unless a line carries them, with a coverage note "x of y innings":
- **Batting**: SR vs pace, SR vs spin, Avg vs pace, Avg vs spin, Control %.
- **Bowling**: False shots induced %, Fastest ball (km/h), Average speed (km/h).

Leader labels are ready for "Fastest ball" and "Best control %".

**Other files**:
- undo.ts names the new actions ("ball detail", "bowler type").
- The snapshot also drops `detail`, which can be up to one record a ball. Replay rebuilds it.

**Tests.** `tests/cricket-deep-wave.test.mts` (37 tests, including all 10 frozen legacy logs and every v:2 ball path). Full suite green; `tsc --noEmit` clean.

## 3. Decisions taken (recommended option chosen where unsure)

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

## 4. Open questions for the founder

> **Answered (2026-10-22).** The founder answered every question below. Round 2 builds the answers: see [cricket-round2.md](cricket-round2.md). Hindi / regional commentary is not wanted for now.

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

## 5. Follow-ups not built

- **Wider views**: tournament and season aggregates of phases / matchups / pace-vs-spin; pitch map per batter; a run-rate graph alongside the worm.
- **Earlier Super Over rounds**: only the latest round's commentary is kept (an earlier round's state is replaced).
- **Rain revisions**: after a DLS / manual revision, over summaries in the chase leave out "Need N from B" (the target at that moment isn't kept per ball).
- **Voice scoring**: voice-scored balls carry no time stamp (the shared voice panel would need to stamp them), so those innings show no minutes.
- **Edited balls**: detail (like wagon-wheel tags) can drift after "Edit a past ball" shifts deliveries. Records whose stamp no longer matches are hidden, not mis-shown.
- **Other surfaces**: commentary on the public website match page and the OBS overlay.
