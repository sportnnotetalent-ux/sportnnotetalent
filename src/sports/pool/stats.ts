/**
 * Pool — per-side match stats derived from the engine state (POOL_DESIGN §5).
 * PURE and read-only; tolerates a missing, older or corrupted snapshot: every
 * counter is read as a whole number ≥ 0 (else 0) and only known foul kinds are
 * kept (breaks #25).
 *
 * Detail-only figures (innings, fouls, safeties, balls pocketed…) cover the
 * racks scored shot by shot: `detailRacks` says how many, so a rate over zero
 * detailed racks is `undefined` ("not tracked"), never 0.
 */
import { cnt, emptyTally, FOUL_KINDS, type PoolState, type Tally } from './engine.ts';
import { own, type Side } from './balls.ts';

export interface PoolSideStats extends Tally {
  setsWon: number;
  /** innings per rack, over the racks scored in detail (2 dp) */
  inningsPerRack?: number;
  /** racks won on own break, % of racks broken */
  breakWinPct?: number;
  /** break-and-runs, % of racks broken */
  bnrPct?: number;
  /** balls pocketed on the break, per break (2 dp) */
  breakPotsPerBreak?: number;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A clean tally from a stored one: known counters, known foul kinds. */
function cleanTally(v: unknown): Tally {
  const t = emptyTally();
  for (const k of Object.keys(t) as (keyof Tally)[]) {
    if (k !== 'foulsBy') (t[k] as number) = cnt(own(v, k));
  }
  const by = own(v, 'foulsBy');
  for (const kind of FOUL_KINDS) {
    const n = cnt(own(by, kind));
    if (n) t.foulsBy[kind] = n;
  }
  return t;
}

function sideStats(s: PoolState, side: Side): PoolSideStats {
  const t = cleanTally(own(own(s, 'tally'), side));
  const out: PoolSideStats = { ...t, setsWon: cnt(own(own(s, 'setsWon'), side)) };
  if (t.detailRacks > 0) out.inningsPerRack = round(t.innings / t.detailRacks, 2);
  if (t.racksBroken > 0) {
    out.breakWinPct = Math.round((t.racksWonOnBreak / t.racksBroken) * 100);
    out.bnrPct = Math.round((t.bnr / t.racksBroken) * 100);
  }
  if (t.breaks > 0) out.breakPotsPerBreak = round(t.breakPots / t.breaks, 2);
  return out;
}

/** Both sides' stats for one match. */
export function poolStats(s: PoolState): { home: PoolSideStats; away: PoolSideStats } {
  return { home: sideStats(s, 'home'), away: sideStats(s, 'away') };
}
