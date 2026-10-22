/**
 * Deep wave — shooting results commentary and stats (ISSF depth), DERIVED
 * from the stored series / shots, so a correction rewrites them. Pure.
 *
 *  - qualification / match: series by series — each shooter's series and
 *    running total with their place (small fields), the best series, the
 *    leader and the margin, perfect series, penalties, the standings at the end;
 *  - elimination final: shot by shot — every finalist's shot, the leader and
 *    the margin, shoot-offs, eliminations with place and score, the podium;
 *  - mixed team medal matches: series by series with the 2-1-0 points;
 *  - stats: best / worst series, spread, average series, position totals
 *    (3 positions), shot distribution (shot by shot), perfect series, lead
 *    changes; in a final the average shot, 10.0+ shots and the place after
 *    every elimination.
 */
import type { DisciplineDef, ResultEntry } from './model.ts';
import { rankEntries } from './rank.ts';
import { finalState, isFinalRows } from './shootingRank.ts';
import { isShootMatchRows, shootMatchState } from './shootMatch.ts';
import { positionOf, seriesCount, shootEventOf, sumTenths, fromTenths, finalPenaltyTotal, netFinalShots, POSITION_LABEL, type Position, type ShootEventDef } from './shootingDefs.ts';
import { netSeries, perfectSeries, penaltyTotal, scoreText, totalText } from './shooting.ts';
import { FeedBuilder, MEDAL_ICON, ordinalOf, placesOf, type FeedItem } from './insightFeed.ts';

const competing = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');
/** a team of 3 ranked on its members' scores has no series of its own to comment on */
const ownSeries = (e: ResultEntry) => !e.result?.ms?.length && (e.result?.series?.length ?? 0) > 0;

/** First names, or the whole name where two finalists share a first name. */
export function shortNames(entries: ResultEntry[]): Map<string, string> {
  const firsts = entries.map((e) => e.name.split(' ')[0]);
  return new Map(entries.map((e, i) => [e.id, firsts.filter((f) => f === firsts[i]).length > 1 ? e.name : firsts[i]]));
}

/** The chip label of series `i`: "S4", or "K2" / "P1" / "S2" in 3 positions. */
export function seriesTag(ev: ShootEventDef, shots: number, i: number): string {
  const p = positionOf(ev, shots, i);
  if (!p) return `S${i + 1}`;
  const per = Math.max(1, Math.round(seriesCount(ev, shots) / (ev.positions?.length ?? 1)));
  return `${p}${(i % per) + 1}`;
}

/* --------------------------------- the feed -------------------------------- */

/**
 * The phase's commentary, newest first: an elimination final, the mixed team
 * medal matches, or the qualification / match series. `shots` = the match
 * length (the category's shorter match, or the event's). Shooters' own lines
 * for each series only up to `perShooterMax` shooters (a big field gets the
 * series summary, perfect series and penalties).
 */
export function shootFeed(entries: ResultEntry[], def: DisciplineDef, shots: number, perShooterMax = 12): FeedItem[] {
  const ev = shootEventOf(def.key);
  if (!ev) return [];
  if (isFinalRows(entries)) return finalFeed(entries, ev);
  if (isShootMatchRows(entries)) return matchFeed(entries, ev);
  return seriesFeed(entries, def, ev, shots, perShooterMax);
}

function seriesFeed(entries: ResultEntry[], def: DisciplineDef, ev: ShootEventDef, shots: number, perShooterMax: number): FeedItem[] {
  const rows = entries.filter((e) => competing(e) && ownSeries(e));
  if (!rows.length) return [];
  const fb = new FeedBuilder();
  const int = ev.scoring === 'integer';
  const n = Math.max(...rows.map((e) => e.result.series!.length));
  const per = (i: number) => Math.max(1, Math.min(ev.seriesOf, shots - i * ev.seriesOf));
  const perfectAt = (v: number, i: number) => ev.scoring !== 'decimal' && v === per(i) * (ev.scoring === 'hits' ? 1 : 10);
  let lead: string | undefined;
  for (let i = 0; i < n; i++) {
    const here = rows.filter((e) => e.result.series!.length > i);
    const cum = (e: ResultEntry) => sumTenths(netSeries(e.result).slice(0, i + 1));
    const cumX = (e: ResultEntry) => (e.result.seriesX ?? []).slice(0, i + 1).reduce((a: number, x) => a + (x ?? 0), 0);
    const sorted = [...here].sort((a, b) => cum(b) - cum(a) || (int ? cumX(b) - cumX(a) : 0));
    const pl = placesOf(sorted, (a, b) => cum(a) === cum(b) && (!int || cumX(a) === cumX(b)));
    const place = new Map(sorted.map((e, j) => [e.id, pl[j]]));
    const tag = seriesTag(ev, shots, i);
    const one = (e: ResultEntry) => {
      const v = e.result.series![i], x = e.result.seriesX?.[i], p = e.result.pen?.[i];
      return `${scoreText(v, ev.scoring)}${int && x ? `-${x}x` : ''}${p ? ` (−${p} penalty)` : ''}`;
    };
    const small = here.length <= perShooterMax;
    for (const e of [...here].sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99))) {
      const v = e.result.series![i];
      const perfect = perfectAt(v, i);
      const p = e.result.pen?.[i];
      if (small) {
        const at = place.get(e.id)!;
        fb.push(`${e.name} ${one(e)} — ${totalText(fromTenths(cum(e)), int ? cumX(e) : undefined, ev.scoring)} after ${i + 1} (${at.tie ? '=' : ''}${ordinalOf(at.place)})`, { tag, tone: perfect ? 'good' : p ? 'bad' : undefined });
      } else if (p) fb.push(`${e.name}: −${p} penalty in series ${i + 1}`, { tag, tone: 'bad' });
      if (perfect) fb.push(`Perfect series — ${e.name} ${scoreText(v, ev.scoring)}`, { tag, tone: 'good' });
    }
    const top = Math.max(...here.map((e) => e.result.series![i]));
    const bestBy = here.filter((e) => e.result.series![i] === top).map((e) => e.name);
    const leader = sorted[0], second = sorted[1];
    const margin = second ? cum(leader) - cum(second) : 0;
    const pos = positionOf(ev, shots, i);
    fb.push(
      `Series ${i + 1}${pos ? ` (${POSITION_LABEL[pos].toLowerCase()})` : ''} — best ${bestBy.join(', ')} ${scoreText(top, ev.scoring)}; ${pl[0].tie ? 'level at the top' : `${leader.name} leads`} on ${totalText(fromTenths(cum(leader)), int ? cumX(leader) : undefined, ev.scoring)}${second && !pl[0].tie ? ` (+${scoreText(margin / 10, ev.scoring)})` : ''}`,
      { tag, tone: 'info' },
    );
    if (!pl[0].tie && leader.id !== lead) {
      if (lead) fb.push(`${leader.name} takes the lead`, { tag, tone: 'lead' });
      lead = leader.id;
    }
  }
  const full = seriesCount(ev, shots);
  const all = entries.filter(competing).filter((e) => !e.result.ms?.length);
  if (all.length && all.every((e) => (e.result.series?.length ?? 0) >= full)) {
    const top = rankEntries(entries, def).filter((r) => r.position != null && r.position <= 3);
    if (top.length) fb.push(`Match complete — ${top.map((r) => `${r.label}. ${r.entry.name} ${totalText(r.entry.result.mark, int ? r.entry.result.xs : undefined, ev.scoring)}`).join(' · ')}`, { tone: 'lead' });
  }
  return fb.newestFirst();
}

function finalFeed(entries: ResultEntry[], ev: ShootEventDef): FeedItem[] {
  const field = entries.filter(competing);
  const fb = new FeedBuilder();
  const st = finalState(entries, ev);
  const short = shortNames(field);
  const outAfter = new Map(st.out.map((o) => [o.id, o.after]));
  const maxFired = Math.max(0, ...field.map((e) => e.result.fshots?.length ?? 0));
  const t1 = (v: number) => v.toFixed(1);
  let lead: string | undefined;
  for (let k = 1; k <= maxFired; k++) {
    const inK = field.filter((e) => (e.result.fshots?.length ?? 0) >= k && !((outAfter.get(e.id) ?? Infinity) < k));
    if (!inK.length) continue;
    // round 2: totals net of final penalties (the shot as fired is still shown)
    const tot = (e: ResultEntry) => sumTenths(netFinalShots(e.result).slice(0, k));
    const sorted = [...inK].sort((a, b) => tot(b) - tot(a) || (a.result.order ?? 99) - (b.result.order ?? 99));
    const top = Math.max(...inK.map((e) => e.result.fshots![k - 1]));
    const bestBy = inK.filter((e) => e.result.fshots![k - 1] === top).map((e) => short.get(e.id)!);
    const leader = sorted[0], second = sorted[1];
    const level = !!second && tot(second) === tot(leader);
    const margin = second ? tot(leader) - tot(second) : 0;
    fb.push(
      `Best ${bestBy.join(', ')} ${t1(top)} · ${level ? 'level at the top on' : `${leader.name} leads on`} ${t1(fromTenths(tot(leader)))}${second && !level ? ` (+${t1(margin / 10)})` : ''}`,
      { tag: `Shot ${k}`, tone: 'info', detail: sorted.map((e) => `${short.get(e.id)} ${t1(e.result.fshots![k - 1])}`).join(' · ') },
    );
    // round 2: a penalty given on this shot
    for (const e of inK) {
      const p = e.result.fpen?.[k - 1];
      if (p) fb.push(`Penalty — ${e.name} −${p} on shot ${k} (${t1(e.result.fshots![k - 1])} counts ${t1(netFinalShots(e.result)[k - 1])})`, { tag: `Shot ${k}`, tone: 'bad' });
    }
    if (!level && leader.id !== lead) {
      if (lead) fb.push(`${leader.name} takes the lead`, { tag: `Shot ${k}`, tone: 'lead' });
      lead = leader.id;
    }
    const so = field.filter((e) => e.result.so?.[String(k)]?.length);
    if (so.length) fb.push(`Shoot-off ${k === st.last ? 'for gold' : `after shot ${k}`}: ${so.map((e) => `${e.name} ${e.result.so![String(k)].map(t1).join(', ')}`).join(' v ')}`, { tag: `Shot ${k}`, tone: 'info' });
    for (const o of st.out.filter((x) => x.after === k)) {
      const e = field.find((x) => x.id === o.id)!;
      fb.push(`${e.name} eliminated — ${ordinalOf(o.place)} (${t1((st.totals.get(o.id) ?? 0) / 10)})`, { tag: `Shot ${k}`, tone: 'bad' });
    }
  }
  if (st.shootOff) fb.push(`Shoot-off needed ${st.shootOff.after === st.last ? 'for gold' : `after shot ${st.shootOff.after}`}: ${st.shootOff.ids.map((id) => field.find((e) => e.id === id)?.name ?? '').join(' and ')} (round ${st.shootOff.round})`, { tone: 'lead' });
  if (st.done) {
    const podium = [...st.places].filter(([, p]) => p.place <= 3).sort((a, b) => a[1].place - b[1].place);
    if (podium.length) fb.push(podium.map(([id, p]) => `${MEDAL_ICON[p.place]} ${field.find((e) => e.id === id)?.name ?? ''} ${t1((st.totals.get(id) ?? 0) / 10)}`).join(' · '), { tone: 'medal', tag: 'Result' });
  }
  return fb.newestFirst();
}

function matchFeed(entries: ResultEntry[], ev: ShootEventDef): FeedItem[] {
  const fb = new FeedBuilder();
  const st = shootMatchState(entries);
  const name = (id?: string) => entries.find((e) => e.id === id)?.name ?? '';
  const sc = (v: number) => scoreText(v, ev.scoring);
  for (const m of st.matches) {
    const what = m.key === 'G' ? 'gold' : 'bronze';
    const tag = m.key === 'G' ? 'Gold' : 'Bronze';
    if (!m.out) {
      if (m.winner && m.decided) fb.push(`${name(m.winner)} take ${what} — no opponent`, { tag, tone: 'medal' });
      continue;
    }
    if (m.out.walkover) { if (m.winner) fb.push(`${name(m.winner)} take ${what} — walkover`, { tag, tone: 'medal' }); continue; }
    let pa = 0, pb = 0;
    m.out.series.forEach((s, k) => {
      pa += s.pa; pb += s.pb;
      const who = s.pa === 2 ? name(m.a) : s.pb === 2 ? name(m.b) : 'points shared';
      fb.push(`${name(m.a)} ${sc(s.a)} v ${name(m.b)} ${sc(s.b)} — ${who}${s.pa === 1 ? '' : ' 2 points'} · ${pa}–${pb}`, { tag: `${tag} S${k + 1}`, tone: 'info' });
    });
    if (m.out.soWon) fb.push(`Shoot-off decides it (round ${m.out.soWon})`, { tag, tone: 'lead' });
    if (m.decided && m.winner) fb.push(`${name(m.winner)} win ${what} ${m.winner === m.a ? `${m.out.a}–${m.out.b}` : `${m.out.b}–${m.out.a}`}`, { tag, tone: 'medal' });
  }
  return fb.newestFirst();
}

/* ---------------------------------- stats ---------------------------------- */

export interface ShotDistribution { label: string; n: number }
export interface ShotStats {
  /** shots entered one by one */
  n: number;
  avg: number;
  /** shots of 10 or better (decimal 10.0+; integer 10 or X) */
  tens: number;
  /** integer: inner tens (X); decimal: 10.5 and over */
  top: number;
  low: number;
  dist: ShotDistribution[];
}
export interface ShooterSeriesStats {
  id: string; name: string;
  place?: number;
  series: number[];
  /** net of penalties */
  total: number;
  xs?: number;
  best: number; worst: number; avg: number; spread: number;
  perfect: number;
  pen: number;
  /** 3 positions: kneeling / prone / standing totals */
  byPos?: { pos: Position; total: number }[];
  /** when every series was entered shot by shot */
  shots?: ShotStats;
}
export interface ShootSeriesStats {
  kind: 'series';
  shooters: ShooterSeriesStats[];
  bestSeries?: { names: string[]; value: number; index: number };
  perfect: number;
  penalties: number;
  leadChanges: number;
}
export interface FinalistStats {
  id: string; name: string;
  place?: number;
  /** shots that count (to the elimination, or all) */
  shots: number;
  total: number; avg: number; best: number;
  /** 10.0 or better */
  tens: number;
  /** place after each checkpoint (null = out by then / not fired yet) */
  ranks: (number | null)[];
  /** round 2: penalty points given in the final (counted shots) — only when there was one */
  pen?: number;
}
export interface ShootFinalStats {
  kind: 'final';
  /** the elimination points (and the last shot) */
  checkpoints: number[];
  finalists: FinalistStats[];
  leadChanges: number;
  bestShot?: { names: string[]; value: number };
  /** round 2: penalty points given in the final, all finalists — only when there was one */
  penalties?: number;
}

function shotStats(shots: (number | 'X')[], decimal: boolean): ShotStats {
  const vals = shots.map((v) => (v === 'X' ? 10 : v));
  const n = vals.length;
  const avg = n ? Math.round((fromTenths(sumTenths(vals)) / n) * 100) / 100 : 0;
  const tens = vals.filter((v) => v >= 10).length;
  const top = decimal ? vals.filter((v) => v >= 10.5).length : shots.filter((v) => v === 'X').length;
  const low = n ? Math.min(...vals) : 0;
  const dist: ShotDistribution[] = decimal
    ? [['10.5+', (v: number) => v >= 10.5], ['10.0–10.4', (v: number) => v >= 10 && v < 10.5], ['9.x', (v: number) => v >= 9 && v < 10], ['8.x', (v: number) => v >= 8 && v < 9], ['≤7.9', (v: number) => v < 8]].map(([label, f]) => ({ label: label as string, n: vals.filter(f as (v: number) => boolean).length }))
    : [{ label: 'X', n: shots.filter((v) => v === 'X').length }, { label: '10', n: shots.filter((v) => v === 10).length }, { label: '9', n: vals.filter((v) => v === 9).length }, { label: '8', n: vals.filter((v) => v === 8).length }, { label: '7', n: vals.filter((v) => v === 7).length }, { label: '≤6', n: vals.filter((v) => v <= 6).length }];
  return { n, avg, tens, top, low, dist };
}

/** The phase's stats (null for a phase with nothing to show). */
export function shootStats(entries: ResultEntry[], def: DisciplineDef, shots: number): ShootSeriesStats | ShootFinalStats | null {
  const ev = shootEventOf(def.key);
  if (!ev) return null;
  if (isShootMatchRows(entries)) return null;
  if (isFinalRows(entries)) return finalStats(entries, ev);
  const rows = entries.filter((e) => competing(e) && ownSeries(e));
  if (!rows.length) return null;
  const ranked = rankEntries(entries, def);
  const placeOf = new Map(ranked.map((r) => [r.id, r.position ?? undefined]));
  const int = ev.scoring === 'integer';
  const shooters: ShooterSeriesStats[] = rows.map((e) => {
    const r = e.result;
    const raw = r.series!;
    const net = netSeries(r);
    const best = Math.max(...raw), worst = Math.min(...raw);
    const out: ShooterSeriesStats = {
      id: e.id, name: e.name, place: placeOf.get(e.id), series: raw, total: r.mark ?? fromTenths(sumTenths(net)), ...(int ? { xs: r.xs ?? 0 } : {}),
      best, worst, spread: fromTenths(Math.round(best * 10) - Math.round(worst * 10)), avg: Math.round((fromTenths(sumTenths(net)) / net.length) * 10) / 10,
      perfect: perfectSeries(r, ev, shots), pen: penaltyTotal(r),
    };
    if (ev.positions) {
      const by = new Map<Position, number>();
      net.forEach((v, i) => { const p = positionOf(ev, shots, i); if (p) by.set(p, (by.get(p) ?? 0) + Math.round(v * 10)); });
      out.byPos = ev.positions.filter((p) => by.has(p)).map((p) => ({ pos: p, total: fromTenths(by.get(p)!) }));
    }
    const sh = r.shots ?? [];
    if (sh.length === raw.length && sh.every((x) => x?.length)) out.shots = shotStats(sh.flat(), ev.scoring === 'decimal');
    return out;
  }).sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || b.total - a.total);
  let bestSeries: ShootSeriesStats['bestSeries'];
  for (const e of rows) e.result.series!.forEach((v, i) => {
    if (!bestSeries || v > bestSeries.value) bestSeries = { names: [e.name], value: v, index: i };
    else if (v === bestSeries.value && !bestSeries.names.includes(e.name)) bestSeries.names.push(e.name);
  });
  // lead changes after each series (a level top doesn't change it)
  let leadChanges = 0, lead: string | undefined;
  const n = Math.max(...rows.map((e) => e.result.series!.length));
  for (let i = 0; i < n; i++) {
    const here = rows.filter((e) => e.result.series!.length > i);
    const cum = (e: ResultEntry) => sumTenths(netSeries(e.result).slice(0, i + 1)) * 1000 + (int ? (e.result.seriesX ?? []).slice(0, i + 1).reduce((a: number, x) => a + (x ?? 0), 0) : 0);
    const sorted = [...here].sort((a, b) => cum(b) - cum(a));
    if (sorted[1] && cum(sorted[1]) === cum(sorted[0])) continue;
    if (lead && sorted[0].id !== lead) leadChanges += 1;
    lead = sorted[0].id;
  }
  return {
    kind: 'series', shooters, bestSeries,
    perfect: shooters.reduce((a, s) => a + s.perfect, 0), penalties: shooters.reduce((a, s) => a + s.pen, 0), leadChanges,
  };
}

function finalStats(entries: ResultEntry[], ev: ShootEventDef): ShootFinalStats | null {
  const field = entries.filter(competing);
  if (!field.some((e) => e.result.fshots?.length)) return null;
  const st = finalState(entries, ev);
  const outAfter = new Map(st.out.map((o) => [o.id, o.after]));
  const checkpoints = [...new Set([...st.schedule, st.last])].sort((a, b) => a - b);
  const counted = (e: ResultEntry) => Math.min(e.result.fshots?.length ?? 0, outAfter.get(e.id) ?? st.last);
  const rankAt = (p: number) => {
    const inP = field.filter((e) => (e.result.fshots?.length ?? 0) >= p && !((outAfter.get(e.id) ?? Infinity) < p));
    const tot = (e: ResultEntry) => sumTenths(netFinalShots(e.result).slice(0, p));
    const sorted = [...inP].sort((a, b) => tot(b) - tot(a));
    const pl = placesOf(sorted, (a, b) => tot(a) === tot(b));
    return new Map(sorted.map((e, j) => [e.id, pl[j].place]));
  };
  const at = checkpoints.map(rankAt);
  const finalists: FinalistStats[] = field.map((e) => {
    const shots = (e.result.fshots ?? []).slice(0, counted(e));
    // round 2: the total (and the average) net of final penalties; best / 10.0+ as fired
    const total = fromTenths(sumTenths(netFinalShots(e.result).slice(0, counted(e))));
    return {
      id: e.id, name: e.name, place: st.places.get(e.id)?.place, shots: shots.length, total,
      avg: shots.length ? Math.round((total / shots.length) * 100) / 100 : 0, best: shots.length ? Math.max(...shots) : 0, tens: shots.filter((v) => v >= 10).length,
      ranks: at.map((m) => m.get(e.id) ?? null),
      ...(finalPenaltyTotal({ fpen: (e.result.fpen ?? []).slice(0, counted(e)) }) > 0 ? { pen: finalPenaltyTotal({ fpen: (e.result.fpen ?? []).slice(0, counted(e)) }) } : {}),
    };
  }).sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.total - a.total);
  let leadChanges = 0, lead: string | undefined;
  const maxFired = Math.max(0, ...field.map((e) => e.result.fshots?.length ?? 0));
  for (let k = 1; k <= maxFired; k++) {
    const m = rankAt(k);
    const firsts = [...m].filter(([, p]) => p === 1).map(([id]) => id);
    if (firsts.length !== 1) continue;
    if (lead && firsts[0] !== lead) leadChanges += 1;
    lead = firsts[0];
  }
  let bestShot: ShootFinalStats['bestShot'];
  for (const f of finalists) {
    if (!f.shots) continue;
    if (!bestShot || f.best > bestShot.value) bestShot = { names: [f.name], value: f.best };
    else if (f.best === bestShot.value) bestShot.names.push(f.name);
  }
  const penalties = fromTenths(finalists.reduce((a, f) => a + Math.round((f.pen ?? 0) * 10), 0));
  return { kind: 'final', checkpoints, finalists, leadChanges, bestShot, ...(penalties > 0 ? { penalties } : {}) };
}
