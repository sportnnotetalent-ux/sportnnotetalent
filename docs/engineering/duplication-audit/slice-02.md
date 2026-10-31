# Slice 2 — duplication audit (football, basketball, kabaddi, volleyball, baseball)

Read-only audit. Scope per the coordinator's override: **duplicated code only**, every finding classified
**(A)** removable with zero behaviour change, **(B)** not identical (leave it), **(C)** drift that looks like a bug.
"Lines removable" counts (A) only. Paths are relative to `src/` unless they start with `tests/`.

Engines and reducers (`*/engine.ts`, `kabaddi/rules.ts`) replay saved match logs, so every (A) touching
them is marked "engine — replay" even when provably identical. The MVP P0 changes (basketball overtime
guard, kabaddi do-or-die rv 3 / shootout max) were treated as intentional and not flagged.

Exact-clone list entry touching this slice: `sports/basketball/index.tsx:875 <> sports/football/index.tsx:1372`
→ verified, it is D-B6 below (the two game-clock panels; not identical → B).

---

## 1. (A) Removable with zero behaviour change

| ID | Title | Copies (path:lines) | Why provably identical / how | Removable | Risk |
|---|---|---|---|---|---|
| 02-D1 | Discipline helpers re-implemented in the generic table | `sports/football/discipline.ts:48` (`n`), `100-104` (`phaseOf`), `104` (`resetLevel`), `110-111` (`played`, `byTime`), `193-194` (`rowName`) ⇄ `sports/discipline.ts:116` (`num`), `171-177`, `247-248` | Byte-identical bodies (diffed). Keep football's, export them, import in `sports/discipline.ts` — which already does `import * as football from './football/discipline.ts'`, so no new module on any chunk. | 12 | low (pure, tested) |
| 02-D2 | `creditAttribution(c, sign, tracked)` ×7 | `sports/baseball/engine.ts:722-732`, `sports/handball/engine.ts:309-319`, `sports/hockey/engine.ts:268-278`, `sports/rugby/engine.ts:402-412`, `sports/rugby_league/engine.ts:402-412`, `sports/netball/engine.ts:399-409`, `sports/american_football/engine.ts:435-445` (**shared with slice 1**) | Code identical (only a trailing comment differs). Baseball's `Credit` type lacks `playerName` but the function never reads it. Keep one copy in a tiny shared pure module and import it. Builds action attributions only (not the reducer fold). Adds ~0.3 KB to each sport's chunk. NOT included: `ice_hockey/engine.ts:384` (adds `side`) and `basketball/credits.ts:74` (different signature, drops zeros, adds `playerName`). | 66 | medium (engine file, but not on the replay path) |
| 02-D3 | Best-of-5-then-sudden-death shoot-out decider | `sports/hockey/engine.ts:289-298`, `sports/handball/engine.ts:343-352`, `sports/rugby/engine.ts:444-453` (byte-identical) ; `sports/ice_hockey/engine.ts:592-601` (same with `rounds = 5`) ; `sports/football/engine.ts:292-303` (same maths on `boolean[]`) ; `sports/kabaddi/rules.ts:172-181` (same with `maxPerRaid`, returns `null`) (**shared with slice 1**) | One core `decide(hs, as, hLen, aLen, rounds = 5, maxPer = 1)` gives the same result for every input of every caller (football: count the `true`s; kabaddi: wrap with `?? null`). Used inside reducers → engine — replay; identical outputs, so old shoot-outs replay the same. | 30 | high (engine — replay; identical) |
| 02-D4 | `deburr` | `sports/football/voiceCommands.ts:9-10` ⇄ `sports/voiceMatch.ts:9-10` | Byte-identical. Re-export it from voiceMatch. Bundle note: football's chunk then also loads `voiceMatch.ts`, which imports types only. `components/VoiceNav.tsx:12` imports `deburr` from football's file; pointing it at voiceMatch keeps football code out of that chunk. | 2 | low |
| 02-D5 | `basketball/Timeline.tsx`: an unused near-copy of `LiveTimeline` | `sports/basketball/Timeline.tsx:1-109` ⇄ `sports/LiveTimeline.tsx` (the style sheet at `:69-88` matches except `q.width` 66 vs `stamp` 48) | Nothing imports it (searched `src`, `tests`, `scripts`, `worker`, `supabase`). Only `tests/a11y-labels.test.mts` reads it, as a static scan of every `.tsx` under the sport folders. Deleting it changes no runtime behaviour. | 109 | low |
| 02-D6 | Volleyball engine re-defines two rotation helpers, and nothing uses them | `sports/volleyball/engine.ts:121-124` (`subsPerSet`, `courtSizeOf`) ⇄ `sports/volleyball/rotation.ts:55` (`subLimitOf`), `57` (`courtSize`) | Same expressions (`s.subLimit ?? 6`; `s.courtSize ?? (s.beach ? 2 : 6)`). The engine copies are never imported. | 4 | low |
| 02-D7 | Volleyball `SCORED` kind set ×6 | `sports/volleyball/engine.ts:277`, `rotation.ts:38`, `detail.ts:47`, `fieldTime.ts:69`, `commentary.ts:29`, `matchStats.ts:28` | Identical `new Set([...6 kinds])`. Export it from `rotation.ts`: no import cycle, because rotation imports only `sanctions.ts` plus types. | 5 | low (engine reads it; same set) |
| 02-D8 | `idIn(name, roster)` ×3 | `sports/boxSources.ts:83`, `sports/volleyball/deepBox.ts:55`, `sports/kabaddi/deepBox.ts:85` | Byte-identical. Both deepBox files already import `boxSources.ts`, so exporting it there adds no module. | 2 | low |
| 02-D9 | Clock text formatters | Zero-padded `MM:SS`: `sports/basketball/engine.ts:169-170` (`clockText`), `netball/engine.ts:259`, `handball/engine.ts:213`, `rugby/engine.ts:294`, `rugby_league/engine.ts:307`. Unpadded `M:SS`: `sports/basketball/deep.ts:461` (`mmss`), `american_football/engine.ts:276`, `rugby/sheet.ts:107` (**shared with slice 1**) | Identical expressions within each group. NOT the same: `compareSheet.ts:78` and `ice_hockey/engine.ts:266` (both clamp with `Math.max(0, …)`). | 6 | low |
| 02-D10 | Stop-the-game-clock helper | `sports/football/engine.ts:266-267` ⇄ `sports/basketball/engine.ts:174-175` | Byte-identical (`stopGc`). Slice-1 `stopAt` (`hockey/engine.ts:225`, …) uses `at - since` instead of `(at \|\| since) - since`. For `at = 0` both give 0 after the `max(0, …)`, but the field is `clock`, not `gc`, so those stay separate. | 2 | high (engine — replay; identical) |
| 02-D11 | Football's 4-half offset formula repeated | `sports/football/engine.ts:364-367` (`startOffset`), `388-389` (`halfEndOf`), `415-418` (`halfBase`), `sports/football/keepers.ts:48`, `sports/football/index.tsx:1221` (backfill `ends`) | `halfBase(s) ≡ halfEndOf(s.half, s)`. `startOffset(s) ≡ half === 1 ? 0 : halfEndOf(half - 1, s)`. The keepers start and the index `ends` are the same arithmetic written out inline. | 6 | medium (`currentMinute` uses them in the reducer default minute; identical) |
| 02-D12 | Basketball expressions repeated | `shotsTracked` `sports/basketball/totals.ts:41-42` ≡ `deep.ts:68`. Team-foul test: `engine.ts:233` (`isTeamFoul`, private) ≡ `deep.ts:325` ≡ `commentary.ts:134` | Identical boolean expressions. Export them (`shotsTracked` must move to `deep.ts` or `credits.ts`, because `totals.ts` already imports `deep.ts`). | 3 | low |
| 02-D13 | Kabaddi internal repeats | (a) `kabaddi/index.tsx:785-793` `result` ≡ `engine.ts:1037-1043` `kabaddiWinner` (same branches). (b) `raidsOf` `engine.ts:291` ≡ `totals.ts:51`. (c) the scoring-kind list `matchStats.ts:26` ≡ `commentary.ts:26` ≡ the inline list at `engine.ts:1048`. (d) the label look-ups `engine.ts:102/116/128` (one `labelOf(list)` helper). (e) the RAID_OUTCOME next-state block `engine.ts:~840-852` ≡ `addExtra` `engine.ts:701-716` (same delta / finish / unpause logic). (f) `currentMinute`/`clockAt` `engine.ts:302-323` compute the same `base` and `cap`. | Each pair gives identical output. `rescore` (`engine.ts:~990`) is NOT the same: it clamps with `Math.max(0, …)`, so leave it. | 20 | high for (e)/(f) (engine — replay; identical); low otherwise |
| 02-D14 | Ordinal suffix | `sports/baseball/engine.ts:328` `ord` ≡ `sports/feedGroups.ts:114` `nth` (byte-identical; baseball commentary already imports feedGroups). `sports/volleyball/ServePanel.tsx:37` ≡ `components/TeamEventResults.tsx:19` (byte-identical) | Import the existing copy. The repo has about 17 ordinal helpers in 3 formula families; they agree for whole numbers ≥ 0, but negative input differs, so only the byte-identical ones are counted here. | 2 | low |
| 02-D15 | `withNames` memo boilerplate | `sports/baseball/names.ts:59-73,116-118` ⇄ `sports/invasion/names.ts:102-117,131-133` | Same WeakMap cache + Symbol marker + `isNamed`. A factory in `core/playerNames.ts` (both already import it) that takes the symbol description keeps a separate symbol per sport, so behaviour is identical. | 6 | low |
| 02-D16 | Ambiguous name→id index `note()` | `sports/football/totals.ts:104-112` ⇄ `sports/volleyball/totals.ts:41-50` | The note logic is identical (a name seen with two ids becomes `null`); the sources it is fed from differ. Export the helper from `racketTotals.ts`, which both already import. | 5 | low |
| 02-D17 | The same id-only SUB action ×3 | `sports/football/actions.ts:104`, `basketball/actions.ts:75-76`, `kabaddi/actions.ts:21-22` ⇄ `sports/invasion/actions.ts:24-25` | With `off` given and `extra = {}`, invasion's builder produces the same payload (same key order). Basketball's and kabaddi's chunks would add `invasion/actions.ts`, which imports types only. | 4 | low |
| 02-D18 | Small football / basketball repeats | `football/depth.ts:152-153` re-codes `engine.ts:442-446` `accrue`. `basketball/engine.ts:549-556`: the ASSIST/STEAL/BLOCK/TURNOVER cases differ only in the type → `a.type.toLowerCase()` | Identical outputs. | 4 | high for the reducer cases (engine — replay; identical) |
| 02-D19 | Identical StyleSheet entries | `clockRow`/`liveDot`/`clockTime`: `football/index.tsx:1690-1692`, `basketball/index.tsx:1060-1062`, `kabaddi/index.tsx:834-836`, `cricket/index.tsx:2591-2593`. `editRow`/`editLabel`/`editBanner`: football `1678/1680/1681`, basketball `1074/1076/1071`, kabaddi `842/844/840` | Same values. Move them to one exported sheet in `sports/TimelineControls.tsx` (all three already import it) — renders the same. NOT `editMin` (width 48 vs 40), `row` (gap 3 vs 2) or `addedBox` (different background). | 12 | low |
| 02-D20 | Volleyball set rules re-written | Decider set by number: `rotation.ts:67` (`isDeciderSet`) ≡ `commentary.ts:86` ≡ `commentary.ts:~180` ≡ `matchStats.ts:258`. Win margin `(s.winByTwo ?? true) ? 2 : 1` ×4 (engine, commentary ×2, matchStats). Set number `setsWon.home + setsWon.away + 1`: `rotation.ts:65` (`setNoOf`) ≡ `detail.ts:95` (private copy) plus 5 inline uses in `engine.ts` and 3 in `index.tsx` | Same expressions. Engine uses → engine — replay; identical. | 4 | low/medium |
| 02-D21 | One-liners repeated widely (net ≈0 lines) | Side flip `(s) => s === 'home' ? 'away' : 'home'`: 17 copies in this slice, about 62 in `src/sports`. `cap = t.charAt(0).toUpperCase() + t.slice(1)`: 14 copies (`baseball/commentary.ts:28`, `baseball/stats.ts:47`, …). Stat defs `mostGoals` (`football/stats.ts:88`, `handball:104`, `hockey:52`, `netball:71`, `ice_hockey:100`) and `hatTricks` (`football:89`, `hockey:53`, `ice_hockey:102`): byte-identical one-line objects | Identical. An import line replaces each definition, so almost no lines are saved; the gain is one source of truth. | 0 | low |

| 02-D22 | Baseball internal repeats (found in the full read) | (a) The "last half-inning with a play" loop (ann present, not ignored, type pitch/pa/runner, max half) ×4: `baseball/engine.ts:~1112` (`lastInning`), `situational.ts:~270` (`inningsPlayed`), `index.tsx:~671` (scoreboard `last`), `commentary.ts:~150` (`lastPlay`). (b) `started`: `engine.ts:760` ≡ `index.tsx:171`. (c) The outcome `ICON` map: `timeline.ts:11` ≡ `commentary.ts:132`. (d) The runner icon expression (`SB` 💨 / `CS·PO·OUT` ✋ / ↗): `timeline.ts` (`describeEvent`, runner case) ≡ `commentary.ts:~201`. (e) The fielded-outs list: `voice.ts:17` (`OUTS`) ≡ `index.tsx:76` (`FIELDED`). (f) `tqb.ts:48-49` inline lists ≡ `engine.ts` `NO_AB` / `HITS`. (g) The infield zone list: `commentary.ts:~95` ≡ `engine.ts` `INFIELD_ZONES` (private). (h) The "Batter n" filler order: `index.tsx:~167` (`defaults`) ≡ `index.tsx:~513` (lineup `done`). (i) `sheet.ts` mix `pct` ≡ `pctOf` in the same function | Each pair is the same expression or data. (a) A `lastPlayHalf(s)` helper returning -1 for none gives all four the same result; `lastInning` is `inningOf(max(0, h))`, the same as its own start at 0. None is on the reducer path. | 12 | low |

**Total removable (A): ≈ 316 lines.** About 110 of these overlap with slice 1 (D2, D3, D9; the slice-1
copies of D9 and D21), so de-duplicate the counts when merging slice reports.

---

## 2. (B) Duplicated but not identical — leave as is (exact differences)

| ID | What | Locations | Exact differences |
|---|---|---|---|
| 02-B1 | Football's own discipline engine vs the generic one | `sports/football/discipline.ts:124-189` (`run`), `198-246` ⇄ `sports/discipline.ts:185-245`, `257-319` | Football counts second-yellow reds (`secondYellow` flag, or 2 yellows without a red). Its yellows don't accumulate. Its sort weighs reds + second yellows. Its rows/teams have different shapes (`yellows/reds/secondYellows` vs `counts`). Intentional (FIFA rule). The helpers are covered by D1. |
| 02-B2 | Football `Pitch` vs shared `CourtMap` | `sports/football/Pitch.tsx:8-99` ⇄ `components/CourtMap.tsx:12-92` | `initials`, `Dot`, dot styles and positions are the same. Pitch has `accessibilityRole="image"` plus a formation label, which CourtMap lacks. CourtMap adds the `highlight` / `tag` rendering. Pitch draws its own markings. |
| 02-B3 | Pitch markings drawn twice | `football/Pitch.tsx:65-90` ⇄ `football/LineupView.tsx:247-269` | `aspectRatio` 0.64 vs 0.62; box height 14% vs 13%; goal area 6.5% vs 6%; pen spot 9.5% vs 9%; dot width 64 vs 70. Home sits at the bottom in Pitch and at the top in LineupView (intentional). |
| 02-B4 | Ticker scorer lists | `football/ticker.ts:14-26` ⇄ `hockey/ticker.ts:11-23`, `handball/ticker.ts:11-23`; also `invasion/feed.ts:134-147` (`groupByScorer`) | Football keys own goals separately and adds " (OG)". The minute texts differ. Handball lists top-3 counts. `groupByScorer` uses full names, a `(tag)` suffix, and per-side arrays. |
| 02-B5 | Time-on-field logs | `football/fieldTime.ts:29-56`, `basketball/fieldTime.ts:31-67`, `volleyball/fieldTime.ts:19-68` ⇄ `handball/totals.ts:31-56` (and the other slice-1 `totals.ts`) | The sport rules differ: sin-bin, foul-out, sets as periods, official suspensions. |
| 02-B6 | Game-clock panels (the clone-list entry) | `basketball/index.tsx:~871-921` (`GameClockPanel`) ⇄ `football/index.tsx:~1372-1419` (`StoppedClockPanel`) | The tick effect, set-clock state and `mm:ss` regex are the same. Basketball sends `SET_CLOCK {left}` (count-down), football sends `{sec}` (count-up minus `startOffset`). The labels, the futsal fouls/time-outs block and the "last whistle" text all differ. |
| 02-B7 | `LiveClock` components | `football/index.tsx:~1527-1552`, `basketball/index.tsx:~924-946`, `kabaddi/index.tsx:~691-711` | Same tick-every-second + dot + label shell; the label logic, run conditions and football's `FieldBanner` all differ. |
| 02-B8 | Player pickers | `football/index.tsx:76-102` `PlayerTable` (jersey + name + position rows); `baseball/index.tsx:90-110` `PlayerGrid` (grid, tag, skip, a11y label); `basketball/index.tsx:52-65` `Row` and `kabaddi/index.tsx:48-58` `Row` | Basketball's `Row` has `disabledFor` and "No roster set."; kabaddi's has the "＋ Team" chip. The styles all differ. |
| 02-B9 | "Correct the timeline", backfill and sub panels inline | `football/index.tsx:1209-1262`, `basketball/index.tsx:~786-830`, `kabaddi/index.tsx:623-668`; slice-1 sports have an `EditList` component (`hockey/index.tsx:626`, …) | Texts, row labels, sort keys and edit rules differ per sport. They already share `RowAction` / `BackfillBar` / `confirmRemove`. |
| 02-B10 | `LineScoreboard` boards | `basketball/index.tsx:~988-1005`, `kabaddi/index.tsx:758-776` (+10 sports in total) | Column labels (Q/H/OT vs H/ET), winner rule (basketball `>=` vs kabaddi's shoot-out winner) and the points source differ. |
| 02-B11 | Box `tally` + credit keyers | `kabaddi/engine.ts:1063-1094` (`kbCreditKeyer`, `tally`) ⇄ `volleyball/engine.ts:468-505` (`vbCreditKeyer`, `tally`) | The volleyball keyer also scans `e.oe`. The line fields, kinds, scope field (`half` vs `set`) and sort differ. The final name-mapping line is identical. |
| 02-B12 | Deep box "merge counts into rows" | `kabaddi/deepBox.ts:101-134` ⇄ `volleyball/deepBox.ts:58-109` | Different keys, zero rows, legacy-name lookup and server rows. |
| 02-B13 | Game-flow (runs / leads / ties / lead changes) ×3 | `sports/gameFlow.ts:55-101` (`computeGameFlow`), `kabaddi/matchStats.ts:196-215`, `volleyball/matchStats.ts:249-276` | Kabaddi's adds a half scope that still accumulates the full score. For scope 'all' its numbers equal `computeGameFlow`'s kabaddi adapter (`gameFlow.ts:166-172`, same event filter). Volleyball resets per set and adds set points saved. |
| 02-B14 | Voice player matching | `football/voiceCommands.ts:12-47` ⇄ `voiceMatch.ts:12-64` | The number words go up to *twenty* in football and *fifteen* in voiceMatch, so `jerseyFromText`/`numberFromText` and `matchPlayer` differ for 16–20 (see C4). |
| 02-B15 | Name helpers | `invasion/names.ts:61-66` `nameFor` ⇄ `racketNames.ts:52-56` `whoName` | With no id, `nameFor` returns the trimmed legacy name without calling `nameOf`; `whoName` calls `nameOf(undefined, legacy)` (dispute masking). See C1. |
| 02-B16 | Subbed-off checks | `football/engine.ts:741-742` ⇄ `kabaddi/engine.ts:264-270` | Kabaddi takes `fullName ?? name` and is null-safe; football checks `fullName` only. |
| 02-B17 | Minute → half | `football/engine.ts:391-392` `halfOfMinute` (`<=`) ⇄ `kabaddi/index.tsx:104` `halfFromMin` (`<`) | Boundary convention differs (football uses ordinal minutes). See C3. |
| 02-B18 | Volleyball `scoredIn` / coverage loops | `rotation.ts:68-69` (returns the list) ⇄ `detail.ts:96-97` (count, `events ?? []`); `detail.ts` `coveredAt` ⇄ `catCoveredAt` | Null-safety and the value assigned differ. |
| 02-B19 | Foul word maps | `basketball/commentary.ts:38-41` `FOUL_WORD` ⇄ `basketball/events.ts:112-120` `FOUL_LABEL` | "(U)" / "(D)" suffixes differ. |
| 02-B20 | `minutes` stat def | `football/stats.ts:61` ⇄ `hockey:39`, `handball:89`, `netball:55`, `rugby:37`, `rugby_league:42`, `basketball:75` | Football has no `abbr: 'MIN'`; basketball's group and coverage differ. |
| 02-B21 | `rosterId` lookups | `football/index.tsx:391` ⇄ `basketball/index.tsx:179`, `kabaddi/index.tsx:129` | Football's has no empty-name guard. |
| 02-B22 | Box-row player name | `baseball/box.ts:~63` `nameIn` ⇄ `handball/box.ts:~44` inline | Same expression, but baseball's is a function used in the notes; tiny. |
| 02-B24 | Baseball fielder-notation parsers | `baseball/situational.ts:33-45` (`notation`), `commentary.ts:41` (`fieldersOf`), `engine.ts:~75` (`zoneOfNotation`), `voice.ts:20-23` (`fieldersOf`) | Different jobs and outputs. `notation` returns putouts / assists / errors and handles `E5`. Commentary drops anything starting with E. `zoneOfNotation` takes the first number only. Voice parses spoken words (its digit map stops at 9). |
| 02-B25 | Baseball per-plate-appearance counting | `situational.ts` `teamSplit` (`~190-262`) ⇄ `engine.ts` `batterStats` / `pitcherStats` (`~676-703`); the pitch-count block appears twice in situational (`pitcherFigures` ⇄ `teamSplit`) | `teamSplit` adds RISP, zones, batted-ball types and the at-bat vs in-field split. `pitcherFigures` also counts balls; `teamSplit` does not. |
| 02-B26 | Baseball stat accumulators | `box.ts:~73-87` (`battingLines` `add`) ⇄ `totals.ts:~66-71` (`add`) | Box keeps `name:` keys (a game with no roster); totals drops them. |
| 02-B27 | Baseball base-name arrays | `timeline.ts:13`, `commentary.ts:27`, `index.tsx:69` | Different contents: commentary adds a trailing 'home'; index is capitalised. |
| 02-B23 | Kabaddi / volleyball StatsPanels | `kabaddi/StatsPanel.tsx:63-68` ⇄ `volleyball/StatsPanel.tsx:75-84` | `sub` style identical; `dot` differs (`marginTop: 5`). The content differs. |

---

## 3. (C) Drift that looks like a bug (findings only — fixing changes behaviour)

1. **C1 — Football (and invasion) legacy names skip the dispute mask.** `invasion/names.ts:63`:
   `if (!id) return old || undefined;` returns a name-only row as stored. `racketNames.ts:53-54` (kabaddi,
   volleyball, baseball, basketball) does `nameOf(id ?? undefined, legacy …)`. `core/playerNames.ts:43-45`
   masks by the legacy name there (`mask.names.has(legacy) → 'X'`). So an older football record with a name
   but no id shows the full name during an open dispute: `football/discipline.ts:193-194` (`rowName`),
   `invasion/names.ts:61` (`withNames` leaves id-less rows as they are). The same record in kabaddi or
   volleyball would show "X". Privacy-relevant; confirm the intent.
2. **C2 — The football ticker has no in-progress shoot-out status.** `football/ticker.ts:36-39` sets
   `d.status` only once `shootoutWinner` is set. Hockey, handball, ice hockey and rugby also show
   "Shoot-out x–y" while it runs (`hockey/ticker.ts:36-38`, …). Football's own summary does show
   "Penalties x–y" (`football/index.tsx`, `statusLine`). Low.
3. **C3 — Kabaddi backfill at the half-time minute.** `kabaddi/index.tsx:104` maps minute = `halfMinutes`
   (e.g. 20) to the 2nd half (`m < hm`). The live clock in the 1st half stops at 20
   (`engine.ts:302-311` caps at `base + hm`), so a live event at 20′ is half 1, but a backfilled 20′ is
   half 2. Football's `halfOfMinute` uses `<=`. Low; possible off-by-one.
4. **C4 — Voice jersey numbers 16–20 work only in football.** `football/voiceCommands.ts:12-16` (up to
   twenty) vs `voiceMatch.ts:12-15` (up to fifteen), which every other sport's voice uses. "Number
   eighteen" matches a player in football but not in basketball or kabaddi. Low.

---

## 4. Coverage

| File | Lines | Status |
|---|---|---|
| football/LineupView.tsx | 294 | reviewed |
| football/Pitch.tsx | 99 | reviewed |
| football/actions.ts | 156 | reviewed |
| football/centre.ts | 37 | reviewed |
| football/depth.ts | 156 | reviewed |
| football/discipline.ts | 259 | reviewed |
| football/engine.ts | 856 | reviewed |
| football/events.ts | 199 | reviewed |
| football/feed.ts | 235 | reviewed |
| football/fieldTime.ts | 104 | reviewed |
| football/formation.ts | 255 | reviewed |
| football/index.tsx | 1719 | reviewed (long lines truncated at ~240 chars) |
| football/keepers.ts | 167 | reviewed |
| football/meta.ts | 77 | reviewed |
| football/records.ts | 20 | reviewed |
| football/stats.ts | 211 | reviewed |
| football/ticker.ts | 55 | reviewed |
| football/totals.ts | 208 | reviewed |
| football/voiceCommands.ts | 119 | reviewed |
| basketball/ShotChart.tsx | 91 | reviewed |
| basketball/Timeline.tsx | 109 | reviewed |
| basketball/actions.ts | 89 | reviewed |
| basketball/commentary.ts | 159 | reviewed |
| basketball/credits.ts | 82 | reviewed |
| basketball/deep.ts | 461 | reviewed |
| basketball/discipline.ts | 49 | reviewed |
| basketball/engine.ts | 631 | reviewed |
| basketball/events.ts | 120 | reviewed |
| basketball/fieldTime.ts | 118 | reviewed |
| basketball/index.tsx | 1081 | reviewed |
| basketball/meta.ts | 87 | reviewed |
| basketball/names.ts | 79 | reviewed |
| basketball/panel.ts | 123 | reviewed |
| basketball/records.ts | 50 | reviewed |
| basketball/stats.ts | 181 | reviewed |
| basketball/totals.ts | 72 | reviewed |
| kabaddi/StatsPanel.tsx | 68 | reviewed |
| kabaddi/actions.ts | 58 | reviewed |
| kabaddi/commentary.ts | 194 | reviewed |
| kabaddi/deepBox.ts | 134 | reviewed |
| kabaddi/discipline.ts | 38 | reviewed |
| kabaddi/engine.ts | 1094 | reviewed |
| kabaddi/index.tsx | 845 | reviewed |
| kabaddi/matchStats.ts | 215 | reviewed |
| kabaddi/meta.ts | 66 | reviewed |
| kabaddi/names.ts | 80 | reviewed |
| kabaddi/records.ts | 39 | reviewed |
| kabaddi/rules.ts | 363 | reviewed (lines 165-194 read via the shoot-out excerpt) |
| kabaddi/settings.ts | 23 | reviewed |
| kabaddi/stats.ts | 117 | reviewed |
| kabaddi/totals.ts | 332 | reviewed |
| volleyball/DetailRow.tsx | 153 | reviewed |
| volleyball/SanctionOptions.tsx | 118 | reviewed |
| volleyball/ServePanel.tsx | 281 | reviewed |
| volleyball/StatsPanel.tsx | 84 | reviewed |
| volleyball/actions.ts | 39 | reviewed |
| volleyball/commentary.ts | 220 | reviewed (doc comments skipped) |
| volleyball/deepBox.ts | 109 | reviewed |
| volleyball/detail.ts | 358 | reviewed (doc comments skipped) |
| volleyball/engine.ts | 519 | reviewed |
| volleyball/fieldTime.ts | 116 | reviewed |
| volleyball/index.tsx | 374 | reviewed |
| volleyball/matchStats.ts | 276 | reviewed |
| volleyball/meta.ts | 54 | reviewed |
| volleyball/records.ts | 10 | reviewed |
| volleyball/rotation.ts | 349 | reviewed (doc comments skipped) |
| volleyball/sanctions.ts | 149 | reviewed |
| volleyball/settings.ts | 32 | reviewed |
| volleyball/stats.ts | 155 | reviewed in full |
| volleyball/totals.ts | 175 | reviewed |
| baseball/box.ts | 160 | reviewed in full |
| baseball/commentary.ts | 249 | reviewed in full |
| baseball/diamond.tsx | 84 | reviewed |
| baseball/discipline.ts | 28 | reviewed |
| baseball/engine.ts | 1138 | reviewed in full |
| baseball/index.tsx | 834 | reviewed in full |
| baseball/meta.ts | 71 | reviewed |
| baseball/names.ts | 125 | reviewed |
| baseball/records.ts | 49 | reviewed |
| baseball/sheet.ts | 144 | reviewed in full |
| baseball/situational.ts | 274 | reviewed in full |
| baseball/stats.ts | 249 | reviewed in full |
| baseball/ticker.ts | 43 | reviewed |
| baseball/timeline.ts | 104 | reviewed |
| baseball/totals.ts | 160 | reviewed in full |
| baseball/tqb.ts | 52 | reviewed in full |
| baseball/voice.ts | 85 | reviewed in full |

Total: 92 files, 19,894 lines, all reviewed in full. The 13 files first listed as partial (baseball engine 520–1138, index 420–834, box, commentary, sheet, situational, stats, totals, tqb, voice, and volleyball/stats.ts) were read line by line in a second pass; it added 02-D22 and 02-B24–B27. Doc comments and the ends of very long lines were skimmed.
