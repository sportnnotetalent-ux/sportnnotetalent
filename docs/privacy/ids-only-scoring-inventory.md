# Inventory: player names in public scoring data (2026-10-24)

A read-only sweep of the codebase for [`ids-only-scoring.md`](ids-only-scoring.md). Line numbers are as of commit 285d957.

## Key findings

1. **One write path.**
   - A scorer tap goes through `src/data/useLiveMatch.ts:367-376`. That builds the `match_events` row: `attribution` as-is, with `attribution2` added as `payload._attr2`.
   - It then goes via the outbox to `repos.ts:1714-1749 appendMatchEvent` (`p_payload`, `p_attribution`). The RPC `append_match_event` (`supabase/migrations/20261019120300_scoring_lock.sql:90-113`) stores both verbatim.
   - The whole reduced state is written to `matches.state` after every tap: `useLiveMatch.ts:165-171` → `withMatchRecords` (`sports/matchRecords.ts:204-215`) → `repos.ts:2922 updateMatchSnapshot`. Only cricket strips anything: `cricket/engine.ts:1945 snapshotState` drops `log` and `detail` but keeps the name fields.
   - Both tables are publicly readable (`supabase/schema.sql:501-502`).
2. **Source of names:** always `Player.fullName` from `players_view` on the scorer's device. The scorer is in the circle, so they get full names.
3. **Three forms of stored name:**
   - **(a) A name next to an id.** Most cases.
   - **(b) A name with no id:**
     - football foul victim `secondName` (`football/index.tsx:470`, `engine.ts:537`)
     - kabaddi SUB `offName` / `onName` and `subbedOff`
     - football `subbedOff`
     - basketball `onCourt` and pre-SD-40 events
     - cricket legacy `potm: string`
     - name-only players in baseball, netball and American football (`p1Name`, `name:` ids)
     - typed team-official names
   - **(c) Names baked into text:**
     - `LiveEvent.detail` / `label` ("21-18 · Asha Rao")
     - cricket `BatCard.dismissal` ("c X b Y") and event details
     - kabaddi sub detail "X ⬆ Y ⬇"
     - AMEND `payload.lines`
4. **Name used as identity.** These must move to ids before names can go:
   - basketball `onCourt` and the public `ids` name→id map (`engine.ts:~53-57, 103-106, 304-307, 511-523`)
   - kabaddi `subbedOff` (`engine.ts:145`), the mat queue (`rules.ts:~327-338`) and `unavailable()` (`engine.ts:380-393`)
   - football `subbedOff` (`engine.ts:33, 642, 665`), the scorer's on-pitch XI (`index.tsx:320-340`) and the LineupView marks (`LineupView.tsx:49-52, 209`)
   - the volleyball box score (`engine.ts:438-459`) and every box score in `boxSources.ts` (keyed by name)
   - card / sanction counting, which falls back to names (`samePlayer` in handball, rugby, rugby_league and netball)
5. **Old logs carry names only.**
   - Stat totals and appearances resolve name→id from `players_view` names: `repos.ts:2191, 2403-2405`, `racketTotals.ts:192-207, 265-269`, `kabaddi/totals.ts:94-96`, `football/totals.ts:115-166`, and `appearances.ts:79-93, 140-143`, which also parses `detail`.
   - This already fails for viewers outside the circle, who get initials. The failing lookups are:
     - `playerLink.ts:22 idByName`, used by `PlayFeed.tsx:61`, `invasion/Commentary.tsx:75` and `basketball/Timeline.tsx`
     - `boxSources.ts:70`
     - every `rosterOf().find(p.fullName === nm)`
6. **Existing seams:**
   - `src/core/disputeMask.tsx` `useMask()` (`byId`, `name`, `text`), already used by `CommentaryFeed`, the cricket views, `MatchSummary`, the football `LineupView` and the invasion `Commentary`
   - the cricket share card's `nameOf(id, name)` hook (`cricket/shareCard.ts:66`)
   - the racket and tennis commentary models, which already take `{id, name}` rosters and look names up by id (`racketCommentaryModel.ts:111-113`, `tennis/Commentary.tsx:37-38`)

## Write sites

### Shared modules
- **Attributions:**
  - `voiceMatch.ts:86`
  - `voiceParsers.ts:49, 84, 116, 121, 145, 161, 178, 240-262, 315-335, 387, 435-444, 462`
  - `rallyCore.tsx:112, 133` (POINT `{playerId, playerName}` for pickleball, squash and table tennis)
  - `rallyEngine.ts:239-245` (`playerName`, `playerId` and a `detail` containing the name)
- **Payload only; state keeps ids or slots:**
  - `rallyCore.tsx:159` SET_START_RIGHT (state `rallyEngine.ts:169-176`)
  - `ServeOrderPicker.tsx:47` (tennis, padel; slot in `serve.ts:82-91`)
  - `DoublesOrderPicker.tsx:56` (badminton, table tennis; ids in `doublesOrder.ts:88-97`)
- **Conduct and timeouts:** `RacketQuickOptions.tsx:99, 159` send `{playerId, playerName}`. `conduct.ts:302-317` stores `PenMark.playerName` plus detail "reason · Name"; `:335-337` puts the name in the TIMEOUT detail.
- **Point detail:** `PointDetailRow.tsx:183`, `RallyPointEditor.tsx:293` and `tennis/PointCapture.tsx:95, 159` produce `pd.err {playerId, playerName}` (`pointDetail.ts:618-626`).
- **Corrections:**
  - `rallyEdit.ts:96` (rows with `playerName`, `df`, `oe`, `pen`), `:147-169` (replayed attributions), `:238` STAT_ADJUST, `:256` EDIT_LOG `payload.points[]` (stored in `match_events`)
  - `carrom/engine.ts:596-607`
  - `EventCorrectionList.tsx:39-64` (AMEND `lines` text with names) and `:91-94` (replacement ops `attribution.playerName` / `payload.playerName`)
  - `amendments.ts:17-34` (`byName`) and `repos.ts:2481 getScoreEdits`
- **Bulk:** `chessRoundResults.ts:47-55`; `matchRecordsBackfill.ts:90` (rewrites `state.matchRecords`).
- **Match records:** `state.matchRecords` items carry `playerName` / `partnerName` with ids. They come from `recordHelpers.ts:21-36` and the per-sport `records.ts` for cricket, football, hockey, handball, ice hockey, netball, American football, rugby, rugby league, basketball, baseball, kabaddi and carrom. Racket, volleyball, chess and golf records have no names.

### Per sport
"index" is the scorer UI; "engine" is the reducer and state.

**Racket sports**
- **badminton:** `index.tsx:42` → `engine.ts:135-144`.
- **tennis:** `index.tsx:42, 48` (double-fault `attribution2`) → `engine.ts:158-172` (`playerName`, `detail`, `df{playerId?, playerName}`) and `:269-272`.
- **padel:** `index.tsx:51, 73, 74` → `engine.ts:120-140, 227-230`.
- **pickleball, squash, table tennis:** only through the shared modules.

**volleyball**
- **Attributions:** `engine.ts:209-240`.
- **LINEUP:** court stamp `{id, name}` at `:339` (payload `index.tsx:160, 260-261`).
- **Events:** `:346-362` (`playerName`, `detail`, `oe{playerId, playerName}` at `:433-434`).
- **Sanctions:** `:412-423` and `sanctions.ts:87, 96` (payload `SanctionOptions.tsx:50`).
- **SET_ROTATION / SUB:** `CourtPlayer{id, name}` in `rotation.ts:67-68` (payloads `ServePanel.tsx:27, 101, 226`).
- **VB_DETAIL:** `detail.ts:82, 209` (`DetailRow.tsx:47`).
- An id is always present.

**kabaddi**
- **`engine.ts:473-499 raidActions`:** attribution and attribution2, plus payload `raiderId`/`raiderName`, `tacklerId`/`tacklerName` and `touched[{id, name}]`.
- **State:**
  - raids `:30-48` (raider and tackler names; ids optional)
  - extras `:55-63, 760-783`
  - events `:547-596, 644-657`
- **SUB:** `index.tsx:229` → `engine.ts:793-806` stores **names only**.
- **Other actions:** TECH `index.tsx:532`, CARD `:565`, edit `:162`.
- **Reversals** copy the stored names: `index.tsx:128`, `engine.ts:456-464`.

**cricket**
- **Every ball's payload:** `strikerName`/`bowlerName` (`index.tsx:816-820`). WICKET adds `fielderName`, `fielder2Name` and `newBatName` (`:855-860`).
- **`{id, name}` actions:**
  - SET_STRIKER / NONSTRIKER / BOWLER / KEEPER (`:806-807, 1333, 158, 2414`)
  - captain (`:165-191`)
  - FIELD_NOTE (`:669-671`)
  - impact / concussion sub (`:2354`)
  - retire (`:1124`)
- **Attributions:** `:826, 830` and `engine.ts:565-566`.
- **State:**
  - cards `{name}` keyed by id (`engine.ts:24-50`)
  - crease and bowler names (`:85-90`)
  - captains and keepers (`:106-107`)
  - `impactUsed` (`:116`)
  - dismissal `fielderName` (`:59-61`)
  - field notes (`:244`)
- **No id:**
  - `dismissal` text (`:467-482, 1359`)
  - event details (`:1346, 1368-1369, 1409, 1584, 1677, 1694, 1722, 1731, 1765`)
  - `potm: string` (`:148, 1773`)

**football**
- **Scorer UI (`index.tsx:242-273`):**
  - STAT payload `playerName` (`:296-297`)
  - GOAL (`:372`); OWN_GOAL `scorerName` plus pid (`:376`)
  - foul victim `secondName`, **no id** (`:470`)
  - XI stamp (`:495-510`)
  - SUB with names and ids (`:738`)
  - UNDO_GOAL (`:895`)
  - shoot-out `takerName` / `keeperName` (`:1522-1523`)
  - typed official name (`:261`)
- **Engine:** events (`events.ts:43`) and `stats[]` (`events.ts:141`; `engine.ts:528-537`), plus `:560, 587, 599, 612-614, 632-642, 695, 507-518`.
- **`subbedOff`:** names only (`:33`).

**Other invasion sports: hockey, handball, ice hockey, netball, rugby, rugby league, American football**
- **Credits:** `index.tsx` `credit({playerId, playerName, secondId, secondName…})` → `eventCredits` / `creditAttribution` (for example `handball/engine.ts:276-317`).
- **The reducer takes names from the attribution or `payload.playerName`:** handball `:384-386`, hockey `:335-336`, ice `:632-633`, netball `:487-489`, rugby `:486-488`, league `:469-471`, AF `:625-627`.
- **XI stamp `{id, name}`:** handball `:398-405`, hockey `:354-361`, ice `:643-650`, rugby `:499-503`, league `:491-495`, AF `:651-655`, netball positions `:507-512`.
- **Also:**
  - SUB with off/on names and ids
  - GK payload `{id, name}`
  - ice hockey `thirdName` / `gkName` (`:662-699`)
  - shoot-out kicks
  - typed official names
- **Name-only:** netball `index.tsx:134` (`name:` ids); AF `p1Name` (`engine.ts:508, 769`).
- **Index ranges:** AF `:171-373`, rugby `:156-324`, league `:137-203`, hockey `:133-266`, ice `:154-230, 320-324`, netball `:147-254`, handball `:129-210`.

**basketball**
- **Scorer UI:** `index.tsx:142-251` attribution `playerName` plus `payload.pid`; SUB `:259`.
- **SET_LINEUP:** name arrays plus `ids` (`:265`) → `engine.ts:511-523`.
- **Events keyed by name:** `:449-523`.
- `onCourt` names and the `ids` map are public.

**baseball**
- **`who()` `{id, name}`:** `index.tsx:136-162, 397-481` (LINEUP, SUB, EJECT).
- **State:**
  - lineup `{id?, name}` (`engine.ts:45, 354`)
  - starters (`:355`)
  - runners, moves, spells and runs with `runnerName` / `respName` (`:307-321, 393-538`)
  - credits (`:631-693`)
- Name-only players are allowed (`whoKey :363`).

**The rest**
- **carrom:** `index.tsx:112` → `engine.ts:328-337` (`CarromCredit{id?, name}` in `credited` / `by`), `:544, 578-607`.
- **chess:** attribution only (`chess/stats.ts:43`); no names in state. The MOVES payload keeps the raw pasted PGN (`MovesPanel.tsx:58`), which may hold `[White]` / `[Black]`.
- **golf match play:** attribution only (`golf/index.tsx:62, 73-74`).
- **Results sports** (athletics, swimming, weightlifting, shooting, archery, rowing, canoe, cycling) don't use `matches.state` or `match_events`. Their names are in `field_entries.result.members[]{playerId?, name}` and `.name` (`data/results/model.ts:446-455`).

### Other stored names next to scoring data
- `match_lineups` slots `playerName` (`LineupEditorScreen.tsx:101`, `MatchSquadScreen.tsx:49`); publicly readable.
- `matches.potm{name, auto.name}` (`LiveScoringScreen.tsx:800`); `matches.result.byName` (`:1046`).
- `format` advance `by` (`BracketScreen.tsx:215`, `series.ts:58-64`).
- `tournaments.awards[].playerName` (`TournamentAwardsTab.tsx:133`, `ratings.ts:432`).
- `match_disputes.player_name`; publicly readable.
- Individual and pair entries' `teams.name` = the players' names (`participantEntry.ts:34-36`, `entrants.ts:30-43`). It flows into `homeName` / `awayName` and `stat_lines.opponent` (`lineOpponent.ts`).
- **Clean:** `match_squads` and tie lineups (`teamTie.ts:275-279`; `save_tie_lineup` stores ids).

## Display readers

**Shared**
- `CommentaryFeed.tsx`
- `racketCommentaryModel.ts:61, 69, 126, 174, 254`; `tennis/commentaryModel.ts:87, 93, 166-171`
- `pointDetail.ts:600 pdText`
- `undoLabel.ts:52-63` and `cricket/undo.ts`
- `boxSources.ts`: basketball `:98-162`, volleyball `:181-229`, kabaddi `:280`, football `:355-424`, racket `:454-531`
- `gameFlow.ts:94-117, 179` (uses basketball `s.ids`)
- `feedModel.ts:29` with `PlayFeed.tsx:61`; `invasion/feed.ts:44` with `invasion/Commentary.tsx:75`; `netraid/feed.ts`
- `onField.ts:103-126`; `discipline.ts:186-228` (tournament card table)
- `ticker.ts` plus every sport's `ticker.ts`, which feed the public OBS overlay `/o/<id>` (`OverlayScreen.tsx`)
- `TournamentRecords.tsx:31-32`
- `RallyPointEditor.tsx`; `EventCorrectionList.tsx:39-64`
- `LiveScoringScreen.tsx:1193-1194, 1277`
- `useLiveMatch.ts:323-333`: the follower notification is built on the device from `attribution.playerName`
- `VoiceScorer.tsx:56`
- `cricket/shareCard.ts`; `core/shareText.ts:151`
- `LiveTimeline.tsx:44-58` has no importers: delete it.

**Per-sport reader files** (excluding engine/meta)

| Sport | Files |
|---|---|
| American football | 10 |
| baseball | 10 |
| basketball | 10 |
| carrom | 5 |
| cricket | 11 |
| football | 12 |
| handball | 9 |
| hockey | 9 |
| ice hockey | 11 |
| kabaddi | 11 |
| netball | 11 |
| rugby | 11 |
| rugby league | 11 |
| volleyball | 12 |
| tennis | 3 |

- These are mostly commentary, feed, timeline, box, records, ticker, totals, sheet, discipline, voice and pitch/court/rink views.
- Badminton and padel use the shared readers. Chess and golf already resolve names from the roster.
- An id is available at nearly every reader. The exceptions are the no-id names in finding 3(b) and the text in 3(c).

## Where the scorer gets names

- `LiveScoringScreen.tsx:314-315 getRoster` (`repos.ts:3704-3729`, `players_view`), filtered by `applySquad` (`:370`, `match_squads`).
- Lineup slots: the `sl.playerName` fallback in every XI stamp.
- `EntrantPicker` typed names → `entrants.ts:14-17` → `createReplacementPlayer` (`repos.ts:2541`), which makes a provisional player with an id plus `teams.name`.
- Voice: `voiceMatch.ts matchPlayer`; football `voiceCommands.ts:34`.
- `getPlayersByIds` (`repos.ts:2425`), used by the stat-totals context and appearances.

## Server side

- **Nothing reads names from `matches.state` or `match_events`.**
  - `notify-followers` builds push titles from base `players.full_name` by id (`index.ts:404-408, 481-485, 566-578`), bypassing `players_view`.
  - The status trigger posts `to_jsonb(new) - 'state'` (`20261019122300_follow_prefs.sql:58`).
  - `team_tie_ops.sql:101` reads only `state->>'method'`.
- **Stat-line writers run on the device:** `repos.syncMatchStatLines :2156`, `matchStatTotals :2202`, `syncMatchAppearances :2380`.
- **Safety-net point:** `append_match_event` (`scoring_lock.sql:90-113`) is the one server choke point for stripping names.

## Tests asserting on names in state or attribution

| Group | Test files |
|---|---|
| Racket | rally-point-editor, rally-edit, rallyEdit, racket-fixes, racket-commentary, tennis-commentary, point-detail, sd62-74-doubles-order, racket-entry, sd135-racket-p1s, pickleball-server, sd53-54-racket-conduct, racket-round2, racket-deep-wave, `racketLogs.mts` |
| Volleyball | volleyball-totals, -points, -deep-wave, sd58-71, sd136 / sd117b-volleyball-kabaddi, volleyball-kabaddi-round2, sd68-78-81-carrom-volleyball, `volleyballLegacyReducer.mts` |
| Kabaddi | kabaddi-attribution, -depth, -deep-wave, sd59-72-83, `kabaddiLegacyReducer.mts` |
| Cricket | cricket-edit (26), -dismissals (25), cricket, -runs, -scorecard, -round2, -deep-wave, -sd38-43-69-79, -penalty, -sd133, -sd113, -rules, -overs, -bowling, `cricketLegacyLogs.mts` |
| Football | football, -deep, -cleansheet, -totals, -sd56-70-80, -minutes, `footballLegacyEngine.mts` |
| Basketball | basketball, -shooting, -fiba, -deep, sd122, sd57-sd50, `basketballLegacyReducer.mts` |
| Other team sports | rugby (-deep, -round2), rugby-league, american-football (-deep, -round2), netball (-deep), hockey (-deep), handball (-deep), ice-hockey (-deep, -round2), invasion-goal-round2, court-team-round2, sd132-139, on-field |
| Cross-cutting | box-score + `boxScoreLegacy.mts`, stat-totals-contract + `statTotalsHarness.mts`, sd51-match-records, live-corrections, amend, appearances, ticker, sd126-discipline-walkover, sd117 / sd117c-scorer-flow, sd119-line-opponent, shareText, leaders-awards, carrom-*, baseball, sd49-golf-field-leaders |

The legacy fixtures require old name-only logs to keep replaying identically.

## Per-sport summary

| Sport | Names in state | Names in events | Id alongside | Readers | Notes |
|---|---|---|---|---|---|
| badminton, padel, tennis, pickleball, squash, table tennis | yes: events, `detail` text, `pd.err`, `pen`, `df` | yes: attribution and conduct / timeout / point-detail / edit-log / serve-order payloads | yes, except `detail` text | shared (~10) | box score and totals key by name |
| volleyball | yes: events, lineup, rotation, subs, sanctions, detail | yes | yes | 12 | box score keyed by name |
| kabaddi | yes: raids, extras, events, `subbedOff`, `touched` | yes | partial (SUB and mat queue have none) | 11 | name used as identity |
| cricket | yes (heaviest) | yes (every ball) | yes, except dismissal text, details, `potm` | 11 | many text strings |
| football | yes | yes | mostly (not foul victim, `subbedOff`, official) | 12 | XI and subs by name |
| hockey, handball, ice hockey, rugby, rugby league | yes | yes | yes | 9–11 | one shared pattern |
| netball, American football | yes | yes | mostly (name-only players allowed) | 10–11 | |
| basketball | yes: keyed by name, plus `ids` map | yes | partial (pid on newer logs only) | 10 | engine keyed by name |
| baseball | yes: `Who` objects | yes | optional | 10 | name-only players |
| carrom | yes: credits | yes | optional | 5 | |
| chess, golf match play | no | attribution (chess also raw PGN) | yes | 0 | easy |
