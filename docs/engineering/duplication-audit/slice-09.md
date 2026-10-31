# Slice 9: `src/data/` top-level files A–R (80 files, 22,132 lines)

**Scope note.** The coordinator narrowed the scope. This report covers **duplicated code only**. Every finding gets exactly one class:

- **(A) Removable with zero behaviour change.**
- **(B) Not identical, leave it.** The exact difference is listed.
- **(C) Drift that looks like a bug.** Reported only. It is not removable, because fixing it changes behaviour.

The "lines removable" figures count **(A) findings only**.

**How the review was split.**
- I read `repos.ts`, `demoStore.ts`, `resultsStore.ts` and `hooks.ts` line by line (10,081 lines).
- The other 76 files (12,051 lines) were read line by line by a sub-agent. I then re-checked every one of its "identical" claims against the source. Several were downgraded:
  - `ratings.ts` 69/355 and 362/399 are not identical.
  - `tournamentLines` and `scopeTournamentLines` are not equivalent.
  - `chessRoundResults.newId` differs from `newUuid`.

**Mechanical clone scan.** The only `exact-clones-all.txt` entry in this slice is `data/legal.ts:142 <> 382`. It is covered in 9-A1.

**Cross-boundary rule.** Every (A) proposal puts the shared code in `src/core/` or in a `src/data` file the copies already import. None of them pulls a sport module into another bundle. Nothing in this slice is a per-sport loader target.

---

## 1. (A) Removable with zero behaviour change

| ID | What | Every location | Why it is provably identical | Where it should live | Removable lines | Risk |
|---|---|---|---|---|---|---|
| 9-A1 | Shared legal paragraphs, India vs international terms | `legal.ts:141-161` = `381-401` (byte-identical: "Our app and its data", GeoNames line, "Scores and results", "## Liability" heading); `132-139` = `372-379` (Fair play); `128-129` = `368-369`; `172-174` = `414-416` | Byte-for-byte equal text. Interpolating one constant into both template strings gives the same strings. | Named constants at the top of `legal.ts`. `LegalScreen` and the website build still get the same strings, and the bundle is unchanged (same file). | ~18 | low in code, but lawyer-reviewed text: founder call |
| 9-A2 | `MatchEventRecord → ScoreAction` mapper, and "replay a log" | Mapper: `sports/amend.ts:23-28`, `data/eventLog.ts:76-81`, `data/chessRoundResults.ts:20`, `data/pendingResults.ts:55-60`, inline `data/teamTieDemoSeed.ts:58`. Replay loop (`createInitialState` + `for (e of effectiveLog(log)) s = reducer(s, toAction(e))`): `chessRoundResults.ts:40-41`, `pendingResults.ts:66-69`. This equals `replayLog()` at `sports/amend.ts:62-64`. | Same four fields with the same `?? undefined`. The `reduce` and the `for` loop fold in the same order from the same seed. | `logAction` in `data/eventLog.ts` (already exported). Call `replayLog`. `amend.ts` is shared, not a per-sport bundle. | ~14 | medium (replay path, but identical semantics) |
| 9-A3 | Edge-function error body → message | `repos.ts:4039-4041`, `repos.ts:4347-4349`, `core/phoneLogin.ts:56-58`, `core/phoneLogin.ts:97-99`, `data/studentListStore.ts:100-102`, `data/registerLookup.ts:26-28` | All six run `ctx=(error).context; body = ctx && typeof ctx.json==='function' ? await ctx.json().catch(()=>null) : null; body?.error ?? <fallback>`. Only the fallback string differs, and it becomes a parameter. Each caller keeps its own throw or return. | `fnErrorText(error, fallback)` in `core/functionPath.ts` (already imported by all six). **Not** `privacy.ts:52-56`, which also reads `body.reason` (B). | ~12 | low |
| 9-A4 | Team / club short code from a name | `repos.ts:5677-5681` (`clubShort`), `repos.ts:6306-6310` (`contingentShort`), `screens/ScheduleMatchScreen.tsx:55-59`, `screens/QuickTournamentScreen.tsx:42-45` | The first three are byte-identical. QuickTournament skips `.trim()` before `split(/\s+/).filter(Boolean)`, but `filter(Boolean)` removes the empty edge tokens that `trim` would have removed. The fallback uses the raw `name` in all four. Output is identical for every input. | A small `core/` helper (screens already import `core/*`). | ~13 | low |
| 9-A5 | "Who scores this match" | `repos.ts:1662`, `repos.ts:1936`, `reminderRules.ts:175`, `reminderRules.ts:252` | Character-identical to the existing `currentScorers()` at `data/scorerAssign.ts:38-40`, which has no imports, so there is no cycle risk. | `scorerAssign.currentScorers` | ~2 (one rule, not lines) | low |
| 9-A6 | RPC error message (strip `prefix:`) | `repos.ts:4400` (`rpcMessage`) = `orgVerification.ts:19` (`msg`) | Same expression. | Export from `repos.ts`, which `orgVerification` already imports. | 1 | low |
| 9-A7 | `blankSquads()`, and the squad row mapper | `blankSquads`: `repos.ts:3636` = `demoStore.ts:1406`. Row → squad: `repos.ts:3642` = `repos.ts:3661` (`{ starters: r.starters ?? [], subs: r.subs ?? [], keeperId: r.keeper_id ?? undefined }`) | Same literal and same expression. | Export from `demoStore`, which repos already imports. A local `toSquad(r)`. | 2 | low |
| 9-A8 | "Who / by whom" name lookups for audit lines | The `who` + `byName` pair: `repos.ts:4967-4968`, `4980-4981`, `5373-5374`, `5402-5403`. `byName` alone: `4870`, `4890`. `who` alone: `5390`. | Same awaited `getPlayer(...)?.fullName ?? 'Someone'` / `byPlayerId ? … : undefined`, in the same order. | A local `playerNameOr(id, fallback)` in repos | ~6 | low |
| 9-A9 | Individual owner label | `repos.ts:4840-4842` vs `4848-4850` | Only the source of `pid` differs. `pid ? (await getPlayer(pid))?.fullName ?? 'Individual' : 'Individual'` is identical. | A local helper | ~2 | low |
| 9-A10 | `org_members` row from a member | `repos.ts:5285-5288` (setOrgMembers `toRow`) vs `5324-5327` (upsertOrgMembers) | Same seven fields with the same defaults. The retry-without-`houses` logic around them differs and stays where it is (see B-8). | A module-level `orgMemberRow(orgId, m)` | ~3 | low (DB write payload is unchanged) |
| 9-A11 | `getOrgRequests` / `getMyOrgRequests` | `repos.ts:5451-5461` vs `5464-5475` | Only the filter column (`org_id` vs `player_id`) differs, in both the demo and live branches. The `!playerId` early return stays in the wrapper. | `orgRequestsBy(col, id, status)` | ~10 | low |
| 9-A12 | Invite row → `TeamInvite` | `repos.ts:1574-1577` vs `1593-1596` | Identical four lines. | A local helper | ~3 | low |
| 9-A13 | End-by-hand tail | `repos.ts:3168-3170`, `3188-3190`, `3195-3197` | All three run `syncHandEndedTotals → flagWinners → syncMatchAppearances` in the same order with the same args. | A local `afterHandEnd(matchId, state, winner)` | ~4 | medium (result path, but the call order is identical) |
| 9-A14 | Demo "team roster, else house players" | `repos.ts:698-700` (getTeamRosters), `2926` (removePlayerFromTeam), `3072-3074` (updateMatchSnapshot), `3129-3131` (flagWinners) | Same `roster?.length ? roster : players.filter(p.houseName===t.name).map(id)`. **Not** `2827-2829` or `getRoster 3858/3865`, which add a sport filter and exclude a player (B-1). | `demoRosterOf(team)` in `demoStore.ts` | ~6 | low (demo only) |
| 9-A15 | Flag winners' stat lines | Demo: `repos.ts:3071-3075` vs `3128-3132`. Live: `3105-3111` vs `3135-3142`. | The writes are identical: `won:false` for all, then `won:true` for the winning roster. Removable **only** as `flagWinnersFor(matchId, winner, meta)` taking the already-read `home_team_id`/`away_team_id`. Making `updateMatchSnapshot` call today's `flagWinners` would add a second read; if that read failed, flags would not be set. That would be a behaviour change. | A local helper in repos | ~6 | medium |
| 9-A16 | Lineup `put(slots, position, id, name)` | `demoStore.ts:507-510`, `537-540`, `569-572` | Same body three times (the parameter type `typeof home` is `LineupSlot[]` in all). | A module-level helper | ~8 | low (demo seed) |
| 9-A17 | Point-interleave loop in the demo log generators | `demoStore.ts:1043-1048` (vb), `1067-1072` (bm), `1100-1105` (tn `playSet`), `1108-1112` (tn live set) | `1109-1112` is exactly `playSet(lh, la)`: same calls, and the `gameNo` sequence carries on. The other three are the same loop with a different `emit`/`game` callback. | Inside `demoStore.ts` | ~10 | low (demo seed; same event sequence) |
| 9-A18 | Results: create the next round's phase | `resultsStore.ts:383-386`, `420-423`, `448-451`, `499-502`, `528-531` (uses `no`, which equals `fmt.phaseNo`), `1216-1219` | Identical `insertPhase({ tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo, startsAt: now, format: { results: fmt }, hostIds: phase.hostIds ?? [] })`. | A local `insertNextPhase(phase, f, def, fmt)` | ~15 | low (same write) |
| 9-A19 | Parse a stored record book | `resultsStore.ts:550-551`, `1019-1021`, `1065-1068` (`storedBook`) | Same `formats?.[sport]?.records` → `JSON.parse` if string, else `[]`, with `[]` on error. | Use `storedBook` everywhere | ~5 | low |
| 9-A20 | Relay points factor | `resultsStore.ts:824-825` = `828-829` | Identical two lines. | A local helper | ~2 | low (same rounding) |
| 9-A21 | Phase → meet/combined input | `resultsStore.ts:1192` (combinedPhases `others`) vs `meetPhases` `993-998` | Same `{ id, format: phaseOf(p), status, date: startsAt, entries }` and the same filter. Only the TypeScript cast (`MeetPhase['status']`) differs. | Call `meetPhases` | ~3 | low |
| 9-A22 | Set a field event's status | `resultsStore.ts:337-341` (`setPhaseStatus`) vs `golf.ts:207-215` (`setFieldEventStatus`) | Same demo mutation, same update, same throw. | Keep `golf.setFieldEventStatus`. resultsStore already imports golf. | ~5 | low |
| 9-A23 | `const live = () => isSupabaseConfigured && !!supabase` | 17 declarations. In the slice: `orgVerification:18`, `guardianProof:12`, `privacy:18`, `meetEntriesStore:26`, `requestsStore:20`, `messages:47`, `golf:29`, `certificates:10`, `hallOfFame:15`, `personalise:17`, `passport:17`, `resultsStore:68`. Outside: `teamEventResults`, `studentListStore`, `supportConsole`, `timetableStore`, `tournamentCopy`. | The same boolean. Separately, the inline `!isSupabaseConfigured \|\| !supabase` appears **197×** in `repos.ts` alone (same value, no line savings). | `isLive()` exported from `core/supabase` | ~16 | low |
| 9-A24 | Demo share code | `certificates.ts:15` = `passport.ts:19` | Byte-identical (10 characters from the same alphabet). **Not** `orgVerification:158` (16 characters) or `repos.ts:6212-6217` (`T-`+6) (B-15). | `core/` | 1 | low |
| 9-A25 | 10 MB proof-document limit | `core/guardianProof.ts:35` `PROOF_DOC_MAX_BYTES` = `repos.ts:4269` `VERIFICATION_DOC_MAX_BYTES` | Same value. | One constant in `core/` | 1 | low |
| 9-A26 | Pairing winner / loser | `bracketPlaces.ts:69` `winnerOf` ≡ `bracket.ts:287-289` `pairingWinnerId`; `bracketPlaces.ts:70` `loserOf` ≡ `bracket.ts:291-296` `pairingLoserId` | Checked: `matchLoserId` (bracket.ts:341) already returns undefined when there is no winner, so both forms return the same thing for every pairing. | Use the bracket.ts exports | ~2 | low |
| 9-A27 | `isPow2` | `bracket.ts:73` = `groups.ts:201` | Same expression. | Export from bracket.ts | 1 | low |
| 9-A28 | Focus-fetch hooks that differ only in the query | Plain: `hooks.ts:74-86` useTournament, `294-306` usePlayers, `442-454` useTeamSummaries, `528-540` useOpenTournaments, `543-555` useOrganizations, `557-569` useCities, `670-682` useTeams, `516-523` (inner of useListings). Id-guarded (reset to the initial value, then no fetch): `686-697`, `713-724`, `728-739`. | Same `useFocusEffect(useCallback(() => { let on = true; fetch().then(v => on && set(v)); return () => { on = false } }, deps))`. A `useFocusFetch(fetch, deps, initial, enabled?)` reproduces the same state transitions. **Not** useTournamentById (spreads `{...t}`), usePlayerLite, useFootballProfile (different reset and return shapes), or the multi-read hooks. | `hooks.ts` | ~55 | low |
| 9-A29 | Group stat lines by player | `hooks.ts:316-321`, `352-357`, `409-414`, each followed by the same `.map(player => ({ player, stats: aggregate(...) }))` | Identical. The sorts that follow differ, so they stay at each call site (B-17). | `hooks.ts` local | ~10 | low |

**Total (A): ≈ 242 lines.** That is about 189 lines in my four files plus about 53 from the sub-agent's files, after re-verification.

---

## 2. (B) Not identical, leave as is

| ID | What | Locations | Exact difference |
|---|---|---|---|
| B-1 | Demo roster with a sport filter | `repos.ts:2827-2829` (invitePlayer), `3857-3865` (getRoster) | Adds `p.sports.includes(sport)`. The invitePlayer copy also excludes the new player id. |
| B-2 | "Schema missing?" predicates (7) | `isMissingFunction` 462 (PGRST202/42883/**PGRST205**/regex); `isMissingFn` 1631 (no PGRST205); `isMissingSchema` 955 (six codes); `isMissingRestricted` 1147 and `isMissingAgeLevel` 1149 (42703/PGRST204 + a column regex); `isMissingResultColumn` 1228; `isMissingCol` 5120 (codes only); `resultsStore.missingRpc` 562 (function name must be in the message) | Each one accepts a different set of codes or messages. Merging them would change which errors fall back. |
| B-3 | Newest-columns fallback cascades | `withMatchCols` 298-307, `withTournamentCols` 374-395, `withOrgCols` 5121-5140; the team-level fallbacks at `861-862`, `886-887`, `5904-5905`, `5623-5624`, `6015-6026` | Different column lists. `getTeams` falls back **without `club_id`**, but `getMyTeams` and `getClubTeams` keep it. `getTeamsForOrg` never asks for `level` or sets the flag. `getClubTeams` skips `revealEntryNames`. See C-1 and C-2. |
| B-4 | Tournament config + replay | `repos.ts:2352-2357` (resync), `2445-2448` (repair), `3219-3221` (hand-ended) | The tournament list differs (`includeDeleted` or not; one fetch per match vs once). The no-log fallback differs (snapshot / skip / return). |
| B-5 | `__break` strip | `repos.ts:1737-1740` vs `1766-1769`; `1812-1814` vs `1819-1820` | Demo turns an empty format into `undefined`. Live writes `{}` (the DB default). Intentional. |
| B-6 | Names by id | `getPlayerNames` 1265-1275, `getPlayersByIds` 2548-2554, `getPlayerNamesById` 2543-2546, the inner read of `revealEntryNames` 198-199 | `getPlayerNamesById` dedupes and drops falsy ids. `getPlayerNames` sends them as-is (an empty id can fail the whole uuid `in()` read and return an empty map). The cache TTL applies only in `revealEntryNames`. |
| B-7 | Insert player → `getPlayer` | `createPlayer` 3974-3991, `invitePerson` 2765-2773, `invitePlayer` 2883-2888, `createReplacementPlayer` 2669-2675 | Different columns and error texts ("Could not create profile" / "…the invite" / "…add player"). The last one returns a partial row with no re-read. |
| B-8 | `org_members` upsert retry | `setOrgMembers` 5296-5300 retries without `houses`. `upsertOrgMembers` 5328-5331 does not, and chunks. | Retry behaviour differs. |
| B-9 | Single-field match/tournament setters | `setMatchHosts` 1980, `setMatchOfficials` 1962, `setMatchStream` 2206, `setMatchFormat` 2173, `setTournamentHosts` 1992, `setTournamentReminderLeads` 2003, `setMatchManagers` 3034 | Some throw on error. `setMatchStream`, `setMatchFormat`, `setTournamentHosts`, `setTournamentReminderLeads` and `setMatchManagers` ignore it. See C-4. |
| B-10 | Results: carry an entry into the next round | `resultsStore.ts:387-394`, `424-429`, `452-457`, `503-508`, `532-540`, `1220-1225` | The carried fields differ per sport: members/name dropped in the combined and stage copies, `gc` / `race` / `extra` added in others. |
| B-11 | Field-event format write | `resultsStore.patchPhaseFormat` 327-335 vs `golf.updateFieldEventFormat` 195-205 | resultsStore nests the patch under `results` and throws "Event not found". |
| B-12 | Subscribe/emit store boilerplate (about 15 stores) | `captainStore`, `followStore`, `notifyStore`, `onboardingStore`, `reminderPrefs`, `matchOutbox`, `resultHold`, `resultsStore.syncListeners 626-659`, `hooks.permListeners 254`, plus 8 outside the slice | Some unsubscribes return a boolean. Snapshots differ (arrays vs sorted copies). |
| B-13 | Durable AsyncStorage queues | `matchOutbox`, `golf.ts:249-325`, `pendingResults.ts:30-44`, `reminderPrefs`, `personalise.ts:30-37`, `referral.ts` | Different semantics (per match / latest card wins / serialised RMW). See C-5 and C-6 for wiring drift. |
| B-14 | Error-text helpers | `guardianProof.ts:13-14`, `personalise.ts:20-21`, `privacy.ts:46-49`, `certificates.ts:11`, `requests.ts:129-138`, `studentListStore.ts:24`, `privacy.fnError` 52-56 | The fallback wording differs: "Something went wrong. Check…" vs "Something went wrong — check…". privacy also reads `body.reason`. |
| B-15 | Random codes and UUIDs | `orgVerification:158` (16 characters), `repos.ts:6212-6217` (`T-`+6); `chessRoundResults.ts:21-22` `newId` vs `core/deviceId.newUuid` | Different length or prefix. `newId` never tries `crypto.randomUUID`. |
| B-16 | Verification document upload | `repos.ts:4223-4243`, `orgVerification.ts:90-106`, `guardianProof.ts:30-42` | `upsert:true` vs `false`, different path schemes, different messages. |
| B-17 | Player summary sorts | `hooks.ts:324`, `361`, `419` | The name tie-break and the `rankByName` wrapping differ. |
| B-18 | Places (1st/2nd/3rd) | `certificatePlaces.ts:10-17`, `feeders.ts:59-81`, `bracketPlaces.ts:78-199`, `career.ts:190-208` | Different stage and tie handling. See C-7 and C-8. |
| B-19 | `stageForTeams` vs `knockoutRoundLabel` | `bracket.ts:62-70` vs `groups.ts:300-306` | The groups.ts copy caps at `r32`. See C-9. |
| B-20 | Circle-method round robin | `fixtures.ts:17-41` vs `americano.ts:26-54` | Opponents vs partners. Only the rotation line matches. |
| B-21 | Which side a player was on (6) | `lineOpponent.ts:25-29`, `131-141`; `appearances.ts:69-74`, `173-181`; `lineContext.ts:250-259`; `ratings.ts:61-62` | Rule order differs (SD-119, intentional). ratings defaults to `'home'` (C-12). |
| B-22 | Reminder lead labels | `reminderPrefs.ts:31-36` `formatLead` vs `reminderRules.ts:23-28` `shortByMinutes` | Different phrasing. |
| B-23 | Server copies across the Deno boundary | `paging.ts:24-99` = `supabase/functions/_shared/paging.ts` (exact, parity test); `reminderPrefs.LEAD_OPTIONS` vs `notify-upcoming LEADS 116-120`; `followPrefs.wants` vs `notify-followers:131` / `notify-upcoming:285` | Exact or equivalent, but edge functions cannot import `src/`. Leave. |
| B-24 | Ordinal suffix (21 copies) | `feeders.ts:53` + 20 outside the slice | Signatures and edge cases differ between copies (not all verified identical). Leave unless each one is checked. |
| B-25 | JSON stored in a tournament format key | `manualStandings.ts:21-30`, `americano.ts:115-130`, `leaderMinimums.ts:26-39`, `prizeCategories.ts:105-109`, `elimDraws.ts:120-131` | Different validation and defaults per key. |
| B-26 | Career runs and win % | `career.ts:135-144` vs `148-157` (one condition differs); win % at `career.ts:34-37` (draws in the denominator, "0%") vs `289` (no draws, "–") vs `profileHeadline.ts:56` | Different formulas. Product decision needed. |
| B-27 | ratings.ts near-copies | `69` vs `355` (the second adds `round1` and `Number(v)\|\|0`); `362` vs `399` (the second adds a `ls.length &&` guard); `tournamentLines 136-140` vs `golfLeaders.scopeTournamentLines 21-23` (sport filter, "no ids means all", eventId fallback) | Not identical. |
| B-28 | cricketSeed ball loops | `cricketSeed.ts:149-176` vs `263-285` | Strike swap after a last-ball wicket (C-10). |
| B-29 | Gender parsers (6) | `rosterImport.ts:147-153`, `prizeCategories.ts:66-72`, plus 4 in `results/*` | Different accept sets (C-11). |

---

## 3. (C) Drift that looks like a bug (finding only, not removable)

1. **C-1 (medium): one network blip permanently drops newer columns.**
   - Files: `repos.ts`, in the cascades `withTournamentCols` (378/383/388), `withOrgCols` (5125/5130/5135), `withMatchCols` (302), and the team-level reads (862/887/5905/6025).
   - These cascades set their "column is missing" flag on **any** error, including a timeout or offline. `readPlayers` / `selectStatLines` / `isMissingCol` only set it for 42703/PGRST204.
   - After one failed read, the rest of the session reads without `time_zone`, `qualifies_to`, `age_verification`, `level`/`entry_ids`, `market`/verification/`registered`.
   - `getFeedersInto:6059` then returns `[]` outright (`if (!tournamentFeederCol)`). So "Qualified from X" and feeder links vanish until the app restarts, and children's entry names stop being re-revealed.
   - Copy quoted: `if (!withAge.error) return withAge; tournamentAgeCol = false;` vs `if (viewHasRestricted && isMissingRestricted(res.error)) { viewHasRestricted = false; … }`.
2. **C-2 (low): `getTeams` fallback loses `club_id`/`adhoc`.**
   - Location: `repos.ts:862`, fallback `'id,name,short_name,sport,color_hex,org_id,roster'`.
   - The same fallback in `getMyTeams:887` keeps `club_id,…,adhoc`. Combined with C-1, a transient error makes `getTeams` return teams without `clubId`.
3. **C-3 (medium, security-adjacent, flagged loudly): the dispute state machine is guarded in demo but not live.**
   - `escalateDispute`:
     - Demo (`repos.ts:2655`) only escalates `status === 'reported'`.
     - Live (`2658`) runs `update({ status: 'open' })` from any state, which can reopen a dismissed or resolved dispute.
   - `resolveDispute`:
     - Demo (`2998`) returns unless `status === 'open'`.
     - Live (`3017-3024`) has no status check, so a dismissed dispute that has a replacement and both confirmations still moves the stat lines (`3021`).
     - Live also does not move the squad or lineup slots, which demo does at `3003-3011`.
   - Server check: `guard_dispute` in `migrations/20261006120000_security_hardening.sql:1029-1070` lets any match manager change status freely. The **authorization** agrees (managers only), but neither the server nor the live client enforces the **transition** rules.
4. **C-4 (low-medium): setters that swallow errors break their callers' assumptions.**
   - `setMatchFormat` (`repos.ts:2179-2181`) never throws. Yet `stampAggregatePrior:2198-2200` wraps it in try/catch expecting a refusal.
   - The fallback paths of `saveTieLineup:3541-3544`, `setTieAbc:3494` and `settleTie:3611-3616` report success when the writes were refused.
   - `setMatchHosts` / `setMatchOfficials` / `setMatchScorers` do throw (inconsistent).
5. **C-5 (medium-low): saved reminder times are never loaded.**
   - `reminderPrefs.ts:76-83` `hydrateReminderPrefs` has zero callers repo-wide, unlike the other prefs stores that hydrate at start.
   - Changes are written (`70`) but never read back.
   - Sign-out (`setReminderPrefsUser(null)`) does not reset them (shared-device rule).
6. **C-6 (medium): the golf/results card outbox is not flushed at app start.**
   - `golf.ts:262` `hydrate()` runs only inside `flushGolfOutbox` / `saveFieldResult`, and the 15 s interval starts only after a save (`323`). Its comment at 245-247 promises a retry on app start.
   - `matchOutbox` (interval at module load) and `pendingResults` (flush on sign-in) do start on their own.
   - This also affects results-engine entries, because `resultsStore.saveEntryResult` goes through `saveFieldResult`.
7. **C-7 (medium): `feeders.knockoutPlaces` is not tie-aware.**
   - Location: `feeders.ts:60-61`.
   - It takes a final's own `m.winner`, which ignores two-leg aggregates, team-tie rubbers and the organiser's "Advances" pick (SD-120). It also gives no double-chance 3rd/4th.
   - `bracketPlaces.sportPlaces` handles all of these. This feeds the "Qualified from X" badges.
8. **C-8 (low-medium): `certificatePlaces.detectPlaces` disagrees with the medal table.**
   - Location: `certificatePlaces.ts:11-16`.
   - It reads stage `final` only, so a double-elimination `gf`/`gf2` champion is not detected. Third place is `matchWinnerId(third)`, which is not tie-aware, and it has no shared bronze.
   - Related: `career.ts:195` counts only `final`, so a double-elimination grand final is not counted as a title.
9. **C-9 (medium): a 33-64 team knockout gets stage `r32` twice.**
   - `groups.ts:305` returns `'r32'` above 16 teams, while `bracket.ts:67-69` returns `r64`/`r128`.
   - `GenerateFixturesScreen.tsx:403` tags round 1 with `knockoutRoundLabel`, then `stageForTeams(32)` also gives `r32`. The two rounds merge.
10. **C-10 (low, demo only): cricketSeed strike swap.**
    - `cricketSeed.ts:277` swaps strike after a last-ball wicket. `buildInnings` (153-167) does not.
11. **C-11 (low): gender accept-sets differ.**
    - "Women" in a roster CSV is blank in `rosterImport.readGender`, but F in `prizeCategories.genderOf`.
12. **C-12 (low, display): `ratings.ts:76` puts an unknown-side player on `'home'`.**
    - The other side-of helpers return undefined.
13. **C-13 (low): `rosterImport.ts:251` computes "today" in UTC (`toISOString`) for the under-18 check.**
    - `core/age.ageOn` with `todayIn(zone)` is the app's rule.
14. **C-14 (low): forfeit context reads tournaments without deleted ones.**
    - `forfeitContext` (`repos.ts:3241`) calls `getTournaments()` without `includeDeleted`, while `syncHandEndedTotals:3219` includes deleted tournaments.
    - A walkover in a soft-deleted tournament falls back to the federation default format.
15. **C-15 (low, docs): international terms not mirrored in the legal draft.**
    - `docs/international/legal-draft.md` lacks the international terms' "Our app and its data" clause and the GeoNames line, despite "Keep the two in step" at `legal.ts:180`.

**Security summary.**
- No permission or ownership check in this slice lets the client allow more than the server. The client-side checks are UX gates, and RLS / RPCs decide.
- Two items to look at:
  - **C-3**: the dispute transitions are not enforced live, or on the server.
  - The `upsert` flag differs across the three private-document uploads (B-16).
- `canManageTeam` (`repos.ts:926-934`) correctly drops the self-chosen `organizer` role when the RPC fails.
- `matchHousekeeping.deleteVerdict` is stricter than the RLS rule, so it is safe.

---

## 4. Seed and static data

| File | Lines | Bundling | Duplicate entries |
|---|---|---|---|
| `demoStore.ts` (seed players 75-273, stat lines 324-488, orgs 674-770, live logs 1120-1359) | 1534 | Statically imported by `repos.ts`, so it is in the main bundle. The build is lazy (`materializeDemo` 914, perf F-25). But its static import of `cricketSeed` (line 14) builds every cricket demo log at import time, live builds included. | Player ids are unique. Display names repeat by design ("Karan Bose" `p-bh-c1`/`p-c-5`, "Girish Naik" `p-gh-6`/`p-fal-7`, "Karthik Nair" `p-karthik`/`p-str-8`): different people, ids distinct. |
| `cricketSeed.ts` | 313 | Static, through demoStore | None |
| `devSeed.ts`, `cueDemoSeed.ts` | 155, 41 | Dynamic import, gated (`RootNavigator.tsx:145-150`) | None |
| `golfCourses.ts` | 116 | Pure course-editing logic, not a data table | n/a |
| `legal.ts` | 421 | Static, through `core/auth.tsx:12` and `core/phoneLogin.ts:9`, for the version constants only | See 9-A1 |

---

## 5. Coverage (every file read in full)

My four files: `repos.ts` 6521, `demoStore.ts` 1534, `resultsStore.ts` 1287, `hooks.ts` 739. All reviewed line by line. In demoStore, the pure seed tables were read and checked for duplicate ids only.

Sub-agent files, all reviewed in full:

| File | Lines | File | Lines | File | Lines | File | Lines |
|---|---|---|---|---|---|---|---|
| amendments.ts | 73 | americano.ts | 152 | appearances.ts | 251 | bracket.ts | 489 |
| bracketPlaces.ts | 199 | captainStore.ts | 31 | career.ts | 316 | carriedSetup.ts | 153 |
| certificatePlaces.ts | 18 | certificates.ts | 113 | chessCrosstable.ts | 182 | chessRatings.ts | 189 |
| chessRoundResults.ts | 71 | competitionRulesStore.ts | 52 | cricketCareer.ts | 55 | cricketSeed.ts | 313 |
| cueDemoSeed.ts | 41 | devSeed.ts | 155 | elimDraws.ts | 292 | entrants.ts | 41 |
| eventLog.ts | 127 | feeders.ts | 117 | fixtureSchedule.ts | 146 | fixtures.ts | 82 |
| followPrefs.ts | 73 | followStore.ts | 65 | formatPatch.ts | 24 | golf.ts | 422 |
| golfCourses.ts | 116 | golfLeaderboard.ts | 250 | golfLeaders.ts | 116 | golfTeams.ts | 239 |
| groups.ts | 352 | guardianProof.ts | 119 | hallOfFame.ts | 130 | headToHead.ts | 228 |
| leaderMinimums.ts | 123 | legal.ts | 421 | lineContext.ts | 401 | lineOpponent.ts | 170 |
| manualStandings.ts | 54 | matchFormat.ts | 139 | matchHousekeeping.ts | 96 | matchOfficials.ts | 178 |
| matchOutbox.ts | 223 | matchRecordsBackfill.ts | 100 | medalStandings.ts | 188 | meetEntriesStore.ts | 207 |
| messages.ts | 305 | myPlayerIdMemo.ts | 71 | notifyStore.ts | 37 | onboardingStore.ts | 21 |
| orgVerification.ts | 285 | organizerStats.ts | 64 | paging.ts | 99 | participantEntry.ts | 82 |
| passport.ts | 115 | pendingResults.ts | 97 | personalise.ts | 148 | privacy.ts | 199 |
| prizeCategories.ts | 268 | profileHeadline.ts | 60 | profileRegion.ts | 44 | profileViewState.ts | 26 |
| ratings.ts | 476 | readCache.ts | 101 | referral.ts | 74 | registerLookup.ts | 35 |
| reminderInputs.ts | 114 | reminderPrefs.ts | 127 | reminderRules.ts | 260 | reminders.ts | 124 |
| requests.ts | 210 | requestsStore.ts | 131 | resultHold.ts | 125 | rosterImport.ts | 261 |
