/**
 * English billiards' absolute `statTotals` (SD-19 contract,
 * src/sports/types.ts). PURE, derived only from the replayed state + ctx.
 *
 * As snooker (../snooker/totals.ts): nothing is credited live, every key is
 * "derived", and a side's figures go to its one player (the first of
 * `ctx.players[side]`); no ctx = {}.
 *
 * Keys (src/sports/billiards/stats.ts):
 *  - record ('present'): framesWon, framesLost (a timed draw is neither),
 *    points (frames as recorded: a points game's winner at the target),
 *    pointsAgainst;
 *  - shot by shot ('keyed'): shotFrames, highestBreak, fiftyPlus, centuries,
 *    doubleCenturies, scored (every point of every break: the billiards
 *    average is scored ÷ visits), visits, scoringStrokes, potRed, potWhite,
 *    inOffRed, inOffWhite, cannons, misses (visits ended by a missed attempt),
 *    safeties, fouls, foulPoints (given away), penaltyPoints (received).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { billiardsStats, FOUL_KINDS, type BilliardsState, type FoulKind, type Side } from './engine.ts';

/** Cue batch 6 — each foul kind's career key ('keyed', 0 on a shot-by-shot
 *  line, absent on a quick or older one). "Missed every ball" shares
 *  snooker's key; push, jump, touching, off the table and other share theirs. */
export const BILLIARDS_FOUL_KEY: Readonly<Record<FoulKind, string>> = {
  miss: 'foulNoContact', coup: 'foulCoup', inHand: 'foulInHand', push: 'foulPush', jump: 'foulJump', touch: 'foulTouch',
  offTable: 'foulOffTable', hazards: 'foulHazards', cannons: 'foulCannons', baulkLine: 'foulBaulkLine', other: 'foulOther',
};

export const BILLIARDS_RECORD_KEYS = ['framesWon', 'framesLost', 'points', 'pointsAgainst'] as const;
export const BILLIARDS_SHOT_KEYS = [
  'shotFrames', 'highestBreak', 'fiftyPlus', 'centuries', 'doubleCenturies', 'scored', 'visits', 'scoringStrokes',
  'potRed', 'potWhite', 'inOffRed', 'inOffWhite', 'cannons', 'misses', 'safeties', 'fouls', 'foulPoints', 'penaltyPoints',
  // cue batch 6 — foul kinds
  'foulNoContact', 'foulCoup', 'foulInHand', 'foulPush', 'foulJump', 'foulTouch', 'foulOffTable', 'foulHazards', 'foulCannons', 'foulBaulkLine', 'foulOther',
] as const;

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** One side's figures for the match (the engine's stats, never throws). */
export function billiardsSideRecord(s: BilliardsState, side: Side): Record<string, number> {
  const st = billiardsStats(s);
  const t = st[side];
  const o = st[other(side)];
  const rec: Record<string, number> = { framesWon: n(t.framesWon), framesLost: n(o.framesWon), points: n(t.points), pointsAgainst: n(o.points) };
  if (n(t.detailedFrames) > 0) {
    Object.assign(rec, {
      shotFrames: n(t.detailedFrames), highestBreak: n(t.highestBreak), fiftyPlus: n(t.fiftyPlus), centuries: n(t.centuries), doubleCenturies: n(t.doubleCenturies),
      scored: n(t.scored), visits: n(t.visits), scoringStrokes: n(t.shots), potRed: n(t.potRed), potWhite: n(t.potWhite), inOffRed: n(t.inOffRed),
      inOffWhite: n(t.inOffWhite), cannons: n(t.cannons), misses: n(t.misses), safeties: n(t.safeties), fouls: n(t.fouls),
      foulPoints: n(t.penaltyConceded), penaltyPoints: n(t.penaltyReceived),
    });
    for (const k of FOUL_KINDS) rec[BILLIARDS_FOUL_KEY[k]] = n(t.foulsByKind?.[k]);
  }
  return rec;
}

/** The plugin's `statTotals`: each side's player gets the side's figures. */
export function billiardsStatTotals(s: BilliardsState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  for (const side of ['home', 'away'] as const) {
    const id = ctx?.players?.[side]?.[0]?.id;
    // a crafted ctx id can't reach the prototype; one player is credited once
    if (typeof id !== 'string' || !id || id === '__proto__' || Object.prototype.hasOwnProperty.call(out, id)) continue;
    out[id] = { side, stats: billiardsSideRecord(s, side) };
  }
  return out;
}
