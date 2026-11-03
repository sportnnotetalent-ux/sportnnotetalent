/**
 * Deep wave — football's optional depth: what the match tracked, the derived
 * player keys (statTotals), the match centre's extra team figures and its
 * box source. PURE.
 *
 * Opta / Premier League / FIFA match-centre figures a single scorer can
 * realistically add (each behind a "Deeper stats" toggle, off by default):
 *  - shot detail: inside / outside the box, big chances (and big chances
 *    missed), shots that hit the woodwork;
 *  - key passes (the pass that set up a shot; chances created = key passes +
 *    assists), clearances, goal kicks and throw-ins, card reasons;
 *  - goals ruled out (round 2: a toggle — school matches have no VAR; a match
 *    that logged one still shows it).
 * Free (derived from what every match already logs): shots off target,
 * penalties taken / scored, team save %.
 *
 * A figure the match didn't track is never written as 0: player keys are
 * written only for a match that tracked them (keyed coverage), and team
 * figures only when tracked (the panel lists the rest "not tracked").
 */
import type { StatTotalsEntry } from '../types';
import { pct, putIf } from '../invasion/centre.ts';
import type { FootballState } from './engine.ts';
import { possessionPct } from './engine.ts';
import { isSetPieceGoal } from './events.ts';

type Side = 'home' | 'away';
const SIDES = ['home', 'away'] as const;

/* --------------------------------- tracked --------------------------------- */

/** Shot detail: the toggle, or any shot / goal carrying it (a match that
 *  switched it off later keeps what it logged). */
export const shotDetailTracked = (s: Pick<FootballState, 'deep' | 'events' | 'stats'>): boolean =>
  s.deep?.shotDetail === true
  || (s.stats ?? []).some((e) => e.kind === 'shot' && (!!e.zone || !!e.bigChance || !!e.woodwork))
  || (s.events ?? []).some((e) => e.type === 'goal' && (!!e.zone || !!e.bigChance));
export const keyPassesTracked = (s: Pick<FootballState, 'deep' | 'stats'>): boolean =>
  s.deep?.keyPasses === true || (s.stats ?? []).some((e) => e.kind === 'keyPass');
export const clearancesTracked = (s: Pick<FootballState, 'deep' | 'stats'>): boolean =>
  s.deep?.clearances === true || (s.stats ?? []).some((e) => e.kind === 'clearance');
export const setPiecesTracked = (s: Pick<FootballState, 'deep' | 'stats'>): boolean =>
  s.deep?.setPieces === true || (s.stats ?? []).some((e) => e.kind === 'goalKick' || e.kind === 'throwIn');
/** Round 2 — goals ruled out: the toggle (the button shows only then), or
 *  any logged (an older match, or one that switched it off later, keeps what
 *  it logged). */
export const ruledOutTracked = (s: Pick<FootballState, 'deep' | 'events'>): boolean =>
  s.deep?.ruledOut === true || (s.events ?? []).some((e) => e.type === 'nogoal');

/** The optional live-credited keys to zero-fill on credited players' lines
 *  (only for a match that tracked them — no false 0 elsewhere). */
export const optionalStatKeys = (s: FootballState): string[] => [
  ...(keyPassesTracked(s) ? ['keyPasses'] : []),
  ...(clearancesTracked(s) ? ['clearances'] : []),
];

/* --------------------------- derived player keys --------------------------- */

/** Shot-detail keys statTotals derives (never credited live). */
export const SHOT_DETAIL_KEYS = ['shotsInBox', 'shotsOutBox', 'goalsInBox', 'goalsOutBox', 'bigChances', 'bigChancesMissed', 'woodwork'] as const;

/** Per player id, the shot-detail keys (only when the match tracked them):
 *  every player with a shot or a goal gets all seven (0 included). Goals need
 *  the scorer's id (every log since SD-30 carries it). */
export function footballShotDetailTotals(s: FootballState): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!shotDetailTracked(s)) return out;
  const line = (id: string, side: Side) => out[id] ?? (out[id] = { side, stats: Object.fromEntries(SHOT_DETAIL_KEYS.map((k) => [k, 0])) });
  const bump = (st: Record<string, number>, k: string) => { st[k] = (st[k] ?? 0) + 1; };
  for (const e of s.stats ?? []) {
    if (e.kind !== 'shot' || !e.playerId) continue;
    const st = line(e.playerId, e.side).stats;
    if (e.zone === 'box') bump(st, 'shotsInBox');
    else if (e.zone === 'out') bump(st, 'shotsOutBox');
    if (e.bigChance) { bump(st, 'bigChances'); bump(st, 'bigChancesMissed'); }
    if (e.woodwork) bump(st, 'woodwork');
  }
  for (const e of s.events ?? []) {
    if (e.type !== 'goal' || !e.playerId || e.official) continue;
    const st = line(e.playerId, e.side).stats;
    if (e.zone === 'box') { bump(st, 'shotsInBox'); bump(st, 'goalsInBox'); }
    else if (e.zone === 'out') { bump(st, 'shotsOutBox'); bump(st, 'goalsOutBox'); }
    if (e.bigChance) bump(st, 'bigChances');
  }
  return out;
}

/* ------------------------------ team figures ------------------------------- */

/** The match centre's extra team figures for a (period-scoped) state — both
 *  sides at once, so a row shows for both or neither. */
export function footballDepthTeamStats(s: FootballState): Record<Side, Record<string, number>> {
  const out: Record<Side, Record<string, number>> = { home: {}, away: {} };
  const t = s.track;
  const count = (side: Side, pred: (k: FootballState['stats'][number]) => boolean) => (s.stats ?? []).filter((e) => e.side === side && pred(e)).length;
  const goals = (side: Side, pred: (e: FootballState['events'][number]) => boolean = () => true) => (s.events ?? []).filter((e) => e.type === 'goal' && e.side === side && pred(e)).length;
  for (const side of SIDES) {
    const o = out[side];
    const opp: Side = side === 'home' ? 'away' : 'home';
    if (t?.shots !== false) {
      // Opta: shots = on target + off target + blocked (a goal is on target)
      o.shotsOffTarget = count(side, (e) => e.kind === 'shot' && !e.onTarget && !e.blocked);
    }
    if (shotDetailTracked(s)) {
      const shotsIn = count(side, (e) => e.kind === 'shot' && e.zone === 'box') + goals(side, (e) => e.zone === 'box');
      const shotsOut = count(side, (e) => e.kind === 'shot' && e.zone === 'out') + goals(side, (e) => e.zone === 'out');
      o.shotsInBox = shotsIn;
      o.shotsOutBox = shotsOut;
      o.bigChances = count(side, (e) => e.kind === 'shot' && !!e.bigChance) + goals(side, (e) => !!e.bigChance);
      o.bigChancesMissed = count(side, (e) => e.kind === 'shot' && !!e.bigChance);
      o.woodwork = count(side, (e) => e.kind === 'shot' && !!e.woodwork);
    }
    if (keyPassesTracked(s)) o.keyPasses = count(side, (e) => e.kind === 'keyPass');
    if (clearancesTracked(s)) o.clearances = count(side, (e) => e.kind === 'clearance');
    if (setPiecesTracked(s)) {
      o.goalKicks = count(side, (e) => e.kind === 'goalKick');
      o.throwIns = count(side, (e) => e.kind === 'throwIn');
    }
    // team save %: saves ÷ shots on target faced (saves + goals let in; an own
    // goal is no shot the keeper faced) — only when saves were tracked
    if (t?.saves !== false) {
      const sv = count(side, (e) => e.kind === 'save');
      putIf(o, 'savePct', pct(sv, sv + goals(opp)));
    }
  }
  // free, but only when the match had one (no "0 v 0" row on every match)
  const pensTaken = (side: Side) => goals(side, (e) => e.goalType === 'penalty') + count(side, (e) => e.kind === 'penaltyMissed');
  if (pensTaken('home') + pensTaken('away') > 0) {
    for (const side of SIDES) { out[side].penaltiesTaken = pensTaken(side); out[side].penaltyGoals = goals(side, (e) => e.goalType === 'penalty'); }
  }
  // round 2: only for a match that tracked them (the toggle, or one logged) —
  // a tracked match with none reads 0 v 0, an untracked one has no row
  const ruledOut = (side: Side) => (s.events ?? []).filter((e) => e.type === 'nogoal' && e.side === side).length;
  if (ruledOutTracked(s)) for (const side of SIDES) out[side].goalsRuledOut = ruledOut(side);
  // invasion batch 6: goals by situation — only once a goal carries one (an
  // older match, or one that never picked a situation, has no row)
  if ((s.events ?? []).some((e) => e.type === 'goal' && !!e.situation)) {
    for (const side of SIDES) {
      out[side].setPieceGoals = goals(side, isSetPieceGoal);
      out[side].fastBreakGoals = goals(side, (e) => e.situation === 'fastbreak');
    }
  }
  return out;
}

/** The depth keys the match didn't track, one per toggle (the panel's "not
 *  tracked" note names them; the other rows of a toggle simply don't show). */
export function footballDepthUntracked(s: FootballState): string[] {
  return [
    ...(shotDetailTracked(s) ? [] : ['bigChances']),
    ...(keyPassesTracked(s) ? [] : ['keyPasses']),
  ];
}

/** Possession % for the match summary — only when the match tracked it AND
 *  the ball changed hands (both sides have time on it): kick-off hands the
 *  ball to one side, so a scorer who never used the possession bar would
 *  otherwise read a false "100% – 0%". */
export function footballPossession(s: FootballState, now: number): { home: number; away: number } | undefined {
  if (!s.track?.possession || !s.possession) return undefined;
  const acc = { ...s.possession.acc };
  if (s.possession.side && s.possession.sinceAt && now) acc[s.possession.side] += Math.max(0, now - s.possession.sinceAt);
  if (acc.home <= 0 || acc.away <= 0) return undefined;
  return possessionPct(s, now);
}
