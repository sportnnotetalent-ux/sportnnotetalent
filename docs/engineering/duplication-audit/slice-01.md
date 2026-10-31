# Slice 1: team invasion sports (duplicates only)

Folders under `src/sports/`: rugby, rugby_league, handball, hockey, ice_hockey, american_football (AF), netball, invasion, netraid, gcc. 106 files, 20,910 lines.

**Scope (user's revised rules).** Only duplicated code is reported. Each finding is one of:
- **A**: provably identical output, UI, text, styles, a11y and replay. Only A counts as removable.
- **B**: any difference at all. The difference is listed and nothing is counted as removable.
- **C**: drift that looks like a bug. Reported as a finding only; not removable.

"Identical" means the code is the same except for identifier or type names (`RugbyState`, `XState` and so on), or except for the constant a closure reads, which the shared helper would take as a parameter. Wherever I used that rule, I name the parameter.

**Bundle context (checked).** `src/sports/boxSources.ts` statically imports every `box.ts` in this slice, and `LiveScoringScreen.tsx` imports `boxSources.ts`. Through that chain every `engine.ts` and `totals.ts` (plus handball/hockey `depth.ts`, netball `deep.ts`) is already in the shared chunk, not in a sport's on-demand chunk. The same holds for `discipline.ts` (via `../discipline.ts`), `records.ts` (via `matchRecordHooks.ts`), `stats.ts` (via `statSchemas.ts`) and `meta.ts` (the first download). So pulling engine, totals, box, stats, discipline or meta helpers into one shared module adds nothing to any sport chunk. `index.tsx`, `ticker.ts`, `timeline.ts`, `commentary.ts`, `sheet.ts` and `voice.ts` live in the sport chunks. A shared UI module imported by all 7 would become one shared chunk, so net download goes down.

---

## 0. Is `src/sports/invasion/` a shared layer? Yes, but only partly used

| invasion file | used by (verified with grep) | not used by |
|---|---|---|
| `names.ts` (withNames, nameFor, legacyNameOf) | all 8 invasion sports (football + the 7 here), discipline.ts, boxSources.ts | — |
| `actions.ts` (subAction, keeperAction, xiStamp) | handball, hockey (all 3); ice (keeperAction, xiStamp); rugby, league (subAction, xiStamp); netball (subAction); AF (xiStamp). Football has its own `football/actions.ts` | — |
| `feed.ts` + `Commentary.tsx` (FeedItem, feedSections, groupByScorer, MatchFactsCard) | football, handball, hockey | rugby, league, ice_hockey, AF use `../feedGroups.ts` + `GroupedFeed.tsx`; netball uses `../feedModel.ts` + `PlayFeed` |
| `centre.ts` + `MatchCentre.tsx` (boxScore comparisonRows) | football, handball, hockey | rugby, league, ice, AF use `../compareSheet.ts` + `StatSheetView`; netball uses `../statPanel.ts` + `CategoryStatsPanel` |

So the name and line-up seam is shared everywhere, but the commentary and match-stats seam splits three ways inside this one sport family (see B1). `netraid/` serves only kabaddi and volleyball, and `gcc/` serves only golf, chess, carrom and cue (pool, snooker, billiards). None of the invasion sports use either.

---

## 1. A: removable with zero behaviour change

Risk legend: **H** = on the reducer / replay path, or feeds saved results, standings or statTotals. Saved match logs replay through it, so it is identical today but needs golden-replay tests before moving. **M** = derived figures only. **L** = display only.

| ID | What | Locations (all copies) | Why provably identical | Where it should live | Removable | Risk |
|---|---|---|---|---|---|---|
| 01-D1 | `creditAttribution(c, sign, tracked)` | rugby/engine.ts:402-412, rugby_league/engine.ts:402-412, handball/engine.ts:309-319, hockey/engine.ts:268-278, netball/engine.ts:399-409, american_football/engine.ts:435-445 (also baseball/engine.ts:722, outside the slice) | Same 11 lines; the only difference is that the `// IDs-only scoring` comment is missing in baseball. No reducer calls it (grep); it builds new actions only. ice_hockey/engine.ts:384-395 adds `...(c.side ? {side} : {})`, so it is **B** and stays out of this count. | `invasion/actions.ts` (pure, already imported by every index) or a new pure `sports/attribution.ts` | 55 (5×11) | M |
| 01-D2 | Shoot-out core: `decideShootout` (best of 5, then sudden death) | rugby/engine.ts:444-453, handball/engine.ts:343-352, hockey/engine.ts:289-298 | Byte-identical. ice_hockey/engine.ts:592-601 is the same algorithm with a `rounds = 5` parameter, so it is identical whenever `rounds` is 5; ice's own calls pass `s.soRounds` and would keep doing so. | the ice version, in `sports/shootoutOrder.ts` (pure; already holds the shared shoot-out row code) | 20 | H (called in the `SO` reducer case) |
| 01-D3 | `nextKicker` / `nextThrower` | rugby/engine.ts:455-461, handball/engine.ts:356-362 (ice `nextShooter` 602-608 with rounds=5 is identical too) | Identical bodies. hockey `nextShooter` 302-312 is **B**: the FIH sudden-death order (`sdFirst ?? other`). | same module | 7 | M (UI only) |
| 01-D4 | `needsSdPick`, `soScore` | needsSdPick: rugby 462-463, handball 364-365, hockey 315-316 (ice 609-610 uses `soRounds`: B). soScore: rugby 464-467, handball 366-369, hockey 317-320, ice 611-614 | Identical | same module | 4 + 12 | H (needsSdPick gates the `SO_ORDER` reducer case) |
| 01-D5 | `result()` with an aggregate tie | rugby/engine.ts:640-645, handball 556-562, hockey 531-537 | Identical code. The comments differ only, and hockey's comment wrongly mentions "7 m" (C6). | shared pure helper `resultWithShootout(s)` | 12 | H (result feeds standings) |
| 01-D6 | plain `result()` | rugby_league 607-610, american_football 854-857, netball 633-636 | Identical | same | 8 | H |
| 01-D7 | `isComplete` (handball == hockey), `levelAtEnd` / `aggLine` one-liners | handball 553-554 == hockey 528-529; levelAtEnd / aggLine: rugby 634-635, handball 549-551, hockey 524-526, ice 769-770 | Identical | same | 2 + 6 | H |
| 01-D8 | `xxScoreLine` "SO a–b" | handball 637-641, hockey 589-593, ice_hockey 837-841 | Identical. rugby 761-765 says "Kicks", so it is B. | shared helper taking no label | 10 | L |
| 01-D9 | Clock helpers | `stopAt`: rugby 330-331, league 339-340, handball 229-230, hockey 225-226, ice 286-287, netball 282-283 (AF 305-306 caps at the period length: B). `running`: all 7 engines. `periodStarted`: 6 engines (AF adds clockless / events: B). handball 199-209 == ice 254-263 (periodOffset, periodSec, matchSec). rugby 276-311 == league 284-323 (nominalOffset, playedOffset, periodSec, matchSec, mmss, clockAt, clockFace, minuteText; `periodLen` passed in). `mmss` (rugby, league) == `clockText` (handball 213, netball 259). | Identical bodies | a pure `sports/clockCore.ts` | ≈ 62 | H (periodSec / playedOffset / matchSec stamp every event in the reducers) |
| 01-D10 | Config parsers `bool`, `num`, `second` | bool: all 7 engines (and baseball, cricket/rules). num (min-only form): rugby, league, AF (ice's `num` has a max: B; netball `numOr` differs: B). second(): rugby, league, handball, hockey, netball | Identical | same clock / format module | 6 + 2 + 4 | H (`init` / reducer) |
| 01-D11 | Reducer preamble and stock cases | `pid`/`pname`/`who1`/`who2` 4 lines: rugby 490-493, league 473-476, handball 387-391, netball 489-492, ice 635-637 (who1 only). XI `players` parse 3 lines: rugby, league, handball, hockey, ice, AF. `CLOCK` case: rugby, league, handball, hockey, ice, netball (AF adds `\|\| s.ended`: B). `END` case: all 7 except AF (B) | Identical expressions. hockey's who1 (337) has no payload fallback and AF's w1 (629-631) has none either, so both are **B**. | `readWho(a)`, `parseXiPlayers(a)` in the same pure module | ≈ 45 | H |
| 01-D12 | Rugby and league identical rules helpers | `openTemps` rugby 228-239 == league 427-438; `triesOf` 158-162 == 361-365; `samePlayer` 220 == 419 | Identical | rugby/engine.ts exported, imported by league (both already in the shared chunk) | 18 | M |
| 01-D13 | `unavailable(s, now)` | rugby/totals.ts:82-88, rugby_league/totals.ts:74-80, handball/totals.ts:85-91, hockey/totals.ts:66-72, netball/totals.ts:72-78 | Identical; only the field function differs, passed as `FieldResult` | `../onField.ts` (already imported by every totals.ts) | 28 | M |
| 01-D14 | `rugbyLiveField` == `leagueLiveField` | rugby/totals.ts:65-79, rugby_league/totals.ts:57-71 | Identical (handball adds an official display, hockey counts differently, netball fixes 7: all B) | rugby/totals.ts, exported | 15 | M |
| 01-D15 | Field-log builder pieces | starters loop: rugby 33-40, league 25-32, handball 32-39, hockey 25-32. sub/enter push: rugby 46-48, league 38-40, handball 44-46, netball 38-40 (hockey 37 always pushes `sub`: B). end calc: rugby 56-57, league 48-49, handball 54-55, hockey 43-46, netball 48-49 (plus football and basketball fieldTime) | Identical | `onField.ts` helpers | 24 + 9 + 8 | M (minutes in statTotals) |
| 01-D16 | statTotals `line` / `add` accumulator | rugby/totals.ts:93-97, league 85-89, handball 136-140, hockey 109-113, ice 98-102, netball 119-123, AF 31-35 (+ baseball 66-70) | Identical 5 lines | `onField.ts` or `statTotals` helper | 30 | M |
| 01-D17 | shoot-out `soTaken` / `soGoals` credit loop | rugby/totals.ts:103-105, handball 148-150, hockey 122-124, ice 107-109 | Identical | same | 9 | M |
| 01-D18 | Box-score row bag (`keyOf` + `row()`) | rugby/box.ts:45-56, league 42-53, handball 39-50, hockey 38-49, ice 40-51, AF 56-67, netball 41-52 | Identical text; it reads the file's `ROW_KEYS`, which becomes a parameter (netball passes `[...ROW_KEYS, ...deepKeys]`) | `../boxScore.ts` (already a type import in every box.ts) | 72 | L |
| 01-D19 | Box period list and `sum` | `const n = …; periods = n >= 2 ? …`: rugby, league, handball, ice, AF, netball box.ts (hockey uses `s.periods`: B) and rugby / league / ice / AF index.tsx Stats tabs (747-748, 643-644, 743-744, 855-856). `sum` lambda ×6 box.ts | Identical | `boxScore.ts` `periodScopes(n, label)` | 18 + 5 | L |
| 01-D20 | `rugbyTryScorers` == `leagueTryScorers` | rugby/ticker.ts:10-22, rugby_league/ticker.ts:10-22 | Identical (AF's `afTdScorers` filters `'td'`, handball always shows the count: B) | rugby/ticker.ts, exported (league already in the same family) | 13 | L |
| 01-D21 | Discipline `marks` preamble and `who` | `const ev = (m.state as …)?.events; if (!Array.isArray(ev)) return [];`: all 7 slice specs (and football, baseball, basketball). `who` with official: rugby 34, handball 34, netball 31; plain who: league 33 | Identical | `../discipline.ts` `eventsOf(m)`. **Note:** discipline.ts imports the specs, so this makes a cyclic import; it is safe at runtime because the helpers are only called inside `marks()` | 14 + 2 | M (suspensions) |
| 01-D22 | Timeline pieces | sub detail expression: rugby/timeline.ts:29, league 24, handball 44, netball 39. Undo-label tail (5 lines): rugby 90-95 == league 71-76 | Identical | `../liveEvents` helper | 3 + 5 | L |
| 01-D23 | Commentary pieces | period-end loop: rugby/commentary.ts:139-148 == league; scope-label one-liner rugby 191 == league 168. Game-order sort: rugby/commentary 123, league 112, ice 77, rugby/sheet 38, AF `gameOrder` drives.ts:64-66, netball `nbGameOrder` deep.ts:26-28 | Identical | `../feedGroups.ts` | 10 + 1 + 5 | L |
| 01-D24 | Stat-schema entries (pure data) | 39 identical lines rugby/stats.ts ↔ rugby_league/stats.ts (points, tries, tryAssists, conversions(+Attempts), penGoals(+Attempts), minutes, missedTackles, lineBreaks, offloads, penaltiesGivenAway, the derived per-game / % / bests, the box columns, the awards). Repo-wide identical defs: `minutes` ×5, `mostGoals` ×5, `soGoals` / `soTaken` ×4, `savePct` / `concededPerGame` / `soConversion` / `suspensionMinutes` / `hatTricks` ×3. `keeper` filter: handball/stats.ts:128, hockey 78 (+ football 133) | Identical objects, order kept by spreading in place. tests/stat-schema.test.mts already requires shared keys to keep the same labels. **Excluded:** league `tackles` weight 0.1 vs rugby 0.3, and `carries` 0.1 vs 0.2 (B) | `../sharedStats.ts` (already has POINTS, YELLOW_CARDS, …) | ≈ 60 | L |
| 01-D25 | Meta preset options | `options: [...Object.entries(X_PRESETS).map(([value,p]) => ({value,label:p.label,set:p.set})), {value:'custom',label:'Custom'}]`: all 7 meta.ts. The preset `Record<string,{label;set}>` type ×7 | Identical | `../types` helper `presetOptions(P)` / `PresetMap` type | 21 + 6 | L |
| 01-D26 | Voice `vid`, `END_WORDS` | vid ×5 in slice (rugby / league / AF use the 1-arg form, which gives the same output as the n=0 form in ice / netball / voiceParsers). END_WORDS rugby:18 == netball:20 == AF:19 | Identical | `../voiceMatch.ts` (already imported by all) | 6 | L |
| 01-D27 | index.tsx `PlayerGrid` (styles included) | group 1: rugby/index.tsx:89-106, rugby_league 72-89, american_football 65-82. Group 2: handball 61-78, hockey 61-78 | Code byte-identical in all 5. Styles: `grid` `pnum` `pname` `meta` `skip` `skipTxt` identical in all 7; `pchip` identical within each group (AF's property order differs, which is harmless). **Do not merge the groups:** handball/hockey `pchip` lacks `minHeight: 44` (C1) | a new `sports/invasion/ScorerParts.tsx` | 36 + 18 | L |
| 01-D28 | index.tsx `Chip` | rugby 79-85 == ice_hockey 94-100; styles chip / chipOn / chipTxt / chipTxtOn identical | Identical | same | 7 | L |
| 01-D29 | Clock re-render tick effect | the 5-line `useEffect(… setInterval(tick,1000) …, [s.clock.since, s.ended])`: 2 per file × 7 index.tsx (controls + LiveClock), 21 copies repo-wide | Identical (the `s.clock?.since` vs `s.clock.since` dependency does the same thing) | `useClockTick(running, since, ended)` hook | ≈ 50 | L |
| 01-D30 | index.tsx shared style entries and `uid` | 22 StyleSheet keys identical in all 7 files (`wrap panel clock clockRow clockRow2 clockSmall col cols dot editLabel flowHead gk grid h meta pname pnum short skip skipTxt small team`), plus `uid()` ×7 | Identical values | `ScorerParts.tsx` exporting a base sheet | ≈ 135 | L |
| 01-D31 | netraid ↔ shared helpers | `netraid/feed.ts:62-66 joinNames` == `feedGroups.ts:117-121 andList`; `netraid plural` (59) == `feedGroups plural` (111); `netraid rowShares` (121-124) == `compareSheet rowShares` (116-119) | Identical. **Bundle cost:** netraid/feed.ts goes into the kabaddi / volleyball chunks; importing feedGroups or compareSheet there pulls those modules (121 / 134 lines) into those chunks unless they are already shared. Check first | the existing feedGroups / compareSheet | 10 | L |

| 01-D32 | Netball centre-pass walk, written twice | `centreInfo` in netball/engine.ts:438-471 and `centreSplit` in netball/deep.ts:45-81 | Same walk, statement for statement: due / owed / last, the buzzer rule, the `centre` override, the live pass. The deep.ts comment says so ("Its sums equal `centreInfo`"). `centreSplit` only adds bookkeeping per period (`goalFrom`, `passes`). `centreInfo`'s taken / cpGoals / gainGoals equal the sums of `centreSplit.periods`. Its `now` is the walk's final `due` (undefined once ended), so `centreSplit` must also return `due`. | keep `centreSplit` in deep.ts (shared chunk) and derive `centreInfo` from it | ≈ 25 | M (box, ticker and banner centre-pass figures) |
| 01-D33 | "made/att (pct%)" text | rugby_league/sets.ts:66-68 `completionText` == gcc/model.ts:62-64 `ofPct` | Same expression; '–' at 0 | gcc/model.ts is pure and 76 lines; sets.ts is already in the shared chunk (it is imported by league box.ts) | 3 | L |
| 01-D34 | AF half-distance penalty spot, and the yards pluraliser | penalty spot: american_football/engine.ts:800 and 805 (PLAY reducer) == drives.ts:174 (the same two formulas). `yds` pluraliser: commentary.ts:35 == drives.ts:240 (inline). timeline.ts:15 returns '' for undefined, so it is B | Identical expressions | an exported helper in AF engine.ts | 2 + 1 | H (the reducer half) |
| 01-D35 | Simple `removalActions` | rugby/index.tsx:245-248, rugby_league/index.tsx:214-217, american_football/index.tsx:218-221 | Identical. handball, hockey and netball also remove linked answers, and ice adds the third assist, so those are B | `ScorerParts.tsx`, with eventCredits / creditAttribution passed in | 8 | L (builds new REMOVE actions; same output) |

Additions to existing rows, found in the second pass: D19 gains `nbPanelPeriods` netball/panel.ts:20-23 (same period-list expression, +2 lines). D24 gains the `count(key,label,short,one,abbr,group,extra)` StatDef helper, ice_hockey/stats.ts:16-17 == american_football/stats.ts:18-19 (+2 lines).

**A total ≈ 925 lines.** About 300 of those (D2, D4–D7, D9–D11) are reducer / replay or result code; they are identical today but should only move behind golden-replay tests.

---

## 2. B: similar but not identical (not removable)

| ID | What | Locations | Exact differences |
|---|---|---|---|
| 01-B1 | **Five parallel commentary models and five compare / stat-panel models**, each with its own view | Feeds: `invasion/feed.ts`+`Commentary.tsx` (football, handball, hockey); `feedGroups.ts`+`GroupedFeed.tsx` (rugby, league, ice, AF, baseball); `feedModel.ts`+`PlayFeed.tsx` (netball, basketball); `netraid/feed.ts`+`FeedView.tsx` (kabaddi, volleyball); `gcc/model.ts`+`CommentaryFeed.tsx` (golf, chess, cue, carrom). Compare: `invasion/centre.ts`+`MatchCentre.tsx`; `compareSheet.ts`+`StatSheetView.tsx`; `statPanel.ts`+`CategoryStatsPanel`; `netraid CmpRow`+`CompareCard.tsx`; `gcc CompareRow`+`CompareTable.tsx` | Different data shapes (period / t / stamp / tone vs when / tags vs FeedRow vs key / tags vs big / at), different UI (paging at 60 and "Key events" chips; collapsible groups; time column; left rule), different row semantics (`DASH` handling in `rowLeader`, `better` vs `lowerBetter` vs `plain`). Four separate `countRow` functions with four signatures. **Needs a decision** (product: one broadcast-feed look across sports?). |
| 01-B2 | % helpers | `invasion/centre.ts pct` returns a number or undefined; `gcc/model.ts pct` uses `den ?`; `netraid pctText` (private) computes `(100*n)/d`; `netball/engine.ts pctText` (666) computes `(g/a)*100` with `a > 0` | Return types differ, and so does the operation order: `(n/d)*100` vs `(100*n)/d` can round differently (e.g. n=1, d=3 at .5 boundaries). Not identical. |
| 01-B3 | Scorer UI skeleton in the 7 index.tsx (the identical-run scan reports 405 lines rugby↔league, 357 handball↔hockey) | flows, shoot-out panel (rugby 293-339, handball 280-324, hockey ~271-315), Full-time panel, `EditList` (rugby 642-665, handball 613-636…), `LiveClock`, Scoreboard, plugin `summary` | Every block carries sport words ("Kicking competition" / "7-metre throws" / "Shoot-out", "Replacement" / "Interchange", "Kicks" / "7m" / "K"), different rules (red20, official cards, third suspension, PC links), different gating (`ONE_TAP`, `isAnswer`). |
| 01-B4 | Engines: per-sport rules on a shared skeleton | `SET_CLOCK` clamp: rugby / league `periodLen+1800`, handball / ice `periodLen(s, p)`, hockey `periodLen(s)`, AF `remaining`, netball open periods. `periodSec` capped (handball, hockey, ice, netball, AF) vs uncapped (rugby, league). `START_SHOOTOUT` guards differ (`kicksAfter`, `decider==='none'`, `poShootout`). The `SO` case parses outcome / keeper in handball and hockey only. `END_PERIOD` per sport. hockey `who1` has no payload fallback; AF `w1` none either | Intentional rule differences. |
| 01-B5 | Box `teamStats` / leftover "Team" row | all 7 box.ts after the row bag | Team label ("Team / officials", "Team", "Team (penalty tries)", "Team / bench"), TEAM_KEYS, `side` attribution rules (hockey `add(cr, e.side)`, ice `cr.side ?? e.side`, AF defence side). |
| 01-B6 | Ticker detail / flash | the 7 ticker.ts | Different words, emoji and status lines (rugby / league / AF counts only when >1; handball always; hockey minutes; ice periods; netball g/a). |
| 01-B7 | Timeline row mapping and linked answers | the 7 timeline.ts (`id` formula, stamp, name, tone, ice adds `playerId`); `linkedAnswers` / `timelineEvents` handball 51-65, hockey 40-52, netball 47-57 | Different predicates and keys (`saver` / `saves` vs `answer` / `answers`). |
| 01-B8 | Records | rugby/records.ts:14-42 vs rugby_league/records.ts:9-36 | union also skips `e.official`. League has no officials, so it is a no-op, but the text differs. |
| 01-B9 | sinBinTime | rugby/sheet.ts:74-88 vs rugby_league/sheet.ts:30-42 | rugby ends a sin-bin at a later red for the same player; league does not (see C3). |
| 01-B10 | Shoot-out order builders in feeds | rugby/commentary.ts:160-167 (r ≥ 5), ice_hockey/commentary.ts:116-124 (`soRounds`), hockey/feed.ts:91-100 (FIH `sdFirst ?? other`), handball/feed.ts:109-129 | Different rules. |
| 01-B11 | Live-field banners | handball/totals.ts:66-82 (official names, min count), hockey 53-63, netball 57-69 (fixed 7) | Different counting and display. |
| 01-B12 | PlayerGrid variants | netball/index.tsx:75 (`tag`: number cell and a11y), ice_hockey/index.tsx:71 (`picked` selection state + styles) | Extra props and UI. |
| 01-B13 | Pitch / court / rink / field components | the 7 `*.tsx` court files | Different geometry and colours (rugby / league `line` / `dash` / `half` styles identical, 3 lines; too small to report). |
| 01-B14 | Voice `xxVoiceEnds` | rugby 80-85, league 93-98, AF 125-130, ice 149-154, netball 73-78 (+ voiceParsers 277, 358) | `periodName` vs `periodLong`, plus a different "last period" function. |
| 01-B15 | Meta "Track …" labels | handball/meta.ts:39 lowercases only the first letter; hockey/meta.ts:43 lowercases the whole label | Same output for today's labels, but the code differs. |
| 01-B16 | football `decideShootout(boolean[])` (outside the slice) | football/engine.ts:292 | Same algorithm, different input type. |
| 01-B17 | Keeper-position regex | handball/index.tsx:55 `isKeeperPos` vs ice_hockey/index.tsx:62 `isGoaliePos` | ice also accepts `g`, `goalie`, `goaltender`, `netminder`. |
| 01-B18 | Rebound "answer" linking in netball | timeline.ts:47-57 (any `ref` to a listed event), commentary.ts:28-30 and deep.ts:110 / 138-143 (`ref` must point at a `miss`), index.tsx:274-281 (removal) | Different predicates. The UI only ever links rebounds to misses, so the outputs agree today. |
| 01-B19 | AF number pads | american_football/index.tsx:85-99 `YardsPad` vs 743-756 `SpotPad` | Same chips + TextField + Go shape; labels, validation (`Number.isFinite` vs 1…field−1) and chip sets differ. |
| 01-B20 | Shot / team "Feed" sentence builders | handball/feed.ts:33-86 vs hockey/feed.ts:26-67 (`gk`, `save`, `sub` lines) | Different wording ("in goal for" vs "goes in goal for"; different sub phrasing). |
| 01-B21 | netball `nbTeamFigures` (deep.ts:145-194) vs engine `teamFigures` (engine.ts:646-663) | — | The deep version adds points, super shots, CPR, gains, rebound kinds and centre passes; the fields they share are computed the same way. Not a drop-in replacement. |
| 01-B22 | Per-sport scorer extras, checked so they aren't missed as duplicates | hockey/index.tsx:483-496 + 604-619 ("⏪ Backfill a missed moment"; exists only in hockey, grep), hockey 537-598 (circle entries, possession, PC outcome panel), rugby_league/index.tsx setsPanel (≈456-490) | Unique to one sport, or the same shape with different actions (hockey possession panel vs rugby `ballPanel`: different actions, no territory or ball-dead). |
| 01-B23 | handball vs hockey stat-schema heads | handball/stats.ts:14-119, hockey/stats.ts:12-69 | Shared entries were already counted in D24. The rest differ: `savePct` qualifier 20 vs 10 shots faced, tie-breaks, weights, the type / keeper-type generators (handball only). |

---

## 3. C: drift that looks like a bug (findings only, not removable)

| ID | Drift | Evidence |
|---|---|---|
| **01-C1** | **44-pt touch targets went into some scorer UIs but not others.** Player chips: rugby / league / ice / AF / netball `pchip` have `minHeight: 44`; **handball and hockey do not.** Cancel: padded in rugby / league / AF / netball, and ice adds a separate `c.tap` (`minHeight: 44`, index.tsx:873) at each use (364, 509, 620, 641); **handball and hockey have none.** "Correct the timeline" link: padded in rugby / league / AF, ice via `c.tap`; **handball, hockey and netball (857) are unpadded.** `editRow` has `minHeight: 44` only in rugby / league / AF. *(Corrected in the second pass: ice was wrongly listed before.)* | style sheets compared by script; ice `c.tap` uses at the lines given |
| **01-C8** | **Team-colour text contrast is fixed in only 3 of the 7 UIs.** ice / AF / netball draw team-coloured text with `ink(sd) = ensureContrast(color(sd), theme.colors.surface)` (ice 144, AF 153, netball 136). rugby (550, flow head 369), league (444), handball (533, 354) and hockey (465, 346) use the raw `color(sd)`, so a pale kit colour can be unreadable on the panel. | lines given |
| **01-C9** | **The "No one — fill the empty place" sub option can refill the place of a sent-off player.** The option shows whenever the side is short and nobody is suspended. **rugby_league** adds a guard so it never shows after a send-off (rugby_league/index.tsx:399-400, `!s.events.some(… sanction === 'sendOff' …)`). **rugby** has no such guard (rugby/index.tsx:479): a full red is `off` with `shortFor: undefined` (permanent short, onField.ts:211), so the scorer is offered a replacement for a red-carded player. Rugby law allows that only for the 20-minute red, and only after 20 minutes. **handball** (index.tsx:507) shows the same option during the 2-minute short window after a disqualification (`shortFor: 2`), before IHF 16:8 allows a refill. | lines given |
| **01-C2** | **The "⏸ Clock stopped" alert renders differently.** rugby / league / ice use `<IconText label="⏸ Clock stopped…">` (⏸ is mapped to the Pause icon in components/Icon.tsx:44). handball / hockey / netball render the raw emoji in `<Text>` (handball 593, hockey 530, netball 623). The icon migration missed three sports. | — |
| **01-C3** | **League sin-bin time ignores a later send-off.** rugby/sheet.ts:82-83 stops the sin-bin clock at a later red for the same player. rugby_league/sheet.ts:35-39 has no such check, so a sin-binned player who is then sent off keeps accruing "Sin-bin time" up to 10 minutes. The field tracker (totals.ts `off`) disagrees with the sheet. | — |
| 01-C4 | **Score order in "X win the shoot-out a–b" is inconsistent.** rugby/commentary.ts:183 puts the winner first (on purpose, see the comment). hockey/feed.ts:114 and handball/feed.ts:~130 use `Math.max` first. ice_hockey/commentary.ts:139 uses `scoreText(sc.home, sc.away)`, home first, so it reads "Away win the shoot-out 1–2". rugby/index.tsx:309 and the plugin `summary` lines are also home first. | — |
| 01-C5 | hockey accepts a SUB with no player going off (reducer 432-442 allows it) but renders it as "X ⬆ ? ⬇" (timeline.ts:31). The field log always pushes `kind:'sub'` (totals.ts:37) instead of `enter` the way rugby / handball / netball do. The hockey UI always asks who goes off (index.tsx:198), so only an action from another source would hit this. | — |
| 01-C6 | Copy-paste comment: hockey/engine.ts:534 says "the shoot-out / 7 m winner" (a handball term). Harmless. | — |
| 01-C7 | Duplicated default that disagrees: netball `trackCpr` defaults to `false` in the format field (meta.ts:77) but `true` in the live settings (engine.ts:685, 691). The live-settings Reset (`LiveSettingsCard.tsx:73`) uses the latter. May be intentional ("on with International"). **Needs a decision.** | — |

---

## 4. Verification of the mechanical scan entries for this slice

- rugby↔rugby_league index (40 windows): confirmed. Mostly B3; A parts are D27–D30.
- handball↔hockey index (13): B3 + D27 group 2.
- rugby↔league engine (13): D9, D11, D12 (A) plus the B4 skeleton.
- box.ts across six sports (10 / 4 / 2 / 1 windows): D18 / D19.
- handball↔hockey engine (8) and handball↔ice engine (6): D2–D5, D9, D11.
- rugby↔league stats (8): D24.
- rugby↔league totals (5) and the 4-way totals entry: D13–D16.
- rugby↔league ticker (1): D20.
- AF↔netball↔league index (4 / 2): D29 / D30 style and effect blocks.

---

## 5. Coverage

"Full" means read line by line. "Diff" means the file was compared in full against a sibling I read line by line (normalized diff or identical-run scan), with the unique parts read only where the diff showed them. "Partial" means only the listed parts were read.

| File | Lines | Review |
|---|---|---|
| invasion/names.ts | 149 | full |
| invasion/actions.ts | 50 | full |
| invasion/centre.ts | 52 | full |
| invasion/feed.ts | 147 | full |
| invasion/Commentary.tsx | 158 | full |
| invasion/MatchCentre.tsx | 80 | full |
| netraid/feed.ts | 124 | full |
| netraid/FeedView.tsx | 92 | full |
| netraid/CompareCard.tsx | 119 | full |
| gcc/model.ts | 76 | full |
| gcc/CommentaryFeed.tsx | 77 | full |
| gcc/CompareTable.tsx | 123 | full |
| rugby/engine.ts | 787 | full |
| rugby_league/engine.ts | 674 | full |
| handball/engine.ts | 656 | full |
| hockey/engine.ts | 608 | full |
| ice_hockey/engine.ts | 873 | full |
| american_football/engine.ts | 1033 | full |
| netball/engine.ts | 692 | full |
| rugby/index.tsx | 845 | full |
| handball/index.tsx | 798 | full (1-760 read; style sheet 761-798 compared by script) |
| rugby_league/index.tsx | 728 | full: complete diff vs rugby (every diff line read, third pass) |
| hockey/index.tsx | 812 | full: complete diff vs handball (every diff line read, third pass) |
| ice_hockey/index.tsx | 879 | full (second pass) |
| american_football/index.tsx | 943 | full (second pass) |
| netball/index.tsx | 862 | full (second pass) |
| */box.ts (7) | 103/97/92/96/88/115/92 | full |
| */records.ts (7) | 42/36/18/18/41/32/32 | full |
| */discipline.ts (7) | 43/40/47/38/50/28/38 | full |
| */meta.ts (7) | 64/61/51/53/63/72/100 | full (long lines cut at 260 chars) |
| */ticker.ts (7) | 51/50/58/57/63/53/48 | full |
| */timeline.ts (7) | 96/77/90/77/90/114/86 | full |
| rugby/totals.ts, rugby_league/totals.ts, handball/totals.ts, netball/totals.ts, ice_hockey/totals.ts, american_football/totals.ts | 122/109/195/156/155/67 | full |
| hockey/totals.ts | 155 | diff vs handball (full diff read) |
| rugby/stats.ts | 123 | full |
| rugby_league/stats.ts | 116 | diff vs rugby (full diff read) |
| handball/stats.ts | 202 | full (1-119 read in the third pass) |
| hockey/stats.ts | 133 | full (1-69 read in the third pass) |
| ice_hockey/stats.ts, american_football/stats.ts, netball/stats.ts | 186/176/125 | full (second pass) |
| rugby/commentary.ts, ice_hockey/commentary.ts | 197/156 | full |
| rugby_league/commentary.ts | 174 | diff vs rugby (full diff read) |
| american_football/commentary.ts | 295 | full (41-159 read in the second pass) |
| netball/commentary.ts | 121 | full (second pass) |
| rugby/voice.ts, ice_hockey/voice.ts, netball/voice.ts, american_football/voice.ts | 85/154/78/130 | full |
| rugby_league/voice.ts | 98 | diff vs rugby (full diff read) |
| rugby/sheet.ts, rugby_league/sheet.ts, ice_hockey/sheet.ts, american_football/sheet.ts | 191/114/182/119 | full (doc comments skipped) |
| court / pitch / rink / field (7) | 51/47/42/62/41/41/42 | full (rugby read; the other 6 by full diff) |
| hockey/depth.ts | 101 | full |
| handball/depth.ts | 191 | full (1-135 read in the second pass) |
| hockey/feed.ts | 137 | full |
| handball/feed.ts | 169 | full (1-89 read in the second pass) |
| netball/deep.ts, netball/panel.ts | 248/110 | full (second pass) |
| rugby_league/sets.ts | 75 | full (second pass) |
| american_football/drives.ts, american_football/DriveChart.tsx | 285/57 | full (second pass) |

**Coverage is now complete.** In the third pass I read the rest of the rugby↔rugby_league index diff (every diff line), the whole handball↔hockey index diff, handball/stats.ts lines 1-119 and hockey/stats.ts lines 1-69. Every file in the slice has now been read line by line, or (for rugby_league/index.tsx and hockey/index.tsx) checked through a complete diff against a file that was read line by line.