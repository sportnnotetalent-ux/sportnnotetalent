/**
 * Deep wave — golf hole-by-hole commentary. PURE (tests in
 * tests/golf-deep.test.mts).
 *
 *   • Stroke play / Stableford (a field): one item per player per hole —
 *     "Asha Rao — birdie 3 · 3 under through 7" — with the captured detail in
 *     words ("found the fairway · green in regulation · 1 putt from 3–10 ft"),
 *     grouped by hole, newest hole first, newest entry first inside a hole
 *     (the marker's time stamp, `card.holeAt`), the hole's field average in
 *     the group header. Derived from the cards, so a corrected hole re-derives.
 *   • Match play: "Hole 7 (par 4): Asha wins with a birdie 3 to Ravi's 4 —
 *     Asha 2 UP thru 7", grouped by nine (Front / Back / Extra holes), newest
 *     first, from the match's event log (state).
 */
import {
  derivedGir, matchState, summarize, PUTT_BUCKETS, driveYards, toParLabel,
  type GolfCard, type Hole,
} from './engine.ts';
import { matchHole, holeNumber } from './matchStrokes.ts';
import type { GolfMatchState } from './match.ts';
import type { FeedGroup, FeedItem } from '../gcc/model.ts';

/** "hole in one", "albatross", "eagle", "birdie", "par", "bogey",
 *  "double bogey", "triple bogey", "4 over par". */
export function scoreName(strokes: number, par: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'hole in one';
  if (d <= -3) return 'albatross';
  if (d === -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  if (d === 2) return 'double bogey';
  if (d === 3) return 'triple bogey';
  return `${d} over par`;
}

/** "3 under", "level par", "2 over" — to par in words. */
export function toParWords(n: number): string {
  return n === 0 ? 'level par' : n < 0 ? `${-n} under` : `${n} over`;
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** The captured detail of one hole in plain words ('' when none was kept):
 *  "268-yd drive · missed the fairway left · greenside bunker · sand save ·
 *  1 putt from 3–10 ft · 1 penalty stroke". */
export function holeStory(card: GolfCard, i: number, hole: Hole): string {
  const st = card.strokes[i];
  if (typeof st !== 'number') return '';
  const parts: string[] = [];
  const yd = driveYards(card.drive?.[i]);
  if (yd != null && hole.par >= 4) parts.push(`${yd}-yd drive`);
  const firB = card.fir?.[i];
  const dir = card.firDir?.[i] ?? (firB == null ? null : firB ? 'hit' : 'miss');
  if (hole.par >= 4 && dir) parts.push(dir === 'hit' ? 'found the fairway' : dir === 'L' ? 'missed the fairway left' : dir === 'R' ? 'missed the fairway right' : 'missed the fairway');
  const pen = card.penalties?.[i];
  if (typeof pen === 'number' && pen > 0) parts.push(`${pen} penalty stroke${pen === 1 ? '' : 's'}`);
  const p = card.putts?.[i];
  const putted = typeof p === 'number';
  // GIR: stored, else derived from the putts on a card that tracked them (the
  // same rule as roundStats: `track` says so, or an SD-45 stats-row card)
  const girOn = Array.isArray(card.track) ? card.track.includes('putts') : Array.isArray(card.firDir) || Array.isArray(card.bunker);
  const gir = card.gir?.[i] ?? (putted && girOn ? derivedGir(st, p, hole.par) : null);
  const bunker = card.bunker?.[i] === true;
  if (gir === true) parts.push('green in regulation');
  else if (gir === false) parts.push(bunker ? 'missed the green into a greenside bunker' : 'missed the green');
  else if (bunker) parts.push('greenside bunker');
  if (putted) {
    const fb = card.firstPutt?.[i];
    const from = typeof fb === 'number' && PUTT_BUCKETS[fb] ? PUTT_BUCKETS[fb].long : null;
    if (p === 0) parts.push('holed out from off the green');
    else if (p === 1) parts.push(`1 putt${from ? ` from ${from}` : ''}`);
    else parts.push(`${p} putts${p >= 3 ? ' (three-putt)' : ''}${from ? `, first from ${from}` : ''}`);
  }
  // a sand save (out of the greenside bunker and in within one putt — as
  // roundStats counts it), else a scramble (missed the green, par or better)
  if (bunker && (putted ? (p as number) <= 1 : st <= hole.par)) parts.push('sand save');
  else if (gir === false && st <= hole.par) parts.push(st === hole.par ? 'saved par' : 'up and down for birdie');
  return cap(parts.join(' · '));
}

export interface FeedPlayer { id: string; name: string; card: GolfCard; holes: Hole[]; received: number[] }

/** The running figure after hole `i`: "3 under through 7" (gross), "net 1
 *  under through 7", "16 pts through 7" (Stableford). */
function runningAfter(pl: FeedPlayer, i: number, o: { scoring: 'stroke' | 'stableford'; net?: boolean }): string {
  const upto: GolfCard = { strokes: pl.card.strokes.map((x, k) => (k <= i ? x : null)) };
  const s = summarize(upto, pl.holes, pl.received);
  if (o.scoring === 'stableford') return `${s.stableford} pts through ${s.thru}`;
  if (s.noReturn) return `no return · through ${s.thru}`;
  return `${o.net ? 'net ' : ''}${toParWords(o.net ? s.netToPar : s.toPar)} through ${s.thru}`;
}

const SCORE_ICON: Record<string, string> = { 'hole in one': '🎯', albatross: '🦅', eagle: '🦅', birdie: '🐦' };

/** The field's commentary: groups by hole (newest hole first). `only` = one
 *  player's feed. */
export function golfRoundFeed(players: FeedPlayer[], o: { scoring: 'stroke' | 'stableford'; net?: boolean; only?: string }): FeedGroup[] {
  const list = o.only ? players.filter((p) => p.id === o.only) : players;
  const n = Math.max(0, ...players.map((p) => p.holes.length));
  const groups: FeedGroup[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const hole = players.find((p) => p.holes[i])?.holes[i];
    if (!hole) continue;
    const items: (FeedItem & { order: number })[] = [];
    list.forEach((pl, order) => {
      const st = pl.card.strokes[i];
      if (st == null) return;
      const at = pl.card.holeAt?.[i] ?? undefined;
      if (st === 'P') {
        items.push({ id: `${pl.id}-${i}`, order, text: `${pl.name} picked up${o.scoring === 'stableford' ? ' · 0 points' : ' (no return)'}`, score: runningAfter(pl, i, o), ...(at ? { at } : {}) });
        return;
      }
      const name = scoreName(st, hole.par);
      const rcv = pl.received[i] ?? 0;
      const net = rcv ? ` (net ${st - rcv})` : '';
      const story = holeStory(pl.card, i, hole);
      const icon = SCORE_ICON[name];
      items.push({
        id: `${pl.id}-${i}`, order,
        text: `${pl.name} — ${name} ${st}${net}`,
        score: runningAfter(pl, i, o),
        ...(story ? { sub: story } : {}),
        ...(icon ? { icon } : {}),
        ...(st - hole.par <= -2 ? { big: true } : {}),
        ...(at ? { at } : {}),
      });
    });
    if (!items.length) continue;
    // newest entry first (stamped), then the card order
    items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0) || a.order - b.order);
    // the hole's scoring average over the whole field (numeric scores)
    const played = players.map((p) => p.card.strokes[i]).filter((x): x is number => typeof x === 'number');
    const avg = played.length >= 2 ? ` · field avg ${(played.reduce((t, x) => t + x, 0) / played.length).toFixed(2)}` : '';
    groups.push({ key: `h${i}`, title: `Hole ${hole.n} · par ${hole.par}`, subtitle: `SI ${hole.si}${avg}`, items: items.map(({ order: _o, ...it }) => it) });
  }
  return groups;
}

/* ------------------------------ match play ------------------------------ */

/** The match-play commentary, newest first, grouped by nine. */
export function golfMatchFeed(s: GolfMatchState, names: { home: string; away: string }): FeedGroup[] {
  const nm = (x: 'home' | 'away') => (x === 'home' ? names.home : names.away);
  const items: { nine: string; item: FeedItem }[] = [];
  s.holes.forEach((w, i) => {
    const no = holeNumber(s.firstHole, i);
    const mh = s.strokes ? matchHole(s.strokes, i) : null;
    const par = mh?.hole.par;
    const sc = s.scores?.[i] ?? null;
    const head = `Hole ${no}${par ? ` (par ${par})` : ''}`;
    const gross = (x: 'home' | 'away') => {
      if (!sc) return '';
      const g = sc[x];
      const shots = mh ? mh[x] : 0;
      const nm2 = par ? `${scoreName(g, par)} ${g}` : String(g);
      return shots ? `${nm2} (net ${g - shots})` : nm2;
    };
    let text: string;
    if (w === 'halved') text = sc ? `${head}: halved — ${nm('home')} ${gross('home')}, ${nm('away')} ${gross('away')}` : `${head}: halved`;
    else {
      const l = w === 'home' ? 'away' : 'home';
      text = sc ? `${head}: ${nm(w)} wins with ${/^[aeiou]/.test(gross(w)) ? 'an' : 'a'} ${gross(w)} to ${nm(l)}'s ${gross(l)}` : `${head}: ${nm(w)} wins the hole`;
    }
    const m = matchState(s.holes.slice(0, i + 1), s.regulation, s.extraHoles, s.firstHole ?? 1);
    const score = m.decided
      ? (m.winner === 'halved' ? 'Match halved' : `${nm(m.winner as 'home' | 'away')} wins ${m.result}`)
      : m.up === 0 ? `All square thru ${no}` : `${nm(m.up > 0 ? 'home' : 'away')} ${m.dormie ? `dormie ${Math.abs(m.up)}` : `${Math.abs(m.up)} UP`} thru ${no}`;
    const at = s.holeAt?.[i] ?? undefined;
    const nine = i >= s.regulation ? 'Extra holes' : s.regulation === 18 ? (i < 9 ? 'Front nine' : 'Back nine') : (s.firstHole ?? 1) >= 10 ? 'Back nine' : 'Front nine';
    items.push({ nine, item: { id: `h${i}`, text, score, ...(w !== 'halved' ? { side: w } : {}), ...(m.decided ? { big: true, icon: '🏆' } : {}), ...(at ? { at } : {}) } });
  });
  if (s.conceded) {
    const m = matchState(s.holes, s.regulation, s.extraHoles);
    const winner = s.conceded === 'home' ? 'away' : 'home';
    const where = m.played ? (m.up === 0 ? `all square thru ${m.played}` : `${Math.abs(m.up)} ${(s.conceded === 'home' ? m.up < 0 : m.up > 0) ? 'down' : 'up'} thru ${m.played}`) : 'before hole 1';
    items.push({ nine: items[items.length - 1]?.nine ?? 'Front nine', item: { id: 'concede', text: `${nm(s.conceded)} concedes the match (${where})`, score: `${nm(winner)} wins`, side: winner, icon: '🏳', big: true, ...(s.concededAt ? { at: s.concededAt } : {}) } });
  }
  const order = ['Extra holes', 'Back nine', 'Front nine'];
  return order
    .map((title) => ({ key: title, title, items: items.filter((x) => x.nine === title).map((x) => x.item).reverse() }))
    .filter((g) => g.items.length);
}

/** "−3" / "E" / "+2" (re-export for the components). */
export { toParLabel };
