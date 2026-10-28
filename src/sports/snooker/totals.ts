/**
 * Snooker's absolute `statTotals` (SD-19 contract, src/sports/types.ts). PURE
 * (no React Native), derived only from the replayed state + ctx, so an old
 * log replays to the same totals.
 *
 * Nothing is credited live: the controls send no attribution, so every key
 * here is "derived" (owned by the totals, never a live increment) and the
 * completion / correction sync sets the whole line. The state is per side
 * (IDs-only: it holds no player), so a side's figures go to its one player —
 * the first of `ctx.players[side]` (the matchday starter; an individual sport
 * has one). No ctx = nobody to credit = {}.
 *
 * Keys (src/sports/snooker/stats.ts):
 *  - record ('present', every line): framesWon, framesLost, points (frame
 *    points over every frame, quick ones too), pointsAgainst;
 *  - shot by shot ('keyed', only when the match had a frame scored shot by
 *    shot — a quick-only match reads "not tracked", never 0): shotFrames,
 *    highestBreak, fiftyPlus, centuries, maximums (147 / 107 / 75 without a
 *    free ball), potted (points from pots), pots (potting strokes),
 *    missedPots, safeties, visits, fouls, foulPoints (penalty points given
 *    away), penaltyPoints (points from the opponent's fouls), foulMisses
 *    (fouls and a miss called), freeBalls (free balls received).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { snookerStats, type Side, type SnookerState } from './engine.ts';

export const SNOOKER_RECORD_KEYS = ['framesWon', 'framesLost', 'points', 'pointsAgainst'] as const;
export const SNOOKER_SHOT_KEYS = [
  'shotFrames', 'highestBreak', 'fiftyPlus', 'centuries', 'maximums', 'potted', 'pots', 'missedPots', 'safeties', 'visits',
  'fouls', 'foulPoints', 'penaltyPoints', 'foulMisses', 'freeBalls',
] as const;

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** One side's figures for the match (the engine's stats, never throws). */
export function snookerSideRecord(s: SnookerState, side: Side): Record<string, number> {
  const st = snookerStats(s);
  const t = st[side];
  const o = st[other(side)];
  const rec: Record<string, number> = { framesWon: n(t.framesWon), framesLost: n(o.framesWon), points: n(t.points), pointsAgainst: n(o.points) };
  if (n(t.detailedFrames) > 0) {
    Object.assign(rec, {
      shotFrames: n(t.detailedFrames), highestBreak: n(t.highestBreak), fiftyPlus: n(t.fiftyPlus), centuries: n(t.centuries), maximums: n(t.maximums),
      potted: n(t.potted), pots: n(t.potStrokes), missedPots: n(t.missedPots), safeties: n(t.safeties), visits: n(t.visits),
      fouls: n(t.fouls), foulPoints: n(t.penaltyConceded), penaltyPoints: n(t.penaltyReceived), foulMisses: n(t.missesCalled), freeBalls: n(t.freeBalls),
    });
  }
  return rec;
}

/** The plugin's `statTotals`: each side's player gets the side's figures. */
export function snookerStatTotals(s: SnookerState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  for (const side of ['home', 'away'] as const) {
    const id = ctx?.players?.[side]?.[0]?.id;
    // a crafted ctx id can't reach the prototype; one player is credited once
    if (typeof id !== 'string' || !id || id === '__proto__' || Object.prototype.hasOwnProperty.call(out, id)) continue;
    out[id] = { side, stats: snookerSideRecord(s, side) };
  }
  return out;
}
