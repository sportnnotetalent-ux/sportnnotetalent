# Slice 11: `src/data/results/` (results engine) duplication audit

Scope: all 54 files, 13,975 lines. Each file read in full. I grepped `src/`, `tests/`, `scripts/` and `supabase/` to find copies outside the slice. The scope change applies: **duplicates only.** Each finding is classed **(A)** removable with zero behaviour change, **(B)** not identical (leave it), or **(C)** drift that looks like a bug. "Lines removable" counts (A) only.

The exact-clone scan (`exact-clones-all.txt`) has **no entries inside `src/data/results/`**. Its results-related entries are all in the UI (`components/results/*Career.tsx`), which is another slice. Everything below is near-duplicates and patterns.

**Bundle facts used in this report (checked):**
- The per-sport chunks (`src/sports/*`) import only these files from this folder: `archeryDefs.ts`, `cyclingDefs.ts`, `shootingDefs.ts`, `crewDefs.ts` and `positions.ts`. All five have no imports today.
- Every other file in the folder reaches screens through `index.ts`, so they already share one module graph.
- So a helper added to any non-defs file does not grow a sport chunk. Adding an import to one of the five files above does.

---

## 1. Duplicates

| ID | Title | Class | Locations | Lines (all copies) | Removable (A only) | Risk |
|---|---|---|---|---|---|---|
| 11-D1 | Ordinal suffix ("1st", "22nd") | A | see below | ~12 in slice, ~10 outside | 6 in slice (+~8 outside) | low |
| 11-D2 | HTML `esc()` | A (needs a home) | 6 copies | 6 | 5 (outside slice) | low |
| 11-D3 | Wind text "+1.2 / −0.4" | A | 3 copies | 3 | 2 | low |
| 11-D4 | Points-scheme parsing in the 7 `*MeetSettings` | A | 7 copies | ~16 | 12 | low |
| 11-D5 | Shared position points for tied places | A (inner calc) | 3 copies | ~42 | 12 | medium (medal table) |
| 11-D6 | Relay-factor multiply on awards | B | 4 copies | 6 | 0 | — |
| 11-D7 | `setWalkover` ≡ `setShootWalkover` | A | 2 | 10 | 4 | low |
| 11-D8 | `crewMarkKey` ≡ `cycMarkKey` | A | 2 | 2 | 1 | low |
| 11-D9 | `champKey` ≡ `groupKey` (+ `groupLabel`) | A | 2 | 3 | 2 | low |
| 11-D10 | `AGES` + `ageRank` (field ≡ swimming); athletics differs | A for 2 copies / C for the third | 3 | ~16 | 2 | low |
| 11-D11 | Gender-text regexes | A | 3 | ~5 | 2 | low |
| 11-D12 | Medal emoji maps | A (1 site) / B | 4 in slice + UI | ~10 | 1 | low |
| 11-D13 | Award → medal stat keys | A (2 sites) / pattern | 11 sites | ~20 | 4 | medium (stat lines) |
| 11-D14 | Career builders (PB-so-far, pb/sb, history, medal of line) | B (pattern) | 6 careers | ~420 | 0 | high |
| 11-D15 | Match W/L counting over a bracket | A (2 sites) / B | 5 | ~25 | 5 | medium |
| 11-D16 | Serpentine heat seeding | A | 2 | 6 | 2 | medium (seeding) |
| 11-D17 | "Every N metres" split loops | A (1) / B (cross-file) | 4 | ~10 | 2 | low |
| 11-D18 | "Still competing" predicate (not DNS/WD/DQ) | A | 11 | 11 | 9 | low |
| 11-D19 | `stageOf` ≡ `positionOf` shape | A | 2 | 10 | 3 | low |
| 11-D20 | Net-of-penalty series (`netSeries` vs inline in `qualKeys`) | A | 2 | 2 | 1 | high (ranking) |
| 11-D21 | Bracket match order comparator | A | 2 | 4 | 2 | low |
| 11-D22 | `feed()` progression helper | A | 2 | 8 | 4 | low |
| 11-D23 | `pad2` helper | A | 3 | 3 | 2 | low |
| 11-D24 | `beats` ≡ `betterMark` | A | 2 | 2 | 1 | medium (records) |
| 11-D25 | Shared places: `placesOf` vs `sharedPositions` | B | 2 | ~17 | 0 | — |
| 11-D26 | Reverse of `categoryKey` | B + C | 2 | ~9 | 0 | — |
| 11-D27 | Hand-time conversion tables | B + C | 2 | ~9 | 0 | — |
| 11-D28 | Lead-change counting in commentary / stats | B + C | 5 | ~40 | 0 | — |
| 11-D29 | Phase stat-line builders | B (pattern) | 8 | ~300 | 0 | high |
| 11-D30 | Unranked-status tail of every ranker | B (pattern) | 7 | ~14 | 0 | high |
| 11-D31 | Time parsing: `parseRoadTime` vs `parseMark` | B | 2 | ~25 | 0 | — |
| 11-D32 | Age from DOB / DOB parsing | B + C (low) | 3 + 2 | ~25 | 0 | — |
| 11-D33 | `splitPlaces` vs `splitPlacesFor` | B | 2 | ~20 | 0 | — |
| 11-D34 | Qualification row snapshots (`qual: {...}`) | B | 4 | 4 | 0 | — |
| 11-D35 | m:ss text helpers | B | 3 | 4 | 0 | — |
| 11-D36 | Penalty totals (float vs tenths) | B | 2 | 2 | 0 | — |
| 11-D37 | Medal-table sort order across layers | B, consistent (no drift) | 4 | 4 | 0 | — |
| 11-D38 | `fmtTime` in the stat schemas vs `formatMark` | B (cross-layer) | 4 + 1 | ~28 | 0 (in slice) | — |

**Total removable (A):** about **79 lines inside the slice**, plus about **14 lines of identical copies outside it** (D1, D2, D3).

### Details

**11-D1 Ordinal suffix (A).**
- Formula `['th','st','nd','rd'][((n%100)-20)%10] ?? [...][n%100] ?? 'th'`:
  - `athletics.ts:615` (`ordSuffix`, suffix only)
  - `weightlifting.ts:310` (`ordinal`)
  - `shooting.ts:379`
  - `archery.ts:373`
  - `crews.ts:223`
  - `cycling.ts:224`
  - `raceDepth.ts:633` (`raceOrdinal`)
- Formula `v>=11&&v<=13?'th':[..][n%10]`: `insightFeed.ts:35-39` (`ordinalOf`).
- Outside the slice, same output:
  - `screens/ResultsEventScreen.tsx:1431`
  - `components/TeamEventResults.tsx:19`
  - `sports/recordHelpers.ts:7-11`
  - `sports/feedGroups.ts:114`
  - `sports/baseball/engine.ts:399`
  - `data/feeders.ts:53`
  - `core/matchSafety.ts:232`
  - `sports/volleyball/ServePanel.tsx:37`

I ran all three formula families for n = 0…2000 (scratch script) and they return **identical strings**. To consolidate, keep `insightFeed.ts` `ordinalOf`: it has no imports and is already in the results graph, so there is no bundle effect. Keep `ordSuffix` / `ordinal` / `raceOrdinal` as one-line aliases, because they are imported by `AthleticsCareer.tsx`, `raceCommentary.ts` and tests. `weightlifting.ts:573` strips the number back off with `.replace(/^\d+/, '')`, which is equivalent to `ordSuffix`.
- **Not part of this:** `liftingTeam.ts:109` `placesText` uses `['st','nd','rd'][i] ?? 'th'`. That gives "21th", so it is a bug (see C4), not a copy.

**11-D2 `esc()` (A, needs a decision on where it lives).** Byte-identical; md5 matched after stripping `export`:
- `printSheets.ts:25`
- `core/orgVerification.ts:650`
- `core/certificates.ts:132`
- `core/hallOfFame.ts:168`
- `core/passport.ts:42`
- `sports/chess/roundSheet.ts:177`

`printSheets.ts` imports `marks`, `model` and `timetable`, so importing it from chess would pull the results engine into the chess chunk. It needs a dependency-free home, such as a tiny core html helper. `core/fixturesText.ts:22` is different (no `'` escaping): B.

**11-D3 Wind text (A).**
- `raceCommentary.ts:61` `windText` ≡ `components/results/ResultsSheet.tsx:26` `windText` ≡ the inline expression in `printSheets.ts:180`.
- Put it in `marks.ts`; all three importers already reach it.
- `athletics.ts:589` career text `(${w>0?'+':''}${w.toFixed(1)})` is **B**: negatives print an ASCII "-" there and a "−" (U+2212) elsewhere.

**11-D4 Points-scheme parsing (A).**
- Identical `String(fmt?.pointsScheme ?? '8,7,…').split(',').map(Number).filter(finite && >=0)` plus the fallback `[8,…,1]`:
  - `athletics.ts:43-45`
  - `swimming.ts:80,83`
  - `weightlifting.ts:395-397`
  - `shooting.ts:254-255`
  - `archery.ts:242-243`
  - `crews.ts:54,57`
  - `cycling.ts:37-38`
- The `relayFactor` parse `Number(fmt?.relayFactor ?? 1) || 1` is identical in `athletics.ts:46`, `swimming.ts:84` and `crews.ts:58`.
- `shootMeetSettings` and `archMeetSettings` have identical bodies.
- Put a `positionPointsOf(fmt)` helper in `medals.ts`. It must return a fresh array each call, as every copy does today; return `[...DEFAULT_EVENT_POINTS]`, not the shared constant.
- `competitionRules.ts:443-446` `sprintTable` uses the same split/filter with another key and default: B.

**11-D5 Shared position points (A for the points maths).**
- Copies: `medals.ts:32-46` `eventAwards`, `road.ts:235-250` `teamAwards`, `combined.ts:229-245` `combinedAwards`.
- The `table` default, the group count, the `ties` share average and `Math.round(…*100)/100` are character-identical.
- What differs, and is intentional: the row filter (`combinedAwards` drops `out`), the `entryId` (`team:${key}` / the last cell's entryId) and the `team` object.
- The `['gold','silver','bronze']` constant is copied at `medals.ts:29`, `road.ts:238`, `combined.ts:232` and `alerts.ts:20`.
- Extract `pointsFor(table, pos, group, ties)` and `MEDALS` into `medals.ts`. This feeds the medal table, so keep the existing tests green.

**11-D6 Relay factor (B).**
- Copies: `athletics.ts:668`, `data/resultsStore.ts:825` and `:829`, `screens/ResultsEventScreen.tsx:526-529`.
- The multiply is the same everywhere. The guard differs: the first three skip when `relayFactor` is falsy; the screen multiplies whenever it is not 1, so a factor of 0 would zero the points on screen only.
- A 0 can't come from the settings functions (`|| 1`), but the copies are not identical for every input. Leave as is, or decide on one helper.

**11-D7 (A).** `archery.ts:196-200` `setWalkover` and `shootMatch.ts:176-180` `setShootWalkover` have identical bodies. Don't make `shootMatch.ts` import `archery.ts`: that adds the cycle shootMatch → archery → archeryInsights → rank → shootMatch. Put one generic `setSideWalkover` in a file both already import. Tests and UI call both names, so keep them as aliases.
- The wider pattern `{ ...(r.mp?.[key] ?? {}) } … { ...r, mp: { ...(r.mp ?? {}), [key]: side } }` appears 9 times (`archery.ts:139-200`, `shootMatch.ts:157-180`, `cycling.ts:184-191`). Each differs in its body: B.

**11-D8 (A).** `crews.ts:336` ≡ `cycling.ts:229` (`` `m_${d.replace(/\./g,'_')}` ``).

**11-D9 (A).** `champions.ts:47` `champKey` ≡ `liftingTeam.ts:50` `groupKey`. `liftingTeam.ts:51` `groupLabel` (`.trim() || 'Open'`) gives the same output as the label in `champions.ts:98`, because `categoryLabel` never returns blank or padded text.

**11-D10.** `field.ts:25-26` ≡ `swimming.ts:98-99`: the same `AGES` list and `Math.max(0, AGES.indexOf(age ?? 'Open'))`. That pair is A (move to `model.ts`). `athletics.ts:65,103-113` has the same list, but its `ageRank` maps SD-153 bands. That copy is **C** (see C2).

**11-D11 (A).** `/^(m|male|man|boy)/` and `/^(f|female|woman|girl)/` on trimmed lower-case text appear at `athletics.ts:87-88`, `swimming.ts:317` and `teamEvents.ts:139-140`. `entries.ts:363-366` `readGender` differs (exact match, accepts b/g/w): B.

**11-D12.**
- `raceCommentary.ts:63` `MEDAL[p-1]` is only read for positions 1–3 (filtered at `:180`, `:291`), so it can use `insightFeed.MEDAL_ICON[p]`: A.
- `teamResults.ts:144` `medalIcon` (returns '' when unknown) vs the UI `MEDAL` objects (`CrewCareer.tsx:20` and others; return `undefined`): B.

**11-D13 Award → stat keys.**
- `if (a?.medal==='gold') s.golds=1; else if …` appears at:
  - `shooting.ts:349`
  - `archery.ts:338`
  - `cycling.ts:267`
  - `road.ts:290` (and `:300` for team medals)
  - `combined.ts:360`
  - `weightlifting.ts:450`
  - `teamEvents.ts:160`
- `athletics.ts:438-440` and `crews.ts:368-370` use three separate `if`s, which give the same result. Turning those into the one-line form is the only real line saving (4).
- The counting into a table (`golds += 1` chains) appears at `champions.ts:71`, `athletics.ts:769`, `teamResults.ts:102` and `data/medalStandings.ts:147-149`: same output.
- A shared `medalKeys(award)` helper in `medals.ts` is A but saves few lines. `weightlifting.ts:451-459` `posPoints` (adds lift medals, rounds) differs: B.

**11-D14 Career builders (B, pattern).** These six share one skeleton: sort by date, a `pbSoFar` map, a `bests` map with pb/sb, the season check, `history.reverse()`, and `c.points = round2`:
- `athletics.ts:524-609`
- `weightlifting.ts:524-586`
- `shooting.ts:382-445`
- `archery.ts:377-441`
- `crews.ts:406-447`
- `cycling.ts:318-370`

Keys, labels, text and best-key rules differ by sport on purpose.
- The line `const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined` is identical in all 6 (`:584`, `:571`, `:425`, `:421`, `:431`, `:350`). A helper is A but saves 0 lines.
- The `records.unshift` line is identical in `crews.ts:440` and `cycling.ts:363`; athletics `:603` uses `eventTitle` and `markText`, so it is B.

These builders write profile history, so leave the structure.

**11-D15 Match W/L.**
- `archery.ts:311-318`: `mW`/`mL` equals `archeryInsights.ts:273-288` `matchPlayOf` `won`/`lost`. The skip rules are equivalent: a walkover is excluded from W/L in both, and `matchPlayOf` is already called at `:320`. Use `mp.won`/`mp.lost`: A, 2 lines. Keep the `sp`/`spA` loop.
- `cycling.ts:270-274` `sprintW`/`sprintL` equals `matchPlayOf(...).won/lost`: in `bracketState` a decided match is always a bye or has `out`. That is A (3 lines). `cycling.ts` is not in a sport chunk, so there is no bundle effect.
- The team `tmW`/`tmL` loops in `archery.ts:283-288` and `shooting.ts:301-306` are B: shooting has no byes, and its state type differs.

**11-D16 (A).** The serpentine bucket fill in `progression.ts:146-149` and `crews.ts:326-327` is the same index maths (`round%2===0 ? k : n-1-k`). It affects seeding, so add a seeding test before sharing it.

**11-D17.**
- `raceSplitDefs.ts:59` `every400` equals the inline `every` at `:81` called as `(400, total)`: A.
- `swimming.ts:406-407` and `crewDefs.ts:109-110` use the same loop. B as a recommendation: `crewDefs.ts` is in the rowing/canoe chunk, so importing `raceSplitDefs.ts` would grow it by about 110 lines.

**11-D18 (A).** `!['DNS','WD','DQ'].includes(status ?? 'ok')` appears at:
- `progression.ts:74` and `:85`
- `field.ts:145`
- `weightlifting.ts:252`
- `liftingInsights.ts:42`
- `liftingPoints.ts:31`
- `shootingRank.ts:95`
- `shootMatch.ts:93` (with `!!e`)
- `archeryBracket.ts:197` (with `!!e`)
- `shootingInsights.ts:24`
- `archeryInsights.ts:23`

Add `isCompeting(status)` in `model.ts` next to `STATUS_ORDER`. `model.ts` is not imported by the sport chunks.

**11-D19 (A).** `shootingDefs.ts:108-112` `stageOf` and `:174-178` `positionOf` compute `per` the same way (`ceil(shots/seriesOf) === seriesCount`). One generic helper in the same file; no bundle effect.

**11-D20 (A).** `shooting.ts:112` `netSeries` and the inline copy at `shootingRank.ts:42` give identical keys, because every value goes through `tenths()` afterwards. Don't import `shooting.ts` into `shootingRank.ts` (cycle). Move `netSeries` into `shootingDefs.ts`, but note that `shootingDefs.ts` is in the shooting chunk (adds about 1 line there).

**11-D21 (A).** The comparator at `archeryBracket.ts:282-283` (`round==='B' ? rounds-0.5`, then slot) is the same as `archeryInsights.ts:94-97` `matchOrder`.

**11-D22 (A).** `athletics.ts:190-193` `feed` ≡ the inner `feed` at `plan.ts:58-61`. `athletics.ts` already imports `plan.ts`.

**11-D23 (A).** `marks.ts:10` `pad2` ≡ `timetable.ts:78` `pad` ≡ `entries.ts:343` `pad`.

**11-D24 (A).** `recordBook.ts:34` `beats(v,cur,better)` ≡ `rank.ts:155` `betterMark(v,cur,{better})`.

**11-D25 (B).** `insightFeed.ts:47-55` `placesOf` (returns `{place}`, chains neighbours, O(n²) tie) vs `positions.ts:9-16` `sharedPositions` (returns `{position}`, walks back against the current row). The results match only when `same` is transitive. Leave as is.

**11-D26 (B + C).** `teamResults.ts:136-142` `categoryFromKey` and `recordBook.ts:167-171` (inside `recordLine`) both reverse `categoryKey`, differently:
- `recordLine` keeps only age and gender, so the weight class and shot count are lost.
- `categoryFromKey` keeps the weight class but treats an unknown course token as a weight class. See C3.

**11-D27 (B + C).** `athletics.ts:343-347` `handConversion` vs `combinedDefs.ts:83-87` `handAdd`. Both are "+0.24 s up to 200 m and sprint hurdles, +0.14 s 300–400 m". `handAdd` covers 60 m / 60 mH; `handConversion` does not, and it covers 80 mH / 300 mH / 400 mH / 4×100 instead. See C6.

**11-D28 (B + C).** Lead-change counting appears five times:
- `shootingInsights.ts:100-103`, `:297-306`, `:339-347`
- `archeryInsights.ts:74-77`, `:255-264`

Each copy has a different tie key. See C5.

**11-D29 (B, pattern).** Every phase stat-line builder repeats the same prelude: skip DNS/WD, place, dnf/dq, finals, medals, posPoints, members' lines.
- `athletics.ts:422-465`
- `crews.ts:351-385`
- `cycling.ts:246-300`
- `road.ts:274-305`
- `shooting.ts:282-355`
- `archery.ts:267-343`
- `weightlifting.ts:436-482`
- `combined.ts:345-364`

The keys differ per sport on purpose (`races` vs `comps`, OTL, seats, cox). These write stat lines, so leave them.

**11-D30 (B).** Every ranker appends the unranked rows sorted by `STATUS_ORDER`. Some also break ties by start order, some don't, and labels differ:
- `rank.ts:208-210`
- `shootingRank.ts:236-237`
- `shootMatch.ts:146-147`
- `archeryBracket.ts:355-356`
- `road.ts:59-61`
- `cyclingRank.ts:229-230`
- `cyclingRank.ts:257-260`

These rank saved results, so leave them.

**11-D31 (B).** `road.ts:88-96` vs `marks.ts:44-57`: the same h:m:s validation and ceiling. `parseMark` also accepts "1.52.34" and keeps thousandths; `parseRoadTime` accepts packed digits.

**11-D32 (B + C low).**
- `entries.ts:476-482` `yearsOn` (local date) vs `core/age.ts:27-34` `ageOn` (string dates, capped below 130) vs `data/rosterImport.ts:249-253` `ageOn` (UTC `toISOString`). See C8.
- `entries.ts:348-361` `readDob` vs `core/region.ts:293-303` `parseTypedDate`: `readDob` rejects impossible and future dates. `region.ts` imports React and AsyncStorage, so the pure engine can't import it.

**11-D33 (B).** `raceDepth.ts:256-267` `splitPlaces` (only used by tests) vs `:275-281` `splitPlacesFor`. A test asserts they are equal when every row uses the same points; they differ when rows read different lap points.

**11-D34 (B).** The qualification-row snapshots differ in their fields:
- `archery.ts:210-212` (tens, xs default 0)
- `shootMatch.ts:152-154` and `shooting.ts:188-190` (xs, series only if present)
- `cycling.ts:178-180` (mark only)

**11-D35 (B).** `liftingClock.ts:60-63` `clockText` (ceil), `cycling.ts:108` `startText` ("+" prefix, hours via `formatMark`) and `cyclingRank.ts:45` `secsText` all format time text in different shapes.

**11-D36 (B).** `shooting.ts:109` `penaltyTotal` (float sum) vs `shootingDefs.ts:158` `finalPenaltyTotal` (via tenths). They give the same result for whole-point penalties, but they are not identical for every input.

**11-D37 (B, consistent).** The medal-table sorts are written separately but agree:
- `champions.ts:75` `houseTable`: points → golds → silvers → bronzes → name
- `athletics.ts:773` `topAthletes`: same order
- `data/medalStandings.ts:86-89` `compareMedalRows('points')`: same order
- `teamResults.ts:132`: golds first, which matches the `'medals'` mode, intentional for the team page

No drift.

**11-D38 (B, cross-layer).** `fmtTime` is identical in `sports/athletics/stats.ts:31`, `sports/swimming/stats.ts:20` and `sports/crewStats.ts:9`, and generalised in `sports/cycling/stats.ts:16`. Those three are A among themselves, in another slice. Against `marks.ts` `formatMark` they are B: at 1 hour or more `fmtTime` gives "62:03.45" where `formatMark` gives "1:02:03.45".

---

## 2. Drift bugs (C): findings only, not counted as removable

- **C1 (high): meet rules are applied to the medal table but not when a final is locked.**
  - `athletics.ts:665-666` `finalAwards`, which feeds `meetFieldResults` (the house / medal table), ranks with `phaseDiscipline(base, fin.format)`, so `def.rules` is set.
  - `data/resultsStore.ts:746-753` `completeFinal` ranks with `def = disciplineOf(f.discipline)`, so no rules apply. Those rows produce the athletes' stat lines (place, medals, posPoints at `:778`), the records (`:767`), the follower podium alert (`:785`) and the highlights.
  - Rules read from `def.rules` during ranking: `archTie` (`rank.ts:109`), `shootTie` (`:99`), `shootOff` (`:199`), `archShootOff` (bracket), and in `cyclingRank.ts` `cycGap`, `cycGcTie`, `cycSprintPts` and `cycFinishDouble`. `windLimit:'none'` also changes `bestLegal`.
  - With any non-default rule, a profile's medal or points can disagree with the meet table.
  - In this slice, `eventLeaders` (`athletics.ts:740`), `deriveRecordBook` (`:803`) and the `teamResults.ts:96` marks also rank with the raw def.
  - I did not trace the screen's own record path (`ResultsEventScreen.tsx:410`).
- **C2 (medium): band categories get different field and swimming programmes than track.**
  - `field.ts:26` and `swimming.ts:99` `ageRank` send any SD-153 band ("12 & Under", "C Division", "Grades 6–8") to `Math.max(0, -1)`, which is the U10 programme.
  - `athletics.ts:103-113` maps the same band to the nearest covering U-group.
  - So a band category gets, say, a U14 track list but only the U10 field list (long jump only) and the U10 swim list.
  - Used by `entries.ts:516-517` (meet entries matrix).
- **C3 (low/medium): SCY categories get a junk "SCY" label on the team page.** `teamResults.ts:139` filters `/^(LCM|SCM|\d+sh)$/` but not `SCY` (SD-154). A key such as `U14-M-SCY` becomes the label "U14 Boys SCY", with SCY read as a weight class, in the team page's record list.
- **C4 (low): `liftingTeam.ts:109` `placesText` prints "21th ×1", "22th", "23th".** I checked this by running it. Team-classification places run to 25.
- **C5 (low): lead-change counts ignore the archery tie rule.** `archeryInsights.ts:259` `archStats` keys ties on `endSum*10000 + endTens*100 + endXs`, which ignores `archTie:'xs'`. `rankingFeed` (`:53-54`) honours it, so the lead-change count and the feed's "takes the lead" lines can disagree under the X-first rule.
- **C6 (low): no hand-time conversion for 60 m / 60 mH outside combined events.** `athletics.ts:344-345` `handConversion` has no 60 m / 60 mH entry; `combinedDefs.ts:84` `handAdd` has one. A hand-timed 60 m shows no "≈ electronic" note (`handNote`) even though the same rule ("up to 200 m and sprint hurdles") is stated in both files.
- **C7 (low, cross-slice): SCY personal bests are missing from the swimming stat schema.** `sports/swimming/stats.ts:17` `COURSES` lists `lc` and `sc` only, but `athletics.ts:400` `markKey` writes `m_sw_*_yd` for SCY. Those times aren't in the stat schema's mark, PB, filter or leader keys. The measured career (`athleticsCareer`) does handle `_yd`.
- **C8 (low, cross-slice): two age calculations disagree on a birthday shortly after midnight.** `data/rosterImport.ts:251` takes "today" as a UTC date; `entries.ts:480` uses the local date. In IST between 00:00 and 05:30 on a birthday, the two give different ages.
- **C9 (low confidence): a "Perfect series" line can appear for a series beyond the match length.** `shootingInsights.ts:65-66` `per(i)` floors at 1 shot; `shooting.ts:161` `shotsInSeries` floors at 0. For a series entered past the match length, the feed can say "Perfect series" while the stat line (`perfectSeries`) doesn't count it.

---

## 3. Coverage

Every file was reviewed in full.

| File | Lines | |
|---|---|---|
| positions.ts | 38 | reviewed |
| heatWins.ts | 44 | reviewed |
| index.ts | 46 | reviewed |
| insightFeed.ts | 55 | reviewed |
| medals.ts | 55 | reviewed |
| alerts.ts | 69 | reviewed |
| plan.ts | 70 | reviewed |
| liftingPoints.ts | 73 | reviewed |
| liftingClock.ts | 80 | reviewed |
| raceHighlights.ts | 94 | reviewed |
| precisionRules.ts | 100 | reviewed |
| liftingTeam.ts | 109 | reviewed |
| raceSplitDefs.ts | 109 | reviewed |
| robi.ts | 111 | reviewed |
| champions.ts | 116 | reviewed |
| records.ts | 125 | reviewed |
| recordsSet.ts | 132 | reviewed |
| crewDefs.ts | 133 | reviewed |
| cyclingDefs.ts | 143 | reviewed |
| teamResults.ts | 144 | reviewed |
| progression.ts | 177 | reviewed |
| shootMatch.ts | 180 | reviewed |
| shootingDefs.ts | 180 | reviewed |
| roadDefs.ts | 181 | reviewed |
| teamEvents.ts | 185 | reviewed |
| recordBook.ts | 187 | reviewed |
| printSheets.ts | 210 | reviewed |
| archeryDefs.ts | 214 | reviewed |
| liftingInsights.ts | 221 | reviewed |
| marks.ts | 222 | reviewed |
| combinedDefs.ts | 228 | reviewed |
| shootingRank.ts | 242 | reviewed |
| rank.ts | 247 | reviewed |
| cyclingRank.ts | 273 | reviewed |
| safety.ts | 308 | reviewed |
| raceCommentary.ts | 316 | reviewed |
| road.ts | 336 | reviewed |
| archeryInsights.ts | 343 | reviewed |
| field.ts | 354 | reviewed |
| shootingInsights.ts | 356 | reviewed |
| archeryBracket.ts | 358 | reviewed |
| timetable.ts | 380 | reviewed |
| cycling.ts | 393 | reviewed |
| combined.ts | 409 | reviewed |
| competitionRules.ts | 446 | reviewed |
| swimming.ts | 454 | reviewed |
| shooting.ts | 473 | reviewed |
| crews.ts | 477 | reviewed |
| archery.ts | 489 | reviewed |
| entries.ts | 535 | reviewed |
| weightlifting.ts | 596 | reviewed |
| raceDepth.ts | 636 | reviewed |
| model.ts | 709 | reviewed |
| athletics.ts | 814 | reviewed |
| **Total (54 files)** | **13,975** | all reviewed |

Files outside the slice that were opened only to check a match:
- `data/resultsStore.ts` (lines 725-835)
- `screens/ResultsEventScreen.tsx` (lines 515-540)
- `data/medalStandings.ts` (lines 80-160)
- `sports/athletics/stats.ts`, `sports/swimming/stats.ts`, `sports/cycling/stats.ts`, `sports/crewStats.ts` (headers)
- `core/age.ts`, `data/rosterImport.ts`, `core/region.ts` (the age/date helpers)
- the files holding `esc()` copies

Not traced: the screen's own record-update path (`ResultsEventScreen.tsx:410`, for C1), and whether the remaining ordinal helpers in `MedalTable`, `structureConfig`, `tournamentHistory` and `golf/engine` match exactly.
