# Slice 10 — `src/data/[S-Z]*` (top level) + `src/core/**`

Read-only audit. Scope per the coordinator's change: **duplicated code only**, each finding classified
**(A)** removable with zero behaviour change, **(B)** not identical — leave, or **(C)** drift that looks like a bug.
"Lines removable" counts (A) only and is a **net** estimate (definitions removed minus import lines added).

The mechanical scan (`exact-clones-all.txt`) had **no entry** touching this slice; everything below was found by reading and grepping.

Bundle notes that apply throughout:
- `core/` is in the always-loaded bundle. Moving a helper from an on-demand sport / results file into `core/` adds a few bytes to the main bundle and removes copies from on-demand chunks; it never pulls a sport into another sport.
- Several core files are "PURE — node tests load it" (no React Native / AsyncStorage). A shared helper must live in a dependency-free file, or those tests break. `core/time.ts`, `core/region.ts`, `core/org.ts` (via region) import AsyncStorage; `core/dates.ts` imports time.ts. Noted per finding.

---

## Summary

| Class | Findings | Net removable lines |
|---|---|---|
| A — removable, zero behaviour change | 24 | ≈ 150 |
| B — not identical, leave (differences listed) | 27 | 0 |
| C — drift that looks like a bug (finding only) | 11 | 0 |

---

## (A) Removable with zero behaviour change

| ID | What | Copies (path:lines) | Why provably identical / how | Net lines | Risk |
|---|---|---|---|---|---|
| 10-D1 | UUID v4 generator | `core/deviceId.ts:17-24` (`newUuid`, exported) · `core/telemetry.ts:45-52` (`uuid`) | Byte-for-byte same body (crypto.randomUUID, else the same `xxxxxxxx-…` replace). Keep `newUuid`; telemetry imports it. telemetry already imports AsyncStorage + Platform, so no new deps. (`data/chessRoundResults.ts:21-22` `newId` is **B**: no `crypto.randomUUID` branch.) | 7 | low |
| 10-D2 | HTML escape `esc` (5-char, `&<>"'`) | `core/certificates.ts:132` · `core/hallOfFame.ts:168` · `core/passport.ts:42` · `core/orgVerification.ts:650` · `data/results/printSheets.ts:25` (exported) · `sports/chess/roundSheet.ts:177` | Identical expression in all six. Put one export in a dependency-free core file (e.g. `core/exportCells.ts`, already the "escaping for files" module); others import. Single source matters more than lines. (`core/fixturesText.ts:22` is **B** — see 10-B5.) | ≈2 | low |
| 10-D3 | Print toolbar CSS + markup for printable sheets | CSS lines `.bar button {…}` and `@media print { .bar { display: none; } }`: `core/certificates.ts:153-154`, `core/hallOfFame.ts:175-176`, `core/passport.ts:63-64` (exact); the `.bar {…}` line is exact only in `hallOfFame.ts:174` and `passport.ts:62`. Toolbar `<div class="bar"><button onclick="window.print()">🖨 Print / Save as PDF</button><span>…</span></div>`: `certificates.ts:198`, `hallOfFame.ts:214`, `passport.ts:101`. HTML head `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" …>`: same three. | A shared `PRINT_BAR_CSS` string with exactly those three lines and a `printBar(label)` that returns the same markup reproduce the bytes. (`certificates.ts:152` `.bar` adds `font: 14px …` — that line differs, keep it local there.) `orgVerification.ts:659-661` uses a minified, different `.bar` (padding 6px 12px, radius 6px) → **B**. | ≈8 | low |
| 10-D4 | 12 short month names | `core/dates.ts:9` · `core/region.ts:324` · `core/age.ts:98` · `core/verificationReview.ts:45` · `core/passport.ts:46` (inline) · `data/tournamentCopyPlan.ts:521` · `data/fixtureSchedule.ts:32` · `screens/RegionSettingsScreen.tsx:18` · `data/results/timetable.ts:100` (inline) | Same 12 strings, same order. Export one constant from a **dependency-free** core file (age.ts, verificationReview.ts, passport.ts and tournamentCopyPlan.ts are node-test pure, so not from dates.ts/region.ts). `data/scheduleImport.ts:130` is lower-case → **B**. | ≈7 | low |
| 10-D5 | Ordinal "1st/2nd/3rd/11th" (full number) | `core/matchSafety.ts:232` · `data/structureConfig.ts:145-149` · `data/tournamentHistory.ts:265-269` (exported) · `sports/feedGroups.ts:114` (exported `nth`) · `sports/baseball/engine.ts:399` (exported `ord`) · `data/feeders.ts:53` · `sports/recordHelpers.ts:7-10` · `data/results/insightFeed.ts:35-38` · `components/MedalScoringEditor.tsx:15-18` · `sports/volleyball/ServePanel.tsx:37` · `components/TeamEventResults.tsx:19` · `screens/ResultsEventScreen.tsx:1431` · `data/results/cycling.ts:224` · `data/results/shooting.ts:379` · `data/results/weightlifting.ts:310` (exported) · `data/results/archery.ts:373` · `data/results/crews.ts:223` · `data/results/raceDepth.ts:633` (exported) | Three algorithms (`n%10===1&&n%100!==11…`, `s[(v-20)%10] ?? s[v] ?? s[0]`, `v in 11..13 ? th : s[n%10]`). Checked: same string for every integer incl. 0, 11-13, 111-113, 21, 101, negatives, and for NaN/Infinity/non-integers (all fall to `th`); `||` vs `??` is equivalent because the array has no empty strings. Core has no ordinal today → add one to a pure core file. Not part of any scoring reducer (display text only). | ≈25 | low |
| 10-D6 | Two-letter initials with `'?'` fallback | `sports/cricket/index.tsx:1648-1649` · `components/TournamentAwardsTab.tsx:28-29` · `components/MatchSummary.tsx:19-20` · `components/AwardPickerSheet.tsx:24-25` · `components/AddInvitePlayer.tsx:27-28` | Exact same expression `(name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() \|\| '?'`. Add as a NEW export (e.g. in `core/playerNames.ts`) — do **not** fold into `core/minorPrivacy.ts avatarInitials`, which differs (10-B6). | ≈6 | low |
| 10-D7 | "Team or tournament follower wants this alert" | `data/useLiveMatch.ts:360-363` (`teamOrTourWants(key)`) · `data/useLiveMatch.ts:524-526` (same, inlined for `'result'`) · `data/tieAlerts.ts:17-19` | Same three `followStore.wants(...)` disjuncts. One helper (e.g. on `followStore`) taking `{homeTeamId, awayTeamId, tournamentId}` and the key. Note line 524 is `!tieRef.current && (…)` — keep the `!tieRef.current &&` outside the helper. | ≈5 | low (alerts only) |
| 10-D8 | World Cup seed `place()` | `data/worldCupArgEgySeed.ts:86-90` · `data/worldCupBraNorSeed.ts:89-93` · `data/worldCupPorEspSeed.ts:88-92` | Identical function bodies. One shared helper (a small seed-helpers module). `data/worldCupSeed.ts:91-95` has no captain flag → **B**. Demo data, but statically imported by `data/demoStore.ts:10-13`, so it ships in the live bundle. | ≈8 | low (demo) |
| 10-D9 | World Cup seed `pl()` (3 of 4) | `data/worldCupArgEgySeed.ts:12-20` · `data/worldCupBraNorSeed.ts:13-21` · `data/worldCupPorEspSeed.ts:12-20` | Same body except the country union and the two colours in the ternary. A factory `makePl({ [country]: colour })` gives identical Player objects. `worldCupSeed.ts:14-22` builds the phone from `jerseyNo` (`+1 555 01NN`) → **B**. | ≈14 | low (demo) |
| 10-D10 | Demo seed `day(d, h)` | `data/teamTieDemoSeed.ts:86` · `data/sd134DemoSeed.ts:21` | Identical expression. | ≈1 | low (demo) |
| 10-D11 | `__sportnnoteDemo` registration block | `data/teamTieDemoSeed.ts:176-179` · `data/sd134DemoSeed.ts:129-132` · `data/sd137bDemoSeed.ts:95-98` | Identical pattern, only the function list differs → helper `registerDemoSeeds({ … })`. (Switching to `core/devGlobals.exposeGlobal` would change *when* they appear → that would be B, don't.) | ≈6 | low (demo) |
| 10-D12 | Demo "team with roster" builder | `data/teamTieDemoSeed.ts:26-32` (`team`) · `data/sd134DemoSeed.ts:115-121` (`pair`) | Same createTeam → invitePerson loop → setTeamRoster; `pair` computes the colour from `short` and returns the team only. `pair(n,s,names)` ≡ `(await team(n, s, 'carrom', s === 'NOR' ? '#3DDC97' : '#FFB454', names)).t`. | ≈5 | low (demo) |
| 10-D13 | mockData club team construction | `core/mockData.ts:325-326, 342-343, 445-446, 461-462` (`team(h.id, h.name, h.short, 'football', h.color)` pattern ×6) | A `clubTeam(k)` like the existing `cgTeam` (`mockData.ts:401-404`) returns the same Team. | ≈4 | low (demo) |
| 10-D14 | Optional native module lazy loader | `core/haptics.native.ts:9-17` · `core/keepAwake.native.ts:9-17` · `core/printSheet.native.ts:12-20` · `core/location.ts:19-28` · `core/document.ts:13-21` | Same shape: cache `undefined → null → require(...)` guarded by `requireOptionalNativeModule(name)`. A generic `optionalNative(name, () => require('pkg'))` keeps a literal `require` inside the thunk (Metro needs it) and the same caching. `firebasePhone.native.ts` (two modules + `getApp()` probe) and `shareInvite.native.ts` (TurboModuleRegistry) differ → B. | ≈20 | low |
| 10-D15 | Edge-function error body → message | `core/phoneLogin.ts:56-58` · `core/phoneLogin.ts:97-99` · `data/studentListStore.ts:100-102` · `data/registerLookup.ts:26-28` · `data/repos.ts:4039-4041` · `data/repos.ts:4347-4349` | Same `context.json()` read, then `body?.error ?? <fallback>`; only the fallback text differs (passed in). `data/privacy.ts:52-56 fnError` also reads `reason` → B (but the others could share a variant of it). | ≈8 | low |
| 10-D16 | `isOrgAdmin` ≡ `canManageOrg` | `core/org.ts:217-218` · `core/org.ts:239-240` | Both `hasOrgRole(org, playerId, ['Owner','Admin'])`. One can alias the other. | ≈2 | low |
| 10-D17 | Class/house-at-date resolver | `core/org.ts:32-40` (`standardAt`) · `core/org.ts:166-173` (`houseAt`) | Same half-open stint lookup + earliest/latest fallback; only the field (`grades.standard` vs `houses.house`). A generic `stintAt(list, date, pick)` gives identical results. (`promoteGrade` vs `assignHouse` differ — assignHouse no-ops on same house → B.) | ≈6 | low |
| 10-D18 | Education type list | `core/org.ts:24` (`EDUCATION_TYPES`) · `core/orgVerification.ts:505` (`EDUCATION_VERIFY_TYPES`) · `core/orgVerification.ts:520` (`OFFICIAL_ONLY_TYPES`); predicates `core/org.ts:25-26 isAcademicCommunity` ≡ `core/orgVerification.ts:506 isEducation` | Same 6 strings in the same order; predicates identical. Keep them in `orgVerification.ts` (pure) and import into `org.ts` (the reverse would pull region/AsyncStorage into a pure file). Types narrow slightly differently (`as const` vs `VerifiableType[]`) — compile-time only. (`COMMUNITY_TYPES` vs `REGISTERED_TYPES` are **B**: same 13 values, different order.) | ≈4 | low |
| 10-D19 | No-result predicate on a match | `data/standings.ts:836-837` (`isNoResultMatch`) · `data/teamTie.ts:417` (`isNoResult`) · `core/matchResult.ts:28` (`isNoResult(m.result)`) | All three are `kind === 'no_result' \|\| kind === 'abandoned'`. teamTie can't import standings (cycle: standings imports teamTie) but can call `core/matchResult.isNoResult(m.result)` — same boolean. Scoring-table code, but the predicate is pure and unchanged. | ≈2 | low-medium |
| 10-D20 | Chess team-tie half-point rubber rule | `data/teamTie.ts:426-428` (in `rubberPoints`) · `data/series.ts:336-341` (`halfPointLeg`) | Both: `__tieHalf === true` and not NR/abandoned and `state.method !== 'double-forfeit'`. Export `halfPointLeg` from series.ts (teamTie already imports series). Standings/tie result unchanged. | ≈3 | medium (tie standings) |
| 10-D21 | Empty standings row literal | `data/standings.ts:1005` (`ensure`) · `data/tournamentHistory.ts:125` | Same keys, same order, same zeros. Export a `blankRow(id, name, colorHex)` from standings.ts (tournamentHistory already imports it). | ≈1 | low |
| 10-D22 | "Team lines" filter | `data/teamRecords.ts:113-114` (`teamLinesOf`) · `data/teamStats.ts:147` · `data/teamStats.ts:155` | Same `matchIds.has(l.matchId) && (playedFor[l.matchId] ?? []).includes(l.playerId)`. Move `teamLinesOf` into teamStats.ts (teamRecords already imports teamStats; reverse would be a cycle). | ≈2 | low |
| 10-D23 | "Schema not deployed" error-code set | `data/tournamentCopy.ts:147` · `data/repos.ts:955-956` (`isMissingSchema`) | Same six codes (order differs; `.includes` is order-independent). Export repos' and import. (Other, narrower sets are **B**, see 10-B11.) | ≈1 | low |
| 10-D24 | Small exact repeats (grouped) | (a) NRR cell text `standingsColumns.ts:170` ≡ `:220`; (b) `save_web_push_subscription` args `core/webPush.ts:66-69` ≡ `:82-85`; (c) `ANDROID_PACKAGE` `core/inviteText.ts:133` ≡ `core/androidAppLinks.ts:14`; (d) tournament join URL `core/tournamentInvite.ts:7` ≡ `core/inviteText.ts:187` (tournament branch); (e) `articlesByCategory` order list `data/supportKB.ts:496-498` ≡ key order of `CATEGORY_ICON` `:38-45`; (f) `resultCardImage.ts:11-13` colours/fonts = `theme.colors.primaryDark/lime/primary`, `danger '#B32525'`, `textMuted '#59616C'`, `theme.fonts.display/heading` (importing theme gives the same values); (g) the 5 `if (!supabase) return {}; const { error } = await …; return error ? { error: friendlyAuthError(error.message) } : {}` OTP/reset wrappers in `core/auth.tsx:370-400` | Each is an exact value/expression copy. For (c)/(d)/(f) the net line count is ~0 — the gain is one source of truth (a package id or colour can't drift). | ≈12 | low |

**Total (A) net ≈ 150 lines.**

---

## (B) Not identical — leave (exact differences)

| ID | What | Copies | Differences |
|---|---|---|---|
| 10-B1 | Time-zone → country mapping (4 tables, 2 functions named `deviceRegion`) | `core/chatRegion.ts:36-54` (`regionFromTimeZone`) + `:59-72` (`deviceRegion`) · `core/privacyRegion.ts:31-61` (`US_ZONES`, `ZONE_COUNTRY`, `countryFromTimeZone`) · `core/region.ts:148-164` (`ZONE_COUNTRY`, `countryOfZone`) + `:177-190` (`deviceLocaleRegion`) · `core/phone.ts:32-56` (`TZ_COUNTRY`, `deviceRegion`) | Coverage differs per table: Gulf SA/KW/BH/OM only in chatRegion/privacy/phone; `Singapore`, `US/Eastern…` aliases only region (+privacy `US/.+`); `America/Montreal` only privacy; `Asia/Katmandu`, ZA, KE only phone; privacy maps every other `Europe/*` to `'EU'`; region deliberately returns only the 8 market countries. Locale fallback: chatRegion regex `[-_]XX`, region `^[a-z]{2,3}(-Xxxx)?-XX`, phone ignores a US locale outside US zones. chatRegion's header says it should defer to region.ts "when that lands" — it has landed. Consolidating changes outputs → needs a decision. See 10-C8. |
| 10-B2 | `deviceTimeZone()` | `core/region.ts:168-173` (exported) · `core/privacyRegion.ts:70-72` · `core/supportAI.ts:59-61` | region returns undefined for strings of length ≤ 1; supportAI returns undefined for `''`; privacy returns `''` as is. Downstream results happen to match for real zones, but the functions differ; privacyRegion is node-test pure and region.ts imports AsyncStorage, so it can't simply import it. |
| 10-B3 | "5 Mar 2012" date text | `core/region.ts:326-329` (`spelledDate`, fallback = input) · `core/age.ts:100-103` (`cutoffLabel`, exact `^…$` match, fallback = input) · `core/verificationReview.ts:42-47` (`readableDob`, prefix match, fallback `'—'`) · `core/passport.ts:43-47` (`readable`, prefix match, fallback `''`) · `core/certificates.ts:141-146` (long month names "5 March 2012") | Fallbacks and anchoring differ; certificates uses full month names. |
| 10-B4 | Weekday + day labels | `core/dates.ts:12-17` (`formatDay` "Mon, 27 Jul", zone-aware) · `data/fixtureSchedule.ts:34` (`dayText` "Wed 9 Sep", UTC weekday) · `data/results/timetable.ts:97-101` (`dayLabel` "Thu 12 Nov", local Date) | Comma vs no comma; fixtureSchedule defaults bad month/day to 1, timetable uses the local Date. |
| 10-B5 | HTML escape, 4 chars | `core/fixturesText.ts:22` | Doesn't escape `'` (the 5-char copies do) — output differs for apostrophes in attribute-less text; harmless in that file's usage. |
| 10-B6 | Initials (other variants) | `core/minorPrivacy.ts:46-53` (`avatarInitials`: splits on `.` and `\s+`) · `core/playerNames.ts:57-60` (`nameInitials` "M. R.", all words, fallback "Player") · `components/HostsCard.tsx:10-11` (fallback 🤝) · `screens/LiveScoringScreen.tsx:2616-2619` (fallback 🎯) · `screens/QuickTournamentScreen.tsx:43` / `screens/ScheduleMatchScreen.tsx:58` / `data/repos.ts:5679, 6308` (all words) · `screens/EditProfileScreen.tsx:248` (letters only, fallback 🙂) · `screens/OrganizationScreen.tsx:1129`, `screens/TeamProfileScreen.tsx:213` (3 letters) | Word splitting, word count, fallback differ. |
| 10-B7 | "time ago" | `core/connect.ts:66-75` ("2h ago", rounds) · `core/supportConsole.ts:33-39` ("1 h 5 min ago", floors) · `core/verificationReview.ts:17-24` ("45 min", no "ago", "just now" < 2 min) · `screens/LiveScoringScreen.tsx:281` | Wording and rounding differ. |
| 10-B8 | Delimited/CSV parsers | `data/scheduleImport.ts:53-107` · `data/rosterImport.ts:50-74` | Delimiter detection (outside quotes, tab>comma>semicolon vs counts incl. quoted text, majority); scheduleImport drops `#` rows and tracks source line numbers; trimming. |
| 10-B9 | Calendar-date validators | `core/region.ts:279-284` (`ymdOf`, years 1000-9999) · `data/scheduleImport.ts:137-143` (`ymd`, 2-digit year +2000, years 1900-2200) | Year handling. Also 2-digit-year pivot: `region.parseTypedDate` (DOB style) vs `scheduleImport.parseDateCell` (always 2000s) — intentional. |
| 10-B10 | Weekday-prefix strip regex | `core/region.ts:311` · `data/scheduleImport.ts:159` | Same regex, but used inside different parsers (one also strips after a space). Tiny; leave. |
| 10-B11 | "Schema not deployed" checks (other) | `data/supportConsole.ts:24` (no 42703/PGRST204) · `data/repos.ts:463`, `data/personalise.ts:19` (3 codes + message test) · `data/repos.ts:1632`, `data/resultsStore.ts:563` (2 codes + message) | Different code sets / message tests. See 10-C10. |
| 10-B12 | Hidden file-input pickers | `core/document.ts:34-48` · `:76-92` · `:102-127` | Same shell (create input, hide, append, click, 120 s cleanup) but accept list and onchange handling differ; `pickDocument` resolves before `remove()`, the others after. A shared shell is possible but the bodies are not identical. |
| 10-B13 | Team for/against per side | `data/teamStats.ts:120-123` · `data/teamRecords.ts:63-66` | teamStats uses 0 when there's no counted score; teamRecords omits `f`/`a`. |
| 10-B14 | Chess double-forfeit test | `data/standings.ts:268-272` (chess only, `!m.result`) · `data/teamTie.ts:419` (any sport, any result) · `data/series.ts:339` · `data/teamStats.ts:80` (also needs `winner === 'draw'`) | Guards differ. |
| 10-B15 | Chess half points text | `data/teamTie.ts:363-367` (`fmtPts`) · `data/standingsColumns.ts:71-76` (`halfText`) | Negatives (`fmtPts(-0.5)` → "-1½", `halfText` → "−½") and non-half decimals differ. |
| 10-B16 | Short team name | `data/series.ts:222` (fallback `''`) · `data/teamTie.ts:406-407` (fallback `'Team A'/'Team B'`) | Fallback. |
| 10-B17 | Year-period labels | `core/teams.ts:26-30` (" – ", "until 2022") · `core/org.ts:46-49` (`gradePeriod`, "–", no until-only form) · `core/org.ts:302-307` (`membershipPeriod`, " – ", "left 2022") | Separator and fallbacks. |
| 10-B18 | Standings name maps for byes | `data/standings.ts:113-119` · `:144-149` | First reads all matches of the sport, second Swiss matches only. Also the Swiss filter differs: `:120` `stage.startsWith('swiss')` vs `:140` `swissRoundOf(stage) !== undefined` (a bare `'swiss'` stage counts only in the first). |
| 10-B19 | WhatsApp/SMS/iOS detection | `core/webPush.ts:21-25` (`isIos`, iPadOS via touch points) · `core/inviteText.ts:142-147` (`webDevice`, iPadOS via param) · `core/connect.ts:60-61` (no iPadOS) | See 10-C7. |
| 10-B20 | Home-screen standalone check | `core/webPush.ts:27-29` · `core/telemetry.ts:253-256` | telemetry adds a web/window guard. |
| 10-B21 | Firebase error text | `core/firebasePhone.ts:152-163` · `core/firebasePhone.native.ts:54-63` | Different codes handled (web: billing/captcha; native: session-expired/app-not-authorized) and different wording. Platform-specific — intentional. |
| 10-B22 | Speech adapter teardown | `core/speechNative.ts:88-97` (`finish`) · `:204-211` (stop) | stop doesn't call `onInterim('')`/`onEnd`. |
| 10-B23 | mockData match builders | `core/mockData.ts:283-297` (`done`) vs `:353-362` (`houseDone`); `bpl` `:319-329` vs `cupMatch` `:440-449` | `houseDone` always sets a `venueName` key (possibly undefined), `done` has none; `cupMatch` score optional. |
| 10-B24 | Draw-sport sets | `data/standingsColumns.ts:78` · `data/teamRecords.ts:208` | Different purposes and members (teamRecords adds ice_hockey, chess, american_football for unbeaten runs). Intentional. `teamRecords.ts:207 GOAL_SPORTS` vs `standings.scoreUnit` goals: netball excluded on purpose (clean sheets). |
| 10-B25 | Leg / team score | `data/series.ts:28-29` (`legScore`) · `data/walkover.ts:262-267` (`teamScoreOf`) | legScore keeps the board score for an old walkover without a forfeit block; teamScoreOf returns undefined. Commented as intentional. |
| 10-B26 | Community type lists | `core/org.ts:198-212` (`COMMUNITY_TYPES`) · `core/orgVerification.ts:291-294` (`REGISTERED_TYPES`) | Same 13 values, different order (shown in pickers). |
| 10-B27 | Programme vs golf-round JSON readers/shifters | `data/tournamentCopyPlan.ts:228-236` vs `:334-344`; `:215-225` vs `:353-356` | Different validation and fields. |

---

## (C) Drift that looks like a bug (findings only — fixing changes behaviour)

**10-C1 — iCalendar semicolons are never escaped (intra-function drift).** `core/exportCells.ts:13-14`:
`.replace(/;/g, '\;')` — in a JS string `'\;'` is just `;`, so this replaces `;` with `;`. The neighbouring comma copy is `.replace(/,/g, '\\,')` and works. Verified in node: `icsText('a;b,c')` → `a;b\,c`. RFC 5545 requires `\;`. Every `.ics` export (`core/ics.ts:34`, SUMMARY/LOCATION/DESCRIPTION) is affected; a semicolon in a venue or title can make a calendar app split or drop the text.

**10-C2 — SECURITY (client rule disagrees with the server): team management.** `core/teamPermissions.ts:9-21` (`canManageTeamLocal`) says it "mirrors" SQL `can_manage_team`, but:
- client: `role === 'organizer' || role === 'support'` → true. Server (`supabase/migrations/20261019121000_tournament_teams_admin.sql`, `can_manage_team`): creator, captain, vice-captain, `admin_ids`, club manager, the team's org Owner/Admin/Organizer, `team_staff` — and the migration comment says "Deliberately NOT any organizer".
- client lacks org roles and team staff (stricter there).
- `data/repos.ts:926-933` strips `role` on the live RPC-error fallback (good), but `isCaptainStore` / `isClubAdmin` — client-supplied flags — still return true there.
Impact is UI (the server's RLS still refuses writes), but the rule and its doc disagree; demo mode lets any "organizer" manage every team. `tests/team-permissions.test.mts:6-7` asserts the organizer/support behaviour.

**10-C3 — Scoring access rule omits the tournament's organiser account.** `core/scoringAccess.ts` says it mirrors `can_manage_match()`. Server (`20261006120000_security_hardening.sql`): `can_manage_tournament` = `organizer_id = auth.uid()` OR host_ids OR host org Owner/Admin/Organizer. Client `tournamentHostIds` (`core/org.ts:325-334`, used at `screens/LiveScoringScreen.tsx:207, 237`) has no `organizer_id` check (note `core/org.ts:339-341 canManageTournament` does have it). An org-hosted tournament's creator (`createTournament` puts no individual host_ids for org events, `data/repos.ts:4777`) who isn't an active Owner/Admin/Organizer of that org can't score in the UI though the server would accept. Client stricter — not a hole.

**10-C4 — Role check disagreement: `'admin'`.** `core/auth.tsx:259` enables the admin console globals for `role === 'support' || role === 'admin'`. `Role` (`core/types.ts:46`) has no `'admin'`, and `core/roles.ts:6 isSupport` / `canOrganize` only know `'support'`. Either a dead branch, or a DB value that gets console tools but no support UI. Needs a decision.

**10-C5 — Student-list demo matcher vs server, and vs the phone identity rule.** `data/studentList.ts:161-162` (`matchLocally`, "the demo's (and the tests') copy of org_roster_match"): compares `contact.replace(/\D/g,'').slice(-10) === r.phone.replace(/\D/g,'').slice(-10)` against every contact, emails included, with no length guard. A row phone with no digits (e.g. "n/a") matches any email contact (`'' === ''`) → a false member/parent match in demo and tests. The server's `roster_phone_key` (`20261028100000_student_lists.sql:66-69`) requires ≥ 8 digits. Separately, both client and server match on the **last 10 digits**, which `core/phone.ts:4-10` says identity matching must never do ("+1 917 555 1234 signed into +91 91755 51234"). Needs a decision (server change = high risk).

**10-C6 — Team-tie "needed" vs series clinch.** `data/teamTie.ts:392-394`: `half` = any rubber with `__tieHalf`. `data/series.ts:256-257`: `halves` = any rubber passing `halfPointLeg` (excludes no-result / abandoned / double-forfeit). If every ½-point rubber ended without a game, the tie page shows "first to 2½" while `resolveSeries` decides at 3. Edge case; touches tie results.

**10-C7 — SMS body separator on iPad web.** `core/connect.ts:60-62` picks `&body=` only for `iPhone|iPad|iPod` user agents; iPadOS 13+ reports "Macintosh". `core/webPush.ts:24` and `core/inviteText.ts:145` handle that case; connect.ts doesn't → `?body=` on iPad Safari. Low impact.

**10-C8 — Country decisions disagree across modules (from 10-B1).** The same device can be WhatsApp-first by one table and not another, or get GDPR consent rules but an India phone default, e.g. a device on `US/Eastern`: region.ts → US, privacy → US, chatRegion → falls back to the locale; `America/Montreal`: privacy → CA, chatRegion/region → none; `Asia/Katmandu`: phone → NP, chatRegion/privacy → none. Behaviour-changing to unify.

**10-C9 — Market country vs ID country.** `core/orgVerification.ts:490-500 idCountry('gulf-british')` → `'AE'`, while `core/markets.ts:72 MARKETS['gulf-british'].country` → `'QA'`. May be intentional (IDs filed under AE) — needs a decision.

**10-C10 — Support console "needs update" misses column errors.** `data/supportConsole.ts:24` lacks `42703` / `PGRST204`, which `data/repos.ts:956` and `data/tournamentCopy.ts:147` include — a missing column throws instead of showing "needs-update".

**10-C11 — Custom team-tie rubber ordinal.** `data/teamTie.ts:196` `ord(21)` → "21th" (every other ordinal in the app is correct). Practically unreachable (21+ singles in one tie).

---

## Coverage

176 files, 23,051 lines. Every file was read; a few long single lines were read truncated at ~200 chars (data tables / template strings). Large text tables (support articles, World Cup squads) were checked for duplicate ids/keys, not line-audited, as the brief allows (no duplicate KB ids, all 16 guides have a KB article, no duplicate player ids across the 4 World Cup seeds).

| File | Lines | Status |
|---|---|---|
| src/data/scheduleConflicts.ts | 144 | reviewed |
| src/data/scheduleImport.ts | 610 | reviewed |
| src/data/scorerAssign.ts | 92 | reviewed |
| src/data/sd134DemoSeed.ts | 132 | reviewed |
| src/data/sd137bDemoSeed.ts | 98 | reviewed |
| src/data/search.ts | 164 | reviewed |
| src/data/series.ts | 411 | reviewed |
| src/data/setupChecklist.ts | 36 | reviewed |
| src/data/shareInflight.ts | 20 | reviewed |
| src/data/sportProfileFields.ts | 174 | reviewed |
| src/data/standings.ts | 1637 | reviewed |
| src/data/standingsColumns.ts | 283 | reviewed |
| src/data/statSync.ts | 122 | reviewed |
| src/data/stats.ts | 164 | reviewed |
| src/data/structureConfig.ts | 149 | reviewed |
| src/data/studentList.ts | 374 | reviewed |
| src/data/studentListStore.ts | 208 | reviewed |
| src/data/supportConsole.ts | 94 | reviewed |
| src/data/supportGuides.ts | 226 | reviewed (keys + structure; guide prose skimmed only) |
| src/data/supportKB.ts | 533 | reviewed (code + ids; article prose skimmed for duplicate ids only) |
| src/data/swiss.ts | 343 | reviewed |
| src/data/swissField.ts | 56 | reviewed |
| src/data/swissOps.ts | 250 | reviewed |
| src/data/swissTiebreaks.ts | 182 | reviewed |
| src/data/teamEventResults.ts | 124 | reviewed |
| src/data/teamRecords.ts | 309 | reviewed |
| src/data/teamRoles.ts | 33 | reviewed |
| src/data/teamStats.ts | 183 | reviewed |
| src/data/teamTie.ts | 643 | reviewed |
| src/data/teamTieDemoSeed.ts | 179 | reviewed |
| src/data/tieAlerts.ts | 21 | reviewed |
| src/data/timetableStore.ts | 57 | reviewed |
| src/data/tournamentCopy.ts | 196 | reviewed |
| src/data/tournamentCopyPlan.ts | 572 | reviewed |
| src/data/tournamentDraft.ts | 35 | reviewed |
| src/data/tournamentForm.ts | 53 | reviewed |
| src/data/tournamentHistory.ts | 426 | reviewed |
| src/data/tournamentRecords.ts | 83 | reviewed |
| src/data/useAgeRequirement.ts | 21 | reviewed |
| src/data/useAthletics.ts | 36 | reviewed |
| src/data/useCarriedEvent.ts | 40 | reviewed |
| src/data/useGolf.ts | 59 | reviewed |
| src/data/useImageUri.ts | 50 | reviewed |
| src/data/useLiveMatch.ts | 553 | reviewed |
| src/data/useMarket.ts | 27 | reviewed |
| src/data/useMeetAges.ts | 49 | reviewed |
| src/data/useMeetEntries.ts | 87 | reviewed |
| src/data/useMeetZone.ts | 15 | reviewed |
| src/data/usePlayerNameOf.ts | 19 | reviewed |
| src/data/useProfileShare.ts | 23 | reviewed |
| src/data/useSuspensions.ts | 30 | reviewed |
| src/data/useVerificationReviewer.ts | 17 | reviewed |
| src/data/walkover.ts | 267 | reviewed |
| src/data/worldCupArgEgySeed.ts | 122 | reviewed (code; player rows checked for duplicate ids only) |
| src/data/worldCupBraNorSeed.ts | 125 | reviewed (code; player rows checked for duplicate ids only) |
| src/data/worldCupPorEspSeed.ts | 124 | reviewed (code; player rows checked for duplicate ids only) |
| src/data/worldCupSeed.ts | 139 | reviewed (code; player rows checked for duplicate ids only) |
| src/core/* (119 files, 11,832 lines) | 11832 | all reviewed — list below |

core files (all reviewed): a11y 156, age 110, analyticsConsent 70, androidAppLinks 36, appLinks 40, auth.tsx 417, authEvents 73, authMetadata 17, certificates 200, chatRegion 92, confirm 27, connect 75, contactQuery 8, contrast 60, dates 23, deviceId 45, deviceSignOut 29, devGlobals 35, disputeMask.tsx 60, divisions 99, document 144, download 23, eligibility 81, exportCells 14, firebasePhone 205, firebasePhone.native 115, fixturesText 74, functionPath 14, functionRegion 75, guardianProof 83, guest 28, hallOfFame 234, haptics 17, haptics.native 30, hapticsPref 27, hosts 94, ics 72, imageMeta 23, imageUrl 77, invite 44, inviteText 194, keepAwake 38, keepAwake.native 31, leadingEmoji 73, liveSummary 36, location 91, markets 279, matchConfig 28, matchResult 37, matchSafety 237, minorPrivacy 78, mockData 465, notifications 180, onboarding 16, org 341, orgContext.tsx 69, orgVerification 672, overlayParams 43, passport 124, personalise 135, phone 268, phoneLogin 105, photo 55, pickContact 47, playerEditAccess 77, playerNames 67, printSheet 30, printSheet.native 38, privacyRegion 105, qrcode.d.ts 9, qrSvg 19, queueAccount 14, quickGame 22, quickTournament 59, referralRules 27, region 380, registerLookup 71, registration 59, resultCard 58, resultCardImage 69, roles 52, safeUrl 32, scoringAccess 40, scoringLock 28, share 71, shareInvite 127, shareInvite.native 67, shareText 157, signedImageCache 76, signOutSafely 27, smsBudget 24, smsLimit 30, speech 133, speechNative 227, speechSetup 4, speechSetup.native 34, staleVersion 24, staleVersionMatch 5, supabase 31, supportAI 61, supportConsole 97, svgCssStub 10, teamLevels 35, teamPermissions 30, teams 63, teamSearch 21, telemetry 262, theme 85, time 295, tournament 58, tournamentInvite 33, types 1048, units 134, venue 21, verificationChecklist 80, verificationReview 51, voiceLLM 76, webPush 95, xlsx 196.
