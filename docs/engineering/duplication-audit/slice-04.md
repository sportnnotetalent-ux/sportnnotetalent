# Slice 4 — duplication audit (racket sports, cue sports, edge functions, worker / scripts / navigation / App)

Read-only audit. No repo file was changed. Scope per the user's change: **duplicated code only**, each finding classified:

- **(A) Removable with zero behaviour change** — same output / UI / text / styles / a11y labels / side effects / replay results for every input. Only (A) counts toward "lines removable".
- **(B) Not identical, leave it** — the exact difference is listed.
- **(C) Drift that looks like a bug** — finding only, not removable.

The slice was split three ways. Cue sports and edge functions were reviewed by two sub-reviews (every line read; their A items re-verified by diff). I reviewed racket sports, worker, scripts, navigation, App.tsx and index.ts myself.

| Part | Files | Lines | (A) removable |
|---|---|---|---|
| Racket sports (tennis, padel, badminton, TT, pickleball, squash) | 30 | 3,454 | ~163 |
| Cue sports (pool, snooker, billiards, cue) | 47 | 7,704 | ~234 |
| supabase/functions (incl. _shared) | 45 | 4,976 | ~157 |
| worker, scripts, navigation, App.tsx, index.ts | 20 | 3,039 | (included in racket row above: 33 of the 163) |
| **Total** | **142** | **~19,170** | **~554** (+ ~280 optional, see N-A7) |

Already-done work not re-reported: StatBar / MatchStatsPanel / tennis StatsPanel consolidation (today).

---

## Part 1 — Racket sports

### Which racket sports use the shared rally layer, and why the others don't
- **Table tennis, pickleball, squash** are 100% on `rallyEngine.ts` + `rallyCore.tsx` (`makeRallyPlugin`). Their own folders hold only meta, stats schema, a one-line plugin call and (TT) `serve.ts`. No duplication inside them.
- **Badminton** has its own engine (`badminton/engine.ts`, 194 lines). That is justified: the cap + golden point (`gameWinner` with `cap`/`goldenPoint`), "the rally winner serves" with BWF service courts, and BWF doubles order differ from the rally engine's win-by-N / side-out model. A few pure helpers are copies, though (R-A10, R-A8).
- **Tennis and padel** have their own engines. That is justified: points 0/15/30/40, games, sets, tiebreaks. But **tennis and padel share no engine code with each other**, even though about 40 lines are identical between them (R-A4 to R-A9). `serve.ts` is the only shared module between them today.

### (A) Removable with zero behaviour change

| ID | What | Copies (path:lines) | Copy that stays → where | Why provably identical | Bundle effect | Removable |
|---|---|---|---|---|---|---|
| R-A1 | `frac` / `pctOf` row formatters | serveStats.ts:563-564; racketMatchStats.ts:250-251; tennis/matchStats.ts:179-180 | serveStats.ts (export them) | Character-identical one-liners | none (both files already import serveStats.ts) | 4 |
| R-A2 | `blockOf(v, scope)` | tennis/matchStats.ts:185-187; racketMatchStats.ts:257-259 | serveStats.ts, typed on `{ st: ServeStats }` | Identical body; only the view type name differs | none | 3 |
| R-A3 | `RowAdd` + `rowsOf` (+ racket's `ratioRow`/`countRow`) | tennis/matchStats.ts:189-203; racketMatchStats.ts:252-254, 263-272 | Tennis's version → serveStats.ts | Tennis passes `(x, side)` to the ratio lambdas, racket passes `x`. Every racket call's lambda ignores a 2nd argument, so output rows are identical. | none | 12 |
| R-A4 | `winSet()` set-win step (events "Set N won" / "Match won") | tennis/engine.ts:148-156; padel/engine.ts:110-118 | New tiny `src/sports/setEngine.ts`, imported by both engines | Bodies are character-identical; `Pair` = `[number, number]` | +~12 lines shared by the tennis and padel chunks; net −9 | 9 |
| R-A5 | `clearMatch()` | tennis/engine.ts:201-203; padel/engine.ts:169-171 | setEngine.ts | Identical object literal | as R-A4 | 3 |
| R-A6 | `EDIT_LOG` replay with serve tracking off, then restored | tennis/engine.ts:218-226; padel/engine.ts:185-191 | setEngine.ts `replayWithServe(reducer, s, points)` | Same three statements (only the comments differ) | as R-A4 | 5 |
| R-A7 | `SET_FIRST_SERVER` (v:2 fix) | tennis/engine.ts:240-246; padel/engine.ts:200-206 | setEngine.ts | Identical, including the `played` expression | as R-A4 | 6 |
| R-A8 | `conductOps.gameKey` / `where` | tennis/engine.ts:210-211 = padel/engine.ts:177-178; badminton/engine.ts:104-105 = rallyEngine.ts:153-154 | conduct.ts: `setGameKey`/`setWhere` and `gameGameKey`/`gameWhere` | Identical pairs | none (conduct.ts is already in every racket chunk) | 4 |
| R-A9 | `standingsUnits` games loop (a match tiebreak = one game) | tennis/engine.ts:345-358; padel/engine.ts:306-319 | setEngine.ts `gamesFromSets(s, mtb, tbs)` | The forEach loop is identical. Only the `mtb` array source differs: `matchTbSets(s)` vs the padel inline map. Passing it in keeps both outputs exact. | as R-A4 | 10 |
| R-A10 | Badminton `scoreLine` / `lineScore` = rally `rallyScoreLine` / `rallyLineScore` | badminton/engine.ts:164-170; rallyEngine.ts:372-378 | scoreline.ts `gamesScoreLine` / `gamesLineScore` on a minimal `{games, current, gamesWon, ended, gamesToWin}` shape | Identical bodies. (BadmintonState isn't assignable to RallyState, so the helper goes in scoreline.ts rather than reusing the rally one.) | none (scoreline.ts is already imported by both) | 6 |
| R-A11 | Tennis point capture vs shared PointDetailRow: (a) "📊 Extra stats" options row + chooser chips; (b) the shared style sheet entries; (c) "By:" erring-player row; (d) "2nd serve" chip row; (e) `pick()` | (a) tennis/PointCapture.tsx:69-83 = PointDetailRow.tsx:77-91. (b) PointCapture:244-252 = PointDetailRow:236-244. (c) PointCapture:161-169 = PointDetailRow:186-194. (d) PointCapture:170-174 = PointDetailRow:195-199. (e) PointCapture:102-108 ≈ PointDetailRow:110-116 | New small `src/sports/pointDetailParts.tsx` (styles + `DetailOptions`, `ErrByRow`, `SecondServeRow`, `pickHow`) | (a) Same JSX, same a11y labels. `trackFields('tennis')` returns `[...TENNIS_TRACK_FIELDS]` (pointDetailSettings.ts:60), same order. Only a lambda variable name differs. (b) Same 9 style objects. (c)(d) Character-identical JSX. (e) Identical once the sport and the current wing/shot are passed in. | **Do not** import PointDetailRow.tsx into tennis: the tennis chunk doesn't load it today, and it's 245 lines. The new parts file is ~50 lines in both. | ~41 |
| R-A12 | Commentary component hook (roster keys, `useMask`, roster mapping, `useMemo`) | tennis/Commentary.tsx:33-46; RacketCommentary.tsx:31-44 | `useCommentaryBlocks(model, state, names, deps)` in CommentaryFeed.tsx (both already import it) | Same hook calls in the same order; same memo inputs once the model function and `sport` are passed in | **Not** in RacketCommentary.tsx: it pulls racketCommentaryModel (badminton + padel + rally engines) into the tennis chunk | 9 |
| R-A13 | Commentary model helpers: `article`, `finish()` (blocks newest-first), `gamesDone`, the "fresh slate" state object | tennis/commentaryModel.ts:89, 223-226, 111, 140; racketCommentaryModel.ts:60, 137-140, 150, 151 | tennis/commentaryModel.ts (export them; racketCommentaryModel.ts:51 already imports from it) | Identical text; the slate is the same literal with PadelState vs TennisState | none | 7 |
| R-A14 | racketCommentaryModel re-derives each engine's `clearMatch` inline | racketCommentaryModel.ts:219 (= badminton/engine.ts:95-97), :220 (= rallyEngine.ts:118-123) | Export `clearMatch` from badminton/engine.ts. Hoist the rally one out of the `makeRallyEngine` closure (it uses no `opts`) | Identical field sets | none | 2 |
| R-A15 | Commentary tab wrapper `<RacketCommentary sport icon …/>` | badminton/index.tsx:108-110; padel/index.tsx:128-130; rallyCore.tsx:313-315 | `racketCommentaryTab(sport, icon)` in RacketCommentary.tsx | Same props forwarded | none | 6 |
| R-A16 | Badminton `serveBanner` style = tennis `serveBanner` | badminton/index.tsx:188-192; tennis/index.tsx:205-209 | A shared racket style (e.g. in PointButtons.tsx, which both import) | Identical style objects | none | 4 |
| N-A1 | `openMatchViewer` written out inline | CalendarScreen.tsx:110-116; NotificationsScreen.tsx:80-86; SportProfileScreen.tsx:180-186 (src/navigation/openMatch.ts:9-17 is the helper) | src/navigation/openMatch.ts | Identical params object (matchId, sport, short/full names, colours, `canScore: false`) | none (type-only imports) | 18 |
| N-A2 | Full-screen loading spinner View | RootNavigator.tsx:380-384; :493 (Suspense fallback) | One `const Spinner = …` in RootNavigator | Identical style and colour | none | 3 |
| N-A3 | Brand constants `HERO`, `SOFT`, `FONT_DIR`, the two font file paths | scripts/build-share-images.mjs:19-23; scripts/build-brand-kit.mjs:18-22 | Export from scripts/build-icons.mjs (both already import it) | Identical values. The rest of the font options (`loadSystemFonts`, `defaultFontFamily`) differ and stay local. | none | 4 |
| N-A4 | Env-file lookup and EXPO_PUBLIC loader | scripts/publish-web.sh:12-24; scripts/publish-android-ota.sh:13-21 | `scripts/lib/load-env.sh` with the grep pattern as an argument | Same lines; only the grep pattern differs (passed in, so each script behaves exactly as now) | none | 7 |

**Racket + misc (A) total: ≈163 lines.**

Patterns noted with 0 removable (1-liners, A but no saving): `result: (s) => …winner…` is identical in tennis/index.tsx:173 = padel/index.tsx:182 and badminton/index.tsx:158 = rallyCore.tsx:364. The `ids = (r) => r.map((x) => x.id)` helper appears ×4 (tennis:161, padel:171, badminton:147, rallyCore:423). The `opp` one-liner appears in 6 racket files.

Two more zero-saving A patterns, both type-only or string-only:
- **N-A5:** navigation/types.ts repeats a few param shapes.
  - `{ c?: string } | undefined` ×3: SchoolRequest :59, GuardianConsent :93, OrgConfirm :111.
  - `{ token?: string } | undefined` ×3: JoinTournament :164, JoinTeam :165, JoinClub :174.
  - `{ tournamentId: string }` ×9: ImportSchedule, AssignScorers, Contingents, Certificates, EditTournament, LinkEdition (top of file), and others.
  - A named alias is zero-change (types only, no runtime or bundle effect), but each use is one line either way, so 0 lines saved.
- **N-A6:** scripts/legal-docx.py repeats the XML declaration `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` 8 times: STYLES :134, footer :161, document :167, CONTENT_TYPES :174, ROOT_RELS :185, DOC_RELS :192, core :200, APP :206.
  - A constant gives byte-identical output.
  - Each copy is inside an existing string, so 0 lines saved.

### N-A7 (A, optional — mostly a formatting / table refactor, counted separately)
RootNavigator.tsx:345-842 has 92 `<Stack.Screen … options={{ ...stackScreenOpts, title }}>` entries, 75 of them spread over 5 lines. A `[name, Component, title]` table mapped in the same order gives the identical element tree (keys = names). The exceptions keep their own entries: GenerateFixtures' title is computed at render time, CopyTournament's options are a function, ResultsLab is behind `SHOW_DEV_SCREENS`, and Personalise has extra options. That's about 280 lines removable, but it's a wide diff for little logic gain. Low priority.

### (B) Not identical — leave

| ID | Where | Exact difference |
|---|---|---|
| R-B1 | `disp()` tennis/engine.ts:136-145 vs padel/engine.ts:99-108 | Tennis has `me === them \|\| s.noAd` (no-ad shows 40-40); padel has no no-ad. |
| R-B2 | `scorePoint()` tennis 158-197 vs padel 120-165 | Ace kind/icon (🎯/🎾 vs 🟡), match-TB stamp `'Match TB'` (padel) vs `Set N · TB`, golden / star point game rule, Fast4 sudden death, `setWinByTwo`. These are rules. |
| R-B3 | `setTiebreaks()` tennis 285-297 vs padel 247-260 | Tennis counts `point` + `ace` with stamp `Set N · TB`; padel counts `point` only, plus the `Match TB` stamp. |
| R-B4 | `scoreLine` / `lineScore` tennis 304-326 vs padel 263-285 | Match-tiebreak test: `finalSetTiebreak > 0` / `isMatchTB` vs `matchTbDecider` / `matchTbActive`. Same shape, different state fields. |
| R-B5 | `summary()` tennis 329-338 vs padel 288-299 vs badminton 174-183 vs rallySummary rallyEngine.ts:382-396 | Padel: 'Match tiebreak' status and ' · golden pt' / ' · star pt'. Rally: ' (win by 2)' and the serve call. Badminton: neither. |
| R-B6 | Badminton game-won step badminton/engine.ts:149-157 vs rally `finish()` rallyEngine.ts:126-139 | Rally also resets `serving` / `serverNo` / `srvStarter` and alternates the first serve (`altGames`). Badminton has the cap / golden point. |
| R-B7 | Badminton `standingsUnits` (187-191) vs rallyCore `standingsPoints` (366-369) | Same reduce, but badminton guards `!s` / non-array and wraps the result as `{ points }`. |
| R-B8 | `SET_FIRST_SERVER` badminton/engine.ts:120-126 vs tennis/padel | `played` = `current.home \|\| current.away \|\| games.length` vs games + pts + sets. The rally engine's version (182-199) is a different rule. |
| R-B9 | Stats tab components: tennis/index.tsx:117-131, badminton 111-125, padel 131-145, rallyCore 316-330 | Box-score heading "Player stats" (tennis, badminton) vs "Box score" (padel, rally); different box sources; tennis uses its own panel. See R-C3. |
| R-B10 | Scoreboard components: tennis 137-154, padel 150-165, badminton 129-142, rallyCore 335-352 | Different status text and lead labels; padel has golden / star point; `bestOf` text differs (see R-C1). |
| R-B11 | ScoringControls serve banner: tennis:74 / badminton:69 (`serveBanner` pill, text colour, weight 800) vs padel:83 (`ctrl.serve`: muted, weight 700, no pill) vs rallyCore:288 (`ctrl.serve`: text colour, weight 700, no pill) | Different styles. Visual inconsistency across racket sports, so a decision is needed, not a dedupe. |
| R-B12 | `ServeFirstPicker` blocks ×4 (tennis:76-80, padel:84-88, badminton:70-74, rallyCore:190-199) | Icon; rally adds `canFix`, `opening ?? 'home'` and pickleball's `alt` / `pos` payload. |
| R-B13 | TennisPointDetail vs PointDetailRow as whole components | Tennis: speed input, ace handling, "Last point · … · ace", a11y "Describe the last point" / "Skip describing this point", "At the net:" label. Shared: "rally" wording, error-type row, NET_WORDS label, Nobody chip, 3rd shot. Only the sub-blocks in R-A11 are identical. |
| R-B14 | tennis/Commentary.tsx vs RacketCommentary.tsx (scan entry) | Different model (tennisCommentary vs racketCommentary); tennis passes no `emptyText`. Only the hook is shared (R-A12). |
| R-B15 | Tennis commentary model vs the padel branch of racketCommentaryModel.ts:143-212 | Padel adds a 'Golden point' / 'Star point' meta and a 'Break of serve' note (:202). Tennis adds serve speed. Tennis gives the ace credit to the server. Different `gameScore` 3rd argument (`noAd` vs `goldenPoint`). Also see R-C2 and R-C4. |
| R-B16 | Sport meta files (tabletennis/pickleball/squash/badminton/tennis/padel meta.ts) | Same structure; the format options are per-sport data. |
| R-B17 | `*MatchRecords` one-liners: tennis/records.ts:10, padel/records.ts:10, badminton/records.ts:10, rallyRecords.ts:10 | Each binds its own `lineScore` and the `tiebreaks` flag. They are separate files on purpose (perf F-15: each chunk carries only its own hook). |
| R-B18 | tennis/stats.ts `keyed` (14) vs pool/stats.ts:30 `keyed` | Different signatures (`group` argument, default group 'shots'). |
| N-B1 | `esc()` HTML escapers: worker/matchPage.ts:28; scripts/build-website.mjs:39; scripts/build-share-images.mjs:28; plus 7 copies in src (core/orgVerification.ts:650, certificates.ts:132, hallOfFame.ts:168, passport.ts:42, chess/roundSheet.ts:177, data/results/printSheets.ts:25, core/fixturesText.ts:22) | worker = the src regex-map versions in output, but the Worker is deliberately free of app code (worker/sports.ts:1-3), so importing app code changes its bundle: leave. build-website has no `'` escape; build-share-images has no `"` escape; fixturesText has no `'` escape. The src copies belong to other slices. |
| N-B2 | worker/sports.ts:4-38 duplicates every sport's name and icon from src/sports/*/meta.ts | Intentional: the Worker carries no app code, and tests/worker-match-page.test.mts fails on drift. |
| N-B3 | worker/matchPage.ts:33-37 `viewsLabel` vs src/core/personalise.ts:98-104 | Worker has no millions branch (see N-C1); different rounding expression. |
| N-B4 | scripts/auth-smoke.mjs:16-20 env parse (JS) vs the shell loader | Different language; only URL and ANON_KEY are read. |
| N-B5 | build-share-images `fit()` (31-39) vs build-brand-kit `widthOf()` (36-40); wordmark text (share:50 vs brand-kit:34) | Different probe SVG, font options and positioning. |
| N-B6 | build-website.mjs `md()` (42-60) vs `renderGuide()` (190-262) vs legal-docx.py `convert()` | Three Markdown subsets with different outputs (HTML legal pages, guides with TOC / tables / callouts, Word XML). |
| N-B7 | RootNavigator.tsx:160 `STACK_SCREENS` vs the `<Stack.Screen>` names | A manual parallel list. Checked: every stack screen without a configured `linking` path is in the set, and nothing in the set is missing a screen. No drift today. |
| N-B8 | navigation/types.ts: LiveScoring (8-25) / MatchSquad (26-36, one line at 31) / LineupEditor (187-198) / CricketLineup (199-209) repeat the team-name / colour fields | Required vs optional differs: `homeName: string` and optional `homeTeamName?` in LiveScoring, optional in MatchSquad, required `homeTeamName: string` in LineupEditor and CricketLineup. Plus per-screen extras. |
| N-B9 | scripts/legal-docx.py: `field("PAGE")` / `field("NUMPAGES")` (152-156, used twice in `footer()` 159-163) and the 3 package-rels strings `CONTENT_TYPES` / `ROOT_RELS` / `DOC_RELS` (174-197) | Not duplicates: one generator each, used once. No other `.docx` generator exists in src / scripts / supabase / worker (grep `wordprocessingml`). |

### (C) Drift that looks like a bug (findings only)

- **R-C1 — "best of 1" on the board for single-set / single-game matches.**
  - tennis/index.tsx:143: `bestOf={`best of ${s.setsToWin * 2 - 1}`}`.
  - badminton/index.tsx:134: `bestOf={`best of ${s.gamesToWin * 2 - 1}`}`.
  - padel/index.tsx:157 and rallyCore.tsx:344 say `'single set'` / `'single game'` when `toWin === 1`, and so do the tennis / badminton engines' own `summary()` (tennis/engine.ts:335, badminton/engine.ts:181).
  - Tennis offers setsToWin 1 (the "Pro set", "Match tiebreak" and "Single set" options in tennis/meta.ts:28, 33, 49); badminton offers "Single game" (badminton/meta.ts:24, 49).
  - Result: those boards read "Set 1 · best of 1" while the summary says "single set".
- **R-C2 — the racket commentary's match clock skipped tennis's fix.**
  - tennis/commentaryModel.ts:121-124 takes `t0` from the first *point* only when that point is stamped. Its comment says this is so that an older match whose later points gained stamps doesn't read "0:00" mid-match.
  - racketCommentaryModel.ts:113 uses `events.find((e) => typeof e.at === 'number')?.at`, the first stamped event of any kind.
  - Badminton, TT, squash, pickleball and padel commentary can therefore show wrong elapsed times on such older logs.
  - Display only.
- **R-C3 — box-score heading differs across racket sports.** "Player stats" (tennis/index.tsx:127, badminton/index.tsx:121) vs "Box score" (padel/index.tsx:141, rallyCore.tsx:326). Low.
- **R-C4 — possible gap: tennis commentary never says "Break of serve".** Padel does (racketCommentaryModel.ts:202 `!tb && W !== S ? { note: 'Break of serve' }`); tennis/commentaryModel.ts:205-208 has no such note. Tennis also never labels its no-ad deciding point, while padel labels golden / star points. Needs a product decision.
- **N-C1 — link preview views label above 1M.** worker/matchPage.ts:36 gives "2500k views" for 2,500,000; the app gives "2.5M views" (personalise.ts:103). Low.
- **N-C2 — the OTA build only loads `EXPO_PUBLIC_SUPABASE_*`.**
  - scripts/publish-android-ota.sh:20 greps only that prefix; publish-web.sh:23 loads every `EXPO_PUBLIC_*`.
  - Firebase and VAPID are web-only (src/core/firebasePhone.ts:30), so nothing is lost today.
  - But `EXPO_PUBLIC_SITE_URL`, `APP_URL`, `EXTRA_LINK_ORIGINS` and `SUPPORT_EMAIL` (read by src/core/hosts.ts etc. for the SD-151 .com switch) would silently not reach Android OTA builds once they are set in .env.local.
  - Latent; worth aligning when the .com move happens.

### Risk notes
- R-A4 to R-A10 and R-A14 touch scoring engines and reducers. They are text-identical, so replay results cannot change, but run the tennis / padel / badminton engine and sim tests after the move.
- R-A11 to R-A13 are display / UI (low risk).
- N-A1 to N-A4 are low risk.

---

## Part 2 — Cue sports (pool, snooker, billiards, cue)

**Is cue/ a shared layer used fully?** Only for the screen.
- Snooker and billiards both use `cue/` for UI parts, send, the end-of-frame confirm, corrections, names, stat labels and uiState.
- Everything else is still copied per sport: engine helpers and read-only readers, the controls builder setup, read.ts `statsFor`, totals, box, records, matchStats, feed and undo. Those copies are byte-identical or nearly so.
- Pool imports nothing from `cue/`. Mostly that is intentional (racks / balls / sets vs frames), but pool re-implements `useSideNames` and some `cue` styles.
- `src/sports/CueBanner.tsx` is unrelated: it is the racket court-cue banner.

**Bundle note:** new shared files in `cue/` land only in the snooker and billiards chunks (which already load `cue/`). `boxSources.ts:41,43` already imports both box files.

### (A) Removable with zero behaviour change (≈234 lines)

| ID | What | Removed copies | Stays → where | Why identical | Lines |
|---|---|---|---|---|---|
| C-A1 | `other, isSide, isObj, own, num, intIn, clamp` | snooker/engine.ts:143-157, billiards/engine.ts:105-116 | new `cue/frameEngine.ts` | byte-identical code | 11 |
| C-A2 | `readBestOf`, `breakerFor` | snooker 173-181, billiards 128-136 | cue/frameEngine.ts | diff empty | 8 |
| C-A3 | `safe()` | snooker 187-191, billiards 142-146 | " | diff empty | 5 |
| C-A4 | `isScore`, `isPair` | snooker 266-267, billiards 227-228 | " | diff empty | 2 |
| C-A5 | `goodFrames, wonOf, liveFrame` (isState as a parameter), `isComplete, frameScores, scoreLine` | snooker 546-551, 553, 563-568; billiards 393-400, 422-426 | " | identical code | 11 |
| C-A6 | `lineScore`, `standingsUnits` | snooker 572-586, billiards 428-441 | " (liveFrame as a parameter) | only comments differ | 12 |
| C-A7 | `NO_SUMMARY`, `tossRecorded`, `replay` | snooker 535-539, 636, 638; billiards 382-386, 444, 467 | " | diff empty | 6 |
| C-A8 | Reducer wrapper + frame-stamp check + `named()` | snooker 286-315, billiards 248-275 | " | only comments differ | 12 |
| C-A9 | `CONCEDE` / `AWARD_FRAME` cases | snooker 386-396, billiards 335-345 | " (AWARD_REASONS as a parameter) | diff empty | 9 |
| C-A10 | `goodFoul`, `knownKind`, `goodList`, outer loop of `breaks()` | snooker 710-712, 783-790; billiards 548-550, 614-621 | " | one comment line differs | 9 |
| C-A11 | Controls builder setup (`live, accept, shot, named, framed`); scan entry controls 25/31 | snooker/controls.ts:28-48, billiards/controls.ts:22-41 | new `cue/builders.ts` `makeBuilders(reducer, isState)` | only comments differ | 19 |
| C-A12 | 7 more `other` copies | snooker controls:25, totals:33, feed:13, index:43; billiards totals:28, feed:12, index:44 | export from each engine | identical | 7 |
| C-A13 | `statTotals` + `n()` | snooker/totals.ts:34, 53-62; billiards/totals.ts:29, 49-58 | new `cue/totals.ts` `perSideTotals(sideRecord)` | diff empty | 10 |
| C-A14 | Box source | snooker/box.ts:12-29 | new `cue/box.ts` (billiards' version with unit 'frame') | same "Frame n" / "No frames yet." text | 15 |
| C-A15 | read.ts `isObj, nn, list`, `statsFor` | snooker/read.ts:43-45, 66, 137-152; billiards/read.ts:30-32, 56, 105-120 | new `cue/read.ts` | diff empty | 17 |
| C-A16 | `breakList`, frame numbers | snooker/matchStats.ts:20, 89-91; billiards 19, 86-88 | cue/read.ts | one comment line | 4 |
| C-A17 | `leadText` | snooker/feed.ts:43-44, billiards/feed.ts:40-41 | cue/read.ts | diff empty | 2 |
| C-A18 | Records loops (highest break, biggest frame) | snooker/records.ts:24-28, 35-42; billiards 20-24, 26-33 | new `cue/records.ts` (unit as a parameter) | unit word is a parameter; the snooker `!f.winner` and billiards `!== home && !== away` checks pass the same frames (read.ts:75 guarantees a home/away winner) | 11 |
| C-A19 | Frame-row types → `SheetRow` | snooker/matchStats.ts:60-73, billiards 62-72 | cue/parts.tsx:139-150 | types only | 25 |
| C-A20 | `FrameScoreCheck` → `ScoreCheck` | snooker/controls.ts:300, billiards/controls.ts:179 | cue/parts.tsx:48 | same type | 2 |
| C-A21 | Toss row ("breaks off · Change") | snooker/index.tsx:91-97, billiards/index.tsx:90-96 | new component in cue/parts.tsx | only a comment differs; always mounted | 6 |
| C-A22 | `st.big`, `st.link` | snooker/index.tsx:355-356, billiards/index.tsx:277-278 | cue styles | diff empty | 2 |
| C-A23 | `cap()` | cue/parts.tsx:137, billiards/index.tsx:46 | export from cue/ending.ts:102 | identical | 2 |
| C-A24 | Snooker controls `minFoul` | snooker/controls.ts:102-105 | export snooker/engine.ts:210-213 | same result for every `on` value `live()` lets through | 4 |
| C-A25 | Billiards `PART_VALUE` | billiards/controls.ts:43; index.tsx:169 | export billiards/engine.ts:27 | same 5 values | 1 |
| C-A26 | Pool `isObj` ×8 | pool core:17, undo:15, records:19, compare:14, feed:19, totals:43, match:128, controls:30 | export from pool/balls.ts | identical | 7 |
| C-A27 | Pool `racksOf` | pool/compare.ts:15-16 | export from pool/feed.ts:29-31 | same expression | 2 |
| C-A28 | Pool `PENDING` | pool/controls.ts:31 | export from pool/match.ts:173 | diff empty | 1 |
| C-A29 | Pool `gameOf` | pool/totals.ts:44-48 | `knownGame` pool/balls.ts:41 | same result | 4 |
| C-A30 | Pool side names | pool/index.tsx:44-49, 307-310 | cue/useNames.ts (also return `who`) | same naming rule; adds 17 lines to the pool chunk | 5 |
| C-A31 | Pool `ctrl.label/meta/box` | pool/index.tsx:377, 378, 382 | cue styles | identical. **Pulls cue/parts.tsx (249 lines) into the pool chunk**: do it only after splitting the styles into `cue/styles.ts` | 3 |

C-A1 to C-A10 are scoring-engine code: text-identical, but run the snooker / billiards engine and sim tests.

### (B) Not identical — leave
- **C-B1, engine core (snooker vs billiards):** draws (billiards `winner` 'draw' and the single-game points rule B-07), billiards `endFrame` caps at the target and keeps `raw`, snooker `untouched` also checks fouls, billiards `goodVisit` checks stroke parts, reds / respot vs hazard / cannon.
- **C-B2:** totals `sideRecord` bodies (different keys).
- **C-B3:** `BREAK_OFF`. Snooker also refuses after fouls or a respot.
- **C-B4:** `FRAME_SCORE`. Snooker refuses level scores; billiards has target and timed draws; max 999 vs 99999.
- **C-B5:** quick-score check. `\d{1,4}` vs `\d{1,6}`, different error texts.
- **C-B6:** BoardText and board function. Billiards `leadLabel?` and limit warnings vs snooker alerts.
- **C-B7:** Scoreboard. `leadLabel="FRAMES"` vs `b.leadLabel`.
- **C-B8:** Missed / Safety / Foul row. **The a11y labels differ:**
  - "missed a pot: the turn passes" vs "missed: the turn passes";
  - "played a safety" vs "played safe".
- **C-B9:** frame-score form, Corrections, Commentary / Stats tabs, `frameLineScore`, plugin object. Different titles, hints, rule text, empty text ("No shots yet." vs "No strokes yet."), billiards' unit chips and `standingsScore`.
- **C-B10:** read.ts `readVisit` / `readFoul` / `readFrames` / `timeline`. Snooker has the max-break and integer checks, penalties, reracks; billiards has stroke parts, raw, sudden death, draws.
- **C-B11:** `frameSheet`. Billiards adds `raw` and sudden death; snooker adds reracks.
- **C-B12:** top rows. 'Frame points' vs 'Points' (see C-C2).
- **C-B13:** commentary group-building and `howText`.
- **C-B14:** undo label shell. The frame-number rule differs, and the MISS text is 'missed pot' vs 'missed'.
- **C-B15:** records. Snooker sorts by type.
- **C-B16:** billiards `comboValue` vs engine `strokeValue`. For non-boolean input, `comboValue` counts any truthy part.
- **C-B17:** billiards `strokeFoul` vs the engine's inline limit check (nothing extractable as is).
- **C-B18:** pool totals `racksOf` normalises to a different shape.
- **C-B19:** pool `ctrl.chips` adds `alignItems: 'center'`.
- **C-B20:** pool confirm / tap guard vs cue/send and cue/ending (a different model).
- **C-B21:** pool `matchesWon` / `winPct` vs cue/stats.ts:46-54. Tie-break `rackPct` vs `framePct`.
- **C-B22:** snooker controls `nextOn` / `freeOn` vs engine `nextTurnOn` / `freeBallPossible`. Identical, but inline one-liners, so 0 lines saved.

### (C) Drift that looks like a bug
1. **C-C1 — the impossible-break integer check (A-02) only runs in snooker.**
   - snooker/read.ts:53: `if (!Number.isInteger(pts) || pts > max) return null;`
   - billiards/read.ts:37-49 has no integer check.
   - The security doc (docs/security/breaks/snooker-billiards-app.md:34) excuses billiards only from the maximum check.
   - A crafted snapshot can show "break of 2.5" in billiards commentary, frame sheet and records. Display only.
2. **C-C2 — the same row has two labels.** 'Frame points' (snooker/matchStats.ts:27) vs 'Points' (billiards/matchStats.ts:24).
3. **C-C3 — the billiards frame-vs-game rule is written two ways.**
   - `bestOf > 1` in index.tsx:45, records.ts:18 and controls.ts:142.
   - `bestOf === 1` in index.tsx:244, box.ts:13 and undo.ts:36.
   - They disagree only when `bestOf` is missing or not a number (a crafted snapshot): 'game' vs 'frame'.

---

## Part 3 — supabase/functions

**How the shared helpers are used:**
- **Fully on `_shared/guard.ts`** (`requireUser`, CORS, `json`, `admin`): guardian-link, guardian-consent, register-lookup, delete-account, guardian-proof, message-notify, invite-joined, school-parent-request, verify-phone-firebase, push-send, org-verify, verification-review.
- **Use guard for sign-in but keep their own CORS / json / client:** support-escalate, verification-submit, support-assistant. send-invite also keeps its own `sendEmail`.
- **Hand-rolled sign-in check:** verify-contact-otp, send-contact-otp.
- **Public, with their own CORS / client:** report-invite, join, join-club.
- **Cron / webhook, with their own `isCron` / json / client:** notify-upcoming, notify-followers, privacy-retention, verification-reminders, weekly-report.

**Import effect:** importing guard.ts at module load reads env with `!` and runs `createClient` (guard.ts:13-18), so a missing env var fails at boot instead of per request.
- 25 functions already import it.
- verify-contact-otp and join-club do not. Any pure helper they would share (CORS, json, sha256Hex, regex) belongs in a pure module (new `_shared/http.ts`, text.ts or net.ts) that guard.ts re-exports.

### (A) Removable with zero behaviour change (≈157 lines)

| ID | What | Removed copies → stays | Why identical | Lines |
|---|---|---|---|---|
| E-A1 | CORS object + `json()` | support-escalate:27-33, verification-submit:34-40, support-assistant:31-37, send-contact-otp:31-36, verify-contact-otp:18-23 → guard.ts:20-27, moved to pure `_shared/http.ts` and re-exported | same Origin / Allow-Headers / Allow-Methods, same json, same OPTIONS reply | 32 |
| E-A2 | Expo push | push-send:74-95 → `pushToProfiles` (guard.ts:111-125); notify-upcoming:487-497 and notify-followers:149-155 fetch loops → new guard `expoSend(messages)` | same select, fields (incl. `channelId:'default'` where present), 100-message batches, headers; `matchId: undefined` dropped by JSON.stringify | 30 |
| E-A3 | `isCron` / authorised | verification-reminders:15-16, 19-24; privacy-retention:33-34, 37-42; notify-upcoming:132-141; weekly-report:20, 38-43 → guard.ts | same `^Bearer\s+` regex, `safeEqual`, x-cron-secret check; `?? ''` vs undefined are both falsy | 24 |
| E-A4 | Service-role createClient → guard `admin` | report-invite:22-23, 41; join:23-24, 41; support-escalate:24, 78-81; verification-submit:30, 56-59; notify-upcoming:64, 78-81; notify-followers:85, 96-99; send-contact-otp:129 | same URL / key; a service-role client is stateless | 29 |
| E-A5 | SHA-256 hex | send-contact-otp:41-44, verify-contact-otp:27-30 → guard.ts:63-66, moved to pure net.ts | byte-identical digest; stored OTP hashes keep matching | 8 |
| E-A6 | `mask` / `grouped` | guardian-consent:25-26, org-verify:23-24, school-parent-request:29 → _shared/text.ts | byte-identical | 3 |
| E-A7 | UUID regex | report-invite:24, join:25, invite-joined:25, school-parent-request:30 → text.ts | identical, no `g` flag | 3 |
| E-A8 | `ageOn` | invite-joined:27-35 → _shared/verification.ts:59-67 | exact copy; invite-joined already imports verification's dependencies | 8 |
| E-A9 | resultHighlights helpers | `isId` :37, `cleanName` :46-50, `joinNames` :102-103, `cleanText` :40-44 → resultAlert.ts:60, 52-58, 135-136, `cleanMark(s, max = 24)` :46-50 | identical; existing cleanMark calls unchanged | 12 |
| E-A10 | "POST only" 405 ×9 | guardian-link:22, message-notify:27, invite-joined:39, verify-phone-firebase:35, push-send:40, verification-reminders:27, privacy-retention:51, notify-upcoming:144, notify-followers:541 | byte-identical; a `postOnly()` helper is zero-change, but switching to `json(..., 405)` is NOT (it adds CORS) | 0 |
| E-A11 | `tournamentsWithZone` | notify-upcoming:83-91 → its own `selectIn` (:95-107) | same queries / paging / fallback; the only caller passes a non-empty, unique list | 10 |

### (B) Not identical — leave
- **E-B1, CORS / json variants:**
  - report-invite:25-27 and join:26 have no Allow-Methods and send `Cache-Control: no-store`.
  - notify-followers:113-114 and notify-upcoming:499 send no CORS headers.
- **E-B2, the five Resend senders:**
  - send-invite:54-68 lacks guard's `@phone.sportnnote.in` skip and its error logging.
  - support-escalate:36-54 uses a different From, no reply_to, a fixed recipient.
  - send-contact-otp:88-111 uses OTP_FROM and returns `{ok, reason, detail}`.
  - weekly-report:25-36 uses REPORT_FROM and has no try/catch.
- **E-B3, push message building and token reads:** guard does one unpaged `.in()`; notify-* use paged fetchAllChunked and omit channelId.
- **E-B4, join-club:21-22, 41 and verify-contact-otp:24, 48 → `admin`:** a missing env var would turn a per-request reply into a boot failure.
- **E-B5, hand-rolled sign-in checks:**
  - verify-contact-otp:43-46 answers 401 `{error:'unauthorized'}` and parses the body first.
  - send-contact-otp:124-127 answers 200 `{sent:false, reason:'unauthorized'}`.
  - Neither is the same as `requireUser`'s 401 'sign in required'.
- **E-B6, age helpers:** phone-login:35-44 `ageFrom` is stricter (anchored pattern, invalid-Date check, 0-120 range); prepReminders.ts:74-79 `isKnownAdult` returns a boolean.
- **E-B7:** inviteLinks.ts:10 regex fragment; resultAlert / resultHighlights `isId` is the looser `[0-9a-f-]{8,64}`.
- **E-B8:** follows reads. notify-upcoming:265-278 vs notify-followers:117-129 differ in columns, filters and minors handling.
- **E-B9:** players in a match. notify-upcoming:216-220 picks squad or roster per side; notify-followers:273-286 unions the squads. `idsOf` differs.

### (C) Security drift and drift bugs — findings only
- **SEC-1 (medium-high) — verify-contact-otp: no rate limit, and the guess cap can be raced.**
  - There is no `rateLimit` call.
  - The attempts check (:58) and the increment (:61) are separate steps, so parallel guesses all read 0 attempts.
  - send-contact-otp allows 5 resends an hour, and each one resets attempts.
  - Result: a caller can brute-force the 6-digit code for a contact they don't own. `email_verified`, `phone_verified` or `guardian.phoneVerified` (which feeds the minor-safety gates) can be set falsely.
  - Fix: an atomic increment plus `rateLimit` with `failClosed`.
- **SEC-2 (medium) — phone-login:95 trusts a caller-set IP.** It reads the first `x-forwarded-for` entry, which the caller controls. Every other public function uses `net.ts` `clientIp()`. The per-IP limit can be bypassed.
- **SEC-3 (medium) — open email recipients.** send-invite:91 has a fail-open limit, no `rateLimitTo(to)`, and an arbitrary recipient. org-verify:56/62 has the same problem for `email_code`.
- **SEC-4 (low) — inconsistent limiter failure mode.** Fail-closed in guardian-consent:40 and send-contact-otp:132; fail-open in guardian-link:32 and message-notify:67.
- **SEC-5 (low) — join-club.** Public, service-role, no rate limit, no OPTIONS handling. Legacy sequential `JOIN-####` codes could be enumerated if any are still live.
- **SEC-6 (low) — send-invite skips the placeholder check.** Its own `sendEmail` does not skip `@phone.sportnnote.in` placeholder addresses.
- **SEC-7 (low) — unstripped names in email.** notify-upcoming:414 strips links from the venue; the tournament name (:415) and team names (:402) are not stripped.
- **DRIFT-1 (low) — invite text.** send-invite `messageFor` (:46-52) uses `o.name || 'there'`; the app's src/core/inviteText.ts:65 uses `realName()`. So the email can greet "Hi Invited (…)!", and it has no "Not you?" link. Also a stale comment at :43 points to src/core/invite.ts.
- **DRIFT-2 (medium) — heat-win / PB pushes dropped.** notify-followers `handleHighlights` (:507-511) skips the file's own chunked `claim()` (:159-170). With more than 1,000 followers, some never get the push.
- **DRIFT-3 (low; check on Android) — missing push channel.** No `channelId:'default'` in notify-upcoming:464-468 or notify-followers:147; guard.ts:115 and push-send:81 set it.
- **DRIFT-4 (low) — notify-followers:546.** `await req.json()` has no catch, so a bad body returns a 500.

---

## Coverage

### Racket sports (my review)
| File | Lines | Status |
|---|---|---|
| tennis/doubleFault.ts | 4 | reviewed |
| tennis/records.ts | 10 | reviewed |
| tennis/Commentary.tsx | 48 | reviewed |
| tennis/meta.ts | 97 | reviewed |
| tennis/StatsPanel.tsx | 150 | **not re-reviewed**: consolidated today, excluded by the task |
| tennis/stats.ts | 163 | reviewed |
| tennis/index.tsx | 217 | reviewed |
| tennis/commentaryModel.ts | 227 | reviewed |
| tennis/PointCapture.tsx | 259 | reviewed |
| tennis/matchStats.ts | 381 | reviewed |
| tennis/engine.ts | 386 | reviewed |
| padel/records.ts | 10 | reviewed |
| padel/stats.ts | 21 | reviewed |
| padel/meta.ts | 72 | reviewed |
| padel/index.tsx | 221 | reviewed |
| padel/engine.ts | 341 | reviewed |
| badminton/stats.ts | 4 | reviewed |
| badminton/records.ts | 10 | reviewed |
| badminton/meta.ts | 56 | reviewed |
| badminton/engine.ts | 194 | reviewed |
| badminton/index.tsx | 199 | reviewed |
| tabletennis/stats.ts | 4 | reviewed |
| tabletennis/index.tsx | 29 | reviewed |
| tabletennis/serve.ts | 52 | reviewed |
| tabletennis/meta.ts | 66 | reviewed |
| pickleball/stats.ts | 4 | reviewed |
| pickleball/index.tsx | 35 | reviewed |
| pickleball/meta.ts | 84 | reviewed |
| squash/stats.ts | 4 | reviewed |
| squash/index.tsx | 32 | reviewed |
| squash/meta.ts | 74 | reviewed |

Shared files read in full for comparison (outside this slice; not audited on their own account): rallyEngine.ts (396), rallyCore.tsx (428), racketCommentaryModel.ts (325), RacketCommentary.tsx (46), PointDetailRow.tsx (245), rallyRecords.ts (10). Excerpts of racketMatchStats.ts, serveStats.ts and pointDetailSettings.ts were also read.

### Worker / scripts / navigation / App (my review)
| File | Lines | Status |
|---|---|---|
| worker/index.ts | 59 | reviewed |
| worker/sports.ts | 38 | reviewed |
| worker/matchPage.ts | 146 | reviewed |
| scripts/check-minor-names.sql | 33 | reviewed |
| scripts/publish-android-ota.sh | 41 | reviewed |
| scripts/error-triage.mjs | 42 | reviewed |
| scripts/publish-web.sh | 44 | reviewed |
| scripts/build-share-images.mjs | 63 | reviewed |
| scripts/auth-smoke.mjs | 76 | reviewed |
| scripts/build-icons.mjs | 81 | reviewed |
| scripts/build-brand-kit.mjs | 83 | reviewed |
| scripts/build-cities.py | 108 | reviewed |
| scripts/legal-docx.py | 244 | reviewed (136-198 read in a follow-up pass) |
| scripts/build-website.mjs | 699 | reviewed (long static HTML lines read truncated at 220 characters) |
| src/navigation/navRef.ts | 6 | reviewed |
| src/navigation/openMatch.ts | 17 | reviewed |
| src/navigation/useParamState.ts | 20 | reviewed |
| src/navigation/lazyScreens.ts | 73 | reviewed |
| src/navigation/types.ts | 221 | reviewed (41-179 read in a follow-up pass) |
| src/navigation/RootNavigator.tsx | 849 | reviewed |
| App.tsx | 70 | reviewed |
| index.ts | 26 | reviewed |

### Cue sports (sub-review, all reviewed in full, A items re-diffed)
pool/: box 35, core 53, matchStats 57, undo 58, meta 59, records 60, balls 88, compare 104, stats 130, feed 163, totals 176, index 384, controls 388, match 404, engine 894.
snooker/: box 29, meta 46, records 49, totals 62, stats 67, undo 76, matchStats 91, feed 106, read 152, controls 355, index 360, engine 790.
billiards/: box 28, records 38, meta 55, totals 58, undo 60, stats 68, matchStats 88, feed 97, read 120, controls 235, index 281, engine 621.
cue/: useNames 17, send 30, uiState 49, stats 74, FrameCorrections 99, corrections 99, ending 102, parts 249.
Total 47 files, 7,704 lines.

### supabase/functions (sub-review, all reviewed in full)
_shared/: reauth 11, inviteLinks 16, text 20, firebaseToken 24, net 31, guardianProofText 32, phone 34, hosts 38, minorFollows 44, errorTriage 65, webpush 69, saras 70, verification 73, localTime 81, deleteAccount 82, paging 87, resultHighlights 125, guard 133, resultAlert 187, prepReminders 243.
Functions: guardian-link 46, report-invite 47, register-lookup 52, join 61, join-club 64, guardian-consent 69, verification-reminders 72, delete-account 78, guardian-proof 79, message-notify 80, invite-joined 82, school-parent-request 83, verify-contact-otp 85, verify-phone-firebase 92, push-send 97, org-verify 98, send-invite 98, support-escalate 112, verification-submit 112, verification-review 114, privacy-retention 115, support-assistant 118, send-contact-otp 154, phone-login 182, weekly-report 236, notify-upcoming 499, notify-followers 586.
Total 45 files, 4,976 lines.
