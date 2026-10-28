# Break list: snooker and billiards in the app (controls, tabs, totals, records)

**Feature:** the snooker and English billiards plugins built on the engines (`docs/security/breaks/snooker-billiards-engine.md`):
- the scorer controls and their pure halves (`src/sports/{snooker,billiards}/controls.ts`, `src/sports/cue/*`);
- the scoreboard, the Commentary and Stats tabs (`feed.ts`, `matchStats.ts`, `read.ts`);
- `statTotals` (`totals.ts`), the stat schemas, records, Undo labels and box sources.

Build commit: `ad36469`. Quality mandate step 4: every point was written down as **open** before any fix. Step 5 marks each **fixed** (with a test that failed first) or **accepted** (with the reason).

**Where the plugins sit:**
- Every tap becomes a row in the public event log; every device rebuilds the state by replaying it. Undo removes the last row.
- Only a match's scorers can write rows (RLS), but old app versions and other clients may send anything.
- The tabs read the replayed live state. Stored snapshots (`matches.state`) are public and are read by cards, the result and the tournament Records card.
- `statTotals` runs on the replayed state at completion, on a hand-ended match and after a correction.
- Corrections (#05) append an AMEND row whose ops void or replace rows by `seq`; the log is replayed with them.

**How it was attacked (2026-10-28):** the checklist in the brief (double taps, stale taps after undo, a tap for the wrong frame, hostile or old snapshots, quick-mode abuse, breaks over the maximum, names leaking into events) plus the mandate's (who can call it, inputs, timing, availability, integrity). Probes in a scratch script against the built modules; the results are quoted below.

---

## Points found (written before any fix)

### A-01. One voided row from the generic correction list unravels a match
- **How:** "Correct this match" shows the generic list (`EventCorrectionList`): ✕ voids any single row. In a best of 3 won 2-0, void frame 1's concession.
- **What happens (probe):** every later row is stamped with a later frame (`payload.frame`), so the replay refuses them all: no frame is complete and the "finished" match is back in play at 8-0 in frame 1. Voiding a single pot instead makes the next pots illegal (the ball on changes): the frame silently becomes 0-0 while the result stays.
- **Impact:** integrity. A correction that looks small rewrites the whole match; the preview shows the new score, but a scorer can't make a sane correction with this list.

### A-02. A crafted snapshot's impossible break reaches the commentary, frame sheet and records
- **How:** a stored state with a visit of 999 points (no replay can make one: the most is 147, +8 with a free ball).
- **What happens (probe):** "A — break of 999, then missed a pot"; `matchRecords` offers `highBreak 999`.
- **Impact:** integrity of what is shown and of the record candidates, from a public snapshot (a hostile client writing `matches.state`).

### A-03. "Play on" keeps the after-foul banner hidden for a new foul after an undo
- **How:** a foul → the fouled player taps Play on (the banner hides, keyed by the frame and the foul's index) → Undo the foul → record a different foul.
- **What happens:** the new foul has the same frame and index, so its banner (play again / replace / free ball) stays hidden.
- **Impact:** the fouled player's choices aren't offered; a "Replace the balls" can be missed.

### A-04. A junk-filled frame makes the commentary render thousands of rows
- **How:** 5,000 safeties in one frame (the engine's cap per frame, B-04).
- **What happens (probe):** 3,000 safeties → 3,000 commentary rows, all rendered (no list virtualisation). Up to 35 frames × 5,000 rows.
- **Impact:** availability on every viewer's phone (Commentary tab freezes).

### A-05. A quick frame score typed for frame n saves into frame n + 1
- **How:** two scorers. Scorer A starts typing frame 3's score; scorer B saves frame 3 first. A's form keeps the typed numbers, its title moves to frame 4, and Save records them as frame 4.
- **Impact:** integrity (multi-scorer). The confirm sheet names the frame, but the typed numbers were meant for the frame before.

### A-06. Quick mode accepts frame scores no frame reaches without fouls
- **How:** `FRAME_SCORE 999-0` on a six-red frame (most without fouls: 75); a timed billiards game up to 99,999.
- **What happens (probe):** recorded as typed.
- **Impact:** career points / points per frame inflated by a mistyped or hostile score.

### A-07. The scoreboard reads the state's fields directly
- **How:** a state object whose `bestOf` / `reds` / `target` getter throws (not JSON: an in-process hostile object).
- **Impact:** a render crash instead of "never throw". Low: the live state is a replay.

### A-08. Two players on one side: the career figures go to the first only
- **How:** no matchday squad and a two-player entry roster: `statTotalsContext` lists both (roster ≤ 2), and an individual sport credits the first.
- **Impact:** the wrong player can get the frames, breaks and fouls.

### A-09. The final scoreboard says GAMES
- **How:** `SetLineBoard` labels the lead column from `LineScore.unit` once the match is over ('game' → GAMES); live it says FRAMES (`leadLabel`).
- **Impact:** a wrong word on a finished snooker match.

### A-10. A crafted ctx player id of `__proto__`
- **How:** `ctx.players.home[0].id = '__proto__'`.
- **What could happen:** `out['__proto__'] = …` replaces the totals object's prototype.
- **Impact:** integrity of the totals object.

---

## Checked and held (tests in the build commit)

- **Double taps:** the same built action applied twice: the second is refused (`snooker-controls`: pot, black, miss, foul, play again; `billiards-controls`: miss, foul). Two confirm sheets: the second replaces the first (resolved as No); a stale ending tap confirmed late is stamped with its frame and refused.
- **A tap for the wrong frame / after undo:** every action carries `payload.frame`, every shot `side`: a foul or a concession built in frame 1 is refused in frame 2, and a shot naming a player no longer at the table is refused (`a stale tap from the last frame is refused`).
- **Names in events:** the builders take no names; the only typed input is digits; reasons and kinds come from fixed lists; no action carries an attribution (`cue-integration`).
- **Hostile / foreign / old states:** the panels, builders, feeds, stats, sheets, records, Undo labels and totals return nothing (or zeros) and never throw for `null`, `{}`, a cut-short frame, the other engine's state, `__proto__` sides (`… never throw` tests).
- **Breaks over the maximum:** no replayed log can make one (engine invariant; the simulation re-checks it through the plugins).
- **A concession by the player ahead** (engine B-07 accepted): the commentary says who conceded; records give it no margin.
- **The 16th hazard / 76th cannon:** the button says "foul now"; the combo sheet warns; the engine records the foul.
- **Both in-offs in one stroke:** impossible in the combo sheet; refused by the engine.

---

## Summary

| | Points |
|---|---|
| Found | 10 (A-01 – A-10) |
| Fixed | – |
| Accepted | – |
