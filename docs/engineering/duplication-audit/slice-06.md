# Slice 06 — src/components/ (143 files, 20,806 lines)

Scope as revised by the coordinator: **duplicated code only**, every finding classed strictly:

- **(A)** removable with zero behaviour change (same output, UI, text, styles, a11y, side effects for every input). Only (A) counts toward "lines removable".
- **(B)** not identical: the exact difference is listed, and it is not counted.
- **(C)** drift that looks like a bug. Reported only; not removable, because fixing it changes behaviour.

How the review was done:
- I read `results/`, `athletics/` and `ui.tsx` myself, every line.
- Three forked reviewers (same model, same brief) read the other top-level components, `golf/`, `overlay/`, `support/` and `keyboard*`, every line.
- I re-checked, character by character, every (A) item they reported that I keep below. Items they called identical that I could not re-check are classed (B) or marked "unverified".
- Read-only throughout. No repo file was touched.

**Bundle facts used for the (A) calls:**
- All six career panels are imported statically by `screens/SportProfileScreen.tsx:29-34`, so they are in one chunk.
- Every results panel (Archery, Cycling, Road, Lifting, Shooting, TeamEvent, Combined, ResultsSheet, RaceDepth, PrecisionInsights, EntriesPanel) is imported statically by `screens/ResultsEventScreen.tsx:25-40`.
- Sharing code among the files in either group therefore moves nothing between chunks.

---

## 1. Duplicates

### Career panels (the main cluster): CrewCareer, CyclingCareer, LiftingCareer, ShootingCareer, ArcheryCareer, AthleticsCareer

The files: `components/results/{Crew,Cycling,Lifting,Shooting,Archery}Career.tsx` and `components/athletics/AthleticsCareer.tsx`, 773 lines in total. Each sub-block is classed separately.

**06-D1 Phase-info loader (A), exact**
- Copies: Crew 24-31, Cycling 24-31, Lifting 22-29, Shooting 22-29, Archery 23-30, Athletics 26-33.
- What repeats: the same `useState<Map>` + `key` + `useEffect(getPhaseInfos…)` + `season`, 9 lines × 6 = 54 lines.
- Differences: none, character-identical.
- Fix: one `useCareerInfos(lines)` hook returning `{ infos, season }`, in `components/results/RecordsSetCard.tsx` or a new `components/results/careerParts.tsx`.
- **Removable: 40.**

**06-D2 `MEDAL` map (A)**
- Copies: line 20 in Crew, Cycling and Athletics; line 18 in Lifting and Shooting; line 19 in Archery.
- Each is `{gold:'🥇',silver:'🥈',bronze:'🥉'}`, which equals the existing `medalIcon` (`data/results/teamResults.ts:144`, exported from `data/results`) for the typed `medal?: 'gold'|'silver'|'bronze'`.
- **Removable: 6.**

**06-D3 Results-history list (A, with an `icon` parameter)**
- Copies: Crew 75-91, Cycling 82-98, Lifting 99-115, Shooting 73-89, Archery 79-95, Athletics 94-110. 17 lines × 6 = 102 lines.
- Differences: only the leading emoji. Crew and Cycling pass a variable; Lifting `🏋️`, Shooting `🎯` and Archery `🏹` are literals; Athletics computes it from `h.discipline` and `swim` (line 101).
- The item types are field-identical: the inline types in `data/results/{crews,cycling,weightlifting,shooting,archery}.ts`, and `CareerRace` (`athletics.ts:495`), which only adds an optional `discipline`.
- Fix: one `CareerHistory({ history, iconOf })`. `{icon} {h.title}` and the literal `🏋️ {h.title}` render the same text node.
- **Removable: 85.**

**06-D4 PB / SB table (A for 5 copies, B for Archery)**
- Copies: Crew 52-73, Cycling 59-80, Lifting 53-74, Shooting 50-71, Athletics 69-92. About 22 lines each.
- With these parameters the shared table reproduces each copy exactly:
  - `section` title: "Best times" (Crew, Cycling) or "Personal bests" (Lifting, Shooting, Athletics)
  - empty text: per sport; Athletics picks between two by `swim`
  - first column head: "Boat · distance", "Event · distance", "Lift", "Event"
  - the sub-line builder:
    - Crew, Cycling, Lifting: `[category, date]`
    - Shooting: `[avg, best series, date]`
    - Athletics: `[category, wind (lj/tj only), date]`
- **Archery 56-77 is (B):**
  - `col` width is 64, not 72 (line 118).
  - The PB cell is `b.pb.value || '–'` and the SB cell `b.sb?.value`, not `.text`.
  - Its sub-line always starts with `avg arrow`.
- **Removable: 85** (the 5 identical copies).

**06-D5 `Tile` (A for 4 copies, B for 2)**
- Copies: Crew 96-105, Cycling 103-112, Lifting 120-129, Shooting 94-103. Identical, including `st.tile` (h1) and the centred label.
- **Archery 100-109 (B):** `st.tile` is `font.h2` (line 113). It shows 6 tiles, so this looks intentional.
- **Athletics 115-124 (B):** the label has no `textAlign:'center'` (line 120). See drift C4.
- **Removable: 30.**

**06-D6 Medal summary line (A for 5 copies, B for Lifting)**
- Copies: Crew 43-45, Cycling 43-45, Shooting 40-42, Archery 44-46, Athletics 44-46.
- Athletics sums `c.golds+c.silvers+c.bronzes` inline, which gives the same value as `medals`.
- **Lifting 40-42 (B):** it adds `liftMedals`.
- **Removable: 12.**

**06-D7 Career StyleSheet (A for most keys)**
- Copies: Crew 107-120, Cycling 114-127, Lifting 131-145, Shooting 105-118, Archery 111-124, Athletics 126-139.
- Identical in all 6: `grid`, `medals`, `section`, `bestRow`, `head`, `mark`, `markSb`, `hist`, `date`, `chev`.
- `tile` and `col` are identical in 5. The exceptions are Archery (h2 / 64) and Lifting's extra `colS`.
- **Removable: 55**, as the keys move with D3 to D6.

**Career cluster total (A): about 313 of 773 lines removable.** The genuinely per-sport parts stay: the tile values, deep-wave lines, team lines, Lifting's by-category table, and Athletics' road/XC card. Risk is low, display only.

Intentional differences, not bugs:
- Crew has no `teamCareerText`, because `CrewCareer` has no team fields (`crews.ts:407`).
- Lifting, Shooting and Archery have no `RecordsSetCard`, because their career objects carry no `meetRecords`/`records` (`weightlifting.ts:529`, `shooting.ts:387`, `archery.ts:382`).

Outside the slice, the same history item type is written inline 5× (`crews.ts:402`, `cycling.ts:314`, `weightlifting.ts:500`, `shooting.ts:374`, `archery.ts:365`). That is (A), type-only, 4 lines.

### Results panels (`components/results/*Panel.tsx`)

| ID | What | Locations | Class | Exact difference / why (A) | Removable |
|---|---|---|---|---|---|
| 06-D8 | `type Save = (entryId, next, undoLabel?) => void` | Shooting 23, Cycling 27, Road 25, Lifting 32, Archery 30, TeamEvent 23 | A | Identical. Export it once, e.g. from `data/results` or a new `results/panelKit.ts`. | 5 |
| 06-D9 | `first = (name) => name.split(' ')[0]` | Shooting 24, Cycling 28, Road 27, Archery 31, TeamEvent 24; inline at Lifting 173, 263 and Archery 63 | A | Identical expression. Not the same as `volleyball/ServePanel.tsx:36`, `HeadToHeadScreen.tsx:231` and `golf/GolfRoundDeep.tsx:15`, which add `\|\| name`, or `data/requests.ts:66` (`/\s+/`); those are (B). | 6 |
| 06-D10 | `inPlay` (DNS/WD/DQ filter) | Shooting 25, Archery 32 | A | Identical. `data/results/liftingInsights.ts:42` (`e.result?.status`) and `weightlifting.ts:252` (takes an `EntryResult`) are (B). | 1 |
| 06-D11 | Number parser `num` / `kgOf` | Shooting 26, TeamEvent 25, Lifting 33 (`kgOf`) | A | Body is character-identical. `screens/ResultsEventScreen.tsx:94` also maps `'−'`→`'-'`, so it is (B). `golf/GolfCourseEditor.tsx:24` is (B). | 2 |
| 06-D12 | `statusOf`, `inRace`, `saveAll` | Cycling 29-30 + 38-40, Road 28-29 + 34-36 | A | Identical. `byOrder` (Cycling 31) vs `byBib` (Road 30-31) are (B): different sort keys. `STATUS_HELP` is (B): different wording per sport. | 5 |
| 06-D13 | `SmallBtn` | Cycling 185-191, Road 270-276 | B → C | JSX identical, but `st.small` is 36×36 in Cycling (`:539`) and 44×44 in Road (`:312`). See C3. | 0 |
| 06-D14 | `TimeBox` | Cycling 194-205, Road 279-297 | B | Road's is async with `busy`/`tried` refs (it doesn't re-ask a declined time) and uses no `flex:1`; Cycling's is sync. | 0 |
| 06-D15 | Bracket match row | Archery 239-244, Cycling 421-427 (SprintBracketCard) | A | The `TouchableOpacity` row is identical. Only the `score` string fed in differs. Also identical: `match`, `mName`, `win`, `mScore`, `rowOn`. | 6 |
| 06-D16 | Bracket grouping memo | Archery 215-223, Cycling 401-407 | B | Cycling renames the labels ("Gold medal match"→"Final (gold)", 1/n elimination→1/n final). | 0 |
| 06-D17 | Stale-bracket `apply()` | Archery MatchScorer 306-325, Cycling SprintMatch 445-463 | B | Differences: returns boolean vs void; `fmt` vs `'sets'`; "bronze medal match" vs "bronze final"; "Later scores…" vs "Later heats…"; `nm(winner)` vs `ea/eb.name`. High risk: bracket results. | 0 |
| 06-D18 | Walkover chips (absent / undo) | Archery 421-429, Cycling 492-500, TeamEvent 237-247 | B | Same labels, but the callbacks differ: TeamEvent writes without the stale check, and the conditions differ (`!out.series.length && !out.walkover`). | 0 |
| 06-D19 | Walkover confirm text | Archery 355, Cycling 470, TeamEvent 184 | B | "doesn't shoot" / "doesn't start" / a different message. Intentional per sport. | 0 |
| 06-D20 | Shared panel style keys | Identical `card` / `headRow` / `wrap` in Archery, Cycling, Lifting, Shooting, Road, TeamEvent and PrecisionInsights (7); `bad` in 6; `hint` in 5; `tag` in 4; `upName` in 3; `inputBad` in 4 | A for those keys | B for the others, which differ:<br>• `head`: letterSpacing 0.5 in Archery/Cycling/Road/TeamEvent, none in Lifting/Shooting/Precision<br>• `input`: paddingH 1.5 in Archery/Lifting/TeamEvent, plus tabular-nums in Shooting; 2 in Cycling/Road; 2.5 in Schedule/TeamBuilder<br>• `editor`: border 1/pad 2 (Shooting, Lifting); 2/2.5 (Archery, Cycling); 2/2 (TeamEvent)<br>• `name`: '800' in TeamEvent vs '700' elsewhere<br>• `sub`: tabular-nums in TeamEvent | 20 |
| 06-D21 | Sheet table styles | ResultsSheet 169-178 vs CombinedPanel 99-106 | A for `row`, `head`, `headTxt`, `entry`, `pos`, `gold`, `name`, `nameTxt` (8 keys) | `team` vs `small` (CombinedPanel adds `flexShrink`) and `sub` paddingLeft (34+22+4sp vs 34+2sp) are (B). CombinedPanel already imports from ResultsSheet. | 8 |
| 06-D22 | Commentary feed card | PrecisionInsights `FeedCard` 54-88 vs RaceDepth `CommentaryCard` 168-183 | B | Different row (tone dot + tag vs icon), paging (+15 vs show all), title. | 0 |
| 06-D23 | Late-loaded-entries effect | RaceDepth 61-67 vs D1 | B | Different store call (`getPhaseEntries`) and guard. | 0 |
| 06-D24 | Ranked athlete row (rank, name + team, medal counts, points) | ChampionsCard 84-91, AthleticsHub 188-194 | B | `st.mark` minWidth 40 vs 48. | 0 |
| 06-D25 | Sinclair vs Robi best-lifter rows | AthleticsHub 206-216 vs 227-237 | B | Sub-line text and value differ. | 0 |
| 06-D26 | Shooting final shot cells vs archery arrow boxes | ShootingPanel 296-300, ArcheryPanel 82-93, 58-79 | B | Different cells, styles and a11y. | 0 |

**Panels total (A): about 53 lines.**

### Elsewhere in components/ (from the three part-reviews, re-classed)

These rows are (A). I re-checked each one at the cited lines.

| ID | What | Locations | Why identical / where to keep it | Removable |
|---|---|---|---|---|
| 06-D27 | `initials(name)` | AddInvitePlayer 27-28, AwardPickerSheet 24-25, TournamentAwardsTab 28-29, MatchSummary 19-20, sports/cricket/index.tsx 1648-1649 (`nameInitials`) | Character-identical, fallback `'?'`. Export one copy from a components-level file, not from cricket.<br>**(B):** HostsCard 10-11 (fallback `'🤝'`) and `core/minorPrivacy.ts:46-53` `avatarInitials` (splits on whitespace and dots). Switching to `avatarInitials` is not (A); see C9. | 8 |
| 06-D28 | Form result colour / word maps | FormStrip.tsx 9-10, screens/HeadToHeadScreen.tsx 232, screens/TeamProfileScreen.tsx 480-481 | Same keys and values (only the names `COLOR` / `FORM_COLOR` / `RESULT_WORD` differ). Export them from FormStrip. | 3 |
| 06-D29 | Removable chip styles | CoHostPicker 196-198 (`hostChip`, `hostName`, `hostX`) ≡ DivisionsEditor 89-91 (`pill`, `pillText`, `pillX`); `head` and `link` identical in both (189-190 / 81-82) | Identical.<br>**(B):** `chips` (DivisionsEditor adds `alignItems`) and the "+ Add …" text. | 5 |
| 06-D30 | `pad` + `toISODate` | DateTimeField 26, 35; screens/CreateTournamentScreen.tsx 62-63 | Identical. Move to `core/dates.ts`. | 2 |
| 06-D31 | `pad` + `todayKey` | screens/CopyTournamentScreen.tsx 32-33, support/RegisterCheck.tsx 13-14 | Identical.<br>**(B):** EditTournamentScreen 42-43 and TournamentEditions 63-65 are inline variants, not separate helpers. Also see C10. | 2 |
| 06-D32 | `ordinal` | TeamEventResults 19 ≡ sports/volleyball/ServePanel.tsx 37 ≡ sports/recordHelpers.ts 7-11 | Same expression. Keep one in a core helper; `recordHelpers` imports `matchRecords`, so don't import it into components.<br>**(B):** `data/tournamentHistory.ts:265` (different formula), `golf/engine.ts:603` (adds " hole"), `teamTie.ts:196` / `conduct.ts:184` (n ≤ 3 only), MedalScoringEditor 15-18 / MedalTable 14-18 (unverified). | 1 |
| 06-D33 | `thruLabel` re-implemented | golf/GolfTeamBoard.tsx 47 ≡ data/golfLeaderboard.ts 231-234 | Same branches. Call `thruLabel(cur)`. | 1 |
| 06-D34 | `deburr` | sports/football/voiceCommands.ts 9-10 ≡ sports/voiceMatch.ts 9-10 | Identical. `VoiceNav.tsx:12` imports football's copy; importing `voiceMatch` instead is zero behaviour change and stops pulling the football voice module into VoiceNav's chunk. Football can reuse it too.<br>**(B):** `NUM_WORDS` (1–20 vs 1–15); see C11. | 2 |
| 06-D35 | `chips` row style `{flexDirection:'row', flexWrap:'wrap', gap:spacing(2)}` | about 163 copies in src (13 in golf/results here) | Identical (A), but a shared style replaces one line with one import, so the net saving is about 0. Not worth doing. | 0 |

These rows are (B). They are listed because people will want to merge them; none is counted.

| Item | Locations | The difference that blocks (A) |
|---|---|---|
| Bottom-sheet shell | AwardPickerSheet 58-115, QuickOptionsSheet 51-120, golf/GolfEntryAdminSheet 75-128 (+ FollowAlertsSheet, ContextSwitcher, DateTimeField, PhoneField, ConfirmSheet) | maxHeight 80/88/90%, maxWidth 520/560/640, placement, backdrop alpha `88`/`AA`/`#000A` |
| −/+ stepper | StructureEditor 118-138, MedalScoringEditor 126-149, LeaderMinimums 73-107, screens/Edit- 287-315, Create- 366-391, CreateSeries- 164-220 | zeroLabel, step (CreateSeries ±2), value minWidth 22–32, a11y labels, `Text onPress` vs buttons |
| Two-team stat header | GameFlowCard 52-55 + 84-96 vs sports/StatBar.tsx 33-58 vs netraid/CompareCard 41-44 + 98-114 | `val.width` 72 vs 92 |
| Team comparison rows | BoxScore 183-226 vs netraid/CompareCard 56-87 | CompareCard has `better:'lower'`, `sub`, DASH (see C5) |
| Person lookup flows | AddInvitePlayer 82-114, CoHostPicker 65-75, PersonPicker 53-89 | debounce, rate limit, email lookup, reported-not-me, catch (C6–C8) |
| Hand-built card surface (~60 sites) | e.g. LiveSettingsCard 143, OverlayPanel 173, golf/* | radius.md + `border` vs Card's radius.lg-4 + `surfaceAlt` + shadow (C12) |
| Sign-up details form | PhoneLoginCard 21-161 vs screens/AuthScreen 31-354 | validation differs (C13) |
| Copy / share fallback | OverlayPanel 101-107, TournamentTeamsScreen 186-195, RemindInstall 32-46 vs core/share.ts | error handling, notice vs inline, track() |
| Golf leaderboard tables | GolfLeaderboard 168-186 vs GolfTeamBoard 90-101 | name minWidth 108/120, num width 48/56 |
| Half-point text | SwissFieldPanel 17, chess/* (×5), PointsEditor 22, teamTie `fmtPts` | PointsEditor handles 0.5 only (C15) |
| Signed number | LeagueTable 16-17, standingsColumns 65, StandingsScreen 313, teamRecords 49 | hyphen vs true minus (C14) |
| Ordinal / medal emoji maps, sport label, StatTile, record-scope labels, list rows, checkbox rows, live dot | see the part reports | small style or text differences in each |

---

## 2. Drift that looks like a bug (C). None of these is removable.

**My part (results/ and athletics/):**

1. **C1. RoadPanel tie-break ordinal.**
   - `RoadPanel.tsx:262` builds the suffix by hand: `t.last === 1 ? 'st' : t.last === 2 ? 'nd' : t.last === 3 ? 'rd' : 'th'`.
   - So a last scorer in 21st gives "21th"; 11, 12 and 13 come out right.
   - The tested helper `ordSuffix` (`data/results/athletics.ts:615`) is already used by AthleticsCareer 59 and gives "21st".
2. **C2. Wind sign.**
   - `ResultsSheet.tsx:26` `windText` prints a true minus ("−1.2").
   - `CombinedPanel.tsx:85` (`${cell.wind > 0 ? '+' : ''}${cell.wind.toFixed(1)}`) and `AthleticsCareer.tsx:84` print a hyphen ("-1.2").
   - So the same wind reading looks different on the sheet, on the combined sheet and on the profile.
3. **C3. Small buttons below the touch target.**
   - Cycling's `SmallBtn` is 36×36 (`CyclingPanel.tsx:539`).
   - Road's identical component is 44×44 (`RoadPanel.tsx:312`), which is the SD-155 target.
4. **C4. AthleticsCareer tile label.**
   - `AthleticsCareer.tsx:120`: the label has no `textAlign:'center'`, unlike the other 5 career Tiles.
   - A wrapped label ("Finals") left-aligns. Cosmetic.

**From the part reviews (verified at the cited lines unless marked):**

5. **C5. BoxScore team comparison highlights the higher number even on lower-is-better rows.**
   - Where: `BoxScore.tsx:195-200` via `sports/boxScore.ts:281` `leaderOf`.
   - The CompareCard copy has `better:'lower'` (`netraid/feed.ts:117`).
6. **C6. CoHostPicker lookup has no `.catch`** (`CoHostPicker.tsx:71`). On a failure `searching` sticks; its siblings handle it.
7. **C7. CoHostPicker's own phone/email guess disagrees with the shared helper.** `looksPhone` (≥7 digits, any '@') at `CoHostPicker.tsx:22-23`, vs `core/contactQuery.ts` `looksLikeContact`.
8. **C8. PersonPicker doesn't block "reported not me" players** (`PersonPicker.tsx:58-89`); `AddInvitePlayer.tsx:91` does.
9. **C9. Initials copies split only on spaces.** `core/minorPrivacy.ts:46-53` also splits on '.', so masked names ("M.R.") differ: "M" vs "MR".
10. **C10. "Today" computed on the device clock** (TournamentEditions 63-65, RegisterCheck 13-14), and times shown in the device zone (golf/GolfTournamentHub 107/171, TournamentHistory 142).
    - The rest of the app uses `todayIn(zone)` / `formatDateTime(iso, tz)`.
    - "Run it again" can show a day early or late for a venue in another zone.
11. **C11. Voice number words.** `NUM_WORDS` goes to 20 in football (`voiceCommands.ts:12-16`) and to 15 in generic `voiceMatch.ts:12-15`. Needs a decision.
12. **C12. Card style left behind after the redesign.**
    - About 60 hand-made surfaces keep radius.md + `border`; `ui.tsx` Card has radius.lg-4 + `surfaceAlt` + shadow.
    - For example LiveSettingsCard 143, OverlayPanel 173, `screens/LiveScoringScreen.tsx:2787`.
13. **C13. Phone sign-up checks less than email sign-up** (high risk: minors / consent).
    - `PhoneLoginCard.tsx:86-89` and `supabase/functions/phone-login/index.ts:146-153` need only a guardian name + phone or email.
    - `AuthScreen.tsx:145-148` blocks US under-13s and requires a guardian email.
    - The DB trigger still raises US_UNDER_13, which phone-login turns into a generic error.
    - This was reported by part B; I did not re-read the edge function.
14. **C14. Goal-difference minus sign.** LeagueTable and standingsColumns print "-3"; StandingsScreen and teamRecords print "−3".
15. **C15. PointsEditor shows "1.5" where `halfText` shows "1½"** (`PointsEditor.tsx:22` vs `data/standingsColumns.ts:71-76`).
16. **C16. Small accessibility and visual drifts** (part B, unverified):
    - Error texts without `accessibilityRole="alert"`: LeaderMinimums, PersonPicker, LinkByPhoneCard, RequestsCard, WebPushCard.
    - Stepper buttons labelled bare "Fewer" / "More"; only LeaderMinimums names what changes.
    - The live dot is `primary` (green) in MiniScore and `danger` (red) everywhere else.

---

## 3. Lines removable (A only)

| Group | Removable |
|---|---|
| Career panels (D1–D7) | about 313 |
| Results panels (D8–D21) | about 53 |
| Elsewhere (D27–D34) | about 24 |
| History type in `data/results` (outside the slice) | 4 |
| **Total** | **about 394** |

Risk for all of it is low: display-only components and pure helpers. Nothing (A) touches a scoring engine, reducer, DB call or edge function. The bracket `apply()` copies (D17), which do touch results, are (B).

---

## 4. Coverage

**My part: all fully reviewed (every line).**

| File | Lines |
|---|---|
| ui.tsx | 470 |
| athletics/AthleticsCareer.tsx | 139 |
| athletics/AthleticsHub.tsx | 350 |
| results/AgeBasisNote.tsx | 94 |
| results/ArcheryCareer.tsx | 124 |
| results/ArcheryPanel.tsx | 477 |
| results/CarriedNote.tsx | 21 |
| results/ChampionsCard.tsx | 118 |
| results/CombinedPanel.tsx | 115 |
| results/CompetitionRulesCard.tsx | 43 |
| results/CrewCareer.tsx | 120 |
| results/CyclingCareer.tsx | 127 |
| results/CyclingPanel.tsx | 555 |
| results/EntriesPanel.tsx | 328 |
| results/EventOfficials.tsx | 73 |
| results/EventTrackCard.tsx | 82 |
| results/LiftingCareer.tsx | 145 |
| results/LiftingClock.tsx | 63 |
| results/LiftingPanel.tsx | 406 |
| results/PrecisionInsights.tsx | 360 |
| results/RaceDepth.tsx | 257 |
| results/RecordSync.tsx | 83 |
| results/RecordsSetCard.tsx | 55 |
| results/ResultsSheet.tsx | 186 |
| results/RoadPanel.tsx | 321 |
| results/ScheduleCard.tsx | 154 |
| results/ShootingCareer.tsx | 118 |
| results/ShootingPanel.tsx | 348 |
| results/TeamBuilder.tsx | 135 |
| results/TeamEventPanel.tsx | 280 |
| results/printPhase.ts | 58 |
| **Subtotal** | **6,205** |

**Part A (forked reviewer): 35 files, 4,564 lines, all fully reviewed.**
- AddInvitePlayer 337, AgeRequirementSetting 44, AnalyticsConsentBanner 49, AwardPickerSheet 125, BoxScore 266, CareerPassportCard 20, ChessCrosstable 189
- ClubQuickPick 86, CoHostPicker 205, ConfirmSheet 90, ConflictNotice 56, ConnectBoard 151, ContactCard 199, ContextSwitcher 71, CourtMap 92
- DateTimeField 421, DeclinedRequestsCard 73, DisciplineSettings 179, DisciplineTable 90, DivisionTabs 37, DivisionsEditor 92
- EntrantPicker 131, ErrorBoundary 61, EventCorrectionList 142
- FeederCards 151, FollowAlertsSheet 109, FollowBell 41, FormStrip 46, FormatEditor 167
- GameFlowCard 102, GuardianPendingCard 90, GuardianProofForm 100, GuestBar 41
- keyboard 440, keyboardMath 71

**Part B (forked reviewer): 36 files, 5,157 lines, all fully reviewed.**
- HostsCard 109, Icon 126, InviteQrShare 61
- LeaderMinimums 110, LeaderSplitChips 88, LeagueTable 89, LineScoreboard 125, LinkByPhoneCard 113, LinkReportsCard 62, LiveAnnouncer 51, LiveSettingsCard 157, LiveStream 113, Logo 30, LogoPicker 113
- Markdown 162, MatchCard 240, MatchHeader 93, MatchSummary 227, MedalScoringEditor 150, MedalTable 79, MineCard 43, MiniScore 91, MyCertificatesCard 53
- NearYouSection 178, OnboardingOverlay 179, OpenInAppBanner 53, OrgVerificationCard 129, OverlayPanel 185
- PersonPicker 205, PhoneField 250, PhoneLoginCard 186, PlayerFilters 190, PlayerPhoto 12, PointsEditor 184, PrizeCategories 159, ProfileView 762

**Part C (forked reviewer): 41 files, 4,880 lines, all fully reviewed.**
- QuickOptionsSheet 131, Rank 33, RegistrationBanner 41, RemindInstall 78, RequestsCard 119, ResultHoldNote 35
- Scoreboard 106, SectionHeader 44, SetupChecklist 47, SportSettingsButtons 68, SportSymbol 61, StatLeaderRail 86, StructureEditor 139, SwissFieldPanel 139
- TeamEventResults 111, TeamTieView 308, TieSetup 160, TimeZonePicker 67, TournamentAwardsTab 340, TournamentDetailsFields 199, TournamentEditions 88, TournamentHistory 236, TournamentRecords 85
- VenueField 55, VerificationChecklist 77, VoiceNav 115, WebPushCard 73
- golf/GolfCareerDepth 53, GolfCourseEditor 194, GolfEntryAdminSheet 132, GolfHandicapCard 84, GolfHoleStats 114, GolfLeaderboard 194, GolfRoundDeep 70, GolfScorecard 122, GolfTeamBoard 105, GolfTournamentHub 202, GolfTrackCard 93, LiveGolfCards 66
- overlay/ScoreOverlay 337, support/RegisterCheck 73

**Total: 143 files, 20,806 lines, all reviewed.**

Caveats:
- Outside the slice, files were read only in excerpts, to confirm matches: SportProfileScreen, ResultsEventScreen, AuthScreen, the cricket and football voice files, StatBar, CompareCard, and the stepper screens.
- The part reviews' (B) list and C13–C16 were not all re-read by me; they are marked where unverified.
