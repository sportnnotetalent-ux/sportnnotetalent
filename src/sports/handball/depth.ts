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
 *    round 2: the minutes each side played with its goal empty
 *    (`emptyGoalMinutes`, the 7th-court-player time) on the game clock — per
 *    team on the match centre, and on the career of the keeper who was taken
 *    off (the one-tap "Empty goal" link names no court player, so the log
 *    can't say who the 7th court player was);
 *  - technical faults by kind (`trackFaultTypes`);
 *  - the shoot-out keeper's saves (`soSaves`, attempts that name him).
 * A figure the match didn't track stays off the panel (listed "not tracked").
 */
import { putIf, pct } from '../invasion/centre.ts';
import {
  goalEmpty, keeperAt, matchSec, periodLen, periodOffset, periodSec, shotOf, FAULT_KEY, FAULT_TYPES, SHOT_TYPES,
  type HandballState, type ShotType, type Side, type Who,
} from './engine.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const SIDES = ['home', 'away'] as const;

/** The field positions with a keeper line of their own (7 m keeps its keys). */
export const FIELD_SHOT_TYPES = SHOT_TYPES.filter((t) => t !== 'sevenM') as Exclude<ShotType, 'sevenM'>[];
/** Keeper saves / goals conceded per field position (derived keys). */
export const KEEPER_SAVE_KEY = Object.fromEntries(FIELD_SHOT_TYPES.map((t) => [t, `${t}Saves`])) as Record<Exclude<ShotType, 'sevenM'>, string>;
export const KEEPER_CONCEDED_KEY = Object.fromEntries(FIELD_SHOT_TYPES.map((t) => [t, `${t}Conceded`])) as Record<Exclude<ShotType, 'sevenM'>, string>;

/** Did either side play with an empty goal? */
export const emptyGoalUsed = (s: Pick<HandballState, 'events'>): boolean => s.events.some((e) => e.type === 'empty');
/** Technical-fault kinds tracked: a fault carries a kind. no-false-zeros
 *  NZC9 (wave 1): the toggle alone (on by default) no longer counts — it
 *  zero-filled every fault kind. */
export const faultTypesTracked = (s: Pick<HandballState, 'events'>): boolean =>
  s.events.some((e) => e.type === 'turnover' && !!e.fault);
/** 7 m won-by tracked: at least one logged. NZC10: the toggle alone (on by
 *  default) no longer counts — it wrote `sevenMDrawn` 0 on every career line. */
export const sevenMDrawnTracked = (s: Pick<HandballState, 'events'>): boolean =>
  s.events.some((e) => e.type === 'drawn');

/** The goals scored into an empty goal (by event index). */
export function emptyGoalIndexes(s: HandballState): Set<number> {
  const out = new Set<number>();
  if (!emptyGoalUsed(s)) return out;
  s.events.forEach((e, i) => { if (e.type === 'goal' && goalEmpty(s, other(e.side), i)) out.add(i); });
  return out;
}

/* ------------------- round 2: minutes with an empty goal ------------------- */

/** One spell of a side's goal standing empty (game-clock seconds). `keeper` =
 *  the keeper on duty when the goal was emptied (the one taken off). */
export interface EmptyGoalSpell { side: Side; from: number; to: number; keeper?: Who }

/** The empty-goal spells, read in log order exactly as `goalEmpty` reads them:
 *  "Empty goal" opens one (a second tap while empty doesn't), "keeper back" or
 *  a keeper set closes it, and one still open runs to `now` (the clock; with
 *  no clock run, the latest moment logged). Empty when the link was never used. */
export function emptyGoalSpells(s: HandballState, now = 0): EmptyGoalSpell[] {
  if (!emptyGoalUsed(s)) return [];
  const out: EmptyGoalSpell[] = [];
  const end = Math.max(matchSec(s, now), ...s.events.map((e) => e.sec));
  for (const side of SIDES) {
    let open: { from: number; keeper?: Who } | undefined;
    s.events.forEach((e, i) => {
      if (e.side !== side) return;
      if (e.type === 'empty' && e.on !== false) {
        if (!open) { const k = keeperAt(s, side, i); open = { from: e.sec, ...(k ? { keeper: k } : {}) }; }
      } else if ((e.type === 'empty' || e.type === 'gk') && open) {
        out.push({ side, from: open.from, to: Math.max(open.from, e.sec), ...(open.keeper ? { keeper: open.keeper } : {}) });
        open = undefined;
      }
    });
    if (open) out.push({ side, from: open.from, to: Math.max(open.from, end), ...(open.keeper ? { keeper: open.keeper } : {}) });
  }
  return out;
}

/** The game-clock windows actually played, one per period so far: a period
 *  ended early doesn't count its unplayed tail (a spell left open over the
 *  break counts only playing time). A period's events stretch its window when
 *  the clock wasn't run. */
export function playedWindows(s: HandballState, now = 0): [number, number][] {
  const n = Math.max(1, s.period);
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const from = periodOffset(s, p);
    const len = s.played[p - 1] ?? (p < s.period ? periodLen(s, p) : periodSec(s, now));
    const last = Math.max(from, ...s.events.filter((e) => e.period === p).map((e) => e.sec));
    return [from, Math.max(from + len, last)];
  });
}

const overlap = (a: number, b: number, w: [number, number]) => Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0]));
/** Seconds of `spells` inside the played windows (one period, or all). */
function spellSecs(s: HandballState, spells: EmptyGoalSpell[], scope: 'all' | number, now: number): number {
  const wins = playedWindows(s, now).filter((_, i) => scope === 'all' || i + 1 === scope);
  return spells.reduce((t, sp) => t + wins.reduce((a, w) => a + overlap(sp.from, sp.to, w), 0), 0);
}

/** Seconds a side played with its goal empty (a period, or the whole match). */
export const emptyGoalSecs = (s: HandballState, side: Side, scope: 'all' | number = 'all', now = 0): number =>
  spellSecs(s, emptyGoalSpells(s, now).filter((sp) => sp.side === side), scope, now);

/** Was the empty-goal time measurable — the link used, and some playing time
 *  on the clock with a goal empty? (No clock run: every moment is 0:00, so no
 *  minutes are shown rather than a false 0.) */
export const emptyGoalTimed = (s: HandballState, now = 0): boolean =>
  emptyGoalUsed(s) && emptyGoalSecs(s, 'home', 'all', now) + emptyGoalSecs(s, 'away', 'all', now) > 0;

/** Seconds → minutes to one decimal (a pulled keeper's spell is often under a minute). */
export const egMinutes = (secs: number): number => Math.round(secs / 6) / 10;

/** Per keeper id: the minutes his goal stood empty after he was taken off
 *  for a 7th court player (whole match; only keepers with such time). */
export function emptyGoalKeeperMinutes(s: HandballState, now = 0): Record<string, { side: Side; minutes: number }> {
  const out: Record<string, { side: Side; minutes: number }> = {};
  if (!emptyGoalTimed(s, now)) return out;
  const secs = new Map<string, { side: Side; secs: number }>();
  for (const sp of emptyGoalSpells(s, now)) {
    if (!sp.keeper?.id) continue;
    const r = secs.get(sp.keeper.id) ?? { side: sp.side, secs: 0 };
    r.secs += spellSecs(s, [sp], 'all', now);
    secs.set(sp.keeper.id, r);
  }
  for (const [id, r] of secs) if (r.secs > 0) out[id] = { side: r.side, minutes: egMinutes(r.secs) };
  return out;
}

/** Derived per-player keys: scorers' `emptyGoalGoals`, shoot-out keepers'
 *  `soSaves`, and (round 2) the taken-off keeper's `emptyGoalMinutes`
 *  (statTotals merges these with the keeper lines). */
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
  for (const [id, k] of Object.entries(emptyGoalKeeperMinutes(s))) add(id, k.side, 'emptyGoalMinutes', k.minutes);
  return out;
}

/** Team figures for the match centre (period scope; `now` = the clock for a
 *  goal that is empty right now). */
export function handballDepthFigures(s: HandballState, side: Side, scope: 'all' | number = 'all', now = 0): Record<string, number> {
  const inScope = (p: number) => scope === 'all' || p === scope;
  const out: Record<string, number> = {};
  const saves: Record<string, number> = {};
  const against: Record<string, number> = {};
  let allSaves = 0, allAgainst = 0, eg = 0;
  const empties = emptyGoalIndexes(s);
  const faults: Record<string, number> = {};
  let unsureGoals = 0, unsureShots = 0, passive = 0;
  s.events.forEach((e, i) => {
    if (!inScope(e.period)) return;
    // batch 6: a "Not sure" attempt counts overall, at no position
    const t = shotOf(e);
    if (e.side === side) {
      if (e.type === 'save') { allSaves++; if (t) saves[t] = (saves[t] ?? 0) + 1; }
      if (e.type === 'goal' && empties.has(i)) eg++;
      if (e.type === 'turnover' && e.fault) faults[FAULT_KEY[e.fault]] = (faults[FAULT_KEY[e.fault]] ?? 0) + 1;
      if (e.unsure && (e.type === 'goal' || e.type === 'miss')) { unsureShots++; if (e.type === 'goal') unsureGoals++; }
      if (e.type === 'passive') passive++;
    } else if (e.type === 'goal' && !empties.has(i)) {
      // a goal into an empty goal isn't a shot the keeper faced
      allAgainst++; if (t) against[t] = (against[t] ?? 0) + 1;
    }
  });
  putIf(out, 'savePct', pct(allSaves, allSaves + allAgainst));
  for (const t of SHOT_TYPES) putIf(out, `${t}SavePct`, pct(saves[t] ?? 0, (saves[t] ?? 0) + (against[t] ?? 0)));
  if (emptyGoalUsed(s)) out.emptyGoalGoals = eg;
  // round 2: the 7th-court-player time, both sides once either used it (and
  // the clock measured it)
  if (emptyGoalTimed(s, now)) out.emptyGoalMinutes = egMinutes(emptyGoalSecs(s, side, scope, now));
  if (faultTypesTracked(s)) for (const f of FAULT_TYPES) out[FAULT_KEY[f]] = faults[FAULT_KEY[f]] ?? 0;
  // batch 6: only on a match that has them (older matches keep their figures)
  if (s.events.some((e) => e.unsure && (e.type === 'goal' || e.type === 'miss'))) { out.unsureGoals = unsureGoals; out.unsureShots = unsureShots; }
  if (s.events.some((e) => e.type === 'passive')) out.passiveWarnings = passive;
  return out;
}

/** The depth keys the match didn't track (listed "not tracked"). The fault
 *  kinds just stay off the panel (seven "not tracked" labels would be noise). */
export function handballUntracked(s: HandballState): string[] {
  return sevenMDrawnTracked(s) ? [] : ['sevenMDrawn'];
}
