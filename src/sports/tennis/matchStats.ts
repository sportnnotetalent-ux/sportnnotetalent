/**
 * SD-157 — tennis match stats at ATP / Infosys "Match Stats" depth. PURE (no
 * React Native): the panel (StatsPanel.tsx), statTotals (racketTotals.ts) and
 * tests import it.
 *
 * Everything is DERIVED from the point log: `serveStats` replays it through
 * the tennis reducer (who served every point, holds, breaks, break points,
 * 1st / 2nd serve) and its `trace` lines each rally up with its point input
 * (detail, net, rally length, speed). A corrected log (EDIT_LOG) or an old
 * log gives the right figures; nothing is stored.
 *
 * Panels (rows only for what the match tracked — never a false 0):
 *   KEY STATS      Service · Winners & errors · Points won · Games
 *   SERVE & RETURN Total | 1st serve | 2nd serve (the last two need 1st / 2nd
 *                  serve tracking)
 *   RALLY          FH / BH winners, unforced and forced errors by shot type,
 *                  plus the stroke summary (point detail)
 *   RALLY LENGTH   points won by rally length (rally length tracking)
 *
 * Definitions:
 *   - Return points in play: the opponent's serves that landed in (double
 *     faults are left out — no serve came in, so there was nothing to
 *     return) where the return came back into play, i.e. the point did NOT
 *     end with an ace, a service winner or a return error (an unforced /
 *     forced error with shot "Return" by the receiver). Counted over the
 *     points whose ending is known (point detail described it, or the Ace
 *     button): "in play / known".
 *   - Net points: a side came to the net on the point (the scorer marks
 *     Home / Away / both; a legacy "At net" mark = the point winner). Played =
 *     points it came in; won = those it won.
 *   - Serve speed: the km/h of the serve that started the point (the 1st
 *     serve if it went in, else the 2nd). 1st / 2nd averages need 1st / 2nd
 *     serve tracking; without it a single "Serve average". Round 2: shown in
 *     the match's unit (km/h or mph, `speedUnit`); the log and the career
 *     keys stay km/h.
 *   - Rally length (round 2): the match's buckets (its scheme, plus any other
 *     bucket a point carries — `matchRallyBuckets`); an old match reads the
 *     ATP 0–4 / 5–8 / 9+ as before.
 *   - Winners / errors keep SD-107's meaning (aces and service winners are
 *     their own rows). Return winners / return unforced errors = shot "Return".
 */
import { pointInputs, type PointInput } from '../rallyEdit.ts';
import { serveStats, type ServeBlock, type ServeRosters, type ServeRow, type ServeStats, type SideServe } from '../serveStats.ts';
import {
  RALLY_LABEL, SHOTS, SHOT_LABEL, allRallyBuckets, detailTracked, matchRallyBuckets, netSides, netTracked, rallyBucketsOf, rallyKey, rallyTracked,
  FAULT_KINDS, errTypeOf, speedText, speedTracked, speedUnitOf, strokeOf,
  type FaultKind, type RallyBucket, type Shot, type SpeedUnit, type Wing,
} from '../pointDetail.ts';
import type { TennisState } from './engine.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The whole match, or one set (1-based). */
export type Scope = 'all' | number;
/** Serve & return: every point, or only those on the 1st / 2nd serve. */
export type ServeFilter = 'all' | 1 | 2;

/** One replayed point: who served (side + named player), who won, the set,
 *  tiebreak, and the point's input (detail, serve, net, rally length, speed). */
export interface TPoint { i: number; p: PointInput; server: Side; serverId?: string; winner: Side; period: number; tb: boolean }

/** What this match tracked (D8: a panel / row shows only for these). */
export interface TennisCoverage { detail: boolean; serve: boolean; net: boolean; rally: boolean; speed: boolean }

export interface TennisView {
  st: ServeStats; points: TPoint[]; cov: TennisCoverage;
  /** round 2 — the rally-length buckets this match reads with */
  buckets: RallyBucket[];
  /** round 2 — the unit serve speeds show in */
  unit: SpeedUnit;
}

/** Replay `state` once; null when it isn't a tennis match state. */
export function tennisView(state: unknown, rosters: ServeRosters = {}): TennisView | null {
  const s = state as TennisState | null;
  const st = serveStats('tennis', s, rosters);
  if (!st || !s) return null;
  const inputs = pointInputs(s.events ?? []);
  const points: TPoint[] = st.trace.map((t) => ({ ...t, p: inputs[t.i] })).filter((t) => !!t.p);
  return {
    st, points,
    cov: { detail: detailTracked(s), serve: st.serveTracked, net: netTracked(s), rally: rallyTracked(s), speed: speedTracked(s) },
    buckets: matchRallyBuckets('tennis', s), unit: speedUnitOf(s),
  };
}

// ---------------------------------------------------------------- tally --

/** The rally panel's categories (ATP order). */
export type RallyCat = 'fhW' | 'bhW' | 'fhUe' | 'bhUe' | 'fhFe' | 'bhFe';
export const RALLY_CATS: ReadonlyArray<{ id: RallyCat; label: string; short: string; how: 'winner' | 'ue' | 'fe'; wing: Wing }> = [
  { id: 'fhW', label: 'FH winners', short: 'FH W', how: 'winner', wing: 'fh' },
  { id: 'bhW', label: 'BH winners', short: 'BH W', how: 'winner', wing: 'bh' },
  { id: 'fhUe', label: 'FH unforced errors', short: 'FH UE', how: 'ue', wing: 'fh' },
  { id: 'bhUe', label: 'BH unforced errors', short: 'BH UE', how: 'ue', wing: 'bh' },
  { id: 'fhFe', label: 'FH forced errors', short: 'FH FE', how: 'fe', wing: 'fh' },
  { id: 'bhFe', label: 'BH forced errors', short: 'BH FE', how: 'fe', wing: 'bh' },
];
const catOf = (how: string, wing: Wing): RallyCat | undefined => RALLY_CATS.find((c) => c.how === how && c.wing === wing)?.id;

interface ReturnTally { known: number; inPlay: number }
export interface TennisSide {
  winners: number; returnWinners: number; ue: number; returnUe: number; fe: number; sw: number;
  /** per category: by shot, and `all` (incl. points with a wing but no shot) */
  cats: Record<RallyCat, Record<Shot | 'all', number>>;
  netPlayed: number; netWon: number;
  /** km/h of this side's serves (all; on the 1st / 2nd serve when tracked) */
  speed: { all: number[]; s1: number[]; s2: number[] };
  /** aces (by the point winner, as serveStats) — all / on the 1st / 2nd serve */
  aces: { all: number; s1: number; s2: number };
  /** as the RECEIVER: points with a known ending (double faults left out) and returns in play */
  ret: { all: ReturnTally; s1: ReturnTally; s2: ReturnTally };
  /** tennis-endings-depth — errors by direction (net / long / wide), points
   *  lost by rule, and this side's serve faults by type (1st serves and
   *  double faults) */
  ueDir: Record<'net' | 'long' | 'wide', number>; feDir: Record<'net' | 'long' | 'wide', number>;
  rule: number;
  faults: Record<FaultKind, number>;
}
export interface TennisTally {
  home: TennisSide; away: TennisSide;
  /** points carrying point detail */
  described: number;
  /** points with a rally length: per bucket (the match's), points played and won per side */
  rally: Record<string, { total: number; home: number; away: number }>;
}

const zeroCats = () => Object.fromEntries(RALLY_CATS.map((c) => [c.id, Object.fromEntries([...SHOTS, 'all'].map((k) => [k, 0]))])) as TennisSide['cats'];
const zeroSide = (): TennisSide => ({
  winners: 0, returnWinners: 0, ue: 0, returnUe: 0, fe: 0, sw: 0, cats: zeroCats(), netPlayed: 0, netWon: 0,
  speed: { all: [], s1: [], s2: [] }, aces: { all: 0, s1: 0, s2: 0 },
  ret: { all: { known: 0, inPlay: 0 }, s1: { known: 0, inPlay: 0 }, s2: { known: 0, inPlay: 0 } },
  ueDir: { net: 0, long: 0, wide: 0 }, feDir: { net: 0, long: 0, wide: 0 }, rule: 0,
  faults: { net: 0, long: 0, wide: 0, foot: 0 },
});
type Dir = 'net' | 'long' | 'wide';
const isDir = (v: unknown): v is Dir => v === 'net' || v === 'long' || v === 'wide';

/** Per-side detail figures over the match or one set. */
export function tennisTally(v: TennisView, scope: Scope = 'all'): TennisTally {
  const out: TennisTally = {
    home: zeroSide(), away: zeroSide(), described: 0,
    rally: Object.fromEntries((v.buckets ?? rallyBucketsOf('tennis')).map((b) => [b, { total: 0, home: 0, away: 0 }])),
  };
  for (const t of v.points) {
    if (scope !== 'all' && t.period !== scope) continue;
    const { p, server: S, winner: W } = t;
    const R = opp(S), L = opp(W);
    const sv = p.serve === 1 ? 's1' : p.serve === 2 ? 's2' : null;
    if (p.kind === 'ace') { out[W].aces.all += 1; if (sv) out[W].aces[sv] += 1; }
    const pd = p.pd;
    const stroke = strokeOf(pd);
    if (pd) {
      out.described += 1;
      const cat = (side: Side) => {
        const c = stroke.wing ? catOf(pd.how, stroke.wing) : undefined;
        if (!c) return;
        out[side].cats[c].all += 1;
        if (stroke.shot) out[side].cats[c][stroke.shot] += 1;
      };
      if (pd.how === 'winner') { out[W].winners += 1; if (stroke.shot === 'return') out[W].returnWinners += 1; cat(W); }
      else if (pd.how === 'ue') { out[L].ue += 1; if (stroke.shot === 'return') out[L].returnUe += 1; cat(L); }
      else if (pd.how === 'fe') { out[L].fe += 1; cat(L); }
      else if (pd.how === 'sw') out[W].sw += 1;
      else if (pd.how === 'rule') out[L].rule += 1;
      const dir = errTypeOf('tennis', pd);
      if (isDir(dir)) (pd.how === 'ue' ? out[L].ueDir : out[L].feDir)[dir] += 1;
    }
    if (p.sf1) out[S].faults[p.sf1] += 1;
    if (p.df && p.sf2) out[S].faults[p.sf2] += 1;
    for (const n of netSides(p, W)) { out[n].netPlayed += 1; if (n === W) out[n].netWon += 1; }
    if (p.rallyLen && out.rally[p.rallyLen]) { const r = out.rally[p.rallyLen]; r.total += 1; r[W] += 1; }
    if (typeof p.kmh === 'number' && !p.df) {
      out[S].speed.all.push(p.kmh);
      if (sv) out[S].speed[sv].push(p.kmh);
    }
    // return in play — over points whose ending is known; no serve came in on a double fault
    if (!p.df && (p.kind === 'ace' || pd)) {
      const onServe = p.kind === 'ace' || pd?.how === 'ace' || pd?.how === 'sw';
      const returnError = !!pd && (pd.how === 'ue' || pd.how === 'fe') && W === S && stroke.shot === 'return';
      const inPlay = !onServe && !returnError;
      for (const k of sv ? (['all', sv] as const) : (['all'] as const)) {
        out[R].ret[k].known += 1;
        if (inPlay) out[R].ret[k].inPlay += 1;
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------- rows --

const frac = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : '–');
const pctOf = (n: number, d: number) => (d ? (100 * n) / d : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);

/** The serve block of a scope (null = a set with no point yet). */
export function blockOf(v: TennisView, scope: Scope): ServeBlock | null {
  return scope === 'all' ? v.st.match : v.st.periods[scope - 1] ?? null;
}

export interface StatSection { id: 'service' | 'shots' | 'points' | 'games'; title: string; rows: ServeRow[] }

type RowAdd = {
  ratio: (key: string, label: string, n: (x: SideServe, side: Side) => number, d: (x: SideServe, side: Side) => number) => void;
  count: (key: string, label: string, hv: number, av: number) => void;
};
function rowsOf(b: ServeBlock, rows: ServeRow[]): RowAdd {
  return {
    ratio: (key, label, n, d) => {
      const nh = n(b.home, 'home'), dh = d(b.home, 'home'), na = n(b.away, 'away'), da = d(b.away, 'away');
      rows.push({ key, label, home: frac(nh, dh), away: frac(na, da), hv: pctOf(nh, dh), av: pctOf(na, da) });
    },
    count: (key, label, hv, av) => rows.push({ key, label, home: String(hv), away: String(av), hv, av }),
  };
}

/** KEY STATS — Service · Winners & errors · Points won · Games. */
export function keyStats(v: TennisView, scope: Scope = 'all'): StatSection[] {
  const b = blockOf(v, scope);
  if (!b || !b.rallies) return [];
  const t = tennisTally(v, scope);
  const { st, cov } = v;
  const out: StatSection[] = [];

  const service: ServeRow[] = [];
  const s = rowsOf(b, service);
  s.count('aces', 'Aces', b.home.aces, b.away.aces);
  s.count('dfs', 'Double faults', b.home.dfs, b.away.dfs);
  if (cov.serve && b.home.s1Pts + b.away.s1Pts > 0) {
    s.ratio('s1in', '1st serve in', (x) => x.s1In, (x) => x.s1Pts);
    s.ratio('s1won', 'Win 1st serve', (x) => x.s1Won, (x) => x.s1In);
    s.ratio('s2won', 'Win 2nd serve', (x) => x.s2Won, (x) => x.s2Pts);
  }
  if (cov.detail && t.home.sw + t.away.sw > 0) s.count('sw', 'Service winners', t.home.sw, t.away.sw);
  // tennis-endings-depth FT1 — serve faults by type (rows only for types recorded)
  const FAULT_ROW: Record<FaultKind, [string, string]> = { net: ['fNet', 'Serve faults into the net'], long: ['fLong', 'Serve faults long'], wide: ['fWide', 'Serve faults wide'], foot: ['fFoot', 'Foot faults'] };
  for (const k of FAULT_KINDS) if (t.home.faults[k] + t.away.faults[k] > 0) s.count(FAULT_ROW[k][0], FAULT_ROW[k][1], t.home.faults[k], t.away.faults[k]);
  if (cov.speed) {
    const kmh = (key: string, label: string, f: (x: TennisSide) => number | undefined) => {
      const h = f(t.home), a = f(t.away);
      service.push({ key, label, home: speedText(h, v.unit), away: speedText(a, v.unit), hv: h ?? 0, av: a ?? 0 });
    };
    kmh('kmhMax', 'Fastest serve', (x) => max(x.speed.all));
    if (cov.serve) {
      kmh('kmh1', '1st serve average', (x) => avg(x.speed.s1));
      kmh('kmh2', '2nd serve average', (x) => avg(x.speed.s2));
    } else kmh('kmhAvg', 'Serve average', (x) => avg(x.speed.all));
  }
  out.push({ id: 'service', title: 'Service', rows: service });

  if (cov.detail) {
    const shots: ServeRow[] = [];
    const w = rowsOf(b, shots);
    w.count('winners', 'Winners', t.home.winners, t.away.winners);
    w.count('rtnW', 'Return winners', t.home.returnWinners, t.away.returnWinners);
    w.count('ue', 'Unforced errors', t.home.ue, t.away.ue);
    w.count('rtnUe', 'Return unforced errors', t.home.returnUe, t.away.returnUe);
    w.count('fe', 'Forced errors', t.home.fe, t.away.fe);
    // tennis-endings-depth — errors by direction, points lost by rule (rows only once recorded)
    const DIR_WORD: Record<Dir, string> = { net: 'into the net', long: 'long', wide: 'wide' };
    for (const d of ['net', 'long', 'wide'] as const) {
      const cap = d.charAt(0).toUpperCase() + d.slice(1);
      if (t.home.ueDir[d] + t.away.ueDir[d] > 0) w.count(`ue${cap}`, `Unforced errors ${DIR_WORD[d]}`, t.home.ueDir[d], t.away.ueDir[d]);
    }
    for (const d of ['net', 'long', 'wide'] as const) {
      const cap = d.charAt(0).toUpperCase() + d.slice(1);
      if (t.home.feDir[d] + t.away.feDir[d] > 0) w.count(`fe${cap}`, `Forced errors ${DIR_WORD[d]}`, t.home.feDir[d], t.away.feDir[d]);
    }
    if (t.home.rule + t.away.rule > 0) w.count('rule', 'Points lost by rule', t.home.rule, t.away.rule);
    const ratio = (x: TennisSide) => (x.ue ? x.winners / x.ue : x.winners ? Infinity : 0);
    const rt = (x: TennisSide) => (x.ue ? (x.winners / x.ue).toFixed(2) : x.winners ? `${x.winners}–0` : '–');
    const rh = ratio(t.home), ra = ratio(t.away);
    shots.push({ key: 'wue', label: 'Winners / UE', home: rt(t.home), away: rt(t.away), hv: Number.isFinite(rh) ? rh : 99, av: Number.isFinite(ra) ? ra : 99 });
    out.push({ id: 'shots', title: 'Winners & errors', rows: shots });
  }

  const points: ServeRow[] = [];
  const pw = rowsOf(b, points);
  pw.ratio('bpc', 'Break points won', (x) => x.bpWon, (x) => x.bpOpps);
  if (cov.net) {
    points.push({ key: 'net', label: 'Net points won', home: frac(t.home.netWon, t.home.netPlayed), away: frac(t.away.netWon, t.away.netPlayed), hv: pctOf(t.home.netWon, t.home.netPlayed), av: pctOf(t.away.netWon, t.away.netPlayed) });
  }
  pw.ratio('rcv', 'Receiving points won', (x) => x.rcvWon, (x) => x.rcvPlayed);
  pw.ratio('tot', 'Total points won', (x) => x.won, () => b.rallies);
  out.push({ id: 'points', title: 'Points won', rows: points });

  const games: ServeRow[] = [];
  const g = rowsOf(b, games);
  g.ratio('held', 'Service games held', (x) => x.held, (x) => x.svcGames);
  g.ratio('brk', 'Return games won', (x) => x.breaks, (x) => x.rtnGames);
  g.ratio('bps', 'Break points saved', (x) => x.bpSaved, (x) => x.bpFaced);
  if (st.golden) g.ratio('gold', 'Deciding points won', (x) => x.goldenWon, (x) => x.golden);
  if (b.home.spFaced + b.away.spFaced > 0) g.ratio('sps', 'Set points saved', (x) => x.spSaved, (x) => x.spFaced);
  if (b.home.mpFaced + b.away.mpFaced > 0) g.ratio('mps', 'Match points saved', (x) => x.mpSaved, (x) => x.mpFaced);
  g.count('run', 'Most points in a row', b.home.run, b.away.run);
  g.count('lead', 'Biggest lead (games)', b.home.maxLead, b.away.maxLead);
  out.push({ id: 'games', title: 'Games', rows: games });
  return out;
}

/** The serve filters this match can show (1st / 2nd need serve tracking). */
export const serveFilters = (v: TennisView): ServeFilter[] => (v.cov.serve ? ['all', 1, 2] : ['all']);

/** SERVE & RETURN — for every point, or the points on the 1st / 2nd serve
 *  (return figures then = points returning the opponent's 1st / 2nd serve). */
export function serveReturnRows(v: TennisView, scope: Scope = 'all', f: ServeFilter = 'all'): ServeRow[] {
  const b = blockOf(v, scope);
  if (!b || !b.rallies) return [];
  const t = tennisTally(v, scope);
  const rows: ServeRow[] = [];
  const r = rowsOf(b, rows);
  const srvP = (x: SideServe) => (f === 'all' ? x.srvPlayed : f === 1 ? x.s1In : x.s2Pts);
  const srvW = (x: SideServe) => (f === 'all' ? x.srvWon : f === 1 ? x.s1Won : x.s2Won);
  const other = (side: Side) => b[opp(side)];
  const k = f === 'all' ? 'all' : f === 1 ? 's1' : 's2';
  r.count('aces', 'Aces', t.home.aces[k], t.away.aces[k]);
  r.count('srvP', 'Service points played', srvP(b.home), srvP(b.away));
  r.ratio('srvW', 'Service points won', (x) => srvW(x), (x) => srvP(x));
  const rcvP = (x: SideServe, side: Side) => (f === 'all' ? x.rcvPlayed : srvP(other(side)));
  const rcvW = (x: SideServe, side: Side) => (f === 'all' ? x.rcvWon : srvP(other(side)) - srvW(other(side)));
  r.count('rcvP', 'Return points played', rcvP(b.home, 'home'), rcvP(b.away, 'away'));
  if (v.cov.detail) {
    const h = t.home.ret[k], a = t.away.ret[k];
    rows.push({ key: 'rtnIn', label: 'Return points in play', home: frac(h.inPlay, h.known), away: frac(a.inPlay, a.known), hv: pctOf(h.inPlay, h.known), av: pctOf(a.inPlay, a.known) });
  }
  r.ratio('rcvW', 'Return points won', rcvW, rcvP);
  return rows;
}

/** RALLY — one category's counts per shot type (ATP rows). */
export function rallyRows(v: TennisView, scope: Scope, cat: RallyCat): ServeRow[] {
  const t = tennisTally(v, scope);
  return SHOTS.map((sh) => {
    const h = t.home.cats[cat][sh], a = t.away.cats[cat][sh];
    return { key: sh, label: SHOT_LABEL[sh].row, home: String(h), away: String(a), hv: h, av: a };
  });
}

/** RALLY — the stroke summary: FH / BH winners, UE and FE per side. */
export function strokeSummary(v: TennisView, scope: Scope = 'all'): Array<{ cat: RallyCat; label: string; short: string; home: number; away: number }> {
  const t = tennisTally(v, scope);
  return RALLY_CATS.map((c) => ({ cat: c.id, label: c.label, short: c.short, home: t.home.cats[c.id].all, away: t.away.cats[c.id].all }));
}

/** RALLY LENGTH — points won per side per bucket (the match's), with the share of that bucket. */
export function rallyLengthRows(v: TennisView, scope: Scope = 'all'): ServeRow[] {
  const t = tennisTally(v, scope);
  return v.buckets.map((bk) => {
    const r = t.rally[bk];
    const txt = (n: number) => (r.total ? `${n} (${Math.round((100 * n) / r.total)}%)` : '–');
    return { key: bk, label: RALLY_LABEL[bk], home: txt(r.home), away: txt(r.away), hv: r.home, av: r.away };
  });
}

// ------------------------------------------------------- career keys ----

/**
 * SD-157 — the extra career keys for one player of `side`, only for what the
 * match tracked (D8):
 *   net points       netPts / netPtsWon — the side's (doubles: both players,
 *                    as rcvPts: the scorer marks a side, not a player)
 *   rally length     rl04Pts / rl04Won · rl58Pts / rl58Won · rl9Pts / rl9Won
 *                    — the side's points in that bucket / won (round 2: the
 *                    match's buckets, e.g. rl13Pts … for 1–3 / 4–6 / 7–9 / 10+)
 *   return in play   rtnInPlay / rtnInPlayOf — the side's (point detail)
 *   serve speed      the SERVING player's (named server only, as srvPts):
 *                    srvKmhSum / srvKmhN (every serve with a speed),
 *                    srv1KmhSum / srv1KmhN, srv2KmhSum / srv2KmhN, and
 *                    srvKmhMax (career: the max) when they served one
 */
export function tennisCareerKeys(v: TennisView | null, side: Side, playerId: string): Record<string, number> {
  if (!v) return {};
  const out: Record<string, number> = {};
  const t = tennisTally(v, 'all');
  const me = t[side];
  if (v.cov.net) Object.assign(out, { netPts: me.netPlayed, netPtsWon: me.netWon });
  if (v.cov.rally) {
    for (const b of v.buckets) {
      out[`${rallyKey(b)}Pts`] = t.rally[b].total;
      out[`${rallyKey(b)}Won`] = t.rally[b][side];
    }
  }
  if (v.cov.detail) Object.assign(out, { rtnInPlay: me.ret.all.inPlay, rtnInPlayOf: me.ret.all.known });
  // tennis-endings-depth FT1 — the SERVING player's faults by type (named
  // server only, as srvPts), for a match that typed any fault
  if (v.st.serverKnown && v.points.some((p) => p.p.sf1 || (p.p.df && p.p.sf2))) {
    const f: Record<FaultKind, number> = { net: 0, long: 0, wide: 0, foot: 0 };
    for (const p of v.points) {
      if (p.serverId !== playerId || p.server !== side) continue;
      if (p.p.sf1) f[p.p.sf1] += 1;
      if (p.p.df && p.p.sf2) f[p.p.sf2] += 1;
    }
    Object.assign(out, { srvFaultNet: f.net, srvFaultLong: f.long, srvFaultWide: f.wide, srvFootFaults: f.foot });
  }
  if (v.cov.speed && v.st.serverKnown) {
    const all: number[] = [], s1: number[] = [], s2: number[] = [];
    for (const p of v.points) {
      if (p.serverId !== playerId || p.server !== side || typeof p.p.kmh !== 'number' || p.p.df) continue;
      all.push(p.p.kmh);
      if (p.p.serve === 1) s1.push(p.p.kmh); else if (p.p.serve === 2) s2.push(p.p.kmh);
    }
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    Object.assign(out, {
      srvKmhSum: sum(all), srvKmhN: all.length,
      srv1KmhSum: sum(s1), srv1KmhN: s1.length,
      srv2KmhSum: sum(s2), srv2KmhN: s2.length,
    });
    if (all.length) Object.assign(out, { srvKmhMax: Math.max(...all) });
  }
  return out;
}

/** Every key `tennisCareerKeys` can write (docs, schema and tests); round 2:
 *  the rally keys of every bucket scheme. */
export const TENNIS_EXTRA_KEYS: readonly string[] = [
  'netPts', 'netPtsWon', ...allRallyBuckets('tennis').flatMap((b) => [`${rallyKey(b)}Pts`, `${rallyKey(b)}Won`]), 'rtnInPlay', 'rtnInPlayOf',
  'srvKmhSum', 'srvKmhN', 'srv1KmhSum', 'srv1KmhN', 'srv2KmhSum', 'srv2KmhN', 'srvKmhMax',
  'srvFaultNet', 'srvFaultLong', 'srvFaultWide', 'srvFootFaults',
];
