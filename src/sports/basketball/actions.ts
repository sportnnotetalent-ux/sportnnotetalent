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
import { creditAttribution, eventCredits, foulCredits, ftCredits, makeCredits, missCredits, reboundCredits, type Credits } from './credits.ts';
import type { BBEvent, BenchTech, DqReason, FoulType, ReboundType, ShotZone, TurnoverType } from './events.ts';

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

/** SD-31: a missed field goal (2 or 3; 3×3: 1 or 2). US batch 5: `ref` =
 *  the paired block this shot was (the "Whose shot?" prompt). */
export const missAction = (side: Side, points: number, p?: Who, zone?: ShotZone, ref?: number): ScoreAction => ({
  type: 'MISS', side, payload: { points, ...pidOf(p), ...(zone ? { zone } : {}), ...(ref != null ? { ref } : {}) }, attribution: creditOf(p, missCredits(points)),
});

/** One free-throw attempt. */
export const freeThrowAction = (side: Side, made: boolean, p?: Who): ScoreAction => ({
  type: 'FREE_THROW', side, payload: { made, ...pidOf(p) }, attribution: creditOf(p, ftCredits(made)),
});

/** A rebound (offensive / defensive when the scorer picked it). */
export const reboundAction = (side: Side, p: Who, rt?: ReboundType): ScoreAction => ({
  type: 'REBOUND', side, payload: { ...(rt ? { reboundType: rt } : {}), ...pidOf(p) }, attribution: creditOf(p, reboundCredits(rt)),
});

/** US batch 5: a TEAM rebound (FIBA: out of bounds after a miss, a
 *  dead-ball missed free throw) — no player, nobody credited. */
export const teamReboundAction = (side: Side, rt?: ReboundType): ScoreAction => ({
  type: 'REBOUND', side, payload: { team: true, ...(rt ? { reboundType: rt } : {}) },
});

/** US batch 5: a turnover — a player's, or the TEAM's (`p` null: a
 *  shot-clock / 8 s / 5 s violation); `toType` = its kind (optional);
 *  `ref` = the paired steal it was (the "Who lost it?" prompt). */
export const turnoverAction = (side: Side, p: Who, o: { toType?: TurnoverType; ref?: number } = {}): ScoreAction => ({
  type: 'TURNOVER', side,
  payload: { ...(p ? { pid: p.id } : { team: true }), ...(o.toType ? { toType: o.toType } : {}), ...(o.ref != null ? { ref: o.ref } : {}) },
  ...(p ? { attribution: { playerId: p.id, stat: 'turnovers' } } : {}),
});

/** US batch 5: a steal / block that pairs the other side's turnover / missed
 *  shot (`pair`; an edit of an older one passes false and stays as it was). */
export const stealAction = (side: Side, p: Who, pair = true): ScoreAction => {
  const a = statAction(side, 'STEAL', p);
  return pair ? { ...a, payload: { ...a.payload, pair: true } } : a;
};
export const blockAction = (side: Side, p: Who, pair = true): ScoreAction => {
  const a = statAction(side, 'BLOCK', p);
  return pair ? { ...a, payload: { ...a.payload, pair: true } } : a;
};

/** An assist / steal / block / turnover. */
/** MVP B6: an assist from the "Assist?" prompt carries its basket's id
 *  (`ref`); the engine drops it if that basket is gone (Undo). */
export const statAction = (side: Side, type: StatPlay, p: Who, ref?: number): ScoreAction => ({
  type, side, payload: { ...pidOf(p), ...(ref != null ? { ref } : {}) }, ...(p ? { attribution: { playerId: p.id, stat: STAT_OF[type] } } : {}),
});

/** A foul with its type. Deep wave — "Fouls drawn": `fdt` (tracked) and who
 *  was fouled (`drawnBy`, by id). US batch 1: an offensive foul is stamped
 *  `tov` — it is the fouler's turnover too. */
export const foulAction = (side: Side, p: Who, foulType: FoulType = 'personal', o: { fdt?: boolean; drawnBy?: Who; bench?: BenchTech; cat2?: boolean } = {}): ScoreAction => {
  const tov = foulType === 'offensive';
  // US batch 6: a coach (C) / bench (B) technical — no player, technical only
  const bench = o.bench && !p && foulType === 'technical' ? { bench: o.bench } : {};
  return {
    type: 'FOUL', side,
    payload: { foulType, ...pidOf(p), ...(o.fdt ? { fdt: true } : {}), ...(o.drawnBy ? { drawnPid: o.drawnBy.id } : {}), ...(tov ? { tov: true } : {}), ...bench, ...(o.cat2 && foulType === 'technical' ? { techCat: 2 } : {}) },
    ...(p ? { attribution: tov ? creditOf(p, foulCredits(true)) : { playerId: p.id, stat: 'fouls' } } : {}),
  };
};

/** An ejection (SD-117 B12: `reason` when the foul rules forced it). */
export const ejectAction = (side: Side, p: { id: string }, reason?: DqReason): ScoreAction => ({
  type: 'EJECT', side, payload: { pid: p.id, ...(reason ? { reason } : {}) }, attribution: { playerId: p.id, stat: 'ejections' },
});

/** US batch 6: a jump ball — the opening tip (`side` = who wins it), or a
 *  held ball (`held`; under the possession arrow the arrow decides the side). */
export const jumpBallAction = (side: Side, held = false): ScoreAction =>
  ({ type: 'JUMP_BALL', side, payload: held ? { held: true } : {} });

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
