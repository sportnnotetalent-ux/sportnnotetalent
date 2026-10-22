# Deep wave: the racket family

Founder ask (2026-10-22): capture ATP "Match Stats"-level depth, let users choose which stats they track, and give a point-by-point commentary, match summary and stats, for every sport. Tennis was done first (SD-157 / SD-158, in the synced base). This file covers the rest of the racket family: **badminton, table tennis, squash, padel and pickleball** (SD-159's scope). It reuses the tennis model — `pd.wing` / `pd.shot`, per-point annotations through POINT_DETAIL, "Stats to track", the serveStats replay trace, the commentary blocks — instead of inventing parallel ones.

Standard sources:
- **Badminton (BWF):** BWF Tournament Software live scores (rally by rally, server, interval at 11), BWF TV match stats (total points, points on serve / receive, most consecutive points, game points, longest rally, smash winners / net winners / errors where analysed), BWF Laws 9 (service faults) and 16 (intervals, misconduct).
- **Table tennis (ITTF / WTT):** WTT match centre (points won on serve / receive, biggest lead, max streak, timeouts, point-by-point by game), the coaches' three-phase analysis (serve & 3rd ball, receive & 4th ball, rally), ITTF 2.6 (service), 2.13 (order), 2.15 (change of ends).
- **Squash (PSA / WSF):** PSA SquashTV match stats (winners, errors, strokes, lets, no lets per player, points on serve / receive), WSF Rules of Singles Squash (Rule 5 service faults, Rule 7 between games, Rule 8 lets and strokes), English (hand-out) scoring.
- **Padel (Premier Padel / FIP):** Premier Padel match stats (points / break points / golden points won, service games, winners, unforced errors, smashes incl. por tres / por cuatro, net points), FIP Rules (golden point, Star Point 2026, change ends).
- **Pickleball (PPA / USA Pickleball):** PPA match stats (side-out %, points per serve, 3rd-shot drop / drive, kitchen arrival, winners / errors incl. Erne / ATP), USA Pickleball rulebook (side-out and rally scoring, the score call, non-volley-zone faults).

Rules followed (founder):
- Default scoring stays one tap per rally. All new depth is optional, off by default, in ⚙️ Scoring settings → **Stats to track** (event mode: from the next rally; before the first rally it sets the match format; the same toggles are advanced format fields so an organiser can switch them on for a whole tournament).
- Old logs replay identically. SD-107 stroke ids are normalised on read, never rewritten.
- A stat that wasn't tracked is hidden, never a false 0. Stat lines are absolute statTotals keyed by player id; the scorer marks a side for net / kitchen, rally length and 3rd shot, so those are the side's figures (doubles: both players).

## 1. Gap audit (before this wave)

Already DONE before this wave for all five: SD-19 (absolute record keys), SD-20 (line score), SD-21 (point editor), SD-22 (serve / receive replay: points on serve and receive, side-outs, service turns, holds / breaks / golden points for padel, game / match points, streaks, biggest lead), SD-52 / SD-107 (an optional "how was it won" tag with a few winner strokes and error types), SD-53 / SD-54 (conduct, timeouts, durations), SD-62 / SD-74 / SD-06 / SD-135 (servers by name), SD-63 / SD-135 (squash Let / Stroke / No let), SD-64 (Star Point), SD-117c / SD-135 (change-ends and interval cues), padel 1st / 2nd serve (SD-135).

| Sport | Standard item | Before | Now |
|---|---|---|---|
| All | Choose which stats to track | One inline "Point detail On/Off" (+ padel 1st / 2nd serve) | ✅ "Stats to track" per sport (settings card, "Extra stats: Choose" chips, advanced format fields) |
| All | Winners / UE / FE by **forehand / backhand** | ❌ (TT only had "FH / BH winner" ids) | ✅ wing on winners and both errors |
| All | Winners / errors by **shot type** (broadcast shot lists) | A few winner strokes; errors had no shot | ✅ the sport's full list on winners, unforced and forced errors |
| All | Errors by type (net / out / tin / kitchen …) with the shot | Type only, no shot | ✅ type kept beside wing + shot |
| BD / TT / SQ / PB | Service faults by type (BWF above 1.15 m, ITTF illegal serve, WSF short serve, kitchen) | One "Service fault" chip | ✅ optional fault type |
| All | Rally length (BWF / PSA "rally length", WTT phases) | ❌ | ✅ optional, sport buckets; on serve / on receive |
| TT | Three-phase analysis (serve & 3rd ball, receive & 4th ball, rally) | ❌ | ✅ from the rally-length buckets 1–2 / 3–4 / 5+ |
| PD | Net points won | ❌ (tennis only) | ✅ optional, as tennis |
| PB | Kitchen-line (NVZ) rallies, 3rd-shot drop / drive / lob and their success | ❌ | ✅ optional |
| PB | Side-out %, points per service turn, serve to 2nd server | In the flat panel | ✅ Serve section of Key stats, named "Side-out %" |
| SQ | Lets per player, strokes, no lets (PSA) | Strokes / no lets as flat rows; lets not counted, not attributed | ✅ Referee decisions section; the Let button records who appealed |
| PD | Aces / golden / star points / breaks in a broadcast layout | Flat list | ✅ Key stats sections (Serve · Winners & errors · Points won · Games) |
| All | Point-by-point **commentary** grouped by game (padel: game of each set), running score server first, time, sentences, serve changes, cues | Flat rally / point log | ✅ commentary replaces the log |
| All | Match / game (set) filter + category tabs | Match / Game filter, one long list | ✅ tabs: Key stats, Serve, Shots, Rally length / phases, 3rd shot |
| All | Career rows / labels for the new figures | — | ✅ shot rows (hide at 0), Rally length / Rally phases, 3rd shot, net / kitchen |

Still missing (out of scope or follow-up, see §5–6): smash speed (BWF Hawk-Eye radar), shuttle / ball placement maps, rally duration in seconds (PSA), kitchen *arrival* % (needs a per-rally "nobody arrived" capture window), lets requested by player in careers.

## 2. What was built

### Shared model — `src/sports/pointDetail.ts` (owned)
- `RACKET_SHOTS`: each sport's shot list (ids shared where the shot is the same):
  - badminton: smash, drop, clear, net shot, net kill, drive, lift, push, serve
  - table tennis: receive, flick, push, chop, loop, block, smash, lob (the serve itself is Ace / Service fault)
  - squash: drive, drop, boast, volley, lob, kill, nick
  - padel: return, volley, bandeja, víbora, smash, smash out (por tres / por cuatro), lob, chiquita, bajada, off the glass, drop
  - pickleball: return, drive, (third-shot) drop, dink, volley, reset, lob, overhead, Erne, ATP
- Every sport's Winner / Forced error / Unforced error now `wingShot`. The SD-107 winner stroke ids (smash, netKill, push, loop, flick, fh, bh, nick, x3, bandeja, dink, atp …) **are** the new shot / wing ids, so `shotOf(sport, pd)` normalises them on read and their career keys carry on (winnersSmash, winnersFh, winnersNetKill …). Never rewritten.
- An unforced error keeps its type in `pd.stroke` (into the net, out, tin, kitchen, foot fault) beside wing + shot (`errTypeOf`); a service fault may carry its type (new keys `sfHigh`, `sfFoot`, `sfNet`, `sfOut`, `sfFault`, `sfIllegal`, `sfShort`, `sfKitchen`).
- Rally length per sport (`rallyBucketsOf`): tennis / padel / pickleball 0–4 · 5–8 · 9+; badminton 0–4 · 5–10 · 11+; table tennis 1–2 · 3–4 · 5+ (the phases); squash 0–5 · 6–15 · 16+. Career key stems `rallyKey` (rl04, rl510, rl12 …), labels shared with tennis where the key is shared.
- `NET_WORDS`: tennis / padel net points (`netPts` / `netPtsWon`), pickleball kitchen line (`kitchenPts` / `kitchenWon`); `third` (pickleball 3rd shot: drop / drive / lob) as a new per-point annotation; new flag `thirdDetail`.
- `applyPointDetail(events, payload, sport)` validates shots and buckets per sport (no sport = tennis, so the tennis engine is unchanged). `pdText(pd, names, sport)` reads the sport's words ("Unforced error (forehand drive, into the net)"); without a sport the tennis text is unchanged and another sport's shot reads by its generic name.
- `rallyEdit.ts`: `third` rides on PointInput; side-out rally rows now keep their net / rally length / 3rd-shot marks through EDIT_LOG.

### Settings — `src/sports/pointDetailSettings.ts`
- `trackFields(sport)`: badminton / TT / squash: Point detail, Rally length; padel: Point detail, 1st / 2nd serve, Net points, Rally length; pickleball: Point detail, Kitchen line, Rally length, 3rd shot. Tennis unchanged.
- `trackFormatFields(sport)`: the same toggles as advanced format fields (organiser default per format).

### Capture — `src/sports/PointDetailRow.tsx` (rewritten, same name and props)
Tennis-style progressive card under the point buttons: "📊 Extra stats: … Choose", "Last point · X", How (filtered by who served) → Forehand / Backhand → the sport's shots → **Error:** / **Fault:** type → **By:** (doubles) → 2nd serve (padel) → At the net / kitchen line → Rally → 3rd shot. Every tap is a POINT_DETAIL; Skip leaves the rally undescribed. `RallyPointEditor` offers the same wing / shot chips for corrections.

### Match stats — `src/sports/racketMatchStats.ts` (pure) + `MatchStatsPanel.tsx` (rewritten)
- `racketView` replays once (serveStats trace + inputs + Let records) with coverage {detail full / quick, serve, net, rally, third}.
- Key stats sections: **Serve** (aces where the sport has them, double faults, padel 1st / 2nd serve, service winners, service faults; points won on serve / receive, or side-out %, side-outs / hand-outs, service turns, points per turn, serve to 2nd server), **Winners & errors**, **Referee decisions** (squash: lets asked by side, strokes won, no lets), **Points won** (padel break points; net / kitchen; total; streaks; biggest lead), **Games** (padel holds / breaks / BP / golden / star / set points) or **Game & match points**.
- Tabs: Serve (the SD-22 rows + by-server lines), Shots (How × wing selectors → per-shot rows; stroke summary FH / BH × W / UE / FE; errors and service faults by type), Rally length (per bucket; on serve / on receive) — table tennis **Rally phases** with the three-phase analysis — and pickleball **3rd shot** (use % and rallies won after each).
- `racketCareerKeys` / `racketExtraKeys`: rl…Pts / rl…Won per bucket, TT serve3Pts / serve3Won / receive4Pts / receive4Won, padel netPts / netPtsWon, pickleball kitchenPts / kitchenWon and thirdDrop / thirdDropWon / thirdDrive / … — written by `statTotals` (racketTotals.ts `withRacketExtras`) only when tracked.

### Commentary — `src/sports/racketCommentaryModel.ts` (pure) + `RacketCommentary.tsx` + shared `CommentaryFeed.tsx`
- Blocks per game newest first ("Game 2"; padel "Set 1 · Game 4", "Set 2 · Tiebreak", "Set 3 · Match tiebreak"), the game in play on top.
- Game rows: "X wins game 2 · 21-19 · Games level 1-1" / "Game and match"; padel "X wins the game · 3-1 · Break of serve / Game and set · Set 1 / Game, set and match".
- Rally rows: "Point to X" (side-out scoring "Rally to X" when it won only the serve), match time, sentence ("Axelsen wins the point with a Forehand Smash Winner", "Ma Long loses the point with a Backhand Push Unforced Error (into the net)", "Stroke to Ashour", "No let to Farag — point to Ashour"), and the score **as the official calls it after the rally, next server first** ("12-10"; side-out doubles "4-2-1"; padel "30 - 15" / "Game"). Meta line: the serve change in each sport's words (Service over, Change of service, Hand-out, Side out, Second server), golden / star point, 2nd serve, rally length (TT phase), net / kitchen line, 3rd shot.
- Conduct, timeouts and squash lets ("Appeal by Farag · rally replayed") inline; interval / change-ends cues after the rally due; "X serves first" (padel "X is serving game N").
- `CommentaryFeed.tsx` is the tennis renderer made generic (icon, empty text); `tennis/Commentary.tsx` now delegates to it — identical output.

### Per sport wiring
- `badminton/index.tsx`, `padel/index.tsx`, `rallyCore.tsx` (TT, squash, pickleball): the Score tab is Games/Sets → Match stats → Box score → **Commentary** (replaces the rally / point log); format fields gain the "Stats to track" toggles; liveSettings comment updated.
- Squash: the single Let button became **🔁 Let · X asked** per side (still one tap, still no point) so lets can be counted per player.
- Engines: `badminton/engine.ts`, `padel/engine.ts`, `rallyEngine.ts` pass their sport to `applyPointDetail` and declare the new optional flags.
- Schema (`rallyStats.ts`): wing / shot / error-type / fault-type keys with labels identical across sports (shared keys read the same as tennis'), `racketDepthStats` (rally length, TT phases, net / kitchen, 3rd shot + rates) and `racketDepthSections` (Rally length / Rally phases, 3rd shot); Shot making shows wing / shot rows once a player has one.

## 3. Decisions taken (recommended option chosen)

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

## 4. Open questions for the founder

1. **Badminton shot list.** Is smash / drop / clear / net shot / net kill / drive / lift / push / serve the right school-level set, or add "jump smash" and "block"?
2. **Rally buckets.** Are badminton 0–4 / 5–10 / 11+ and squash 0–5 / 6–15 / 16+ right for school matches, or should they be organiser options?
3. **Leaders.** Should any new figure become a leaderboard / award: padel net points won %, pickleball 3rd-shot drop success %, table tennis serve & 3rd-ball won % (each with a minimum)?
4. **Squash lets in careers.** PSA shows lets per match only; should careers carry "lets asked" too?
5. **Pickleball kitchen arrival %.** Worth a "nobody got there" chip so arrival % can be computed?
6. **Commentary on the Summary tab / share image** (needs a shared-screen change).
7. **Hindi / regional-language commentary** later?

## 5. Follow-ups not built

- Voice for the new optional entries (shot, wing, rally length, 3rd shot).
- Dead code after this wave: `gameLabels.ts` `setSportGameLabels` (padel's old log labels; still tested) and `CueBanner.tsx` `useCueTimeline` (no plugin uses the cue timeline any more) — remove with their tests in a cleanup pass.
- Team-page / season aggregates of the new team figures (side-out %, kitchen-line %, phases).
- Doubles: name who hit the 3rd shot / who was at the kitchen (per player instead of per side).
- Tournament-level "Stats to track" defaults in the tournament form's basics (today: per format, advanced fields).

## 6. Out of scope (tracking tech or extra spotters)

- Smash / serve speed (BWF radar, Hawk-Eye), shuttle / ball placement and heat maps, rally duration in seconds, shot-by-shot sequences, reaction times.

## 7. Tests

- `tests/racket-deep-wave.test.mts` (22): the model (shot lists, legacy normalisation, credits, keys, words, per-sport validation), Decision 8 for all five sports (old logs, an EDIT_LOG of the same list, an SD-107 detail match), "Stats to track" (fields, event mode, format), match stats (badminton key stats / shots / types / rally length, TT phases, squash referee decisions, pickleball side-out + kitchen + 3rd shot with doubles side keys, padel aces / net / golden / 1st serve), the SD-19 contract harness, EDIT_LOG keeping the marks (side-out rallies too), schema declarations and career rows.
- `tests/racket-commentary.test.mts` (13): sentences for every how and sport; badminton (toss, umpire's call, Service over, interval at 11, deciding-game ends, game rows, correction); table tennis (change of service, deuce, ends at 5, timeout / conduct inline); squash (English hand-outs, lets with appeal names, stroke; PAR hand-out, 90 s); pickleball (side-out doubles call, Second server, kitchen / 3rd shot, EDIT_LOG); padel (server-first game score, golden point, break, change ends, tiebreak, doubles server by slot).
- Pins updated with a reason: `tests/point-detail.test.mts` (badminton's card adds Rally length) and `tests/tennis-match-stats.test.mts` (its last line pins **padel's** card, which now adds Net points and Rally length). No tennis behaviour changed.

## Shared-file edits

- `src/sports/liveEvents.ts`: optional `third` on LiveEvent (additive).
- `src/sports/RallyPointEditor.tsx` (shared with volleyball): the detail chips for non-tennis racket sports (wing + the sport's shots, error type kept); `pdText` gets the sport. Tennis and volleyball paths unchanged.
- `src/sports/tennis/Commentary.tsx`: renders through the shared `CommentaryFeed` (identical output).
- `website/guides/racket-conduct-and-timeouts.md`: the squash Let buttons.
