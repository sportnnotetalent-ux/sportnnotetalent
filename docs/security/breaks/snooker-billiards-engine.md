# Break list: snooker and English billiards engines

**Feature:** the pure scoring engines `src/sports/snooker/engine.ts` and `src/sports/billiards/engine.ts` (design: `docs/sports/SNOOKER_BILLIARDS_DESIGN.md`), as committed in `bb9136f`.

**How it was attacked (2026-10-28):**
- An independent breaker agent (one agent builds, a different one breaks) ran its own probes: 480,000 fuzzed actions over 800 seeded matches, hostile values, `__proto__` / `constructor` keys, names in every field, frozen and truncated states, and replay timings up to 100,000 events.
- The builder added its own review against the rules text and the brief's checklist.

**Where the engines sit:**
- Every action lands in the public event log. Every device rebuilds the state by replaying that log from `createInitialState(config)`; undo is a replay without the last event.
- The stored `matches.state` snapshot is public. It is read by the projections (`summary`, `scoreLine`, stats…), never fed back into the reducer.
- Only a match's scorers can write events (RLS). Old app versions and other clients may send anything.

**Status key:** every point was written down as **open** first (commit `3a6b092`), then marked **fixed** (with the commit; each fix started with a test that failed: `B-xx` in `tests/snooker-engine.test.mts` / `tests/billiards-engine.test.mts`) or **accepted** (with the reason).

---

## Points found (written before any fix)

### B-01. A crafted stored state pollutes `Object.prototype` through the stats
- **How:**
  1. Take a stored state.
  2. Put a visit with `side: '__proto__'` and a foul with `by: '__proto__'` into a frame record.
  3. Call `snookerStats` or `billiardsStats`.
- **What happens:** `({}).visits` and `({}).highestBreak` become NaN for every object in the process. `side: 'constructor'` writes onto the global `Object`, and `kind: 'constructor'` adds a junk key to `foulsByKind`.
- **Also:** a state with `frame.striker: '__proto__'` makes the reducer write an own `"__proto__"` key into the score.
- **Impact:** integrity of the whole app process and crashes, from a public snapshot.
- **Status:** **Fixed** in `baa6633`. The stats and `breaks` read only records with a real side and finite numbers, and an unknown foul kind is dropped. A crafted `striker` can't reach the reducer either (B-05). Test: `B-01` in both engine test files.

### B-02. A repeated frame-ending action ends the next frame
- **How:** `CONCEDE {side: 'away'}` twice, `FRAME_SCORE {70, 30}` twice, or `AWARD_FRAME` twice. Each one ends a frame, so a best of 3 is over 2-0.
- **Impact:** integrity. A double tap, a retry or a second scorer's stale tap ends a whole frame. Nothing ties these actions to a frame.
- **Status:** **Fixed** in `6b632ca`. `CONCEDE`, `AWARD_FRAME`, `FRAME_SCORE` (and `RERACK`, B-19) must carry `payload.frame` = the frame in play, and any action stamped with another frame is ignored as stale. The controls stamp it. Test: `B-02`.

### B-03. A stale `FOUL` naming a side becomes a penalty against the wrong player
- **How (snooker):** `FOUL side:'home' {value: 4}` twice. The second arrives when home is no longer at the table, so it is read as a non-striker penalty (S3 R3(k)). Away gets 8.
- **Also:** a double side-less `MISS` / `SAFETY` flips the turn twice.
- **Impact:** integrity. This contradicts the design's promise that a stale tap "can never credit the wrong player".
- **Status:** **Fixed** in `e1e090f`. A non-striker penalty must carry `penalty: true` and name the non-striker; any other `FOUL` naming a side must name the striker. Test: `B-03`.
- **Accepted (the side-less double tap):** a `MISS` / `SAFETY` with no side can't be told apart from two real misses. The vocabulary carries the striker's `side` and every shot naming a side that has left the table is refused (tested). **The controls must send `side` on every shot** (integration list).

### B-04. Replay time grows with the square of one frame's length
- **How:** 20,000 `SAFETY` actions in one frame replay in 0.44 s, 40,000 in 2.2 s, 100,000 in 14 s (a Mac; phones are slower). Striker fouls are about twice as slow, and billiards misses the same.
- **Why:** every visit end or foul copies the frame's whole `visits` / `fouls` array.
- **Impact:** availability. Every viewer replays on connect, reconnect and undo. Real matches are fine: a best of 35 replays in 2 ms.
- **Status:** **Fixed** in `22235c4`. A frame keeps at most `MAX_FRAME_RECORDS` (5,000) visits + fouls; past the cap the turn can't pass, but pots / scoring strokes and the frame-ending actions still work. 40,000 junk events: 2.6 s → 17 ms. A long professional frame has about 150 records. Test: `B-04`.

### B-05. Truncated or old-looking states make the engine throw
- **Projections:** `summary({frames: []})` throws. A frame record that is `{}`, `null`, or missing `score` makes `summary`, `scoreLine`, `lineScore`, `standingsUnits`, the stats, `breaks` and billiards `result` throw.
- **Reducer:** `reducer({...s, frame: {}}, MISS)` throws; so do most actions on a frame missing `visit`, `visits`, `fouls` or `score`.
- **Impact:** crashes. The contract is "never throw", and the projections run on stored snapshots (MiniScore, result rows).
- **Status:** **Fixed** in `e1a1990`, with B-13 and B-14. The reducer advances only a state with its own shape (`isSnookerState` / `isBilliardsState`), under a try/catch net. Every projection reads only well-formed frames and falls back instead of throwing. Test: `B-05 / B-13 / B-14`.

### B-06. A non-striker penalty on the last black does not end the frame
- **How:** with only the black left, `FOUL side:<non-striker>`. The points are added and the frame goes on. The same penalty on the re-spotted black ends it.
- **Impact:** rule integrity, if it is wrong.
- **Status:** **Accepted (it is the rules' wording).** S2 R15: a penalty is an infringement that doesn't affect the order of play; it is not a foul. S3 R4(a) ends the last black on the first pot or **foul**; R4(b)(iv) ends the re-spotted black on the first pot or **infringement**. The engine follows the text. Pinned by a test (`B-06`, `e39b40c`).

### B-07. A concession or award by the side ahead shows the loser ahead
- **Snooker:** a frame conceded at 80-0 by home is won by away but reads "80-0".
- **Billiards, single game:** `result()` reports points, so the standings get `{winner: 'away', home: 71, away: 47}`, and an award at 0-0 gives 0-0.
- **Impact:** projection integrity. Points-difference standings credit the loser.
- **Status:** **Billiards: fixed** in `300d754`. A single game conceded or awarded reports frames won (0–1), never points, so a points table can't credit the loser; a game played out keeps its points. Test: `B-07`.
- **Snooker: accepted.** The result counts frames, so the standings are right. The frame line is the true score at the concession, and the record says `how: 'concede'` with `conceded`. Integration can mark it ("80-0 conc."). WPBSA S4 R2(b) makes such a concession unsporting, not void.

### B-08. The free-ball mark lands on the wrong foul
- **How:**
  - `FOUL {freeBall: true}`, then a non-striker penalty, then `PLAY_AGAIN`. The voided free ball stays marked, so `freeBalls` is 1.
  - `FOUL`, then a penalty, then `FREE_BALL`. The mark goes on the penalty record.
- **Why:** the mark always edits the latest foul record.
- **Impact:** stats integrity.
- **Status:** **Fixed** in `14fb65d`. The open foul's index rides in `pending.at`; `FREE_BALL`, `PLAY_AGAIN` and `REPLACE` edit that record, never a penalty. Test: `B-08`.

### B-09. Shot-by-shot frame scores are unbounded; quick mode caps at 999
- **How:** 2,000 non-striker penalties then a 147 records a frame of 14147-0.
- **Impact:** integrity, low.
- **Status:** **Accepted.** Penalty points are real points, and S3 R14 sequences can run long. B-04 bounds a frame (5,000 records × 7 points). Quick mode's 999 is a typing guard for a whole-frame score, not a rule limit.

### B-10. `FOUL.reds` is rounded and clamped; `POT.reds` is strict
- **How:** `FOUL {reds: 0.5}` removes a red, and `FOUL {reds: 1e9}` removes every red left. `POT {reds: 1.5}` is refused.
- **Impact:** integrity, low (a bad client can clear the table in one foul).
- **Status:** **Fixed** in `4952933`. `FOUL.reds` must be a whole number from 0 to the reds on the table, like `POT.reds`; anything else refuses the foul. Test: `B-10`.

### B-11. `-0` is stored
- **How:** `FRAME_SCORE {home: -0, away: 5}`. The record holds `-0`, so a JSON round trip of the state is no longer deep-equal to it.
- **Impact:** low. A snapshot compare or a determinism check can fail.
- **Status:** **Fixed** in `4952933`. Integers read from a payload store `-0` as `0`. The simulation checks a JSON round trip of every state. Test: `B-11`.

### B-12. The reducer passes foreign keys through from its input state
- **How:** `{...createInitialState(), homeName: 'Asha Rao'}`. The key survives every reduce (`...s`, `...fr`).
- **Impact:** privacy, defence in depth. It is not reachable through actions or config.
- **Status:** **Accepted.** It is not reachable through actions or config. The live layer always replays the log from `createInitialState(config)` (`src/data/useLiveMatch.ts`), so no stored snapshot is ever fed to the reducer. The server safety net (migration `20261027200000_match_names_safety_net`) also masks names in `matches.state`. The simulation checks that no name reaches a state built from actions.

### B-13. Each engine accepts the other engine's state
- **How:** `S.reducer(billiardsState, FOUL)` gives `redsLeft: NaN`; `B.reducer(snookerState, SCORE)` gives NaN counters. Neither checks `sport`.
- **Impact:** integrity, low (a wrong plugin lookup would corrupt silently).
- **Status:** **Fixed** in `e1a1990` (see B-05). Each engine checks `sport` and its own shape.

### B-14. Hostile in-process objects make the engine throw
- **How:** a config getter that throws, a Proxy config or action, a payload getter that throws, or `breaks(s, {valueOf() { throw } })`.
- **Impact:** crash, low. JSON can't produce these, but "never throw" is the contract.
- **Status:** **Fixed** in `e1a1990` (see B-05). Config reads are guarded, and a hostile action, payload or argument leaves the state as it is.

### B-15. No-op actions count as changes
- **How:** `BREAK_OFF` naming the current breaker, or a repeated `RESPOT_TURN` for the current striker, returns a new state with `seq + 1`.
- **Impact:** low. The live layer can't tell a no-op from a real change; the log grows with noise.
- **Status:** **Fixed** in `a18600d`. `BREAK_OFF` naming the player already breaking, and `RESPOT_TURN` naming the player already to play, return the same state. Test: `B-15`.

### B-16. `payload.side` silently overrides the action's `side`
- **How:** `CONCEDE side:'home' {side: 'away'}` makes away concede. A junk `payload.side` cancels a valid `side`.
- **Impact:** low. The live layer credits by the event's `side`, so the two can disagree.
- **Status:** **Fixed** in `a18600d`. When the payload's side and the action's side are both given they must agree; a junk side refuses the action. Test: `B-16`.

### B-17. The design doc and the code disagree
- **Billiards target:** the code clamps to 10–5000; the doc says 50–5000.
- **Out-of-range options:** `hazardLimit: 1000` falls back to 15, but `target: 5001` clamps to 5000.
- **Missing files:** the doc names the sim test and this break list, which didn't exist yet.
- **Impact:** low (documentation).
- **Status:** **Fixed** in the docs commit that closes this list. The design doc now says what the code does: target 10–5000 (out of range → clamped); limits 0–999 (out of range → the standard); the new actions and guards. The sim test and this list now exist.

### B-18. A frame ended at 0-0 with nothing recorded counts as a "detailed" frame
- **How:** `CONCEDE` before any stroke. The frame counts in `detailedFrames`, so per-frame averages are diluted.
- **Impact:** stats, low.
- **Status:** **Fixed** in `e175006`. A frame with no visit and no foul is "not tracked": neither shot-by-shot nor quick. Test: `B-18`.

### B-19. No way out of a stalemate (S3 R17)
- **What's missing:** an endless safety exchange, on the re-spotted black or in normal play, can end only by a concession or an award. The rules' answer is the re-rack (S3 R17: scores nullified, the same player breaks; on the re-spotted black only the black is re-spotted), and the engine has no action for it.
- **Impact:** rule integrity. A real match can't be scored as played.
- **Status:** **Fixed** in `a432644`. A new action, `RERACK {frame}`, implements S3 R17:
  - every score nullified, the balls re-set, the same player breaks again (R17(b)–(c));
  - on the re-spotted black only the black is re-spotted, and the player who opened it starts again (R17(d));
  - the frame record keeps the count.
  - Test: `B-19` (two tests).

### B-20. A concession while level or ahead stands
- **How:** `CONCEDE` by the side ahead or at a level score. The opponent wins the frame.
- **Impact:** looks wrong.
- **Status:** **Accepted (the rules).** WPBSA S4 R2(a) and (e): an offered concession stands once accepted (and can't be withdrawn). R2(b) makes conceding unsporting unless penalty points are needed; it is not void. The referee deals with conduct (award). Tested in the main suite ("a concession stands at any score").

### Checked and held (no break found)
- **Rules:**
  - Impossible sequences are refused: a colour after a colour while reds remain, a colour while a red is on, an out-of-order clearance, a red with none left.
  - A free ball is refused on the last or re-spotted black and after `PLAY_AGAIN` / `REPLACE`.
  - Every action after the match ends is ignored.
  - A frame ending mid-break keeps the break.
  - Undo at frame and match boundaries equals replay.
  - Mixed quick and shot-by-shot frames work.
  - The re-spotted black can't loop into a second re-spot: the first pot or foul ends it.
- **Values:**
  - A foul value outside 4–7 is clamped to [minimum for the ball on, 7] (by design).
  - NaN, ±Infinity, huge, fractional and string numbers are refused or clamped.
- **Privacy:** names in every payload field and in the attribution never reach the state or a projection.
- **Prototype keys:** `__proto__` / `constructor` keys in payloads and configs are ignored, and `Object.prototype` stays clean through the reducer.
- **Fuzzing:** 480,000 fuzzed actions found no throw, no mutation, and no broken invariant:
  - frame score = breaks + penalty points received;
  - a break ≤ 147 / 107 / 75 (+8 with a free ball);
  - frames won match the records;
  - `ended` iff a side reached the frames needed.

---

## Summary

| | Points |
|---|---|
| Found | 20 (B-01 – B-20) |
| Fixed | 16: B-01, B-02, B-03, B-04, B-05, B-07 (billiards), B-08, B-10, B-11, B-13, B-14, B-15, B-16, B-17, B-18, B-19 |
| Accepted | 5: B-06, B-07 (snooker), B-09, B-12, B-20; plus the side-less double tap in B-03 |

**Simulation** (`tests/sim-snooker-billiards.test.mts`, `cd44ace`):
- **Matches:** 2,000 seeded matches, 500 per game type (15/10-red snooker, six-red, billiards N-up, billiards timed), about 173,000 actions with ~10% adversarial input. All passed, in about 1 s.
- **Paths reached:**
  - snooker: re-spotted blacks, free-ball breaks, miss awards, re-racks, non-striker penalties, reds down in fouls;
  - billiards: 16th-hazard and 76th-cannon fouls, sudden death, timed draws, quick frames.
