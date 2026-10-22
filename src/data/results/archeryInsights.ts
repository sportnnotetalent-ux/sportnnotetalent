/**
 * Deep wave — archery results commentary and stats (World Archery depth),
 * DERIVED from the stored arrows (ranking-round `ends`, match play `mp`), so a
 * correction rewrites them. Pure.
 *
 *  - ranking round: end by end — each archer's arrows, end score and running
 *    total with their place (small fields), the best end, the leader and the
 *    margin, the halves (36 + 36 / 30 + 30), the standings at the end;
 *  - match play: every match end by end ("QF · E4: Deepika X-10-9 = 29 v
 *    Ankita 27 — Deepika takes the set, 5-3"), shoot-offs (closest to the
 *    centre), the winner, the podium;
 *  - stats: average arrow, X / 10s / 9s / misses, X per end, best / worst end,
 *    arrow distribution; in match play matches and sets won, the average arrow
 *    in matches, the best match end and shoot-offs.
 */
import type { ArchSide, DisciplineDef, ResultEntry } from './model.ts';
import { rankEntries } from './rank.ts';
import { archRoundOf, endSum, endTens, endXs, endsOf, matchFormatOf, type ArchRoundDef, type Arrow } from './archeryDefs.ts';
import { archMatch, bracketState, isBracketRows, roundShort, type BMatch, type BracketState } from './archeryBracket.ts';
import { ruleOf } from './competitionRules.ts';
import { FeedBuilder, MEDAL_ICON, ordinalOf, placesOf, type FeedItem } from './insightFeed.ts';

const competing = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');
/** a team ranked on its members' scores has no ends of its own */
const ownEnds = (e: ResultEntry) => !e.result?.ms?.length && (e.result?.ends ?? []).some((x) => x?.length);

/** "X-10-9" — an end as on the scorecard (highest first). */
export const endDash = (arrows?: Arrow[]): string => (arrows ?? []).map(String).join('-');

/* --------------------------------- the feed -------------------------------- */

/** The phase's commentary, newest first: match play, or the ranking round. */
export function archFeed(entries: ResultEntry[], def: DisciplineDef, perArcherMax = 12): FeedItem[] {
  const round = archRoundOf(def.key);
  if (!round) return [];
  if (isBracketRows(entries)) return bracketFeed(entries, def, round);
  return rankingFeed(entries, def, round, perArcherMax);
}

function rankingFeed(entries: ResultEntry[], def: DisciplineDef, round: ArchRoundDef, perArcherMax: number): FeedItem[] {
  const rows = entries.filter((e) => competing(e) && ownEnds(e));
  if (!rows.length) return [];
  const fb = new FeedBuilder();
  const xsFirst = ruleOf(def.rules, 'archTie') === 'xs';
  const total = endsOf(round);
  const half = Math.ceil(total / 2);
  const n = Math.max(...rows.map((e) => e.result.ends!.length));
  let lead: string | undefined;
  for (let i = 0; i < n; i++) {
    const here = rows.filter((e) => e.result.ends![i]?.length);
    if (!here.length) continue;
    const upTo = (e: ResultEntry) => e.result.ends!.slice(0, i + 1).filter((x) => x?.length).flat();
    const key = (e: ResultEntry) => { const a = upTo(e); return [endSum(a), xsFirst ? endXs(a) : endTens(a), xsFirst ? endTens(a) : endXs(a)]; };
    const cmp = (a: ResultEntry, b: ResultEntry) => { const x = key(a), y = key(b); return (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]); };
    const sorted = [...here].sort(cmp);
    const pl = placesOf(sorted, (a, b) => cmp(a, b) === 0);
    const place = new Map(sorted.map((e, j) => [e.id, pl[j]]));
    const tag = `E${i + 1}`;
    if (here.length <= perArcherMax) {
      for (const e of [...here].sort((a, b) => (a.result.order ?? 99) - (b.result.order ?? 99))) {
        const end = e.result.ends![i];
        const at = place.get(e.id)!;
        fb.push(`${e.name} ${endDash(end)} = ${endSum(end)} — ${endSum(upTo(e))} after ${i + 1} (${at.tie ? '=' : ''}${ordinalOf(at.place)})`, { tag, tone: endSum(end) === end.length * 10 ? 'good' : undefined });
      }
    }
    const top = Math.max(...here.map((e) => endSum(e.result.ends![i])));
    const bestBy = here.filter((e) => endSum(e.result.ends![i]) === top);
    const leader = sorted[0], second = sorted[1];
    const margin = second ? key(leader)[0] - key(second)[0] : 0;
    fb.push(
      `End ${i + 1} — best ${bestBy.map((e) => e.name).join(', ')} ${top}${bestBy.length === 1 ? ` (${endDash(bestBy[0].result.ends![i])})` : ''}; ${pl[0].tie ? 'level at the top on' : `${leader.name} leads on`} ${key(leader)[0]}${second && !pl[0].tie ? ` (+${margin})` : ''}`,
      { tag, tone: 'info' },
    );
    if (!pl[0].tie && leader.id !== lead) {
      if (lead) fb.push(`${leader.name} takes the lead`, { tag, tone: 'lead' });
      lead = leader.id;
    }
    if (i === half - 1 && here.length === rows.length && !round.indoor) {
      const t = sorted.slice(0, 3).map((e) => `${place.get(e.id)!.place}. ${e.name} ${key(e)[0]}`).join(' · ');
      fb.push(`Halfway (${upToArrows(round, half)} arrows) — ${t}`, { tag, tone: 'lead' });
    }
  }
  const all = entries.filter(competing).filter((e) => !e.result.ms?.length);
  if (all.length && all.every((e) => (e.result.ends ?? []).filter((x) => x?.length).length >= total)) {
    const top = rankEntries(entries, def).filter((r) => r.position != null && r.position <= 3);
    if (top.length) fb.push(`Ranking round complete — ${top.map((r) => `${r.label}. ${r.entry.name} ${r.entry.result.mark ?? ''} (${r.entry.result.tens ?? 0} 10s, ${r.entry.result.xs ?? 0} X)`).join(' · ')}`, { tone: 'lead' });
  }
  return fb.newestFirst();
}

const upToArrows = (r: ArchRoundDef, ends: number) => ends * r.perEnd;

/** The bracket's matches in shooting order: earliest round first, bronze before gold. */
function matchOrder(st: BracketState): BMatch[] {
  const order = (m: BMatch) => (m.round === 'B' ? st.rounds - 0.5 : (m.round as number));
  return [...st.matches].sort((a, b) => order(a) - order(b) || a.slot - b.slot);
}

function bracketFeed(entries: ResultEntry[], def: DisciplineDef, round: ArchRoundDef): FeedItem[] {
  const fmt = matchFormatOf(round.bow);
  const st = bracketState(entries, fmt, archMatch(fmt, def.rules, def.key));
  const fb = new FeedBuilder();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const name = (id?: string) => (id ? byId.get(id)?.name ?? '' : '');
  const side = (id: string | undefined, key: string): ArchSide | undefined => (id ? byId.get(id)?.result.mp?.[key] : undefined);
  for (const m of matchOrder(st)) {
    const tag = roundShort(m.round, st.rounds);
    if (!m.out || m.bye) continue;
    if (m.out.walkover) {
      if (m.winner) fb.push(`${name(m.winner)} through — ${name(m.loser) || 'the opponent'} didn't shoot (walkover)`, { tag, tone: 'info' });
      continue;
    }
    const A = side(m.a, m.key), B = side(m.b, m.key);
    let ca = 0, cb = 0;
    m.out.ends.forEach((e, k) => {
      const ea = A?.ends?.[k], eb = B?.ends?.[k];
      if (fmt === 'sets') {
        ca += e.pa; cb += e.pb;
        const who = e.pa === 2 ? `${name(m.a)} takes the set` : e.pb === 2 ? `${name(m.b)} takes the set` : 'set shared';
        fb.push(`${name(m.a)} ${endDash(ea)} = ${e.a} v ${name(m.b)} ${endDash(eb)} = ${e.b} — ${who}, ${ca}-${cb}`, { tag: `${tag} E${k + 1}`, tone: 'info' });
      } else {
        ca += e.a; cb += e.b;
        fb.push(`${name(m.a)} ${endDash(ea)} = ${e.a} v ${name(m.b)} ${endDash(eb)} = ${e.b} — ${ca}-${cb}`, { tag: `${tag} E${k + 1}`, tone: 'info' });
      }
    });
    if (m.out.shootOff && ((A?.so?.length ?? 0) || (B?.so?.length ?? 0))) {
      const k = m.out.soK ?? 1;
      const rounds = Math.ceil(Math.max(A?.so?.length ?? 0, B?.so?.length ?? 0) / k);
      for (let j = 0; j < rounds; j++) {
        const ra = (A?.so ?? []).slice(j * k, j * k + k), rb = (B?.so ?? []).slice(j * k, j * k + k);
        if (!ra.length || !rb.length) continue;
        const sa = endSum(ra), sb = endSum(rb);
        const closer = A?.closer?.[j] ? name(m.a) : B?.closer?.[j] ? name(m.b) : '';
        const how = sa !== sb ? `${sa > sb ? name(m.a) : name(m.b)} higher` : closer ? `level — ${closer} closer to the centre` : 'level';
        fb.push(`Shoot-off${rounds > 1 ? ` ${j + 1}` : ''}: ${name(m.a)} ${k > 1 ? `${endDash(ra)} = ${sa}` : String(ra[0])} v ${name(m.b)} ${k > 1 ? `${endDash(rb)} = ${sb}` : String(rb[0])} — ${how}`, { tag, tone: 'lead' });
      }
    }
    if (m.decided && m.winner) {
      const flip = m.winner === m.b;
      const score = flip ? `${m.out.b}-${m.out.a}` : `${m.out.a}-${m.out.b}`;
      const medal = m.round === 'B' ? ' — bronze' : m.round === st.rounds ? ' — gold' : '';
      fb.push(`${name(m.winner)} beats ${name(m.loser)} ${score}${m.out.soWon ? ' after a shoot-off' : ''}${medal}`, { tag, tone: medal ? 'medal' : 'good' });
    }
  }
  if (st.done) {
    const podium = [...st.places].filter(([, p]) => p.place <= 3).sort((a, b) => a[1].place - b[1].place);
    if (podium.length) fb.push(podium.map(([id, p]) => `${MEDAL_ICON[p.place]} ${name(id)}`).join(' · '), { tone: 'medal', tag: 'Result' });
  }
  return fb.newestFirst();
}

/* ---------------------------------- stats ---------------------------------- */

export interface ArrowDistribution { label: string; n: number }
export interface ArcherRoundStats {
  id: string; name: string; place?: number;
  ends: number; arrows: number; total: number;
  avgArrow: number;
  tens: number; xs: number; nines: number; misses: number;
  /** X per end (2 dp) */
  xPerEnd: number;
  bestEnd: number; worstEnd: number;
  /** the halves (36 + 36 / 30 + 30) once the second half has started */
  halves?: [number, number];
  dist: ArrowDistribution[];
}
export interface ArchRoundStats {
  kind: 'ranking';
  archers: ArcherRoundStats[];
  bestEnd?: { names: string[]; value: number };
  mostX?: { names: string[]; value: number };
  leadChanges: number;
}
export interface ArcherMatchStats {
  id: string; name: string; seed?: number; place?: number;
  won: number; lost: number;
  /** set system: sets won / shared / lost */
  sets?: { won: number; tied: number; lost: number };
  arrows: number; points: number; avgArrow: number;
  tens: number; xs: number;
  bestEnd: number;
  shootOffs: { won: number; lost: number };
}
export interface ArchBracketStats {
  kind: 'bracket';
  archers: ArcherMatchStats[];
  /** the highest-scoring match end */
  bestEnd?: { names: string[]; value: number };
  shootOffs: number;
}

/** "X 10 9 8 7 ≤6 M" counts over a list of arrows. */
export function arrowDistribution(arrows: Arrow[], minRing = 1): ArrowDistribution[] {
  const n = (f: (a: Arrow) => boolean) => arrows.filter(f).length;
  const rows: ArrowDistribution[] = [
    { label: 'X', n: n((a) => a === 'X') }, { label: '10', n: n((a) => a === 10) }, { label: '9', n: n((a) => a === 9) },
    { label: '8', n: n((a) => a === 8) }, { label: '7', n: n((a) => a === 7) },
  ];
  if (minRing <= 6) rows.push({ label: minRing === 6 ? '6' : '≤6', n: n((a) => a !== 'X' && a !== 'M' && a <= 6) });
  rows.push({ label: 'M', n: n((a) => a === 'M') });
  return rows;
}

/** The phase's stats (null when nothing is entered). */
export function archStats(entries: ResultEntry[], def: DisciplineDef): ArchRoundStats | ArchBracketStats | null {
  const round = archRoundOf(def.key);
  if (!round) return null;
  if (isBracketRows(entries)) return bracketStats(entries, def, round);
  const rows = entries.filter((e) => competing(e) && ownEnds(e));
  if (!rows.length) return null;
  const ranked = rankEntries(entries, def);
  const placeOf = new Map(ranked.map((r) => [r.id, r.position ?? undefined]));
  const half = Math.ceil(endsOf(round) / 2);
  const archers: ArcherRoundStats[] = rows.map((e) => {
    const ends = e.result.ends!.filter((x) => x?.length);
    const all = ends.flat();
    const sums = ends.map(endSum);
    const total = endSum(all);
    return {
      id: e.id, name: e.name, place: placeOf.get(e.id), ends: ends.length, arrows: all.length, total,
      avgArrow: all.length ? Math.round((total / all.length) * 100) / 100 : 0,
      tens: endTens(all), xs: endXs(all), nines: all.filter((a) => a === 9).length, misses: all.filter((a) => a === 'M').length,
      xPerEnd: ends.length ? Math.round((endXs(all) / ends.length) * 100) / 100 : 0,
      bestEnd: Math.max(...sums), worstEnd: Math.min(...sums),
      ...(ends.length > half ? { halves: [endSum(ends.slice(0, half).flat()), endSum(ends.slice(half).flat())] as [number, number] } : {}),
      dist: arrowDistribution(all, round.minRing ?? 1),
    };
  }).sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || b.total - a.total);
  const best = <K extends 'bestEnd' | 'xs'>(k: K) => {
    const v = Math.max(...archers.map((a) => a[k]));
    return { names: archers.filter((a) => a[k] === v).map((a) => a.name), value: v };
  };
  // lead changes end by end (a level top doesn't change it)
  let leadChanges = 0, lead: string | undefined;
  const n = Math.max(...rows.map((e) => e.result.ends!.length));
  for (let i = 0; i < n; i++) {
    const here = rows.filter((e) => e.result.ends![i]?.length);
    const k = (e: ResultEntry) => { const a = e.result.ends!.slice(0, i + 1).flat(); return endSum(a) * 10000 + endTens(a) * 100 + endXs(a); };
    const sorted = [...here].sort((a, b) => k(b) - k(a));
    if (!sorted.length || (sorted[1] && k(sorted[1]) === k(sorted[0]))) continue;
    if (lead && sorted[0].id !== lead) leadChanges += 1;
    lead = sorted[0].id;
  }
  return { kind: 'ranking', archers, bestEnd: best('bestEnd'), mostX: best('xs'), leadChanges };
}

/**
 * One archer's match play from the bracket: matches won / lost (walkovers and
 * byes not counted), sets, the arrows of the ends that counted, shoot-offs.
 * Shared by the stats panel and the stat lines (archLines).
 */
export function matchPlayOf(st: BracketState, id: string, sideOf: (id: string, key: string) => ArchSide | undefined): Omit<ArcherMatchStats, 'id' | 'name' | 'seed' | 'place' | 'avgArrow'> {
  const o = { won: 0, lost: 0, sets: st.fmt === 'sets' ? { won: 0, tied: 0, lost: 0 } : undefined, arrows: 0, points: 0, tens: 0, xs: 0, bestEnd: 0, shootOffs: { won: 0, lost: 0 } };
  for (const m of st.matches) {
    if (!m.out || m.bye || m.out.walkover || (m.a !== id && m.b !== id)) continue;
    const mine = m.a === id ? 'a' : 'b';
    if (m.decided && m.winner === id) o.won += 1; else if (m.decided && m.loser === id) o.lost += 1;
    const ends = (sideOf(id, m.key)?.ends ?? []).slice(0, m.out.ends.length);
    for (const e of ends) {
      o.arrows += e.length; o.points += endSum(e); o.tens += endTens(e); o.xs += endXs(e);
      o.bestEnd = Math.max(o.bestEnd, endSum(e));
    }
    if (o.sets) for (const e of m.out.ends) { const p = mine === 'a' ? e.pa : e.pb; if (p === 2) o.sets.won += 1; else if (p === 1) o.sets.tied += 1; else o.sets.lost += 1; }
    if (m.out.soWon && m.decided) { if (m.winner === id) o.shootOffs.won += 1; else o.shootOffs.lost += 1; }
  }
  return o;
}

function bracketStats(entries: ResultEntry[], def: DisciplineDef, round: ArchRoundDef): ArchBracketStats | null {
  const fmt = matchFormatOf(round.bow);
  const st = bracketState(entries, fmt, archMatch(fmt, def.rules, def.key));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sideOf = (id: string, key: string) => byId.get(id)?.result.mp?.[key];
  const rows = entries.filter((e) => e.result?.mp != null && competing(e));
  const archers: ArcherMatchStats[] = rows.map((e) => {
    const mp = matchPlayOf(st, e.id, sideOf);
    return { id: e.id, name: e.name, seed: e.result.seed, place: st.places.get(e.id)?.place, ...mp, avgArrow: mp.arrows ? Math.round((mp.points / mp.arrows) * 100) / 100 : 0 };
  }).filter((a) => a.arrows > 0 || a.won + a.lost > 0)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (a.seed ?? 99) - (b.seed ?? 99));
  if (!archers.length) return null;
  const v = Math.max(...archers.map((a) => a.bestEnd));
  const shootOffs = st.matches.filter((m) => m.out?.soWon).length;
  return { kind: 'bracket', archers, bestEnd: v > 0 ? { names: archers.filter((a) => a.bestEnd === v).map((a) => a.name), value: v } : undefined, shootOffs };
}
