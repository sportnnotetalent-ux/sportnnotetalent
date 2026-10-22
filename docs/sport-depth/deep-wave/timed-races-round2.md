# Deep wave — timed races, round 2 (founder's answers built)

**Date:** 2026-10-22 · **Family:** athletics, swimming, rowing, canoe sprint, cycling · **Status:** built in a worktree, uncommitted, not run live. Follows [timed-races.md](timed-races.md) §4.

The founder answered every open question of the first timed-races wave (and confirmed the World Athletics / World Aquatics rule numbers cited there are verified). Not wanted: national / state record reference marks — not built.

Ground rules kept: entering a result is as fast as before; every new capture is optional; old results load and read exactly as before; nothing untracked shows as 0; career keys are written only when recorded; organiser options have standard defaults; ids are athlete / player ids.

## 1. Heats of a timed final count as heats won

- `heatWins` now also goes to the winner of **each heat of a timed final** (a final run in several heats and ranked across them): the best overall place among that heat's runners. Equal marks share it, as in a heat round.
- **Decision:** the overall winner also won their heat, so they get the heat win as well as the gold. That is the literal reading of "the heats count". *Alternative:* leave the gold medallist out (one race, one figure). It is a one-line change in `heatWins.ts` if preferred.
- Not heats: a single final, and lettered **Finals A / B** (placing races; Final B's winner is 7th).
- Sports: athletics and swimming (`phaseLines`), rowing and canoe (`crewLines`). Cycling keeps its own `raceWins` (its timed heats are solo rides or pairs, so they have no heat wins).
- Older timed finals gain the key on their next stat re-sync or re-lock.
- **Code:** `src/data/results/heatWins.ts` (`heatWinnerIds`, `isTimedFinalRows`).

## 2. Athletics lap points: finish-line passes or every 400 m from the start

- New organiser choice **Lap points** (sport settings → "Stats to track", key `lapPoints`): **Finish-line passes** (the default and every older result: 1500 m at 300 / 700 / 1100 m) or **Every 400 m from the start** (Diamond League style: 400 / 800 / 1200 m). The points differ only for 1000 m, 1500 m and 3000 m. The 800 m bell is already 400 m from the start, the 400 m keeps its 200 m point, and relays keep the changeovers.
- **Each result keeps its own points:** laps typed from the start carry `EntryResult.lapsFrom: 'start'`. An absent value means finish-line passes, so every saved result reads exactly as before. Switching the choice mid-meet never re-labels times already typed. Their boxes keep their points, and new boxes follow the new choice.
- The analysis compares like with like:
  - places are worked out per distance (`splitPlacesFor`), so a heat with both kinds ranks each point among the runners timed there;
  - the race analysis lists every point read;
  - "fastest last lap" uses the last segment most runners share.
- **Code:** `raceSplitDefs.ts` (`athLapDistances`, `lapPointsDiffer`, `LAP_POINT_CHOICES`) and `raceDepth.ts` (`splitDistancesFor`, `entrySplitDistances`, `resultWithSplits`, `splitPlacesFor`).

## 3. Follower alerts for heat wins and PBs

- **Path:** the existing SD-131 one, so no migration is needed.
  1. As a round closes (`advancePhase`, `advanceCrewPhase`) or a final locks (`completeFinal`), the app leaves `format.highlights` on the `field_events` row.
  2. The existing `field_event_status_notify` trigger already calls notify-followers for every phase that turns `completed`, heats included.
  3. The function now reads the highlights on rounds as well as finals.
- **Who is told:** followers of the athlete only. For a relay's or crew's heat win, that is the followers of its members. Team and tournament followers keep the single final push per event, because a meet has hundreds of heats.
- **Alert choices:**
  - A heat win needs the follow's **Result** switch.
  - A PB needs the **big moments** (`scores`) switch.
  - If a heat winner also set a PB, a follower who only wants big moments still hears about the PB.
- **One push per follower per event:** a follower who follows several athletes in a round gets one combined message, e.g. "🏁 U14 Girls 100 m — Asha Rao and Bina Iyer". The ledger is `reminder_sends` (event_id, lead_key `'highlights'`), so a round that is reopened and closed again never pushes twice.
- **PBs** are the PB flags the official saw on screen. The screen passes them in, so an unconfirmed out-of-range mark never counts.
- **In a final:**
  - The gold medallist is left out of the highlights, because their own medal push names them. If they set a PB, that push now reads "… in 12.20 — PB" (a record of theirs still takes precedence).
  - The other heat winners of a timed final, and other athletes' PBs, go out as highlights.
- **Wording:**
  - "🏁 Asha Rao won Heat 2 — U14 Girls 100 m" (body "12.40 · PB · Sports Day 2026")
  - "📈 PB for Bina Iyer — U14 Girls 100 m" (body "12.60 (Heat 1)")
- The follow switches' hints now mention heat wins and personal bests (players only).
- **Code:**
  - App side: `src/data/results/raceHighlights.ts` and `alerts.ts` (`pb` on the gold medal).
  - Function side: `supabase/functions/_shared/resultHighlights.ts` (new) and `_shared/resultAlert.ts` (`pb`).
  - Function: `notify-followers/index.ts` (`handleHighlights`).
- **Deploy needed:** `supabase functions deploy notify-followers`. Until then the app writes the highlights harmlessly and nothing new is pushed.

## 4. "Records set" on athlete profiles

- **Record-book entries carry the holder's id:** `RecordMark.holderId` (an athlete) or `holderIds` (a relay's or crew's members). The id is written on every new meet record (`updateRecords`) and on the derived school book (`deriveRecordBook`, so it comes free from results).
- `merge_field_records()` stores the record JSON as given, so **no migration is needed**. Older and historic (typed) entries have no id and simply don't count.
- **When a final is locked:**
  - The records it **broke** are kept on the phase (`PhaseFormat.recordsSet`). These are the meet record against the tournament's book, and the school record against the organisation's book the official saw (the screen passes `srBook`).
  - Each holder's stat line for that final gets `mrSet` / `srSet`.
  - A re-sync rewrites the same keys from the phase. Reopening removes them with the lines.
- **Decision:** only a record that stood and was beaten counts. The first mark in an empty book starts the book; it is not "setting a record". This matches the results sheet (no MR / SR flag for it) and the commentary.
- **Profiles** (athletics, swimming, rowing, canoe, cycling): "🏆 2 meet records · 1 school record set", with each record opening its final (newest first). The results history rows show MR / SR. Stat schemas declare `mrSet` / `srSet` ("Meet records set" / "School records set", hidden at zero).
- Not done: combined-event totals (the total line and the last event's line belong to the same athlete; a follow-up). Precision sports are left to their owner: their records carry the ids too, but no line keys are written.
- **Code:** `src/data/results/recordsSet.ts`, `records.ts` (`recordHolderIds`), `resultsStore.ts` (`completeFinal` / `finalLinesFor`) and `components/results/RecordsSetCard.tsx`.

## 5. "Stats to track": meet-wide and per event

- The meet's choices stay in the sport's settings. An event can now override any of them in `PhaseFormat.track`. The override is set on every phase of the event, and later rounds copy it. An absent key follows the meet.
- **Where:**
  - **⚙ Stats to track — this event** on the event's entry screen (organisers, any time before the event is locked; folded by default);
  - the track / swimming event setup (folded by default; only the options the event has are kept).
- Each option shows its meet value when changed. Picking the meet's value again drops the override, and **Use the meet's choices** clears them all.
- **Only what applies is offered:**

  | Event | Options |
  |---|---|
  | 1500 m | reaction, lap times, lap points |
  | Relay | reaction, relay legs |
  | Swim relay | splits, reaction, take-overs |
  | Road race | chip times |
  | Crews | splits |
  | Cycling timed event | intermediate times |

- **Reaction box:** the event's override, else the phase's own creation flag, else the meet's current choice. A meet that switches reaction times on mid-meet now adds the box to events already set up, as the other toggles do. There is never a reaction box on the road.
- **Code:** `raceDepth.ts` (`raceTracking(sport, meet, own)`, `trackOptions`, `setTrackOverride`, `trackDefaults`, `trackEffective`, `reactionOffered`), `resultsStore.ts` (`setEventTracking`, `NewResultsEvent.track`) and `components/results/EventTrackCard.tsx`.

## Migrations and deploys

- **Migrations:** none. Holder ids ride in the record JSON, highlights in `field_events.format`, and the ledger reuses `reminder_sends` (lead_key is free text; kind `'follower'`).
- **Edge function:** `notify-followers`, which needs a deploy. It now imports `_shared/resultHighlights.ts`, and `_shared/resultAlert.ts` changed (`pb`).

## Tests

- **New:** `tests/timed-races-round2.test.mts` (31 tests). It covers:
  - timed-final heat winners;
  - lap points, mixed-point heats and old results reading unchanged;
  - per-event overrides;
  - records set, from the book through the lines to the careers;
  - highlights, including validation, alert choices and wording;
  - the store and edge-function wiring.
- **Updated pins:**
  - `swimming.test.mts`: a timed final's winner now has `heatWins: 1`.
  - `timed-races-depth.test.mts`: `raceTracking` gains `lapPoints: 'finish'`.

## Follow-ups

- Records set for combined-event totals; a "records held" view (standing records) from the book's holder ids.
- Make heat-win and PB pushes an organiser option per meet (on by default now).
- Precision sports (weightlifting, shooting, archery) could opt into `mrSet` / `srSet` and highlights; their owner decides.
