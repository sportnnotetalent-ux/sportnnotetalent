/**
 * Measured sports batch 6 (expert audit docs/sport-expert/measured.md P2,
 * breaks docs/security/breaks/measured-batch6.md) — small pure helpers the
 * entry screen and panels share:
 *
 *   precisionTrackOptions /   the precision sports' "Stats to track" per event
 *   eventRules /              (lights, jury, penalties, team arrows): the event's
 *   setPrecisionOverride      override wins over the Competition rule, which
 *                             locks once results exist — the override doesn't
 *   startCard                 athletics start conduct (TR 16.5): yellow, then DQ
 *   reAttempt                 weightlifting: a decision set aside (loading error)
 *   takeoverDq                swimming: an early take-over → SW 10.13 with the leg
 *
 * Every new key is additive; a row or phase without it reads as before. PURE.
 */
import type { DisciplineDef, EntryResult, LiftAttempt, PhaseFormat, TrackOverrides } from './model.ts';
import { ruleOf, type CompRules } from './competitionRules.ts';
import { archTeamOf } from './archeryDefs.ts';
import { dqReason, SWIM_DQ } from './swimming.ts';
import { takeoverEarly } from './raceDepth.ts';

/* ----------------------- precision "Stats to track" ----------------------- */

export type PrecisionTrackKey = 'wlLights' | 'wlJury' | 'shootPen' | 'archTeamArrows';
export const PRECISION_TRACK_KEYS: PrecisionTrackKey[] = ['wlLights', 'wlJury', 'shootPen', 'archTeamArrows'];

const POPT: Record<PrecisionTrackKey, { label: string; hint: string }> = {
  wlLights: { label: 'Referees’ lights', hint: 'the three lights on every attempt (3-0 / 2-1 in results and commentary)' },
  wlJury: { label: 'Jury reversals in view', hint: 'a “Jury reverses” button on each decision (any attempt can still be reversed from its cell)' },
  shootPen: { label: 'Penalty buttons in view', hint: 'a −2 button on each series and final shot (otherwise behind ⋯)' },
  archTeamArrows: { label: 'Arrows per archer', hint: 'each team’s arrows entered archer by archer → every archer’s own team-match average, 10s and X' },
};

/** The precision capture switches an EVENT can set for itself: lifting — lights and
 *  jury; shooting — penalties; archery team / mixed team — arrows per archer. [] elsewhere. */
export function precisionTrackOptions(def: Pick<DisciplineDef, 'key' | 'sport' | 'capture'>): { key: PrecisionTrackKey; label: string; hint: string }[] {
  const keys: PrecisionTrackKey[] = def.capture === 'lifts' ? ['wlLights', 'wlJury']
    : def.sport === 'shooting' ? ['shootPen']
      : def.sport === 'archery' && archTeamOf(def.key) ? ['archTeamArrows'] : [];
  return keys.map((key) => ({ key, ...POPT[key] }));
}

/**
 * The rules an event's panels read: the phase's Competition rules with the
 * event's own precision capture on top (`f.track`). Only a real boolean for a
 * key this event offers counts — anything else is ignored. No override → the
 * rules exactly as stored.
 */
export function eventRules(def: Pick<DisciplineDef, 'key' | 'sport' | 'capture'>, f: Partial<Pick<PhaseFormat, 'rules' | 'track'>>): CompRules {
  const base: CompRules = { ...(f.rules ?? {}) };
  const own = f.track;
  if (!own) return base;
  for (const o of precisionTrackOptions(def)) {
    const v = own[o.key];
    if (typeof v === 'boolean') base[o.key] = v;
  }
  return base;
}

/** The event's overrides after setting one precision switch; the meet's value drops the override. Undefined = none left. */
export function setPrecisionOverride(cur: TrackOverrides | null | undefined, key: PrecisionTrackKey, value: boolean, rules: CompRules | null | undefined): TrackOverrides | undefined {
  const next: TrackOverrides = { ...(cur ?? {}) };
  if (value === (ruleOf(rules, key) === true)) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}

/* --------------------------- athletics start cards --------------------------- */

/**
 * Athletics start conduct (TR 16.5, as remembered — verify): the first card in
 * the race is a yellow card (`scWarn`, still ranked); a second disqualifies
 * (DQ, TR 16.5 — a red card). A false start is the FS chip, not this.
 */
export function startCard(r: EntryResult): { step: 'warn' | 'out'; next: EntryResult } {
  if (r.scWarn !== true) return { step: 'warn', next: { ...r, scWarn: true } };
  return { step: 'out', next: { ...r, status: 'DQ', ruleRef: 'TR 16.5', reason: 'Second start-conduct card (red card)' } };
}

/* --------------------------- weightlifting re-attempt --------------------------- */

const decided = (a?: LiftAttempt) => !!a && a.good !== undefined && !a.pass;
const takenA = (a?: LiftAttempt) => !!a && (a.good !== undefined || !!a.pass);

/**
 * Weightlifting (IWF TCRR, verify the clause): the bar was loaded wrongly or a
 * technical fault happened — the decision on attempt `i` is set aside and the
 * lifter takes it again at the same weight. The attempt goes back to declared
 * (`reat`), so it is called again; a coach's later declaration stays, the app's
 * automatic one (it followed the old decision) goes. Only a decided (not
 * declined) attempt with no later attempt taken; anything else: unchanged.
 */
export function reAttempt(list: LiftAttempt[] | undefined, i: number): LiftAttempt[] {
  const l = [...(list ?? [])];
  const a = l[i];
  if (!decided(a) || l.slice(i + 1).some(takenA)) return l;
  l[i] = { kg: a.kg, reat: true, ...(a.rangeOk ? { rangeOk: true } : {}), ...(a.chg?.length ? { chg: a.chg } : {}) };
  const after = l[i + 1];
  if (after && after.auto && !takenA(after)) l.splice(i + 1);
  return l;
}

/* --------------------------- swimming take-over → DQ --------------------------- */

/**
 * A swimming relay whose take-over pads read earlier than −0.03 s on a leg
 * (SW 10.13): the DQ the take-off judge confirms, with that leg — the first
 * early leg. null when no reading is early, the team is already out, or the
 * event isn't a relay. The readings stay on the row.
 */
export function takeoverDq(def: Pick<DisciplineDef, 'key' | 'sport' | 'teamSize'>, r: EntryResult): EntryResult | null {
  if (def.sport !== 'swimming' || !def.teamSize || (r.status ?? 'ok') !== 'ok' || !Array.isArray(r.takeovers)) return null;
  const j = r.takeovers.findIndex((t) => typeof t === 'number' && takeoverEarly(t));
  if (j < 0) return null;
  const code = SWIM_DQ.find((c) => c.ref === 'SW 10.13')!;
  return { ...r, status: 'DQ', ruleRef: code.ref, reason: dqReason(code, j + 2, def.key) };
}
