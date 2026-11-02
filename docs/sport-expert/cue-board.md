# Cue and board sports: the scorer's tap-by-tap mechanism (2026-11-02)

Sports: pool (8/9/10-ball, singles and scotch doubles), snooker, English billiards, carrom, chess.

**Angle:** a referee or stat-keeper scoring on one phone. For each sport: every way a shot, visit, board or game ends, and how the scorer records it now. Then the founder's chain (Info → Scoring → Stats / Commentary), and a ranked fix list.

**Already solved, not repeated here:**
- Pool: the scotch rotation, a wrong ball first, pair names, one-tap start (`docs/security/breaks/pool-*.md`).
- Carrom: foul types (ICF split), foul penalties in the score, the doubles "who" chip (`deep-wave/golf-chess-carrom*.md`).
- Chess: move list, PGN, openings, repertoire, TPR, knockout lists (same docs).

Rule sources: WPA Rules of Play 2026; WPBSA Official Rules (snooker and English billiards, May 2022); ICF / AICF Laws of Carrom; FIDE Laws of Chess (2023) and the rapid / blitz appendices.

Legend for the Gap column: ✓ = covered · partial · ✗ = not covered.

---

## 1. Pool

### Every way a shot or rack ends

| Ending | Effect (WPA) | How the scorer records it now | Gap |
|---|---|---|---|
| Legal pot, shooter continues | Same inning | Tap the balls, then **Pot · …** (`pool/index.tsx:276-298`) | ✓ |
| Pot not called, or the wrong pocket (8 / 10-ball) | Turn passes; at 10-ball the opponent chooses | **Not called (wrong pocket / ball)** chip (`index.tsx:280-282`) | ✓ |
| Only the opponent's group in (8-ball) | Ask what the cue ball hit first | "What did the cue ball hit first?" (`index.tsx:287-291`) | ✓ |
| Miss (nothing in, no foul) | Turn passes | **Miss** (`index.tsx:299`) | ✓ |
| Safety (called) | Turn passes; balls stay down | **Safety** (`index.tsx:303`) | ✓ |
| Fouls (WPA 3.1-3.15): scratch, wrong ball, no rail, off table, touched, double hit, push shot, jump, moving, no foot, placement, out of turn, slow play | Ball in hand to the opponent | **Foul ▸**, then 15 kind chips (`index.tsx:306-322`, labels `controls.ts:240-254`) | ✓ capture · partial in Stats (see chain) |
| Three fouls in a row (3.13) | Rack lost | Automatic; a warning on two fouls (`index.tsx:272`) | ✓ |
| Break: dry, balls in, break foul, illegal break, 8 on the break, three-ball rule | Opponent's options (4.3, 5.3, Reg 16) | Break panel (`index.tsx:199-237`) plus the **CHOOSE** buttons (`controls.ts:190-205`) | ✓ |
| Push-out (9 / 10-ball) and the pass-back choice | Opponent chooses | **Push out**, then the choice buttons | ✓ |
| Golden break, break-and-run, run-out | Rack won | Derived by the engine (`engine.ts:330-334`) | ✓ |
| 8-ball loss: 8 early, 8 in the wrong pocket, 8 on a foul, 8 off the table (4.8) | Rack lost | Derived from the pot or foul | ✓ |
| Stalemate (1.13) | Re-rack, same breaker | **More ▸ Stalemate** (`index.tsx:327-330`) | ✓ |
| Rack awarded: concession, unsportsmanlike conduct (3.16), forfeit | Rack to the opponent | **More ▸ Award this rack**, with no reason (`index.tsx:159`, `engine.ts:776`) | partial: no reason (snooker and billiards have one) |
| Shot clock and extensions (Playing Regs) | Foul on time; one extension per rack | Foul kind *Slow play* only | ✗ (P2) |
| Total performance average, TPA (Accu-Stats / CSI pro stat) | (balls + safeties + breaks) ÷ (the same + errors) | Not shown | ✗. All inputs are already captured. |

### The chain

| Link | Finding |
|---|---|
| **Info shows the settings** | ✗. `formatLine` (`LiveScoringScreen.tsx:2911`) has no pool branch: it prints only "1-a-side" or "2-a-side". The game, race, sets, who breaks, three-foul, three-ball rule and scotch turns are never shown. Pool has no `liveSettings` (by design, `core.ts:6-8`), so viewers can't see the rules at all. |
| **Info settings work in Scoring** | Mostly ✓. The game is pinned by the first event. Small break: **10-ball: an early called 10 wins** and **9-ball: three-ball rule** show for every game (`meta.ts:66-67`), so in an 8-ball match they are Info settings with no effect. |
| **Scoring reaches Stats** | Partial. 11 of the 15 foul kinds collapse into "Other fouls" in the Stats tab and in careers (`compare.ts:83`, `match.ts` `foulKeyOf`). Also never reach Stats: ball-in-hand count, push-outs accepted vs passed back, re-racks / stalemates, not-called pots. |
| **Scoring reaches Commentary** | Partial. The state keeps shot lines only for the rack in play plus the last 3 racks (`match.ts:98` `FEED_RACKS = 3`). In a race to 9, racks 1 to 5 shrink to one summary line, so shots the scorer tapped vanish from the commentary. |
| **Defaults** | ✓. Shot by shot is the default; "rack result only" sits under More. |

---

## 2. Snooker

### Every way a visit or frame ends

| Ending | Effect (WPBSA S3) | How the scorer records it now | Gap |
|---|---|---|---|
| Pot: red, several reds, colour, colours in order | Points; visit goes on | Ball buttons and "N reds" chips (`snooker/index.tsx:173-196`) | ✓ |
| Missed pot | Visit ends | **Missed** (`index.tsx:146`) | ✓ |
| Safety | Visit ends | **Safety** (`index.tsx:147`) | ✓ |
| Foul, value 4-7 | Value of the ball on, the ball hit first or the ball potted, whichever is highest (R11) | **Foul…**, then value chips defaulting to the minimum, plus a kind chip (`index.tsx:235-247`) | **partial, wrong scores possible.** The kind never sets the value: "wrong ball first" with the pink hit while on a red stays 4 unless the scorer also taps 6. |
| Foul and a miss; replace the balls; play again; free ball | R10, R12, R14 | Chips and buttons (`index.tsx:213-216, 251-252`) | ✓ |
| Three-miss warning, frame awarded (R14) | Frame to the opponent | Warning and **Award frame** (`index.tsx:137-138`) | ✓ |
| Reds down in a foul; penalty on the non-striker | R3(i), R3(k) | Chips (`index.tsx:256-265`) | ✓ |
| Last black; level, so the black is re-spotted | R4 | Automatic; the lots question (`index.tsx:102-105`) | ✓ |
| Concession; award (miss, conduct, time) | Frame ends | Frame options (`cue/parts.tsx:106-128`) | ✓ |
| Stalemate re-rack (R17) | Frame replayed | **Re-rack (stalemate)…** (`index.tsx:163`) | ✓ |
| Snookers required, points left | Display | `situationLine` (`controls.ts:289`) | ✓ |
| Breaks: 50+, century, maximum | Stats | Derived from visits | ✓ |
| A break's make-up (reds / blacks / colours) | Commentary, "total clearance" | The visit keeps only points, pots and shots (`engine.ts:38`) | ✗ (P2) |
| Safety success, long pots, rest use (WST broadcast stats) | Stats | Not captured or derived | Safety success can be derived ✗ (P1); long pots / rest are P2 optional chips |

### The chain

| Link | Finding |
|---|---|
| **Info** | ✗. `formatLine` prints "—" for snooker. Reds, best of and the scoring mode are invisible to viewers. |
| **Info settings work in Scoring** | ✓. `scoringMode` switches the quick panel (`controls.ts:252`). |
| **Scoring reaches Stats** | **Break:** the foul kind is captured and shown in Commentary (`feed.ts:17-20`) but has no Stats row and no career key (`matchStats.ts:49-55`, `totals.ts`). Billiards does show kinds (`billiards/matchStats.ts:53-56`), so the two cue sports disagree. |
| **Scoring reaches Commentary** | ✓. Visit by visit, foul extras included. |
| **Defaults** | ✓. Shot by shot is the default. |

---

## 3. English billiards

### Every way a stroke, visit or game ends

| Ending | Effect (WPBSA billiards S3) | How the scorer records it now | Gap |
|---|---|---|---|
| Pot red 3, pot white 2, in-off red 3, in-off white 2, cannon 2, and combinations | Points; visit goes on | Part buttons and **Combo…** (`billiards/index.tsx:118-124, 169-174`) | ✓ |
| 16th consecutive hazard / 76th consecutive cannon | Foul | Automatic (`engine.ts:287-293`); the button reads "· foul now" | ✓ |
| Miss, safety | Visit ends | **Missed**, **Safety** (`index.tsx:128-129`) | ✓ |
| Fouls (miss, coup, in hand, push, jump, touch, off table, baulk line…) | 2 points to the opponent (`foulPoints`) | **Foul…**, then kind chips (`index.tsx:187-190`) | ✓ |
| Points game reaches the target | Game ends, recorded at the target | Automatic | ✓ |
| Timed game: time called; level = sudden death or draw | R5 | **⏱ Time called** (`index.tsx:134`) | ✓ |
| Concession, award | Game ends | `cue/parts.tsx` | ✓ |
| Red potted twice running from the billiard spot (goes to the centre spot) | Position only, no score | Not prompted | ✗ (P2 scorer hint) |
| A break's make-up ("112: 20 red pots, 9 cannons…") | Commentary | Captured per visit (`engine.ts:30`) but the commentary prints only "break of 112" (`feed.ts:64-69`) | partial (P2) |

### The chain

| Link | Finding |
|---|---|
| **Info** | ✗. "—". Target, best of, timed rules, foul points and the hazard / cannon limits are invisible. |
| **Info settings work in Scoring** | ✓. All of them act (limits, foul points, timed tie, mode). |
| **Scoring reaches Stats** | ✓ in the match (strokes, kinds). Careers miss the foul kinds (P2). |
| **Scoring reaches Commentary** | Partial: no break make-up, although it is captured. |
| **Defaults** | ✓. Shot by shot. |

---

## 4. Carrom

### Every way a board or game ends

| Ending | Effect (ICF) | How the scorer records it now | Gap |
|---|---|---|---|
| Board won: opponent's coins left 0-9 | +1 each | **Board won by**, then a coins chip; Record is ready (`carrom/index.tsx:228-255`, `ready` at `:101`) | ✓ |
| Queen covered by the winner (+3, none at 22+), by the loser (0) | r.52-54 | **👑 Queen covered by (optional)** (`index.tsx:262-266`) | **partial, wrong scores possible.** Record enables without it (`ready = penalty \|\| coins != null`). A skipped Queen chip silently drops 3 points. In ICF the Queen is always covered before a board can end, so "who covered" always has an answer. |
| Slam, white or black | Record | Optional chip (`index.tsx:270-278`) | ✓ |
| Penalty board (+3, or +1 at 22+) | r.102-109 | **⚠️ Penalty board** (`index.tsx:247`) | ✓ |
| Board ended on the loser's foul (+1 / +1) | r.102-112 | Chips (`index.tsx:342-345`) | ✓ |
| Fouls by type, dues, coins on the break, missed Queen covers | Record | Optional rows, only when tracked (`index.tsx:287-333`) | ✓, but off by default (see chain) |
| 25 reached; 8 boards; level, then a tie-break board; best of 3 | Game / match | Automatic | ✓ |
| A board or game conceded or awarded (conduct, absence) | Board / game to the opponent | Only the whole match can be ended by hand | ✗ (P2) |

### The chain

| Link | Finding |
|---|---|
| **Info** | Partial. `formatLine` prints "1-a-side". Target, boards per game, match length and the ICF foul-penalty option are not shown. The ⚙️ Stats to track card is on Info ✓. |
| **Info settings work in Scoring** | ✓. |
| **Scoring reaches Stats and Commentary** | ✓ (deep wave and round 2). |
| **Defaults** | **Depth hidden.** `trackFouls`, `trackBreak` and `trackQueenMiss` all default off (`meta.ts:46-48`, `index.tsx:551-556`), the same pattern tennis had. *Recommend:* **Coins on the break** and **Missed Queen covers** on for new matches, because untapped reads "not recorded" or rarely matters. Keep **Fouls & dues** off, because "no taps = no fouls" would write false zeros when a casual scorer skips the row; turn it on only when the organiser marks the event as refereed. |

---

## 5. Chess

### Every way a game ends

| Ending | Effect (FIDE) | How the scorer records it now | Gap |
|---|---|---|---|
| Checkmate, resignation, on time, illegal move, forfeit, adjudication, arbiter | 1-0 / 0-1 | Result tile, then **How (optional)** chips (`chess/index.tsx:222-238`) | ✓ |
| Draws: agreement, stalemate, threefold, fivefold, 50 / 75-move, insufficient material, flag vs insufficient material, dead position | ½-½ | Same, with the draw chips (11) | ✓ |
| Double forfeit 0-0 | Both lose | **0-0 Double forfeit** (`index.tsx:230`) | ✓ |
| Mate or stalemate on the entered moves | Pre-selects the result | `boardResult` (`engine.ts:355`) | ✓ |
| Arbiter scores ½-0 / 0-½ (Art. 11-12 penalties, or both flags in blitz in some rules) | Uneven score | Not representable | ✗ (P2) |
| First illegal move, a warning with time added to the opponent (Art. 7.5.5); the next one loses | In-game event | Only the losing illegal move exists (as a result); the warning has nowhere to go | ✗ (P2) |
| Draw offers, claims, time-added penalties | In-game events | Not captured | ✗ (P2) |
| Time control: base + increment; multi-period (90/40 + 30, +30s); delay | Record | `timeControl` + `tcBase` / `tcInc` (`meta.ts:16-29`); no second period, no delay | partial (P2) |
| Clock left at the end | Record | Optional fields (`index.tsx:250-258`) | ✓ |

### The chain

| Link | Finding |
|---|---|
| **Info** | ✗ in Info itself. `formatLine` prints "—". The time control shows only in the scoreboard status line (`index.tsx:294`). The knockout tie-break plan (games, rapid pairs, blitz pairs, Armageddon) is shown nowhere before play. |
| **Info settings work in Scoring** | ✓. `tcInc` drives time per move only with the clock tracked. Otherwise it is a record, as its hint says. |
| **Scoring reaches Stats** | Partial. The method is **optional**, so a quick scorer leaves it empty and careers fill `winsOther` instead of mate / resign / time. Draws by method and losses by method have no rows. |
| **Scoring reaches Commentary** | ✓. |
| **Defaults** | Move list and clock are off (`meta.ts:41-42`). *Recommend:* keep them off. One arbiter often runs many boards, and typing moves live is not "one scorer, scoring stays fast". The PGN paste after the game is always there, so the depth is reachable. |

---

## 6. Ranked fix list

**Practicality filter (applies to every item):** one scorer, one phone; any extra capture is optional; a scoring tap never gets slower.

| # | Pri | Size | Sport | What changes | Event-log impact |
|---|---|---|---|---|---|
| 1 | **P0** | S | Carrom | **The Queen question becomes required on a played-out board.** Record waits for *Winner / Loser / Not covered*. Keep "Not covered" for casual play, and auto-hide it under ICF presets. | None. `queenBy` is already in the payload. Old boards replay as stored. |
| 2 | **P0** | M | Snooker | **The foul value follows the ball.** After the kind, a single "ball involved" chip row (red … black) sets the value to max(4, ball on, ball involved). Manual value chips stay as an override. | None. `value` is already in the payload. Old logs replay identically. |
| 3 | **P1** | S | All five | **Info shows the format.** Add a per-sport `formatSummary(fmt)` to the plugin, and have `formatLine` use it. Examples: "8-Ball · race to 5 · alternate break · scotch (every other shot)"; "15 reds · best of 7 · shot by shot"; "150-up · best of 5 · foul 2 · hazards 15"; "to 25 · 8 boards · best of 3 · ICF foul penalties"; "Rapid 15+10 · KO: 2 games, 1 rapid pair, 1 blitz pair, Armageddon". | None (display only). |
| 4 | **P1** | S | Snooker | **Foul kinds reach Stats and careers**, as billiards already does: match rows per kind, plus keyed career keys (an older match reads "not tracked"). | None. Read from the stored `fouls[].kind`. |
| 5 | **P1** | S | Pool | **Every foul kind gets its own Stats row** (shown only when non-zero), and keyed career keys for the common ones (illegal break, double hit, jump, push shot, touched). | None. `foulsBy` already holds every kind. New line keys are keyed, so older lines read "not tracked". |
| 6 | **P1** | M | Pool | **Commentary keeps every rack's shots.** Derive the feed from the event log (as snooker derives from frames), or raise `FEED_RACKS` with a size cap per match. | The derivation reads the same log, so old matches gain their full commentary. Nothing new is stored. |
| 7 | **P1** | S | Pool | **Award reason**: concession · conduct (3.16) · forfeit · other. Use the same chips as snooker and billiards (`cue/parts.tsx`). | New optional payload key `reason` on RACK. Old RACKs have none. |
| 8 | **P1** | S | Chess | **"How" is asked, not optional.** The four common methods come first (Resignation, Checkmate, On time, Agreement), then "More…". "Not recorded" is allowed with a tap, never by default. Add rows for draws and losses by method. | None. Old results without a method stay as they are. |
| 9 | **P1** | S | Carrom | **Default on: Coins on the break and Missed Queen covers** for new matches and tournaments. Fouls stay off unless the event is refereed. | None. Format defaults only; old formats have no key. |
| 10 | **P1** | S | Pool | **TPA** (pro standard) on the Stats tab and in careers, derived from pots, safeties, breaks, misses and fouls. | None (derived). |
| 11 | **P1** | S | Snooker | **Safety success %**, derived: a safety counts as successful when the opponent's next visit scores 0 and ends in a miss, safety or foul. | None (derived). |
| 12 | P2 | S | Pool | Hide **10-ball early call** unless the game is 10-ball, and the **three-ball rule** unless it is 9-ball. This needs `hideWhen` to accept "not equal". | None. |
| 13 | P2 | S | Billiards | Break make-up in the commentary ("112: 20 red pots, 9 cannons, 6 in-offs"). The data is already in each visit. | None. |
| 14 | P2 | M | Snooker | Keep the break's make-up (reds, blacks, colours) in the visit, for the commentary and a "total clearance" stat. | New optional visit key. Old visits have none. |
| 15 | P2 | S | Billiards | Hint: "red goes to the centre spot" after two consecutive pots from the billiard spot. | None. |
| 16 | P2 | M | Chess | In-game arbiter events: illegal-move warning (+time), draw offer. The second illegal move pre-selects the loss. | New optional action type. Old logs have none. |
| 17 | P2 | M | Chess | Uneven arbiter scores (½-0 / 0-½), and a second time-control period / delay. | New optional keys. |
| 18 | P2 | S | Carrom | Concede or award a board or game, with a reason. | New optional BOARD payload key. |
| 19 | P2 | S | Pool, snooker | Shot-clock extension used (pool); long pot / rest (snooker), as optional chips behind "Stats to track". | New optional keys. |

---

## Shared fixes

- **One `formatSummary` per sport** (fix 3). This is the missing first link of the chain for all five sports. `formatLine` today only knows the team sports, and prints "1-a-side" or "—" here.
- **Pinned-rule sports need a read-only rules card on Info.** Pool deliberately has no `liveSettings`, so nothing on Info lists its rules once the format locks. A read-only card from the same `formatFields` (one line per setting, marked "locked once play started") closes it for any sport.
- **One award / concession vocabulary** across the cue sports and carrom: concession · conduct · time · forfeit · other. Snooker and billiards already have it in `cue/parts.tsx`. Pool and carrom should reuse it.
- **Foul kinds have one rule:** captured → in Commentary → a Stats row when non-zero → a keyed career key. Billiards follows it in the match, pool half follows it, snooker skips Stats.
- **A required question never defaults to a hidden zero.** The carrom Queen and the snooker foul value are the two places where skipping a tap silently changes the score. Everything else that is optional affects stats only.
