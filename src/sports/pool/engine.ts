/**
 * Pool engine: 8-ball, 9-ball and 10-ball, one sport with a game option.
 * Design and rule sources: docs/sports/POOL_DESIGN.md. Rule numbers are the
 * WPA Rules of Play, effective 2026-10-21 (1 General, 2 Definitions, 3 Fouls,
 * 4 8-Ball, 5 9-Ball, 6 10-Ball) and the WPA Playing Regulations (Reg 16).
 *
 * Scoring is shot by shot — LAG, BREAK, POT, MISS, SAFETY, FOUL, PUSH, CHOOSE,
 * STALEMATE — with a quick mode (RACK: just the rack winner), mixable rack by
 * rack. The reducer is PURE: it never mutates, never throws on bad input (a
 * malformed or out-of-place action returns the same state object) and has no
 * clock or randomness, so a stored log always replays to the same state. Undo
 * = replay the log without its newest event (src/data/eventLog.ts).
 *
 * IDs-only scoring (docs/privacy/ids-only-scoring.md): the state holds sides,
 * ball numbers, enums and counters only — no names and no player ids. Player
 * credit rides on `attribution`, which this reducer ignores.
 */
import type { ScoreSummary } from '../types';
import { scoreLine as lineOf, finalSummary, pointsLineScore, type LineScore } from '../scoreline.ts';
import {
  type PoolGame, type Side, isSide, other, TOP, MONEY, GAME_LABEL, SOLIDS, STRIPES, fullRack,
  readBalls, readInt, readBool, readGame, own, ownRecord,
} from './balls.ts';

export type { PoolGame, Side } from './balls.ts';

// ------------------------------------------------------------ types ----

/** Foul kinds the scorer taps (WPA section 3). */
export type FoulKind =
  | 'scratch' // 3.1 cue ball pocketed or off the table
  | 'wrongBall' // 3.2 wrong ball first
  | 'noRail' // 3.3 no rail after contact
  | 'offTable' // 3.5 object ball driven off the table
  | 'jump' // 2.9 an illegal jump (the scorer's call)
  | 'pushShot' // 3.8 push shot (not a push-out)
  | 'doubleHit' // 3.7 double hit / frozen balls
  | 'touched' // 3.6 touched ball
  | 'moving' // 3.9 balls still moving
  | 'noFoot' // 3.4 no foot on floor
  | 'placement' // 3.10 / 3.11 cue-ball placement, play from above the head string
  | 'outOfTurn' // 3.12 playing out of turn
  | 'slowPlay' // 3.14 slow play (shot clock)
  | 'illegalBreak' // 5.3(b) / 6.3(b) nothing pocketed and fewer than four balls to a rail
  | 'other'; // anything else (3.15 …)

export const FOUL_KINDS: readonly FoulKind[] = ['scratch', 'wrongBall', 'noRail', 'offTable', 'jump', 'pushShot', 'doubleHit',
  'touched', 'moving', 'noFoot', 'placement', 'outOfTurn', 'slowPlay', 'illegalBreak', 'other'];
const KIND_SET: ReadonlySet<string> = new Set(FOUL_KINDS);

/** How a rack was decided. */
export type RackEnd =
  | 'money' // the 8 / 9 / 10 legally pocketed
  | 'golden' // 9-ball: the 9 on the legal break shot (5.5)
  | 'eightFoul' | 'eightEarly' | 'eightPocket' | 'eightOff' // 8-ball 4.8(a)–(d): the shooter loses
  | 'threeFoul' // 3.13: three consecutive fouls
  | 'awarded' // a RACK on a rack with detail (scorer's award; conduct 3.16)
  | 'quick'; // a RACK on a rack with no detail (quick mode)

/** A decision the engine waits for (CHOOSE). `by` = who decides. */
export type PendingKind =
  | 'push' // 5.4 / 6.4: after a push-out — play, or pass back
  | 'wrongPot' // 6.6: a wrongfully pocketed ball — play, or pass back
  | 'threeBall' // Reg 16: a short break — accept (play), or hand back (pass)
  | 'illegalBreak' // 4.3(d): accept (play), or re-rack
  | 'eightBreak' // 4.3(e): the breaker spots the 8 and continues (play), or re-breaks
  | 'eightFoul'; // 4.3(f): the opponent spots the 8 with ball in hand (play), or re-breaks
export interface Pending { kind: PendingKind; by: Side }

export interface PerSide<T> { home: T; away: T }

/** The rack in play. */
export interface LiveRack {
  /** rack number over the whole match (1-based) */
  n: number;
  /** who breaks / broke this rack (null = not known yet: no lag recorded) */
  breaker: Side | null;
  /** 'break' = waiting for the break shot */
  phase: 'break' | 'play';
  /** object balls still on the table, ascending */
  table: number[];
  /** who is at the table */
  shooter: Side | null;
  /** 8-ball: the side holding solids (1–7); null = open table (4.4) */
  solids: Side | null;
  pending: Pending | null;
  /** consecutive fouls per side, this rack (3.13) */
  fouls: PerSide<number>;
  /** a push-out is allowed on the next shot (5.4 / 6.4) */
  push: boolean;
  /** the shooter has the cue ball in hand (1.6) — display only */
  bih: boolean;
  /** innings (visits) per side this rack (2.8) */
  inn: PerSide<number>;
  /** the open inning is the breaker's break inning */
  breakInning: boolean;
  /** the break was legal (no foul, not illegal) — for a break-and-run */
  breakLegal: boolean;
  /** balls pocketed on this rack's break (null = not broken yet) */
  brkPots: number | null;
  /** times this rack was re-racked (illegal break, 8 on the break, stalemate) */
  reracks: number;
}

/** One completed rack. */
export interface RackRecord {
  n: number;
  /** the set it belongs to (1 in a race without sets) */
  set: number;
  winner: Side;
  breaker: Side | null;
  mode: 'quick' | 'detail';
  how: RackEnd;
  bnr?: true;
  golden?: true;
  runOut?: true;
  /** detail only */
  innings?: PerSide<number>;
  breakPots?: number;
}

/** Per-side stat counters (POOL_DESIGN §5). */
export interface Tally {
  racks: number;
  racksBroken: number;
  racksWonOnBreak: number;
  bnr: number;
  golden: number;
  runOuts: number;
  breaks: number;
  breakPots: number;
  dryBreaks: number;
  breakFouls: number;
  illegalBreaks: number;
  eightOnBreak: number;
  potted: number;
  fouls: number;
  foulsBy: Partial<Record<FoulKind, number>>;
  threeFoulLosses: number;
  eightLosses: number;
  safeties: number;
  pushOuts: number;
  innings: number;
  detailRacks: number;
  quickRacks: number;
}

export type BreakFormat = 'alternate' | 'winner' | 'loser';

export interface PoolState {
  v: 1;
  game: PoolGame;
  /** racks to win a set (or the match, in a race without sets) */
  raceTo: number;
  /** sets to win the match; 1 = one race */
  setsToWin: number;
  breakFormat: BreakFormat;
  threeFoul: boolean;
  threeBallRule: boolean;
  tenEarly: boolean;
  /** who broke rack 1 (the lag) — drives the alternate-break schedule */
  firstBreaker: Side | null;
  /** racks won in the set in play */
  current: PerSide<number>;
  /** completed sets' rack scores [home, away] (a race without sets: one entry, once won) */
  sets: Array<[number, number]>;
  setsWon: PerSide<number>;
  racks: RackRecord[];
  tally: PerSide<Tally>;
  /** null once the match has ended */
  rack: LiveRack | null;
  ended: boolean;
  winner: Side | null;
  /** accepted events */
  seq: number;
}

/** The action shape this reducer reads (a ScoreAction; `attribution` ignored). */
export interface PoolAction { type: string; side?: Side; payload?: Record<string, unknown> }

// ----------------------------------------------------------- set-up ----

const zero = (): PerSide<number> => ({ home: 0, away: 0 });

export function emptyTally(): Tally {
  return {
    racks: 0, racksBroken: 0, racksWonOnBreak: 0, bnr: 0, golden: 0, runOuts: 0, breaks: 0, breakPots: 0, dryBreaks: 0,
    breakFouls: 0, illegalBreaks: 0, eightOnBreak: 0, potted: 0, fouls: 0, foulsBy: {}, threeFoulLosses: 0, eightLosses: 0,
    safeties: 0, pushOuts: 0, innings: 0, detailRacks: 0, quickRacks: 0,
  };
}

function newRack(n: number, breaker: Side | null, game: PoolGame): LiveRack {
  return {
    n, breaker, phase: 'break', table: fullRack(game), shooter: breaker, solids: null, pending: null, fouls: zero(),
    push: false, bih: false, inn: zero(), breakInning: false, breakLegal: false, brkPots: null, reracks: 0,
  };
}

/** A fresh match. Options (POOL_DESIGN §6) are read once and frozen into the state. */
export function createInitialState(config?: Record<string, unknown>): PoolState {
  const c = ownRecord(config); // own keys only (breaks #5)
  const game = readGame(c.game);
  const bf = c.breakFormat;
  return {
    v: 1,
    game,
    raceTo: readInt(c.raceTo, 5, 1, 99),
    setsToWin: readInt(c.setsToWin, 1, 1, 9),
    breakFormat: bf === 'winner' || bf === 'loser' ? bf : 'alternate',
    // 3.13: "Some games such as 8-Ball do not include this rule"
    threeFoul: readBool(c.threeFoul, game !== 'eight'),
    // 5.3(c) / Reg 16 — 9-ball only
    threeBallRule: game === 'nine' && readBool(c.threeBallRule, true),
    // 6.7 (2026): the 10 wins only as the last ball; true = the older practice
    tenEarly: game === 'ten' && readBool(c.tenEarly, false),
    firstBreaker: null,
    current: zero(),
    sets: [],
    setsWon: zero(),
    racks: [],
    tally: { home: emptyTally(), away: emptyTally() },
    rack: newRack(1, null, game),
    ended: false,
    winner: null,
    seq: 0,
  };
}

/** Replay a log from a fresh match (undo = replay without the newest event). */
export function replay(config: Record<string, unknown> | undefined, actions: readonly PoolAction[]): PoolState {
  const s0 = createInitialState(config);
  return Array.isArray(actions) ? actions.reduce<PoolState>((s, a) => reducer(s, a), s0) : s0;
}

// ----------------------------------------------------------- drafts ----

/** A copy of everything an event may change (all small and fixed-size; the
 *  racks / sets lists are replaced, never written into). */
function draft(s: PoolState): PoolState {
  const r = s.rack;
  const t = (x: Tally): Tally => ({ ...x, foulsBy: { ...x.foulsBy } });
  return {
    ...s,
    current: { ...s.current },
    setsWon: { ...s.setsWon },
    tally: { home: t(s.tally.home), away: t(s.tally.away) },
    rack: r ? { ...r, table: [...r.table], fouls: { ...r.fouls }, inn: { ...r.inn }, pending: r.pending ? { ...r.pending } : null } : null,
    seq: s.seq + 1,
  };
}

const without = (table: number[], balls: number[]) => table.filter((b) => !balls.includes(b));
const spot = (table: number[], ball: number) => (table.includes(ball) ? table : [...table, ball].sort((a, b) => a - b));

/** A foul kind from a payload: a known kind, else 'other' for any other value
 *  that says "foul" (text, true); null when no foul is given. */
function readKind(v: unknown): FoulKind | null {
  if (v === undefined || v === null || v === false) return null;
  return typeof v === 'string' && KIND_SET.has(v) ? (v as FoulKind) : 'other';
}

/** The table passes to `side`: a new inning (2.8). */
function comeToTable(r: LiveRack, side: Side, bih: boolean, isBreak = false) {
  r.shooter = side;
  r.inn[side] += 1;
  r.breakInning = isBreak;
  r.bih = bih;
}

/** A standard foul by `side` (counted toward 3.13). */
function chargeFoul(d: PoolState, side: Side, kind: FoulKind) {
  const t = d.tally[side];
  t.fouls += 1;
  t.foulsBy[kind] = (t.foulsBy[kind] ?? 0) + 1;
  d.rack!.fouls[side] += 1;
}

/** A legal shot by `side`: its consecutive fouls restart (3.13). */
function legalShot(r: LiveRack, side: Side) {
  r.fouls[side] = 0;
}

/** Re-rack the rack in play (4.3(d)/(e)/(f), 1.13 stalemate): a full table,
 *  the given breaker; the innings and the foul count restart. */
function rerack(d: PoolState, breaker: Side) {
  const r = d.rack!;
  d.rack = { ...newRack(r.n, breaker, d.game), reracks: r.reracks + 1 };
}

/** Who breaks rack `n`, by the break format (1.3). */
function scheduledBreaker(s: Pick<PoolState, 'breakFormat' | 'firstBreaker' | 'racks'>, n: number): Side | null {
  if (n <= 1) return s.firstBreaker;
  if (s.breakFormat === 'alternate') return s.firstBreaker ? (n % 2 === 1 ? s.firstBreaker : other(s.firstBreaker)) : null;
  const last = s.racks[s.racks.length - 1];
  if (!last) return s.firstBreaker;
  return s.breakFormat === 'winner' ? last.winner : other(last.winner);
}

/** A breaker named for rack `n` with no lag recorded: back-compute the first breaker. */
function learnFirstBreaker(d: PoolState, n: number, breaker: Side) {
  if (d.firstBreaker) return;
  if (n === 1) d.firstBreaker = breaker;
  else if (d.breakFormat === 'alternate') d.firstBreaker = n % 2 === 1 ? breaker : other(breaker);
}

// --------------------------------------------------------- rack end ----

interface QuickRack { breaker: Side | null; bnr: boolean; golden: boolean; runOut: boolean }

/** Close the rack in play: the record, the tally, the set / match, the next rack. */
function endRack(d: PoolState, winner: Side, how: RackEnd, quick?: QuickRack) {
  const r = d.rack!;
  const loser = other(winner);
  const rec: RackRecord = { n: r.n, set: d.sets.length + 1, winner, breaker: quick ? quick.breaker : r.breaker, mode: quick ? 'quick' : 'detail', how };
  const tw = d.tally[winner];
  const tl = d.tally[loser];
  tw.racks += 1;
  if (quick) {
    if (quick.bnr) { rec.bnr = true; tw.bnr += 1; }
    if (quick.golden) { rec.golden = true; tw.golden += 1; }
    if (quick.runOut) { rec.runOut = true; tw.runOuts += 1; }
    tw.quickRacks += 1; tl.quickRacks += 1;
  } else {
    // a rack won at the table: from the break inning (break-and-run) or in a single visit by the other player (run-out)
    if (how === 'money' || how === 'golden') {
      if (winner === r.breaker && r.inn[winner] === 1 && r.breakInning && r.breakLegal) { rec.bnr = true; tw.bnr += 1; }
      else if (winner !== r.breaker && r.inn[winner] === 1) { rec.runOut = true; tw.runOuts += 1; }
    }
    if (how === 'golden') { rec.golden = true; tw.golden += 1; }
    if (how === 'threeFoul') tl.threeFoulLosses += 1;
    if (how === 'eightFoul' || how === 'eightEarly' || how === 'eightPocket' || how === 'eightOff') tl.eightLosses += 1;
    rec.innings = { ...r.inn };
    if (r.brkPots !== null) rec.breakPots = r.brkPots;
    for (const sd of ['home', 'away'] as const) { d.tally[sd].innings += r.inn[sd]; d.tally[sd].detailRacks += 1; }
  }
  if (rec.breaker) {
    d.tally[rec.breaker].racksBroken += 1;
    if (rec.breaker === winner) d.tally[rec.breaker].racksWonOnBreak += 1;
  }
  d.racks = [...d.racks, rec];
  d.current[winner] += 1;
  if (d.current[winner] >= d.raceTo) {
    d.sets = [...d.sets, [d.current.home, d.current.away]];
    d.setsWon[winner] += 1;
    d.current = zero();
    if (d.setsWon[winner] >= d.setsToWin) {
      d.ended = true;
      d.winner = winner;
      d.rack = null;
      return;
    }
  }
  d.rack = newRack(r.n + 1, scheduledBreaker(d, r.n + 1), d.game);
}

// ---------------------------------------------------------- reducer ----

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPair = (v: unknown): boolean => isObj(v) && typeof v.home === 'number' && typeof v.away === 'number';
const isTally = (v: unknown): boolean => isObj(v) && isObj(v.foulsBy);

/** A state this engine made and can play on: every field an event touches has
 *  its shape. Anything else (a corrupted or foreign snapshot) is never played
 *  on — the reducer hands it back unchanged (breaks #24). */
function playable(s: PoolState): boolean {
  if (!isObj(s) || s.v !== 1 || !Object.prototype.hasOwnProperty.call(TOP, s.game)) return false;
  if (!Array.isArray(s.racks) || !Array.isArray(s.sets) || !isPair(s.current) || !isPair(s.setsWon)) return false;
  if (!isObj(s.tally) || !isTally(s.tally.home) || !isTally(s.tally.away)) return false;
  const r = s.rack;
  return isObj(r) && Array.isArray(r.table) && isPair(r.fouls) && isPair(r.inn);
}

export function reducer(s: PoolState, a: PoolAction): PoolState {
  if (!s || typeof s !== 'object' || s.ended || !s.rack || !playable(s)) return s;
  // own properties only — an inherited type / side / payload field never counts (breaks #5)
  const type = own(a, 'type');
  if (typeof type !== 'string') return s;
  const side = own(a, 'side');
  const p = ownRecord(own(a, 'payload'));
  switch (type) {
    case 'LAG': return lag(s, side, p);
    case 'BREAK': return breakShot(s, side, p);
    case 'POT': return pot(s, side, p);
    case 'MISS': return miss(s, side);
    case 'SAFETY': return safety(s, side, p);
    case 'FOUL': return foul(s, side, p);
    case 'PUSH': return pushOut(s, side, p);
    case 'CHOOSE': return choose(s, p);
    case 'RACK': return quickRack(s, side, p);
    case 'STALEMATE': return stalemate(s);
    default: return s; // STAT_ADJUST, UNDO, unknown: no effect on the match
  }
}

/** 1.2 / 4.1 / 5.1 / 6.1 — the lag winner chooses who breaks rack 1. */
function lag(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  if (!isSide(side) || r.n !== 1 || r.phase !== 'break' || r.reracks > 0 || s.racks.length) return s;
  const breaks = isSide(p.breaks) ? p.breaks : side;
  const d = draft(s);
  d.firstBreaker = breaks;
  d.rack!.breaker = breaks;
  d.rack!.shooter = breaks;
  return d;
}

/** The shooter this action is for: the side at the table; a different side → null (ignored). */
function shooterOf(r: LiveRack, side: unknown): Side | null {
  if (r.phase !== 'play' || r.pending || !r.shooter) return null;
  if (side === undefined) return r.shooter;
  return side === r.shooter ? r.shooter : null;
}

/** BREAK — 4.3 (8-ball), 5.3 + Reg 16 (9-ball), 6.3 (10-ball). */
function breakShot(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  if (r.phase !== 'break' || r.pending) return s;
  if (side !== undefined && !isSide(side)) return s;
  const breaker = r.breaker ?? (isSide(side) ? side : null);
  if (!breaker || (isSide(side) && side !== breaker)) return s;
  const top = TOP[s.game];
  const pots = readBalls(p.pots, top);
  const off = readBalls(p.off, top);
  if (!pots || !off || pots.some((b) => off.includes(b))) return s;
  let kind = readKind(p.foul);
  if (!kind && off.length) kind = 'offTable'; // 3.5: a ball off the table is a foul
  const illegal = p.illegal === true && pots.length === 0;
  // 5.3(c) / Reg 16(1): fewer than three balls pocketed or across the head string
  const short = s.threeBallRule && p.short === true && pots.length < 3;
  // 5.3(b) / 6.3(b): at 9- and 10-ball an illegal break is a foul (at 8-ball it is not: 4.3(d))
  if (illegal && !kind && s.game !== 'eight') kind = 'illegalBreak';

  const d = draft(s);
  const rk = d.rack!;
  learnFirstBreaker(d, rk.n, breaker);
  rk.breaker = breaker;
  rk.phase = 'play';
  rk.solids = null; // 4.4: the table is open after the break
  rk.push = false;
  const opp = other(breaker);
  comeToTable(rk, breaker, false, true);
  const t = d.tally[breaker];
  t.breaks += 1;
  t.breakPots += pots.length;
  if (!pots.length) t.dryBreaks += 1;
  if (illegal) t.illegalBreaks += 1;
  rk.brkPots = pots.length;
  rk.table = without(rk.table, [...pots, ...off]);
  const money = MONEY[s.game];

  if (s.game === 'eight') {
    if (off.includes(8)) rk.table = spot(rk.table, 8); // 4.3(g) / 4.7: the 8 off the table on the break is spotted
    if (pots.includes(8)) t.eightOnBreak += 1;
    if (kind) {
      t.breakFouls += 1;
      chargeFoul(d, breaker, kind);
      rk.breakLegal = false;
      // 4.3(f): the 8 pocketed on a break foul — the opponent's option
      if (pots.includes(8)) { rk.pending = { kind: 'eightFoul', by: opp }; return d; }
      // 4.3(g)/(h): the opponent comes to the table (ball in hand above the head string, or the table as it lies)
      comeToTable(rk, opp, true);
      return d;
    }
    legalShot(rk, breaker);
    if (illegal) { rk.breakLegal = false; rk.pending = { kind: 'illegalBreak', by: opp }; return d; } // 4.3(d)
    rk.breakLegal = true;
    if (pots.includes(8)) { rk.pending = { kind: 'eightBreak', by: breaker }; return d; } // 4.3(e)
    if (!pots.length) comeToTable(rk, opp, false); // a dry legal break: the opponent plays from position
    return d; // 4.3(c): a ball pocketed — the breaker continues
  }

  // 9-ball / 10-ball
  const moneyDown = pots.includes(money) || off.includes(money);
  if (kind) {
    if (moneyDown) rk.table = spot(rk.table, money); // 5.6 / 6.8
    t.breakFouls += 1;
    chargeFoul(d, breaker, kind);
    rk.breakLegal = false;
    if (s.threeFoul && rk.fouls[breaker] >= 3) { endRack(d, opp, 'threeFoul'); return d; }
    comeToTable(rk, opp, true); // 5.7 / 6.9: ball in hand; no push-out after a break foul (5.4 / 6.4)
    return d;
  }
  legalShot(rk, breaker);
  rk.breakLegal = true;
  if (s.game === 'nine') {
    if (short) {
      if (pots.includes(9)) rk.table = spot(rk.table, 9); // Reg 16(5)
      rk.pending = { kind: 'threeBall', by: opp }; // Reg 16(2)
      return d;
    }
    if (pots.includes(9)) { endRack(d, breaker, 'golden'); return d; } // 5.5: the 9 legally pocketed — a golden break
  } else if (pots.includes(10)) {
    rk.table = spot(rk.table, 10); // 6.8: the 10 on the break is spotted
  }
  rk.push = true; // 5.4 / 6.4: the next shot may be a push-out
  if (!pots.length) comeToTable(rk, opp, false);
  return d;
}

/** The group a side plays at 8-ball (null = open table). */
const groupOf = (r: LiveRack, side: Side): readonly number[] | null =>
  r.solids === null ? null : r.solids === side ? SOLIDS : STRIPES;

/** POT — a shot with no foul that pocketed balls. */
function pot(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  const shooter = shooterOf(r, side);
  if (!shooter) return s;
  const top = TOP[s.game];
  const pots = readBalls(p.pots, top);
  if (!pots || !pots.length || pots.some((b) => !r.table.includes(b))) return s;
  const called = p.called !== false;
  let calledBall: number | undefined;
  if (p.calledBall !== undefined) {
    const cb = p.calledBall;
    if (typeof cb !== 'number' || !Number.isInteger(cb) || cb < 1 || cb > top) return s;
    if (called && !pots.includes(cb)) return s; // "the called ball went in" but it isn't in the list
    calledBall = cb;
  }
  return potShot(s, shooter, pots, called, calledBall);
}

/** A legal (no-foul) shot that pocketed `pots` (validated, on the table). */
function potShot(s: PoolState, shooter: Side, pots: number[], called: boolean, calledBall: number | undefined): PoolState {
  const before = s.rack!.table;
  const d = draft(s);
  const r = d.rack!;
  const opp = other(shooter);
  const t = d.tally[shooter];
  legalShot(r, shooter);
  r.push = false;
  r.bih = false;
  r.table = without(r.table, pots);

  if (s.game === 'eight') {
    if (pots.includes(8)) {
      // 4.8(c): the 8 in an uncalled pocket
      if (!called) { endRack(d, opp, 'eightPocket'); return d; }
      // 4.8(b) / 4.4: the 8 is the called ball only once the group is cleared (on an
      // open table: once either group is completely pocketed) — before the shot
      const own = groupOf(s.rack!, shooter);
      const cleared = own ? own.every((b) => !before.includes(b))
        : SOLIDS.every((b) => !before.includes(b)) || STRIPES.every((b) => !before.includes(b));
      if (!cleared) { endRack(d, opp, 'eightEarly'); return d; }
      t.potted += pots.filter((b) => b === 8 || (own ?? []).includes(b)).length;
      endRack(d, shooter, 'money');
      return d;
    }
    if (r.solids === null) {
      // 4.4: the called ball decides the groups; a miss leaves the table open
      if (!called) { comeToTable(r, opp, false); return d; }
      const cb = calledBall ?? pots[0];
      r.solids = SOLIDS.includes(cb) ? shooter : opp;
      t.potted += pots.filter((b) => groupOf(r, shooter)!.includes(b)).length;
      return d;
    }
    // 4.5: the shooter stays while balls of the group are pocketed legally
    const own = groupOf(r, shooter)!;
    const mine = pots.filter((b) => own.includes(b));
    const legal = called && (calledBall !== undefined ? own.includes(calledBall) : mine.length > 0);
    if (!legal) { comeToTable(r, opp, false); return d; }
    t.potted += mine.length;
    return d;
  }

  if (s.game === 'nine') {
    // 5.5: any ball legally pocketed keeps the shooter at the table; the 9 wins
    t.potted += pots.length;
    if (pots.includes(9)) endRack(d, shooter, 'money');
    return d;
  }

  // 10-ball
  if (!called) {
    // 6.6: a wrongfully pocketed ball — the other athlete chooses; 6.8: the 10 is spotted
    if (pots.includes(10)) r.table = spot(r.table, 10);
    r.pending = { kind: 'wrongPot', by: opp };
    return d;
  }
  if (pots.includes(10)) {
    // 6.7: the 10 wins on a called shot when it is the only object ball (tenEarly: when called)
    const onlyTen = before.length === 1 && before[0] === 10;
    if (onlyTen || (s.tenEarly && calledBall === 10)) {
      t.potted += pots.length;
      endRack(d, shooter, 'money');
      return d;
    }
    r.table = spot(r.table, 10); // 6.8
    t.potted += pots.length - 1;
    return d;
  }
  t.potted += pots.length;
  return d;
}

/** MISS — nothing pocketed, no foul: the inning ends (5.5 / 6.7 / 4.5). */
function miss(s: PoolState, side: unknown): PoolState {
  const shooter = shooterOf(s.rack!, side);
  if (!shooter) return s;
  const d = draft(s);
  const r = d.rack!;
  legalShot(r, shooter);
  r.push = false;
  comeToTable(r, other(shooter), false);
  return d;
}

/** SAFETY — 1.7 / 2.16 / 4.6. 9-ball has no call (a legal pot continues: 5.5);
 *  10-ball has no safety call (6.5: a pocketed ball is a wrongful pot, 6.6). */
function safety(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r0 = s.rack!;
  const shooter = shooterOf(r0, side);
  if (!shooter) return s;
  const pots = readBalls(p.pots, TOP[s.game]);
  if (!pots || pots.some((b) => !r0.table.includes(b))) return s;
  if (pots.length && s.game === 'nine') return potShot(s, shooter, pots, true, undefined);
  const d = draft(s);
  const r = d.rack!;
  const opp = other(shooter);
  d.tally[shooter].safeties += 1;
  legalShot(r, shooter);
  r.push = false;
  r.bih = false;
  r.table = without(r.table, pots);
  if (s.game === 'eight' && pots.includes(8)) {
    // 4.8(b) before the group is cleared, else 4.8(c): the 8 was not called
    const own = groupOf(r0, shooter);
    const cleared = own ? own.every((b) => !r0.table.includes(b))
      : SOLIDS.every((b) => !r0.table.includes(b)) || STRIPES.every((b) => !r0.table.includes(b));
    endRack(d, opp, cleared ? 'eightPocket' : 'eightEarly');
    return d;
  }
  if (s.game === 'ten' && pots.length) {
    if (pots.includes(10)) r.table = spot(r.table, 10);
    r.pending = { kind: 'wrongPot', by: opp };
    return d;
  }
  comeToTable(r, opp, false);
  return d;
}

/** FOUL — 3.x; 4.8(a)/(d) at 8-ball; 5.6 / 6.8 spotting; 3.13 three fouls. */
function foul(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  if (r.phase !== 'play' || r.pending || !r.shooter) return s;
  const kind0 = readKind(p.kind);
  let fouler: Side;
  if (side === undefined) fouler = r.shooter;
  else if (!isSide(side)) return s;
  else if (side === r.shooter) fouler = side;
  else if (kind0 === 'outOfTurn') fouler = side; // 3.12: the athlete who played out of turn
  else return s;
  const top = TOP[s.game];
  const pots = readBalls(p.pots, top);
  const off = readBalls(p.off, top);
  if (!pots || !off || pots.some((b) => off.includes(b)) || [...pots, ...off].some((b) => !r.table.includes(b))) return s;
  const kind: FoulKind = kind0 ?? (off.length ? 'offTable' : 'other');
  return applyFoul(draft(s), fouler, kind, pots, off);
}

/** A foul on a drafted state (FOUL, or a push-out that fouled). */
function applyFoul(d: PoolState, fouler: Side, kind: FoulKind, pots: number[], off: number[]): PoolState {
  const r = d.rack!;
  const atTable = r.shooter;
  const incoming = other(fouler);
  r.table = without(r.table, [...pots, ...off]);
  r.push = false;
  chargeFoul(d, fouler, kind);
  if (d.game === 'eight') {
    if (pots.includes(8)) { endRack(d, incoming, 'eightFoul'); return d; } // 4.8(a)
    if (off.includes(8)) { endRack(d, incoming, 'eightOff'); return d; } // 4.8(d)
  } else {
    const money = MONEY[d.game];
    if (pots.includes(money) || off.includes(money)) r.table = spot(r.table, money); // 5.6 / 6.8
  }
  if (d.threeFoul && r.fouls[fouler] >= 3) { endRack(d, incoming, 'threeFoul'); return d; } // 3.13
  if (fouler === atTable) comeToTable(r, incoming, true);
  else r.bih = true; // 3.12: the athlete whose turn it was keeps the table, ball in hand
  return d;
}

/** PUSH — 5.4 / 6.4: the shot after a break with no foul; then the other athlete chooses. */
function pushOut(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  if (s.game === 'eight') return s;
  const shooter = shooterOf(r, side);
  if (!shooter || !r.push) return s;
  const top = TOP[s.game];
  const pots = readBalls(p.pots, top);
  const off = readBalls(p.off, top);
  if (!pots || !off || pots.some((b) => off.includes(b)) || [...pots, ...off].some((b) => !r.table.includes(b))) return s;
  let kind = readKind(p.foul);
  if (!kind && off.length) kind = 'offTable';
  const d = draft(s);
  d.tally[shooter].pushOuts += 1;
  if (kind) return applyFoul(d, shooter, kind, pots, off); // an illegal push-out is penalised as its foul
  const rk = d.rack!;
  rk.push = false;
  rk.bih = false;
  legalShot(rk, shooter);
  rk.table = without(rk.table, pots);
  const money = MONEY[s.game];
  if (pots.includes(money)) rk.table = spot(rk.table, money); // 5.6 / 6.8
  rk.pending = { kind: 'push', by: other(shooter) };
  return d;
}

/** CHOOSE — resolve the pending decision. */
function choose(s: PoolState, p: Record<string, unknown>): PoolState {
  const r = s.rack!;
  const pend = r.pending;
  if (!pend) return s;
  const choice = p.choice;
  const twoWay = pend.kind === 'push' || pend.kind === 'wrongPot' || pend.kind === 'threeBall';
  if (choice !== 'play' && !(twoWay ? choice === 'pass' : choice === 'rerack')) return s;
  if (p.breaker !== undefined && !isSide(p.breaker)) return s;
  const by = pend.by;
  const d = draft(s);
  const rk = d.rack!;
  rk.pending = null;
  switch (pend.kind) {
    case 'push':
    case 'wrongPot':
      // 2.8: a passed shot continues the shooter's inning
      if (choice === 'play') comeToTable(rk, by, false);
      rk.push = false;
      return d;
    case 'threeBall':
      // Reg 16(3): accepting the table — no push-out; 16(4): handed back — the breaker may push out
      if (choice === 'play') { comeToTable(rk, by, false); rk.push = false; } else rk.push = true;
      return d;
    case 'illegalBreak':
      // 4.3(d): (1) accept the table, (2) re-rack and break, (3) re-rack and the offender breaks again
      if (choice === 'play') comeToTable(rk, by, false);
      else rerack(d, isSide(p.breaker) ? p.breaker : by);
      return d;
    case 'eightBreak':
      // 4.3(e): (1) spot the 8 and continue, (2) re-break (the breaker)
      if (choice === 'play') rk.table = spot(rk.table, 8);
      else rerack(d, rk.breaker ?? by);
      return d;
    case 'eightFoul':
      // 4.3(f): (1) spot the 8, ball in hand above the head string, (2) re-break (the chooser by default)
      if (choice === 'play') { rk.table = spot(rk.table, 8); comeToTable(rk, by, true); } else rerack(d, isSide(p.breaker) ? p.breaker : by);
      return d;
  }
}

/** RACK — quick mode on a rack with no detail; an award on a rack with detail. */
function quickRack(s: PoolState, side: unknown, p: Record<string, unknown>): PoolState {
  if (!isSide(side)) return s;
  const r = s.rack!;
  const d = draft(s);
  if (r.phase === 'play' || r.reracks > 0) { endRack(d, side, 'awarded'); return d; }
  let breaker: Side | null = isSide(p.breaker) ? p.breaker : r.breaker;
  let golden = p.golden === true && s.game === 'nine';
  let bnr = p.bnr === true || golden;
  if (bnr && !breaker) breaker = side; // a break-and-run names its breaker
  if (breaker && breaker !== side) { golden = false; bnr = false; }
  const runOut = p.runOut === true && !bnr && breaker !== side;
  if (breaker) learnFirstBreaker(d, r.n, breaker);
  endRack(d, side, 'quick', { breaker, bnr, golden, runOut });
  return d;
}

/** STALEMATE — 1.13, 4.11 / 5.9 / 6.11: the original breaker breaks again. */
function stalemate(s: PoolState): PoolState {
  const r = s.rack!;
  if (r.phase !== 'play' || !r.breaker) return s;
  const d = draft(s);
  rerack(d, r.breaker);
  return d;
}

// ---------------------------------------------------------- readers ----

const isState = (s: unknown): s is PoolState =>
  !!s && typeof s === 'object' && Array.isArray((s as PoolState).sets) && !!(s as PoolState).current;

export const isComplete = (s: PoolState): boolean => !!s && typeof s === 'object' && s.ended === true;
export const winner = (s: PoolState): Side | null => (isComplete(s) && isSide(s.winner) ? s.winner : null);

const setMode = (s: PoolState) => Number(s.setsToWin) > 1;

/** Racks won in a race without sets (the final once it is over). */
function raceRacks(s: PoolState): PerSide<number> {
  const f = s.ended ? s.sets[0] : null;
  return f ? { home: f[0], away: f[1] } : { home: s.current?.home ?? 0, away: s.current?.away ?? 0 };
}

/** The result for standings: sets won (with sets) or racks won (a race). */
export function result(s: PoolState): { winner: Side; home: number; away: number } | null {
  if (!isState(s) || !isComplete(s) || !isSide(s.winner)) return null;
  const sc = setMode(s) ? s.setsWon : raceRacks(s);
  return { winner: s.winner, home: sc.home, away: sc.away };
}

/** SD-01: the completed sets ("5-3, 2-5, 5-4"), or a finished race ("5-3"); '' before. */
export function scoreLine(s: PoolState, perspective?: Side): string {
  if (!isState(s)) return '';
  return lineOf(s.sets, { perspective });
}

/** SD-20: the line score — sets (with sets) or the race as one column. */
export function lineScore(s: PoolState): LineScore | null {
  if (!isState(s)) return null;
  if (setMode(s)) return pointsLineScore('set', { games: s.sets, current: s.current, won: s.setsWon, ended: s.ended, toWin: s.setsToWin });
  return pointsLineScore('game', { games: s.sets, current: s.current, won: raceRacks(s), ended: s.ended, toWin: s.raceTo });
}

/** The scoreboard: racks in the set in play; once over, sets (or racks) won. */
export function summary(s: PoolState): ScoreSummary {
  if (!isState(s)) return { homeScore: '0', awayScore: '0', statusLine: 'Pool' };
  const label = GAME_LABEL[s.game] ?? 'Pool';
  if (s.ended) return setMode(s) ? finalSummary(s.setsWon, scoreLine(s)) : finalSummary(raceRacks(s), '');
  const line = scoreLine(s);
  const rackNo = s.rack?.n ?? s.racks.length + 1;
  return {
    homeScore: String(s.current.home),
    awayScore: String(s.current.away),
    statusLine: `${label} · ${setMode(s) ? `Set ${s.sets.length + 1} · ` : ''}Rack ${rackNo}`,
    detailLine: setMode(s)
      ? `Sets ${s.setsWon.home}–${s.setsWon.away}${line ? ` (${line})` : ''} · race to ${s.raceTo}`
      : `race to ${s.raceTo}${s.breakFormat === 'winner' ? ' · winner breaks' : s.breakFormat === 'loser' ? ' · loser breaks' : ''}`,
  };
}

/** 3.13: the player at the table who is on two fouls (the app shows the warning). */
export function onTwoFouls(s: PoolState): Side | null {
  const r = s?.rack;
  if (!r || !s.threeFoul || r.phase !== 'play' || !r.shooter) return null;
  return r.fouls?.[r.shooter] === 2 ? r.shooter : null;
}

/** Who breaks the rack waiting for its break (null = mid-rack, over, or unknown). */
export function nextBreaker(s: PoolState): Side | null {
  const r = s?.rack;
  return r && r.phase === 'break' ? r.breaker : null;
}
