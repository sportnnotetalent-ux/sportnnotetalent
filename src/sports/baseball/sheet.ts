/**
 * Deep wave — baseball / softball's broadcast "Match stats" sheet (the MLB /
 * WBSC box score and its notes as team-vs-team rows). PURE, derived from the
 * event log only, so corrections and undo re-derive it and an old game shows
 * what it had. Scope = the whole game or one inning (both halves).
 *
 *  - Batting: runs, hits, 2B / 3B / HR, walks, HBP, strikeouts, AVG, OBP.
 *  - Situational: RISP "2-for-9", two-out RBI, left on base, GIDP, sacrifices.
 *  - Base running: steals, caught stealing, picked off.
 *  - Pitching: pitches–strikes, strike %, first-pitch strike % (pitch by pitch
 *    only), batters faced, strikeouts, walks, ground outs–fly outs, wild
 *    pitches / balks, inherited runners–scored.
 *  - Pitch mix (pitch types tracked), Fielding (errors, double plays turned,
 *    passed balls, putouts / assists from the notation), Spray (balls in play
 *    and hits by zone, when tracked).
 *  - Round 2 — Batted balls (when tracked): ground balls, line drives, fly
 *    balls, popups per team at bat, each with its % of the typed balls in play.
 * A row exists only for what the game tracked (never a false 0).
 */
import { BATTED_BALLS, ZONES, ZONE_LABEL, PITCH_TYPE_LABEL, isPitchType, trackTracked, type BaseballState } from './engine.ts';
import { countRow, madeRow, rateRow, section, sheet, textRow, type SheetRow, type StatSheet } from '../compareSheet.ts';
import { nth } from '../feedGroups.ts';
import { battedTotal, fieldersNoted, inningsPlayed, teamSplit, type Scope, type TeamSplit } from './situational.ts';

/** round 2: the sheet's batted-ball rows (plural labels) */
const BATTED_ROW: Record<(typeof BATTED_BALLS)[number], string> = { GB: 'Ground balls', LD: 'Line drives', FB: 'Fly balls', PU: 'Popups' };

/** ".250" — a batting average the way box scores print it ('–' with no at bats). */
export function avgText(n: number, d: number): string {
  if (d <= 0) return '–';
  const t = (n / d).toFixed(3);
  return t.startsWith('0') ? t.slice(1) : t;
}

/** A batting-average row (".250 – .310"); null when neither side has a denominator. */
function avgRow(key: string, label: string, hn: number, hd: number, an: number, ad: number): SheetRow | null {
  if (hd <= 0 && ad <= 0) return null;
  return { key, label, home: avgText(hn, hd), away: avgText(an, ad), h: hd > 0 ? hn / hd : 0, a: ad > 0 ? an / ad : 0 };
}

/** "2-for-9" (hits for at bats) — the bar compares the average. */
function forRow(key: string, label: string, hn: number, hd: number, an: number, ad: number): SheetRow | null {
  if (hd <= 0 && ad <= 0) return null;
  return { key, label, home: `${hn}-for-${hd}`, away: `${an}-for-${ad}`, h: hd > 0 ? hn / hd : 0, a: ad > 0 ? an / ad : 0 };
}

/** "98-62" style pair (the bar sizes by the first number). */
function pairRow(key: string, label: string, h1: number, h2: number, a1: number, a2: number, o?: { plain?: boolean }): SheetRow {
  return { key, label, home: `${h1}-${h2}`, away: `${a1}-${a2}`, h: h1, a: a1, ...(o?.plain ? { plain: true } : {}) };
}

/** a count row only when either side has one (occasional figures) */
const someRow = (key: string, label: string, h: number, a: number, o?: { lowerBetter?: boolean }) => (h || a ? countRow(key, label, h, a, o) : null);

const obpOf = (t: TeamSplit) => ({ n: t.hits + t.bb + t.hbp, d: t.ab + t.bb + t.hbp + t.sf });

/** The sheet for a scope ('all' or an inning). */
export function baseballSheet(s: BaseballState, scope: Scope = 'all'): StatSheet {
  const H = teamSplit(s, 'home', scope), A = teamSplit(s, 'away', scope);
  const counts = s.cfg.pitches;
  const types = trackTracked(s, 'pitchTypes');
  const spray = trackTracked(s, 'sprayZones');
  const typed = trackTracked(s, 'battedBallTypes');
  const pctOf = (n: number, d: number) => (d > 0 ? ` (${Math.round((n / d) * 100)}%)` : '');
  const noted = fieldersNoted(s);
  const ho = obpOf(H), ao = obpOf(A);
  const mixKeys = [...new Set([...Object.keys(H.mix), ...Object.keys(A.mix)])].sort((x, y) => (H.mix[y] ?? 0) + (A.mix[y] ?? 0) - (H.mix[x] ?? 0) - (A.mix[x] ?? 0));
  const hp = H.pitches, ap = A.pitches;
  return sheet([
    section('batting', 'Batting', [
      countRow('runs', 'Runs', H.runs, A.runs),
      countRow('hits', 'Hits', H.hits, A.hits),
      someRow('doubles', 'Doubles', H.doubles, A.doubles),
      someRow('triples', 'Triples', H.triples, A.triples),
      countRow('hr', 'Home runs', H.homeRuns, A.homeRuns),
      countRow('bb', 'Walks', H.bb, A.bb),
      someRow('hbp', 'Hit by pitch', H.hbp, A.hbp),
      countRow('so', 'Strikeouts', H.so, A.so, { lowerBetter: true }),
      avgRow('avg', 'Batting average', H.hits, H.ab, A.hits, A.ab),
      avgRow('obp', 'On-base percentage', ho.n, ho.d, ao.n, ao.d),
    ]),
    section('situational', 'Situational', [
      forRow('risp', 'With runners in scoring position', H.rispHits, H.rispAb, A.rispHits, A.rispAb),
      (H.pa || A.pa) && countRow('twoOutRbi', 'Two-out RBI', H.twoOutRbi, A.twoOutRbi),
      (H.pa || A.pa) && countRow('lob', 'Left on base', H.lob, A.lob, { lowerBetter: true }),
      someRow('gidp', 'Grounded into double plays', H.gidp, A.gidp, { lowerBetter: true }),
      someRow('sac', 'Sacrifices (fly / bunt)', H.sf + H.sh, A.sf + A.sh),
    ]),
    section('running', 'Base running', [
      someRow('sb', 'Stolen bases', H.sb, A.sb),
      someRow('cs', 'Caught stealing', H.cs, A.cs, { lowerBetter: true }),
      someRow('pickedOff', 'Picked off', H.pickedOff, A.pickedOff, { lowerBetter: true }),
    ]),
    section('pitching', 'Pitching', [
      counts && (hp || ap) && pairRow('ps', 'Pitches–strikes', hp, H.strikes, ap, A.strikes),
      counts && rateRow('strikePct', 'Strike %', H.strikes, hp, A.strikes, ap),
      counts && madeRow('fps', 'First-pitch strikes', H.firstStrikes, H.firstPitches, A.firstStrikes, A.firstPitches),
      (H.bf || A.bf) && countRow('bf', 'Batters faced', H.bf, A.bf, { plain: true }),
      (H.bf || A.bf) && countRow('k', 'Strikeouts', H.kPitched, A.kPitched),
      (H.bf || A.bf) && countRow('bbAllowed', 'Walks', H.bbAllowed, A.bbAllowed, { lowerBetter: true }),
      (H.go + H.ao + A.go + A.ao > 0) && pairRow('goao', 'Ground outs–fly outs', H.go, H.ao, A.go, A.ao, { plain: true }),
      someRow('wp', 'Wild pitches', H.wp, A.wp, { lowerBetter: true }),
      someRow('bk', 'Balks', H.bk, A.bk, { lowerBetter: true }),
      (H.ir || A.ir) && pairRow('irs', 'Inherited runners–scored', H.ir, H.irs, A.ir, A.irs, { plain: true }),
    ], counts ? undefined : 'Pitch counts need pitch-by-pitch scoring.'),
    types && mixKeys.length > 0 && section('mix', 'Pitch mix', mixKeys.map((k) => {
      const label = isPitchType(k) ? PITCH_TYPE_LABEL[k] : k;
      const h = H.mix[k] ?? 0, a = A.mix[k] ?? 0;
      const pct = (n: number, d: number) => (d > 0 ? ` (${Math.round((n / d) * 100)}%)` : '');
      const typed = (t: TeamSplit) => Object.values(t.mix).reduce((x, y) => x + y, 0);
      return { key: `mix:${k}`, label, home: `${h}${pct(h, typed(H))}`, away: `${a}${pct(a, typed(A))}`, h, a, plain: true };
    }), 'Pitches with a type picked, by the fielding team.'),
    section('fielding', 'Fielding', [
      (H.bf || A.bf) && countRow('errors', 'Errors', H.errors, A.errors, { lowerBetter: true }),
      (H.bf || A.bf) && countRow('dp', 'Double plays turned', H.dp, A.dp),
      someRow('pb', 'Passed balls', H.pb, A.pb, { lowerBetter: true }),
      noted && (H.putouts || A.putouts) && countRow('po', 'Putouts (noted plays)', H.putouts, A.putouts, { plain: true }),
      noted && (H.assists || A.assists) && countRow('a', 'Assists (noted plays)', H.assists, A.assists, { plain: true }),
    ]),
    spray && section('spray', 'Spray (balls in play · hits)', ZONES.map((z) => {
      const h = H.zones[z], a = A.zones[z];
      if (!h && !a) return null;
      const t = (c?: { bip: number; hits: number }) => (c ? `${c.bip} · ${c.hits} H` : '0');
      return textRow(`zone:${z}`, ZONE_LABEL[z], t(h), t(a));
    }), 'Where each team put the ball in play (the scorer’s taps and the fielders’ notation).'),
    // round 2: batted-ball types — each % over the team's typed balls in play (Statcast: popups their own family)
    typed && (battedTotal(H.batted) + battedTotal(A.batted) + H.untyped + A.untyped > 0) && section('batted', 'Batted balls', [
      ...BATTED_BALLS.map((t): SheetRow => {
        const h = H.batted[t], a = A.batted[t];
        return { key: `bb:${t}`, label: BATTED_ROW[t], home: `${h}${pctOf(h, battedTotal(H.batted))}`, away: `${a}${pctOf(a, battedTotal(A.batted))}`, h, a, plain: true };
      }),
      (H.untyped || A.untyped) && countRow('untyped', 'Balls in play with no type', H.untyped, A.untyped, { plain: true }),
    ], 'Each team at bat. Outs fill the type in (groundout = ground ball, lineout = line drive, fly out = fly ball, or a popup when an infielder caught it); hits need the tap. % of the balls with a type.'),
  ]);
}

/** Scope chips: one per inning played ("1st", "2nd" …), from two innings. */
export function inningScopes(s: BaseballState): { value: number; label: string }[] {
  const n = inningsPlayed(s);
  return n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: nth(i + 1) })) : [];
}

/** One row of a sheet by section and key (readers and tests). */
export const rowOf = (sh: StatSheet, sec: string, key: string): SheetRow | undefined => sh.sections.find((x) => x.key === sec)?.rows.find((r) => r.key === key);
