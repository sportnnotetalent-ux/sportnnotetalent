/**
 * Deep wave — a golf round's stats panel at broadcast depth (PGA TOUR /
 * DP World Tour scorecard "Stats" tab): Scoring, Off the tee, Approach,
 * Around the green, Putting — for the whole round or the front / back nine,
 * the player beside the field's average. PURE (tests/golf-deep.test.mts):
 * every figure comes from `roundStats` over the card, so a row the card
 * didn't track is left out (never a false 0) and the field column pools only
 * the players whose cards tracked it.
 */
import { roundStats, summarize, toParLabel, PUTT_BUCKETS, type GolfCard, type Hole } from './engine.ts';
import { nonEmpty, type CompareCategory, type CompareRow } from '../gcc/model.ts';

export type NinePart = 'all' | 'out' | 'in';
export interface RoundInput { card: GolfCard; holes: Hole[]; received: number[] }

/** The part of a round: every hole, or the first / last nine of 18. */
export function sliceRound(r: RoundInput, part: NinePart): RoundInput {
  if (part === 'all' || r.holes.length !== 18) return r;
  const [a, b] = part === 'out' ? [0, 9] : [9, 18];
  const cut = <T,>(xs: T[] | undefined) => (Array.isArray(xs) ? xs.slice(a, b) : undefined);
  const c = r.card;
  const card: GolfCard = {
    strokes: c.strokes.slice(a, b),
    ...(c.putts ? { putts: cut(c.putts) } : {}), ...(c.fir ? { fir: cut(c.fir) } : {}), ...(c.gir ? { gir: cut(c.gir) } : {}),
    ...(c.penalties ? { penalties: cut(c.penalties) } : {}), ...(c.firDir ? { firDir: cut(c.firDir) } : {}), ...(c.bunker ? { bunker: cut(c.bunker) } : {}),
    ...(c.firstPutt ? { firstPutt: cut(c.firstPutt) } : {}), ...(c.drive ? { drive: cut(c.drive) } : {}), ...(c.track ? { track: c.track } : {}),
  };
  return { card, holes: r.holes.slice(a, b), received: r.received.slice(a, b) };
}

type Fig = Record<string, number>;
const fmt = (n: number, dp: number) => (Number.isInteger(n) && dp === 0 ? String(n) : n.toFixed(dp));

/** The panel: `me` (one player's round) beside the `field` (the others). */
export function golfStatSheet(me: RoundInput, field: RoundInput[], part: NinePart = 'all'): CompareCategory[] {
  const mine = sliceRound(me, part);
  const M = roundStats(mine.card, mine.holes, mine.received);
  const F = field.map((r) => { const x = sliceRound(r, part); return roundStats(x.card, x.holes, x.received); });
  const withKey = (k: string) => F.filter((s) => k in s);
  const solo = !field.length;

  /** a count: mine vs the field's mean (over the cards that carry the key) */
  const count = (key: string, label: string, f: (s: Fig) => number, need: string, better: 'higher' | 'lower' = 'higher'): CompareRow | null => {
    if (!(need in M)) return null;
    const fs = withKey(need).map(f);
    const avg = fs.length ? fs.reduce((t, x) => t + x, 0) / fs.length : null;
    return { key, label, home: String(f(M)), away: avg == null ? '–' : fmt(avg, 1), hv: f(M), ...(avg != null ? { av: avg } : {}), better };
  };
  /** a rate num ÷ den: "8/14 (57%)" mine vs the field pooled */
  const rate = (key: string, label: string, num: string, den: string, better: 'higher' | 'lower' = 'higher'): CompareRow | null => {
    if (!(den in M) || !M[den]) return null;
    const fs = withKey(den);
    const fn = fs.reduce((t, s) => t + (s[num] ?? 0), 0), fd = fs.reduce((t, s) => t + (s[den] ?? 0), 0);
    const p = (n: number, d: number) => Math.round((n / d) * 100);
    return {
      key, label, home: `${M[num] ?? 0}/${M[den]} (${p(M[num] ?? 0, M[den])}%)`, away: fd ? `${p(fn, fd)}%` : '–',
      hv: (M[num] ?? 0) / M[den], ...(fd ? { av: fn / fd } : {}), better,
    };
  };
  /** an average num ÷ den to `dp` places (par-3 scoring, putts per GIR, yards) */
  const avg = (key: string, label: string, num: string, den: string, dp: number, better: 'higher' | 'lower', unit = ''): CompareRow | null => {
    if (!(den in M) || !M[den]) return null;
    const fs = withKey(den);
    const fn = fs.reduce((t, s) => t + (s[num] ?? 0), 0), fd = fs.reduce((t, s) => t + (s[den] ?? 0), 0);
    return { key, label, home: `${(M[num] / M[den]).toFixed(dp)}${unit}`, away: fd ? `${(fn / fd).toFixed(dp)}${unit}` : '–', hv: M[num] / M[den], ...(fd ? { av: fn / fd } : {}), better };
  };
  const keep = (rows: (CompareRow | null)[]) => rows.filter((r): r is CompareRow => !!r);

  // the score: gross (to par) beside the field's mean over cards as far along
  const sum = summarize(mine.card, mine.holes, mine.received);
  const peers = field.map((r) => sliceRound(r, part)).map((x) => summarize(x.card, x.holes, x.received)).filter((s) => s.thru === sum.thru && s.thru > 0 && !s.noReturn);
  const peerAvg = peers.length ? peers.reduce((t, s) => t + s.gross, 0) / peers.length : null;
  const score: CompareRow | null = sum.thru ? {
    key: 'score', label: `Strokes${sum.thru < mine.holes.length ? ` (thru ${sum.thru})` : ''}`,
    home: sum.noReturn ? `${sum.gross} (NR)` : `${sum.gross} (${toParLabel(sum.toPar)})`, away: peerAvg == null ? '–' : peerAvg.toFixed(1),
    hv: sum.gross, ...(peerAvg != null ? { av: peerAvg } : {}), better: 'lower',
  } : null;

  const scoring = keep([
    score,
    count('under', 'Birdies or better', (s) => (s.eagles ?? 0) + (s.birdies ?? 0), 'birdies'),
    count('pars', 'Pars', (s) => s.pars ?? 0, 'pars'),
    count('bogeys', 'Bogeys', (s) => s.bogeys ?? 0, 'bogeys', 'lower'),
    count('doubles', 'Double bogey or worse', (s) => s.doubles ?? 0, 'doubles', 'lower'),
    avg('p3', 'Par 3 scoring', 'p3Strokes', 'p3Holes', 2, 'lower'),
    avg('p4', 'Par 4 scoring', 'p4Strokes', 'p4Holes', 2, 'lower'),
    avg('p5', 'Par 5 scoring', 'p5Strokes', 'p5Holes', 2, 'lower'),
    rate('bounce', 'Bounce back', 'bounceBacks', 'bounceOps'),
  ]);
  if (M.holesInOne) scoring.push({ key: 'aces', label: 'Holes in one', home: String(M.holesInOne), away: '', hv: M.holesInOne });

  const tee = keep([
    rate('fir', 'Fairways hit', 'firHit', 'firHoles'),
    'firLeft' in M ? count('firL', 'Missed left', (s) => s.firLeft ?? 0, 'firLeft', 'lower') : null,
    'firRight' in M ? count('firR', 'Missed right', (s) => s.firRight ?? 0, 'firRight', 'lower') : null,
    avg('dd', 'Driving distance (measured)', 'driveYds', 'drives', 0, 'higher', ' yd'),
    'longDrive' in M ? count('long', 'Longest drive (yd)', (s) => s.longDrive ?? 0, 'longDrive') : null,
  ]);
  const approach = keep([
    rate('gir', 'Greens in regulation', 'girHit', 'girHoles'),
    rate('conv', 'Birdie conversion (on GIR)', 'girBirdies', 'girHit'),
  ]);
  const around = keep([
    rate('scr', 'Scrambling (up & down)', 'scrambles', 'scrambleHoles'),
    rate('sand', 'Sand saves', 'sandSaves', 'sandHoles'),
  ]);
  const putting = keep([
    M.puttHoles ? count('putts', `Putts${M.puttHoles < mine.holes.length ? ` (${M.puttHoles} holes)` : ''}`, (s) => s.putts ?? 0, 'puttHoles', 'lower') : null,
    avg('ppg', 'Putts per GIR', 'puttsGir', 'girPutted', 2, 'lower'),
    'onePutts' in M ? count('one', 'One-putts', (s) => s.onePutts ?? 0, 'onePutts') : null,
    'threePutts' in M ? count('three', 'Three-putts', (s) => s.threePutts ?? 0, 'threePutts', 'lower') : null,
    ...PUTT_BUCKETS.map((b) => rate(b.key, `First putt holed ${b.long}`, `${b.key}Made`, b.key)),
  ]);
  const pens = Array.isArray(me.card.penalties) || (Array.isArray(me.card.track) && me.card.track.includes('penalties'))
    ? keep([count('pen', 'Penalty strokes', (s) => s.penalties ?? 0, 'penalties', 'lower')]) : [];

  const cats = nonEmpty([
    { id: 'scoring', title: 'Scoring', rows: scoring },
    { id: 'tee', title: 'Off the tee', rows: tee },
    { id: 'approach', title: 'Approach', rows: approach },
    { id: 'around', title: 'Around the green', rows: around },
    { id: 'putting', title: 'Putting', rows: [...putting, ...pens] },
  ]);
  // alone on the card: no field column
  return solo ? cats.map((c) => ({ ...c, rows: c.rows.map(({ av: _a, ...r }) => ({ ...r, away: '' })) })) : cats;
}
