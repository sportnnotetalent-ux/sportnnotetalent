# Slice 07: `src/screens/` A–M (65 files, 19,118 lines)

Read-only audit. No repo file was changed. **Scope change (coordinator):** only duplicated code is reported, and every finding is strictly classified:

- **(A) Removable with zero behaviour change.** Every copy gives identical output, UI, text, styles, a11y labels, side effects and replay. Only (A) counts toward "lines removable".
- **(B) Not identical. Leave it.** The exact difference is listed.
- **(C) Drift that looks like a bug.** This is a finding only, not removable.

Dead code, performance and long-function notes are dropped.

How the work was split: I read 45 files (8,544 lines) line by line. Two helper reviewers each read a block in full: **07-L** took LiveScoring, GenerateFixtures, Bracket and the Golf screens (5,745 lines), and **07-H** took Auth, EditProfile, Home, Discover, Calendar, HallOfFame, Meet*, Matches, MatchSquad, ImportSchedule, HeadToHead and Certificate(s) (4,829 lines). I re-checked their (A) claims against the code where marked ✔. Items marked "(per 07-L/H)" were not re-verified by me.

Bundle note: all eight event-setup screens are statically imported by `AthleticsEventSetupScreen.tsx:46-52`, which is one lazy chunk (`navigation/RootNavigator.tsx:97`). Sharing code between them does not change any download. The other screens are core-app stack screens, not per-sport chunks.

---

## (A) Removable with zero behaviour change

| ID | What | Locations (all copies) | Lines involved / removable | Why provably identical, and how to consolidate |
|---|---|---|---|---|
| 07-A1 | Event-setup "teams / houses" source loader (`useEffect` that builds `sources` from tournament teams + rosters, else player house names) | `ArcheryEventSetup.tsx:64-88`, `CyclingEventSetup.tsx:103-127`, `CombinedEventSetup.tsx:83-107`, `CrewEventSetup.tsx:72-96`, `AthleticsEventSetupScreen.tsx:195-220`, `RoadEventSetup.tsx:108-132`, `ShootingEventSetup.tsx:65-89`, `WeightliftingEventSetup.tsx:61-85` | ~200 / **~170** | ✔ Seven copies are byte-identical after trimming indentation (same md5). The Athletics copy creates `byName` one line before the `await getTeamRosters` and adds a comment. Nothing reads `byName` between those lines, so the result is the same. Move it into one `useEventSources(tournamentId, players)` hook in `src/components/results/` (next to `TeamBuilder.tsx`) or `src/data/`. Same deps `[tournamentId, players]`, same `on` cancel guard. |
| 07-A2 | `interface Source {key,name,colorHex?,teamId?,playerIds}` | the same 8 files: `Archery:39`, `Cycling:38`, `Combined:37`, `Crew:37`, `Athletics:61`, `Road`, `Shooting`, `Weightlifting` | 8 / **8** | ✔ Field for field the same as the exported `TeamSource` (`components/results/TeamBuilder.tsx:13`). Type only, so nothing changes at runtime. Import `TeamSource`. |
| 07-A3 | `teamOf(pid)` → `{id: teamId, name, colorHex}` of the source holding the player | `Archery:90`, `Cycling:129`, `Combined:109`, `Road:134`, `Shooting:91`, `Weightlifting:87`; `Athletics:223-224` (via `sourceOf`, same expression) | 7 / **~6** | ✔ Same `sources.find(...)`, same return shape. Crew's `teamOf(s?: Source)` (`Crew:99`) takes a different argument, so it is not included. Put it in the A1 hook's return. |
| 07-A4 | Candidate-pool base (`src`/`q`/`base`/`uniq` lines of the entrant pool) | `Archery:97-100`, `Cycling:136-139`, `Road:142-145`, `Shooting:96-99`, `Weightlifting:92-95`, `Crew:115-117` (inside `pool(src)`), `Athletics:245-248` | 28 / **~21** | ✔ The first six are identical. Athletics drops nullish entries before the `Map` dedupe instead of after, which gives the same list in the same order. Only the **filter predicate and `.slice(n)` that follow differ** (see 07-B1), so share only the `uniq` builder (`candidatePool(src, q, sources, players, byId)`). **Combined (`:117-120`) is excluded**: it differs (see 07-C6). |
| 07-A5 | Entrant filter row + search box: `<SelectChip label="All" …/>` + `sources.map(<SelectChip … dotColor … />)` + `<TextInput … placeholder="Search any player by name" … accessibilityLabel="Search players" />` | `Archery:249-253`, `Cycling:301-305`, `Combined:224-228`, `Athletics:447-451`, `Crew:253,257-260` (the search box sits above the row; keep the call order), `Road:~270-274`, `Shooting:~265-269`, `Weightlifting:~170-174` | ~40 / **~30** | ✔ grep finds the same two-line "All + sources" pair in all 8, and the same TextInput line (same style, see A7). A `SourceFilterChips` component and a `PlayerSearchInput` keep the same tree. The eligible-only chip that follows differs (07-B2), so leave it inline. |
| 07-A6 | "Same player in two teams" check | `Archery:157-158`, `Cycling:167-168`, `Shooting:161-162` | 6 / **~4** | ✔ Identical, including the message `${nameOf(twice)} is in two teams.`. The `open`-seat message just above differs per sport, so it stays. |
| 07-A7 | Event-setup style sheet core: `safe`, `content`, `card`, `wrap`, `label`, `input` (4 lines) | all 8 setups, e.g. `Archery:288-296`, `Cycling:344-352`, `Combined:250-259`, `Crew:363-374`, `Athletics:602-611` | ~72 / **~63** | ✔ Each key has the same value in all 8, and `input` has the same md5 in all 8. Export `eventSetupStyles` and spread it into each local sheet (local extras like `row`, `crew` and `relay` stay). |
| 07-A8 | Local "YYYY-MM-DD of a Date" helper and `isValidISODate` | `CreateTournamentScreen.tsx:62-69` (`pad`, `toISODate`, `isValidISODate`), `EditTournamentScreen.tsx:39-44` (inline), `CopyTournamentScreen.tsx:32-33` (`todayKey`), `GenerateFixturesScreen.tsx:60`, `QuickTournamentScreen.tsx:46`, `components/DateTimeField.tsx:26,35`, `core/age.ts:70`, `components/TournamentEditions.tsx:64-66` | ~22 / **~13** | ✔ All of them format local `getFullYear()-MM-DD` with 2-digit padding. `padStart` and a local `pad()` give the same string. The two `isValidISODate` copies produce identical output. Export `localIsoDay(d)` + `isValidIsoDay(s)` from `src/core/time.ts`, which already has a private `pad2` (`:257`). `core/time` is already in the main bundle. |
| 07-A9 | Start/End `DateField` row | `CreateTournamentScreen.tsx:266-269`, `EditTournamentScreen.tsx:221-224` | 8 / **4** | ✔ Same JSX, same labels, and `st.row`/`st.flex` are identical in both sheets. Copy's row (`CopyTournament:161-164`) uses `changeStart`, so it is **B**. |
| 07-A10 | Host picker (Myself chip + organisable orgs) and the host-name fallback | `CreateTournamentScreen.tsx:232-238` + `:187`; `CopyTournamentScreen.tsx:169-175` + `:130` | 16 / **~7** | ✔ Same FieldLabel, chip labels (`🙋 Myself (${myName})`, `🏛️ ${o.name}`) and `st.chips` values. The fallback is `chosenOrg ? chosenOrg.name : (myName \|\| profile?.fullName \|\| 'Organiser')` in both. The hint text under Create's picker is not part of the shared block. |
| 07-A11 | Code-link page: `check(code)` preview loader + page styles | `GuardianConsentScreen.tsx:43-49` vs `SchoolRequestScreen.tsx:35-41` (only the injected `preview…` function differs); styles `safe/content/gap/row/flex`: `GuardianConsent:137-141` = `SchoolRequest:117-121` = `ManageChildScreen.tsx:181-185` | 12 + 15 / **~5 + ~10** | ✔ Same state transitions and the same error copy ('That code didn’t work.'). A `useCodePreview(fetchFn, initial)` passed the preview function behaves the same. The style values are identical. The code-entry fallback blocks (`GuardianConsent:124-129` vs `SchoolRequest:104-109`) differ in their sentence, so they are **B**. |
| 07-A12 | 6-colour team palette `['#FF5C5C','#4DA3FF','#3DDC97','#FFB454','#B98AFF','#FF8AC4']` | `JoinTournamentScreen.tsx:28`, `TournamentTeamsScreen.tsx:54`, `TeamsScreen.tsx:26`, `OrganizationScreen.tsx:216`; 8-colour `QuickTournamentScreen.tsx:36` = `ScheduleMatchScreen.tsx:55` | 6 / **4** | ✔ Same arrays in the same order. Colour is picked by index or randomly over the length, so the length must stay. Export two constants (e.g. `core/theme`). Contingents, EditTeam and CreateClub differ (07-B18). |
| 07-A13 | Club/team badge letters `x.shortName?.slice(0,3) \|\| x.name.slice(0,2).toUpperCase()` | `ClubsScreen.tsx:69`, `:93`, `ClubHomeScreen.tsx:138` | 3 / **~2** | ✔ Same expression. Only the badge size styles differ, and they stay local. |
| 07-A14 | Checkbox styles `box` / `boxOn` / `tick` | `CreateClubScreen.tsx:145-147`, `ClubSportScreen.tsx:242-244` | 6 / **3** | ✔ Values are identical. |
| 07-A15 | QR block `<View style={st.qr}><QRCode value={link} size={168} backgroundColor="#ffffff" color="#04150F" quietZone={8} /></View>` + `qr` style | `InviteFriendScreen.tsx:99,113`, `GetAppScreen.tsx:110,133` | 4 / **~2** | ✔ Identical. `components/InviteQrShare.tsx:49` and `PassportScreen.tsx:120` use other props or wrappers, so they are excluded. |
| 07-A16 | Form-page style block `safe/content/chips/row/wrapRow/wrapCell` | `CreateCommunityScreen.tsx:204-210`, `TournamentTeamsScreen.tsx:~745-751` | 14 / **~6** | ✔ This is the scan's clone. The values are identical. Low value: only worth doing if the shared form styles land anyway. |
| 07-A17 | `navigate('LiveScoring', {…, canScore: false})` written by hand | `CalendarScreen.tsx:110-116`, `SportProfileScreen.tsx:181-187`, `NotificationsScreen.tsx:80-86` | 21 / **~18** | ✔ Byte-equivalent to `openMatchViewer` (`navigation/openMatch.ts:9-17`). Call the helper. The other 7 hand-built copies differ (07-B21) (per 07-H). |
| 07-A18 | `ROLES` + `cap` in sign-up | `AuthScreen.tsx:31-32` = `components/PhoneLoginCard.tsx:21-22` | 4 / **2** | ✔ Identical. Move to `core/roles.ts`. |
| 07-A19 | `cap()` capitalise, `charAt(0).toUpperCase() + slice(1)` form | 16 copies repo-wide (13 named `(t: string)`, 3 named `(s: string)`), e.g. `AuthScreen.tsx:32`, `sports/pointDetail.ts:511`, `sports/hockey/feed.ts:19` | 16 / **~15** | ✔ Only the parameter name differs. **Not** the 3 other forms: `k[0]…`/`s[0]…` throw on `''`, and golf's `(t ? … : t)` guards. Bundle: a shared one-liner gets pulled into each sport chunk, which is negligible but is a chunk-graph change. Optional. |
| 07-A20 | Segmented-control styles `segBtn/segBtnActive/segText/segTextActive` | `DiscoverScreen.tsx:374-377` = `TournamentProfileScreen.tsx:1240-1243` | 8 / **4** | ✔ Identical. `MatchesScreen` `segBtn` adds flex props, so it is **B**. |
| 07-A21 | Print-failure message | `HallOfFameScreen.tsx:77` = `PassportScreen.tsx:60` | 2 / **1** | ✔ Same string. The other print messages are worded differently (B). |
| 07-A22 | Golf: save card + catch | `GolfRoundScreen.tsx:195-196`, `:211-212`, `:316-317` | 6 / **~4** | ✔ Three identical `try { setPendingSync(await saveCard(e.id, card)); } catch …'Could not save'`. A local `persist(e.id, card)` does the same. |
| 07-A23 | Golf: `merged` recomputed | `GolfRoundScreen.tsx:110` (memo) vs `:338` (shadowing const) | 2 / **1** | ✔ The expression is identical and the memo deps (`entries`, `local`) are current at click time. |
| 07-A24 | GenerateFixtures numeric-input parses | `GenerateFixturesScreen.tsx:245, 507, 726, 735` (`Math.max(1, parseInt(topK,10)\|\|1)`), `parseInt(bestPlaced,10)\|\|0` ×5 | ~9 / **~5** (per 07-L) | Pure, identical expressions. Derive each once per render. |
| 07-A25 | GenerateFixtures exact draft pairs | `GenerateFixturesScreen.tsx:387-388` = `:443`; `:399-400` = `:451-452` | ~6 / **~3** (per 07-L) | Reported as identical text. Local `toDrafts()`. The 395≈447 and 418≈432 pairs differ in stage, so they are B. |

**(A) total: about 410 lines removable.** About 300 of these are the event-setup family (A1–A7).

---

## (B) Not identical: leave as is (exact differences)

| ID | What | Locations | Exact difference |
|---|---|---|---|
| 07-B1 | Entrant-pool filter and cap | the 8 setups' `pool` | The predicate differs per sport: `eligibleFor({gender},…ageOf)` (Archery, Shooting, Weightlifting, Crew), `eligibleFor(cat,…ages.ageFor/gradeFor)` (Cycling, Combined, Road, Athletics), and Shooting adds `team \|\|`. The cap is `.slice(0, 60)` (Archery, Shooting, Weightlifting, Crew, Athletics) vs `80` (Cycling, Combined, Road). The deps differ too. |
| 07-B2 | "✓ … only" eligible chip | `Archery:254`, `Crew:254`, `Shooting:270`, `Weightlifting:175` vs `Cycling:306`, `Combined:229`, `Road:275`, `Athletics:414,452` | Gender words (`Men/Boys/Women/Girls`, Crew adds `Everyone (mixed)`) vs `categoryLabel(cat)`. Athletics `:452` uses a template literal, with the same text. |
| 07-B3 | Empty-pool message | each setup | Sport noun ("archers", "riders", "athletes", "swimmers", "Nobody matches") and whether "or date of birth" is said. |
| 07-B4 | Sticky footer `FormError + Button` | 8 setups, Create/Copy Tournament, CreateClub, CreateCommunity, CreateListing, CreateSeries, EditTeam, Feedback | Labels differ. `disabled` differs (see 07-C1). |
| 07-B5 | "Run it again: same rounds as last time" effect | `CrewEventSetup.tsx:169-174` vs `AthleticsEventSetupScreen.tsx:297-302` | Crew also guards `!seed`. Deps `[presets]` vs `[presets, carried]`. |
| 07-B6 | Number stepper | `CreateTournament:366-375` (`NumStepper`), `EditTournament:287-296` (`NumberStepper`), `components/StructureEditor.tsx:118-127`, `CreateSeries:164-172` | JSX is identical for the first two, but `stepVal.minWidth` is 30 / 28 / 22. StructureEditor has no `zeroLabel`. CreateSeries steps ±2 with `stepBtn` padding 1.5 and `stepTxt` small. Display drift only. |
| 07-B7 | Registration block (deadline + min/max) | `CreateTournament:336-358` vs `EditTournament:253-275` | This is the scan's clone. JSX is the same, but `capRow` gap is 3 vs 4 and `capCell` is `{flex:1, gap:1}` vs `{gap:2}` (plus the stepper above). Create also shows a hint line `:334`. |
| 07-B8 | `toggleSport` | `CreateTournament:151-162` vs `EditTournament:119-128` | Create clears the draft on remove and adds `regionFormatDefaults`. Edit keeps the draft and seeds only when it is empty, with no region defaults. The first is intentional (keep formats on edit); the region part is 07-C4. |
| 07-B9 | Name / sports / date validation | `CreateTournament:165-170` vs `EditTournament:131-136` | End-date message: "End date must be on or after the start date." vs "End date can’t be before the start date." |
| 07-B10 | "My player id + my name" effect | `CreateTournament:106-118`, `EditTournament:54-62`, `CopyTournament:51-56`, `CreateListing:49-67` | Create also fills `organiserPhone`. Copy has `.catch` and requires `p?.fullName`. Listing sets city, phone and contact rule. Create and Edit have no catch. |
| 07-B11 | Code-entry fallback | `GuardianConsent:124-129` vs `SchoolRequest:104-109` | The sentence differs ("from the email we sent you" vs "from the school’s email"). |
| 07-B12 | Invite-code `find()` | `JoinClubScreen.tsx:30-41`, `JoinTeamScreen.tsx:32-46`, `JoinTournamentScreen.tsx:55-67` | Empty-code messages differ. JoinTeam redirects `T-` codes. JoinClub and JoinTournament auto-resolve a deep-link token; JoinTeam only pre-fills it. JoinTournament resets the team state. |
| 07-B13 | Colour swatches | `CreateClub:103-107` vs `EditTeam:164-166` | `TouchableOpacity` vs `Text`. EditTeam has `accessibilityState={{selected}}` and `overflow:'hidden'`. The palettes differ. (a11y: 07-C7) |
| 07-B14 | Type-DELETE confirm | `DeleteAccountScreen.tsx:51-59` vs `ManageChildScreen.tsx:167-170` | Button labels differ ("Delete my account" / "Delete their data") and so do the busy labels. |
| 07-B15 | Lineup editors (roster load, side tabs, save loop) | `CricketLineupScreen.tsx:42-63,110-113,93-103` vs `LineupEditorScreen.tsx:48-62,149-156,130-141` | Cricket uses `Promise.all`, shows both sides and saves both. LineupEditor fires nested un-awaited loads, filters to `allowedSides` and saves only those. The eligibility gates differ (07-C2/C3). |
| 07-B16 | Club admin check | `ClubHomeScreen.tsx:63` vs `ClubSportScreen.tsx:80` | ClubSport adds `!!teamManager` (sport captain/VC). Intentional per the comment. |
| 07-B17 | Club badge view | `ClubsScreen.tsx:68-70,92-94` vs `ClubHomeScreen.tsx:137-139` | Badge 44 px/r10/font 15 vs 56 px/r12/font 18. (The text expression is 07-A13.) |
| 07-B18 | Other palettes | `ContingentsScreen.tsx:22` (10 colours), `EditTeamScreen.tsx:26` (8), `CreateClubScreen.tsx:25` (6, leads with `#2E7D6B`) | Different lengths or members, so a different colour gets assigned. |
| 07-B19 | "Match config = merge(tournament format, match format)" | `CorrectMatch:53,61`, `LiveScoring:182`, `OverlayScreen:65`, `data/repos.ts:2353,2446,3220`, `data/matchRecordsBackfill.ts:68`, `data/matchHousekeeping.ts:28` | matchHousekeeping wraps it in `stripInternal(...)`; the others don't. Each lookup of `tour` differs. Scoring-adjacent, so do not merge blindly. |
| 07-B20 | Team name / short validation | `JoinTournament:94-96` vs `EditTeam:88-89` | Name message: "Give your team a name." vs "Give the team a name." The short-name check and message are identical. |
| 07-B21 | Hand-built LiveScoring params | `MatchLinkScreen.tsx:24-33`; also Home 138-145, Matches 86-98, SwissRound, TeamProfile, SportHub, Series, TryNewSport (per 07-H) | MatchLink uses `nav.replace` and has no `canScore`. The others pass `canScore` from role or rules, and Matches passes `tab`. |
| 07-B22 | Sign-up fallback | `InviteScreen.tsx:89-91` vs `GetAppScreen.tsx:62-64` | Label "Sign up" vs "Sign up — it takes a minute". (`brand` and `title` styles are identical but trivial.) |
| 07-B23 | Message timestamps | `MessagesScreen.tsx:16-20` vs `ConversationScreen.tsx:113` | Different formats on purpose (time today, else day+month, vs full date+time). |
| 07-B24 | LiveScoring "Format" line vs `data/lineContext.ts:126-225` | `LiveScoringScreen.tsx:2622-2656` | Wording differs ("single set" vs "1 set", "best of 5 sets" vs "Best of 5"), and the sports covered differ (07-C8) (per 07-L). |
| 07-B25 | LiveScoring two name resolvers | `LiveScoringScreen.tsx:378-379` vs `:581-584` | The source order differs, so a duplicate id can resolve differently (per 07-L). |
| 07-B26 | Fixture creation loop | `GenerateFixturesScreen.tsx:472-499` vs `BracketScreen.tsx:173-193` | Tie format `matchFormatFor(...)` vs `rawFormat`. GF passes `venueName` (07-C9) (per 07-L). |
| 07-B27 | Avatar initials | `LiveScoring:2616-2619`, `HostsCard`, `AddInvitePlayer`, `TournamentAwardsTab`, Discover:111, EditProfile:248, Following:100, TeamProfile:423, … vs `core/minorPrivacy.ts:46-53` | Fallback glyph ('🎯' / '🤝' / '?' / '🙂'), split on `' '` vs `\s+`, the masked-name handling, and **no uppercase in Discover / Following / TeamProfile** (07-C10). |
| 07-B28 | Misc. near-copies (per 07-L/H) | stream label (LS 2083 vs `LiveStream.streamProvider`), "N min ago" (LS 277 vs `supportConsole.claimedAgo`), captain/vice check (LS 557 vs `teamPermissions`), golf hole setters (GolfRound 214-246), refinish (262 vs 290), golf to-par label (454 vs `golf/feed.scoreName`), Bracket `latestStart` (161/237/247/270), Bracket `Slot`/`StagedSide`, stage labels (GF 70, ImportSchedule 39-45 vs `data/bracket.ts`), walkover picker (LS 1153 vs 2034), dispute title (LS 2202/2225/2276), header Share button, status chip label, getMyPlayerId effect (31+ files), `e instanceof Error` (150+), sport chips (20+), screen `safe/content/chips` styles, AuthScreen/PhoneLoginCard guardian + terms blocks, the minor-sign-up validation (07-C11), player row, tournament row, `readableDob` / `spelledDate`, Calendar `ymd` vs `ymdOf`, stat `Tile` ×11 (HoF vs Passport: flexBasis 18% vs 22%, gold vs primary), `CAN_DRAW` vs `DRAW_SPORTS` (cricket), side-field chips, Auth `Field` vs `TextField`, input border, print copy, plurals | Each differs in text, rounding, a fallback, a style value or a rule, as the reviewers listed. None can be merged without a visible change. |

---

## (C) Drift that looks like a bug (findings only, not removable)

1. **07-C1. Create forms can be submitted twice.** These footers have no `disabled={busy}`: `CreateTournamentScreen.tsx:222` (`onPress={submit}`), `CreateClubScreen.tsx:79`, `CreateCommunityScreen.tsx:120`, `CreateListingScreen.tsx:107`; also `JoinTeamScreen.tsx:67,74`. None of the submit functions checks `busy` first, and `Button` has no built-in guard (`components/ui.tsx:156-157`). Sibling forms do guard: `CreateSeries:103 disabled={busy || !sport}`, `CopyTournament:150 disabled={busy}`, `EditTeam:131`, all 8 event setups, Feedback. A double tap can create two tournaments, clubs, communities or listings.
2. **07-C2. Cricket batting order ignores `editableSides`.** `LiveScoringScreen.tsx:878-882` sends cricket to `CricketLineup` with no `editableSides`, but sends every other sport to `MatchSquad` with `editableSides` (`:888-892`). `CricketLineupScreen.tsx:110-113` shows both team chips and `:95-100` saves **both** sides. Compare `LineupEditor:32,135` ("a captain never writes the opponent's"). So a one-side captain could edit and save the opponent's XI. I did not verify whether RLS blocks it.
3. **07-C3. Positional lineup skips the eligibility and age gate.** `LineupEditorScreen.tsx:105-118,123-128` places or subs anyone on the roster. `MatchSquadScreen.tsx:73-74,256` and `CricketLineup:76-81` gate on `canFieldPlayer(p, ageReq)`. Because LineupEditor's `save` (`:135-138`) rewrites the match squad from placed players + subs, a player that MatchSquad refused can enter the squad through "arrange on pitch".
4. **07-C4. Edit tournament: a sport added later misses the region and market defaults.** `CreateTournament:158` seeds `regionFormatDefaults(s, units)` and `:179-184` applies the market's `ageOn` cut-off for athletics, swimming and cycling. `EditTournament:124` does neither. So a US meet that adds swimming in Edit starts on non-yard defaults, and a UK meet that adds athletics there keeps 31 Dec ages.
5. **07-C5. Edit tournament keeps team caps when registration is closed.** `EditTournament:150-151` saves `minTeams` and `maxTeams` regardless of `isOpen`. `CreateTournament:191-192` saves them only `isOpen && …`. Minor.
6. **07-C6. Event-setup pool: only Combined lists everyone when there are no teams or houses.** `CombinedEventSetup.tsx:119` falls back `: sources.length ? … : players`. The other 7 (e.g. `Archery:99`, `Athletics:247`) show an empty list until the organiser types a search. It looks like a fix applied to one copy only.
7. **07-C7. Create-club colour swatches have no selected state for screen readers.** `CreateClub:104-106` vs `EditTeam:165` (`accessibilityState={{ selected }}`).
8. **07-C8. The live screen's Format line misses sports and presets** (per 07-L). Padel, table tennis, squash and pickleball get no games line, and tennis and volleyball presets are ignored (`LiveScoring:2622-2656` vs `lineContext.ts`).
9. **07-C9. Bracket tie rubbers get no sport defaults when the format is unsaved** (`BracketScreen.tsx` `rawFormat` vs GF `matchFormatFor`). Also, Bracket's next round and 3rd-place match can start in the past (`BracketScreen.tsx:237,270` lack the `Date.now()` floor used at `:247`) (per 07-L).
10. **07-C10. Initials are not uppercased in Discover, Following and TeamProfile** (e.g. `FollowingScreen.tsx:100`) (per 07-H).
11. **07-C11. The under-18 guardian-email rule differs by sign-up path.** AuthScreen requires a valid guardian email (`AuthScreen.tsx:146`). PhoneLoginCard (`:86`), `supabase/functions/phone-login/index.ts:152` and EditProfile accept phone **or** email with no email-format check. That blocks the CL-03 approval link (per 07-H).
12. Also reported by the reviewers (per 07-L/H):
    - The golf round host check ignores tournament managers (`GolfRoundScreen.tsx:97` vs `ResultsEventScreen.tsx:170-171`).
    - The golf tee time has no `timeZone` (`GolfRoundSetupScreen.tsx:322`).
    - The dispute log ignores the viewer's zone (`LiveScoring:2746` vs `:1327`).
    - Calendar shows postponed and cancelled matches as Upcoming and exports them to .ics (`CalendarScreen.tsx:141-142,166,196`).
    - `canOrganize(role) ||` gives any self-declared organiser the edit UI on MeetEntries, MeetTimetable, CompetitionRules (`CompetitionRulesScreen.tsx:48`, verified), SportHub, RecordBoard and ResultsEvent, but not on Certificates, Bracket, Standings, Americano or Swiss.
    - EditProfile has no `SPORT_SIDE_FIELDS[s] ?? []` guard.
    - Raw inputs use `colors.border` instead of `inputBorder` (contrast) in MeetEntries, MeetTimetable and Discover.
    - Discover prints the raw ISO `startDate`.
    - ImportSchedule stage labels differ from `bracket.stageLabel`.

---

## Coverage

| File | Lines | Reviewed by | Status |
|---|---|---|---|
| AmericanoScreen.tsx | 226 | me | fully |
| ArcheryEventSetup.tsx | 297 | me | fully |
| AssignScorersScreen.tsx | 240 | me | fully |
| AthleticsEventSetupScreen.tsx | 617 | me | fully |
| AuthScreen.tsx | 511 | 07-H | fully |
| BracketScreen.tsx | 665 | 07-L | fully |
| CalendarScreen.tsx | 317 | 07-H | fully |
| CertificateScreen.tsx | 88 | 07-H | fully |
| CertificatesScreen.tsx | 272 | 07-H | fully |
| ClubHomeScreen.tsx | 290 | me | fully |
| ClubSportScreen.tsx | 247 | me | fully |
| ClubsScreen.tsx | 118 | me | fully |
| CombinedEventSetup.tsx | 260 | me | fully |
| CompetitionRulesScreen.tsx | 235 | me | fully |
| ContingentsScreen.tsx | 112 | me | fully |
| ConversationScreen.tsx | 163 | me | fully |
| CopyTournamentScreen.tsx | 228 | me | fully |
| CorrectMatchScreen.tsx | 170 | me | fully |
| CreateClubScreen.tsx | 148 | me | fully |
| CreateCommunityScreen.tsx | 213 | me | fully |
| CreateListingScreen.tsx | 189 | me | fully |
| CreateSeriesScreen.tsx | 221 | me | fully |
| CreateTournamentScreen.tsx | 392 | me | fully |
| CrewEventSetup.tsx | 375 | me | fully |
| CricketLineupScreen.tsx | 206 | me | fully |
| CyclingEventSetup.tsx | 353 | me | fully |
| DeleteAccountScreen.tsx | 68 | me | fully |
| DiscoverOrgsScreen.tsx | 93 | me | fully |
| DiscoverScreen.tsx | 409 | 07-H | fully |
| EditMatchScreen.tsx | 211 | me | fully |
| EditProfileScreen.tsx | 517 | 07-H | fully |
| EditTeamScreen.tsx | 204 | me | fully |
| EditTournamentScreen.tsx | 316 | me | fully |
| FeedbackScreen.tsx | 115 | me | fully |
| FollowingScreen.tsx | 134 | me | fully |
| GenerateFixturesScreen.tsx | 965 | 07-L | fully |
| GetAppScreen.tsx | 134 | me | fully |
| GolfCourseEditScreen.tsx | 110 | 07-L | fully |
| GolfRoundScreen.tsx | 640 | 07-L | fully (A22/A23 re-checked by me) |
| GolfRoundSetupScreen.tsx | 441 | 07-L | fully |
| GuardianConsentScreen.tsx | 142 | me | fully |
| GuardianLinkScreen.tsx | 78 | me | fully |
| GuardianProofScreen.tsx | 77 | me | fully |
| HallOfFameScreen.tsx | 313 | 07-H | fully (A21 re-checked) |
| HeadToHeadScreen.tsx | 250 | 07-H | fully |
| HomeScreen.tsx | 470 | 07-H | fully |
| ImportScheduleScreen.tsx | 365 | 07-H | fully |
| InviteFriendScreen.tsx | 114 | me | fully |
| InviteScreen.tsx | 121 | me | fully |
| JoinClubScreen.tsx | 85 | me | fully |
| JoinTeamScreen.tsx | 90 | me | fully |
| JoinTournamentScreen.tsx | 250 | me | fully |
| LegalScreen.tsx | 41 | me | fully |
| LineupEditorScreen.tsx | 243 | me | fully |
| LinkEditionScreen.tsx | 155 | me | fully |
| LiveScoringScreen.tsx | 2924 | 07-L | fully (5 chunks); I checked `:860-905` |
| ManageChildScreen.tsx | 187 | me | fully |
| MatchLinkScreen.tsx | 55 | me | fully |
| MatchSquadScreen.tsx | 379 | 07-H | fully; I checked `:185-210` |
| MatchesScreen.tsx | 162 | 07-H | fully |
| MeetEntriesScreen.tsx | 462 | 07-H | fully |
| MeetTimetableScreen.tsx | 314 | 07-H | fully |
| MessageReportsScreen.tsx | 117 | me | fully |
| MessagesScreen.tsx | 106 | me | fully |
| MyTournamentsScreen.tsx | 108 | me | fully |

Out-of-slice files read for comparison: RoadEventSetup, ShootingEventSetup and WeightliftingEventSetup (loader, pool, styles and footer regions), SchoolRequestScreen (1-60, 90-123), TournamentTeamsScreen (725-760), components/StructureEditor (110-145), components/ui Button, navigation/openMatch.ts, PassportScreen tile and print lines.

Not verified: whether RLS blocks the writes in C2 and the `canOrganize` path in C12. The "(per 07-L/H)" items I did not re-read.
