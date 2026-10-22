/**
 * Deep wave (court-team family) — netball's broadcast-depth figures, DERIVED
 * from the event log. PURE: the team-stats panel, the commentary, the box
 * rows and `statTotals` read these, so corrections re-derive everything and
 * an old log replays to exactly what it showed before.
 *
 * Sources: World Netball / Champion Data match statistics as used by Suncorp
 * Super Netball, the Netball World Cup and the Netball Super League — goals
 * and attempts by shooter, super shots (where used), centre pass receives,
 * feeds and goal assists, gains (intercepts, deflections with gain, defensive
 * rebounds, pick-ups, the opposition's turnovers), turnovers by type,
 * penalties, centre-pass-to-goal and gain-to-goal conversion, by quarter.
 *
 * Coverage (D8 — never a false 0): CPR, deflection outcomes, pick-ups and
 * turnover types exist only on plays logged with their switch on; a figure
 * the match never captured is left out (with a note when only part was).
 */
import type { StatTotalsEntry } from '../types';
import { goalPoints, lineupAt, other, periodStarted, POSITIONS, secInPeriod, TURNOVER_TYPES, type NetballEvent, type NetballState, type Pos, type Side, type TurnoverType } from './engine.ts';

export type NbScope = 'all' | number;
const inScope = (e: Pick<NetballEvent, 'period'>, scope: NbScope) => scope === 'all' || e.period === scope;

/** Events in game order: period, then the game second, then log order (an
 *  edit re-entered at its original moment lands where it happened). */
export function nbGameOrder(s: NetballState): { e: NetballEvent; i: number }[] {
  return s.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.period - b.e.period || a.e.sec - b.e.sec || a.i - b.i);
}

/* ------------------------------ centre passes ------------------------------ */

export interface CentreSplit {
  /** per period (index 0 = period 1): centre passes taken, centre-pass goals, goals from gains */
  periods: { taken: Record<Side, number>; cpGoals: Record<Side, number>; gainGoals: Record<Side, number> }[];
  /** each goal (by id): scored from the side's own centre pass, or from a gain */
  goalFrom: Map<string, 'cp' | 'gain'>;
  /** each centre pass taken, in order: its side and period (for CPR coverage) */
  passes: { side: Side; period: number }[];
}

/** `centreInfo` (engine.ts), period by period: the same walk — centre passes
 *  alternate through the match, a quarter starts with the one due, a goal at
 *  the buzzer leaves its centre owed, the scorer's "Centre" overrides — with
 *  each pass and goal kept in its period. Its sums equal `centreInfo`. */
export function centreSplit(s: NetballState): CentreSplit {
  const zero = () => ({ home: 0, away: 0 });
  const periods: CentreSplit['periods'] = [];
  const goalFrom = new Map<string, 'cp' | 'gain'>();
  const passes: CentreSplit['passes'] = [];
  let due: Side | undefined = s.firstCentre;
  let owed = true;
  let last: Side | undefined;
  for (let p = 1; p <= s.period; p++) {
    const per = { taken: zero(), cpGoals: zero(), gainGoals: zero() };
    periods.push(per);
    if (p > 1 && !owed && last) { due = other(last); owed = true; }
    let lastGoal: NetballEvent | undefined;
    for (const e of s.events) {
      if (e.period !== p) continue;
      if (e.type === 'centre' && e.side) { due = e.side; owed = true; continue; }
      if (e.type !== 'goal' || !e.side) continue;
      lastGoal = e;
      if (due) {
        last = due; per.taken[due]++; passes.push({ side: due, period: p });
        if (e.side === due) { per.cpGoals[due]++; goalFrom.set(e.id, 'cp'); } else { per.gainGoals[e.side]++; goalFrom.set(e.id, 'gain'); }
        due = other(last);
      } else {
        last = e.side; due = other(e.side);
      }
      owed = true;
    }
    const closed = p < s.period || s.ended;
    if (closed && owed && due) {
      const len = s.played[p - 1];
      const atBuzzer = !!lastGoal && len != null && secInPeriod(s, lastGoal) >= len - 1;
      if (!atBuzzer) { last = due; per.taken[due]++; passes.push({ side: due, period: p }); owed = false; }
    }
  }
  if (!s.ended && due && owed && periodStarted(s) && periods[s.period - 1]) { periods[s.period - 1].taken[due]++; passes.push({ side: due, period: s.period }); }
  return { periods, goalFrom, passes };
}

/* --------------------------------- coverage --------------------------------- */

export interface NbCoverage {
  /** centre pass receives logged, of the centre passes taken (toss recorded) */
  cpr: { logged: number; of: number };
  /** deflections with an outcome (gain / no gain), of all deflections */
  deflections: { typed: number; of: number };
  /** turnovers with a type, of all turnovers */
  turnovers: { typed: number; of: number };
  /** rebounds linked to the missed shot (offensive / defensive known), of all */
  rebounds: { linked: number; of: number };
  /** any feed / goal assist logged ("Feeds & rebounds") */
  feeds: boolean;
  /** the format plays super shots */
  superShot: boolean;
  /** gains are tracked (switch on, or a play carries gain detail) */
  gains: boolean;
}

export function nbCoverage(s: NetballState, split = centreSplit(s)): NbCoverage {
  const stat = (k: string) => s.events.filter((e) => e.type === 'stat' && e.stat === k);
  const defl = stat('deflection'), tos = stat('turnover'), rebs = stat('rebound');
  const cprN = s.events.filter((e) => e.type === 'cpr').length;
  return {
    cpr: { logged: cprN, of: s.firstCentre ? split.passes.length : 0 },
    deflections: { typed: defl.filter((e) => typeof e.gain === 'boolean').length, of: defl.length },
    turnovers: { typed: tos.filter((e) => !!e.tt).length, of: tos.length },
    rebounds: { linked: rebs.filter((e) => !!e.ref && s.events.some((m) => m.id === e.ref && m.type === 'miss')).length, of: rebs.length },
    feeds: s.events.some((e) => (e.type === 'goal' || e.type === 'miss') && (e.secondId || e.secondName)),
    superShot: s.superShot === true || s.events.some((e) => e.points === 2 || e.ss === true),
    gains: s.trackGains === true || s.events.some((e) => (e.type === 'stat' && e.stat === 'pickup') || typeof e.gain === 'boolean'),
  };
}
export const cprOn = (s: NetballState, c: NbCoverage): boolean => s.trackCpr === true || c.cpr.logged > 0;

/* ------------------------------- team figures -------------------------------- */

export interface NbTeamFigures {
  goals: number; points: number; attempts: number;
  byPos: Record<'GS' | 'GA', { goals: number; attempts: number }>;
  superShots: number; superShotAttempts: number;
  feeds: number; goalAssists: number; cpr: number;
  intercepts: number; deflections: number; deflGain: number; deflNoGain: number; pickups: number;
  rebounds: number; oreb: number; dreb: number;
  turnovers: number; byType: Record<TurnoverType, number>;
  penalties: number; contacts: number; obstructions: number;
  warnings: number; suspensions: number; orderedOff: number; timeouts: number;
  /** centre passes / centre-pass goals / goals from gains (toss recorded) */
  centrePasses: number; cpGoals: number; gainGoals: number;
  /** ball-winning plays: intercepts + deflections with gain + defensive
   *  rebounds + pick-ups + the opposition's turnovers */
  gains: number;
}

/** A rebound's kind: offensive when the rebounder's side took the missed shot. */
export function reboundKind(s: NetballState, e: NetballEvent): 'off' | 'def' | undefined {
  if (e.type !== 'stat' || e.stat !== 'rebound' || !e.ref) return undefined;
  const m = s.events.find((x) => x.id === e.ref && x.type === 'miss');
  if (!m || !m.side || !e.side) return undefined;
  return m.side === e.side ? 'off' : 'def';
}

export function nbTeamFigures(s: NetballState, side: Side, scope: NbScope = 'all', split = centreSplit(s)): NbTeamFigures {
  const f: NbTeamFigures = {
    goals: 0, points: 0, attempts: 0, byPos: { GS: { goals: 0, attempts: 0 }, GA: { goals: 0, attempts: 0 } },
    superShots: 0, superShotAttempts: 0, feeds: 0, goalAssists: 0, cpr: 0,
    intercepts: 0, deflections: 0, deflGain: 0, deflNoGain: 0, pickups: 0, rebounds: 0, oreb: 0, dreb: 0,
    turnovers: 0, byType: Object.fromEntries(TURNOVER_TYPES.map((t) => [t, 0])) as Record<TurnoverType, number>,
    penalties: 0, contacts: 0, obstructions: 0, warnings: 0, suspensions: 0, orderedOff: 0, timeouts: 0,
    centrePasses: 0, cpGoals: 0, gainGoals: 0, gains: 0,
  };
  let oppTurnovers = 0;
  for (const e of s.events) {
    if (!inScope(e, scope)) continue;
    if (e.side !== side) {
      if (e.side && e.type === 'stat' && e.stat === 'turnover') oppTurnovers++;
      continue;
    }
    const bp = e.pos === 'GS' || e.pos === 'GA' ? f.byPos[e.pos] : undefined;
    switch (e.type) {
      case 'goal':
        f.goals++; f.attempts++; f.points += goalPoints(e);
        if (bp) { bp.goals++; bp.attempts++; }
        if (e.points === 2) { f.superShots++; f.superShotAttempts++; }
        if (e.secondId || e.secondName) { f.goalAssists++; f.feeds++; }
        break;
      case 'miss':
        f.attempts++; if (bp) bp.attempts++;
        if (e.ss) f.superShotAttempts++;
        if (e.secondId || e.secondName) f.feeds++;
        break;
      case 'cpr': f.cpr++; break;
      case 'stat':
        if (e.stat === 'intercept') f.intercepts++;
        else if (e.stat === 'deflection') { f.deflections++; if (e.gain === true) f.deflGain++; else if (e.gain === false) f.deflNoGain++; }
        else if (e.stat === 'pickup') f.pickups++;
        else if (e.stat === 'turnover') { f.turnovers++; if (e.tt) f.byType[e.tt]++; }
        else if (e.stat === 'rebound') { f.rebounds++; const k = reboundKind(s, e); if (k === 'off') f.oreb++; else if (k === 'def') f.dreb++; }
        break;
      case 'penalty': f.penalties++; if (e.penalty === 'contact') f.contacts++; else if (e.penalty === 'obstruction') f.obstructions++; break;
      case 'sanction': if (e.sanction === 'warning') f.warnings++; else if (e.sanction === 'suspension') f.suspensions++; else if (e.sanction === 'off') f.orderedOff++; break;
      case 'timeout': f.timeouts++; break;
      default: break;
    }
  }
  if (s.firstCentre) {
    const pers = scope === 'all' ? split.periods : split.periods.slice(scope - 1, scope);
    for (const p of pers) { f.centrePasses += p.taken[side]; f.cpGoals += p.cpGoals[side]; f.gainGoals += p.gainGoals[side]; }
  }
  f.gains = f.intercepts + f.deflGain + f.dreb + f.pickups + oppTurnovers;
  return f;
}

/* ------------------------------ per-player keys ------------------------------ */

/** The deep line keys (statTotals-only: never credited live). */
export const NB_DEEP_KEYS = ['centrePassReceives', 'pickups', 'deflectionsGain', 'deflectionsNoGain', 'gains', 'superShots', 'superShotAttempts'] as const;

/** Which deep keys this match owns — each only when it was tracked. */
export function nbDeepKeys(s: NetballState, c = nbCoverage(s)): string[] {
  const out: string[] = [];
  if (cprOn(s, c)) out.push('centrePassReceives');
  if (c.gains) out.push('pickups', 'deflectionsGain', 'deflectionsNoGain', 'gains');
  if (c.superShot) out.push('superShots', 'superShotAttempts');
  return out;
}

/** One play's deep credits to its player (by id, else name). A player's
 *  gains = intercepts + deflections with gain + defensive rebounds + pick-ups. */
export function nbDeepCredits(s: NetballState, e: NetballEvent, keys: Set<string>): { id?: string; name?: string; stats: Record<string, number> } | undefined {
  if (!e.side || e.official || (!e.playerId && !e.playerName)) return undefined;
  const st: Record<string, number> = {};
  if (e.type === 'cpr') st.centrePassReceives = 1;
  else if (e.type === 'goal' && e.points === 2) { st.superShots = 1; st.superShotAttempts = 1; }
  else if (e.type === 'miss' && e.ss) st.superShotAttempts = 1;
  else if (e.type === 'stat') {
    if (e.stat === 'pickup') { st.pickups = 1; st.gains = 1; }
    else if (e.stat === 'intercept') st.gains = 1;
    else if (e.stat === 'deflection' && e.gain === true) { st.deflectionsGain = 1; st.gains = 1; }
    else if (e.stat === 'deflection' && e.gain === false) st.deflectionsNoGain = 1;
    else if (e.stat === 'rebound' && reboundKind(s, e) === 'def') st.gains = 1;
  }
  const kept = Object.fromEntries(Object.entries(st).filter(([k]) => keys.has(k)));
  return Object.keys(kept).length ? { id: e.playerId, name: e.playerName, stats: kept } : undefined;
}

/** The deep keys per player id, for `statTotals` (merged by totals.ts). */
export function nbDeepTotals(s: NetballState): { keys: string[]; lines: Record<string, StatTotalsEntry> } {
  const keys = nbDeepKeys(s);
  const lines: Record<string, StatTotalsEntry> = {};
  if (!keys.length) return { keys, lines };
  const set = new Set(keys);
  for (const e of s.events) {
    const c = nbDeepCredits(s, e, set);
    if (!c?.id || !e.side) continue;
    const line = lines[c.id] ?? (lines[c.id] = { side: e.side, stats: {} });
    for (const [k, v] of Object.entries(c.stats)) line.stats[k] = (line.stats[k] ?? 0) + v;
  }
  return { keys, lines };
}

/** A player's position at a moment of the log (before event `i`). */
export function posAt(s: NetballState, side: Side, who: { id?: string; name?: string }, i: number): Pos | undefined {
  const l = lineupAt(s, side, i);
  return POSITIONS.find((p) => { const w = l[p]; return !!w && ((!!who.id && w.id === who.id) || (!who.id && !!who.name && w.name === who.name)); });
}
