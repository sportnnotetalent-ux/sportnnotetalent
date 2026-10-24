/**
 * Deep wave (volleyball-kabaddi) — volleyball's broadcast match stats, the
 * FIVB VIS / VNL match-centre way: team vs team by skill (scoring, attack &
 * block, serve, reception, defence & setting, game flow), for the match or
 * one set, plus rotation analysis (points won with each player at position I:
 * side-out % and break-point %) and a by-server line. PURE.
 *
 * Everything is derived from the log, and a row shows only when the match
 * captured what it needs (D8 — never a false 0):
 *   always        points by skill, opponent errors, aces, blocks, attacks
 *                 blocked, aces conceded, game flow;
 *   faults typed  attack errors (an "Opp. fault › Attack out");
 *   toss + order  serve attempts, points won on serve, side-out %,
 *                 rotation analysis, by server (SD-58);
 *   Stats to track attack attempts → efficiency, reception grades, digs,
 *                 set assists (detail.ts categories, from the rallies
 *                 captured with them on).
 * This replaces, for volleyball, the generic serve panel (MatchStatsPanel /
 * serveStats.ts, owned by the racket sports) — the same side-out figures,
 * computed here from rotation.ts.
 */
import type { LiveEvent } from '../liveEvents';
import type { VolleyballState } from './engine.ts';
import { trackCourt, serveTracked, type RallyServe } from './rotation.ts';
import { catTracked, detailTally, detailTracked, receptionTracked, acedTracked, type VbAttackLine } from './detail.ts';
import { countRow, pctRow, ratioRow, type CmpCat, type CmpRow, type Side } from '../netraid/feed.ts';

const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);
const SIDES: Side[] = ['home', 'away'];
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export type VbScope = 'all' | number;

/** One rotation of a side: the rallies played with player `id` at position I. */
export interface VbRotationRow {
  id: string;
  /** legacy, read-only: the name an older stamp stored ('' for an IDs-only
   *  one) — show `nameOf(id, name)` */
  name: string;
  played: number;
  won: number;
  /** serving rallies (a break point opportunity) and those won */
  srvPlayed: number;
  srvWon: number;
  /** receiving rallies (a side-out opportunity) and those won */
  rcvPlayed: number;
  rcvWon: number;
}

/** One server's line: rallies served, won, aces, serve errors. `name` is
 *  legacy, read-only ('' when IDs-only) — show `nameOf(id, name)`. */
export interface VbServerLine { id: string; side: Side; name: string; serves: number; won: number; aces: number; errors: number }

export interface VbMatchStats {
  cats: CmpCat[];
  /** per side, when its rotation is known for the scope (else absent) */
  rotations: Partial<Record<Side, VbRotationRow[]>>;
  servers: VbServerLine[];
  /** the scope's rallies (0 = nothing yet) */
  rallies: number;
}

interface Rally { e: LiveEvent; set: number; idx: number; r?: RallyServe }

/** The scored rallies in log order, with their set index and server. */
function ralliesOf(s: VolleyballState): Rally[] {
  const track = trackCourt(s).rallies;
  const out: Rally[] = [];
  const cnt = new Map<number, number>();
  let i = 0;
  for (const e of s.events ?? []) {
    if (!SCORED.has(e.kind ?? '') || (e.side !== 'home' && e.side !== 'away')) continue;
    const set = e.set ?? 1;
    const idx = cnt.get(set) ?? 0;
    cnt.set(set, idx + 1);
    out.push({ e, set, idx, r: track[i++] });
  }
  return out;
}

const sumLines = (m: Map<string, VbAttackLine>, side: Side) => {
  const t = { attackAttempts: 0, attackKills: 0, attackErrors: 0, attacksBlocked: 0, receptions: 0, receptionsPerfect: 0, receptionsPositive: 0, receptionErrors: 0, digs: 0, setAssists: 0 };
  for (const l of m.values()) {
    if (l.side !== side) continue;
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l[k];
  }
  return t;
};

/** The match stats for the match (`'all'`) or one set. */
export function volleyballMatchStats(s: VolleyballState, scope: VbScope = 'all'): VbMatchStats {
  const all = s?.events ? ralliesOf(s) : [];
  const rs = all.filter((x) => scope === 'all' || x.set === scope);
  const evs = (s?.events ?? []).filter((e) => scope === 'all' || e.set === scope);
  const of = (side: Side, kind: string) => rs.filter((x) => x.e.side === side && x.e.kind === kind);
  const n = (side: Side, kind: string) => of(side, kind).length;
  const cats: CmpCat[] = [];
  const H = (f: (x: Side) => number) => [f('home'), f('away')] as const;

  /* -------- scoring -------- */
  const pts = H((x) => rs.filter((r) => r.e.side === x).length);
  const atk = H((x) => n(x, 'attack'));
  const blk = H((x) => n(x, 'block'));
  const ace = H((x) => n(x, 'ace'));
  const pen = H((x) => rs.filter((r) => r.e.side === x && r.e.pen).length);
  const legacy = H((x) => rs.filter((r) => r.e.side === x && r.e.kind === 'point' && !r.e.pen).length);
  const oe = (x: Side, f: (e: LiveEvent) => boolean) => rs.filter((r) => r.e.side === x && f(r.e)).length;
  const oppSrv = H((x) => oe(x, (e) => e.kind === 'serveerror'));
  const oppErr = H((x) => oe(x, (e) => e.kind === 'opperror'));
  const typed = (s?.events ?? []).some((e) => e.kind === 'opperror' && e.oe?.type);
  const scoring: CmpRow[] = [countRow('pts', 'Points won', pts[0], pts[1])];
  if (atk[0] + atk[1] + blk[0] + blk[1] + ace[0] + ace[1] + oppSrv[0] + oppSrv[1] + oppErr[0] + oppErr[1] > 0) {
    scoring.push(
      countRow('atk', 'Attack points', atk[0], atk[1]),
      countRow('blk', 'Block points', blk[0], blk[1]),
      countRow('ace', 'Serve points (aces)', ace[0], ace[1]),
      countRow('opp', 'Opponent errors', oppSrv[0] + oppErr[0], oppSrv[1] + oppErr[1]),
      countRow('oppSrv', 'of which serve errors', oppSrv[0], oppSrv[1], { sub: true }),
    );
    if (typed) {
      const ty = (keys: string[]) => H((x) => oe(x, (e) => e.kind === 'opperror' && !!e.oe?.type && keys.includes(e.oe.type)));
      const ae = ty(['attackout']), be = ty(['blockout']), fa = ty(['net', 'foot', 'rotation', 'hits']);
      const un = H((x) => oe(x, (e) => e.kind === 'opperror' && !e.oe?.type));
      scoring.push(countRow('oppAtk', 'of which attack errors', ae[0], ae[1], { sub: true }));
      if (be[0] + be[1]) scoring.push(countRow('oppBlk', 'of which block errors', be[0], be[1], { sub: true }));
      scoring.push(countRow('oppFault', 'of which faults (net, foot, rotation, contact)', fa[0], fa[1], { sub: true }));
      if (un[0] + un[1]) scoring.push(countRow('oppUn', 'of which not described', un[0], un[1], { sub: true }));
    } else scoring.push(countRow('oppOther', 'of which attack errors & faults', oppErr[0], oppErr[1], { sub: true }));
    if (pen[0] + pen[1]) scoring.push(countRow('pen', 'Penalty points (sanctions)', pen[0], pen[1]));
    if (legacy[0] + legacy[1]) scoring.push(countRow('legacy', 'Points (how not recorded)', legacy[0], legacy[1]));
    scoring.push(pctRow('own', 'Points from own skill', atk[0] + blk[0] + ace[0], pts[0], atk[1] + blk[1] + ace[1], pts[1]));
  }
  cats.push({ id: 'scoring', title: 'Scoring', rows: scoring });

  /* -------- attack & block -------- */
  const tallyOn = !!s && detailTracked(s);
  const dt = s ? detailTally(s, scope) : new Map<string, VbAttackLine>();
  const dsum = { home: sumLines(dt, 'home'), away: sumLines(dt, 'away') };
  const attackRows: CmpRow[] = [];
  if (atk[0] + atk[1] + blk[0] + blk[1] > 0 || typed) {
    attackRows.push(countRow('kills', 'Kills', atk[0], atk[1]));
    if (typed) {
      const ae = H((x) => rs.filter((r) => r.e.side === other(x) && r.e.kind === 'opperror' && r.e.oe?.type === 'attackout').length);
      attackRows.push(countRow('attErr', 'Attack errors', ae[0], ae[1], { better: 'lower' }));
    }
    attackRows.push(countRow('stuffed', 'Attacks blocked', blk[1], blk[0], { better: 'lower' }));
    attackRows.push(countRow('blkPts', 'Block points', blk[0], blk[1]));
  }
  if (tallyOn && dsum.home.attackAttempts + dsum.away.attackAttempts > 0) {
    const d = dsum;
    attackRows.push(
      countRow('attempts', 'Attack attempts', d.home.attackAttempts, d.away.attackAttempts),
      pctRow('eff', 'Attack efficiency', d.home.attackKills - d.home.attackErrors - d.home.attacksBlocked, d.home.attackAttempts,
        d.away.attackKills - d.away.attackErrors - d.away.attacksBlocked, d.away.attackAttempts, { signed: true }),
      ratioRow('success', 'Attack success (kills ÷ attempts)', d.home.attackKills, d.home.attackAttempts, d.away.attackKills, d.away.attackAttempts),
    );
  }
  if (attackRows.length) cats.push({ id: 'attack', title: 'Attack & block', rows: attackRows, ...(tallyOn && dsum.home.attackAttempts + dsum.away.attackAttempts > 0 ? { note: 'Attempts and efficiency count the rallies scored with "Attack attempts" on.' } : {}) });

  /* -------- serve & reception (toss + rotation) -------- */
  const tracked = !!s && serveTracked(s);
  const served = rs.filter((x) => x.r?.side && !x.r.pen && !x.e.pen);
  const srv = H((x) => served.filter((r) => r.r!.side === x).length);
  const srvWon = H((x) => served.filter((r) => r.r!.side === x && r.e.side === x).length);
  const rcv = H((x) => served.filter((r) => r.r!.side === other(x)).length);
  const rcvWon = H((x) => served.filter((r) => r.r!.side === other(x) && r.e.side === x).length);
  const serveErr = H((x) => n(other(x), 'serveerror'));
  const serveRows: CmpRow[] = [countRow('aces', 'Aces', ace[0], ace[1]), countRow('srvErr', 'Serve errors', serveErr[0], serveErr[1], { better: 'lower' })];
  const unknown = rs.filter((x) => !x.e.pen).length - served.length;
  if (tracked && served.length > 0) {
    serveRows.push(
      countRow('srvAtt', 'Serve attempts', srv[0], srv[1]),
      ratioRow('srvWon', 'Points won on serve (break points)', srvWon[0], srv[0], srvWon[1], srv[1]),
      pctRow('aceRate', 'Ace %', ace[0], srv[0], ace[1], srv[1]),
      pctRow('srvErrRate', 'Serve error %', serveErr[0], srv[0], serveErr[1], srv[1], { better: 'lower' }),
    );
  }
  cats.push({ id: 'serve', title: 'Serve', rows: serveRows, ...(tracked && unknown > 0 ? { note: `Serve figures cover ${served.length} of ${served.length + unknown} rallies (the toss came later).` } : {}) });

  const recRows: CmpRow[] = [];
  if (tracked && served.length > 0) {
    recRows.push(
      ratioRow('sideOut', 'Side-out % (won on receive)', rcvWon[0], rcv[0], rcvWon[1], rcv[1]),
      countRow('received', 'Serves received', rcv[0] - serveErr[1], rcv[1] - serveErr[0]),
    );
  }
  recRows.push(countRow('acedAgainst', 'Reception errors (aces conceded)', ace[1], ace[0], { better: 'lower' }));
  if (s && (receptionTracked(s) || acedTracked(s)) && dsum.home.receptions + dsum.away.receptions > 0) {
    const d = dsum;
    recRows.push(
      countRow('graded', 'Receptions graded', d.home.receptions, d.away.receptions),
      pctRow('perfect', 'Perfect reception %', d.home.receptionsPerfect, d.home.receptions, d.away.receptionsPerfect, d.away.receptions),
      pctRow('positive', 'Positive reception %', d.home.receptionsPositive, d.home.receptions, d.away.receptionsPositive, d.away.receptions),
    );
    if (acedTracked(s)) recRows.push(pctRow('recEff', 'Reception efficiency', d.home.receptionsPerfect - d.home.receptionErrors, d.home.receptions, d.away.receptionsPerfect - d.away.receptionErrors, d.away.receptions, { signed: true }));
  }
  cats.push({ id: 'reception', title: 'Reception', rows: recRows });

  /* -------- defence & setting -------- */
  const defRows: CmpRow[] = [];
  if (s && catTracked(s, 'dig')) defRows.push(countRow('digs', 'Digs', dsum.home.digs, dsum.away.digs));
  if (s && catTracked(s, 'assist')) defRows.push(countRow('assists', 'Set assists (sets to a kill)', dsum.home.setAssists, dsum.away.setAssists));
  if (defRows.length) cats.push({ id: 'defence', title: 'Defence & setting', rows: defRows });

  /* -------- game flow -------- */
  const flow = gameFlow(rs, s);
  const flowRows: CmpRow[] = [
    countRow('run', 'Most points in a row', flow.run.home, flow.run.away),
    countRow('lead', 'Biggest lead', flow.lead.home, flow.lead.away),
  ];
  if (flow.saved.home + flow.saved.away > 0) flowRows.push(countRow('saved', 'Set points saved', flow.saved.home, flow.saved.away));
  const tos = H((x) => evs.filter((e) => e.kind === 'timeout' && e.side === x).length);
  if (tos[0] + tos[1]) flowRows.push(countRow('timeouts', 'Timeouts used', tos[0], tos[1], { better: 'lower' }));
  const subs = H((x) => (s?.subs ?? []).filter((y) => y.side === x && (scope === 'all' || y.set === scope) && y.kind !== 'libero').length);
  if (subs[0] + subs[1]) flowRows.push(countRow('subs', 'Substitutions', subs[0], subs[1], { better: 'lower' }));
  cats.push({ id: 'flow', title: 'Game flow', rows: flowRows, ...(rs.length ? { note: `Times tied ${flow.ties} · lead changes ${flow.changes}` } : {}) });

  /* -------- rotation analysis + by server -------- */
  const rotations: Partial<Record<Side, VbRotationRow[]>> = {};
  for (const X of SIDES) {
    const rows = new Map<string, VbRotationRow>();
    let known = 0;
    for (const x of served) {
      const p = x.r?.atI?.[X];
      if (!p) continue;
      known += 1;
      const row = rows.get(p.id) ?? rows.set(p.id, { id: p.id, name: p.name ?? '', played: 0, won: 0, srvPlayed: 0, srvWon: 0, rcvPlayed: 0, rcvWon: 0 }).get(p.id)!;
      const won = x.e.side === X;
      row.played += 1; if (won) row.won += 1;
      if (x.r!.side === X) { row.srvPlayed += 1; if (won) row.srvWon += 1; } else { row.rcvPlayed += 1; if (won) row.rcvWon += 1; }
    }
    if (known > 0) rotations[X] = [...rows.values()];
  }
  const servers = new Map<string, VbServerLine>();
  for (const x of served) {
    if (!x.r?.serverId) continue;
    const id = x.r.serverId;
    const line = servers.get(id) ?? servers.set(id, { id, side: x.r.side!, name: x.r.serverName ?? '', serves: 0, won: 0, aces: 0, errors: 0 }).get(id)!;
    line.serves += 1;
    if (x.e.side === line.side) line.won += 1;
    if (x.e.kind === 'ace' && x.e.side === line.side) line.aces += 1;
    if (x.e.kind === 'serveerror' && x.e.side !== line.side) line.errors += 1;
  }
  return { cats: cats.filter((c) => c.rows.length > 0), rotations, servers: [...servers.values()], rallies: rs.length };
}

/** Runs, leads, ties, lead changes and set (or match) points saved over the
 *  scope's rallies. */
function gameFlow(rs: Rally[], s: VolleyballState): {
  run: Record<Side, number>; lead: Record<Side, number>; saved: Record<Side, number>; ties: number; changes: number;
} {
  const run = { home: 0, away: 0 }, lead = { home: 0, away: 0 }, saved = { home: 0, away: 0 };
  let ties = 0, changes = 0;
  let set = 0, h = 0, a = 0, rs0: Side | null = null, rn = 0, leader: Side | null = null;
  for (const x of rs) {
    if (x.set !== set) { set = x.set; h = 0; a = 0; rs0 = null; rn = 0; leader = null; }
    const side = x.e.side as Side;
    const decider = s.setsToWin > 1 && set === s.setsToWin * 2 - 1;
    const t = decider ? s.deciderTarget : s.target;
    const m = (s.winByTwo ?? true) ? 2 : 1;
    for (const X of SIDES) {
      const xs = (X === 'home' ? h : a) + 1, ys = X === 'home' ? a : h;
      if (xs >= t && xs - ys >= m && side !== X) saved[side] += 1; // X had set point; `side` saved it
    }
    if (side === 'home') h += 1; else a += 1;
    rn = rs0 === side ? rn + 1 : 1; rs0 = side;
    run[side] = Math.max(run[side], rn);
    if (h > a) lead.home = Math.max(lead.home, h - a);
    if (a > h) lead.away = Math.max(lead.away, a - h);
    if (h === a) ties += 1;
    const now: Side | null = h > a ? 'home' : a > h ? 'away' : null;
    if (now && leader && now !== leader) changes += 1;
    if (now) leader = now;
  }
  return { run, lead, saved, ties, changes };
}
