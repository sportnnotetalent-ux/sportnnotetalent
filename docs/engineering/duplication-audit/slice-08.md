# Slice 8 — src/screens/ N–Z (+ non-letter) — duplicate audit

Scope (per the coordinator's scope change): **duplicated code only**, every finding classified strictly:
- **(A)** removable with zero behaviour change (provably identical output, UI, text, styles, a11y, side effects);
- **(B)** not identical: leave it, exact difference listed;
- **(C)** drift that looks like a bug: finding only, not removable.

"Lines removable" counts (A) only. All line numbers verified by reading the files.

Bundle note that applies throughout: every screen in this slice is its own `lazyScreen(() => import(...))` chunk in `src/navigation/RootNavigator.tsx` (checked for the ones named below). The seven event-setup screens (Archery, Combined, Crew, Cycling, Road, Shooting, Weightlifting) are imported **statically** by `AthleticsEventSetupScreen.tsx:46-52`, so all eight live in one chunk: a shared module used only by them adds nothing to any other sport's download.

---

## 1. Duplicate findings

### S8-D1 (A): event-setup "teams / houses" sources loader, 8 copies
- Kind: exact (one copy has 2 lines in a different order plus a comment)
- Locations (the `useState<Source[]>` + `useEffect` block, `[tournamentId, players]` deps):
  - `src/screens/ArcheryEventSetup.tsx:64-88`
  - `src/screens/AthleticsEventSetupScreen.tsx:194-219`
  - `src/screens/CombinedEventSetup.tsx:83-107`
  - `src/screens/CrewEventSetup.tsx:72-96`
  - `src/screens/CyclingEventSetup.tsx:103-127`
  - `src/screens/RoadEventSetup.tsx:108-132`
  - `src/screens/ShootingEventSetup.tsx:65-89`
  - `src/screens/WeightliftingEventSetup.tsx:61-85`
  - plus 8 identical `interface Source { key; name; colorHex?; teamId?; playerIds }` (Archery:39, Athletics:61, Combined:37, Crew:37, Cycling:38, Road:41, Shooting:40, WL:36) and 8 identical `const playerById = useMemo(() => new Map(players.map(...)), [players])` (Archery:89, Athletics:222, Combined:108, Crew:97, Cycling:128, Road:133, Shooting:90, WL:86)
  - plus 6 identical `teamOf = (pid) => { const s = sources.find(...) ... }` (Archery:90, Combined:109, Cycling:129, Road:134, Shooting:91, WL:87). Athletics:223-224 does the same through `sourceOf`, with identical output. Crew:99 has a different signature (`teamOf(s?: Source)`): **B**, keep it.
- Diff (verified by `diff`): 7 copies are byte-identical. Athletics creates `byName` before awaiting `getTeamRosters` (the other copies do it after) and adds a comment. Creating an empty Map before or after the await changes nothing.
- Lines: about 8 × 27 = 216 + teamOf 6. **Removable: about 170.** One hook, e.g. `useEventSources(tournamentId, players)` returning `{ sources, playerById, teamOf }`, in a new `src/data/useEventSources.ts`. Do **not** swap in `src/data/useMeetEntries.ts:55-82`. Its loop body is the same 18 lines (a 9th copy), but it calls `getPlayers()` instead of the `usePlayers()` array, uses `try/finally` and keeps a `loading` flag (**B**). Only a pure `buildSources(teams, rosters, players)` could be shared with it, and that part is also (A).
- Risk: low. Display/data plumbing only, no scoring engine.
- Recommendation: consolidate.

### S8-D2 (A): event-setup base style sheet, 8 copies
- Kind: exact
- The entries `safe`, `content`, `card`, `wrap`, `label` and `input` (4 lines) have identical values in all 8 files: Archery:287-297, Athletics:601+, Combined:249+, Crew:362+, Cycling:343+, Road:320-331, Shooting:323-333, WL:223-237 (the clone list's "1 window ×5" entry at Archery:280 / Athletics:594 / Cycling:336 / Shooting:316 / WL:216 is the start of this block).
- Extra entries that differ (keep them local): Road and Athletics `row`; WL `head`, `name`, `pickRow`, `remove`.
- Lines: about 72. **Removable: about 54.** Use one `eventSetupBase` object in `src/components/results/` that each `StyleSheet.create({ ...eventSetupBase, ...own })` spreads. The values are identical, so rendering is unchanged.
- Risk: low. Recommendation: consolidate (together with D1).

### S8-D3 (A): team-of-3 "member scores" lookup effect, Archery and Shooting
- `src/screens/ArcheryEventSetup.tsx:123-129` vs `src/screens/ShootingEventSetup.tsx:126-132` (`srcKeys` + `memberScoresFrom(srcKeys)` effect): identical 7 lines. `suggest` (Archery:133 / Shooting:134) has the same body (only the parameter type differs).
- Not identical (**B**): the `teamSourceEvents` filter effect (Archery filters on mixed / gender; Shooting also on `shots`), `best` (Archery passes gender + a mixed flag, 2 or 3 seats; Shooting 3), `fillAll` (seat count), and the reset deps (`[mode, gender]` vs `[team3, gender, evKey]`).
- **Removable: about 7.** Risk: low.

### S8-D4 (B, plus one C): event-setup player-pool memo and picker card
- `pool` useMemo: Archery:96-102, Combined:116-123, Crew:113-118, Cycling:135-141, Road:141-148, Shooting:97-103, WL:93-100, Athletics:244-249.
- Differences: `.slice(0, 60)` (Archery, Shooting, WL, Crew, Athletics) vs `.slice(0, 80)` (Combined, Cycling, Road). Eligibility: gender only (Archery, WL), `team ||` bypass (Shooting, mixed team, intentional), `cat` + meet-age basis (Cycling, Road, Combined). Athletics filters undefined values earlier.
- Picker card JSX (Road:270-283, Shooting:265-278, WL:170-182 and the others): the empty text differs per sport ("No runners / shooters / lifters match…").
- **C, see S8-C2:** `base` in Combined:119 falls back to `players` when the meet has no sources; the other 7 do not.
- Recommendation: leave as is. These are intentional per-sport differences (the slice size looks accidental, but changing it changes the UI).

### S8-D5 (A): roster/student import date-order notice and style sheet
- Kind: exact
- `src/screens/RosterImportScreen.tsx:149-158` vs `src/screens/StudentImportScreen.tsx:226-235` (missing-Name warning, the ambiguous-dates card with Day first / Month first chips, the "Dates read … (the file says so)" link): identical 10 lines. Also `otherOrder` (Roster:120 / Student:145) and the full style sheet (Roster:190-198 / Student:299-307), 7 identical entries.
- Not identical (**B**): `chooseFile` (`pickTextFile('.csv,…')` and an "xlsx" error vs `pickSheetFile()` with `f.error` and a different message); the paste `TextField` (placeholder `ROSTER_TEMPLATE(...)` vs `STUDENT_TEMPLATE(..., scopeKind)`); the template button (file name); the privacy line (`Text` with org/team wording vs `IconText` with different wording); the footer `done` text.
- Lines: 2 × 18 = 36. **Removable: about 15.** Make a `DateOrderNotice({ parsed, forceOrder, setForceOrder })` component (e.g. `src/components/DateOrderNotice.tsx`). Bundle: one tiny module shared by two lazy chunks.
- Risk: low.

### S8-D6 (A, small) / (B): code-link landing pages (SchoolRequest, GuardianConsent, OrgConfirm)
- The clone list entry `GuardianConsentScreen.tsx:126 <> SchoolRequestScreen.tsx:106` checks out: the `TextField label="Code" … placeholder="e.g. 7KQ2-XH9M-…"`, `FormError` and `Button "Continue"` lines (SR:106-108 / GC:126-128) are identical (**A**). The line above differs: "Enter the code from the school's email." vs "Enter the code from the email we sent you." (**B**).
- Style sheet: `safe`, `content`, `gap`, `row` and `flex` are identical (SR:117-121 / GC:137-141, **A**). SR adds `bold`.
- `check()` (SR:35-40 / GC:43-48): same body, but each calls a different preview function (`previewSchoolRequest` vs `previewGuardianConsent`) (**B** as written; (A) only if parameterised).
- OrgConfirm:78-83 (**B**): wrapped in a `Card`, different text and a different placeholder. Its `check` also prefills the name.
- **Removable: about 8.** Low value.

### S8-D7 (A): screen-local copies of `openMatchViewer` (LiveScoring navigation)
- `src/navigation/openMatch.ts:9-17` already has the exact payload with `canScore: false`. Screen copies with the same `matchId, sport, homeName, awayName, homeTeamName, awayTeamName, homeColor, awayColor` payload:
  - `canScore: false`, identical to the helper: `SportProfileScreen.tsx:181-187`, `NotificationsScreen.tsx:80-86`, `CalendarScreen.tsx:110-117` (outside the slice)
  - `canScore` from `canScoreByRole(profile?.role)`, identical to each other: `SportHubScreen.tsx:74-81`, `TryNewSportScreen.tsx:54-61`, `HomeScreen.tsx:138-145` (outside the slice)
  - other `canScore` expressions, payload otherwise identical: `TeamProfileScreen.tsx:183-189` (inline `canScoreByRole`, plus the tie branch), `SwissRoundScreen.tsx:125-129` (`canEdit`, `as never` cast), `SeriesScreen.tsx:85-94` (the tie rule), `ScheduleMatchScreen.tsx:365-371` (`created.*`, `canScore: true`)
- An optional third parameter `openMatchViewer(nav, m, canScore = false)` keeps the existing callers byte-identical. Every copy above then becomes one call with the same payload, so all of them are (A).
- Lines: about 10 × 7 = 70. **Removable: about 50.** Bundle: `openMatch.ts` is a 17-line module already imported by `TournamentProfileScreen` and `TeamJourneyScreen`, so the effect is negligible.
- Risk: low.

### S8-D8 (A) / (B): "my player id" effect
- **(A)** One-liner `useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id])`, identical in `StandingsScreen.tsx:105`, `SeriesScreen.tsx:52`, `CreateClubScreen.tsx:32`, `AmericanoScreen.tsx:39`, `core/orgContext.tsx:56`. The same logic in multi-line form: `TournamentProfileScreen.tsx:148-153`, `CreateCommunityScreen.tsx:31-35`, `BracketScreen.tsx:110-114` (read).
- **(B)** Different shape, so keep: `SwissRoundScreen.tsx:46` (adds `.catch(() => {})`); `RecordBoardScreen.tsx:42` and `MeetTimetableScreen.tsx:66` (`.then(setMe).catch(...)`, no unmount guard); `SportHubScreen.tsx:86` (conditional); `SquadScreen.tsx:53` (no guard, no catch); `ResultsEventScreen.tsx:118` (`.catch(() => setMe(null))`); `OrganizationScreen.tsx:95`, `SettingsScreen.tsx:84` and `ProfileScreen.tsx:30-32` (inside focus effects, with other loads).
- **Removable: about 12** (a `useMyPlayerId(profileId)` hook in `src/data/hooks` that returns the same `null` initial state with the same deps).

### S8-D9 (A): player edit-access effect
- `SportProfileScreen.tsx:125-136` vs `PlayerProfileScreen.tsx:30-37`: `useFocusEffect` → `getMyPlayerId(profile?.id).then((id) => getPlayerEditAccess(playerId, id)).then(on && setAccess).catch(on && setAccess('none'))`, same deps `[profile?.id, playerId]`. Identical logic; only a local variable is named differently (`id` / `me`).
- **Removable: about 7** (a `usePlayerEditAccess(playerId)` hook). `SquadScreen.tsx:78` (per player, inside a load) is **B**.

### S8-D10 (A): full-screen "Loading…" placeholder
- Identical 5-line JSX: `<SafeAreaView style={st.safe} edges={['bottom']}><Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text></SafeAreaView>`. Found at `OrganizationScreen.tsx:300-304`, `TournamentProfileScreen.tsx:473-477`, `SportProfileScreen.tsx:153-157`, `SquadScreen.tsx:146-150`. All four `st.safe` values are identical.
- **B:** `CompetitionRulesScreen.tsx:126` and `CorrectMatchScreen.tsx:109` (outside the slice) have no `edges` prop. The existing `LoadingState` component (`components/ui.tsx:46`) renders differently. Do not substitute it.
- **Removable: about 10** (a tiny `ScreenLoading` component).

### S8-D11 (A): team squad = rosters of every sport, de-duplicated
- `TeamProfileScreen.tsx:87-90` vs `SquadScreen.tsx:72-75`: `Promise.all(t.sports.map((sp) => getRoster(t.name, sp, t.id)))` then a `Map` keyed by id (last one wins). Identical result.
- **Removable: about 6** (a `getTeamSquad(team)` in `src/data/repos` or next to `getRoster`).

### S8-D12 (A): team colour palettes
- 6-colour `['#FF5C5C','#4DA3FF','#3DDC97','#FFB454','#B98AFF','#FF8AC4']`, identical in `TournamentTeamsScreen.tsx:54`, `TeamsScreen.tsx:26`, `OrganizationScreen.tsx:216` (local `palette` for houses) and `JoinTournamentScreen.tsx:28` (outside the slice).
- 8-colour `['#FF5C5C','#4DA3FF','#4CD964','#FFD60A','#BF5AF2','#FF9F0A','#5AC8FA','#FF375F']`, identical in `ScheduleMatchScreen.tsx:55` and `QuickTournamentScreen.tsx:36`.
- **B** (different values, keep): `OrganizationScreen.tsx:54` `TEAM_COLORS`, `EditTeamScreen.tsx:26` (8, a different tail), `ContingentsScreen.tsx:22` (10), `CreateClubScreen.tsx:25` (a different order).
- **Removable: about 5.** Put the two constants in `src/core/theme.ts` or a `core/palettes.ts`.

### S8-D13 (A): `shortFrom` (auto short code)
- `ScheduleMatchScreen.tsx:56-60` vs `QuickTournamentScreen.tsx:42-45`. One trims before `split(/\s+/)`; both `filter(Boolean)`, so the tokens are the same for every input, and the fallback uses the untrimmed `name` in both. Identical output.
- **B:** `OrganizationScreen.tsx:1128-1129` `autoShort` (no fallback, slices to 3) and the crest initials at `TeamProfileScreen.tsx:213`.
- **Removable: about 4.**

### S8-D14 (A): local-date ISO helper
- `QuickTournamentScreen.tsx:46` `isoDay`, `GenerateFixturesScreen.tsx:60` `isoDay`, `core/age.ts:70` `iso` (not exported): identical expression.
- **Removable: 2** (export one from `core/age.ts` or `core/time.ts`).

### S8-D15 (A): ordinal suffix in ResultsEventScreen
- `ResultsEventScreen.tsx:1431` `ord` is character-for-character the `ordinal` exported at `src/data/results/weightlifting.ts:310`. That module is re-exported by `data/results/index.ts:14`, which ResultsEventScreen already imports, so there is no bundle change.
- **B (not proven identical):** other ordinal helpers use a different formula (`sports/volleyball/ServePanel.tsx:37`, `components/TeamEventResults.tsx:19`, `sports/recordHelpers.ts:7`, `sports/baseball/engine.ts:399`, `data/tournamentHistory.ts:265`, `components/MedalTable.tsx:16`, `components/MedalScoringEditor.tsx:16`).
- **Removable: 1.**

### S8-D16 (A): chess half-point text
- `String(n).replace('.5','½').replace(/^0½$/,'½')` appears at `SwissRoundScreen.tsx:162` and `:164` (inline), `sports/chess/index.tsx:43` and `:56`, `sports/chess/engine.ts:452` and `components/SwissFieldPanel.tsx:17`. It is already exported as `halfText` at `sports/chess/repertoire.ts:100`.
- **B:** `sports/chess/roundSheet.ts:159` (`undefined` gives `''`) and `data/standingsColumns.ts:71` `halfText` (a different algorithm: `−½`, `toFixed(2)`). They differ for some inputs.
- Bundle caution: `repertoire.ts` imports `./openings.ts` (`ECO_VOLUME`). Do not make SwissRoundScreen or `chess/index.tsx` import `repertoire.ts`. Move `halfText` to a tiny module (e.g. `sports/chess/half.ts`) and have `repertoire.ts` re-export it.
- **Removable: about 4.**

### S8-D17 (A): verification decision messages
- `VerificationReviewScreen.tsx:57` vs `SupportConsoleScreen.tsx:163` (`☑️ Approved / ✗ Sent back — X has been notified.`), and `VerificationReviewScreen.tsx:92` vs `SupportConsoleScreen.tsx:159` (`✓ X verified — its admins have been told.` / `X sent back — …`): identical template strings.
- **Removable: about 2** (two message helpers exported from VerificationReviewScreen, which SupportConsole already imports from).

### S8-D18 (A): "● Live: …" line under a group table
- `TournamentProfileScreen.tsx:1124` vs `StandingsScreen.tsx:454`: the same `gv.live.map((m) => …).join(' · ')` expression, and the `liveLine` style is identical (TP:1252 / Standings:521).
- **B:** the `groupViews` map memo (TP:428-433 vs Standings:80-85): Standings scopes the matches to the division.
- **Removable: about 1.**

### S8-D19 (A): segmented control styles
- `TournamentProfileScreen.tsx:1239-1243` vs `DiscoverScreen.tsx:373-377`: 5 identical entries. **B:** `MatchesScreen.tsx:155-160` (`segBtn` adds `flexDirection: 'row'`, `justifyContent`, `gap`).
- **Removable: about 4** (style only; low value).

### S8-D20 (A, expression level, 0 lines): small repeats inside one file
- `ResultsEventScreen.tsx:912` and `:927`: the medal ternary with a `${a.position}.` fallback equals `medalIcon(a.medal) || \`${a.position}.\`` (`data/results/teamResults.ts:144`, already imported through `data/results`). Line 919 (no fallback, `a.medal` filtered to a truthy value of type `Medal`) equals `medalIcon(a.medal)`.
- `SportProfileScreen.tsx:259`, `:281`, `:295`, `:297`: `stats.recent.filter((l) => l.sport === 'golf')` inside the `sport === 'golf'` branch equals the existing `history` (line 173).
- `ResultsEventScreen.tsx:363`, `:465`, `:469`, `:580`, `:586`: the `setPhase({ ...phase, format: { ...phase.format, results: { ...f, X } } })` pattern (a helper would be identical).
- Email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`: `OrgVerifyScreen.tsx:200` and `:233`, `AuthScreen.tsx:146`, `core/hosts.ts:83`, `core/contactQuery.ts:5`. No exported helper exists; an `isEmail()` would be identical.
- **Removable: 0 lines** (readability only).

### S8-D21 (B): leave as is, listed so nobody merges them
| What | Locations | Exact difference |
|---|---|---|
| Event-setup screen skeleton (footer `Button`, `ScreenTitle`, `CarriedNote`, `CompetitionRulesCard`, `ScheduleCard`, `EventOfficials`) | Road:192-317, Shooting:198-320, WL:138-220 (+ the other 5) | Button labels ("Create race / event & start list / weigh-in list"), emoji titles, `who=` nouns, `ScheduleCard` props (plan, discipline) |
| Weightlifting `kgOf` vs ResultsEvent `num` | WL:39, ResultsEventScreen:94 | `num` also maps `'−'` to `'-'` |
| `resolveMe` | TournamentTeams:303-307, ScheduleMatch:251-256 | guard `profile?.id` vs `profile?.fullName`; name fallback `'Me'` vs `allPlayers` lookup |
| `playerInvite` | TournamentTeams:309-313, ScheduleMatch:277-281 | `sportName` always vs only if sport is set; link `tournamentLink(id)` vs `SHARE_BASE` fallback |
| Copy-link helpers | TournamentTeams:186-196, `components/OverlayPanel.tsx:101-106`, `core/share.ts:16-31` | `setCopied` vs a 2.5 s reset; AbortError handling; notices |
| `canEdit` vs `canManage` | ResultsEventScreen:170-171 vs :174 | intentional: `canManage` excludes event hosts |
| `StatusChips` vs `SwimStatusChips` | ResultsEventScreen:1298-1317 vs :1241-1281 | different status sets and onPress semantics |
| Stat tiles | SportProfile `Stat` :601-630, TeamProfile `Stat` :471-478, OrganizerDashboard `Metric` :125-132, Passport `Tile` :163-170 | different props, styles and coverage behaviour |
| Follow row | TournamentProfile:652-660, TeamProfile:226-234 | labels "+ Follow tournament" vs "+ Follow team"; `type` |
| Reject-reason pickers | VerificationReview `Submission` :150-156, `OrgReview` :257-261, `GuardianProofReview` :319-322 | reason lists, labels, placeholders, and how the field shows a picked chip (see C3) |
| Sport tile grids | Personalise:145-157 + styles :346-350, TryNewSport:82-98 + styles :164-172 | `accessibilityRole` checkbox vs button; the active text adds `fontWeight '800'` |
| Country names | Personalise:326, `core/phone.ts:192` | 'UAE' vs 'United Arab Emirates', 'UK' vs 'United Kingdom', 'USA' |
| Header share button | TournamentProfile:159-178 | the only copy in the slice |
| Ownership history / transfer UI | TournamentProfile:956-993 | the only copy in the repo (grep) |

---

## 2. Drift findings (C): look like bugs; not removable

- **S8-C1, privacy (most important):** the guest "members only" gate differs between the two player pages.
  - `PlayerProfileScreen.tsx:49`: `if (isGuestSession(authed) && guestSeesMembersOnly(player))`. `core/minorPrivacy.ts:22-27` also returns true for `p.restricted`.
  - `SportProfileScreen.tsx:139-140`: `if (player && isGuestSession(authed) && (guestAge === undefined || guestAge < 18))`. **There is no `restricted` check**, so a guest who opens a restricted adult's per-sport page (`/SportProfile`) sees their stats, while the main profile hides them. (The copy text also differs.)
- **S8-C2, event-setup pool:** `CombinedEventSetup.tsx:119` reads `… : sources.length ? sources.flatMap(…) : players`. Archery:99, Crew:116, Cycling:138, Road:144, Shooting:100, WL:96 and Athletics:247 read `… : sources.flatMap(…)`. With a meet that has no teams and players without house names, the combined-event screen lists everyone, while the other seven show "No … match" until a name is typed. One got the fallback and the others did not.
- **S8-C3, reject reason not trimmed:** `VerificationReviewScreen.tsx:292` calls `decideGuardianProof(g.id, approve, approve ? undefined : reason)`, while `Submission` (:123) and `OrgReview` (:190) send `reason.trim()`. The guardian `TextField` (:322) also shows the chip's text, while the other two blank the field when a preset reason is picked (:156, :261). Minor.
- **S8-C4, avatar initials:** `TeamProfileScreen.tsx:423` builds squad avatars with `p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)`. `SquadScreen.tsx:200` uses `avatarInitials()` (`core/minorPrivacy.ts:46`: strips dots, uppercases, falls back to `'?'`). The same squad shows "A." on the team page and "AK" on the squad page for a name shown as "A. K.". Minor.

---

## 3. Totals

- Duplicate findings: 21 (D1–D21), of which (A) with removable lines: D1–D3, D5–D19.
- **Estimated removable lines, (A) only: about 360** (D1 170, D2 54, D7 50, D5 15, D8 12, D10 10, D6 8, D3 7, D9 7, D11 6, D12 5, D13 4, D16 4, D19 4, D14 2, D17 2, D15 1, D18 1). The two event-setup items (D1 + D2) are 224 of it.
- Drift findings: 4 (C1 privacy gate, C2 pool fallback, C3 untrimmed reason, C4 initials).

---

## 4. Coverage

All files in the slice were read in full (every line). Lines counted with `wc -l`.

| File | Lines | Reviewed |
|---|---:|---|
| OrgConfirmScreen.tsx | 93 | reviewed |
| OrgDobsScreen.tsx | 128 | reviewed |
| OrgVerifyScreen.tsx | 278 | reviewed |
| OrganizationScreen.tsx | 1255 | reviewed |
| OrganizeScreen.tsx | 227 | reviewed |
| OrganizerDashboardScreen.tsx | 152 | reviewed |
| OverlayScreen.tsx | 145 | reviewed |
| NotificationPrefsScreen.tsx | 101 | reviewed |
| NotificationsScreen.tsx | 193 | reviewed |
| PassportScreen.tsx | 185 | reviewed |
| PersonaliseScreen.tsx | 359 | reviewed |
| PlayerProfileScreen.tsx | 88 | reviewed |
| PrivacyScreen.tsx | 190 | reviewed |
| ProfileScreen.tsx | 94 | reviewed |
| QuickTournamentScreen.tsx | 217 | reviewed |
| RecordBoardScreen.tsx | 197 | reviewed |
| RegionSettingsScreen.tsx | 125 | reviewed |
| ResultsEventScreen.tsx | 1698 | reviewed |
| ResultsLabScreen.tsx | 102 | reviewed |
| RoadEventSetup.tsx | 331 | reviewed |
| RosterImportScreen.tsx | 198 | reviewed |
| ScanQRScreen.tsx | 105 | reviewed |
| ScheduleMatchScreen.tsx | 748 | reviewed |
| SchoolRequestScreen.tsx | 123 | reviewed |
| SeriesScreen.tsx | 213 | reviewed |
| SettingsScreen.tsx | 199 | reviewed |
| ShootingEventSetup.tsx | 333 | reviewed |
| SportHubScreen.tsx | 224 | reviewed |
| SportProfileScreen.tsx | 656 | reviewed |
| SportSettingsScreen.tsx | 178 | reviewed |
| SquadScreen.tsx | 318 | reviewed |
| StandingsScreen.tsx | 531 | reviewed |
| StudentImportScreen.tsx | 307 | reviewed |
| SupportConsoleScreen.tsx | 332 | reviewed |
| SupportScreen.tsx | 220 | reviewed |
| SwissRoundScreen.tsx | 225 | reviewed |
| TeamJourneyScreen.tsx | 88 | reviewed |
| TeamProfileScreen.tsx | 521 | reviewed |
| TeamsScreen.tsx | 185 | reviewed |
| TournamentProfileScreen.tsx | 1261 | reviewed |
| TournamentTeamsScreen.tsx | 764 | reviewed |
| TryNewSportScreen.tsx | 177 | reviewed |
| VerificationReviewScreen.tsx | 445 | reviewed |
| WeightliftingEventSetup.tsx | 237 | reviewed |
| **Total (44 files)** | **14,746** | |

No file in `src/screens/` starts with a non-letter, and `src/screens/` has no subfolders.

Read outside the slice for comparison, partially: ArcheryEventSetup (1-140, 260-297), AthleticsEventSetupScreen (46-99, 192-225), CombinedEventSetup (105-140), GuardianConsentScreen (in full), `data/useMeetEntries.ts` (1-82), `core/share.ts` (1-60), `navigation/openMatch.ts`, `core/minorPrivacy.ts` (22-53), `data/standingsColumns.ts` (68-76), and the copies found by grep in Home, Calendar, Bracket, CreateCommunity, Discover and Matches.
