# IDs-only scoring data (children's names out of public match data)

**Decision (founder, 2026-10-24):** scoring data stores **player IDs only**. Names are looked up when shown, through the privacy-protected `players_view`:
- the child's circle (teammates, coaches, organisers, guardian) sees full names;
- everyone else sees initials;
- an open participation dispute shows "X".

The work goes sport by sport, racket sports and cricket first. Inventory with file:line references: [`ids-only-scoring-inventory.md`](ids-only-scoring-inventory.md).

## Why

`matches.state` (saved after every tap) and `match_events` (`attribution`, `payload`) are readable by anyone, logged out included. The scorer, who is inside the child's circle, sees full names and copies them into that public data. On live, 142 events carry `attribution.playerName`, and badminton and tennis states hold names. No child's data is affected today, but every school match would be.

## The rule after this work

| Stored | Holds |
|---|---|
| `matches.state`, `match_events.payload` / `attribution` | ids, slots, numbers: never a name, and never text with a name in it |
| text like "21-18 · Asha Rao", "c X b Y", "X ⬆ Y ⬇" | built at display time from ids |
| logic that tracks players (on court, subbed off, XI, box-score keys, card counts) | keyed by id |
| old logs that only have names | still replay identically: readers fall back to the stored legacy name, and the clean-up rewrites them |

## Stages

**0. One name lookup (shared seam, no visible change).**
- `PlayerNamesProvider` grows out of `DisputeMaskProvider`, with `nameOf(id, legacyName?)`. Its order is: dispute mask → roster or `players_view` name by id → legacy name → "Player".
- Provided on the live match screen, summaries and scorecards, the overlay, share cards and the tournament records screens.
- The pure builders (feeds, commentary models, box sources, tickers, undo labels, records, discipline) take it as an argument.
- Name→id lookups (`playerLink.idByName`, `boxSources` name keys, `rosterOf().find(fullName === …)`) move to ids where an id exists. Today they already fail for viewers outside the circle, who get initials.

**A. Racket sports + volleyball.**
- Sports: badminton, tennis, padel, pickleball, squash, table tennis, plus volleyball, which shares rallyEdit, box score and liveEvents.
- Shared modules: `rallyEngine`, `rallyCore`, `liveEvents`, `conduct`, `pointDetail`, `rallyEdit` / `RallyPointEditor`, the serve and doubles pickers, the racket commentary models, the racket box score and `racketTotals`.

**E. Cricket.** The heaviest: names on every ball, dismissal text, event details and `potm`.

**B. Invasion sports.** Football, hockey, handball, ice hockey, netball, rugby, rugby league and American football all share `credit` / `creditAttribution`, the XI / SUB / GK patterns, the invasion feed, `onField`, discipline, `recordHelpers` and the tickers.

**C. Kabaddi.** Shares the netraid feed with volleyball. Its SUB and mat queue are name-keyed today.

**D. Basketball.** `onCourt` and box score are name-keyed, and the `ids` name→id map is itself public.

**F. Baseball, plus G: chess, golf match play, carrom.** Baseball supports name-only players. Chess also needs the pasted PGN's `[White]` / `[Black]` tags removed.

**Z. Close-out.**
- **Server safety net:** new match data never keeps a child's name. Built as masking triggers rather than dropping keys, because the app still writes some name-like keys legitimately (`AMEND byName` is already initials for a minor) and names also sit inside text.
- **Data clean-up script:** map old name-only events to ids, then scrub `match_events`, `matches.state`, `match_lineups`, `potm`, `result.byName` and tournament awards. It is run by the founder, because live writes go through them.
- **The other public name stores:**
  - singles / doubles entry `teams.name`: a trigger masks children and stores `entry_ids`, and the app shows full names to the circle. This also fixes `homeName` / `awayName` and `stat_lines.opponent`.
  - `match_disputes` names
  - `activity_log.by_name`
  - AMEND `payload.lines` / `byName`
  - the 8 results sports' `field_entries` member names

## How each stage ships

1. Every stage must pass all of these before it ships:
   - **Types:** remove the name fields from the stage's types (`Attribution.playerName`, `LiveEvent.playerName`, the per-sport payload types) and let `tsc` list every writer and reader.
   - **Legacy replay:** the legacy fixtures (`*Legacy*.mts`, `racketLogs.mts`, `cricketLegacyLogs.mts`, …) must replay old name-only logs exactly as before.
   - **Tests:** tests that asserted on names in state are rewritten to assert on ids, plus names when shown.
   - **Demo:** the demo replays still render.
   - **Real check:** a real scoring session for that group's sports (Android update plus a test match on the founder's phone).
2. Ship order: web plus Android update per stage. Scoring keeps working throughout. Old app versions still write names until they update, so the server safety net (Z) goes on once the current app no longer needs them.
3. After Stage 0, the groups can run in parallel worktrees (A, E, B, C, D, F+G), merged one at a time with the full suite in between.

## Status

- **2026-10-24:**
  - decision taken; inventory done;
  - Stage 0 done (`8557c16`);
  - entry names done (`5b235ec`, migration run);
  - **A: racket sports + volleyball merged** (`6eac0f3`);
  - **E: cricket merged** (`2b3fa11`);
  - **C: kabaddi merged**; **F+G: baseball, carrom, chess, golf merged**; **D: basketball merged**; **B: invasion sports merged**, so **every sport is IDs-only**;
  - close-out: records, corrections, POTM / awards / disputes / activity / relay members and line-ups masked; `scripts/check-minor-names.sql` monitors.
- **Safety net (2026-10-27, founder "strip, don't refuse"; migration `20261027200000_match_names_safety_net`):** triggers on `match_events` (payload, attribution) and `matches.state` store every possible minor's full name as initials, whatever app version saves it. The minors counted are those linked to the match: both squads, rosters and entries, plus every player id in the data. Nothing is refused and nothing fails (fails open). Today's app sends ids only, so its data passes unchanged. Rows saved before stay for the clean-up script.
- **Next:** one release, then a real scoring test on a phone across the sports.
- Done before this: children show as initials outside their circle (`players_view` + the `players` policy) and listings by under-18s carry no phone.
