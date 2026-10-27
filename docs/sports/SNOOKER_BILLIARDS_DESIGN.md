# Snooker and English billiards: engine design (v1)

*Status: engine stage only (2026-10-27). Pure reducers, tests, break list and simulation. No screens, no registration yet: see "What integration needs" at the end.*

**Where things are:**
- Snooker (15-red, 10-red, 6-red): `src/sports/snooker/engine.ts`.
- English billiards: `src/sports/billiards/engine.ts`.
- Tests: `tests/snooker-engine.test.mts`, `tests/billiards-engine.test.mts`, `tests/sim-snooker-billiards.test.mts`.
- Break list: `docs/security/breaks/snooker-billiards-engine.md`.

Pool is a separate engine, built in parallel. Nothing here is shared with it.

---

## 1. Sources

| Game | Governing text | Notes |
|---|---|---|
| Snooker | **WPBSA Official Rules of the Games of Snooker and English Billiards, revised May 2022** (the "World Rules", applied by WST, WSF, World Seniors, World Women's Snooker and, through the WSF/IBSF, amateur events). | Rule numbers below are from this edition. Older editions (2014, 2019) number some rules differently, for example Penalties was Section 3 Rule 10 in 2014 and is Rule 11 now. |
| Six-red snooker | **WPBSA 2022 Section 3 Rule 19, "Six Reds Snooker"**: the full snooker rules with four variations. IBSF 6-red events (World 6-Red Championship) play these rules. | |
| English billiards | **WPBSA 2022, Rules of the Game of English Billiards** (the WPBSA is the world governing body; IBSF World Billiards plays under these rules). | The 2-point foul (3.16(c)) has been the standard since 1983. |
| Billiards formats | IBSF World Billiards Championship: the **short format, 150-up frames, best of 5 to 11** by round, and the **long-up format** (to 1,000 points, or timed). | Format details come from the event regulations, not the rulebook. |

"S3 R11(d)" below means Section 3, Rule 11, paragraph (d).

---

## 2. Snooker rules the engine implements

| Rule | Text (paraphrased) | Engine |
|---|---|---|
| S3 R1(a) | 15 reds worth 1; yellow 2, green 3, brown 4, blue 5, pink 6, black 7. | `BALL_VALUE`. The organiser picks 15, 10 or 6 reds. |
| S3 R1(d) | Penalty points go to the opponent's score. | A foul's value goes to the other side. |
| S3 R1(f) | A frame is won by the higher score, a concession, or an award (S3 R14(d)(ii); S4 R1, R3). | Frame ends: final black, foul on the final black, re-spotted black, `CONCEDE`, `AWARD_FRAME`, `FRAME_SCORE`. |
| S3 R3(b) | The first player alternates every frame. | Frame n's breaker comes from frame 1's breaker (the toss). |
| S3 R3(d) | A frame started by the wrong player continues; the correct order resumes next frame. | `BREAK_OFF` on frame n > 1 changes only that frame. |
| S3 R3(g) | First stroke of a turn while reds remain: a red (or a free ball nominated as a red) is on. Every red potted in that stroke scores. | `POT {ball:'red', reds:n}`; a turn always starts on a red while reds remain. |
| S3 R3(h)(i)–(ii) | After a red, a colour of the striker's choice is on; it is re-spotted. Reds and colours alternate until the reds are gone and a colour has been played at after the last red. | Ball on = `'colour'` after a red; colours are never removed while reds remain. |
| S3 R3(h)(iii) | Then the colours are on in ascending order and stay down. | Ball on = 2 (yellow) … 7 (black). |
| S3 R3(i) | Reds are not replaced, even when a foul benefits the striker (exceptions: balls replaced after a foul and a miss, R14(b)). | `FOUL {reds:n}` takes reds potted or forced off in a foul off the table; `REPLACE` puts them back. |
| S3 R4(a) | When only the black is left, the first pot or foul ends the frame, unless the scores are then level. | Pot or striker's foul on the last black ends the frame. |
| S3 R4(b) | Level: the black is re-spotted, lots decide who plays, in-hand, the first pot or infringement ends the frame. | `respot` phase; `RESPOT_TURN {side}` records the lots. |
| S3 R4(c) | Aggregate matches level after the last frame: re-spotted black. | **Not supported in v1** (frames format only). |
| S3 R10(e) | Points scored in a break before a foul count; nothing scores in the foul stroke. | A foul ends the visit; the visit keeps its points. |
| S3 R10(g) | Several fouls in one stroke: the highest penalty. | One `FOUL` per stroke with the highest value. |
| S3 R10(h)(ii), R13 | The offender must play again if the next player asks; the request can't be withdrawn. | `PLAY_AGAIN`, only straight after the foul. |
| S3 R11 | Fouls are 4 points, or the value of the ball on / ball concerned if higher (R11(a)–(c)); 7 for the R11(d) list. | Value clamped to **[min for the ball on, 7]** (4; the colour's value in the clearance; 7 on the re-spotted black). |
| S3 R11(e)–(g) | A penalty by the non-striker (S3 R3(k)) gives points to the striker; the turn is unaffected. | `FOUL` with `side` = the non-striker. |
| S2 R13, S3 R12 | After a foul that snookers the next player: free ball. Any ball may be nominated; it takes the value of the ball on and is re-spotted. Free ball and ball on potted together: only the ball on scores, unless it was a red (each scores). The free ball is void if the offender is asked to play again or the balls are replaced (R12(f)). | `FOUL {freeBall:true}` or `FREE_BALL`; `POT {ball:'free'}`; `POT {ball:'red', free:true}`. |
| S3 R14(a)–(c) | Foul and a miss: the next player may have the offender play again from the position left, or from the original position with every ball replaced, on the same ball on as before. | `FOUL {miss:true}`, then `REPLACE` (restores reds and ball on) or `PLAY_AGAIN`. |
| S3 R14(d) | Clear ball on: after the second failure from the original position the offender is warned; a third failure awards the frame. Playing from the position left ends the sequence. | The engine counts the run and exposes `missStatus` (warned, awardable). The award itself is the referee's call: `AWARD_FRAME {reason:'miss'}`. Geometry ("clear path") is not modelled. |
| S3 R19(a)–(c) (six reds) | No more than five consecutive misses with balls replaced; warning after the fourth; after the fifth the non-offender has three options (play, make the opponent play, cue ball anywhere). | 6-red: warning at 4; `REPLACE` refused after the fifth. |
| S4 R2 | A player may concede. They shouldn't unless penalty points are needed, but a concession still stands. | `CONCEDE {side}` at any score, level included. |
| S2 R8 | A break is the pots in successive strokes in one turn. | A visit = one turn; its points = the break. Penalty points are never part of a break. |

**Derived from the state (never stored):**
- **Points remaining:** red on: 8 a red + 27; colour after a red: 7 + 8 a red + 27; clearance from colour c: sum of c..7; re-spotted black: 7.
- **Snookers required** (per side): when the deficit is bigger than the points remaining, `ceil((deficit − remaining) / penalty)`, where penalty is 4, or the value of the ball on in the clearance.
- **Maximum break:** 147 (15 reds), 107 (10 reds), 75 (6 reds); 8 more with a free ball nominated as a red (155 / 115 / 83).

---

## 3. English billiards rules the engine implements

| Rule | Text (paraphrased) | Engine |
|---|---|---|
| S3 R4(a)–(b) | Cannon, pot white, in-off white: 2 each. Pot red, in-off red: 3 each. | `SCORE` flags: `potRed` 3, `potWhite` 2, `inOffRed` 3, `inOffWhite` 2, `cannon` 2. |
| S3 R4(c) | Several hazards, or hazards and a cannon, in one stroke: all score. | One `SCORE` holds any combination. Maximum 10 in one stroke (cannon, pot red, pot white, in-off red). |
| S3 R4(d) | In-off with a cannon: 3 if the red was hit first, 2 if the white was hit first or both together. | The scorer picks `inOffRed` or `inOffWhite`. Both together is impossible and is ignored. |
| S3 R1(f), R5(d) | Points game: first to reach or pass the target wins. Only the points needed count, but the break is credited with everything scored. | The frame is recorded at the target. The visit keeps its full value. The raw score is kept as `raw`. |
| S3 R5(a)–(c) | Timed game: most points when TIME is called; a stroke in progress finishes; level scores need a tie-break set by the event. | `TIME`. Level: organiser option `timedTie`: `'sudden'` (default: the next score or foul wins) or `'draw'`. |
| S3 R10 | Consecutive cannons not with a hazard: at most 75 (referee calls SEVENTY CANNONS). | `cannonLimit` (default 75; 0 = off). |
| S3 R11 | Consecutive hazards not with a cannon: at most 15 strokes (referee calls TEN HAZARDS). | `hazardLimit` (default 15; 0 = off). |
| S3 R15(k)–(l) | The 16th consecutive hazard / 76th consecutive cannon is a foul. | A `SCORE` over the limit becomes a foul: no points, 2 to the opponent, kind `'hazards'` / `'cannons'`. |
| S3 R16(b)–(c) | Points before the foul count, none in the foul stroke; every foul is 2 points, at most 2 in one stroke. | `FOUL` = `foulPoints` (default 2) to the opponent; the visit ends. |
| S3 R17 | A miss (no ball hit) is a 2-point penalty. | `FOUL {kind:'miss'}`. |
| S3 R1(g) | The match: most games won. | Best of N frames (`bestOf`). |
| S4 R4 | A player may concede. | `CONCEDE {side}`. |

**Not modelled** (positions, not scores): ball spotting (S3 R9), in-hand play (R6), the baulk-line crossing rule (R8). A missed baulk-line crossing is a foul (R15(t)): the scorer taps `FOUL`.

---

## 4. Action vocabulary (what the scorer taps)

The scorer's phone is the referee's voice. A shot is one tap; a visit ends with one more. The engine knows who is at the table (`striker`), so shot actions don't need a side. If a `side` is sent and it isn't the striker, the action is ignored: a stale or double tap can never credit the wrong player.

### Snooker

| Action | Payload | When | Effect |
|---|---|---|---|
| `BREAK_OFF` | `{side}` | before the first stroke of a frame | Frame 1: the toss (later frames alternate from it). Frame n > 1: that frame only (S3 R3(d)). |
| `POT` | `{ball, reds?, free?}` | the ball must be on | `ball`: `'red'` (with `reds`: how many in the stroke, default 1), a colour name, or `'free'` (the nominated free ball). `free:true` with reds = the free ball nominated as a red went down too. |
| `MISS` | — | in play | Missed pot: the visit ends, the turn passes. |
| `SAFETY` | — | in play | Safety: the visit ends, the turn passes. |
| `FOUL` | `{value, kind?, miss?, freeBall?, reds?}` | in play | Penalty to the opponent; the visit ends; the turn passes. `side` = the non-striker records an S3 R3(k) penalty (turn unchanged). |
| `FREE_BALL` | — | straight after a foul | The incoming player has a free ball (if not given on the `FOUL`). |
| `PLAY_AGAIN` | — | straight after a foul | The offender plays again from where the balls lie. |
| `REPLACE` | — | straight after a foul and a miss | Balls replaced; the offender plays again from the original position. |
| `RESPOT_TURN` | `{side}` | re-spotted black, before its first stroke | Who plays (lots). |
| `CONCEDE` | `{side}` | frame in play | That side concedes the frame. |
| `AWARD_FRAME` | `{side, reason?}` | frame in play | The referee awards the frame (`reason`: `'miss'`, `'conduct'`, `'time'`). |
| `FRAME_SCORE` | `{home, away}` | frame not started | Quick mode: the frame's final score (not level). |

Foul `kind` (optional, for stats): `inOff`, `noContact`, `wrongBall`, `pottedWrong`, `push`, `jump`, `touch`, `offTable`, `other`.

**Screen sketch:** the ball on is lit. While reds remain: [Red] (long-press: 2, 3 reds), then the six colours; in the clearance only the colour on. Under them: [Missed] [Safety] [Foul…]. The foul sheet: value chips with the minimum pre-selected, "Foul and a miss", "Free ball", "Reds down" (only while reds remain), and the kind chips. After a foul, the fouled player gets a banner: [Play on] (no action) · [Make them play again] · [Replace the balls] (miss only). A typical red–black–red–pink visit is 4 taps plus 1 to end it.

### English billiards

| Action | Payload | When | Effect |
|---|---|---|---|
| `BREAK_OFF` | `{side}` | before the first stroke of a frame | As in snooker. |
| `SCORE` | `{potRed?, potWhite?, inOffRed?, inOffWhite?, cannon?}` | in play | One scoring stroke: the sum of its parts. Over the hazard / cannon limit it becomes a foul. |
| `MISS` / `SAFETY` | — | in play | The visit ends. |
| `FOUL` | `{kind?}` | in play | `foulPoints` (2) to the opponent; the visit ends. Kinds: `miss`, `coup`, `inHand`, `push`, `jump`, `touch`, `offTable`, `hazards`, `cannons`, `baulkLine`, `other`. |
| `TIME` | — | timed format | Time called. |
| `CONCEDE` / `AWARD_FRAME` | `{side}` | frame in play | As in snooker. |
| `FRAME_SCORE` | `{home, away}` | frame not started | Quick mode. Points format: the winner is recorded at the target. |

**Screen sketch:** four big buttons for the usual strokes ([Pot red 3] [In-off red 3] [Cannon 2] [Pot white 2]) and a [Combo…] sheet; then [Missed] [Safety] [Foul]. A "10 hazards" / "70 cannons" warning shows from the engine's run counters.

### Undo and corrections

Undo works as in every other sport: the live layer drops the last event and replays the log (`src/data/useLiveMatch.ts`). The reducers have no UNDO action. `replay(config, actions)` is exported for tests and tools. Corrections (AMEND) replay the edited log the same way.

---

## 5. State

Both engines keep the same outline:
- the format;
- `frames`: completed frames, each with its score, winner, how it ended, and (shot-by-shot frames only) its visits and fouls;
- `frame`: the frame in play;
- `framesWon`, `ended`, `winner`, `seq` (accepted actions).

The frame in play holds the score, the striker, the current visit (a break in progress), the completed visits and the fouls. Snooker adds the balls (`redsLeft`, the ball on `on`, `respot`), the free ball, the open foul options (`pending`) and the miss run. Billiards adds the hazard and cannon runs and the timed tie-break flag.

**IDs only** (`docs/privacy/ids-only-scoring.md`): the state holds **sides and numbers only**, never a player id or a name. Payloads are read field by field from a fixed list; any other key (a name, `__proto__`, free text) is never copied. Attribution is a side channel the reducers don't read; the live layer credits the striker's player id from it.

---

## 6. Statistics (derived, never stored)

Standards: WST/World Snooker match statistics, and the WPBSA/IBSF billiards records (highest break, hundreds, average).

**Snooker, per side** (`snookerStats`):

| Stat | Core/Adv | How |
|---|---|---|
| Frames won | Core | `framesWon` |
| Points (frame scores, all frames) | Core | frame records + the frame in play |
| Highest break; 50+ breaks; centuries; maximums | Core | visits of shot-by-shot frames |
| Breaks list | Core | `breaks(state, min)` |
| Penalty points received / conceded; fouls; fouls by kind | Core | foul records |
| Foul-and-a-miss calls | Core | foul records with `miss` |
| Free balls awarded | Adv | foul records with a free ball |
| Pot success % | Core | potting strokes ÷ (potting strokes + missed pots) |
| Safeties; visits; points per visit | Adv | visits |
| Long-pot / rest / safety success, shot time | Adv | **Out of scope** (needs a second spotter or a clock per shot) |

Quick frames count for frames and points only. Their breaks are "not tracked", never 0.

**Billiards, per side** (`billiardsStats`): frames won; points; highest break; 50+ breaks; hundreds (centuries, 100+); double centuries (200+); **average** (points from strokes ÷ visits, the billiards standard); pots red / pots white / in-offs red / in-offs white / cannons; fouls; penalty points; safeties; missed attempts.

---

## 7. Organiser options and defaults

**Snooker:**

| Option | Values | Default |
|---|---|---|
| `reds` | 15, 10, 6 | 15 |
| `bestOf` | odd, 1–35 (an even number rounds up) | 5 (15 and 10 reds), 7 (6 reds) |
| `firstBreak` | home / away (the toss; `BREAK_OFF` can set it live) | home |
| `scoringMode` | `'shot'` / `'quick'` (a UI hint; both actions work in either) | shot |

**Billiards:**

| Option | Values | Default |
|---|---|---|
| `format` | `'points'` (N-up), `'timed'` | points |
| `target` | 50–5000 | 150 (IBSF short format) |
| `bestOf` | odd, 1–35 (timed: always 1) | 5 (IBSF short-format early rounds) |
| `timedTie` | `'sudden'` / `'draw'` | sudden |
| `foulPoints` | 1–7 | 2 (S3 R16(c)) |
| `hazardLimit` / `cannonLimit` | 0 (off) – 999 | 15 / 75 |
| `firstBreak`, `scoringMode` | as snooker | home / shot |

Suggested presets for the format form: **Short format** (150-up, best of 5) · **Single game 150-up** · **Single game 100-up** · **Long-up 1000** · **Timed**.

---

## 8. Rule questions resolved with a default (for the founder)

1. **A foul value below the minimum** (4 tapped while the pink is on) is raised to the minimum (6), not refused. Above 7 is lowered to 7.
2. **The third foul and a miss** doesn't award the frame by itself: the referee decides (clear path, warning given), so the scorer taps Award frame. The engine shows the warning and "awardable".
3. **Concession** is accepted at any score, level or ahead (S4 R2 says it's unsporting, not void).
4. **Aggregate-points snooker** (S3 R4(c)) is not supported in v1.
5. **Re-spotted black first player:** defaults to the player who did not pot (or foul) the last black, until `RESPOT_TURN` records the lots.
6. **Billiards timed game level at time:** the next score or foul wins (`timedTie: 'sudden'`), unless the organiser picks a draw.
7. **Billiards result score:** a single game (`bestOf: 1`) reports its points (150–87) to the standings; a best-of match reports frames won (3–1).
8. **Billiards default:** 150-up, best of 5 (IBSF short format). A school may prefer a single 100-up game (a preset).
9. **The 16th hazard / 76th cannon** tapped as a scoring shot is turned into the foul (S3 R15(k)–(l)) rather than refused.
10. **Numbers in payloads** must be real numbers; a string `"7"` is treated as missing.
11. **Four-handed snooker / billiards** (doubles) is not modelled: the state is per side.
12. **Non-striker penalty in billiards** isn't modelled (a `FOUL` with the non-striker's side is ignored); in snooker it is (S3 R3(k)).

---

## 9. What integration needs (next stage)

- `SportId` additions `'snooker'` and `'billiards'` (`src/core/types.ts`), meta files with the format fields above, registry and loader entries.
- `LineScore.unit` only allows `'set' | 'game'`; the engines return `'game'`. A `'frame'` unit would read better.
- `statTotals`: the state is per side, so the plugin needs `statTotalsNeedsPlayers` (singles: the side's one player) like the racket sports.
- A stat schema (`statSchemas.ts`) from section 6, and career sections.
- Scorer controls, a frame-by-frame sheet, and a break list for the Stats tab.
- `matchRecords`: highest break, centuries, maximums.
