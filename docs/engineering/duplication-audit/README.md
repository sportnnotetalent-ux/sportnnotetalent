# Duplication audit — summary (2026-10-31)

This page merges the 11 slice reports in this folder into one list. Nothing in the app was changed.

The founder's rule: **a duplicate may only be removed if nothing changes at all** — same screens, text, styles, accessibility labels, side effects, saved-match replay results.

Each slice sorted what it found into three classes:

- **A** — removable with zero behaviour change. Only A counts as "lines removable".
- **B** — looks like a copy but is not identical. Leave it. The difference is listed so nobody merges it by mistake.
- **C** — the copies have drifted apart in a way that looks like a bug. Reported only. Fixing a C changes behaviour, so it needs a decision first.

All line counts below come from the slice reports, or from simple sums of them. Most slice figures are estimates ("about N"), so treat totals as ± a few percent.

---

## 1. Totals

### Per slice (as each slice reported it)

| Slice | What it covers | Files | Lines | A items | A lines removable | B items | C items |
|---|---|---:|---:|---:|---:|---:|---:|
| [01](slice-01.md) | Team invasion sports (rugby, league, handball, hockey, ice hockey, AF, netball) + `invasion/`, `netraid/`, `gcc/` | 106 | 20,910 | 35 | 925 | 23 | 9 |
| [02](slice-02.md) | Football, basketball, kabaddi, volleyball, baseball | 92 | 19,894 | 22 | 316 | 27 | 4 |
| [03](slice-03.md) | Cricket, chess, carrom, golf | 67 | 17,589 | 25 | 79 (in slice) | 20 | 4 |
| [04](slice-04.md) | Racket sports, cue sports, `supabase/functions`, worker, scripts, navigation, App | 142 | 19,173 | 65 | 554 (+280 optional, N-A7) | 58 | 20 |
| [05](slice-05.md) | Shared sport layer (`src/sports/*` top level) + event sports | 113 | 16,614 | 33 | 278 | 28 | 3 |
| [06](slice-06.md) | `src/components/` | 143 | 20,806 | 24 | 394 | 23 | 16 |
| [07](slice-07.md) | `src/screens/` A–M | 65 | 19,118 | 25 | 410 | 28 | 20 |
| [08](slice-08.md) | `src/screens/` N–Z | 44 | 14,746 | 19 | 360 | 15 | 4 |
| [09](slice-09.md) | `src/data/` A–R | 80 | 22,132 | 29 | 242 | 29 | 15 |
| [10](slice-10.md) | `src/data/` S–Z + `src/core/` | 176 | 23,051 | 24 | 150 (net) | 27 | 11 |
| [11](slice-11.md) | `src/data/results/` (results engine) | 54 | 13,975 | 22 | 79 (in slice) | 16 | 9 |
| **Sum** | | **1,082** | **208,008** | **323** | **3,787** | **294** | **115** |

Notes on the table:
- Lines: 208,008 in all. Of that, 6,829 lines sit outside `src/`: edge functions 4,976, scripts 1,514, worker 243, `App.tsx` + `index.ts` 96. That leaves 201,179 lines in `src/`, which matches the ~202k estimate.
- Slice 04 says "~19,170". Its four parts add up to 19,173.
- Slices 03 and 11 also counted copies that live in other slices: 03 says 94 including those, 11 says +14. Those copies are counted in the slices that own them, so only the in-slice figures are used here.
- Slice 04's optional N-A7 (+280 lines: the RootNavigator screen list rewritten as a table) is **not** in any total.
- Slice 10 counted **net** lines (lines removed minus import lines added). The others mostly counted gross lines.
- Item counts are rows as each slice wrote them. Some B rows group many small cases (for example 07-B28).
- Two slices' item lists don't add up exactly to their stated totals. Slice 01's items add to about 936, not 925. Slice 04's edge-function items add to 159, not 157. The stated totals are used.

### Removing the double counts

Some A findings span slices, so more than one slice counted them. Each one below is merged into **one** entry, with one line count. The rule used:
- If one slice saw a wider set of copies, its number is used.
- If two slices counted the same copies and got different numbers, the **lower** number is used.

| Merged item | Counted by (lines in each slice's total) | Merged count | Double count removed |
|---|---|---:|---:|
| `creditAttribution` | 01-D1 (55), 02-D2 (66, adds the baseball copy) | 66 | 55 |
| Shoot-out decider (best of 5, then sudden death) | 01-D2 (20), 02-D3 (30, adds football and kabaddi) | 30 | 20 |
| Clock text `mm:ss` | 01-D9 (62, wider), 02-D9 (6, mostly the same copies) | 62 | 6 |
| Football discipline helpers in `sports/discipline.ts` | 02-D1 (12), 05-D22 (~8) — same copies, numbers differ | 8 | 12 |
| `deburr` | 02-D4 (2), 06-D34 (2) | 2 | 2 |
| Ordinal "1st / 2nd / 21st" | 02-D14 (2), 03-D23 golf (4), 05-D23 (1), 06-D32 (1), 08-D15 (1), 10-D5 (25, 18 copies), 11-D1 (6) | 29 (10-D5's 25 + golf's 4) | 11 |
| HTML `esc()` | 03-D17 (1), 10-D2 (≈2 net), 11-D2 (outside its slice, 0 in its total) | 2 | 1 |
| Avatar initials (`'?'` fallback) | 03-D16 (2), 06-D27 (8), 10-D6 (≈6 net) | 6 | 10 |
| Event-setup screen family (8 screens) | 07-A1–A7 (302), 08-D1–D3 (231) | 286 | 247 |
| Hand-written `openMatchViewer` | 04 N-A1 (18), 07-A17 (18), 08-D7 (50, adds 7 more copies via a `canScore` parameter) | 50 | 36 |
| Edge-function error body → message | 09-A3 (~12), 10-D15 (≈8) — same 6 copies | 8 | 12 |
| Stored event → reducer action mapper | 05-D20 (~12), 09-A2 (~14, adds the replay loop) | 14 | 12 |
| Chess "½" formatter | 03-D18 (3), 08-D16 (4, wider) | 4 | 3 |
| `cap()` | 04 C-A23 (2), 07-A19 (~15, all 16 copies) | 15 | 2 |
| `plural` / `andList` | 01-D31 plural part (6), 03-D15 (3), 05-D24 (~10, all copies) | 10 | 9 |
| Racket row formatters `frac` / `pctOf` / row builders | 04 R-A1–R-A3 (19), 05-D5 (~10) | 19 | 10 |
| `clearMatch` re-typed in `racketCommentaryModel` | 04 R-A14 (2), 05-D8 (~10, wider) | 10 | 2 |
| Point-detail card blocks (`PointDetailRow` vs tennis `PointCapture`) | 04 R-A11 (~41), 05-D29 (~30) | 30 | 41 |
| Commentary roster / names hook | 04 R-A12 (9), 05-D27 (~10) | 9 | 10 |
| Commentary `article` + `gamesDone` | 04 R-A13 (7), 05-D25 (1), 05-D9 (2) | 7 | 3 |
| Local `YYYY-MM-DD` date helper | 07-A8 (~13, wider), 06-D30 (2), 06-D31 (2), 08-D14 (2) | 13 | 6 |
| Team colour palettes | 07-A12 (4), 08-D12 (5) | 4 | 5 |
| Segmented-control styles | 07-A20 (4), 08-D19 (4) | 4 | 4 |
| Code-link landing page (GuardianConsent / SchoolRequest) | 07-A11 (15), 08-D6 (~8) | 15 | 8 |
| Team short code from a name | 08-D13 (4), 09-A4 (~13, wider) | 13 | 4 |
| **Total double counts** | | | **531** |

Notes:
- **MatchStatsPanel / tennis StatsPanel.** The StatBar, team header and style-sheet part was merged today (commit 574a1b3), and no slice counted it. Slice 05 was written after that commit. Its 05-D28 (~25 lines) is the part that is still duplicated: nameOf / players / bar, key-stat sections, server lines, stroke-table head and scope chips. I re-checked that the server-lines block is still identical in today's files. Only that remaining part is counted.
- **Medal emoji map (06-D2, 6 lines) is taken out of A.** Slice 06 calls it identical to `medalIcon`. Slice 11 (11-D12) says it is not: `medalIcon` returns `''` for no medal, the local maps return `undefined`. Until that is checked, it counts as B.
- **`LiveTimeline.tsx` (88 lines) is added.** You checked that it is not imported anywhere. Slice 05 called it an "orphan" but did not count it as A. Its line count comes from slice 05's coverage table.

### The de-duplicated total

| Step | Lines |
|---|---:|
| Sum of the 11 slice totals | 3,787 |
| minus double counts (table above) | −531 |
| minus the medal map moved to B (06-D2) | −6 |
| **De-duplicated, from the slice reports** | **3,250** |
| plus `sports/LiveTimeline.tsx` (unused) | +88 |
| **De-duplicated total, A lines removable** | **3,338** |
| Not included: optional RootNavigator table rewrite (04 N-A7) | (+280) |

**Item counts after de-duplication:**
- **A: 281.** 323 items, minus 42 merged into other entries, minus 1 moved to B (medal map), plus 1 added (`LiveTimeline.tsx`).
- **B: 278.** 294 rows, minus 17 duplicate rows, plus the medal map.
- **C: 106.** 115 items, minus 10 duplicates, plus 1 that slice 08 mentioned outside its duplicate scope and the lead verified (the OrganizationScreen notice).

The 42 merged A items are the 25 rows above (23 items), plus 2 other merges: `rowShares` (01-D31 with 05-D15) and the "other side" one-liner (03-D26 with 04 C-A12 and 05-D32).

### Where the slices disagree

- **Ordinal.**
  - Slice 02 says negative input gives different results between the formula families.
  - Slice 10 says it checked negatives, NaN and decimals, and all copies agree. Slice 11 checked n = 0…2000.
  - Slices 05, 08 and 09 class some copies B ("not proven").
  - The golf copy (`golf/engine.ts:603`) is A in slice 03 (keep " hole" outside the helper) but B in slices 05 and 06.
  - → Write an exhaustive comparison test before merging any of them.
- **Medal emoji map.** 06 says A, 11 says B → treated as B.
- **`openMatchViewer`.**
  - 07-B21 calls the 7 copies that pass a role-based `canScore` B.
  - 08-D7 makes them A by adding an optional `canScore = false` parameter, so existing callers stay byte-identical.
  - Counted as A (50 lines).
- **Code-link `check()`.** 07-A11 says A when the preview function is passed in. 08-D6 says B "as written". Counted per 07.
- **Event-setup player pool.** 07-A4 shares only the de-dupe part (A). 08-D4 calls the whole memo B. Both are right; only the shared part is counted.
- **Line counts for the same copies.**
  - Event-setup loader: 184 (07) vs 170 (08). Event-setup styles: 63 vs 54.
  - Discipline helpers: 12 vs 8. Error body: 12 vs 8. Initials: 8 vs 6. Point-detail blocks: 41 vs 30. Palettes: 4 vs 5.
  - The lower number is used each time.
- **Where shared code should live.**
  - `plural`: slice 03 says `feedGroups.ts` has no imports, so it is free to use. Slice 05 says host it in a tiny text module instead, so cricket, carrom, snooker and pool don't take in the feed model.
  - Point-detail parts: 04 proposes a new `pointDetailParts.tsx`; 05 proposes `PointButtons.tsx`.
- **"Other side" one-liner.** Slices 02 and 05 count 0 lines saved (one import replaces one line). Slices 03 (6) and 04 (7) count lines where the host file is already imported. Those are different copies, so both are kept.
- **"My player id" effect.** 07-B28 calls it B across 31+ files. 08-D8 makes the exactly identical subset A (12 lines).
- **Slice 01 internal.** It says about 300 of its lines are on the replay path, but the items it names (D2, D4–D7, D9–D11) add up to 183.
- **Slice 02's overlap estimate.** It says about 110 of its lines overlap slice 01. The merge here removes 81 (55 + 20 + 6), because slice 02's copies include baseball, football and kabaddi, which slice 01 doesn't have.

---

## 2. Removable duplicates (A), merged and ranked

Risk: **low** = display only, or a pure helper. **High** = on the saved-match replay path, results / stat totals, the database, auth or edge functions. Small items (1–7 lines each) are summarised at the end of each group; see the slice files.

**Bundle rule that applies everywhere.** Each sport is its own on-demand download (`sportLoaders.ts`), so shared code must live somewhere that doesn't make any sport's download bigger:
- **Don't** put helpers in `voiceParsers.ts` or `boxSources.ts`: they import many sports.
- **Don't** put helpers in `recordHelpers.ts` or `matchRecords.ts`: they pull in `conduct.ts`.
- **Don't** put helpers in `printSheets.ts`: it pulls in the results engine.
- **Don't** put helpers in `chess/engine.ts` or `chess/repertoire.ts`: they pull in the openings data.
- **Don't** put helpers in `core/time.ts`, `core/region.ts` or `core/dates.ts`: they use AsyncStorage, and node tests load the pure files.
- Use a new **dependency-free** module instead.

### (a) Low risk: display and pure helpers

| ID(s) | What | Locations (short) | Copies | Lines | Risk | Bundle caution |
|---|---|---|---:|---:|---|---|
| 06-D1, D3–D7 | Career panels: phase-info loader, results history, PB/SB table, Tile, medal line, style sheet | `components/results/{Crew,Cycling,Lifting,Shooting,Archery}Career.tsx`, `athletics/AthleticsCareer.tsx` | 6 (Archery and Lifting partly B) | ~307 (313 minus the medal map) | low | All six are in the SportProfileScreen chunk |
| 07-A1–A7, 08-D1–D3 | Event-setup family: teams/houses loader hook, `Source` type → `TeamSource`, `teamOf`, pool base, filter chips + search box, "in two teams" check, base style sheet, member-scores effect | 8 screens: Archery, Athletics, Combined, Crew, Cycling, Road, Shooting, Weightlifting EventSetup | 8 | 286 | low | All 8 are in one chunk (`AthleticsEventSetupScreen.tsx:46-52`). Don't swap in `useMeetEntries.ts` (B) |
| 01-D27–D30, D35 | Invasion scorer UI: `PlayerGrid`, `Chip`, clock-tick hook, 22 shared style keys, `uid`, `removalActions` | 7 `index.tsx`: rugby, league, handball, hockey, ice, AF, netball | 5–7 | 254 | low | New `invasion/ScorerParts.tsx` becomes one shared chunk. **Keep the two `PlayerGrid` groups apart** (handball/hockey `pchip` lacks `minHeight: 44`, see C) |
| 01-D18, D19, D24, D25 | Box-score row bag, period list, stat-schema entries, meta preset options | the 7 `box.ts`, `stats.ts`, `meta.ts` | 7 | 186 | low | Already in the shared chunk via `boxSources` / `statSchemas` |
| 04 C-A11, C-A13–C-A22, C-A24–C-A31 | Cue sports: controls builder, totals, box, read.ts, records, frame-row types, toss row, styles; pool `isObj` ×8 and others | snooker, billiards, pool | 2–8 | 140 | low | New `cue/` files load only in the snooker and billiards chunks. C-A30 adds 17 lines to the pool chunk. **C-A31** only after the styles are split into `cue/styles.ts` (else 249 lines go into pool) |
| 05-D1–D4 | Event sports: `fmtTime`, identical StatDef literals, meta option lists, inert plugin members | athletics, swimming, weightlifting, archery, cycling, shooting, rowing, canoe | 3–8 | 87 | low | Stats and meta are already in shared bundles. **Keep schema order** (it drives display and MVP weights) |
| 08-D7 (+04 N-A1, 07-A17) | `openMatchViewer` written by hand | Calendar, Notifications, SportProfile, SportHub, TryNewSport, Home, TeamProfile, SwissRound, Series, ScheduleMatch | 10 | 50 | low | `openMatch.ts` is 17 lines, already shared. Add `canScore = false` as an optional 3rd parameter |
| 05-D28 | Racket stats panel blocks still duplicated after 574a1b3 | `MatchStatsPanel.tsx` ↔ `tennis/StatsPanel.tsx` | 2 | ~25 | low | Into `StatBar.tsx` (no stats engine). Tab chips are B |
| 04 R-A11 + 05-D29 | Point-detail blocks: "Extra stats" chooser, "By:" row, "2nd serve" row, styles | `PointDetailRow.tsx` ↔ `tennis/PointCapture.tsx` | 2 | 30 | low | **Don't** import `PointDetailRow.tsx` into tennis (245 lines). Use a small parts file |
| 04 R-A12 + 05-D27, R-A15, R-A16 | Commentary names hook, commentary tab wrapper, serve-banner style | tennis, `RacketCommentary`, badminton, padel, `rallyCore` | 2–3 | 19 | low | Hook goes beside `CommentaryFeed.tsx`, **not** in `RacketCommentary.tsx` (that would pull badminton, padel and rally engines into tennis) |
| 04 R-A1–R-A3 + 05-D5 | Row formatters `frac`, `pctOf`, `blockOf`, `rowsOf`, `ratioRow`, `countRow` | `serveStats.ts`, `racketMatchStats.ts`, `tennis/matchStats.ts` | 3 | 19 | low | `serveStats.ts` is already imported by both |
| 02-D5 | Unused `basketball/Timeline.tsx` (near-copy of LiveTimeline) | — | 1 | 109 | low | Nothing imports it (you checked). Only `tests/a11y-labels.test.mts` scans it statically |
| (lead) | Unused `sports/LiveTimeline.tsx` | — | 1 | 88 | low | Nothing imports it (you checked) |
| 10-D5 + 6 others | Ordinal "1st/2nd/21st" | 18 copies (core, data, results, sports, components, screens) + golf | 19 | 29 | low | New dependency-free core file. **Test first** (slices disagree on negatives) |
| 03-D15, 05-D24, 01-D31 | `plural`, `andList` (= netraid `joinNames`) | feedGroups, netraid, cricket ×2, carrom, snooker ×3, pool ×2 | ~10 | 10 | low | Tiny pure text module (see the hosting disagreement) |
| 01-D31, 05-D15 | `rowShares` / `barShares` | `compareSheet.ts`, `netraid/feed.ts`, `boxScore.ts` | 3 | 8 | low | netraid sits in the kabaddi/volleyball chunks; check before importing `compareSheet` there |
| 07-A19 (+04 C-A23) | `cap()` (charAt form) | 16 copies | 16 | 15 | low | Optional. A one-liner in each sport chunk; changes the chunk graph slightly |
| 07-A8 (+06-D30/31, 08-D14) | Local `YYYY-MM-DD` + `isValidISODate` | Create/Edit/Copy/Quick Tournament, GenerateFixtures, DateTimeField, `core/age.ts`, TournamentEditions | ~8 | 13 | low | 07 suggests `core/time.ts`; to keep node tests pure, a dependency-free file is safer |
| 09-A4 (+08-D13) | Team short code from a name | repos ×2, ScheduleMatch, QuickTournament | 4 | 13 | low | `core/` helper |
| 07-A11 (+08-D6) | Code-link page `check()` + styles | GuardianConsent, SchoolRequest, ManageChild | 3 | 15 | low | — |
| 03-D26, 04 C-A12 (05-D32) | "Other side" one-liner | ~64 copies repo-wide; 13 lines counted where the host is already imported | many | 13 | low | Several are inside reducers; the expression is identical |
| 10-D4 | 12 short month names | dates, region, age, verificationReview, passport, tournamentCopyPlan, fixtureSchedule, RegionSettingsScreen, timetable | 9 | 7 | low | Dependency-free file only. Only slice 10 counted it |
| 10-D6 (+03-D16, 06-D27) | Initials with `'?'` fallback | cricket, TournamentAwardsTab, MatchSummary, AwardPickerSheet, AddInvitePlayer | 5 | 6 | low | New export. **Do not** fold into `avatarInitials` (B) |
| 08-D16 (+03-D18) | Chess "½" | chess engine, index ×2, SwissFieldPanel, SwissRoundScreen ×2 (`repertoire.halfText`) | 6 | 4 | low | New tiny `chess/half.ts`; **don't** import `repertoire.ts` (openings data) |
| 10-D2 (+03-D17, 11-D2) | HTML `esc()` | printSheets, orgVerification, certificates, hallOfFame, passport, chess roundSheet | 6 | 2 | low | Dependency-free core file. **Not** `printSheets.ts` (pulls in the results engine). The worker, scripts and `fixturesText` copies are B |
| 02-D4 (+06-D34) | `deburr` | `football/voiceCommands.ts` ↔ `voiceMatch.ts` | 2 | 2 | low | Point `VoiceNav.tsx` at `voiceMatch` (keeps football code out of that chunk) |
| 07-A12 (+08-D12) | Two team colour palettes (6 and 8 colours) | Join, TournamentTeams, Teams, Organization; Quick, ScheduleMatch | 6 | 4 | low | Keep the array length (colour is picked by index) |
| 08-D5, D8, D10, D9, D11 | Date-order notice, `useMyPlayerId`, "Loading…" placeholder, edit-access hook, team squad | Roster/StudentImport, 5 screens, 4 screens, 2 screens | 2–5 | 50 | low | Don't swap in `LoadingState` (it looks different) |
| 09-A28, A29, A23 | `useFocusFetch`, group lines by player, `isLive()` | `hooks.ts`; 17 `live()` declarations | 3–17 | 81 | low | `core/supabase` |
| 09-A1 | Shared legal paragraphs (India vs international terms) | `legal.ts` | 2 | ~18 | low code risk, **founder call** (lawyer-reviewed text) | Same file |
| 10-D14, D9, D8, D11–D13 | Native-module lazy loader; World Cup / demo seed builders | 5 core native wrappers; seed files | 2–6 | 58 | low | Keep a literal `require` inside each thunk (Metro needs it) |
| 06-D8–D21 | Results panel helpers and style keys | `components/results/*Panel.tsx` | 2–7 | ~53 | low | All in the ResultsEventScreen chunk |
| 04 N-A2–N-A4 | Spinner, brand constants, env loader | RootNavigator, scripts | 2 | 14 | low | — |
| rest | Smaller A items (1–7 lines each) in every slice | see slice files | | remainder | low | per slice |

### (b) On the replay or saved-results path — only behind golden tests

These are identical today, but they sit where saved matches are replayed, or where stat totals, standings or results are computed. Before moving any of them:
- record the final state, result and stat totals of every saved log and fixture;
- move the code;
- require the output to be byte-equal.

| ID(s) | What | Locations (short) | Copies | Lines | Risk | Bundle caution |
|---|---|---|---:|---:|---|---|
| 04 C-A1–C-A10 | Cue frame engine: helpers, readers, reducer wrapper, `CONCEDE` / `AWARD_FRAME`, `breaks()` | `snooker/engine.ts` ↔ `billiards/engine.ts` | 2 | 85 | high | New `cue/frameEngine.ts` (snooker + billiards chunks only) |
| 01-D9 (+02-D9) | Clock core: `stopAt`, `running`, `periodSec`, `matchSec`, `mmss` | 7 invasion engines (+ basketball) | 2–7 | 62 | high (stamps every event) | New pure `sports/clockCore.ts`; engines are already in the shared chunk |
| 01-D11 | Reducer preamble (`pid` / `who`), XI parse, `CLOCK` / `END` cases | 7 invasion engines | 4–7 | 45 | high | Same pure module. hockey and AF `who1` are B |
| 01-D13–D17 | Field log, `unavailable`, live field, statTotals accumulator, shoot-out credit | invasion `totals.ts` (+ football, basketball, baseball) | 2–8 | 123 | medium (minutes in stat totals) | `onField.ts` |
| 04 R-A4–R-A10 | Tennis ↔ padel set engine (`winSet`, `clearMatch`, `EDIT_LOG` replay, `SET_FIRST_SERVER`, `standingsUnits`); conduct keys; badminton score line | tennis, padel, badminton, `rallyEngine` | 2 | 43 | high | New tiny `setEngine.ts` (+~12 lines shared by the tennis and padel chunks) |
| 02-D2 / 01-D1 | `creditAttribution` | 6 invasion engines + baseball | 7 | 66 | medium (engine file, builds actions, not the fold) | `invasion/actions.ts` or a pure `attribution.ts` (~0.3 KB per chunk) |
| 01-D5–D7, D3–D4, D10 | `result()`, `isComplete`, `levelAtEnd`; shoot-out order helpers; config parsers | rugby, league, handball, hockey, ice, AF, netball | 2–7 | 63 | high (result feeds standings) | `sports/shootoutOrder.ts` / clock module |
| 02-D3 / 01-D2 | Shoot-out decider | rugby, handball, hockey, ice (`rounds`), football (`boolean[]`), kabaddi (`maxPerRaid`) | 6 | 30 | high | `sports/shootoutOrder.ts` |
| 01-D32 | Netball centre-pass walk written twice | `netball/engine.ts` `centreInfo` ↔ `deep.ts` `centreSplit` | 2 | 25 | medium | Derive `centreInfo` from `centreSplit`, which must also return `due` |
| 02-D13, D10, D11, D18, D20 | Kabaddi, football, basketball, volleyball engine repeats (`RAID_OUTCOME` block, `stopGc`, half offsets, stat cases, set rules) | those engines | 2–5 | 36 | high (parts on the reducer) | Inside each sport's own files |
| 03-D07, D05, D04, D06, D02, D03 | Cricket: `logSymbol` / `ballSymbol` identical branches, last delivery, `recStamp`, extra-wicket kind, `isDelivery`, over index | cricket engine, editOvers, index, detail, scorecard | 2–4 | 29 | high (`BallRec.sym` is read on every replay) | Move **only** the identical branches (the others are B, S3-D30) |
| 05-D8 (+04 R-A14), 04 R-A5 | Engines' `clearMatch` re-typed in replays | serveStats, racketCommentaryModel, tennis, padel, badminton, rally, volleyball | 3 | 13 | medium (replay; same object) | Engines are already imported there. Not the padel copy that adds `serveDetail` |
| 09-A2 / 05-D20 | Event → action mapper + `replayLog` | amend, eventLog, chessRoundResults, pendingResults, teamTieDemoSeed | 5 | 14 | medium (replay; same mapping) | `amend.ts` is shared |
| 05-D11, D19, D31 | `tennisRecord` ≡ `padelRecord`; record line text; annotation carry-over | racketTotals, matchRecords, RallyPointEditor | 2 | 20 | medium (stat totals; `EDIT_LOG` bytes) | — |
| 05-D22 / 02-D1 | Football discipline helpers | `football/discipline.ts` ↔ `sports/discipline.ts` | 2 | 8 | medium (suspensions) | Already imported |
| 01-D12, D14, D21 | Rugby ↔ league rules helpers, live field, discipline preamble | rugby, league, 7 specs | 2–7 | 49 | medium | `discipline.ts` makes a cyclic import (safe at runtime, per 01) |
| 11-D4, D5, D13, D15, D16, D20, D24 | Results: points-scheme parse, shared position points, medal stat keys, match W/L, serpentine seeding, net series, `beats` | `medals.ts`, `road.ts`, `combined.ts`, `cycling.ts`, `archery.ts`, `progression.ts`, `shooting*` | 2–11 | 37 | medium/high (medal table, seeding, ranking) | Don't import into the five `*Defs.ts` / `positions.ts` files (sport chunks). `positionPointsOf` must return a fresh array |
| 09-A13, A15, A18, A19–A21; 10-D19–D21 | `resultsStore` / `repos` / standings repeats: end-by-hand tail, flag winners, next-round phase, stored record book, no-result predicate, chess half-point rubber | repos, resultsStore, standings, teamTie, series | 2–6 | 41 | medium (DB writes and standings, same order) | 09-A15 only as `flagWinnersFor(...)` taking the already-read ids (calling today's `flagWinners` adds a read = change) |
| rest | Smaller engine-adjacent items (01-D34, 02-D7, 02-D12, 02-D22, 03-D01, D08, D09 and others) | see slice files | | remainder | medium | — |

### (c) Backend: edge functions

| ID(s) | What | Locations (short) | Copies | Lines | Risk | Caution |
|---|---|---|---:|---:|---|---|
| 04 E-A1 | CORS object + `json()` | support-escalate, verification-submit, support-assistant, send-contact-otp, verify-contact-otp → `guard.ts` | 6 | 32 | high (edge) | Move into a **pure** `_shared/http.ts` that `guard.ts` re-exports. Importing `guard.ts` reads env at boot (E-B4) |
| 04 E-A2 | Expo push sending | push-send, notify-upcoming, notify-followers | 3 | 30 | high | Same fields; `matchId: undefined` is dropped by JSON either way |
| 04 E-A4 | Service-role `createClient` → `admin` | report-invite, join, support-escalate, verification-submit, notify-*, send-contact-otp | 7 | 29 | high | **Not** join-club or verify-contact-otp (boot vs per-request failure, B) |
| 04 E-A3 | `isCron` / authorised | verification-reminders, privacy-retention, notify-upcoming, weekly-report | 4 | 24 | high | — |
| 04 E-A9, A11, A8, A5, A6, A7 | resultHighlights helpers, `tournamentsWithZone`, `ageOn`, SHA-256 hex, `mask`, UUID regex | various | 2–4 | 44 | high (E-A5: stored OTP hashes must keep matching) | Pure `_shared` files |
| 04 E-A10 | "POST only" 405 ×9 | 9 functions | 9 | 0 | — | A `postOnly()` helper is zero change; switching to `json(..., 405)` is **not** (it adds CORS) |
| 09-A3 / 10-D15 | Client-side reader for edge-function error bodies | repos ×2, phoneLogin ×2, studentListStore, registerLookup | 6 | 8 | low | `core/functionPath.ts`. **Not** `privacy.ts` (also reads `reason`) |

---

## 3. Not identical — leave as is (B)

The main ones, so nobody merges them by mistake. **About 250 more** short rows are in the slice files.

| ID(s) | What | The difference that blocks a merge |
|---|---|---|
| 01-B1, 05-B1, 05-B2 | Five commentary-feed models and five team-compare models | Different data shapes, paging (60 vs 40 rows), chips, `better` / `lowerBetter` / `plain` rules; same-named `FeedGroup` / `filterFeed` / `countRow` with different signatures. A product decision. |
| 01-B3 | Invasion scorer skeletons (rugby ↔ league 405 identical-run lines) | Sport words in every block ("Kicking competition", "7-metre throws"), different rules and gating |
| 01-B4 | Engine clocks and shoot-out rules | `SET_CLOCK` clamps, capped vs uncapped `periodSec`, `START_SHOOTOUT` guards — intentional rules |
| 01-B2 | % helpers | `(n/d)*100` vs `(100*n)/d` can round differently; return types differ |
| 02-B1, 05-B27 | Football's own discipline engine | Second-yellow reds, no yellow build-up (FIFA rule) |
| 02-B14 | Voice number words | Football goes to 20, `voiceMatch` to 15 (see C) |
| 02-B15 | `nameFor` vs `whoName` | `nameFor` skips the dispute mask for id-less rows (see C) |
| 03-D30 | `logSymbol` vs `ballSymbol` (rest) | WICKET (retired / Mankad), wide-runs source, default `undefined` vs `''` |
| 03-D32 | Cricket maiden overs ×3 | Different grouping and delivery filters; scorecard feeds stat totals |
| 03-D35 | DLS tag on result vs target | Legacy results keep their stored text (by design) |
| 04 R-B1–R-B4 | Tennis vs padel `disp`, `scorePoint`, tiebreaks, score line | No-ad, golden / star point, Fast4, match-tiebreak fields |
| 04 R-B9, 05-B4 | Racket Stats tab bodies | Heading "Player stats" vs "Box score" (see C), period letter, box sources |
| 04 R-B11 | Serve banner styles | Pill vs plain, weight 800 vs 700, colours — needs a design decision |
| 04 R-B13, 05-B20 | Whole point-detail cards | Speed input, ace handling, different a11y labels; only the A sub-blocks match |
| 04 C-B1–C-B10 | Snooker vs billiards engine core, `BREAK_OFF`, `FRAME_SCORE`, a11y labels | Draws, caps, foul checks; a11y "missed a pot" vs "missed" |
| 04 N-B1, 10-B5 | Other `esc()` copies | Worker must stay free of app code; build-website lacks `'`, share-images lacks `"`, `fixturesText` lacks `'` |
| 04 E-B1–E-B5 | Edge CORS variants, five Resend senders, sign-in replies | Cache-Control, From addresses, 401 vs 200 replies, boot-time env |
| 05-B3, 06 (two-team header) | `StatsHead` vs CategoryStatsPanel / GameFlowCard headers | Gap `spacing(1.5)` vs `spacing(1)`, no right-align, value width 72 vs 92 |
| 05-B9, 11-D38 | `fmtTime` vs `formatMark` | `formatMark` adds hours ("1:01:02.34" vs "61:02.34") |
| 06-D4 (Archery), D5 (Archery, Athletics), D6 (Lifting) | Career panel exceptions | Column 64 vs 72, `.value` vs `.text`, h2 tile, no centred label, `liftMedals` |
| 06-D13, D14, D17 | Cycling vs Road `SmallBtn` / `TimeBox`; bracket `apply()` | 36 vs 44 px (see C); async with refs; different words and return type |
| 07-B1, 08-D4 | Event-setup pool filter and cap | Eligibility rule per sport; `.slice(0, 60)` vs `80` |
| 07-B6, 06 (stepper) | Number steppers | Value min-width 30 / 28 / 22, ±2 steps, a11y labels |
| 07-B7–B9 | Create vs Edit tournament blocks | Gaps, region defaults, end-date message wording |
| 07-B27, 10-B6 | Other initials helpers (`avatarInitials`, 🤝 / 🎯 / 🙂 fallbacks, 3 letters) | Splitting, word count, fallback |
| 09-B-2, 10-B11 | "Schema missing?" predicates | Each accepts different error codes; merging changes which errors fall back |
| 09-B-3 | Newest-columns fallback cascades | Different column lists (see C-1, C-2) |
| 09-B-21 | Six "which side was this player on" helpers | Rule order differs (SD-119, intentional) |
| 09-B-23 | Server copies across the Deno boundary (`paging.ts`, lead options) | Edge functions can't import `src/`; a parity test guards `paging` |
| 10-B1, B2 | Four time-zone → country tables, three `deviceTimeZone`s | Different coverage per table (see C-8) |
| 10-B3, B4, B7 | Date text, weekday labels, "time ago" | Fallbacks, comma, rounding, wording |
| 10-B15, 06 (half-point) | Chess half points `fmtPts` / `halfText` / PointsEditor | Negatives, non-half decimals, 0.5 only |
| 11-D14, D29, D30 | Results career builders, phase stat-line builders, ranker tails | Keys and labels per sport; these write profile history and rank saved results |
| 11-D6 | Relay factor | The screen multiplies when the factor ≠ 1, the others skip when it is falsy (0 differs) |
| 11-D25, D33, D36 | Shared places, split places, penalty totals | Agree only for transitive ties / same points / whole-point penalties |
| 06-D2, 11-D12 | Medal emoji maps vs `medalIcon` | `''` vs `undefined` for no medal (06 says A, 11 says B; treated as B) |
| 05-B13, 09-B-24 | "Other ordinals" | Superseded by slices 10 and 11's tests (A), except the "21th" ones (C) |

---

## 4. Possible bugs found by comparing copies (C)

Ranked by severity, security and privacy first.
- **VERIFIED BY THE LEAD** = you checked it in the code.
- Everything else is "reported by slice N, not re-verified".
- Items several slices reported are merged into one row.

| # | Finding | Where | Severity | Status |
|---:|---|---|---|---|
| 1 | **verify-contact-otp: wrong-guess cap is read-then-increment**, so parallel guesses all read 0 attempts and get past the 5-try cap. No rate limit at all (6-digit code, 10-minute expiry). A caller could brute-force a contact they don't own and falsely set `email_verified` / `phone_verified` / guardian verified. | `supabase/functions/verify-contact-otp` (04 SEC-1: check :58, increment :61) | high (security) | **VERIFIED BY THE LEAD** |
| 2 | **Phone sign-up has no US under-13 block, and accepts a guardian phone instead of a guardian email.** AuthScreen's email path requires both. | `PhoneLoginCard.tsx:86-89`, `phone-login/index.ts:146-153` vs `AuthScreen.tsx:145-148` (06-C13, 07-C11) | medium (usability, not security: the database already refuses US under-13s and keeps every minor limited until a parent approves) | **CHECKED — FIXED 2026-10-31** (AS-04) |
| 3 | **SportProfileScreen guest gate checks age only**; PlayerProfileScreen uses `guestSeesMembersOnly`, which also hides `restricted` players. The two copies differ, but for a logged-out viewer the server marks a player restricted exactly when they aren't a proven adult and then hides their age, so the age-only gate already blocks them. | `SportProfileScreen.tsx:139-140` vs `PlayerProfileScreen.tsx:49` (08-C1) | none | **CHECKED — NOT A BUG** (AS-03) |
| 4 | **Live `escalateDispute` / `resolveDispute` have no status guard** (the demo copies do). Live can reopen a dismissed or resolved dispute, and moves stat lines on a dismissed one. The server's `guard_dispute` doesn't enforce transitions either. | `repos.ts:2658`, `3017-3024` vs demo `2655`, `2998` (09-C3) | medium-high (data integrity) | **VERIFIED BY THE LEAD** |
| 5 | phone-login trusts the first `x-forwarded-for` entry, so its per-IP limit can be bypassed; other functions use `net.ts clientIp()` | `phone-login:95` (04 SEC-2) | medium (security) | reported by slice 04, not re-verified |
| 6 | Open email recipients: send-invite has a fail-open limit and no per-recipient limit; same for org-verify `email_code` | send-invite:91, org-verify:56/62 (04 SEC-3) | medium (security / abuse) | reported by slice 04, not re-verified |
| 7 | Football / invasion legacy names skip the dispute mask: an old id-less row shows the full name during an open dispute (racket sports show "X") | `invasion/names.ts:63`, `football/discipline.ts:193-194` (02-C1) | medium (privacy) | reported by slice 02, not re-verified |
| 8 | **OrganizationScreen class-update request notifies the requester** (`playerId: myId`), not the approvers | `OrganizationScreen.tsx:619-624` | medium (approvals never reach approvers) | **VERIFIED — FIXED 2026-10-31** (slice 08 noted it outside its scope) |
| 9 | Cricket batting order ignores `editableSides`: a one-side captain could edit and save the opponent's XI (RLS not checked) | `LiveScoringScreen.tsx:878-882`, `CricketLineupScreen.tsx:95-113` (07-C2) | medium (integrity) | reported by slice 07, not re-verified |
| 10 | Positional lineup skips the eligibility / age gate, so a refused player can enter the squad via "arrange on pitch" | `LineupEditorScreen.tsx:105-138` vs `MatchSquadScreen.tsx:73-74` (07-C3) | medium (minors / eligibility) | reported by slice 07, not re-verified |
| 11 | `canManageTeamLocal` says it mirrors SQL `can_manage_team` but lets any organizer / support manage every team (UI only; RLS still refuses) | `core/teamPermissions.ts:9-21` (10-C2) | medium (security rule drift) | reported by slice 10, not re-verified |
| 12 | Student-list matcher: a phone with no digits matches any email contact (`'' === ''`); client and server match on the last 10 digits, which `core/phone.ts` forbids | `data/studentList.ts:161-162` (10-C5) | medium (identity) | reported by slice 10, not re-verified |
| 13 | `canOrganize(role) \|\|` gives any self-declared organiser the edit UI on MeetEntries, MeetTimetable, CompetitionRules, SportHub, RecordBoard, ResultsEvent, but not on Certificates, Bracket and others | e.g. `CompetitionRulesScreen.tsx:48` (07-C12) | low-medium | reported by slice 07 (CompetitionRules verified by slice 07) |
| 14 | Edge low-severity security drift: inconsistent limiter fail mode (SEC-4), join-club has no rate limit (SEC-5), send-invite skips placeholder addresses (SEC-6), unstripped names in email (SEC-7) | various (04 SEC-4–7) | low | reported by slice 04, not re-verified |
| 15 | **Locking a final ranks with bare `disciplineOf`**, while the meet medal table uses `phaseDiscipline` (meet rules). Profile medals, points, records and podium alerts can disagree with the meet table under any non-default rule. | `data/resultsStore.ts:746-753` vs `athletics.ts:665-666` (11-C1) | high (saved results) | **VERIFIED — FIXED 2026-10-31** |
| 16 | **Cricket after a rain cut in the chase**: the overlay and the "N balls left" record use `inn2Overs` (original length); the scorer uses `oversLimit` | `cricket/ticker.ts:75`, `cricket/records.ts:84` vs `index.tsx:2251` (S3-D50) | medium (public overlay, stored record) | **VERIFIED — FIXED 2026-10-31** |
| 17 | **`.ics` export: semicolons are not escaped.** `'\;'` is just `';'` in JS; commas are escaped correctly | `core/exportCells.ts:13-14` `icsText` (10-C1) | medium (calendar exports) | **VERIFIED — FIXED 2026-10-31** |
| 18 | Create forms can be submitted twice (no `disabled={busy}`): CreateTournament, CreateClub, CreateCommunity, CreateListing, JoinTeam | (07-C1) | medium (duplicate records) | reported by slice 07, not re-verified |
| 19 | One network blip permanently drops newer columns for the session (any error sets the "missing" flag); `getTeams` fallback also loses `club_id` | `repos.ts` cascades (09-C1, C-2) | medium | reported by slice 09, not re-verified |
| 20 | A 33–64 team knockout gets stage `r32` twice (`groups.ts` caps at r32) | `groups.ts:305` vs `bracket.ts:67-69` (09-C9) | medium | reported by slice 09, not re-verified |
| 21 | Places not tie-aware: `feeders.knockoutPlaces` ignores aggregates, rubbers and the "Advances" pick; `certificatePlaces` misses the double-elimination grand final | `feeders.ts:60-61`, `certificatePlaces.ts:11-16` (09-C7, C-8) | medium | reported by slice 09, not re-verified |
| 22 | Golf / results card outbox is not flushed at app start, despite its comment | `golf.ts:262, 323` (09-C6) | medium | reported by slice 09, not re-verified |
| 23 | Saved reminder times are never loaded (`hydrateReminderPrefs` has no callers) and not reset on sign-out | `reminderPrefs.ts:76-83` (09-C5) | medium-low | reported by slice 09, not re-verified |
| 24 | Heat-win / PB pushes skip the chunked `claim()`, so with more than 1,000 followers some never get the push | `notify-followers:507-511` (04 DRIFT-2) | medium | reported by slice 04, not re-verified |
| 25 | Setters that swallow errors (`setMatchFormat` and others) make callers report success after a refused write | `repos.ts:2179-2181`, `3494`, `3541`, `3611` (09-C4) | low-medium | reported by slice 09, not re-verified |
| 26 | Band age categories get the U10 field and swim programmes but a proper track programme | `field.ts:26`, `swimming.ts:99` vs `athletics.ts:103-113` (11-C2) | medium | reported by slice 11, not re-verified |
| 27 | "Fill the empty place" sub option can refill a sent-off player's place in rugby (league guards it) and during handball's 2-minute window | `rugby/index.tsx:479`, `handball/index.tsx:507` (01-C9) | medium (rules) | reported by slice 01, not re-verified |
| 28 | League sin-bin time keeps running after a later send-off (rugby stops it) | `rugby_league/sheet.ts:35-39` (01-C3) | low-medium | reported by slice 01, not re-verified |
| 29 | Edit tournament: a sport added later misses region / market defaults; team caps are saved even when registration is closed | `EditTournament:124, 150-151` (07-C4, C5) | low-medium | reported by slice 07, not re-verified |
| 30 | Event-setup pool: only CombinedEventSetup lists everyone when there are no teams or houses | `CombinedEventSetup.tsx:119` vs the other 7 (07-C6, 08-C2) | low | reported by slices 07 and 08, not re-verified |
| 31 | Bracket tie rubbers get no sport defaults when the format is unsaved; next round / 3rd place can start in the past | `BracketScreen.tsx:237, 270` (07-C9) | low-medium | reported by slice 07 (per its helper), not re-verified |
| 32 | Team tie "first to 2½" vs series clinch at 3 when ½-point rubbers end without a game | `teamTie.ts:392-394` vs `series.ts:256-257` (10-C6) | low | reported by slice 10, not re-verified |
| 33 | Billiards skips the impossible-break integer check, so a crafted snapshot shows "break of 2.5" | `billiards/read.ts:37-49` (04 C-C1) | low | reported by slice 04, not re-verified |
| 34 | Scoring access omits the tournament's own organiser account for org-hosted events (client stricter than server) | `core/org.ts:325-334` (10-C3) | low | reported by slice 10, not re-verified |
| 35 | 44-pt touch targets missing in handball / hockey (chips, Cancel, "Correct the timeline") and netball's link | 01-C1 | low (a11y) | reported by slice 01, not re-verified |
| 36 | Cycling `SmallBtn` is 36×36; Road's identical button is 44×44 | `CyclingPanel.tsx:539` (06-C3) | low (a11y) | reported by slice 06, not re-verified |
| 37 | Team-colour text contrast fixed in ice / AF / netball only; rugby, league, handball and hockey use the raw colour | 01-C8 | low (a11y) | reported by slice 01, not re-verified |
| 38 | "21th / 22th" ordinals | `RoadPanel.tsx:262` (06-C1), `teamTie.ts:196` (10-C11), `liftingTeam.ts:109` (11-C4); slice 05 also lists `conduct.ts:183-184` | low | reported by slices 06, 10, 11, not re-verified |
| 39 | Voice jersey numbers 16–20 work only in football | `football/voiceCommands.ts:12-16` vs `voiceMatch.ts:12-15` (02-C4, 06-C11) | low | reported by slices 02 and 06, not re-verified |
| 40 | Racket Stats-tab heading: "Player stats" vs "Box score" | tennis, badminton, volleyball vs padel, `rallyCore` (04 R-C3, 05-C1) | low | reported by slices 04 and 05, not re-verified |
| 41 | Racket commentary clock skipped tennis's first-stamped-point fix, so older logs show wrong elapsed times | `racketCommentaryModel.ts:113` (04 R-C2, 05-C2) | low | reported by slices 04 and 05, not re-verified |
| 42 | "best of 1" on tennis / badminton boards for single-set / single-game matches | `tennis/index.tsx:143`, `badminton/index.tsx:134` (04 R-C1) | low | reported by slice 04, not re-verified |
| 43 | Initials differ from `avatarInitials` (no uppercase in Discover / Following / TeamProfile; spaces only; "A." vs "AK" on team vs squad page) | 06-C9, 07-C10, 08-C4 | low | reported by slices 06, 07, 08, not re-verified |
| 44 | Minus signs: wind "-1.2" vs "−1.2"; goal difference "-3" vs "−3"; golf to-par hyphen on the profile | 06-C2, 06-C14, S3-D52 | low | reported by slices 06 and 03, not re-verified |
| 45 | BoxScore team comparison highlights the higher number even on lower-is-better rows | `BoxScore.tsx:195-200` (06-C5) | low | reported by slice 06, not re-verified |
| 46 | Pushes from notify-upcoming / notify-followers have no `channelId: 'default'` (check on Android); a bad body returns 500 | 04 DRIFT-3, DRIFT-4 | low | reported by slice 04, not re-verified |
| 47 | Android OTA build only loads `EXPO_PUBLIC_SUPABASE_*`; future `SITE_URL` / `SUPPORT_EMAIL` won't reach it | `publish-android-ota.sh:20` (04 N-C2) | low (latent) | reported by slice 04, not re-verified |

**Plus 50 more low-severity C items** (cosmetic, demo-only or edge cases). Examples:
- 01-C2, C4–C7
- 02-C2, C3
- S3-D20, D51
- 04 C-C2, C-C3, N-C1, DRIFT-1
- 05-C3
- 06-C4, C6–C8, C10, C12, C15, C16
- 07-C7, C8 and the rest of 07-C12
- 08-C3
- 09-C10–C15
- 10-C4, C7–C10
- 11-C3, C5–C9

See the slice files.

---

## 5. Suggested order for removing the A items

Each step is a small, reviewable PR. Each one keeps the [quality mandate](../quality-mandate.md): tests first. Before merging a step, prove zero behaviour change with:
- (1) the existing tests;
- (2) `tsc` and a web build;
- (3) a per-sport chunk-size check (no sport's download grows);
- (4) for UI steps, a before/after screenshot of every affected screen.

1. **Delete the two unused files**: `sports/basketball/Timeline.tsx` and `sports/LiveTimeline.tsx` (197 lines). Proof: grep shows no import; the full suite still passes. `tests/a11y-labels.test.mts` scans files statically, so a missing file is fine.
2. **Type-only and constant items** — no runtime effect:
   - `Source` → `TeamSource` (07-A2);
   - the two palettes (07-A12);
   - education types (10-D18);
   - the 10 MB limit (09-A25);
   - `ANDROID_PACKAGE` (10-D24c).
3. **Pure text helpers in one new dependency-free module**, one helper per PR. For each, first write a test that runs the old copy and the new one over a large input set and requires equal output. Then swap the callers.
   - HTML `esc`
   - `plural` / `andList`
   - initials
   - month names
   - local ISO date
   - `deburr`
   - chess ½
   - `cap` (optional)
   - **ordinal last**: test n = −1000…2000, NaN, ±Infinity and decimals against all 19 copies, because the slices disagree.
4. **Style-sheet merges** (screenshots required): event-setup base sheet, career sheet, invasion base sheet, results panel keys, segmented control, checkbox styles.
5. **UI components and hooks**, one family per PR, with screenshots of each sport or screen:
   - event-setup hook and parts;
   - career panels;
   - `openMatchViewer` with `canScore = false`;
   - invasion `ScorerParts.tsx`;
   - cue UI parts;
   - racket point-detail parts and the commentary hook;
   - 05-D28 panel blocks.
6. **Data-layer helpers**, with the PGlite integration tests:
   - `useFocusFetch`;
   - repos local helpers (owner label, invite row, org requests);
   - `resultsStore` `insertNextPhase` / `storedBook`;
   - the edge-function error reader.
   - The legal paragraphs (09-A1) only with the founder's OK.
7. **Scoring engines — golden replay tests first.**
   - Before moving anything, record the final state, `result()`, `statTotals` and box output of every saved demo log and test fixture, per sport.
   - Then, one module per PR: cue `frameEngine`, tennis/padel `setEngine`, invasion `clockCore` / shoot-out / attribution / reducer preamble, cricket `logSymbol` branches, `clearMatch` exports, the event → action mapper.
   - After each move the recorded output must be byte-equal.
   - Also run the engine sim tests (500-user sims per the mandate).
8. **Results engine** (medal table, seeding, ranking): the same golden approach, using recorded meet outputs.
9. **Edge functions last**:
   - first create the pure `_shared/http.ts` / `text.ts`;
   - then change one function per deploy;
   - after each deploy, run `scripts/auth-smoke.mjs` and check the function's live replies (status codes and bodies) are unchanged;
   - never move join-club or verify-contact-otp onto `admin`.

Don't fix any C item inside a de-duplication PR. Fixing a C changes behaviour, so it gets its own decision, test and PR.

---

## 6. Coverage

What each slice says it read, in its own words where useful:

| Slice | Coverage |
|---|---|
| 01 | "Coverage is now complete." Every file read line by line. `rugby_league/index.tsx` and `hockey/index.tsx` were checked through a complete diff against a sibling read line by line. Meta long lines were cut at 260 chars; sheet doc comments skipped. |
| 02 | All 92 files "reviewed in full" (a second pass covered the 13 first read in part). "Doc comments and the ends of very long lines were skimmed"; `football/index.tsx` long lines truncated at ~240 chars. |
| 03 | All 67 files read in full. Cross-checks outside the slice (`components/golf/*`, `data/golf*.ts`, cue sports) were "grep plus a targeted read, not a full review". |
| 04 | Split three ways. Cue sports and edge functions were read in full by two sub-reviews, their A items re-checked by diff. `tennis/StatsPanel.tsx` was "not re-reviewed" (consolidated today). `build-website.mjs` static HTML lines were read truncated at 220 chars. Shared racket files were read "for comparison… not audited on their own account" (slice 05 audited them). |
| 05 | All 113 files read in full; `types.ts` lines 360-616 "read with doc comments filtered out; all code lines read". |
| 06 | The lead read `results/`, `athletics/` and `ui.tsx`; three forked reviewers read the rest, every line. Their A items were re-checked. "The part reviews' (B) list and C13–C16 were not all re-read"; out-of-slice files were read in excerpts only. |
| 07 | The lead read 45 files; two helper reviewers (07-L, 07-H) read the rest in full. Items marked "(per 07-L/H)" were not re-verified. Whether RLS blocks the writes in 07-C2 and the `canOrganize` path was not checked. |
| 08 | "All files in the slice were read in full (every line)." |
| 09 | The lead read 4 files (10,081 lines); a sub-agent read the other 76. Every "identical" claim was re-checked, and several were downgraded. In `demoStore`, the pure seed tables were checked for duplicate ids only. |
| 10 | "Every file was read; a few long single lines were read truncated at ~200 chars." Support articles and World Cup squads were checked for duplicate ids or keys only, not line-audited. |
| 11 | All 54 files read in full. "Not traced": the screen's own record path (`ResultsEventScreen.tsx:410`) for 11-C1, and whether the ordinal helpers in `MedalTable`, `structureConfig`, `tournamentHistory` and `golf/engine` match exactly. |

**What was not read line by line, overall:**
- Very long single lines (data tables, static HTML, template strings) were truncated in slices 01, 02, 04 and 10.
- Doc comments were skimmed in 01, 02 and 05.
- Prose and data tables were checked for duplicate ids only: support guides and KB, World Cup squads, demo seed tables.
- Sub-reviewer findings marked "per 07-L/H" (07), and the part-review B list plus C13–C16 (06), were not re-read by those slices' leads.

---

## 7. Slice reports

- [slice-01.md](slice-01.md) — team invasion sports
- [slice-02.md](slice-02.md) — football, basketball, kabaddi, volleyball, baseball
- [slice-03.md](slice-03.md) — cricket, chess, carrom, golf
- [slice-04.md](slice-04.md) — racket sports, cue sports, edge functions, worker, scripts, navigation
- [slice-05.md](slice-05.md) — shared sport layer, event sports
- [slice-06.md](slice-06.md) — components
- [slice-07.md](slice-07.md) — screens A–M
- [slice-08.md](slice-08.md) — screens N–Z
- [slice-09.md](slice-09.md) — data A–R
- [slice-10.md](slice-10.md) — data S–Z and core
- [slice-11.md](slice-11.md) — results engine
- [exact-clones-all.txt](exact-clones-all.txt) — the mechanical clone scan the slices verified
