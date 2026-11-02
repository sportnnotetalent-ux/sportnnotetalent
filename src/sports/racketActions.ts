/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the actions the racket
 * scoring controls dispatch (badminton, tennis, padel, pickleball, squash,
 * table tennis), as pure builders: the controls and the tests build them the
 * same way. Match events are public, so every one carries player IDS only —
 * never a name; names are looked up when shown (racketNames.ts). PURE.
 */
import type { ScoreAction } from './types';
import type { ConductLevel, ConductTrack, TimeoutKind } from './conduct';
import { DOUBLE_FAULT_STAT } from './tennis/doubleFault.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
/** A picked player (a roster `Player` fits). */
export type Who = { id: string } | null | undefined;

/** The credit a scoring action carries — the player's id, never the name.
 *  `side` (SD-119) only when it isn't the action's own side. */
export const creditOf = (p: Who, stat: string, side?: Side): ScoreAction['attribution'] =>
  (p ? { playerId: p.id, stat, ...(side ? { side } : {}) } : undefined);

/** A rally / point won by `side`, credited to `p` (`type: 'ACE'` = a tennis
 *  ace; `payload` e.g. a squash Stroke `{ pd: { how } }` or padel's Ace). */
export const pointAction = (side: Side, p?: Who, o: { type?: 'POINT' | 'ACE'; stat?: string; payload?: Record<string, unknown> } = {}): ScoreAction => ({
  type: o.type ?? 'POINT', side,
  ...(o.payload ? { payload: o.payload } : {}),
  attribution: creditOf(p, o.stat ?? (o.type === 'ACE' ? 'aces' : 'points')),
});

/** SD-104 — a double fault by `server`'s side: the receivers' point, marked
 *  `df`; the faulting server (if named) is charged a double fault. */
export const doubleFaultAction = (server: Side, p?: Who): ScoreAction => ({
  type: 'POINT', side: opp(server), payload: { df: true }, attribution2: creditOf(p, DOUBLE_FAULT_STAT, server),
});

/** SD-06 — who starts the game in the right-hand court (pickleball doubles). */
export const startRightAction = (side: Side, p: { id: string }, fix = false): ScoreAction =>
  ({ type: 'SET_START_RIGHT', payload: { side, playerId: p.id, ...(fix ? { v: 2 } : {}) } });

/** SD-104 — tennis / padel doubles: who serves the pair's first game of the set. */
export const serveOrderAction = (side: Side, slot: number, p: { id: string }, partner?: { id: string }): ScoreAction =>
  ({ type: 'SET_SERVE_ORDER', payload: { side, slot, playerId: p.id, ...(partner ? { partnerId: partner.id, v: 2 } : {}) } });

/** SD-62 / SD-74 — table tennis / badminton doubles: who serves / receives first. */
export const doublesOrderAction = (key: 'server' | 'receiver', p: { id: string }, fix = false): ScoreAction =>
  ({ type: 'SET_SERVE_ORDER', payload: { [key]: p.id, ...(fix ? { v: 2 } : {}) } });

/** SD-53 — a conduct / time violation by `by` (the offender, by id).
 *  racket-batch5 RB1: a time-violation "fault · loss of serve" carries
 *  `los: true` (padel scores it only then; tennis ignores the key). */
export const conductAction = (by: Side, o: { level: ConductLevel; track?: ConductTrack; reason?: string }, p?: Who, at = Date.now()): ScoreAction => ({
  type: 'CONDUCT', side: by,
  payload: {
    level: o.level, ...(o.track === 'time' ? { track: o.track } : {}), ...(o.track === 'time' && o.level === 'fault' ? { los: true } : {}),
    ...(o.reason ? { reason: o.reason } : {}), ...(p ? { playerId: p.id } : {}), at,
  },
});

/** SD-54 — a timeout / medical / toilet marker (the player by id). */
export const timeoutAction = (side: Side, t: TimeoutKind, p?: Who, at = Date.now()): ScoreAction =>
  ({ type: 'TIMEOUT', side, payload: { t, ...(p ? { playerId: p.id } : {}), at } });

/** SD-107 — the erring player of a point detail (by id). */
export const errOf = (p: Who): { playerId: string } | undefined => (p ? { playerId: p.id } : undefined);
