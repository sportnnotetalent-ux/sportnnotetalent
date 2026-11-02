/**
 * Deep wave (racket) — match stats at broadcast depth for badminton (BWF),
 * table tennis (ITTF / WTT), squash (PSA SquashTV), padel (Premier Padel) and
 * pickleball (PPA): the generalisation of tennis/matchStats.ts (SD-157) to
 * the other racket sports. PURE (no React Native): the panel
 * (MatchStatsPanel.tsx), statTotals (racketTotals.ts) and tests import it.
 *
 * Everything is DERIVED from the point log: `serveStats` replays it through
 * the sport's own reducer (who served every rally, side-outs, holds / breaks
 * in padel, game / match points) and its `trace` lines each rally up with its
 * input (detail, net / kitchen mark, rally length, 3rd shot). A corrected log
 * (EDIT_LOG) or an old log gives the right figures; nothing is stored.
 *
 * Panels (rows only for what the match tracked — never a false 0):
 *   KEY STATS     Serve · Winners & errors · Referee decisions (squash) ·
 *                 Points won · Games
 *   SERVE         the SD-22 serve / receive rows + each named server's line
 *   SHOTS         winners / unforced / forced errors by shot, for either wing
 *                 or forehand / backhand only; the stroke summary; errors and
 *                 service faults by type (point detail)
 *   RALLY LENGTH  points won per bucket; table tennis the three phases
 *                 (serve & 3rd ball, receive & 4th ball, rally) on serve and
 *                 on receive (rally length)
 *   3RD SHOT      pickleball: the serving team's drop / drive / lob and the
 *                 rallies it won after each (3rd shot)
 *
 * Definitions:
 *   - Winners / errors keep SD-107's meaning (an ace / service fault is its
 *     own row). A no let is counted against the player who appealed (the
 *     rally's loser); a stroke for the rally winner, conceded by the other.
 *   - Lets (squash): the Let records on the log, by who appealed when the
 *     scorer named them (the side buttons), else as unattributed.
 *   - Net / kitchen points: the side was forward on the rally (the scorer
 *     marks Home / Away / both); played = rallies it was forward, won = those
 *     it won.
 *   - Table tennis phases (the three-phase method): a point that ended by the
 *     4th shot is "serve & 3rd ball" for the server and "receive & 4th ball"
 *     for the receiver; 5+ shots is the rally phase.
 *   - 3rd shot (pickleball): the serving team's shot after the return; won =
 *     the serving team won the rally (side-out scoring: kept serve or scored).
 *
 * Round 2 (founder's answers):
 *   - rally length reads the match's buckets (`matchRallyBuckets`: its
 *     scheme — an organiser option — plus any other bucket its points carry);
 *     an old match reads the deep-wave buckets as before. Table tennis' phase
 *     rows follow the scheme (three phases, or four: transition 5–6,
 *     stalemate 7+); serve & 3rd ball / receive & 4th ball are the same in both;
 *   - kitchen ARRIVAL (pickleball, once a rally was marked "Nobody"): over the
 *     rallies with a kitchen-line mark (a side, both or nobody), how often
 *     each side got there — overall, when serving, when returning (PPA);
 *   - squash "lets asked" go into careers per player (the appealing side's
 *     player; doubles: both — the button names a side), on a match where a
 *     let was asked with the side named.
 */
import { pointInputs, type PointInput } from './rallyEdit.ts';
import { rallyInputs } from './rallyEngine.ts';
import { serveStats, serveRows, type ServeBlock, type ServeRosters, type ServeRow, type ServeStats, type SideServe } from './serveStats.ts';
import {
  DETAIL_HOWS, NET_WORDS, RALLY_LABEL, STROKES, THIRD_LABEL, THIRD_SHOTS, TT_PHASE_LABEL, WINGS, WING_LABEL,
  PADEL_FAULT_KINDS, allRallyBuckets, arrivalTracked, detailCoverage, errTypeOf, hasNobodyMark, howDef, matchRallyBuckets, netSides, netTracked, rallyKey, rallyTracked,
  shotIdsOf, shotLabel, shotOf, thirdTracked,
  type DepthSport, type FaultKind, type RallyBucket, type ThirdShot, type Wing,
} from './pointDetail.ts';
import type { LiveEvent } from './liveEvents';
import { conductRows, isMark } from './conduct.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const RALLY_ENGINE = new Set<DepthSport>(['tabletennis', 'squash', 'pickleball']);

/** The whole match, or one game (one set in padel), 1-based. */
export type Scope = 'all' | number;

/** One replayed rally: who served (side + named player), who won, the
 *  game / set, tiebreak (padel), and the rally's input. */
export interface RPoint { i: number; p: PointInput; server: Side; serverId?: string; winner: Side; period: number; tb: boolean }

/** What this match tracked (D8: a panel / row shows only for these). */
export interface RacketCoverage {
  /** point detail: 'full', only one-tap hows ('quick': padel Ace, squash Stroke / No let), or none */
  detail: 'full' | 'quick' | null;
  /** padel 1st / 2nd serve */
  serve: boolean;
  /** padel net points / pickleball kitchen line */
  net: boolean;
  rally: boolean;
  /** pickleball 3rd shot */
  third: boolean;
  /** round 2 — pickleball kitchen arrival (a rally was marked "Nobody") */
  arrival: boolean;
}

/** A squash Let record: who appealed (when named) and its game. */
export interface LetMark { side?: Side; period: number }

export interface RacketView {
  sport: DepthSport; st: ServeStats; points: RPoint[]; cov: RacketCoverage; lets: LetMark[];
  /** racket-batch5 RB5 — the conduct / timeout / let / review records and
   *  penalty points (the Conduct & timeouts rows) */
  marks: LiveEvent[];
  /** round 2 — the rally-length buckets this match reads with */
  buckets: RallyBucket[];
}

/** Replay `state` once; null when it isn't a match state of `sport`. */
export function racketView(sport: DepthSport, state: unknown, rosters: ServeRosters = {}): RacketView | null {
  const s = state as { events?: LiveEvent[]; pointDetail?: boolean; netDetail?: boolean; rallyDetail?: boolean; thirdDetail?: boolean; rallyBuckets?: string } | null;
  const st = serveStats(sport, s, rosters);
  if (!st || !s) return null;
  const events = s.events ?? [];
  const inputs = RALLY_ENGINE.has(sport) ? rallyInputs(events) : pointInputs(events);
  const points: RPoint[] = st.trace.map((t) => ({ ...t, p: inputs[t.i] })).filter((t) => !!t.p);
  const lets: LetMark[] = events.filter((e) => e.kind === 'let').map((e) => ({
    ...(e.side === 'home' || e.side === 'away' ? { side: e.side } : {}), period: e.game ?? e.set ?? 1,
  }));
  const net = !!NET_WORDS[sport] && netTracked(s);
  return {
    sport, st, points, lets,
    marks: events.filter((e) => !!e && (isMark(e) || !!e.pen)),
    cov: {
      detail: detailCoverage(sport, s),
      serve: st.serveTracked,
      net,
      rally: rallyTracked(s),
      third: sport === 'pickleball' && thirdTracked(s),
      arrival: net && hasNobodyMark(sport) && arrivalTracked(s),
    },
    buckets: matchRallyBuckets(sport, s),
  };
}

// ---------------------------------------------------------------- tally --

export type HowSel = 'winner' | 'ue' | 'fe';
export type WingSel = 'all' | Wing;
export const HOW_SELS: ReadonlyArray<{ how: HowSel; label: string; short: string }> = [
  { how: 'winner', label: 'Winners', short: 'W' },
  { how: 'ue', label: 'Unforced errors', short: 'UE' },
  { how: 'fe', label: 'Forced errors', short: 'FE' },
];
export const WING_SELS: ReadonlyArray<{ wing: WingSel; label: string }> = [
  { wing: 'all', label: 'All' }, { wing: 'fh', label: 'Forehand' }, { wing: 'bh', label: 'Backhand' },
];

export interface PhaseTally { srvP: number; srvW: number; rcvP: number; rcvW: number }
/** Round 2 — kitchen arrival: rallies with a kitchen-line mark (`of`) and
 *  those the side got there (`n`). */
export interface Arrival { n: number; of: number }
export interface RSide {
  winners: number; ue: number; fe: number; aces: number; sw: number; sf: number;
  /** squash decisions: strokes won / conceded, no lets (appeals refused) */
  strokes: number; conceded: number; nolets: number;
  /** racket-depth RD3: points lost by rule (apart from errors) */
  rule: number;
  /** how → wing ('all' = either / unknown) → shot id ('all' = any / unknown) */
  shots: Record<HowSel, Record<WingSel, Record<string, number>>>;
  /** unforced errors by type, service faults by type (racket-depth RD1:
   *  forced errors by type) */
  errTypes: Record<string, number>; sfTypes: Record<string, number>; feTypes: Record<string, number>;
  netPlayed: number; netWon: number;
  /** pickleball: this side's 3rd shots (as the serving team) and rallies won after them */
  third: Record<ThirdShot, { n: number; won: number }>;
  /** per rally bucket: points this side served / won, received / won */
  phase: Record<string, PhaseTally>;
  /** round 2 — kitchen arrival: over every marked rally, when serving, when returning */
  arrival: { all: Arrival; srv: Arrival; rcv: Arrival };
}
export interface RTally {
  home: RSide; away: RSide;
  /** rallies carrying point detail */
  described: number;
  buckets: readonly RallyBucket[];
  /** points with a rally length: per bucket, played and won per side */
  rally: Record<string, { total: number; home: number; away: number }>;
}

const zeroSide = (sport: DepthSport, buckets: readonly RallyBucket[]): RSide => {
  const ids = ['all', ...shotIdsOf(sport)];
  const byShot = () => Object.fromEntries(ids.map((k) => [k, 0])) as Record<string, number>;
  const byWing = () => ({ all: byShot(), fh: byShot(), bh: byShot() });
  return {
    winners: 0, ue: 0, fe: 0, aces: 0, sw: 0, sf: 0, strokes: 0, conceded: 0, nolets: 0, rule: 0,
    shots: { winner: byWing(), ue: byWing(), fe: byWing() },
    errTypes: {}, sfTypes: {}, feTypes: {}, netPlayed: 0, netWon: 0,
    third: { drop: { n: 0, won: 0 }, drive: { n: 0, won: 0 }, lob: { n: 0, won: 0 } },
    phase: Object.fromEntries(buckets.map((b) => [b, { srvP: 0, srvW: 0, rcvP: 0, rcvW: 0 }])),
    arrival: { all: { n: 0, of: 0 }, srv: { n: 0, of: 0 }, rcv: { n: 0, of: 0 } },
  };
};

const inScope = (t: RPoint, scope: Scope) => scope === 'all' || t.period === scope;

/** Per-side detail figures over the match or one game / set. */
export function racketTally(v: RacketView, scope: Scope = 'all'): RTally {
  const { sport } = v;
  const buckets = v.buckets;
  const out: RTally = {
    home: zeroSide(sport, buckets), away: zeroSide(sport, buckets), described: 0, buckets,
    rally: Object.fromEntries(buckets.map((b) => [b, { total: 0, home: 0, away: 0 }])),
  };
  for (const t of v.points) {
    if (!inScope(t, scope)) continue;
    const { p, server: S, winner: W } = t;
    const R = opp(S), L = opp(W);
    const pd = p.pd;
    if (p.kind === 'ace' || pd?.how === 'ace') out[W].aces += 1;
    if (pd) {
      out.described += 1;
      const def = howDef(sport, pd.how);
      const X: Side = def?.credit === 'winner' ? W : L;
      switch (pd.how) {
        case 'winner': out[W].winners += 1; break;
        case 'ue': out[L].ue += 1; break;
        case 'fe': out[L].fe += 1; break;
        case 'sw': out[W].sw += 1; break;
        case 'sf': out[L].sf += 1; break;
        case 'stroke': out[W].strokes += 1; out[L].conceded += 1; break;
        case 'nolet': out[L].nolets += 1; break;
        case 'rule': out[L].rule += 1; break;
        default: break;
      }
      if (def?.wingShot && (pd.how === 'winner' || pd.how === 'ue' || pd.how === 'fe')) {
        const { wing, shot } = shotOf(sport, pd);
        const c = out[X].shots[pd.how];
        for (const w of (wing ? ['all', wing] : ['all']) as WingSel[]) {
          c[w].all += 1;
          if (shot) c[w][shot] = (c[w][shot] ?? 0) + 1;
        }
      }
      const et = errTypeOf(sport, pd);
      if (et && pd.how === 'ue') out[L].errTypes[et] = (out[L].errTypes[et] ?? 0) + 1;
      if (et && pd.how === 'sf') out[L].sfTypes[et] = (out[L].sfTypes[et] ?? 0) + 1;
      if (et && pd.how === 'fe') out[L].feTypes[et] = (out[L].feTypes[et] ?? 0) + 1;
    }
    const at = netSides(p, W);
    for (const n of at) { out[n].netPlayed += 1; if (n === W) out[n].netWon += 1; }
    // round 2 — kitchen arrival over the rallies with a mark (a side, both or nobody)
    if (v.cov.arrival && p.atNet) {
      for (const x of ['home', 'away'] as Side[]) {
        const a = out[x].arrival, got = at.includes(x) ? 1 : 0;
        a.all.of += 1; a.all.n += got;
        const k = x === S ? a.srv : a.rcv;
        k.of += 1; k.n += got;
      }
    }
    if (p.rallyLen && out.rally[p.rallyLen]) {
      const r = out.rally[p.rallyLen];
      r.total += 1; r[W] += 1;
      const ps = out[S].phase[p.rallyLen], pr = out[R].phase[p.rallyLen];
      ps.srvP += 1; pr.rcvP += 1;
      if (W === S) ps.srvW += 1; else pr.rcvW += 1;
    }
    if (p.third) { const x = out[S].third[p.third]; x.n += 1; if (W === S) x.won += 1; }
  }
  return out;
}

// ----------------------------------------------------------------- rows --

const frac = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : '–');
const pctOf = (n: number, d: number) => (d ? (100 * n) / d : 0);
const ratioRow = (key: string, label: string, hn: number, hd: number, an: number, ad: number): ServeRow =>
  ({ key, label, home: frac(hn, hd), away: frac(an, ad), hv: pctOf(hn, hd), av: pctOf(an, ad) });
const countRow = (key: string, label: string, hv: number, av: number): ServeRow => ({ key, label, home: String(hv), away: String(av), hv, av });

/** The serve block of a scope (null = a game / set with no rally yet). */
export function blockOf(v: RacketView, scope: Scope): ServeBlock | null {
  return scope === 'all' ? v.st.match : v.st.periods[scope - 1] ?? null;
}

export interface StatSection { id: 'serve' | 'shots' | 'decisions' | 'points' | 'games' | 'conduct'; title: string; rows: ServeRow[] }

type RowAdd = {
  ratio: (key: string, label: string, n: (x: SideServe) => number, d: (x: SideServe) => number) => void;
  count: (key: string, label: string, hv: number, av: number) => void;
};
function rowsOf(b: ServeBlock, rows: ServeRow[]): RowAdd {
  return {
    ratio: (key, label, n, d) => rows.push(ratioRow(key, label, n(b.home), d(b.home), n(b.away), d(b.away))),
    count: (key, label, hv, av) => rows.push(countRow(key, label, hv, av)),
  };
}

/** padel-fault PF6 — the Stats-tab rows of each serve-fault type (tennis' keys, + the mesh). */
const FAULT_ROW: Record<FaultKind, [string, string]> = {
  net: ['fNet', 'Serve faults into the net'], long: ['fLong', 'Serve faults long'], wide: ['fWide', 'Serve faults wide'],
  foot: ['fFoot', 'Foot faults'], mesh: ['fMesh', 'Serve faults into the mesh'],
};
const zeroFaults = (): Record<FaultKind, number> => ({ net: 0, long: 0, wide: 0, foot: 0, mesh: 0 });

/** padel-fault PF6 — `side`'s serve faults by type (1st serves and double
 *  faults), in the scope; `playerId` = only the named server's. */
export function serveFaults(v: RacketView, side: Side, scope: Scope = 'all', playerId?: string): Record<FaultKind, number> {
  const f = zeroFaults();
  for (const t of v.points) {
    if (!inScope(t, scope) || t.server !== side || (playerId !== undefined && t.serverId !== playerId)) continue;
    if (t.p.sf1) f[t.p.sf1] += 1;
    if (t.p.df && t.p.sf2) f[t.p.sf2] += 1;
  }
  return f;
}

/** The words a sport's side-out rows read with. */
const sideOutWords = (sport: DepthSport) => (sport === 'squash'
  ? { so: 'Hand-outs won', rcv: 'Hand-out % (receive rallies won)', srv: 'Rallies won on serve', turns: 'Hand-ins (service turns)' }
  : { so: 'Side-outs won', rcv: 'Side-out % (receive rallies won)', srv: 'Rallies won on serve', turns: 'Service turns' });

/** KEY STATS — Serve · Winners & errors · Referee decisions · Points won · Games. */
export function keyStats(v: RacketView, scope: Scope = 'all'): StatSection[] {
  const b = blockOf(v, scope);
  if (!b || !b.rallies) return [];
  const t = racketTally(v, scope);
  const { st, cov, sport } = v;
  const setSport = st.unit === 'set';
  const full = cov.detail === 'full';
  const out: StatSection[] = [];

  // SERVE
  const serve: ServeRow[] = [];
  const s = rowsOf(b, serve);
  const hasAce = DETAIL_HOWS[sport].some((h) => h.how === 'ace');
  if (hasAce && cov.detail) s.count('aces', 'Aces', t.home.aces, t.away.aces);
  if (b.home.dfs + b.away.dfs > 0) s.count('dfs', 'Double faults', b.home.dfs, b.away.dfs);
  if (setSport && cov.serve && b.home.s1Pts + b.away.s1Pts > 0) {
    s.ratio('s1in', '1st serve in', (x) => x.s1In, (x) => x.s1Pts);
    s.ratio('s1won', 'Win 1st serve', (x) => x.s1Won, (x) => x.s1In);
    s.ratio('s2won', 'Win 2nd serve', (x) => x.s2Won, (x) => x.s2Pts);
  }
  if (full && t.home.sw + t.away.sw > 0) s.count('sw', 'Service winners', t.home.sw, t.away.sw);
  if (full && DETAIL_HOWS[sport].some((h) => h.how === 'sf')) s.count('sf', 'Service faults', t.home.sf, t.away.sf);
  // padel-fault PF6 — serve faults by type (as tennis; rows only for types recorded)
  if (sport === 'padel') {
    const f = { home: serveFaults(v, 'home', scope), away: serveFaults(v, 'away', scope) };
    for (const k of PADEL_FAULT_KINDS) if (f.home[k] + f.away[k] > 0) s.count(FAULT_ROW[k][0], FAULT_ROW[k][1], f.home[k], f.away[k]);
  }
  if (st.sideOut) {
    const w = sideOutWords(sport);
    s.ratio('srv', w.srv, (x) => x.srvWon, (x) => x.srvPlayed);
    s.ratio('rcv', w.rcv, (x) => x.rcvWon, (x) => x.rcvPlayed);
    s.count('so', w.so, b.home.sideOuts, b.away.sideOuts);
    s.count('turns', w.turns, b.home.turns, b.away.turns);
    serve.push({
      key: 'ppt', label: 'Points per service turn',
      home: b.home.turns ? (b.home.scored / b.home.turns).toFixed(1) : '–', away: b.away.turns ? (b.away.scored / b.away.turns).toFixed(1) : '–',
      hv: b.home.turns ? b.home.scored / b.home.turns : 0, av: b.away.turns ? b.away.scored / b.away.turns : 0,
    });
    if (st.doubles && sport === 'pickleball') s.count('ho', 'Serve to 2nd server', b.home.handovers, b.away.handovers);
  } else if (!setSport) {
    s.ratio('srv', 'Points won on serve', (x) => x.srvWon, (x) => x.srvPlayed);
    s.ratio('rcv', 'Points won on receive', (x) => x.rcvWon, (x) => x.rcvPlayed);
  }
  if (serve.length) out.push({ id: 'serve', title: 'Serve', rows: serve });

  // WINNERS & ERRORS
  if (full) {
    const shots: ServeRow[] = [];
    shots.push(countRow('winners', 'Winners', t.home.winners, t.away.winners));
    shots.push(countRow('ue', 'Unforced errors', t.home.ue, t.away.ue));
    shots.push(countRow('fe', 'Forced errors', t.home.fe, t.away.fe));
    const ratio = (x: RSide) => (x.ue ? x.winners / x.ue : x.winners ? Infinity : 0);
    const rt = (x: RSide) => (x.ue ? (x.winners / x.ue).toFixed(2) : x.winners ? `${x.winners}–0` : '–');
    const rh = ratio(t.home), ra = ratio(t.away);
    shots.push({ key: 'wue', label: 'Winners / UE', home: rt(t.home), away: rt(t.away), hv: Number.isFinite(rh) ? rh : 99, av: Number.isFinite(ra) ? ra : 99 });
    // racket-depth RD3: counted apart from errors, once a match recorded one
    if (t.home.rule + t.away.rule > 0) shots.push(countRow('rule', 'Points lost by rule', t.home.rule, t.away.rule));
    out.push({ id: 'shots', title: 'Winners & errors', rows: shots });
  }

  // REFEREE DECISIONS (squash: the one-tap Stroke / No let buttons, the Let records)
  if (sport === 'squash') {
    const dec: ServeRow[] = [];
    const lets = v.lets.filter((l) => scope === 'all' || l.period === scope);
    if (lets.length) {
      const by = (x: Side) => lets.filter((l) => l.side === x).length;
      const none = lets.filter((l) => !l.side).length;
      dec.push(none
        ? { key: 'lets', label: `Lets asked (${lets.length} in all · ${none} not named)`, home: String(by('home')), away: String(by('away')), hv: by('home'), av: by('away') }
        : countRow('lets', 'Lets asked', by('home'), by('away')));
    }
    if (cov.detail) {
      dec.push(countRow('strokes', 'Strokes won', t.home.strokes, t.away.strokes));
      dec.push(countRow('nolets', 'No lets', t.home.nolets, t.away.nolets));
    }
    if (dec.length) out.push({ id: 'decisions', title: 'Referee decisions', rows: dec });
  }

  // POINTS WON
  const points: ServeRow[] = [];
  const pw = rowsOf(b, points);
  if (setSport) pw.ratio('bpc', 'Break points won', (x) => x.bpWon, (x) => x.bpOpps);
  if (cov.net) {
    const nw = NET_WORDS[sport]!;
    points.push(ratioRow('net', nw.won, t.home.netWon, t.home.netPlayed, t.away.netWon, t.away.netPlayed));
  }
  // round 2 — pickleball kitchen arrival (PPA: overall, serving, returning)
  if (cov.arrival) {
    const arr = (key: string, label: string, k: 'all' | 'srv' | 'rcv') =>
      points.push(ratioRow(key, label, t.home.arrival[k].n, t.home.arrival[k].of, t.away.arrival[k].n, t.away.arrival[k].of));
    arr('arr', 'Kitchen arrival', 'all');
    arr('arrSrv', 'Kitchen arrival · serving', 'srv');
    arr('arrRcv', 'Kitchen arrival · returning', 'rcv');
  }
  if (setSport) pw.ratio('rcv', 'Receiving points won', (x) => x.rcvWon, (x) => x.rcvPlayed);
  pw.ratio('tot', st.sideOut ? 'Rallies won' : 'Total points won', (x) => x.won, () => b.rallies);
  pw.count('run', 'Most points in a row', b.home.run, b.away.run);
  pw.count('lead', setSport ? 'Biggest lead (games)' : 'Biggest lead', b.home.maxLead, b.away.maxLead);
  out.push({ id: 'points', title: 'Points won', rows: points });

  // GAMES
  const games: ServeRow[] = [];
  const g = rowsOf(b, games);
  const any = (n: (x: SideServe) => number) => n(b.home) + n(b.away) > 0;
  if (setSport) {
    g.ratio('held', 'Service games held', (x) => x.held, (x) => x.svcGames);
    g.ratio('brk', 'Return games won', (x) => x.breaks, (x) => x.rtnGames);
    g.ratio('bps', 'Break points saved', (x) => x.bpSaved, (x) => x.bpFaced);
    if (st.golden) g.ratio('gold', st.star ? 'Star points won' : 'Golden points won', (x) => x.goldenWon, (x) => x.golden);
    if (any((x) => x.spFaced)) g.ratio('sps', 'Set points saved', (x) => x.spSaved, (x) => x.spFaced);
  } else {
    if (any((x) => x.gpOpps)) g.ratio('gpc', 'Game points converted', (x) => x.gpWon, (x) => x.gpOpps);
    if (any((x) => x.gpFaced)) g.ratio('gps', 'Game points saved', (x) => x.gpSaved, (x) => x.gpFaced);
  }
  if (any((x) => x.mpFaced)) g.ratio('mps', 'Match points saved', (x) => x.mpSaved, (x) => x.mpFaced);
  if (games.length) out.push({ id: 'games', title: setSport ? 'Games' : 'Game & match points', rows: games });

  // racket-batch5 RB5 (racket.md C7) — conduct, timeouts, lets, video reviews
  const conduct = conductRows(sport, v.marks, scope);
  if (conduct.length) out.push({ id: 'conduct', title: 'Conduct & timeouts', rows: conduct });
  return out;
}

/** SERVE — the SD-22 serve / receive rows for the scope (side-out, holds,
 *  golden points … as the sport has them). */
export function serveTabRows(v: RacketView, scope: Scope = 'all'): ServeRow[] {
  const b = blockOf(v, scope);
  return b && b.rallies ? serveRows(v.st, b) : [];
}

/** SHOTS — one how's counts per shot type, for either wing ('all') or one
 *  wing; the first row is the total. */
export function shotRows(v: RacketView, scope: Scope, how: HowSel, wing: WingSel = 'all'): ServeRow[] {
  const t = racketTally(v, scope);
  const h = t.home.shots[how][wing], a = t.away.shots[how][wing];
  const lab = HOW_SELS.find((x) => x.how === how)!.label;
  const head = wing === 'all' ? lab : `${WING_LABEL[wing]} · ${lab.toLowerCase()}`;
  return [
    countRow('all', head, h.all, a.all),
    ...shotIdsOf(v.sport).map((id) => countRow(id, shotLabel(v.sport, id), h[id] ?? 0, a[id] ?? 0)),
  ];
}

/** SHOTS — the stroke summary: FH / BH winners, UE and FE per side. */
export function strokeSummary(v: RacketView, scope: Scope = 'all'): Array<{ key: string; label: string; home: number; away: number }> {
  const t = racketTally(v, scope);
  const out: Array<{ key: string; label: string; home: number; away: number }> = [];
  for (const h of HOW_SELS) {
    for (const w of WINGS) out.push({ key: `${h.how}${w}`, label: `${w.toUpperCase()} ${h.label.toLowerCase()}`, home: t.home.shots[h.how][w].all, away: t.away.shots[h.how][w].all });
  }
  return out;
}

/** SHOTS — unforced errors by type, forced errors by type (racket-depth RD1)
 *  and service faults by type (the types that occurred). */
export function errorTypeRows(v: RacketView, scope: Scope = 'all'): ServeRow[] {
  const t = racketTally(v, scope);
  const rows: ServeRow[] = [];
  for (const d of DETAIL_HOWS[v.sport]) {
    if (d.how !== 'ue' && d.how !== 'fe' && d.how !== 'sf') continue;
    const head = d.how === 'ue' ? 'Unforced errors' : d.how === 'fe' ? 'Forced errors' : 'Service faults';
    for (const et of d.strokes ?? []) {
      const pick = (x: RSide) => (d.how === 'ue' ? x.errTypes[et] : d.how === 'fe' ? x.feTypes[et] : x.sfTypes[et]) ?? 0;
      const hv = pick(t.home), av = pick(t.away);
      if (hv + av === 0) continue;
      const lab = STROKES[et]?.label ?? et;
      rows.push(countRow(`${d.how}-${et}`, `${head} · ${lab.toLowerCase()}`, hv, av));
    }
  }
  return rows;
}

/** The label a rally bucket reads with (table tennis: its phase). */
export const bucketLabel = (sport: DepthSport, b: RallyBucket): string =>
  (sport === 'tabletennis' ? TT_PHASE_LABEL[b] ?? RALLY_LABEL[b] : RALLY_LABEL[b]);

/** RALLY LENGTH — points won per side per bucket, with the share of that bucket. */
export function rallyLengthRows(v: RacketView, scope: Scope = 'all'): ServeRow[] {
  const t = racketTally(v, scope);
  return t.buckets.map((bk) => {
    const r = t.rally[bk];
    const txt = (n: number) => (r.total ? `${n} (${Math.round((100 * n) / r.total)}%)` : '–');
    return { key: bk, label: bucketLabel(v.sport, bk), home: txt(r.home), away: txt(r.away), hv: r.home, av: r.away };
  });
}

/** RALLY LENGTH (table tennis) — the three-phase analysis: points won in
 *  the serve & 3rd ball phase (own serve, ended by the 4th shot), the receive
 *  & 4th ball phase (the opponent's serve, ended by the 4th shot), the rally
 *  phase (5+ shots). Other sports: points won on serve / on receive per bucket. */
export function phaseRows(v: RacketView, scope: Scope = 'all'): ServeRow[] {
  const t = racketTally(v, scope);
  const sum = (x: RSide, bs: RallyBucket[], f: (p: { srvP: number; srvW: number; rcvP: number; rcvW: number }) => number) =>
    bs.reduce((n, b) => n + (x.phase[b] ? f(x.phase[b]) : 0), 0);
  if (v.sport === 'tabletennis') {
    const short: RallyBucket[] = ['1-2', '3-4'];
    const rows = [
      ratioRow('serve3', 'Serve & 3rd ball (own serve, shots 1–4)',
        sum(t.home, short, (p) => p.srvW), sum(t.home, short, (p) => p.srvP), sum(t.away, short, (p) => p.srvW), sum(t.away, short, (p) => p.srvP)),
      ratioRow('receive4', 'Receive & 4th ball (shots 1–4)',
        sum(t.home, short, (p) => p.rcvW), sum(t.home, short, (p) => p.rcvP), sum(t.away, short, (p) => p.rcvW), sum(t.away, short, (p) => p.rcvP)),
    ];
    // the rally phase(s) after the 4th shot: 5+ (three phases), or 5–6
    // transition and 7+ stalemate (four phases)
    for (const b of t.buckets.filter((x) => !short.includes(x))) {
      const name = (TT_PHASE_LABEL[b] ?? RALLY_LABEL[b]).replace(/ \(.*\)$/, '');
      rows.push(ratioRow(b === '5+' ? 'rally5' : `rally-${b}`, `${name} (${RALLY_LABEL[b]})`,
        sum(t.home, [b], (p) => p.srvW + p.rcvW), sum(t.home, [b], (p) => p.srvP + p.rcvP),
        sum(t.away, [b], (p) => p.srvW + p.rcvW), sum(t.away, [b], (p) => p.srvP + p.rcvP)));
    }
    return rows;
  }
  // the buckets that occurred (a row with no rally on either side is left out)
  return t.buckets.flatMap((b) => [
    ratioRow(`${b}-srv`, `${RALLY_LABEL[b]} · on serve`, t.home.phase[b].srvW, t.home.phase[b].srvP, t.away.phase[b].srvW, t.away.phase[b].srvP),
    ratioRow(`${b}-rcv`, `${RALLY_LABEL[b]} · on receive`, t.home.phase[b].rcvW, t.home.phase[b].rcvP, t.away.phase[b].rcvW, t.away.phase[b].rcvP),
  ]).filter((r) => r.home !== '–' || r.away !== '–');
}

/** 3RD SHOT (pickleball) — per type: how often each side played it (share of
 *  its 3rd shots) and the rallies it won after it. */
export function thirdShotRows(v: RacketView, scope: Scope = 'all'): ServeRow[] {
  const t = racketTally(v, scope);
  const tot = (x: RSide) => THIRD_SHOTS.reduce((n, k) => n + x.third[k].n, 0);
  const th = tot(t.home), ta = tot(t.away);
  const share = (n: number, d: number) => (d ? `${n} (${Math.round((100 * n) / d)}%)` : '–');
  return THIRD_SHOTS.flatMap((k) => [
    { key: `${k}`, label: `${THIRD_LABEL[k]}s`, home: share(t.home.third[k].n, th), away: share(t.away.third[k].n, ta), hv: t.home.third[k].n, av: t.away.third[k].n },
    ratioRow(`${k}Won`, `Rallies won after a ${THIRD_LABEL[k]}`, t.home.third[k].won, t.home.third[k].n, t.away.third[k].won, t.away.third[k].n),
  ]);
}

// ------------------------------------------------------- career keys ----

/**
 * Deep wave — the extra career keys for one player of `side`, only for what
 * the match tracked (D8). All the SIDE's (doubles: both players — the scorer
 * marks a side, not a player):
 *   rally length   rl…Pts / rl…Won per bucket (rallyKey: rl04, rl510, rl12 …);
 *                  table tennis + serve3Pts / serve3Won, receive4Pts /
 *                  receive4Won (the phases ending by the 4th shot)
 *   net / kitchen  padel netPts / netPtsWon, pickleball kitchenPts / kitchenWon
 *   3rd shot       pickleball thirdDrop / thirdDropWon, thirdDrive / …, thirdLob / …
 * Round 2:
 *   rally length   the match's buckets (rl13Pts … for another scheme)
 *   arrival        pickleball kitchenArrOf (rallies with a kitchen-line mark;
 *                  arrived = kitchenPts), kitchenSrvArr / kitchenSrvArrOf,
 *                  kitchenRcvArr / kitchenRcvArrOf (once "Nobody" was used)
 *   lets           squash letsAsked: the lets this side asked (a match where
 *                  a let was asked with the side named)
 */
export function racketCareerKeys(v: RacketView | null, side: Side): Record<string, number> {
  if (!v) return {};
  const out: Record<string, number> = {};
  const t = racketTally(v, 'all');
  const me = t[side];
  if (v.cov.rally) {
    for (const b of t.buckets) {
      out[`${rallyKey(b)}Pts`] = t.rally[b].total;
      out[`${rallyKey(b)}Won`] = t.rally[b][side];
    }
    if (v.sport === 'tabletennis') {
      const ph = (k: 'srvP' | 'srvW' | 'rcvP' | 'rcvW') => (me.phase['1-2']?.[k] ?? 0) + (me.phase['3-4']?.[k] ?? 0);
      Object.assign(out, { serve3Pts: ph('srvP'), serve3Won: ph('srvW'), receive4Pts: ph('rcvP'), receive4Won: ph('rcvW') });
    }
  }
  const nw = NET_WORDS[v.sport];
  if (v.cov.net && nw) {
    out[nw.keys.pts] = me.netPlayed;
    out[nw.keys.won] = me.netWon;
  }
  if (v.cov.third) {
    Object.assign(out, {
      thirdDrop: me.third.drop.n, thirdDropWon: me.third.drop.won,
      thirdDrive: me.third.drive.n, thirdDriveWon: me.third.drive.won,
      thirdLob: me.third.lob.n, thirdLobWon: me.third.lob.won,
    });
  }
  if (v.cov.arrival) {
    Object.assign(out, {
      kitchenArrOf: me.arrival.all.of,
      kitchenSrvArr: me.arrival.srv.n, kitchenSrvArrOf: me.arrival.srv.of,
      kitchenRcvArr: me.arrival.rcv.n, kitchenRcvArrOf: me.arrival.rcv.of,
    });
  }
  if (letsTracked(v)) out[LETS_KEY] = v.lets.filter((l) => l.side === side).length;
  return out;
}

/** padel-fault PF6 — a padel match that typed any serve fault, with the server known. */
export const faultsTyped = (v: RacketView | null): boolean =>
  !!v && v.sport === 'padel' && v.st.serverKnown && v.points.some((t) => t.p.sf1 || (t.p.df && t.p.sf2));

/** padel-fault PF6 — the SERVING player's faults by type (named server only,
 *  as srvPts; tennis' keys + srvFaultMesh), on a match that typed any. */
export function faultCareerKeys(v: RacketView | null, side: Side, playerId: string): Record<string, number> {
  if (!faultsTyped(v)) return {};
  const f = serveFaults(v!, side, 'all', playerId);
  return { srvFaultNet: f.net, srvFaultLong: f.long, srvFaultWide: f.wide, srvFootFaults: f.foot, srvFaultMesh: f.mesh };
}
export const PADEL_FAULT_KEYS = ['srvFaultNet', 'srvFaultLong', 'srvFaultWide', 'srvFootFaults', 'srvFaultMesh'] as const;

/** Round 2 — squash: a let was asked with the side named (the per-side Let
 *  buttons), so "lets asked" can be credited. An older match (one unnamed
 *  Let button) or one without lets writes nothing — never a false 0. */
export const letsTracked = (v: RacketView | null): boolean => !!v && v.sport === 'squash' && v.lets.some((l) => !!l.side);

/** Does this match write any of the extra career keys? */
export const hasRacketExtras = (v: RacketView | null): boolean =>
  !!v && (v.cov.rally || v.cov.net || v.cov.third || v.cov.arrival || letsTracked(v));

/** Every key `racketCareerKeys` can write for `sport` (docs, schema and
 *  tests) — round 2: every bucket scheme's rally keys, pickleball arrival,
 *  squash lets asked. */
export function racketExtraKeys(sport: DepthSport): string[] {
  const out = allRallyBuckets(sport).flatMap((b) => [`${rallyKey(b)}Pts`, `${rallyKey(b)}Won`]);
  if (sport === 'tabletennis') out.push('serve3Pts', 'serve3Won', 'receive4Pts', 'receive4Won');
  const nw = NET_WORDS[sport];
  if (nw) out.push(nw.keys.pts, nw.keys.won);
  if (sport === 'pickleball') out.push('thirdDrop', 'thirdDropWon', 'thirdDrive', 'thirdDriveWon', 'thirdLob', 'thirdLobWon');
  if (hasNobodyMark(sport)) out.push(...ARRIVAL_KEYS);
  if (sport === 'squash') out.push(LETS_KEY);
  if (sport === 'padel') out.push(...PADEL_FAULT_KEYS);
  return out;
}
/** Round 2 — pickleball kitchen-arrival keys (arrived overall = kitchenPts). */
export const ARRIVAL_KEYS = ['kitchenArrOf', 'kitchenSrvArr', 'kitchenSrvArrOf', 'kitchenRcvArr', 'kitchenRcvArrOf'] as const;
/** Round 2 — squash: lets asked, per player. */
export const LETS_KEY = 'letsAsked';
