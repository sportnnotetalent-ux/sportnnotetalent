/**
 * Cue & board batch 6 — seeded OLD-STYLE match logs (only the vocabulary that
 * existed before the batch) for pool, snooker, billiards, carrom and chess,
 * and a fingerprint of the replayed states. The fingerprints were recorded on
 * the code before batch 6 (tests/cue-board-batch6.test.mts, OLD_PRINTS); the
 * test replays the same logs on the code now and must get the same prints,
 * with only the batch's new derived keys left out (`NEW_KEYS`).
 *
 * Pure: builds raw actions (pool / snooker / billiards through the controls,
 * whose default output a batch may not change — that is part of the proof).
 */
import { createHash } from 'node:crypto';
import type { ScoreAction } from '../src/sports/types.ts';
import * as PM from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import * as B from '../src/sports/billiards/engine.ts';
import * as BC from '../src/sports/billiards/controls.ts';
import * as CR from '../src/sports/carrom/engine.ts';
import * as CH from '../src/sports/chess/engine.ts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];

export function makeRnd(n: number) {
  let seed = n;
  return (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
}

/** Keys batch 6 adds to derived state (left out of the fingerprint). */
export const NEW_KEYS = new Set([
  // pool: credit counters, the extension record, the shot-clock option
  'ballInHand', 'pushPlayed', 'pushPassed', 'rerackBreaks', 'notCalled', 'extensions', 'xr', 'shotClock',
  // snooker: the break make-up, total clearance, long pots / rest
  'mk', 'tc', 'lp', 'lm', 'rs', 'trackLR',
  // billiards: the red's run from the spot
  'redRun',
  // carrom: board / game awards
  'award', 'gameAwards',
  // chess: arbiter events, uneven score, second period / delay
  'events', 'uneven', 'tc2',
]);

export function fingerprint(x: unknown): string {
  const json = JSON.stringify(x, (k, v) => (NEW_KEYS.has(k) ? undefined : v));
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/* ------------------------------------------------------------------ pool -- */
export function poolLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const game = (['eight', 'nine', 'ten'] as const)[rnd(3)];
  const cfg = { game, raceTo: 1 + rnd(5), playersPerSide: 1 };
  let s = PM.poolInit(cfg);
  const acts: ScoreAction[] = [];
  const tap = (a: ScoreAction | null) => { if (!a) return; const n = PM.poolReducer(s, a); if (n !== s) { acts.push(a); s = n; } };
  for (let i = 0; i < 140 && !s.ended; i++) {
    const p = PC.poolPanel(s) as { kind: string; table?: number[] };
    const r = rnd(20);
    if (p.kind === 'lag') tap(PC.lagAction(s, SIDES[rnd(2)]));
    else if (p.kind === 'break') tap(r < 6 && p.table?.length ? PC.breakAction(s, { pots: [p.table[rnd(p.table.length)]] }) : PC.breakAction(s, { pots: [] }));
    else if (p.kind === 'choice') tap(PC.chooseAction(s, rnd(2) ? 'play' : 'pass'));
    else if (p.kind === 'shot') {
      if (r < 4) tap(PC.foulAction(s, PC.PLAY_FOULS[rnd(PC.PLAY_FOULS.length)]));
      else if (r < 7) tap(PC.missAction(s));
      else if (r < 9) tap(PC.safetyAction(s, []));
      else if (r === 9 && game !== 'eight') tap(PC.pushAction(s, {}));
      else if (r === 10) tap(PC.stalemateAction(s));
      else if (r === 11 && p.table?.length) tap(PC.potAction(s, [p.table[0]], { called: false }));
      else if (p.table?.length) tap(PC.potAction(s, [p.table[0]]));
    } else break;
  }
  return { cfg, acts };
}

/* --------------------------------------------------------------- snooker -- */
export function snookerLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg = { reds: [15, 10, 6][rnd(3)], bestOf: 1 + 2 * rnd(2) };
  let s = S.createInitialState(cfg);
  const acts: ScoreAction[] = [];
  const tap = (a: ScoreAction | null) => { if (!a) return; const n = S.reducer(s, a as never); if (n !== s) { acts.push(a); s = n; } };
  for (let i = 0; i < 160 && s.frame && !s.ended; i++) {
    const p = SC.snookerPanel(s);
    if (!p) break;
    if (p.toss?.home) { tap(p.toss[SIDES[rnd(2)]]); continue; }
    if (p.respotLots?.home) { tap(p.respotLots[SIDES[rnd(2)]]); continue; }
    const r = rnd(12);
    const pots = p.balls.filter((b) => b.action && b.ball !== 'free');
    if (r < 6 && pots.length) tap(pots[rnd(pots.length)].action);
    else if (r < 8) tap(p.miss);
    else if (r < 10) tap(p.safety);
    else tap(SC.foulAction(s, { kind: rnd(3) ? S.FOUL_KINDS[rnd(S.FOUL_KINDS.length)] : undefined }));
  }
  return { cfg, acts };
}

/* ------------------------------------------------------------- billiards -- */
const PARTS: BC.Parts[] = [{ potRed: true }, { potRed: true }, { cannon: true }, { inOffRed: true }, { potWhite: true }, { inOffWhite: true }, { potRed: true, cannon: true }];
export function billiardsLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg = { target: 50 + 50 * rnd(3) };
  let s = B.createInitialState(cfg);
  const acts: ScoreAction[] = [];
  const tap = (a: ScoreAction | null) => { if (!a) return; const n = B.reducer(s, a as never); if (n !== s) { acts.push(a); s = n; } };
  for (let i = 0; i < 120 && !s.ended; i++) {
    const r = rnd(10);
    if (r < 6) tap(BC.strokeAction(s, PARTS[rnd(PARTS.length)]));
    else if (r < 8) tap(BC.missAction(s));
    else if (r < 9) tap(BC.safetyAction(s));
    else tap(BC.foulAction(s, rnd(3) ? B.FOUL_KINDS[rnd(B.FOUL_KINDS.length)] : undefined));
  }
  return { cfg, acts };
}

/* ---------------------------------------------------------------- carrom -- */
export function carromLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const cfg: Record<string, unknown> = { target: 25, maxBoards: 8, gamesToWin: 1 + rnd(2), ...(rnd(2) ? { foulScore: true } : {}), ...(rnd(3) === 0 ? { preset: 'icf' } : {}) };
  let s = CR.init(cfg);
  const acts: ScoreAction[] = [];
  const tap = (a: ScoreAction) => { const n = CR.reducer(s, a as never); if (n !== s) { acts.push(a); s = n; } };
  if (rnd(2)) tap({ type: 'FIRST_BREAK', side: SIDES[rnd(2)], payload: { side: SIDES[rnd(2)] } } as ScoreAction);
  for (let i = 0; i < 40 && !s.ended; i++) {
    const side = SIDES[rnd(2)];
    const r = rnd(10);
    if (r === 0) tap({ type: 'BOARD', side, payload: { penalty: true } } as ScoreAction);
    else if (r === 1) tap({ type: 'SET_TRACK', payload: { trackFouls: rnd(2) === 0, trackBreak: true } } as ScoreAction);
    else tap({ type: 'BOARD', side, payload: { coins: rnd(10), queenBy: (['winner', 'loser', 'none'] as const)[rnd(3)], ...(rnd(5) === 0 ? { slam: 'white' } : {}),
      ...(rnd(3) === 0 ? { endFoul: { striker: true } } : {}), ...(rnd(3) === 0 ? { det: { brk: rnd(4), fouls: { home: { touch: rnd(2) } } } } : {}) } } as ScoreAction);
  }
  return { cfg, acts };
}

/* ----------------------------------------------------------------- chess -- */
export function chessLog(seed: number): { cfg: Record<string, unknown>; acts: ScoreAction[] } {
  const rnd = makeRnd(seed);
  const ko = rnd(4) === 0;
  const cfg: Record<string, unknown> = { timeControl: ['rapid', 'blitz', 'classical'][rnd(3)], ...(rnd(2) ? { tcBase: 15, tcInc: 10 } : {}), ...(ko ? { koGames: 2 } : {}), ...(rnd(3) === 0 ? { trackMoves: true } : {}) };
  let s = CH.init(cfg);
  const acts: ScoreAction[] = [];
  const tap = (a: ScoreAction) => { const n = CH.reducer(s, a as never); if (n !== s) { acts.push(a); s = n; } };
  if (rnd(3) === 0) tap({ type: 'SET_WHITE', payload: { side: 'away' } } as ScoreAction);
  if (rnd(2)) tap({ type: 'MOVES', payload: { add: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'].slice(0, 1 + rnd(5)) } } as ScoreAction);
  for (let g = 0; g < 8 && !s.ended; g++) {
    const w = (['home', 'away', 'draw'] as const)[rnd(3)];
    const method = w === 'draw' ? CH.DRAWN[rnd(CH.DRAWN.length)] : CH.DECISIVE[rnd(CH.DECISIVE.length)];
    tap({ type: 'RESULT', side: w === 'draw' ? undefined : w, payload: { winner: w, ...(rnd(4) ? { method } : {}), ...(rnd(2) ? { moves: 20 + rnd(40) } : {}), ...(ko ? { ko: { games: 2 } } : {}) } } as ScoreAction);
  }
  return { cfg, acts };
}

/** Replay helpers (the code now). */
export const replayPool = (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => l.acts.reduce<PM.PoolMatch>((s, a) => PM.poolReducer(s, a), PM.poolInit(l.cfg));
export const replaySnooker = (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => l.acts.reduce<S.SnookerState>((s, a) => S.reducer(s, a as never), S.createInitialState(l.cfg));
export const replayBilliards = (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => l.acts.reduce<B.BilliardsState>((s, a) => B.reducer(s, a as never), B.createInitialState(l.cfg));
export const replayCarrom = (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => l.acts.reduce<CR.CarromState>((s, a) => CR.reducer(s, a as never), CR.init(l.cfg));
export const replayChess = (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => l.acts.reduce<CH.ChessState>((s, a) => CH.reducer(s, a as never), CH.init(l.cfg));

/** One print per sport over `n` seeded logs (the combined state fingerprints). */
export function allPrints(n = 100): Record<string, string> {
  const run = <T,>(gen: (k: number) => { cfg: Record<string, unknown>; acts: ScoreAction[] }, rep: (l: { cfg: Record<string, unknown>; acts: ScoreAction[] }) => T, salt: number) => {
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(fingerprint(rep(gen(salt + i))));
    return fingerprint(parts);
  };
  return {
    pool: run(poolLog, replayPool, 600000),
    snooker: run(snookerLog, replaySnooker, 610000),
    billiards: run(billiardsLog, replayBilliards, 620000),
    carrom: run(carromLog, replayCarrom, 630000),
    chess: run(chessLog, replayChess, 640000),
  };
}
