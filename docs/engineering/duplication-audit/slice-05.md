# Slice 5 — shared sport infrastructure (`src/sports/*` top level) + event sports

Scope per the coordinator's override: **duplicated code only**, each finding classed
**A** (removable with zero behaviour change), **B** (not identical — leave), **C** (drift that looks like a bug — finding only).
"Removable" counts A only. Line numbers are real (checked with `cat -n` / `grep -n`). Paths are relative to `src/`.

Bundle facts that decide where shared code may live (verified):
- `sports/statSchemas.ts` imports every `<sport>/stats.ts`, and `sports/registry.ts` imports `statSchemas` → all stat schemas (incl. `crewStats.ts`, `sharedStats.ts`, `statSchema.ts`) already ship together. Moving helpers between them changes no chunk.
- `sports/eventSports.ts` and every `<sport>/meta.ts` are in the first download (via `sportMeta.ts` and the screens).
- `sports/voiceParsers.ts` imports kabaddi, volleyball, basketball, hockey, handball, rugby, carrom and golf engines and re-exports 4 more sports' voice modules, and racket chunks import `pointVoice` from it. Do **not** put shared helpers there (or in `boxSources.ts`, which imports every sport's box code); it would pull other sports into a sport's chunk.

---

## 1. Class A: removable with zero behaviour change

| ID | Title | Locations (all copies) | Lines involved | Removable | Why provably identical / how | Risk |
|---|---|---|---|---|---|---|
| 05-D1 | Race-time formatter `fmtTime` (+ `timeFmt`) | athletics/stats.ts:30-36 · swimming/stats.ts:19-25 · crewStats.ts:8-14 (cycling/stats.ts:15-23 is the dp-generic version) | 21 | ~10 | The three bodies are character-identical. Keep one export (e.g. in `statSchema.ts`, already a runtime dependency of the stats registry). Cycling's `fmtTime(v, dp)` gives the same output at dp=2 but is also called with dp=3, so it stays. All of these are in the stats bundle, so no chunk changes. | low (display) |
| 05-D2 | Identical event-sport StatDef literals | golds/silvers/bronzes/posPoints/place/dq ×7 (athletics 125-130,135 · swimming 49-53,57 · weightlifting 47-49,53-54,60 · archery 42-46,49 · cycling 49-52,56,61 · shooting 37-41,45 · crewStats 39-43,48); mrSet/srSet ×4 (athletics 122-123, swimming 47-48, cycling 54-55, crewStats 36-37); races ×4, dnf ×4, hand ×4, finals(racing) ×4, heatWins ×3, mark(timeFmt) ×3, reaction ×2, qualified(racing) ×2 | ~76 literal lines | ~12 net (≈70 literal copies become references) | Every listed line is byte-identical (checked with `grep \| sort \| uniq -c`). Add named constants to `sharedStats.ts` and use them in the same positions. **Keep the order**, because schema order drives display and MVP weights. golds/silvers/bronzes are contiguous in all 7 files and can be one spread. Do not reuse `SHARED_STATS` golds/silvers: those have `source:'team'` and no group or weight. Nothing mutates StatDefs (grep found no assignments). | low |
| 05-D3 | Event-sport meta option lists | pointsScheme options: athletics/meta.ts:19-24, swimming/meta.ts:29-34, cycling/meta.ts:19-24, rowing/meta.ts:24-29, canoe/meta.ts:24-29 (4 options); archery/meta.ts:19-23, shooting/meta.ts:19-23 (3); weightlifting/meta.ts:23-27 (first 3 + IWF). champTie: athletics 43-47 ≡ swimming 42-46. relayFactor: athletics 26-29 ≡ swimming 36-39; rowing 31-34 ≡ canoe 31-34. handTimed: rowing 35 ≡ canoe 35 | ~65 | ~40 | The `options` arrays are identical data, but the pointsScheme `hint` differs (archery, cycling, rowing/canoe), so share only the options arrays (a base-3 constant plus the 4th option), not the whole field. champTie, relayFactor and handTimed are whole-field identical. Host: `eventSports.ts`, which is in the first download, as the meta files are. (The scan's canoe/meta:22 ↔ rowing/meta:22 entry is this finding.) | low |
| 05-D4 | Inert event-plugin members | athletics/index.tsx:28-31,34 · swimming 28-31,34 · weightlifting 29-32,35 · archery 28-31,34 · cycling 29-32,35 · shooting 28-31,34 · rowing 27-30,33 · canoe 27-30,33; also `interface <X>MatchState { ended: boolean }` ×8 | ~48 | ~25 | `createInitialState / reducer / isComplete / result / correctable` are identical in all 8 → one `EVENT_PLUGIN_BASE` spread (e.g. in `eventSports.ts`). The `ScoringControls` and `summary` strings differ, so those stay (see B10). | low |
| 05-D5 | Panel row helpers `frac` / `pctOf` (+ ratio/count row builders) | serveStats.ts:563-564 · racketMatchStats.ts:250-254 · tennis/matchStats.ts:179-180, inline ratio rows at 199, 255, 298; serveRows inline `ratio`/`count` serveStats.ts:571-574 | ~14 | ~10 | Identical text. Export `frac`, `pctOf`, `ratioRow` and `countRow` from `serveStats.ts`; both other files already import it, so no chunk changes. | low |
| 05-D6 | "Winners / UE" row | pointDetail.ts:906-909 · racketMatchStats.ts:326-329 · tennis/matchStats.ts:244-247 | 12 | ~7 | Same formula, key, label and 99 cap; only the field names on the input differ (`unforcedErrors` vs `ue`). Pass the 4 numbers to a helper in `pointDetail.ts`, which all three import. | low |
| 05-D7 | "Points per service turn" row | serveStats.ts:622-626 · racketMatchStats.ts:308-312 | 10 | ~4 | Same object built from `block.home/away`. Export a builder from `serveStats.ts`. | low |
| 05-D8 | Engines' private `clearMatch` re-typed in replays | serveStats.ts:209-211 (clearSet) ≡ tennis/engine.ts:201-203 ≡ padel/engine.ts:169-171; serveStats.ts:251 ≡ badminton/engine.ts:95-97 ≡ racketCommentaryModel.ts:219; serveStats.ts:276-279 ≡ rallyEngine.ts:118-123 ≡ racketCommentaryModel.ts:220; serveStats.ts:324 ≡ volleyball/engine.ts:138-140 | ~22 | ~10 | Same fields and values; the key order is irrelevant to the result. Export each engine's `clearMatch` and call it. serveStats and racketCommentaryModel already import these engines, so no chunk changes. **Not** racketCommentaryModel.ts:151 (padel), which also sets `serveDetail: undefined` (see B). | medium (replay path; provably the same object) |
| 05-D9 | `gamesDone` (sets + games) | serveStats.ts:184 · racketCommentaryModel.ts:150 · tennis/commentaryModel.ts:111 | 3 | ~2 | Identical expression. `serve.ts:47 gamesPlayed` has no `?? []` / `?? 0` guards, so it is B. | low |
| 05-D10 | Table-tennis phase label for a rally bucket | racketMatchStats.ts:441-442 (`bucketLabel`) · racketCommentaryModel.ts:317 · PointDetailRow.tsx:141 | 4 | ~2 | Same ternary. Move `bucketLabel` to `pointDetail.ts`, which all three import. | low |
| 05-D11 | `tennisRecord` / `padelRecord` | racketTotals.ts:113-127 vs 130-144 | 30 | ~13 | Bodies are identical apart from the imported `setTiebreaks` / `standingsUnits` pair. Use one `setRecord(s, tiebreaks, units)`. | medium (statTotals; pure, tested) |
| 05-D12 | rallyStats label builders duplicated inline | rallyStats.ts:215 and 218 ≡ `worded('winner' / 'ue', …)` (191-198); `rate` (45-50, no extras) ≡ `pctOf(…, 'record')` (266-268) | ~10 | ~5 | Identical strings and format objects. | low |
| 05-D13 | Small constant / type duplicates | NET_WORDS tennis ≡ padel (pointDetail.ts:490 ≡ 491) · serveDetail track field (pointDetailSettings.ts:37 ≡ 62) · `DETAIL_BOX` (rallyStats.ts:396) ≡ `DETAIL_BOX_KEYS` (pointDetail.ts:925) · `DetailRow` (pointDetail.ts:874) ≡ `ServeRow` (serveStats.ts:561) | 8 | ~4 | Identical values and types. | low |
| 05-D14 | `bare` (strip "-" from signed keys) | statSchema.ts:387 · statSchema.ts:818 (`signedKeys`) · boxScore.ts:120 | 3 | ~2 | Same map. Export from `statSchema.ts`; boxScore already imports it. | low |
| 05-D15 | Bar share split | boxScore.ts:284-287 (`barShares`) ≡ compareSheet.ts:116-119 (`rowShares`) | 8 | ~4 | Identical bodies. | low |
| 05-D16 | Team header in the stats cards | CategoryStatsPanel.tsx:53-56 + styles 102-105 ≡ StatSheetView.tsx:50-53 + styles 90-93 | 16 | ~8 | Same JSX and same style values. `StatBar.tsx` `StatsHead` is **not** the same (B3). | low (UI) |
| 05-D17 | Half / extra-time period name | boxSources.ts:315 (`kabaddiPeriodName`) ≡ boxSources.ts:381 (`footballPeriodName`) ≡ kabaddi/StatsPanel.tsx:16 (`PERIOD`) | 3 | ~2 | Identical ternary. Host kabaddi's copy outside boxSources (see the bundle note). | low |
| 05-D18 | Rugby / rugby league record types | matchRecords.ts:134-141 ≡ 143-150 | 16 | ~7 | Identical arrays. Use one const. | low |
| 05-D19 | Record line text vs `lineText` | matchRecords.ts:281-285 vs scoreline.ts `lineText(ls)` (106-111) | ~5 | ~4 | For match-tiebreak cells `cellPoints` and `mtbPoints` pick the same numbers, and the normal and tiebreak-set text is the same, so the output equals `lineText(ls)` (non-partial). `cellPoints` stays for the other uses. | medium (backfilled records; same strings) |
| 05-D20 | Stored event → reducer action | amend.ts:23-28 (`toAction`) ≡ data/eventLog.ts:76-81 (`logAction`) ≡ data/pendingResults.ts:55-60 ≡ data/chessRoundResults.ts:20 ≡ data/teamTieDemoSeed.ts:58 (inline) | ~19 | ~12 | Same 4-field mapping. Export from `amend.ts`, which all of them already import (chessRoundResults and pendingResults import `effectiveLog` from it; eventLog imports `AMEND_TYPE`). | medium (replay path; identical mapping) |
| 05-D21 | `legacyNameOf` re-typed | undoLabel.ts:54 inline ≡ core/playerNames.ts:53 (`FALLBACK_NAME = 'Player'`) | 1 | 0 | Same function. `undoLabel` imports `racketNames.ts`, which re-exports it. | low |
| 05-D22 | Football discipline helpers re-typed | discipline.ts:116, 171-177 ≡ football/discipline.ts:48 (`n`), 100-111 (`phaseOf`, `resetLevel`, `played`, `byTime`) | ~16 | ~8 | Identical code. discipline.ts already imports football/discipline.ts. | medium (suspensions; pure) |
| 05-D23 | `ordinal` | recordHelpers.ts:7-11 ≡ volleyball/ServePanel.tsx:37 | 6 | ~1 | Same rule. The other ordinal helpers are B (see B13). | low |
| 05-D24 | `plural` / `andList` | feedGroups.ts:111 ≡ netraid/feed.ts:59 ≡ cricket/commentary.ts:115 ≡ cricket/editOvers.ts:567 ≡ carrom/feed.ts:14 ≡ snooker/feed.ts:14 ≡ pool/records.ts:20; 2-argument forms give the same output for every input: snooker/undo.ts:12, snooker/index.tsx:44, pool/undo.ts:16. `andList` feedGroups.ts:117-121 ≡ netraid/feed.ts:62-66 `joinNames` | ~15 | ~10 | Identical results. Host in a tiny pure text module (or `core/`), not `feedGroups.ts`, so the cricket, carrom, snooker and pool chunks do not take in the feed model. `kabaddi/engine.ts:600` and `discipline.ts:128` are different functions (B). | low |
| 05-D25 | `article` | racketCommentaryModel.ts:60 ≡ tennis/commentaryModel.ts:89 | 2 | ~1 | Identical. Already imports tennis/commentaryModel. | low |
| 05-D26 | Deciding-game test | courtCues.ts:97-98 (`isDecidingGame`) ≡ doublesOrder.ts:132 (`deciding`) | 3 | ~1 | Identical expression. | low |
| 05-D27 | Commentary roster names + memo | RacketCommentary.tsx:31-44 vs tennis/Commentary.tsx:33-46 (the scan's 25↔27 entry) | 28 | ~10 | Roster keys, `nameOf` and the names object are identical; only the builder call and one dependency differ. Extract a `useCommentaryNames` hook beside `CommentaryFeed.tsx`. | low (UI) |
| 05-D28 | Shared blocks of the racket stats panels | MatchStatsPanel.tsx:78-81 (nameOf, players, bar), 102-107 (key-stat sections), 113-122 (server lines), 140-145 (stroke table head) ≡ tennis/StatsPanel.tsx:62-65, 81-86, 98-107, 120-125; scope chips 90-95 ≡ 72-77 (`word` vs literal 'Set', same output for set sports) | ~60 | ~25 | Same JSX and data. Move into `StatBar.tsx`, which already hosts panel pieces with no stats engine. (This follows on from the StatBar consolidation; StatBar itself is not re-reported.) Tab chips are **not** identical (B). | low (UI) |
| 05-D29 | Shared blocks of the point-detail cards | PointDetailRow.tsx:186-199 ≡ tennis/PointCapture.tsx:161-174 (diff exit 0); "Extra stats" options/chooser 77-91 ≡ 69-83 (only a lambda variable name differs; `trackFields('tennis')` = `[...TENNIS_TRACK_FIELDS]`); styles 235-245 ≡ 243-252 first 9 entries (the scan's 184↔158 entry) | ~55 | ~30 | Identical output. Host in a small shared racket UI file (e.g. `PointButtons.tsx`, which both chunks load). | low (UI) |
| 05-D30 | Tally bump repeated 3× | rallyEdit.ts:235-238, 246-249, 258-261 | 12 | ~6 | Same get-or-create-then-add on the same Map. | low |
| 05-D31 | Annotation carry-over vs `annotationsOf` | RallyPointEditor.tsx:155-159 vs pointDetail.ts:684-692 | 5 | ~3 | Same truthiness checks and the same key order (so stored EDIT_LOG bytes match). Use `Object.assign(item, annotationsOf({ ...was, pd: undefined }))`. | medium (writes EDIT_LOG) |
| 05-D32 | Other-side helper `(s) => s === 'home' ? 'away' : 'home'` | 64 module-level copies repo-wide (grep). In this slice: rallyEngine.ts:77 (exported), matchRecords.ts:238 (exported), racketTotals 69, serveCourt 51, pointDetail 73, RacketQuickOptions 32, boxSources 66, racketActions 13, gameLabels 16, racketCommentaryModel 58, serve 44, conduct 52, serveStats 56, doublesOrder 33, racketMatchStats 67, voiceParsers 198, onField 102 | 64 | 0 counted | Identical. It is a 1-line const, so replacing it with an import saves nothing except where the host module is already imported. Optional; host it in `core/types` (type-only today) or a tiny pure module. | low |
| 05-D33 | Type-only aliases | `type Side = 'home' \| 'away'` ×28 in slice files (7 exported); `number \| string \| boolean` inline ×4 in types.ts (276, 284, 301, 305) and formatPick.ts:9 ≡ `FormatValue` | ~33 | 0 counted | Types only: no runtime or bundle effect. | none |

**Class A total ≈ 278 lines removable** (the estimates above; D32/D33 not counted).

Identical but **leave as is**: `EVENT_WORDS[*].icon` (eventSports.ts:12-19) ≡ each `<sport>/meta.ts` icon. Reading the icon from `sportMeta` would make `eventSports.ts` (loaded by node tests) depend on `sportMeta` → `core/region`. Not counted.

---

## 2. Class B: not identical, leave

| ID | What | Locations | Exact difference |
|---|---|---|---|
| B1 | Three live feed systems (+1 orphan) | feedModel.ts + PlayFeed.tsx (basketball, netball) · feedGroups.ts + GroupedFeed.tsx (baseball, ice hockey, rugby, rugby league, AF) · CommentaryFeed.tsx (racket, cue, chess, golf, carrom) · LiveTimeline.tsx (no importer) | Different models. FeedRow has a `score` object, a `scoring` flag and a `tag`. FeedLine has a string score, `key`, `tags` and `scope`. Chips: "Scoring plays" vs "Everything / Key moments". Paging: 40 rows vs 3 groups. Both modules export **different** `FeedGroup` types and `filterFeed` signatures under the same names. Merging them is a design decision. |
| B2 | Two team-comparison models + panels | statPanel.ts + CategoryStatsPanel.tsx vs compareSheet.ts + StatSheetView.tsx (and boxScore `CompareRow` / `leaderOf`) | `noBar` keeps the leader highlight, while `plain` drops it (`betterSide` vs `rowLeader`). `leaderOf` has no `lowerBetter`. `sub` lines exist only in PanelRow. Chip labels: 'Match' / 'All stats' vs 'Overall' / 'All'. Bars: CSP 5 px proportional, SSV split with a 2 px gap and the loser greyed. Chip gap 2 vs 1. Same-name `countRow` in statPanel, compareSheet, netraid/feed and gcc/model with different option signatures. |
| B3 | `StatsHead` vs the CSP/SSV header | StatBar.tsx:33-40 vs CategoryStatsPanel.tsx:53-56 | side gap `spacing(1.5)` vs `spacing(1)`; no `textAlign:'right'` on the away name. |
| B4 | Match Stats tab bodies | rallyCore.tsx:316-330 · badminton/index.tsx:111-125 · padel/index.tsx:131-145 · tennis/index.tsx:117-130 | Period letter 'G' / 'S'. Heading "Box score" vs "Player stats" (see C1). Tennis uses TennisStatsPanel. Different box sources. |
| B5 | Commentary sentence | racketCommentaryModel.ts:65-86 vs tennis/commentaryModel.ts:93-109 | Racket adds the `unit` word, the UE type suffix and the sf / stroke / nolet cases, and uses shotPhrase instead of strokePhrase. |
| B6 | `strokePhrase` vs `shotPhrase` | pointDetail.ts:163-168 vs 237-243 | Title-case regex `\b([a-z])` vs `(^|[\s(])([a-z])`; groundstroke rule. |
| B7 | Serve-panel vs key-stats wording for the same row keys | serveStats.ts:617-627 vs racketMatchStats.ts:275-277, 302-313 | 'Side-outs' vs 'Side-outs won', 'Points on serve' vs 'Rallies won on serve', 'Receive rallies won' vs 'Side-out % (receive rallies won)'; s1won '1st serve points won' vs 'Win 1st serve' (tennis key stats matches racket). Looks deliberate per panel; possibly drift, so it needs a decision. |
| B8 | `gamesPlayed` vs `gamesDone` | serve.ts:47 vs serveStats.ts:184 | No null guards in serve.ts. |
| B9 | `fmtTime` vs results `formatMark` | crewStats.ts:9-14 etc. vs data/results/marks.ts:13-28 | formatMark adds hours ("1:01:02.34" vs "61:02.34") and units / imperial. |
| B10 | Event `ScoringControls` / `summary` | 8 × `<event>/index.tsx:19-24, 32-33` | Title, body and detailLine strings differ per sport. |
| B11 | Mark / PB StatDef factories | athletics/stats.ts:38-87, swimming 28-32, weightlifting 17-21, archery 15-19, cycling 28-32, shooting 15-19, crewStats 18-22 | Labels "X PB" vs "Best x"; leaderLabel Fastest / Best / Longest / Highest; better lower/higher; render (time, "kg", pts, toFixed(2), raw). |
| B12 | Athletics / swimming event lists vs results disciplines | athletics/stats.ts:13-28, swimming/stats.ts:12-16 vs data/results/model.ts:595-640 | Order differs (stats order = career / leader order; `pbStats.slice(0,3)` picks 100/200/400 m). Swim labels '100 m IM' vs '100 m individual medley'. Yard events and relays only in model. WL 'Total' vs 'Weightlifting total'. |
| B13 | Other `ordinal`s | conduct.ts:183-184 ('21th'), golf/engine.ts:603-607 (+" hole"), components/MedalScoringEditor.tsx:15-18 and screens/ResultsEventScreen.tsx:1431, feedGroups.ts:114 `nth` | Same for non-negative integers, different code; conduct and golf differ in output. |
| B14 | `inputsOf` ×2 | boxScore.ts:115-129 vs statSchema.ts:483-499 | The box version handles pair/sum specs and only some derived kinds (max/min/countIf/best fall back to `[c.key]`). |
| B15 | Conduct ladders tennis vs padel | conduct.ts:105-115 | 'Default' vs 'Disqualification'; tennis has a note. |
| B16 | `withServeOrder` vs `withRecvOrder` | serve.ts:84-92 vs 97-105 | Different guards (pre-first-point vs any time) and payload keys. |
| B17 | Serve-diagram builders ×3 | serveCourt.ts:57-83, 86-102, 105-127 | Different sources of side, slot and receiver, and optional ids. |
| B18 | Hockey vs handball voice | voiceParsers.ts:356-405 vs 434-479 | Different grammar, cards and end rules. |
| B19 | Editor wing/shot blocks | RallyPointEditor.tsx:261-281 vs 284-305 | The non-tennis branch keeps the error type; SHOTS vs RACKET_SHOTS. |
| B20 | Point-detail cards (rest) | PointDetailRow.tsx vs tennis/PointCapture.tsx | Net labels "At the net:" vs `nw.at`; Nobody chip; bucket labels; 3rd shot vs serve speed. |
| B21 | Label-free rally engines | serveStats.ts:173 (no `id`) vs racketCommentaryModel.ts:94-96 (with `id`) | The `id` changes conduct sport / SET_SERVE_ORDER handling. Replays there only use POINT / PENALTY_POINT. |
| B22 | Lead-change rule | gameFlow.ts:75-83 vs feedModel.ts:62-71 | Counter vs sentence. |
| B23 | Game-over score fallback in one function | racketCommentaryModel.ts:269 vs 291 | `?? [current]` vs `?? [0,0]`; unreachable in practice. |
| B24 | Pickleball vs padel formation | courts.tsx:53-61 | y 0.18 vs 0.20. |
| B25 | mm:ss helpers | compareSheet.ts:78 vs handball/engine 213 ≡ netball/engine 259 ≡ rugby/engine 294 ≡ rugby_league/engine 307 (padded) vs basketball/deep 461 ≡ AF/engine 276 (unpadded) vs ice_hockey/engine 266 | Padding and the clamp at 0 differ. (The identical sport-folder copies belong to other slices.) |
| B26 | Ice hockey record types vs `goalTypes` | matchRecords.ts:99-106 vs 61-68 | 'in a game' vs 'in a match'; adds shutout / saves. |
| B27 | Generic discipline vs football's | discipline.ts:185-243 vs football/discipline.ts | Football keeps its own model (documented). |
| B28 | Racket vs volleyball box row building | boxSources.ts:472-541 vs 228-307 | Different keys, team rows and coverage. |

---

## 3. Class C: drift that looks like a bug (findings only)

- **C1 Stats-tab heading.** `rallyCore.tsx:326` (pickleball, squash, TT) and `padel/index.tsx:141` read `<Text style={ctrl.label}>Box score</Text>`. `badminton/index.tsx:121`, `tennis/index.tsx:127` and `volleyball/index.tsx:296` read `Player stats` above the same `MatchBoxScore`.
- **C2 Commentary clock origin.** `tennis/commentaryModel.ts:123-124` takes `t0` from the first *point*, and only if it is stamped ("an older match whose later points gained stamps would otherwise read '0:00' mid-match"). `racketCommentaryModel.ts:113` uses `events.find((e) => typeof e.at === 'number')?.at`, the exact case the tennis fix guards against.
- **C3 Serve-diagram tag.** `ServeCourtPanel.tsx:49` hard-codes `'🎾 serves'`, but the panel also renders badminton (🏸), padel (🟡) and pickleball (🥒) doubles (rallyCore.tsx:421-428, badminton, padel index).

---

## 4. Answers to the key questions

**Do sports re-implement shared helpers locally?** Yes. Verified cases:
- other-side (D32, 64 copies)
- `plural` / `andList` (D24)
- every racket engine's `clearMatch`, re-typed in serveStats and racketCommentaryModel (D8)
- `legacyNameOf` (D21)
- amend's event → action mapper, in 4 data files (D20)
- football discipline helpers (D22)
- tennis `article` / `gamesDone` / `frac` / `pctOf` / W-UE row (D5, D6, D9, D25)
- kabaddi `PERIOD` (D17)
- event sports' `fmtTime` (D1); rowing and canoe already share `crewStats`, athletics and swimming do not.

**Overlapping shared modules?**
- `statSchema.ts` (types and the aggregate engine) and `statSchemas.ts` (the registry and label lookups) do **not** overlap; only the names are confusing.
- `racketTotals.ts` (career statTotals), `rallyStats.ts` (stat schema), `racketMatchStats.ts` (match panel and depth career keys) and `serveStats.ts` (replay engine) are layers, not duplicates. They share copied small helpers (D5–D10).
- Real overlap is in the feed modules (B1, plus the orphan `LiveTimeline.tsx`) and in the team-comparison models (B2: statPanel vs compareSheet vs boxScore CompareRow; `DetailRow` ≡ `ServeRow`, D13).

---

## 5. Coverage (every file read in full unless noted)

| File | Lines | | File | Lines | |
|---|---|---|---|---|---|
| rallyRecords.ts | 10 | reviewed | courts.tsx | 185 | reviewed |
| formatPick.ts | 14 | reviewed | MatchStatsPanel.tsx | 187 | reviewed |
| structureLabels.ts | 15 | reviewed | RacketQuickOptions.tsx | 201 | reviewed |
| amendCredit.ts | 17 | reviewed | VoiceScorer.tsx | 204 | reviewed |
| eventSports.ts | 25 | reviewed | doublesOrder.ts | 209 | reviewed |
| shootoutOrder.ts | 29 | reviewed | gameFlow.ts | 211 | reviewed |
| usePendingEdit.ts | 29 | reviewed | courtCues.ts | 213 | reviewed |
| matchLine.ts | 32 | reviewed | PointButtons.tsx | 223 | reviewed |
| FieldBanner.tsx | 34 | reviewed | PointDetailRow.tsx | 245 | reviewed |
| sharedStats.ts | 35 | reviewed | scoreline.ts | 283 | reviewed |
| playerLink.ts | 37 | reviewed | rallyEdit.ts | 295 | reviewed |
| SubViews.tsx | 42 | reviewed | discipline.ts | 319 | reviewed |
| recordHelpers.ts | 42 | reviewed | boxScore.ts | 325 | reviewed |
| RacketCommentary.tsx | 46 | reviewed | racketCommentaryModel.ts | 325 | reviewed |
| aggregate.ts | 50 | reviewed | onField.ts | 353 | reviewed |
| CueBanner.tsx | 51 | reviewed | racketTotals.ts | 358 | reviewed |
| gameLabels.ts | 52 | reviewed | matchRecords.ts | 364 | reviewed |
| liveSettings.ts | 54 | reviewed | RallyPointEditor.tsx | 375 | reviewed |
| TimelineControls.tsx | 59 | reviewed | rallyEngine.ts | 396 | reviewed |
| racketActions.ts | 59 | reviewed | rallyCore.tsx | 428 | reviewed |
| sportLoaders.native.ts | 59 | reviewed | rallyStats.ts | 442 | reviewed |
| pointStatus.ts | 60 | reviewed | conduct.ts | 466 | reviewed |
| sportLoaders.ts | 60 | reviewed | voiceParsers.ts | 477 | reviewed |
| statPanel.ts | 60 | reviewed | racketMatchStats.ts | 582 | reviewed |
| crewStats.ts | 66 | reviewed | types.ts | 616 | reviewed (lines 360-616 read with doc comments filtered out; all code lines read) |
| StatBar.tsx | 68 | reviewed (StatBar consolidation itself not re-reported) | serveStats.ts | 645 | reviewed |
| feedModel.ts | 75 | reviewed | boxSources.ts | 729 | reviewed |
| matchRecordHooks.ts | 75 | reviewed | statSchema.ts | 871 | reviewed |
| ServeOrderPicker.tsx | 77 | reviewed | pointDetail.ts | 925 | reviewed |
| DoublesOrderPicker.tsx | 78 | reviewed | liveEvents.ts | 82 | reviewed |
| undoLabel.ts | 85 | reviewed | LiveTimeline.tsx | 88 | reviewed |
| SetLineBoard.tsx | 89 | reviewed | racketNames.ts | 98 | reviewed |
| GroupedFeed.tsx | 99 | reviewed | PlayFeed.tsx | 100 | reviewed |
| StatSheetView.tsx | 102 | reviewed | ServeCourtPanel.tsx | 107 | reviewed |
| CategoryStatsPanel.tsx | 115 | reviewed | feedGroups.ts | 121 | reviewed |
| pointDetailSettings.ts | 125 | reviewed | serve.ts | 128 | reviewed |
| sportMeta.ts | 132 | reviewed | voiceMatch.ts | 133 | reviewed |
| compareSheet.ts | 134 | reviewed | CommentaryFeed.tsx | 135 | reviewed |
| statSchemas.ts | 143 | reviewed | registry.ts | 145 | reviewed |
| serveCourt.ts | 146 | reviewed | amend.ts | 148 | reviewed |
| ticker.ts | 148 | reviewed | | | |
| athletics/ meta 60 · index 35 · stats 158 | 253 | reviewed | swimming/ meta 52 · index 35 · stats 74 | 161 | reviewed |
| weightlifting/ meta 38 · index 36 · stats 78 | 152 | reviewed | archery/ meta 26 · index 35 · stats 86 | 147 | reviewed |
| cycling/ meta 30 · index 36 · stats 79 | 145 | reviewed | shooting/ meta 26 · index 35 · stats 69 | 130 | reviewed |
| rowing/ meta 38 · index 34 · stats 9 | 81 | reviewed | canoe/ meta 38 · index 34 · stats 8 | 80 | reviewed |

Totals: 89 top-level files (15,465 lines) + 24 event-sport files (1,149 lines) = **113 files / 16,614 lines**.
Exact-clone scan entries touching this slice, all verified: PointDetailRow↔tennis/PointCapture (D29), athletics↔swimming stats (D1, D2), MatchStatsPanel↔tennis/StatsPanel (D28), RacketCommentary↔tennis/Commentary (D27), canoe↔rowing meta (D3).
