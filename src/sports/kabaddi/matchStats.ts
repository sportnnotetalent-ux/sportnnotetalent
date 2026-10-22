/**
 * Deep wave (volleyball-kabaddi) — kabaddi's broadcast match stats, the PKL
 * match-centre way: team vs team by category (points, raiding, defending,
 * all-outs, discipline, skills, game flow), for the match or one half, plus
 * each team's top raider / defender. PURE.
 *
 * Built on SD-41's `kabaddiMatchCentre` (points split, raids, strike rates,
 * super raids / tackles, do-or-die, all-outs) with the rest of the PKL card
 * derived from the same raid replay: touch / bonus split, not-out %, super
 * tackle chances (raids faced with 3 or fewer defenders) and conversions,
 * line-outs, technical points / cards, raid and tackle skills (when the match
 * described them), runs and lead changes. A row shows only when the match can
 * give it (D8): an old one-tap match has no raid counts.
 */
import type { KabaddiState, RaidEntry } from './engine.ts';
import { extrasOf, isShootoutEvent, perRaidByIndex, replayOf, raidSkillLabel, RAID_SKILLS, TACKLE_TYPES, tackleTypeLabel } from './engine.ts';
import type { RaidBreakdown } from './rules.ts';
import { kabaddiMatchCentre, kabaddiTouchedTracked, unsuccessfulTacklers } from './totals.ts';
import { countRow, pctRow, ratioRow, type CmpCat, type CmpRow, type Side } from '../netraid/feed.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const SCORING = new Set(['raid', 'tackle', 'allout', 'tech', 'lineout']);

export type KbScope = 'all' | number;

export interface KbLeader { name: string; pts: number; note?: string }
export interface KabaddiMatchStats {
  cats: CmpCat[];
  /** top raider / defender per team in the scope */
  leaders: Record<Side, { raider?: KbLeader; defender?: KbLeader }>;
  /** regulation moments in the scope (0 = nothing yet) */
  moments: number;
}

/** In-scope raids with their replay. */
function scoped(s: KabaddiState, scope: KbScope): { r: RaidEntry; b: RaidBreakdown }[] {
  const per = perRaidByIndex(replayOf(s));
  return (s.raids ?? []).flatMap((r, i) => (per[i] && !r.hidden && (scope === 'all' || r.half === scope) ? [{ r, b: per[i] }] : []));
}

export function kabaddiMatchStats(s: KabaddiState, scope: KbScope = 'all'): KabaddiMatchStats {
  const c = kabaddiMatchCentre(s, scope);
  const rs = scoped(s, scope);
  const H = (f: (x: Side) => number) => [f('home'), f('away')] as const;
  const evs = (s.events ?? []).filter((e) => !isShootoutEvent(e) && (scope === 'all' || e.half === scope));
  const cats: CmpCat[] = [];

  /* ------------- points ------------- */
  const total = H((x) => c[x].raidPoints + c[x].tacklePoints + c[x].allOutPoints + c[x].extraPoints);
  const touch = H((x) => rs.filter((y) => y.r.side === x).reduce((t, y) => t + y.b.touchPts, 0));
  const bonus = H((x) => rs.filter((y) => y.r.side === x).reduce((t, y) => t + y.b.bonusPts, 0));
  const evPts = (x: Side, kind: string) => evs.filter((e) => e.side === x && e.kind === kind).reduce((t, e) => t + (e.points ?? 0), 0);
  const techPts = H((x) => evPts(x, 'tech'));
  const linePts = H((x) => evPts(x, 'lineout'));
  const points: CmpRow[] = [
    countRow('total', 'Total points', total[0], total[1]),
    countRow('raid', 'Raid points', c.home.raidPoints, c.away.raidPoints),
  ];
  if (c.countsTracked) {
    points.push(countRow('touch', 'of which touch points', touch[0], touch[1], { sub: true }));
    points.push(countRow('bonus', 'of which bonus points', bonus[0], bonus[1], { sub: true }));
  }
  points.push(
    countRow('tackle', 'Tackle points', c.home.tacklePoints, c.away.tacklePoints),
    countRow('allout', 'All-out points', c.home.allOutPoints, c.away.allOutPoints),
    countRow('extra', 'Extra points', c.home.extraPoints, c.away.extraPoints),
  );
  if (techPts[0] + techPts[1]) points.push(countRow('techPts', 'of which technical points', techPts[0], techPts[1], { sub: true }));
  if (linePts[0] + linePts[1]) points.push(countRow('linePts', 'of which line-outs', linePts[0], linePts[1], { sub: true }));
  cats.push({ id: 'points', title: 'Points', rows: points });

  if (c.countsTracked) {
    /* ------------- raiding ------------- */
    const dodPts = H((x) => rs.filter((y) => y.r.side === x && y.b.doOrDie).reduce((t, y) => t + y.b.raidPts, 0));
    const raiding: CmpRow[] = [
      countRow('raids', 'Total raids', c.home.raids, c.away.raids),
      ratioRow('success', 'Successful raids (strike rate)', c.home.successfulRaids, c.home.raids, c.away.successfulRaids, c.away.raids),
      countRow('out', 'Unsuccessful raids (raider out)', c.home.raidsOut, c.away.raidsOut, { better: 'lower' }),
      countRow('empty', 'Empty raids', c.home.emptyRaids, c.away.emptyRaids, { better: 'lower' }),
      pctRow('notOut', 'Not-out %', c.home.raids - c.home.raidsOut, c.home.raids, c.away.raids - c.away.raidsOut, c.away.raids),
      countRow('superRaids', 'Super raids (3+ points)', c.home.superRaids, c.away.superRaids),
    ];
    if (c.home.doOrDieRaids + c.away.doOrDieRaids > 0) {
      raiding.push(
        ratioRow('dod', 'Do-or-die raids won', c.home.doOrDieWon, c.home.doOrDieRaids, c.away.doOrDieWon, c.away.doOrDieRaids),
        countRow('dodPts', 'Do-or-die points', dodPts[0], dodPts[1]),
      );
    }
    cats.push({ id: 'raiding', title: 'Raiding', rows: raiding });

    /* ------------- defending ------------- */
    // a side's super-tackle chances: the opponent's raids it faced with ≤ 3 on the mat
    const chances = H((x) => rs.filter((y) => y.r.side === other(x) && y.b.stChance).length);
    const lineOuts = H((x) => rs.filter((y) => y.r.side === other(x)).reduce((t, y) => t + (y.b.defOutPts ?? 0), 0));
    const defending: CmpRow[] = [
      countRow('tklAtt', 'Tackle attempts', c.home.tackleAttempts, c.away.tackleAttempts),
      ratioRow('tkl', 'Successful tackles (strike rate)', c.home.tackles, c.home.tackleAttempts, c.away.tackles, c.away.tackleAttempts),
      countRow('superTackles', 'Super tackles', c.home.superTackles, c.away.superTackles),
    ];
    if (chances[0] + chances[1] > 0) defending.push(ratioRow('stChance', 'Super tackle chances taken', c.home.superTackles, chances[0], c.away.superTackles, chances[1]));
    if (lineOuts[0] + lineOuts[1] > 0) defending.push(countRow('lineOuts', 'Defenders stepped out (line-outs)', lineOuts[0], lineOuts[1], { better: 'lower' }));
    // round 2 — "Defenders touched" tracked: each named defender touched by a
    // raider who got back is an unsuccessful tackle (totals.ts)
    let note = 'Tackle attempts = successful tackles + raids that touched and got back.';
    if (kabaddiTouchedTracked(s)) {
      const unsucc = H((x) => rs.filter((y) => y.r.side === other(x)).reduce((t, y) => t + unsuccessfulTacklers(y.r, y.b).length, 0));
      defending.push(countRow('unsuccTkl', 'Unsuccessful tackles (defenders named)', unsucc[0], unsucc[1], { better: 'lower' }));
      const back = rs.filter((y) => !y.b.raiderOut && y.b.touchPts > 0);
      const named = back.filter((y) => unsuccessfulTacklers(y.r, y.b).length > 0).length;
      note += ` Unsuccessful tackles = defenders named as touched by a raider who got back (${named} of ${back.length} such raid${back.length === 1 ? '' : 's'} named them).`;
    }
    cats.push({ id: 'defending', title: 'Defending', rows: defending, note });

    /* ------------- all-outs ------------- */
    cats.push({ id: 'allouts', title: 'All-outs', rows: [
      countRow('inflicted', 'All-outs inflicted', c.home.allOuts, c.away.allOuts),
      countRow('conceded', 'All-outs conceded', c.home.allOutsConceded, c.away.allOutsConceded, { better: 'lower' }),
    ] });
  }

  /* ------------- discipline ------------- */
  const ex = extrasOf(s).filter((x) => scope === 'all' || x.half === scope);
  if (ex.length) {
    const cards = (x: Side, col: string) => ex.filter((e) => e.x === 'card' && e.side === x && e.card === col).length;
    const techAgainst = H((x) => evs.filter((e) => e.kind === 'tech' && e.side === other(x)).reduce((t, e) => t + (e.points ?? 0), 0));
    const disc: CmpRow[] = [countRow('techAgainst', 'Technical points conceded', techAgainst[0], techAgainst[1], { better: 'lower' })];
    for (const col of ['green', 'yellow', 'red'] as const) {
      const v = H((x) => cards(x, col));
      if (v[0] + v[1]) disc.push(countRow(col, `${col[0].toUpperCase()}${col.slice(1)} cards`, v[0], v[1], { better: 'lower' }));
    }
    cats.push({ id: 'discipline', title: 'Discipline', rows: disc });
  }

  /* ------------- skills (described raids / tackles) ------------- */
  const skilled = rs.filter((y) => y.r.sk);
  const typed = rs.filter((y) => y.r.tt && y.b.raiderOut && !y.b.doOrDieFail && !y.b.lineOut);
  if (skilled.length || typed.length) {
    const rows: CmpRow[] = [];
    for (const k of RAID_SKILLS) {
      const v = H((x) => skilled.filter((y) => y.r.side === x && y.r.sk === k.key).reduce((t, y) => t + (k.key === 'escape' ? 1 : y.b.raidPts), 0));
      if (v[0] + v[1]) rows.push(countRow(`sk_${k.key}`, k.key === 'escape' ? 'Escapes (raids)' : `${raidSkillLabel(k.key)} (points)`, v[0], v[1]));
    }
    for (const k of TACKLE_TYPES) {
      const v = H((x) => typed.filter((y) => y.r.side === other(x) && y.r.tt === k.key).length);
      if (v[0] + v[1]) rows.push(countRow(`tt_${k.key}`, `${tackleTypeLabel(k.key)} (tackles)`, v[0], v[1]));
    }
    const ok = rs.filter((y) => y.b.raidPts > 0).length;
    const tk = rs.filter((y) => y.b.raiderOut && !y.b.doOrDieFail && !y.b.lineOut).length;
    if (rows.length) cats.push({ id: 'skills', title: 'Skills', rows, note: `From the raids described: ${skilled.length} raid skill${skilled.length === 1 ? '' : 's'} of ${ok} successful raids, ${typed.length} tackle skill${typed.length === 1 ? '' : 's'} of ${tk} tackles.` });
  }

  /* ------------- game flow ------------- */
  const flow = gameFlow(s, scope);
  const tos = H((x) => evs.filter((e) => e.kind === 'timeout' && e.side === x).length);
  const subs = H((x) => evs.filter((e) => e.kind === 'sub' && e.side === x).length);
  const flowRows: CmpRow[] = [
    countRow('lead', 'Biggest lead', flow.lead.home, flow.lead.away),
    countRow('run', 'Most points in a row', flow.run.home, flow.run.away),
  ];
  if (tos[0] + tos[1]) flowRows.push(countRow('timeouts', 'Timeouts used', tos[0], tos[1], { better: 'lower' }));
  if (subs[0] + subs[1]) flowRows.push(countRow('subs', 'Substitutions', subs[0], subs[1]));
  cats.push({ id: 'flow', title: 'Game flow', rows: flowRows, ...(flow.moments ? { note: `Lead changes ${flow.changes} · scores level ${flow.ties} times` } : {}) });

  /* ------------- team leaders ------------- */
  const leaders: KabaddiMatchStats['leaders'] = { home: {}, away: {} };
  for (const X of ['home', 'away'] as Side[]) {
    const rp = new Map<string, number>(), tp = new Map<string, number>();
    for (const { r, b } of rs) {
      if (r.side === X && r.raider && b.raidPts) rp.set(r.raider, (rp.get(r.raider) ?? 0) + b.raidPts);
      if (r.side === other(X) && r.tackler && b.raiderOut && !b.doOrDieFail && !b.lineOut) tp.set(r.tackler, (tp.get(r.tackler) ?? 0) + b.tacklePts);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const r1 = top(rp), t1 = top(tp);
    if (r1) leaders[X].raider = { name: r1[0], pts: r1[1], ...(r1[1] >= 10 ? { note: 'Super 10' } : {}) };
    if (t1) leaders[X].defender = { name: t1[0], pts: t1[1], ...(t1[1] >= 5 ? { note: 'High 5' } : {}) };
  }
  return { cats, leaders, moments: flow.moments };
}

/** Biggest lead, longest scoring run (points in a row), lead changes and
 *  times level, from the regulation timeline in order. */
function gameFlow(s: KabaddiState, scope: KbScope): { lead: Record<Side, number>; run: Record<Side, number>; changes: number; ties: number; moments: number } {
  const lead = { home: 0, away: 0 }, run = { home: 0, away: 0 };
  let h = 0, a = 0, changes = 0, ties = 0, moments = 0, leader: Side | null = null, rs: Side | null = null, rn = 0;
  for (const e of [...(s.events ?? [])].sort((x, y) => x.id - y.id)) {
    if (!e.side || !e.points || isShootoutEvent(e) || !SCORING.has(e.kind ?? '')) continue;
    const inScope = scope === 'all' || e.half === scope;
    if (e.side === 'home') h += e.points; else a += e.points;
    if (!inScope) continue;
    moments += 1;
    rn = rs === e.side ? rn + e.points : e.points; rs = e.side;
    run[e.side] = Math.max(run[e.side], rn);
    if (h > a) lead.home = Math.max(lead.home, h - a);
    if (a > h) lead.away = Math.max(lead.away, a - h);
    const now: Side | null = h > a ? 'home' : a > h ? 'away' : null;
    if (now === null) ties += 1;
    if (now && leader && now !== leader) changes += 1;
    if (now) leader = now;
  }
  return { lead, run, changes, ties, moments };
}
