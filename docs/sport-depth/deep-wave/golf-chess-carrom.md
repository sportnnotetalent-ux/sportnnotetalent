# Deep wave: golf, chess and carrom

**Founder ask (2026-10-22).** Take the depth of an ATP "Match Stats" page and live commentary to every sport. Let users choose which stats to track and give them in-depth analysis: the scoring mechanism, the match summary and the stats. Use the recommended option wherever unsure, and list doubts for later.

**Rules followed:**
- Default scoring stays one tap per event. All new depth is optional "Stats to track", off by default, unless it is free (derived from what is already captured).
- Old logs replay identically. Nothing untracked is shown as 0.
- Stats follow the federation / broadcast standard.
- Player credits are absolute, through `statTotals`, and keyed by player id.

**Sources:**
- **Golf:** PGA TOUR stat definitions (ShotLink era): Driving Distance (two measured holes), Driving Accuracy, GIR, Scrambling, Sand Save %, Putts per GIR, One-Putt %, 3-Putt Avoidance, Putting from 3–10 ft / 10–20 ft / > 20 ft, Birdie or Better %, Bogey Avoidance, Bounce Back, Par 3 / 4 / 5 Scoring Average, Front / Back 9 Scoring Average, Birdie or Better Conversion; the DP World Tour stats pages; R&A Rules of Golf 2023 (3.3b, 21); WHS 2024.
- **Chess:** FIDE Laws of Chess 2023 (Art. 5, 6, 9, Appendix C on algebraic notation); the PGN Standard (1994) with the `[%clk]` comment extension used by chess.com and lichess; the ECO classification (A00–E99); FIDE Olympiad scoring (board points and match points); chess.com / lichess game reports.
- **Carrom:** ICF Laws of Carrom (fouls, dues, penalty board, Queen and cover, the break, slams); ICF / AICF score sheets.

**Checked first in BACKLOG:**
- Golf: SD-45 (stats row), SD-87 (match play with strokes), SD-88 (scorecard) and SD-122 (course editor) were done.
- Chess: SD-36/67 (methods), SD-85 (ratings / TPR), SD-117c (clock left) and SD-121 (KO tie-breaks) were done.
- Carrom: SD-37/68/78/86 (totals, score sheet, slams, career) and SD-134 (doubles break order) were done.

The work below adds to those; it does not redo them.

---

## 1. Golf

### Gap audit (marker with one phone)

| Stat (standard) | Before | Now |
|---|---|---|
| Fairways hit, missed L / R | ✅ SD-45 stats row (phone toggle) | ✅ "Fairways" in **Stats to track** |
| GIR | ✅ derived from putts, stats-row cards only | ✅ derived wherever putts are tracked |
| Putts, putts per GIR | ✅ | ✅ |
| One-putts, three-putts (3-putt avoidance) | ❌ | ✅ free once putts are entered |
| First-putt length / putting by distance | ❌ | ✅ optional bucket per hole (< 3 ft, 3–10, 10–20, 20 ft+) |
| Sand saves | ✅ | ✅ "Bunkers" |
| Up-and-down / scrambling | ✅ scrambling | ✅ (labelled "Scrambling (up & down)") |
| Penalty strokes | ✅ | ✅ "Penalties" |
| Driving distance (2 measured holes) | ❌ | ✅ optional yards on the organiser's measured holes (default: any par 4 / 5) |
| Eagle / birdie / par / bogey / double distribution | ✅ (Eagles+) | ✅, plus holes in one and albatrosses (free) |
| Par-3 / 4 / 5 scoring average | ❌ | ✅ free |
| Front / back 9 | Out / In on the card only | ✅ Out / In on the stats panel; front and back 9 scoring averages in the career (free, complete 18-hole rounds) |
| Bounce back, birdie or better %, bogey avoidance, birdie conversion | ❌ | ✅ free (birdie conversion once putts are entered) |
| Hole-by-hole commentary | ❌ (match play: a plain list) | ✅ stroke play and match play |
| Match-play hole status | ✅ | ✅ in every commentary line ("Asha 2 UP thru 7", "dormie 3") |
| Strokes Gained, proximity to hole, launch data | — | **Out of scope:** needs ShotLink / launch monitors |

### What was built
- **Stats to track** (`golf/track.ts`, `components/golf/GolfTrackCard.tsx`):
  - Putts · Fairways · Bunkers · Penalties · First-putt length · Driving distance.
  - The **organiser** sets them for every marker in the round (`field_events.format.track`, plus `format.driveHoles` for the measured holes).
  - Otherwise each **marker's phone** keeps its own setting. A phone that had the SD-45 stats row on starts with its four stats.
  - Off by default. The row collapses to one line.
- **Capture** (`components/golf/GolfHoleStats.tsx`):
  - One row per tracked stat under the strokes: FW ◀ L · ✓ · R ▶, the drive in yards, ⛱ Bunker, Pen ±, the first-putt bucket (after a putt) and GIR ✓ / ✗.
  - Each card records the `track` it was kept with, so its line gets keys stat by stat.
  - Each hole gets a time stamp (`card.holeAt`) for the commentary.
- **Commentary** (`golf/feed.ts`, `components/golf/GolfRoundDeep.tsx`):
  - Stroke play reads like "Asha Rao — birdie 3 · 3 under through 7", with the detail in words ("268-yd drive · found the fairway · green in regulation · 1 putt from 3–10 ft"). Stableford shows points; net rounds read "net …".
  - Grouped by hole, newest first, newest entry first within a hole. Each hole shows its field average. Players can be filtered.
  - Match play reads like "Hole 7 (par 4): Asha wins with a birdie 3 to Ravi's par 4 · Asha 2 UP thru 7", grouped by nine, with net strokes, dormie, the closing hole and a concession.
- **Round stats panel** (`golf/statSheet.ts`):
  - The PGA TOUR groups: Scoring, Off the tee, Approach, Around the green, Putting.
  - One player beside the field average (rates pooled over the cards that tracked them), for the round or Out / In.
  - Shown on the leaderboard tab (🎙 Commentary · 📊 Round stats) and in every card drill-down (📋 Card · 📊 Stats · 🎙 Hole by hole).
- **Career** (`golf/stats.ts`, `components/golf/GolfCareerDepth.tsx`, mounted on the golf profile):
  - **Scoring by par and nine:** par-3 / 4 / 5 averages, front / back 9 averages, birdie or better %, bogey or worse %, bounce back, holes in one, albatrosses.
  - **Off the tee:** driving distance, longest drive, drives measured.
  - **Putting:** one-putt %, three-putt %, birdie conversion, putting by first-putt length.
  - Every key is `keyed`, with "over N of M rounds" coverage notes.

### Decisions (recommended option chosen)
- **Who sets the stats:** the round's organiser for every marker, else the marker's phone. *Alternative:* per phone only, as SD-45 did; that leaves cards inconsistent within a round.
- **Units:** yards for drives and feet for putts, as the PGA TOUR and DP World Tour publish. *Alternative:* an organiser option for metres.
- **Measured drive holes:** the organiser picks them (the PGA TOUR uses two, played in opposite directions). With none picked, any par 4 / 5 the marker measures counts. *Alternative:* force two holes.
- **Putt buckets:** < 3 ft, 3–10 ft, 10–20 ft, 20 ft+ (the PGA TOUR's "inside 10 ft" splits). *Alternative:* the full 3–5 / 5–10 / 10–15 / 15–20 / 20–25 / 25+ ladder, which is too many chips for one tap.
- **Sand save:** as SD-45 already defines it (out of a greenside bunker and down in one putt or fewer, whatever the score), which is the PGA TOUR definition. In the commentary the scramble line reads "saved par" / "up and down for birdie".
- **Free figures on older rounds:** a round re-finished later (handicap edit, course recompute) gains the free keys (par-3/4/5, bounce back, one- / three-putts). Its score and every older key are unchanged. The golf test that pinned an old card's keys now lists these additions explicitly.
- **The golf key `aces` became `holesInOne`,** because tennis owns `aces` with other labels.

### Open questions for the founder
1. Should the drive also be entered in metres for Indian school events (with a format option), or are yards fine?
2. Should driving distance, putting by distance and par-3/4/5 averages join the **tournament leaders / award slots**? Leaders are pinned by shared tests (`tests/stat-schema.test.mts`, `tests/leaders-awards.test.mts`), so this wave adds the stats with qualifiers but doesn't list them as leaders.
3. Should up-and-downs be tracked as a separate stat from scrambling? That would need a "shots from off the green" count; today scrambling stands in for it.

### Follow-ups not built
- A projected position after each hole in the commentary (the leaderboard at that moment).
- Ace / albatross badges on the profile (GF-14).
- A shotgun start: the feed orders by hole, not by start hole.
- Leaders and awards for the new figures (see Q2).

---

## 2. Chess

### Gap audit

| Stat (standard) | Before | Now |
|---|---|---|
| Result, method (18 FIDE methods), colours, time control, clock left at the end | ✅ | ✅ |
| Move-by-move entry (SAN), legality | ❌ (CH-09 parked) | ✅ optional; every move is checked against the position (pins, castling through check, en passant, promotion) |
| PGN paste (DGT / chess.com / lichess), with `[%clk]` | ❌ | ✅ during or after the game; replaces the list; tags read |
| Opening (ECO) | ❌ | ✅ read from the moves (longest ECO line), from a PGN `[ECO]` tag, or typed by hand |
| Time per move | ❌ | ✅ optional "Clock after each move", or the PGN clocks; increment-aware |
| Game length in moves | ✅ typed | ✅ also filled in from the list |
| Colour stats | ✅ SD-25 splits | ✅; team matches add "score with White / with Black" |
| Performance rating | ✅ SD-85 (ARO / TPR on the profile) | unchanged (leader slot: see Q3) |
| Move-by-move commentary | ❌ | ✅ |
| Game stats panel | ❌ | ✅ by phase |
| Board-by-board team-match summary | rubbers list only | ✅ |
| Engine evaluation, accuracy %, blunders | — | **Out of scope:** needs an engine |

### What was built
- **Board** (`chess/board.ts`): a compact, dependency-free legal-move generator (FEN, SAN read / write with disambiguation, check / mate, material).
- **Reading moves** (`chess/pgn.ts`): PGN, comments, `%clk`, variations, NAGs and result tokens; a bare list or coordinates (`g1f3`) work too.
- **Openings** (`chess/openings.ts`): 109 main ECO lines, every one verified legal by a test.
- **Engine** (`chess/engine.ts`):
  - New actions `MOVES` (`add` / `pgn` / `drop`), `OPENING` and `SET_TRACK`. These are new action types, so older logs replay unchanged.
  - New state keys `game`, `opening`, `track` and `resultAt` (RESULT `payload.at`).
  - The move list is allowed after the result.
  - Knockout mini-matches keep no list.
- **Capture** (`chess/MovesPanel.tsx`):
  - With **Move list** on, a ♟ Moves box appears on the Scoring tab: type the next move(s), see "✓ 3 moves" or the exact error, add an optional clock reading, and use ⌫ Last move.
  - "📋 Paste a whole game (PGN)…" works at any time.
  - After the result, the paste box sits on the Score tab for scorers (the Scoring tab only says "Match complete" by then).
  - Opening (ECO)… sets the opening by hand.
  - Recording the result fills in the move count from the list.
- **Commentary** (`chess/gameFeed.ts`):
  - Lines read like "23. Nxe5+ — Anand: knight takes the pawn on e5, check", with the material after the move ("White +2"), the clock left, the time the move took and the time stamp.
  - Grouped by move, newest first, with the result on top.
  - A result-only game gets the result sentence with its length and clocks; a KO mini-match gets one line per game, grouped by stage.
- **Game stats** (`chess/gameStats.ts`):
  - White vs Black: moves, captures, material captured, checks, castling (with the move), promotions, material on the board, time left, average time per move, longest think.
  - Shown for the game, opening, middlegame or endgame.
- **Careers** (`chess/totals.ts` as a partial `statTotals`; the result credit stays live):
  - Keys `lenGames` / `lenMoves`, `mvGames`, `checks`, `captures`, `matWon`, `castled`, `promotions`, `clkMoves` / `thinkSecs`.
  - A new **Game record** section: average length, checks and material per game, castled %, promotions, average time per move.
- **Team matches** (`chess/tieBoards.ts`, `ChessTieBoards.tsx` on the tie page):
  - Boards read like "Board 1: Anand (W) 1-0 Carlsen (B) · Resignation · 41 moves · C60 Ruy Lopez".
  - Each team's score with White and with Black is shown.

### Decisions (recommended option chosen)
- **Legality:** a full legal-move check, not syntax only, because a scorer's typo is caught at once. *Alternative:* "legality-lite" regex SAN, which is smaller but would accept impossible games.
- **Phases:**
  - The opening is the first 10 moves.
  - The endgame starts once both sides have ≤ 13 points of pieces besides pawns (Q 9, R 5, B / N 3).
  - *Alternative:* a lichess-style "mixedness" phase division, which is heavier and harder to explain.
- **Opening name:** a typed ECO beats a PGN tag, which beats the moves. Transpositions aren't detected.
- **Move lists in knockout mini-matches are not kept** (one list per fixture). *Alternative:* a list per KO game, which is a follow-up.
- **The move list doesn't change the result.** A mate on the board doesn't auto-record 1-0; the arbiter still records it, and the method chips stay the source of truth.
- **Stale keys after a full undo:** if a pasted list is undone after the game, the synced move keys can stay on the line until the next correction. This is a rare edge case and the totals are recomputed on any later change.

### Open questions for the founder
1. Should a checkmate or stalemate on the entered moves **pre-select** the result (still asking to confirm)?
2. Should openings get a career "repertoire" view (record by ECO family)? It needs the ECO kept per line, for example as a numeric key.
3. Should there be a **Performance rating** leader slot (TPR, minimum games)? It needs the ratings data layer, and leaders are pinned by shared tests.
4. Should KO mini-matches keep one move list per game?

### Follow-ups not built
- A board diagram (FEN view) at a chosen move.
- Annotation symbols (!, ?) in the feed.
- Exporting the game as PGN (share).
- TPR leader (Q3).

---

## 3. Carrom

### Gap audit

| Item (ICF) | Before | Now |
|---|---|---|
| Board-by-board scoring, Queen covered by winner / loser / none, slams, penalty board, breaker / toss, doubles break order | ✅ | ✅ |
| Points per board | ✅ (career) | ✅ also per side in the match panel |
| Coins pocketed per board | ❌ | ✅ free in the match panel (winner 9, loser 9 − coins left; net of dues returned) |
| Coins pocketed on the break | ❌ | ✅ optional (the breaker's count 0–5+) |
| Queen pocketed, cover missed | ❌ | ✅ optional, per side |
| Fouls by type (striker pocketed, touching, line / hand, thumbing, other), dues | ❌ (CR-09 parked) | ✅ optional, per side per board |
| Board winner commentary | score sheet table only | ✅ "Board 5 — Rahul clears with the Queen, +4 (1 coin left + Queen) · Rahul leads 17–9" |
| Match stats panel | box score only (points / boards / Queens) | ✅ Scoring · Queen · Break · Fouls, match or one game |
| Per-stroke pocketing per player (who pocketed what, stroke by stroke) | — | **Out of scope:** needs a second scorer or video |

### What was built
- **Engine** (`carrom/engine.ts`):
  - Optional `BOARD.payload.det` (`fouls` by side and type, `dues`, `brk`, `qMiss`) and `payload.at`.
  - `SET_TRACK` plus the format flags `trackFouls`, `trackBreak` and `trackQueenMiss`.
  - The detail and time survive the board editor (`EDIT_LOG`).
- **Capture** (carrom controls), each shown only when tracked:
  - "Break: coins {breaker} pocketed" chips.
  - Foul chips per player by type, plus Due and Clear.
  - "👑 Queen pocketed, cover missed" per side.
  - The **⚙️ Stats to track** live settings use event mode (format before board 1, then `SET_TRACK`), and the same toggles are in the format's advanced options.
- **Commentary** (`carrom/feed.ts`):
  - Grouped by game, newest first, with the running score or game result after each board.
  - Each line carries the breaker, the tracked detail and the time.
- **Match stats** (`carrom/matchStats.ts`):
  - Scoring (points, boards, points per board won, best board, coins pocketed, penalty points, slams), Queen (+3, at 22+, covered by the loser, missed covers), Break (boards broken, won on own break, coins on the break, coins per break) and Fouls (total, by type, dues).
  - Partial coverage is noted ("tracked on 2 of 3 boards").
- **Careers** (`carrom/totals.ts`, `carrom/stats.ts`, all `keyed`):
  - `fouls` / `foulStriker` / `foulTouch` / `foulLine` / `foulThumb` / `foulOther` / `dues` / `foulBoards`, `queenMisses` / `qMissBoards` (singles), and `brkPocketed` / `brkTracked` (the breaker; in doubles only with a break order).
  - Sections **The break** and **Fouls & dues**.

### Decisions (recommended option chosen)
- **Foul types:** striker pocketed · touching · line / hand · thumbing · other. **Thumbing is legal under ICF**, so it is counted only where an event's own rules ban it (the guide says so). *Alternative:* drop thumbing, as the founder's list included it.
- **Doubles fouls and missed covers are not credited to players:** the board log doesn't say which partner fouled. They appear in the match panel per side. *Alternative:* a "who" chip per foul in doubles (one more tap).
- **Defaults when tracking is on:** no foul taps means "no fouls" (counted as 0). Coins on the break stay "not recorded" until tapped, so there is no false 0.
- **Coins pocketed is not written to careers.** It is a match-panel figure only, which avoids changing every line's keys.
- **Leaders and award slots are unchanged** (pinned by shared tests). The audit's "Most slams" award and the new figures are a follow-up.

### Open questions for the founder
1. Is the foul list right for AICF events? Should "Line / hand" split into base line, arrow and elbow-crossing?
2. Should a foul's penalty (returning a coin / a due) be enforced in the score? Today it is a record only, and the board result is what the referee writes.
3. Should doubles fouls get a "who" chip so careers can carry them?

### Follow-ups not built
- Slams / board % / 25-0 leaders and a "Most slams" award (needs the pinned leader tests updated).
- Per-player pockets in doubles.

---

## 4. Cross-family notes

- **Event-log impact:**
  - New action types: chess `MOVES` / `OPENING` / `SET_TRACK`; carrom `SET_TRACK`.
  - New optional payload keys: `at` (carrom BOARD, golf match HOLE / CONCEDE, chess RESULT) and `det` (carrom BOARD).
  - New optional golf card keys (field_entries.result JSON): `track`, `firstPutt`, `drive`, `holeAt`.
  - Older logs and cards carry none of these. Tests replay them and check that no new key appears.
- **Migration:** none.
- **Shared UI kit (new files):** `src/sports/gcc/model.ts` (pure feed and compare shapes), `CommentaryFeed.tsx`, `CompareTable.tsx`. They are reusable by any sport.
- **Shared-file edits:**
  - `src/screens/SportProfileScreen.tsx`: mounts `GolfCareerDepth` in the golf block (1 import + 2 lines).
  - `src/components/TeamTieView.tsx`: mounts `ChessTieBoards` for chess ties (1 import + 5 lines).
  - `src/screens/GolfRoundScreen.tsx` (golf-only):
    - "Stats to track" replaces the putts / stats-row toggles.
    - The stats row is now `GolfHoleStats`.
    - The hole time stamp is added.
    - The leaderboard tab gains Commentary / Round stats.
- **Tests:** `tests/golf-deep.test.mts` (25), `tests/chess-deep.test.mts` (29), `tests/carrom-deep.test.mts` (14). `tests/golf-admin-board.test.mts` now lists the free golf keys explicitly.
