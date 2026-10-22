/**
 * Deep wave — handball (IHF) match-centre depth. PURE.
 *
 * Free (derived from the existing log, so every match shows it — including
 * older ones, whose save events always carried the attempt's shot type):
 *  - the IHF goalkeeper line by position: saves and goals conceded from 6 m,
 *    9 m, the wing, breakthroughs and fast breaks (7 m already existed), per
 *    keeper (statTotals, derived keys) and per team (save % by position);
 *  - team save % (saves ÷ shots on goal faced).
 * Only when it happened / was tracked:
 *  - empty goal (IHF 4:1, a 7th court player): goals scored into an empty
 *    goal (`emptyGoalGoals`, the IHF "EG" column) — the keeper isn't charged;
 *  - technical faults by kind (`trackFaultTypes`);
 *  - the shoot-out keeper's saves (`soSaves`, attempts that name him).
 * A figure the match didn't track stays off the panel (listed "not tracked").
 */
import { putIf, pct } from '../invasion/centre.ts';
import {
  goalEmpty, FAULT_KEY, FAULT_TYPES, SHOT_TYPES, type HandballState, type ShotType, type Side,
} from './engine.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The field positions with a keeper line of their own (7 m keeps its keys). */
export const FIELD_SHOT_TYPES = SHOT_TYPES.filter((t) => t !== 'sevenM') as Exclude<ShotType, 'sevenM'>[];
/** Keeper saves / goals conceded per field position (derived keys). */
export const KEEPER_SAVE_KEY = Object.fromEntries(FIELD_SHOT_TYPES.map((t) => [t, `${t}Saves`])) as Record<Exclude<ShotType, 'sevenM'>, string>;
export const KEEPER_CONCEDED_KEY = Object.fromEntries(FIELD_SHOT_TYPES.map((t) => [t, `${t}Conceded`])) as Record<Exclude<ShotType, 'sevenM'>, string>;

/** Did either side play with an empty goal? */
export const emptyGoalUsed = (s: Pick<HandballState, 'events'>): boolean => s.events.some((e) => e.type === 'empty');
/** Technical-fault kinds tracked (the toggle, or any fault carrying a kind). */
export const faultTypesTracked = (s: Pick<HandballState, 'track' | 'events'>): boolean =>
  s.track?.faultTypes === true || s.events.some((e) => e.type === 'turnover' && !!e.fault);
/** 7 m won-by tracked (the toggle, or any logged). */
export const sevenMDrawnTracked = (s: Pick<HandballState, 'track' | 'events'>): boolean =>
  s.track?.sevenMDrawn === true || s.events.some((e) => e.type === 'drawn');

/** The goals scored into an empty goal (by event index). */
export function emptyGoalIndexes(s: HandballState): Set<number> {
  const out = new Set<number>();
  if (!emptyGoalUsed(s)) return out;
  s.events.forEach((e, i) => { if (e.type === 'goal' && goalEmpty(s, other(e.side), i)) out.add(i); });
  return out;
}

/** Derived per-player keys: scorers' `emptyGoalGoals`, shoot-out keepers'
 *  `soSaves` (statTotals merges these with the keeper lines). */
export function handballDerivedCredits(s: HandballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const add = (id: string, side: Side, k: string, v: number) => {
    const l = (out[id] ??= { side, stats: {} });
    l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const i of emptyGoalIndexes(s)) {
    const e = s.events[i];
    if (e.playerId) add(e.playerId, e.side, 'emptyGoalGoals', 1);
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) if (k.keeperId) add(k.keeperId, other(side), 'soSaves', k.outcome === 'saved' ? 1 : 0);
  }
  return out;
}

/** Team figures for the match centre (period scope). */
export function handballDepthFigures(s: HandballState, side: Side, scope: 'all' | number = 'all'): Record<string, number> {
  const inScope = (p: number) => scope === 'all' || p === scope;
  const out: Record<string, number> = {};
  const saves: Record<string, number> = {};
  const against: Record<string, number> = {};
  let allSaves = 0, allAgainst = 0, eg = 0;
  const empties = emptyGoalIndexes(s);
  const faults: Record<string, number> = {};
  s.events.forEach((e, i) => {
    if (!inScope(e.period)) return;
    const t = e.shotType ?? 'nineM';
    if (e.side === side) {
      if (e.type === 'save') { allSaves++; saves[t] = (saves[t] ?? 0) + 1; }
      if (e.type === 'goal' && empties.has(i)) eg++;
      if (e.type === 'turnover' && e.fault) faults[FAULT_KEY[e.fault]] = (faults[FAULT_KEY[e.fault]] ?? 0) + 1;
    } else if (e.type === 'goal' && !empties.has(i)) {
      // a goal into an empty goal isn't a shot the keeper faced
      allAgainst++; against[t] = (against[t] ?? 0) + 1;
    }
  });
  putIf(out, 'savePct', pct(allSaves, allSaves + allAgainst));
  for (const t of SHOT_TYPES) putIf(out, `${t}SavePct`, pct(saves[t] ?? 0, (saves[t] ?? 0) + (against[t] ?? 0)));
  if (emptyGoalUsed(s)) out.emptyGoalGoals = eg;
  if (faultTypesTracked(s)) for (const f of FAULT_TYPES) out[FAULT_KEY[f]] = faults[FAULT_KEY[f]] ?? 0;
  return out;
}

/** The depth keys the match didn't track (listed "not tracked"). The fault
 *  kinds just stay off the panel (seven "not tracked" labels would be noise). */
export function handballUntracked(s: HandballState): string[] {
  return sevenMDrawnTracked(s) ? [] : ['sevenMDrawn'];
}
