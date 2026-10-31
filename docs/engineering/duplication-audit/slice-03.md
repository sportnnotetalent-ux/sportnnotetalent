# Slice 3 — cricket / chess / carrom / golf (duplication audit)

Scope per the coordinator's override: **duplicated code only**, each finding strictly classed
**A** (removable, provably zero behaviour change), **B** (not identical — leave; exact difference listed),
or **C** (drift that looks like a bug — finding only, not removable). "Lines removable" counts A only.
All paths are relative to `/Users/macbookpro/Desktop/rudy/sportfolio/`. Line numbers were read in this session.

Scan entry for this slice (verified): `sports/cricket/editOvers.ts:152 <> sports/cricket/engine.ts:1876`
is `ballSymbol` vs `logSymbol` → see S3-D07.

Bundle note used below: sports load per sport (`sportLoaders.ts`). Cricket/chess/carrom/golf files
import each other freely inside one sport chunk. Some slice files are also imported OUTSIDE the
chunk (chess `roundSheet.ts` by `screens/GenerateFixturesScreen.tsx`, `screens/SwissRoundScreen.tsx`,
`data/chessRoundResults.ts`; golf `engine.ts` by `data/golfTeams.ts`, `data/golfLeaderboard.ts`,
`components/golf/*`). For those, a new value import can pull code into other bundles; flagged per finding.

---

## 1. Class A — removable with zero behaviour change

| ID | Title | Locations (all copies) | Proof of identity / how | Import / bundle effect | Risk | Lines removable |
|---|---|---|---|---|---|---|
| S3-D01 | Per-ball helpers `charged` / `teamRuns` / `faced` / wicket test | `src/sports/cricket/scorecard.ts:36` (`charged`, exported), `:40` (`teamRuns`), `:332` (`faced`, local in `deepTotals`), `:30` (`isWicket`); `src/sports/cricket/commentary.ts:204-206`; `src/sports/cricket/matchStats.ts:36-39` (`wicketFor`) | Character-identical bodies: `r.bat + r.wd + r.nb`; `r.bat + r.wd + r.nb + r.b + r.lb + (r.pen ?? 0) + (r.adj ?? 0)`; `r.ext === 'nb' \|\| (r.legal && r.ext !== 'wd' && isDeliveryRec(r))`; `!!r.out && r.out.kind !== 'retired'`. Keep them in `scorecard.ts` (export `teamRuns`, `faced`, `isWicket`), import in commentary/matchStats. (`scorecard.ts:285` `faced` lacks `isDeliveryRec` but is only reached after `if (r.cross \|\| !isDeliveryRec2(r)) continue` at `:287` — leave it, or swap too: still identical.) | All three files already in the cricket chunk; commentary/matchStats don't import scorecard into a cycle (scorecard imports neither). | Low (display / stats selectors; statTotals output unchanged since the same function bodies are used) | 7 |
| S3-D02 | `isDelivery` vs `isDeliveryRec` | `src/sports/cricket/scorecard.ts:33` (`r.sym !== undefined && r.out?.kind !== 'mankad'`); `src/sports/cricket/detail.ts:214` (same + `&& !r.cross`) | Text differs by `!r.cross`, but every BallRec with `cross: true` is built only at `engine.ts:1926-1932`, which never sets `sym` (no test builds one either: grep of `tests/` for `cross: true` is empty). So `sym !== undefined` already implies `!cross` → identical for every BallRec the app can hold. Use `isDeliveryRec` (scorecard already imports it as `isDeliveryRec2`). | None (already imported). | Low-medium (feeds `bowlerSplits` → maidens in statTotals; identical by the proof above) | 1 |
| S3-D03 | "Over index of a ball" formula ×4 | `src/sports/cricket/bouncers.ts:29-30` (`overIndexOf`, exported); `src/sports/cricket/scorecard.ts:152`; `src/sports/cricket/commentary.ts:295`; `src/sports/cricket/matchStats.ts:401` (inside the key string) | All `r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo)`. Replace with `overIndexOf(r, bpo)`. | scorecard/commentary/matchStats would import bouncers.ts (pulls rules.ts/detail.ts, already in their graph). | Low (maidens via scorecard → statTotals; same expression) | 2 |
| S3-D04 | Ball stamp of a record (`recStamp`) re-written inline, and its body = `ballStamp` | `src/sports/cricket/detail.ts:216-219` (`recStamp`); `src/sports/cricket/engine.ts:735-736` (`ballStamp`); inline `ballStamp(r.legal ? r.lb6 : r.lb6 + 1, bpo)` at `engine.ts:966` and `index.tsx:1181` | `recStamp(r,bpo)` ≡ `ballStamp(r.legal ? r.lb6 : r.lb6+1, bpo)` (same template string). Use `recStamp` at engine:966 / index:1181. To drop the duplicated formula itself, move `ballStamp` into `detail.ts` (engine re-exports it) — detail.ts may not import values from engine (engine imports detail; comment at `detail.ts:12-13`). | No new modules; engine already imports detail values. | Medium (engine.ts:966 is `lastBall`, used by FIELD_NOTE in the reducer — same string either way) | 3 |
| S3-D05 | "Last delivery record" loop ×3 | `src/sports/cricket/index.tsx:1169-1177` (`lastRec`); `src/sports/cricket/BallDetailPanel.tsx:34-42` (`detailTarget`); `src/sports/cricket/engine.ts:962-964` (`lastBall` loop) | `lastRec`'s skip test `r.sym === undefined \|\| r.cross \|\| r.out?.kind === 'mankad'` is exactly `!isDeliveryRec(r)`; `detailTarget` returns the last record with ordinal > 0, i.e. the last `isDeliveryRec`. So `lastRec ≡ detailTarget(state)?.rec ?? null` (both read `state.log`). In `lastBall`, replace the condition with `!isDeliveryRec(r)`. | index already imports `detailTarget`; engine already imports detail. | Low (index) / Medium (engine:964, reducer path; same boolean) | 9 |
| S3-D06 | Wicket kind on an EXTRA | `src/sports/cricket/engine.ts:1610` and `:1896` (inline), `src/sports/cricket/editOvers.ts:118-119` (`extraWicket`) | Same expression `(p.wicket ? String(p.wicket) : p.runout ? 'runout' : undefined) as DismissalKind \| undefined`. Export one helper from engine.ts. | editOvers already imports engine. | High in name only (engine replay) — the expression is byte-identical | 2 |
| S3-D07 | `logSymbol` ↔ `ballSymbol` — the identical branches (scan entry) | `src/sports/cricket/engine.ts:1875-1910`; `src/sports/cricket/editOvers.ts:151-187` | Byte-identical: RUNS (1879-1881 / 156-158), BYES/LEGBYES (1883-1887 / 160-164), EXTRA-with-wicket (1896-1900 / 172-176), no-ball (1901-1904 / 177-180). Extract a shared helper for these branches only; each function keeps its own WICKET, wide and default branches (those differ — see S3-D30). | editOvers already imports engine. | **High** (logSymbol builds `BallRec.sym`, read by maidens / commentary / bouncer counts on every replay) — but only identical code moves | 12 |
| S3-D08 | Ball-action type sets | `src/sports/cricket/engine.ts:860` `BALL_TYPES`; `src/sports/cricket/editOvers.ts:113` `BALL_TYPES`; `src/sports/cricket/undo.ts:34` `BALLS` (all `RUNS, BYES, LEGBYES, WICKET, EXTRA`); `engine.ts:1871` `LOGGED` ≡ `index.tsx:712` `STAMPED` (both `RUNS, BYES, LEGBYES, WICKET, EXTRA, PENALTY, ADJUST`) | Same members, used only with `.has()`. Export from engine.ts. | All importers already import engine. | Low | 3 |
| S3-D09 | "takes runs" kinds re-written | `src/sports/cricket/OverEditor.tsx:33` (`k === 'runout' \|\| k === 'obstruct'`); `src/sports/cricket/editOvers.ts:599` (same inline); engine `RUNS_KINDS` (`engine.ts:540`) | `RUNS_KINDS = ['runout','obstruct']` → `RUNS_KINDS.includes(k)` is the same boolean. | OverEditor/editOvers already import engine. | Low | 2 |
| S3-D10 | `targetTag` (" (DLS)" / " (revised target)") | `src/sports/cricket/index.tsx:293`; `src/sports/cricket/ticker.ts:15`; inline identical at `src/sports/cricket/shareCard.ts:95` and `src/sports/cricket/commentary.ts:289` | Same ternary on `s.revision`. Keep one export (ticker.ts or engine.ts). NOT the same as `engine.ts:2117` (gated on `dlsV === 2`) — leave that one (S3-D35). | index already imports ticker; shareCard/commentary import engine. | Low (display) | 3 |
| S3-D11 | Lower-case first letter of the result text | `src/sports/cricket/ticker.ts:16` (`lowerFirst`); `src/sports/cricket/index.tsx:1948` and `src/sports/cricket/shareCard.ts:109` (inline `text.charAt(0).toLowerCase() + text.slice(1)`) | For every string, incl. '' (charAt('') = ''), the outputs are equal. | — | Low | 2 |
| S3-D12 | Over-strip tone → colour map | `src/sports/cricket/index.tsx:2210-2212` (`TONE_COLOR`); `src/sports/cricket/CommentaryView.tsx:30-32` (`TONE`) | Identical `{ wicket: danger, boundary: primary, extra: accent, plain: surfaceAlt }`. (OverEditor uses different colours — S3-D20, C.) | index already imports CommentaryView. | Low | 3 |
| S3-D13 | `digits` input filter twice in one file | `src/sports/cricket/index.tsx:376` and `:463` | Both `(t) => t.replace(/[^0-9]/g, '').slice(0, 3)`. Hoist one to module scope (as `digits2` at `:530`). | — | Low | 1 |
| S3-D14 | "Has this side batted" + phase words | `src/sports/cricket/matchStats.ts:166` ≡ `src/sports/cricket/MatchStatsView.tsx:50` (`(s.log ?? []).some((r) => r.side === side && !r.cross)`); `MatchStatsView.tsx:77` labels `'Powerplay'/'Middle'/'Death'` ≡ `PHASE_WORD` (`src/sports/cricket/phases.ts:97`) | Same expression / same strings. | MatchStatsView already imports matchStats. | Low | 1 |
| S3-D15 | `plural(n, one, many)` | In slice: `src/sports/cricket/commentary.ts:115`, `src/sports/cricket/editOvers.ts:567`, `src/sports/carrom/feed.ts:14`. Outside: `src/sports/snooker/feed.ts:14`, `src/sports/pool/records.ts:20`, `src/sports/netraid/feed.ts:59` (exported). Canonical: `src/sports/feedGroups.ts:111` (exported) | All character-identical `(n, one, many = \`${one}s\`) => \`${n} ${n === 1 ? one : many}\``. `feedGroups.ts` has no imports → free to import (use `'../feedGroups.ts'` for node tests). (`pool/undo.ts:16`, `snooker/undo.ts:12`, `snooker/controls.ts:338` have no `many` param but give the same text for their call sites — not counted.) | None (dependency-free module). | Low | 3 in slice (+3 outside) |
| S3-D16 | Avatar initials helper | `src/sports/cricket/index.tsx:1648-1649` (`nameInitials`); `src/components/TournamentAwardsTab.tsx:28-29`, `src/components/MatchSummary.tsx:19-20`, `src/components/AddInvitePlayer.tsx:27-28`, `src/components/AwardPickerSheet.tsx:24-25` (`initials`) | All `(name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() \|\| '?'`. `components/HostsCard.tsx:10` ends `\|\| '🤝'` → B. Do NOT confuse with `core/playerNames.ts:57 nameInitials` (dotted "A. R.", different). | Put it in a light core/ui file; cricket chunk then imports it. | Low | 2 in slice (+6 outside) |
| S3-D17 | HTML `esc` | `src/sports/chess/roundSheet.ts:177`; `src/core/orgVerification.ts:650`, `src/core/certificates.ts:132`, `src/core/hallOfFame.ts:168`, `src/core/passport.ts:42`; exported copy `src/data/results/printSheets.ts:25` | Six character-identical copies. **Bundle:** don't import `printSheets.ts` into roundSheet (it pulls `results/marks`, `model`, `timetable` into GenerateFixturesScreen's bundle) — move `esc` to a dependency-free core module and import it everywhere. | As stated. | Low | 1 in slice (+4 outside) |
| S3-D18 | Chess "½" formatter ×5 | `src/sports/chess/engine.ts:452` (`h`), `src/sports/chess/index.tsx:43` (`half`), `src/sports/chess/index.tsx:56` (`h`, same file again), `src/sports/chess/repertoire.ts:100` (`halfText`, exported). Also `src/sports/chess/roundSheet.ts:159` (+ `undefined → ''` guard), `src/components/SwissFieldPanel.tsx:17`, `src/screens/SwissRoundScreen.tsx:162,164` (inline) | Identical `String(n).replace('.5', '½').replace(/^0½$/, '½')`. Define `halfText` once in `engine.ts` (repertoire re-exports it; repertoire already imports engine, so no cycle); index uses it. Leave roundSheet / SwissFieldPanel / SwissRoundScreen unless the helper goes to a dependency-free module (engine.ts is heavy: board/pgn/openings). | Within the chess chunk: none. | Low (display) | 3 |
| S3-D19 | Chess knockout phase title ×2 and clock line ×2 | Title: `src/sports/chess/index.tsx:62` ≡ `src/sports/chess/gameFeed.ts:93`. Clock: `src/sports/chess/gameFeed.ts:26` ≡ `src/sports/chess/index.tsx:296` (`⏱ White … · Black …`) | Byte-identical expressions. Add `koPhaseTitle(ph)` / `clockPair(clock)` to engine.ts. (`index.tsx:121` reads `⏱ Time left · White …` — different text, leave.) | Both files import engine. | Low | 2 |
| S3-D21 | 1-v-1 side name | `src/sports/chess/index.tsx:38-41` ≡ `src/sports/golf/index.tsx:34-37` (`p = roster[0]; p ? who(p.id, p.fullName) : team`). Separately `src/sports/carrom/index.tsx:41-42` ≡ `src/sports/pool/index.tsx:44-45` (and inline `src/sports/cue/useNames.ts:15`) (`roster.length === 1 ? … : team`) | Identical within each pair. The two variants differ for rosters of 2+ (chess/golf name the first player, carrom/pool the team) → keep two helpers. Home: `src/sports/racketNames.ts` (light; carrom already imports it). | Light module; no heavy pulls. | Low | 4 in slice (+2 outside) |
| S3-D22 | Golf to-par label | `src/sports/golf/engine.ts:385` (`toParLabel`, exported) ≡ `src/sports/golf/stats.ts:24` (`toPar`) ≡ `src/data/results/alerts.ts:51` | Identical. stats.ts already imports engine.ts → use `toParLabel`. Leave alerts.ts (results engine; importing golf engine would bloat it) unless moved to a dependency-free module. | stats.ts: none. | Low | 1 |
| S3-D23 | Golf `ordinal` | `src/sports/golf/engine.ts:603-607` vs `src/sports/recordHelpers.ts:7-11` | For every integer ≥ 0 the golf trick (`s[(v-20)%10] \|\| s[v] \|\| s[0]`) gives the same suffix as recordHelpers (11–13 → th; else by last digit) → `${ordinal(n)} hole`. **Bundle:** recordHelpers imports `matchRecords.ts` → `conduct.ts`; golf engine is imported by `data/golfTeams.ts`, `components/golf/*`. Only worth it if `ordinal` moves to a dependency-free module. | As stated. | Low (result text "Won at the 19th hole") | 4 |
| S3-D24 | Stableford points re-written | `src/data/golfTeams.ts:96` (`s === 'P' ? 0 : Math.max(0, 2 + h.par + (m.received[i] ?? 0) - s)`) vs `src/sports/golf/engine.ts:322-326` (`stablefordPoints`) | `s == null` already returned at `:93`; for number/'P' the two are identical. golfTeams already imports engine.ts. | None. | Low | 1 |
| S3-D25 | Carrom live status line | `src/sports/carrom/engine.ts:454` ≡ `src/sports/carrom/index.tsx:510` (`Game ${s.games.length + 1} · board ${s.boardsInGame + 1}`) | Identical. (`bestOf` strings differ — S3-D41.) | — | Low | 1 |
| S3-D26 | "Other side" one-liner | `src/sports/carrom/feed.ts:13`, `src/sports/cricket/OverEditor.tsx:64`, inline `x === 'home' ? 'away' : 'home'` at `chess/gameFeed.ts:21,39,66`, `chess/tieBoards.ts:27`, `chess/roundSheet.ts:122`, `chess/index.tsx:134,356`, `chess/MovesPanel.tsx:44`, `carrom/engine.ts:487,489`, `carrom/matchStats.ts:42`, `carrom/totals.ts:149`, `carrom/index.tsx:106`, `golf/feed.ts:171,184`, `golf/index.tsx:58` | Exported `otherSide` exists (`src/sports/matchRecords.ts:238`); cricket has `other` (`engine.ts:738`). Pattern (≈20 one-liners). | matchRecords pulls conduct.ts — prefer a dependency-free home. | Low (several are in reducers, but the expression is identical) | ~6 |

**Class A total: ≈ 79 lines removable in this slice, ≈ 94 including the copies outside it.**
The big-ticket items are S3-D07 (12, high risk) and S3-D05 (9). Everything else is 1–7 lines.

---

## 2. Class B — not identical, leave (exact difference)

| ID | Title | Locations | Exact difference | Intentional? |
|---|---|---|---|---|
| S3-D30 | `logSymbol` vs `ballSymbol`, the non-identical parts | `src/sports/cricket/engine.ts:1888-1893, 1905, 1907-1908`; `src/sports/cricket/editOvers.ts:165-169, 181-182, 184-185` | WICKET: engine returns `undefined` for retired / timed out / retired out and `'W'` for Mankad; editor returns `wicketSymbol(...)` ('W') for all (and reads `p.kind` with no `'bowled'` default). Wide with runs: engine `${wd}wd` from the actual innings delta; editor `${widePenalty + w}wd` from the caller's rule. Default: `undefined` vs `''`. Same visible result on the balls the editor lists (`isEditableBall` drops non-deliveries), but not for every input. | Yes (different callers) |
| S3-D31 | Dismissal labels | `src/sports/cricket/editOvers.ts:568-571` (`KIND_LABEL`) vs `src/sports/cricket/engine.ts:527-531` (`DISMISSAL_NAME`) | `KIND_LABEL` has no `retired` / `timedout`, so `describeBall` prints `'Out'` for them where `DISMISSAL_NAME` gives `'Retired hurt'` / `'Timed out'`. Other 10 labels are identical. | Probably (editor never lists those), but not provable |
| S3-D32 | Maiden-over computation ×3 | `src/sports/cricket/scorecard.ts:183-208`; `src/sports/cricket/matchStats.ts:397-410`; `src/sports/cricket/commentary.ts:248-254` | Grouping differs: scorecard by over index per side; matchStats by `${inn}:${over}`; commentary per over block while building. Delivery filters also differ slightly (`isDelivery` vs `isDeliveryRec`, commentary counts `legal && isDeliveryRec`). Likely the same numbers today, not provably. | Organic drift; consolidate only with tests (scorecard's feeds statTotals) |
| S3-D33 | Super Over "live innings" | `src/sports/cricket/undo.ts:39`, `engine.ts:2010`, `index.tsx:770-771`, `index.tsx:2347` (`superOver && !superOver.state.ended`) vs `src/sports/cricket/ticker.ts:13` (`superOver && !s.ended`) | The ticker keeps showing the Super Over after its round ends, until the match ends. | Yes |
| S3-D34 | Chase "balls left" | see S3-D50 (C) | | |
| S3-D35 | DLS suffix on the result vs on the target | `src/sports/cricket/engine.ts:2117` (only when `dlsV === 2`) vs `targetTag` (S3-D10) | A legacy rain match reads "Target 150 (DLS)" on the header but "Won by 5 runs" (no tag) in the result line. | Yes — engine comment at 2095-2096 says legacy results keep their stored text |
| S3-D36 | Over-strip chip renderers | `src/sports/cricket/index.tsx:2215-2234` (`BallChip`), `src/sports/cricket/CommentaryView.tsx:34-45` (`Chip`), `src/sports/cricket/OverEditor.tsx:97-105`, `src/sports/cricket/editOvers.ts:190` (`chipLabel`) | Dot ball '·' (index, editor) vs '•' (commentary, `shareCard.ts:160`); index keeps 'ot'/'r' as a caption, commentary strips it; sizes 24 / 26 / 28 px; editor colours differ (S3-D20). | Partly (different screens); see C for colours |
| S3-D37 | Chess result strings | `src/sports/chess/engine.ts:447-461` (`resultString`), `:465-469` (`scoreFor`), `src/sports/chess/roundSheet.ts:60-72` (`resultWhiteFirst`) | `resultString` checks double-forfeit before the winner; `scoreFor` only with `winner === 'draw'`; `resultWhiteFirst` writes forfeits as `+/−` / `−/+` and reads a `Match`, not a state. | Yes |
| S3-D38 | Chess half formatter in tie boards | `src/sports/chess/tieBoards.ts:14` (`${Math.floor(n) \|\| ''}½`) vs `halfText` | Same on half-integers (all reachable scores), different for e.g. 1.25 ('1½' vs '1.25'). | Leave (or adopt with a domain note) |
| S3-D39 | Chess game points ×5 | `chess/engine.ts:147-148` (`gamePts`), `:437-444` (`points`), `chess/tieBoards.ts:30-31`, `chess/teamKo.ts:35-44` (`boardPts`), `chess/repertoire.ts:30` | Different inputs (KoGame / ChessState / Match / rubber) and edge rules (teamKo also zeroes no_result/abandoned; repertoire has no double-forfeit check because it filters first; `points` delegates to `koPoints` for knockout). | Yes |
| S3-D40 | "Stats to track" readers | `src/sports/chess/engine.ts:238-244` vs `src/sports/carrom/engine.ts:176-183` (`readTrack`) | Same shape, different keys (`trackMoves/trackClock` vs `trackFouls/trackBreak/trackQueenMiss`). A key-map helper would be zero-change, but the copies are not identical. Replay path. | Pattern |
| S3-D41 | Carrom "best of" text | `src/sports/carrom/engine.ts:455` (`single game` / `best of N`) vs `src/sports/carrom/index.tsx:511` (`single game to 25` / `best of N · to 25`) | Wording | Yes |
| S3-D42 | Carrom queens counted | `src/sports/carrom/matchStats.ts:55` (only when `points > coins`, else `queens22`) vs `src/sports/carrom/totals.ts:156` (every covered Queen) | Panel splits "+3" from "22+"; careers count all covers. | Yes |
| S3-D43 | Carrom vs cue sports (pool / snooker / billiards / cue) | breaker: `carrom/engine.ts:485-490` vs `snooker/engine.ts:181`, `pool/engine.ts:296-309`; corrections: carrom `EDIT_LOG` replay (`carrom/engine.ts:568-637`) vs cue `AMEND` (`cue/corrections.ts`); counts: `carrom/engine.ts:101-104` `cnt` (floor + cap 20) vs `pool/engine.ts:805` (safe integer, no cap); foul text `carrom/feed.ts:17` vs `snooker/feed.ts:34` | Carrom alternates the break per game AND per board; cue alternates per frame/rack. Different correction model and validation. No shared code worth extracting. (The scan's cue clones are billiards↔snooker only.) | Yes |
| S3-D44 | Golf score-name classifiers ×4 | `golf/engine.ts:659-664` (counters), `golf/matchStrokes.ts:66-69` (`'eagles'…`), `golf/scorecard.ts:13-17` (`'eagle'…`), `golf/feed.ts:25-36` (words, adds albatross / hole in one / triple) | Same `strokes − par` buckets, different outputs per caller. | Yes |
| S3-D45 | Golf concession text | `src/sports/golf/engine.ts:296-302` (`concededLine`) vs `src/sports/golf/feed.ts:185` | Same up/down logic; text differs: `conceded, 3 down thru 12` / `conceded before hole 1` vs `3 down thru 12` / `before hole 1`. | Yes |
| S3-D46 | Golf match status words | `golf/engine.ts:599` (`Dormie 2`, `2 UP`) vs `golf/feed.ts:177` (`dormie 2`, `2 UP thru 7`) | Case + suffix | Yes |
| S3-D47 | Golf adjusted gross | `golf/handicap.ts:32-43` vs `golf/engine.ts:330-335,365-374` | Handicap uses COURSE-handicap strokes and par + 5 without an index (WHS 3.1); `summarize` uses the playing-handicap `received` and the format's cap. | Yes (WHS) |
| S3-D48 | Time-stamp validators | `golf/match.ts:47` (→ `null`) vs `chess/engine.ts:245` `stampOf` (→ `undefined`) | Return value for invalid input. | — |
| S3-D49 | Golf distance / index display | `golf/handicap.ts:111` `showHcp` (`toFixed(1)`) vs `data/golfLeaderboard.ts:62` `showIndex` (raw, '' for none); `data/golfLeaders.ts:56` and `components/golf/GolfCareerDepth.tsx:21` vs `golf/engine.ts:236-237` `distText` (no " m" suffix / different dp) | Format | Yes |

---

## 3. Class C — drift that looks like a bug (finding only; not removable)

**S3-D50 — Chase "balls left" disagrees after a rain cut in innings 2 (likely bug).**
`inn2Overs` is the chase's SCHEDULED length (DLS resources, `engine.ts:883`). A `RAIN` (`engine.ts:929`, `:1152`) or `SET_OVERS` after a loss (`:1064-1068`) in innings 2 moves `oversLimit` but leaves `inn2Overs`. The copies:
- `src/sports/cricket/ticker.ts:75` — `const left = (x.inn2Overs ?? x.oversLimit) * bpo - inn.balls;` (public score overlay)
- `src/sports/cricket/records.ts:84` — `const sched = (s.inn2Overs ?? s.oversLimit) * bpo;` ("by 5 wkts (N balls left)" record)
- vs `src/sports/cricket/index.tsx:2251` — `Math.max(0, s.oversLimit * s.ballsPerOver - inn.balls)`, `index.tsx:569` and `commentary.ts:266` (all `oversLimit`).

After a 20→15-over cut the overlay says "Need 40 off 60" while the scorer's Situation strip says "off 30", and the margin record counts balls that can't be bowled. Fixing it changes what the overlay and stored records show → needs a decision.

**S3-D20 — Correction editor uses different chip colours than the live strip.**
`src/sports/cricket/editOvers.ts:192-193` says the tone is "shared with the live over strip (wicket → danger, boundary → primary, extra → accent, plain)", and `index.tsx:2211` / `CommentaryView.tsx:31` do that. `src/sports/cricket/OverEditor.tsx:331-333` has `boundary: { backgroundColor: theme.colors.accent }` and `extra: { backgroundColor: theme.colors.textMuted }`. A four in the editor looks like an extra on the live strip. (Could be an SD-155 contrast choice — see the comment on `:329` — so it needs a decision.)

**S3-D51 — Carrom score-sheet key states the old penalty value.**
`src/sports/carrom/ScoreSheet.tsx:70`: "PEN = penalty board (3 to the opponent, not a board won)". With `foulScore` (on by default for new matches) a penalty board is worth 1 at 22+ (`engine.ts:316`), and the scorer screen says so (`index.tsx:247`: "(1, not 3, at 22 or more — ICF)"). The rows show the real `+pts`; only the legend is wrong.

**S3-D52 (outside slice, minor) — golf to-par on the profile uses a hyphen.**
`src/screens/SportProfileScreen.tsx:544` prints a negative to-par as the raw number ("-3"); `toParLabel` and its copies print "−3" (U+2212).

---

## 4. Coverage table (every file in the slice, read in full this session)

| File | Lines | Reviewed |
|---|---|---|
| src/sports/cricket/index.tsx | 2710 | reviewed |
| src/sports/cricket/engine.ts | 2152 | reviewed |
| src/sports/cricket/editOvers.ts | 640 | reviewed |
| src/sports/cricket/matchStats.ts | 571 | reviewed |
| src/sports/cricket/commentary.ts | 521 | reviewed |
| src/sports/cricket/scorecard.ts | 492 | reviewed |
| src/sports/cricket/MatchStatsView.tsx | 484 | reviewed |
| src/sports/cricket/OverEditor.tsx | 338 | reviewed |
| src/sports/cricket/rules.ts | 310 | reviewed |
| src/sports/cricket/detail.ts | 266 | reviewed |
| src/sports/cricket/stats.ts | 258 | reviewed |
| src/sports/cricket/dls.ts | 190 | reviewed |
| src/sports/cricket/CommentaryView.tsx | 189 | reviewed |
| src/sports/cricket/shareCard.ts | 174 | reviewed |
| src/sports/cricket/BallDetailPanel.tsx | 174 | reviewed |
| src/sports/cricket/WagonWheel.tsx | 164 | reviewed |
| src/sports/cricket/names.ts | 154 | reviewed |
| src/sports/cricket/ticker.ts | 118 | reviewed |
| src/sports/cricket/phases.ts | 97 | reviewed |
| src/sports/cricket/records.ts | 91 | reviewed |
| src/sports/cricket/bouncers.ts | 90 | reviewed |
| src/sports/cricket/ShareCardView.tsx | 84 | reviewed |
| src/sports/cricket/undo.ts | 82 | reviewed |
| src/sports/cricket/meta.ts | 77 | reviewed |
| src/sports/cricket/wagon.ts | 69 | reviewed |
| src/sports/cricket/lineup.ts | 15 | reviewed |
| src/sports/cricket/zones.ts | 7 | reviewed |
| src/sports/chess/engine.ts | 481 | reviewed |
| src/sports/chess/index.tsx | 445 | reviewed |
| src/sports/chess/board.ts | 322 | reviewed |
| src/sports/chess/roundSheet.ts | 188 | reviewed |
| src/sports/chess/gameStats.ts | 167 | reviewed |
| src/sports/chess/stats.ts | 162 | reviewed |
| src/sports/chess/openings.ts | 154 | reviewed |
| src/sports/chess/MovesPanel.tsx | 140 | reviewed |
| src/sports/chess/pgn.ts | 124 | reviewed |
| src/sports/chess/gameFeed.ts | 114 | reviewed |
| src/sports/chess/repertoire.ts | 100 | reviewed |
| src/sports/chess/teamKo.ts | 85 | reviewed |
| src/sports/chess/ChessRepertoire.tsx | 73 | reviewed |
| src/sports/chess/totals.ts | 68 | reviewed |
| src/sports/chess/tieBoards.ts | 46 | reviewed |
| src/sports/chess/meta.ts | 44 | reviewed |
| src/sports/chess/ChessTieBoards.tsx | 41 | reviewed |
| src/sports/chess/records.ts | 16 | reviewed |
| src/sports/carrom/engine.ts | 702 | reviewed |
| src/sports/carrom/index.tsx | 577 | reviewed |
| src/sports/carrom/totals.ts | 241 | reviewed |
| src/sports/carrom/matchStats.ts | 132 | reviewed |
| src/sports/carrom/feed.ts | 104 | reviewed |
| src/sports/carrom/stats.ts | 98 | reviewed |
| src/sports/carrom/ScoreSheet.tsx | 90 | reviewed |
| src/sports/carrom/meta.ts | 50 | reviewed |
| src/sports/carrom/records.ts | 40 | reviewed |
| src/sports/golf/engine.ts | 778 | reviewed |
| src/sports/golf/index.tsx | 219 | reviewed |
| src/sports/golf/stats.ts | 210 | reviewed |
| src/sports/golf/feed.ts | 195 | reviewed |
| src/sports/golf/statSheet.ts | 138 | reviewed |
| src/sports/golf/match.ts | 130 | reviewed |
| src/sports/golf/handicap.ts | 126 | reviewed |
| src/sports/golf/track.ts | 96 | reviewed |
| src/sports/golf/scorecard.ts | 93 | reviewed |
| src/sports/golf/meta.ts | 87 | reviewed |
| src/sports/golf/MatchStrokesSetup.tsx | 79 | reviewed |
| src/sports/golf/matchStrokes.ts | 78 | reviewed |
| src/sports/golf/records.ts | 39 | reviewed |
| **Total (67 files)** | **17,589** | all reviewed |

Cross-checks outside the slice. These were done by grep plus a targeted read, not a full review: `src/components/golf/*` (12 files) and `src/data/golf*.ts` (helper definitions and formulas only: `golfTeams.ts:85-100`, `golfLeaderboard.ts:45-70`, `GolfLeaderboard.tsx:120-142`). Only S3-D24, S3-D49 and S3-D52 came out of them. For the cue sports (`pool`, `snooker`, `billiards`, `cue`, 7.7k lines) I grepped for carrom-like constructs (breaker, corrections, counts, fouls, plural, side names) and read the matching lines; I did not review those folders in full.
