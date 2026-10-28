/**
 * Pool — `statTotals` (the contract on `SportPlugin.statTotals`,
 * src/sports/types.ts). PURE, DERIVED ONLY: the controls credit nothing live
 * (no `attribution`), so every key here is a derived key — the completion /
 * correction sync SETS it from the replayed state, and an undo, a retried
 * upload or two scorers can never leave a line half-counted.
 *
 * Per player of a side (`ctx.players`, plus the ids the log carried):
 *   - the side's RECORD (both scotch-doubles partners alike): racksWon /
 *     racksLost, racksBroken / racksWonOnBreak, breakAndRuns, runOuts;
 *     game-specific: goldenBreaks (9-ball), eightLosses (8-ball),
 *     threeFoulLosses (where the three-foul rule is on); setsWon / setsLost
 *     (a sets match); detailRacks / innings (once a rack was scored shot by
 *     shot — innings are the side's visits);
 *   - WHO SHOT (only once a rack was scored shot by shot): shotsPlayed,
 *     potShots, missShots, safetyShots, ballsPotted, fouls (+ scratch /
 *     wrong ball / no rail / off the table / other), breakShots, breakBalls,
 *     dryBreaks, breakFouls, illegalBreaks; eightBreaks (8-ball), pushOuts
 *     (9-/10-ball). Singles: the side's player — the one the log credited,
 *     else the side's only player. Scotch doubles: each partner's own, from
 *     the player id every shot carried. If a side's shots can't all be
 *     placed (a shot with no id, an id outside the side's players), that
 *     side's shot keys are left out — "not tracked", never a guessed split.
 * A doubles line also gets `partnerId` (derived; not stored).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { cnt } from './engine.ts';
import { isSide, own, type Side } from './balls.ts';
import { creditOf, perSideOf, SHOT_KEYS, sideCounts, validPid, type Counts, type PoolMatch } from './match.ts';

const SIDES: Side[] = ['home', 'away'];

/** The record keys every line gets. */
export const POOL_RECORD_KEYS = ['racksWon', 'racksLost', 'racksBroken', 'racksWonOnBreak', 'breakAndRuns', 'runOuts'] as const;
/** The shot keys (who shot) — the full list; a game writes its own subset. */
export const POOL_SHOT_KEYS = SHOT_KEYS;
/** Every key the totals may write (for the schema check). */
export const POOL_TOTAL_KEYS: readonly string[] = [
  ...POOL_RECORD_KEYS, 'goldenBreaks', 'eightLosses', 'threeFoulLosses', 'setsWon', 'setsLost', 'detailRacks', 'innings', ...SHOT_KEYS,
];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
type Game = 'eight' | 'nine' | 'ten' | null;
const gameOf = (s: unknown): Game => {
  const g = isObj(s) ? s.game : null;
  return g === 'eight' || g === 'nine' || g === 'ten' ? g : null;
};

/** The shot keys a game writes (all of them, 0 when none). */
export function shotKeysFor(game: Game): string[] {
  return SHOT_KEYS.filter((k) => (k === 'eightBreaks' ? game === 'eight' : k === 'pushOuts' ? game !== 'eight' : true));
}

/** A completed rack, read defensively. */
interface Rec { winner: Side; breaker: Side | null; set: number; bnr: boolean; golden: boolean; runOut: boolean; how: string; mode: string; innings: { home: number; away: number } | null }
function racksOf(s: unknown): Rec[] {
  const list = isObj(s) && Array.isArray(s.racks) ? s.racks : [];
  const out: Rec[] = [];
  for (const r of list) {
    if (!isObj(r) || !isSide(r.winner)) continue;
    const inn = isObj(r.innings) ? { home: cnt(r.innings.home), away: cnt(r.innings.away) } : null;
    out.push({
      winner: r.winner, breaker: isSide(r.breaker) ? r.breaker : null, set: cnt(r.set) || 1,
      bnr: r.bnr === true, golden: r.golden === true, runOut: r.runOut === true,
      how: typeof r.how === 'string' ? r.how : '', mode: r.mode === 'detail' ? 'detail' : 'quick', innings: inn,
    });
  }
  return out;
}

/** One side's record for the match (keys per the game and format). */
export function poolSideRecord(s: PoolMatch, side: Side): Counts {
  const racks = racksOf(s);
  const opp: Side = side === 'home' ? 'away' : 'home';
  const game = gameOf(s);
  const mine = racks.filter((r) => r.winner === side);
  const out: Counts = {
    racksWon: mine.length,
    racksLost: racks.length - mine.length,
    racksBroken: racks.filter((r) => r.breaker === side).length,
    racksWonOnBreak: mine.filter((r) => r.breaker === side).length,
    breakAndRuns: mine.filter((r) => r.bnr).length,
    runOuts: mine.filter((r) => r.runOut).length,
  };
  if (game === 'nine') out.goldenBreaks = mine.filter((r) => r.golden).length;
  if (game === 'eight') out.eightLosses = racks.filter((r) => r.winner === opp && r.how.startsWith('eight')).length;
  if (isObj(s) && s.threeFoul === true) out.threeFoulLosses = racks.filter((r) => r.winner === opp && r.how === 'threeFoul').length;
  if (isObj(s) && cnt(s.setsToWin) > 1) {
    out.setsWon = cnt(own(s.setsWon, side));
    out.setsLost = cnt(own(s.setsWon, opp));
  }
  return out;
}

/** Was any rack scored shot by shot (or any shot recorded)? */
function hasDetail(s: PoolMatch): boolean {
  if (racksOf(s).some((r) => r.mode === 'detail')) return true;
  return SIDES.some((sd) => Object.keys(sideCounts(s, sd)).length > 0);
}

/** The side's innings and detailed racks (completed racks scored in detail). */
function detailRecord(s: PoolMatch, side: Side): Counts {
  const det = racksOf(s).filter((r) => r.mode === 'detail');
  return { detailRacks: det.length, innings: det.reduce((t, r) => t + (r.innings?.[side] ?? 0), 0) };
}

const fill = (keys: string[], c: Counts): Counts => Object.fromEntries(keys.map((k) => [k, cnt(c[k])]));

/** The plugin's `statTotals`. */
export function poolStatTotals(s: PoolMatch, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!isObj(s) || !Array.isArray(s.racks)) return out;
  const cr = creditOf(s);
  const doubles = perSideOf(s) === 2;
  const game = gameOf(s);
  const keys = shotKeysFor(game);
  const detail = hasDetail(s);
  // the players of each side: ctx first (the matchday pair / the entry), then the ids the log credited
  const ids: Record<Side, string[]> = { home: [], away: [] };
  const seen = new Set<string>();
  for (const side of SIDES) {
    for (const p of ctx?.players?.[side] ?? []) {
      const id = validPid(p?.id);
      if (id && !seen.has(id)) { seen.add(id); ids[side].push(id); }
    }
  }
  const fromCtx: Record<Side, Set<string>> = { home: new Set(ids.home), away: new Set(ids.away) };
  for (const side of SIDES) for (const id of cr.ids[side]) if (!seen.has(id)) { seen.add(id); ids[side].push(id); }
  const known = (side: Side, id: string) => (ctx?.players ? fromCtx[side].has(id) : ids[side].includes(id));

  for (const side of SIDES) {
    const list = ids[side];
    if (!list.length) continue;
    const base: Counts = { ...poolSideRecord(s, side), ...(detail ? detailRecord(s, side) : {}) };
    // who shot
    const shots = new Map<string, Counts>();
    if (detail) {
      if (doubles) {
        const placed = cr.unk[side] === 0 && cr.by.filter((b) => b.side === side).every((b) => known(side, b.id));
        if (placed) for (const id of list) shots.set(id, fill(keys, cr.by.find((b) => b.id === id && b.side === side)?.c ?? {}));
      } else {
        const credited = cr.ids[side].filter((id) => known(side, id));
        const shooter = cr.ids[side].length === 1 && credited.length === 1 ? credited[0] : cr.ids[side].length === 0 && list.length === 1 ? list[0] : null;
        if (shooter) shots.set(shooter, fill(keys, sideCounts(s, side)));
      }
    }
    for (const id of list) {
      const partner = doubles && list.length === 2 ? list.find((x) => x !== id) : undefined;
      out[id] = { side, stats: { ...base, ...(shots.get(id) ?? {}) }, ...(partner ? { partnerId: partner } : {}) };
    }
  }
  return out;
}
