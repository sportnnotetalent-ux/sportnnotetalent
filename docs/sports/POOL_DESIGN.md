# Pool (8-ball, 9-ball, 10-ball): engine design (v1)

*Status: **engine stage built 2026-10-27** (pure engine only: no plugin, no screens, no
registration). One sport, `pool`, with a game option: 8-ball, 9-ball or 10-ball.*

**Where things are:**
- Engine: `src/sports/pool/engine.ts` (rules + state), `src/sports/pool/stats.ts` (per-side
  stat derivations), `src/sports/pool/balls.ts` (ball sets and payload readers).
- Tests: `tests/pool-engine.test.mts` (rules, written first) and `tests/sim-pool.test.mts`
  (seeded simulation, 500+ matches per game).
- Breaks: `docs/security/breaks/pool-engine.md`.

---

## 1. Sources

- **WPA Rules of Play, effective 2026-10-21** (wpapool.com/rules-of-play, file
  `WPA-Rules-2026-10-21-211.pdf`). The 2026 edition **renumbered** the rules:
  1 General, 2 Definitions, 3 Fouls, **4 8-Ball**, **5 9-Ball**, **6 10-Ball**. An older
  printout (8-ball = section 2, 9-ball = 3, 10-ball = 4, fouls = 6) shows different numbers.
  Every rule number below and in the engine's comments is the 2026 one.
- **WPA Playing Regulations, effective 2026-10-21**: Regulation 16 (the three-ball break rule
  at 9-ball).
- Stats vocabulary: the stats sheets of WPA / Matchroom events (racks won, break-and-runs,
  golden breaks, balls on the break, dry breaks, fouls, safeties, push-outs, innings).

## 2. Rules implemented

### Common (all three games)

| Rule | WPA | Engine |
|---|---|---|
| Lag: the lag winner chooses who breaks first | 1.2, 4.1 / 5.1 / 6.1 | `LAG` (side = lag winner, `breaks` = who they send to break; default the winner). Optional: a `BREAK` with a side also fixes the first breaker. |
| Subsequent breaks alternate (rack-scored disciplines) | 1.3 | Organiser option `breakFormat`: `alternate` (default, WPA), `winner` (winner breaks), `loser` (loser breaks). Alternate follows the schedule (odd racks: the first breaker), whatever re-racks happened inside a rack. |
| Cue ball in hand after a standard foul | 1.6, 4.9 / 5.7 / 6.9 | `bih` set for the incoming player (display only; no geometry). |
| Standard call shot; "safety" call | 1.7, 2.16 | `POT.called` (default true) and `SAFETY`. 9-ball is not a call-shot game; 10-ball has no safety call (6.5). |
| Inning = an athlete's turn at the table; a passed push-out continues the inning | 2.8 | Innings counted per side per rack; a `pass` keeps the inning open. |
| Shot is legal if the shooter did not foul | 2.19 | Any `POT` / `MISS` / `SAFETY` / legal `PUSH` / legal `BREAK` resets that player's consecutive fouls. |
| Fouls 3.1–3.15 | 3 | `FOUL.kind` (list below). Several fouls on one shot: one is enforced (3, preamble). Fouls not called before the next shot are not recorded (the scorer's Undo fixes a late call). |
| Three consecutive fouls lose the rack; warning after the second | 3.13, 5.8, 6.10 | Organiser option `threeFoul` (default **on** for 9- and 10-ball, **off** for 8-ball: "Some games such as 8-Ball do not include this rule"). The engine exposes `onTwoFouls(state)`; the app shows the warning whenever that player comes to the table, so the third foul loses. Counted per player, within one rack (a re-rack or a new rack resets it), across innings; the opponent's shots don't reset it. |
| Object ball driven off the table | 3.5 | `off: [balls]` on `BREAK` / `FOUL` / `PUSH`; a ball off the table is always a foul. Spotting per game below. |
| Playing out of turn | 3.12 | `FOUL {side: the player who played, kind: 'outOfTurn'}`: charged to them; the athlete whose turn it was keeps the table with ball in hand. |
| Stalemate: the original breaker of the rack breaks again | 1.13, 4.11 / 5.9 / 6.11 | `STALEMATE` re-racks with the same breaker. |
| Concession = loses the match | 1.12 | Not an engine action: the app's "End match by hand" (manual result) covers it. |
| Match: a race to N racks, optionally in sets | 2.10, 2.14, 2.18 | Options `raceTo` and `setsToWin` (1 = one race, no sets). |

### 8-ball (WPA section 4)

| Rule | WPA | Engine |
|---|---|---|
| 15 balls; solids 1–7, stripes 9–15; the 8 last; shots are called | 4 (preamble), 4.6 | Ball set 1–15. |
| Break: no call; a ball pocketed without a foul → the breaker continues, the table stays open | 4.3(b)(c) | `BREAK {pots}`. |
| Illegal break: nothing pocketed and fewer than four balls to a rail → incoming athlete: accept the table, re-rack and break, or re-rack and let the offender break again | 4.3(d) | `BREAK {illegal: true}` → choice `illegalBreak`: `play` / `rerack` (`breaker`: the chooser by default, or the offender). **Not a foul** in 8-ball. |
| The 8 on a legal break is not a foul; the breaker chooses: spot the 8 and continue, or re-break | 4.3(e), 4.7 | choice `eightBreak` (the breaker): `play` (8 spotted, breaker continues) / `rerack` (breaker breaks again). Not a win. |
| The 8 pocketed on a break foul → opponent: spot the 8 and shoot with ball in hand above the head string, or re-break | 4.3(f) | choice `eightFoul` (the opponent): `play` / `rerack` (breaker: the chooser by default). |
| Object ball off the table on the break: foul; balls stay out except the 8 (spotted) | 4.3(g) | the 8 in `off` is put back; others stay out. |
| Any other break foul → incoming athlete: accept the table or take ball in hand above the head string | 4.3(h) | the opponent comes to the table with ball in hand; the option is not a scoring event. |
| Open table: groups are decided by the first legally pocketed **called** ball after the break, never on the break | 4.4 | `POT` on an open table assigns the group of the called ball (`calledBall`, else the first ball tapped). Assigned **once per rack**. |
| On an open table, hitting the 8 first is a foul unless a group is completely pocketed (the shooter may claim that group and play the 8) | 4.4 | an 8 legally pocketed on an open table wins only if a group was cleared before the shot. |
| Shooter stays at the table while balls of their group are pocketed legally | 4.5 | a `POT` with none of the shooter's group (or a `called: false`) ends the inning; the balls stay down. |
| Safety: the balls pocketed on it stay down; play passes | 4.6 | `SAFETY {pots}`. |
| Only the 8 is ever spotted (break only) | 4.7 | |
| **Losing the rack** (not on the break): (a) the 8 pocketed with a foul, (b) the 8 pocketed before the group is cleared (this includes the same shot as the last group ball: the 8 was not yet the called ball, 4.6), (c) the 8 in an uncalled pocket, (d) the 8 off the table | 4.8, 4.10 | rack ends `eightFoul` / `eightEarly` / `eightPocket` / `eightOff`; the opponent wins it. A safety that pockets the 8 is (b) or (c): a loss. |
| Win: the 8 legally pocketed in the called pocket after the group is cleared | 4 (preamble), 4.5 | rack ends `money`. |

### 9-ball (WPA section 5)

| Rule | WPA | Engine |
|---|---|---|
| 9 balls, played in ascending order; lowest ball first on every shot | 5 (preamble), 5.7 / 3.2 | Ball set 1–9. Wrong ball first is a scorer's foul tap (no geometry). |
| Legal break: nothing pocketed → at least four balls to a rail, or it is a **foul** | 5.3(b) | `BREAK {illegal: true}` → foul `illegalBreak`. |
| Three-ball rule: nothing pocketed (or 1–2 pocketed) and fewer than three balls pocketed or across the head string → incoming athlete accepts the table (no push-out) or hands the shot back (the breaker may push out); a 9 pocketed on it is spotted | 5.3(c), Reg 16 | Option `threeBallRule` (default on). `BREAK {short: true}` → choice `threeBall`: `play` / `pass`. |
| Push-out: the shot after a break with no foul; 3.2 and 3.3 suspended; the other athlete then chooses who shoots | 5.4 | `PUSH` (allowed only then; never after a break foul) → choice `push`: `play` / `pass`. |
| A ball legally pocketed → the shooter continues; the 9 legally pocketed on any shot (except a push-out) wins — **on the break too (golden break)** | 5.5 | rack ends `money`, or `golden` on the break shot. |
| The 9 pocketed on a foul or push-out, or off the table, is spotted; no other ball is ever spotted | 5.6 | |
| Three consecutive fouls lose the rack | 5.8 | rack ends `threeFoul`. |

### 10-ball (WPA section 6)

| Rule | WPA | Engine |
|---|---|---|
| 10 balls in ascending order; **call shot** | 6 (preamble), 6.5 | Ball set 1–10. |
| Legal break: nothing pocketed → four balls to a rail, or a foul | 6.3 | as 9-ball. A ball pocketed on a legal break → the breaker continues. |
| The 10 on the break is spotted (not a win) | 6.8 | the 10 goes back on the table; it still counts as a ball pocketed on the break. |
| Push-out as 9-ball | 6.4 | |
| No "safety" call | 6.5 | `SAFETY` is a stats label; a safety that pockets a ball is a wrongfully pocketed ball. |
| Wrongfully pocketed ball (not the called shot, no foul) → the other athlete chooses who shoots | 6.6 | `POT {called: false}` → choice `wrongPot`: `play` / `pass`; the 10 spotted. |
| Win: the 10 legally pocketed on a called shot **when it is the only object ball on the table**; otherwise the 10 is spotted | 6.7, 6.8 | rack ends `money`. Option `tenEarly` (default **off**): the pre-2026 practice where a called 10 wins at any time (`calledBall: 10`). |
| Three consecutive fouls lose the rack | 6.10 | |

### Foul kinds (`FOUL.kind`, `BREAK.foul`, `PUSH.foul`)

| kind | WPA | | kind | WPA |
|---|---|---|---|---|
| `scratch` | 3.1 cue ball pocketed / off the table | | `touched` | 3.6 touched ball |
| `wrongBall` | 3.2 wrong ball first | | `moving` | 3.9 balls still moving |
| `noRail` | 3.3 no rail after contact | | `noFoot` | 3.4 no foot on floor |
| `offTable` | 3.5 object ball off the table | | `placement` | 3.10 / 3.11 cue-ball placement, play from above the head string |
| `jump` | 2.9 illegal jump (scorer's call) | | `outOfTurn` | 3.12 |
| `pushShot` | 3.8 push shot (not a push-out) | | `slowPlay` | 3.14 shot clock |
| `doubleHit` | 3.7 double hit / frozen balls | | `illegalBreak` | 5.3(b) / 6.3(b) |
| `other` | anything else, incl. 3.15 | | | |

An unknown kind is recorded as `other`; a ball in `off` with no kind is `offTable`.

## 3. What the scorer taps (action vocabulary)

Every action is a `ScoreAction` (`type`, `side`, `payload`). Payloads hold **ball numbers,
enums and booleans only**: never a name, never a player id (the player credit rides on
`attribution`, which the reducer ignores — `docs/privacy/ids-only-scoring.md`).

| Action | side | payload | Taps | When |
|---|---|---|---|---|
| `LAG` | lag winner | `{breaks?: 'home'\|'away'}` | 1–2 | before the first break of the match |
| `BREAK` | breaker (needed only when unknown) | `{pots?: number[], off?: number[], foul?: kind, illegal?: true, short?: true}` | balls that fell + ✓ (or Dry / Foul ▸) | the rack is waiting for its break |
| `POT` | shooter (optional) | `{pots: number[], called?: false, calledBall?: number}` | tap the ball(s) → ✓ | a shot with no foul that pocketed balls |
| `MISS` | shooter (optional) | — | 1 | nothing pocketed, no foul |
| `SAFETY` | shooter (optional) | `{pots?: number[]}` | 1 (+ balls) | a declared safety |
| `FOUL` | shooter; another side only with `outOfTurn` | `{kind?, pots?, off?}` | Foul ▸ kind (+ balls) | |
| `PUSH` | shooter (optional) | `{pots?, off?, foul?}` | 1 | 9/10-ball, the shot after a break with no foul |
| `CHOOSE` | — | `{choice: 'play'\|'pass'\|'rerack', breaker?}` | 1 | the engine waits for a choice (`state.rack.pending`) |
| `RACK` | rack winner | `{rack: number, breaker?, bnr?: true, golden?: true, runOut?: true}` | 1 (+ flags) | **quick mode**: a rack with no detail yet. On a rack with detail it **awards** the rack (scorer gave up on detail, a conduct penalty 3.16). `rack` (the number of the rack in play) is **required**: a double tap can't award two racks. |
| `STALEMATE` | — | — | 1 | 1.13: the rack is replayed, same breaker |

**Every action may carry `rack`** (the number of the rack in play when it was tapped; the controls
always send it). An action for an earlier rack — a duplicate from a second phone, a retry, a straggler —
is ignored. A later number still applies (a correction that voided a rack end shifts the taps after it).

A typical 9-ball run-out from the break is about ten taps (break + one tap per ball).
A scorer who wants only results taps `RACK` once per rack; a match can mix the two modes rack
by rack. A side on a shot action that is not the player at the table makes the action a no-op
(two phones out of step can't score for the wrong player).

**Undo** follows every other sport: the app replays the event log without its newest event
(`deriveLog` in `src/data/eventLog.ts`). The reducer has no UNDO action; `replay(config,
actions)` is exported for tests and tools. `STAT_ADJUST` and unknown types are no-ops.

## 4. State (`PoolState`, schema `v: 1`)

- Format (frozen at creation): `game` (`eight` | `nine` | `ten`), `raceTo`, `setsToWin`,
  `breakFormat`, `threeFoul`, `threeBallRule`, `tenEarly`.
- Match: `firstBreaker`, `current` (racks won in the set in play), `sets` (completed sets'
  rack scores; a race without sets is one "set"), `setsWon`, `racks` (one `RackRecord` per
  completed rack: winner, breaker, quick or detail, how it ended, break-and-run / golden /
  run-out flags, innings, balls on the break), `tally` (per side: the stat counters),
  `ended`, `winner`, `seq` (accepted events).
- The rack in play (`rack`, null once the match has ended): number, breaker, phase (`break`
  / `play`), the object balls still on the table, the shooter, who holds solids (8-ball;
  null = open table), the pending choice, consecutive fouls per side, push-out allowed, ball
  in hand, innings per side, whether the open inning is the breaker's break inning.

The state holds **no names and no player ids**: sides, ball numbers and counters only. Its
size is bounded by the match length (one small record per rack), not by the number of
events.

## 5. Stats (per side, `poolStats(state)`)

| Stat | Meaning | Quick racks |
|---|---|---|
| Racks won / sets won | | ✅ |
| Racks broken, racks won on own break | break-win % | ✅ when the breaker is known |
| Break-and-runs | the breaker won the rack in the break inning (golden breaks included) | flag |
| Golden breaks (9-ball) | the 9 on the legal break shot | flag |
| Run-outs | won the rack in a single visit, not from the break | flag |
| Breaks, balls on the break, dry breaks, break fouls, illegal breaks | | — |
| 8 on the break (8-ball) | | — |
| Balls pocketed | legally pocketed balls after the break (own group in 8-ball; spotted balls not counted) | — |
| Fouls, by kind | | — |
| Three-foul losses; racks lost on the 8 (8-ball serious fouls) | | — |
| Safeties, push-outs | | — |
| Innings, innings per rack | over racks scored in detail | — |
| Racks in detail / quick | coverage | — |

Detail-only stats are never "0" for a quick rack: `detailRacks` says how many racks they
cover, so a profile can show "not tracked".

## 6. Organiser options and defaults

| Option | Values | Default |
|---|---|---|
| `game` | `eight`, `nine`, `ten` (also accepts 8 / '8-ball' …) | `eight` |
| `raceTo` | racks to win (a set) | 5 (1–99) |
| `setsToWin` | sets to win the match; 1 = one race | 1 (1–9) |
| `breakFormat` | `alternate`, `winner`, `loser` | `alternate` (WPA 1.3) |
| `threeFoul` | on / off | on for 9- and 10-ball, off for 8-ball (WPA 3.13) |
| `threeBallRule` | 9-ball, on / off | on (WPA 5.3(c), Reg 16) |
| `tenEarly` | 10-ball, on / off | off (WPA 2026: the 10 must be the last ball) |

Bad option values (NaN, Infinity, negative, text) fall back to the default; numbers are
clamped to their range.

## 7. Rule questions resolved with a default (for the founder to review)

1. **Edition.** The WPA Rules of Play changed on 2026-10-21. The engine follows the new
   edition: the 10-ball must be the last ball to win (an early called 10 is spotted).
   `tenEarly` switches back to the old practice.
2. **Three-foul warning (3.13)** is given by the app automatically (the "on two fouls"
   banner when that player comes to the table), so the third foul always loses. There is no
   "warning not given" path.
3. **8-ball three-foul rule** is off by default (WPA says 8-ball doesn't include it); leagues
   that use it switch it on.
4. **8 pocketed on a break foul, "re-breaking" (4.3(f)(2))**: the opponent (who chose) breaks
   the re-rack by default; the scorer may name the other player.
5. **10-ball: only the 10 falls on a legal break**: it is spotted and the breaker continues
   (a ball was pocketed on the break).
6. **9-ball "safety" with a ball pocketed**: 9-ball has no safety call, so a legally
   pocketed ball keeps the shooter at the table (5.5): the engine scores it as a pot.
7. **10-ball "safety" with a ball pocketed**: no safety call at 10-ball (6.5), so it is a
   wrongfully pocketed ball and the opponent chooses (6.6).
8. **Open table, balls of both groups pocketed, no called ball given**: the first ball the
   scorer tapped is the called ball.
9. **Alternate break with re-racks or a stalemate**: the alternation follows the schedule
   (rack 1, 3, 5… the first breaker), not who actually broke the replayed rack.
10. **Sets**: the break format carries on across sets (no special rule for the first rack of
    a set).
11. **Break-and-run includes golden breaks**; **run-out** = won in a single visit by a
    player who did not break (or broke in an earlier, replayed attempt).
12. **A quick `RACK` on a rack that already has detail** awards the rack (how = `awarded`);
    its flags are ignored (the detail decides them).
13. **Out-of-turn foul (3.12)**: the player whose turn it was keeps the table with ball in
    hand; their inning carries on.
14. **Re-rack** (illegal break, 8 on the break, stalemate): the rack's innings restart; fouls
    and breaks already made stay in the tally (they happened).

## 8. What integration needs (not part of this stage)

- `SportId` `'pool'` in `src/core/types.ts`; `src/sports/pool/meta.ts` (name "Pool", the
  format fields of §6, `participantKind: 'both'` for scotch doubles, archetype
  `set-game-point`) added to `sportMeta.ts`, `registry.ts`, `sportLoaders.ts` /
  `sportLoaders.native.ts`, and a stat schema in `statSchemas.ts` (keys of §5).
- A plugin (`index.tsx`): the scorer controls (break sheet, ball chips, Pot / Miss / Safe /
  Foul ▸ / Push out, the choice sheet, the "on two fouls" banner, quick Rack buttons),
  `summary`, `scoreLine`, `lineScore`, `result`, `isComplete` from this engine.
- `statTotals` per player (doubles: who shot, from `attribution`), feed / commentary, undo
  label, records (break-and-runs, golden breaks), ticker.
- Demo seed, guides page (sportnnote.in/guides/), DEVLOG entry.
