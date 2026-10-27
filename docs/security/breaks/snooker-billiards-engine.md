# Break list: snooker and English billiards engines

**Feature:** the pure scoring engines `src/sports/snooker/engine.ts` and `src/sports/billiards/engine.ts` (design: `docs/sports/SNOOKER_BILLIARDS_DESIGN.md`), as committed in `bb9136f`.

**How it was attacked (2026-10-28):**
- An independent breaker agent (one agent builds, a different one breaks) ran its own probes: 480,000 fuzzed actions over 800 seeded matches, hostile values, `__proto__` / `constructor` keys, names in every field, frozen and truncated states, and replay timings up to 100,000 events.
- The builder added its own review against the rules text and the brief's checklist.

**Where the engines sit:**
- Every action lands in the public event log. Every device rebuilds the state by replaying that log from `createInitialState(config)`; undo is a replay without the last event.
- The stored `matches.state` snapshot is public. It is read by the projections (`summary`, `scoreLine`, stats…), never fed back into the reducer.
- Only a match's scorers can write events (RLS). Old app versions and other clients may send anything.

**Status key:** **open** = found, not yet fixed. Each point is then marked **fixed** (with the commit and the test that first failed) or **accepted** (with the reason).

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
- **Status:** open

### B-02. A repeated frame-ending action ends the next frame
- **How:** `CONCEDE {side: 'away'}` twice, `FRAME_SCORE {70, 30}` twice, or `AWARD_FRAME` twice. Each one ends a frame, so a best of 3 is over 2-0.
- **Impact:** integrity. A double tap, a retry or a second scorer's stale tap ends a whole frame. Nothing ties these actions to a frame.
- **Status:** open

### B-03. A stale `FOUL` naming a side becomes a penalty against the wrong player
- **How (snooker):** `FOUL side:'home' {value: 4}` twice. The second arrives when home is no longer at the table, so it is read as a non-striker penalty (S3 R3(k)). Away gets 8.
- **Also:** a double side-less `MISS` / `SAFETY` flips the turn twice.
- **Impact:** integrity. This contradicts the design's promise that a stale tap "can never credit the wrong player".
- **Status:** open

### B-04. Replay time grows with the square of one frame's length
- **How:** 20,000 `SAFETY` actions in one frame replay in 0.44 s, 40,000 in 2.2 s, 100,000 in 14 s (a Mac; phones are slower). Striker fouls are about twice as slow, and billiards misses the same.
- **Why:** every visit end or foul copies the frame's whole `visits` / `fouls` array.
- **Impact:** availability. Every viewer replays on connect, reconnect and undo. Real matches are fine: a best of 35 replays in 2 ms.
- **Status:** open

### B-05. Truncated or old-looking states make the engine throw
- **Projections:** `summary({frames: []})` throws. A frame record that is `{}`, `null`, or missing `score` makes `summary`, `scoreLine`, `lineScore`, `standingsUnits`, the stats, `breaks` and billiards `result` throw.
- **Reducer:** `reducer({...s, frame: {}}, MISS)` throws; so do most actions on a frame missing `visit`, `visits`, `fouls` or `score`.
- **Impact:** crashes. The contract is "never throw", and the projections run on stored snapshots (MiniScore, result rows).
- **Status:** open

### B-06. A non-striker penalty on the last black does not end the frame
- **How:** with only the black left, `FOUL side:<non-striker>`. The points are added and the frame goes on. The same penalty on the re-spotted black ends it.
- **Impact:** rule integrity, if it is wrong.
- **Status:** open

### B-07. A concession or award by the side ahead shows the loser ahead
- **Snooker:** a frame conceded at 80-0 by home is won by away but reads "80-0".
- **Billiards, single game:** `result()` reports points, so the standings get `{winner: 'away', home: 71, away: 47}`, and an award at 0-0 gives 0-0.
- **Impact:** projection integrity. Points-difference standings credit the loser.
- **Status:** open

### B-08. The free-ball mark lands on the wrong foul
- **How:**
  - `FOUL {freeBall: true}`, then a non-striker penalty, then `PLAY_AGAIN`. The voided free ball stays marked, so `freeBalls` is 1.
  - `FOUL`, then a penalty, then `FREE_BALL`. The mark goes on the penalty record.
- **Why:** the mark always edits the latest foul record.
- **Impact:** stats integrity.
- **Status:** open

### B-09. Shot-by-shot frame scores are unbounded; quick mode caps at 999
- **How:** 2,000 non-striker penalties then a 147 records a frame of 14147-0.
- **Impact:** integrity, low.
- **Status:** open

### B-10. `FOUL.reds` is rounded and clamped; `POT.reds` is strict
- **How:** `FOUL {reds: 0.5}` removes a red, and `FOUL {reds: 1e9}` removes every red left. `POT {reds: 1.5}` is refused.
- **Impact:** integrity, low (a bad client can clear the table in one foul).
- **Status:** open

### B-11. `-0` is stored
- **How:** `FRAME_SCORE {home: -0, away: 5}`. The record holds `-0`, so a JSON round trip of the state is no longer deep-equal to it.
- **Impact:** low. A snapshot compare or a determinism check can fail.
- **Status:** open

### B-12. The reducer passes foreign keys through from its input state
- **How:** `{...createInitialState(), homeName: 'Asha Rao'}`. The key survives every reduce (`...s`, `...fr`).
- **Impact:** privacy, defence in depth. It is not reachable through actions or config.
- **Status:** open

### B-13. Each engine accepts the other engine's state
- **How:** `S.reducer(billiardsState, FOUL)` gives `redsLeft: NaN`; `B.reducer(snookerState, SCORE)` gives NaN counters. Neither checks `sport`.
- **Impact:** integrity, low (a wrong plugin lookup would corrupt silently).
- **Status:** open

### B-14. Hostile in-process objects make the engine throw
- **How:** a config getter that throws, a Proxy config or action, a payload getter that throws, or `breaks(s, {valueOf() { throw } })`.
- **Impact:** crash, low. JSON can't produce these, but "never throw" is the contract.
- **Status:** open

### B-15. No-op actions count as changes
- **How:** `BREAK_OFF` naming the current breaker, or a repeated `RESPOT_TURN` for the current striker, returns a new state with `seq + 1`.
- **Impact:** low. The live layer can't tell a no-op from a real change; the log grows with noise.
- **Status:** open

### B-16. `payload.side` silently overrides the action's `side`
- **How:** `CONCEDE side:'home' {side: 'away'}` makes away concede. A junk `payload.side` cancels a valid `side`.
- **Impact:** low. The live layer credits by the event's `side`, so the two can disagree.
- **Status:** open

### B-17. The design doc and the code disagree
- **Billiards target:** the code clamps to 10–5000; the doc says 50–5000.
- **Out-of-range options:** `hazardLimit: 1000` falls back to 15, but `target: 5001` clamps to 5000.
- **Missing files:** the doc names the sim test and this break list, which didn't exist yet.
- **Impact:** low (documentation).
- **Status:** open

### B-18. A frame ended at 0-0 with nothing recorded counts as a "detailed" frame
- **How:** `CONCEDE` before any stroke. The frame counts in `detailedFrames`, so per-frame averages are diluted.
- **Impact:** stats, low.
- **Status:** open

### B-19. No way out of a stalemate (S3 R17)
- **What's missing:** an endless safety exchange, on the re-spotted black or in normal play, can end only by a concession or an award. The rules' answer is the re-rack (S3 R17: scores nullified, the same player breaks; on the re-spotted black only the black is re-spotted), and the engine has no action for it.
- **Impact:** rule integrity. A real match can't be scored as played.
- **Status:** open

### B-20. A concession while level or ahead stands
- **How:** `CONCEDE` by the side ahead or at a level score. The opponent wins the frame.
- **Impact:** looks wrong.
- **Status:** open

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
