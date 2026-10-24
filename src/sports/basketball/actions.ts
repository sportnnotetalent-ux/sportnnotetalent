/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the actions the
 * basketball scoring controls dispatch, as pure builders: the controls, the
 * timeline editor and the tests build them the same way. Match events are
 * public, so every one carries player IDS only — never a name (`pid` in the
 * payload, `playerId` in the credit); names are looked up when shown
 * (names.ts). The controls stamp each one with its moment (quarter, minute,
 * clock second) and `v: 2`. PURE.
 */
import type { ScoreAction } from '../types';
import { creditAttribution, eventCredits, ftCredits, makeCredits, missCredits, reboundCredits, type Credits } from './credits.ts';
import type { BBEvent, DqReason, FoulType, ReboundType, ShotZone } from './events.ts';

type Side = 'home' | 'away';
/** A picked player (a roster `Player` fits). */
export type Who = { id: string } | null | undefined;

const pidOf = (p: Who) => (p ? { pid: p.id } : {});
/** A play's credits as an attribution — the player's id, never the name. */
export const creditOf = (p: Who, c: Credits, sign: 1 | -1 = 1): ScoreAction['attribution'] =>
  (p ? creditAttribution(p.id, undefined, c, sign) : undefined);

/** The single-stat plays: the action type → its stat key. */
export const STAT_OF = { ASSIST: 'assists', STEAL: 'steals', BLOCK: 'blocks', TURNOVER: 'turnovers' } as const;
export type StatPlay = keyof typeof STAT_OF;

/** A made basket worth `points` (`fga` = misses are tracked: the make is an
 *  attempt too). Deep wave: `zone`, `fbt` (fast breaks being tagged), `fb`. */
export const scoreAction = (side: Side, points: number, p?: Who, o: { halfCourt?: boolean; fga?: boolean; zone?: ShotZone; fbt?: boolean; fb?: boolean } = {}): ScoreAction => ({
  type: 'SCORE', side,
  payload: {
    points, ...(o.fga ? { fga: true } : {}), ...pidOf(p),
    ...(o.zone ? { zone: o.zone } : {}), ...(o.fbt ? { fbt: true } : {}), ...(o.fb ? { fb: true } : {}),
  },
  attribution: creditOf(p, makeCredits(points, o.halfCourt === true, o.fga === true)),
});

/** SD-31: a missed field goal (2 or 3; 3×3: 1 or 2). */
export const missAction = (side: Side, points: number, p?: Who, zone?: ShotZone): ScoreAction => ({
  type: 'MISS', side, payload: { points, ...pidOf(p), ...(zone ? { zone } : {}) }, attribution: creditOf(p, missCredits(points)),
});

/** One free-throw attempt. */
export const freeThrowAction = (side: Side, made: boolean, p?: Who): ScoreAction => ({
  type: 'FREE_THROW', side, payload: { made, ...pidOf(p) }, attribution: creditOf(p, ftCredits(made)),
});

/** A rebound (offensive / defensive when the scorer picked it). */
export const reboundAction = (side: Side, p: Who, rt?: ReboundType): ScoreAction => ({
  type: 'REBOUND', side, payload: { ...(rt ? { reboundType: rt } : {}), ...pidOf(p) }, attribution: creditOf(p, reboundCredits(rt)),
});

/** An assist / steal / block / turnover. */
export const statAction = (side: Side, type: StatPlay, p: Who): ScoreAction => ({
  type, side, payload: { ...pidOf(p) }, ...(p ? { attribution: { playerId: p.id, stat: STAT_OF[type] } } : {}),
});

/** A foul with its type. Deep wave — "Fouls drawn": `fdt` (tracked) and who
 *  was fouled (`drawnBy`, by id). */
export const foulAction = (side: Side, p: Who, foulType: FoulType = 'personal', o: { fdt?: boolean; drawnBy?: Who } = {}): ScoreAction => ({
  type: 'FOUL', side,
  payload: { foulType, ...pidOf(p), ...(o.fdt ? { fdt: true } : {}), ...(o.drawnBy ? { drawnPid: o.drawnBy.id } : {}) },
  ...(p ? { attribution: { playerId: p.id, stat: 'fouls' } } : {}),
});

/** An ejection (SD-117 B12: `reason` when the foul rules forced it). */
export const ejectAction = (side: Side, p: { id: string }, reason?: DqReason): ScoreAction => ({
  type: 'EJECT', side, payload: { pid: p.id, ...(reason ? { reason } : {}) }, attribution: { playerId: p.id, stat: 'ejections' },
});

/** A team time-out. */
export const timeoutAction = (side: Side): ScoreAction => ({ type: 'TIMEOUT', side });

/** A substitution: `off` leaves the court, `on` comes on (by id). */
export const subAction = (side: Side, off: { id: string }, on: { id: string }): ScoreAction =>
  ({ type: 'SUB', side, payload: { offId: off.id, onId: on.id } });

/** The players a side starts with on court (or an edited five), by id. */
export const lineupAction = (side: Side, players: { id: string }[]): ScoreAction =>
  ({ type: 'SET_LINEUP', side, payload: { pids: players.map((p) => p.id) } });

/** The timeline's Remove: take one play out and reverse exactly what it
 *  credited (credits.ts), on the player's id. `pid` = the play's player id
 *  (names.playId — the caller may resolve an older log's name-only play
 *  through its squads). */
export const removeAction = (e: BBEvent, pid: string | undefined, o: { halfCourt: boolean; tracked: boolean }): ScoreAction => ({
  type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id },
  attribution: pid ? creditOf({ id: pid }, eventCredits(e, o.halfCourt, o.tracked), -1) : undefined,
});
