/**
 * Deep wave — weightlifting results commentary and session stats (IWF depth),
 * all DERIVED from the stored attempts (EntryResult.lifts), so a correction
 * rewrites them. Pure.
 *
 *  - decisionText: "good lift (3-0)", "no lift (1-2)", "no lift — jury
 *    reversed the referees' 2-1" (lights white–red, when recorded);
 *  - liftFeed: one item per attempt in competition order (the attempt
 *    number `seq`), plus the lead changing hands, totals, no-total ("bomb
 *    out"), the end of the snatch and the medals — newest first;
 *  - liftSessionStats: make rate per lift, openers, average jump, the
 *    referees' split decisions, jury reversals, weight changes, the margin.
 */
import type { LiftAttempt, ResultEntry } from './model.ts';
import { LIFTS, LIFT_LABEL, LIFT_SHORT, activeLift, rankLift, taken, type Lift } from './weightlifting.ts';
import { FeedBuilder, MEDAL_ICON, ordinalOf, type FeedItem } from './insightFeed.ts';

/** The referees' lights as white–red ("3-0", "2-1"), or null when not entered. */
export function lightsScore(a: Pick<LiftAttempt, 'lights'>): string | null {
  if (!a.lights || a.lights.length !== 3) return null;
  const w = a.lights.filter(Boolean).length;
  return `${w}-${3 - w}`;
}

/** "good lift (3-0)" · "no lift (1-2)" · "no lift — jury reversed the referees' 2-1" · "declined". */
export function decisionText(a: LiftAttempt): string {
  if (a.pass) return 'declined';
  if (a.good === undefined) return 'declared';
  const base = a.good ? 'good lift' : 'no lift';
  const ls = lightsScore(a);
  if (a.jury) return `${base} — jury reversed the referees${ls ? `' ${ls}` : ''}`;
  return ls ? `${base} (${ls})` : base;
}

/** "(changed from 87 kg)" / "(changed twice: 86 → 87 → 88 kg)" — '' without changes. */
export function changeText(a: LiftAttempt): string {
  const c = a.chg ?? [];
  if (!c.length) return '';
  return c.length === 1 ? `(changed from ${c[0]} kg)` : `(changed ${c.length === 2 ? 'twice' : `${c.length} times`}: ${[...c, a.kg].join(' → ')} kg)`;
}

const inPlay = (e: ResultEntry) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');

interface LiftEvent { e: ResultEntry; lift: Lift; i: number; a: LiftAttempt; seq: number }

/** Every taken attempt in competition order (attempts without a number — added on the grid — last). */
function liftEvents(entries: ResultEntry[]): LiftEvent[] {
  const evs: LiftEvent[] = [];
  for (const e of entries) for (const lift of LIFTS) (e.result?.lifts?.[lift] ?? []).forEach((a, i) => { if (taken(a)) evs.push({ e, lift, i, a, seq: a.seq ?? 1e9 }); });
  return evs.sort((x, y) => (x.seq - y.seq) || (LIFTS.indexOf(x.lift) - LIFTS.indexOf(y.lift)) || (x.i - y.i) || ((x.e.result.order ?? 99) - (y.e.result.order ?? 99)));
}

/**
 * The session's commentary, newest first. Each attempt reads
 * "Sn 2 · Asha Rao 88 kg — good lift (3-0)"; a good lift that takes the lead,
 * a new total, a lifter's last failed attempt with no good lift in that lift
 * ("no total"), the snatch standings once the snatch is over and the medals
 * once every attempt is taken get their own lines.
 */
export function liftFeed(entries: ResultEntry[]): FeedItem[] {
  const fb = new FeedBuilder();
  const evs = liftEvents(entries);
  if (!evs.length) return [];
  const st = new Map<string, { sn?: number; cj?: number; total?: number; good: Record<Lift, boolean>; taken: Record<Lift, number> }>();
  let snLead: string | undefined, totLead: string | undefined;
  const lastSnatch = evs.map((v) => v.lift).lastIndexOf('snatch');
  const snatchOver = activeLift(entries) !== 'snatch';
  evs.forEach((v, k) => {
    const name = v.e.name;
    const s = st.get(v.e.id) ?? { good: { snatch: false, cj: false }, taken: { snatch: 0, cj: 0 } };
    st.set(v.e.id, s);
    s.taken[v.lift] += 1;
    const ch = changeText(v.a);
    fb.push(`${name} ${v.a.kg} kg${ch ? ` ${ch}` : ''} — ${decisionText(v.a)}`, { tag: `${LIFT_SHORT[v.lift]} ${v.i + 1}`, tone: v.a.pass ? 'info' : v.a.good ? 'good' : 'bad' });
    if (v.a.good) {
      s.good[v.lift] = true;
      if (v.lift === 'snatch') {
        if (s.sn == null || v.a.kg > s.sn) s.sn = v.a.kg;
        const lead = snLead ? st.get(snLead) : undefined;
        // strictly heavier takes the lead (equal: whoever lifted it first keeps it — IWF)
        if (snLead !== v.e.id && (!lead || (s.sn ?? 0) > (lead.sn ?? 0))) {
          snLead = v.e.id;
          fb.push(`${name} leads the snatch — ${s.sn} kg`, { tone: 'lead' });
        }
      } else {
        s.cj = Math.max(s.cj ?? 0, v.a.kg);
        if (s.sn != null) {
          s.total = s.sn + s.cj;
          const lead = totLead ? st.get(totLead) : undefined;
          const takes = totLead !== v.e.id && (!lead || s.total > (lead.total ?? 0));
          fb.push(`${name}: total ${s.total} kg (${s.sn} + ${s.cj})`, { tone: takes ? 'lead' : 'info' });
          if (takes) { totLead = v.e.id; fb.push(`${name} leads on total — ${s.total} kg`, { tone: 'lead' }); }
        }
      }
    } else {
      if (s.taken[v.lift] >= 3 && !s.good[v.lift]) fb.push(`${name}: no total — no good ${v.lift === 'snatch' ? 'snatch' : 'clean & jerk'}`, { tone: 'bad' });
    }
    if (k === lastSnatch && snatchOver) {
      const top = rankLift(entries, 'snatch').filter((r) => r.position != null).slice(0, 3);
      if (top.length) fb.push(`Snatch over — ${top.map((r) => `${r.label}. ${r.entry.name} ${r.best} kg`).join(' · ')}`, { tone: 'info', tag: 'Sn' });
    }
  });
  if (activeLift(entries) == null) {
    const podium = rankLift(entries, 'total').filter((r) => r.position != null && r.position <= 3);
    if (podium.length) fb.push(podium.map((r) => `${MEDAL_ICON[r.position!]} ${r.entry.name} ${r.best} kg`).join(' · '), { tone: 'medal', tag: 'Result' });
  }
  return fb.newestFirst();
}

/* ------------------------------ session stats ------------------------------ */

export interface LiftLiftStats {
  /** attempts taken (declined ones not counted) and good lifts */
  attempted: number;
  made: number;
  declined: number;
  /** first attempts (openers) made / taken */
  openMade: number;
  openAttempted: number;
  /** the heaviest good lift */
  best?: { kg: number; name: string };
  /** the average increase between a lifter's consecutive attempts (kg, 1 dp) */
  avgJump?: number;
}

export interface LiftSessionStats {
  /** lifters who took at least one attempt */
  lifters: number;
  snatch: LiftLiftStats;
  cj: LiftLiftStats;
  /** lifters with no total, and the lift that did it */
  noTotal: { name: string; lift: Lift }[];
  /** the referees' lights, when entered: decisions entered with lights, unanimous (3-0 / 0-3), split (2-1 / 1-2) */
  lights?: { recorded: number; unanimous: number; split: number };
  /** jury reversals (only when there were any) */
  jury?: number;
  /** declared-weight changes (only when there were any) */
  changes?: { total: number; attempts: number };
  /** the winner on total: margin over 2nd, a tie settled by who lifted first, their snatch place */
  winner?: { name: string; total: number; margin?: number; liftedFirst?: boolean; snatchPlace?: number };
}

function liftStats(entries: ResultEntry[], lift: Lift): LiftLiftStats {
  const out: LiftLiftStats = { attempted: 0, made: 0, declined: 0, openMade: 0, openAttempted: 0 };
  let jumps = 0, jumpSum = 0;
  for (const e of entries) {
    const list = e.result?.lifts?.[lift] ?? [];
    list.forEach((a, i) => {
      if (!taken(a)) return;
      if (a.pass) { out.declined += 1; return; }
      out.attempted += 1;
      if (i === 0) out.openAttempted += 1;
      if (a.good) {
        out.made += 1;
        if (i === 0) out.openMade += 1;
        if (!out.best || a.kg > out.best.kg) out.best = { kg: a.kg, name: e.name };
      }
      const prev = i > 0 ? list[i - 1] : undefined;
      if (prev && taken(prev)) { jumps += 1; jumpSum += a.kg - prev.kg; }
    });
  }
  if (jumps) out.avgJump = Math.round((jumpSum / jumps) * 10) / 10;
  return out;
}

/** The session's numbers (only what was recorded — no lights, no line about lights). */
export function liftSessionStats(entries: ResultEntry[]): LiftSessionStats {
  const field = entries.filter(inPlay);
  const lifters = field.filter((e) => LIFTS.some((l) => (e.result.lifts?.[l] ?? []).some(taken))).length;
  const out: LiftSessionStats = { lifters, snatch: liftStats(field, 'snatch'), cj: liftStats(field, 'cj'), noTotal: [] };
  let rec = 0, una = 0, split = 0, jury = 0, chTotal = 0, chAtt = 0;
  for (const e of field) {
    for (const l of LIFTS) {
      const list = e.result.lifts?.[l] ?? [];
      for (const a of list) {
        if (a.lights?.length === 3) { rec += 1; const w = a.lights.filter(Boolean).length; if (w === 0 || w === 3) una += 1; else split += 1; }
        if (a.jury) jury += 1;
        if (a.chg?.length) { chTotal += a.chg.length; chAtt += 1; }
      }
      if (list.filter(taken).length >= 3 && !list.some((a) => a.good)) out.noTotal.push({ name: e.name, lift: l });
    }
  }
  if (rec) out.lights = { recorded: rec, unanimous: una, split };
  if (jury) out.jury = jury;
  if (chTotal) out.changes = { total: chTotal, attempts: chAtt };
  const total = rankLift(entries, 'total').filter((r) => r.position != null);
  if (total.length) {
    const w = total[0], second = total.find((r) => r.id !== w.id);
    const sn = rankLift(entries, 'snatch').find((r) => r.id === w.id);
    out.winner = {
      name: w.entry.name, total: w.best ?? 0,
      ...(second?.best != null && w.best != null ? { margin: w.best - second.best } : {}),
      ...(second?.best != null && second.best === w.best ? { liftedFirst: true } : {}),
      ...(sn?.position != null ? { snatchPlace: sn.position } : {}),
    };
  }
  return out;
}

/** "12/18 good (67%) · openers 5/6 · best Asha Rao 88 kg · average jump +2.3 kg" */
export function liftStatsLine(s: LiftLiftStats): string {
  if (!s.attempted && !s.declined) return '';
  const pct = s.attempted ? ` (${Math.round((s.made / s.attempted) * 100)}%)` : '';
  return [
    `${s.made}/${s.attempted} good${pct}`,
    s.openAttempted ? `openers ${s.openMade}/${s.openAttempted}` : '',
    s.best ? `best ${s.best.name} ${s.best.kg} kg` : '',
    s.avgJump != null ? `average jump +${s.avgJump} kg` : '',
    s.declined ? `${s.declined} declined` : '',
  ].filter(Boolean).join(' · ');
}

/** "Asha Rao wins with 198 kg — by 3 kg; 2nd after the snatch" / "… — level on total, lifted it first". */
export function winnerLine(w: NonNullable<LiftSessionStats['winner']>, done: boolean): string {
  const how = w.liftedFirst ? 'level on total, lifted it first' : w.margin != null ? `by ${w.margin} kg` : '';
  const from = w.snatchPlace && w.snatchPlace > 1 ? `${ordinalOf(w.snatchPlace)} after the snatch` : '';
  return `${w.name} ${done ? 'wins' : 'leads'} with ${w.total} kg${how ? ` — ${how}` : ''}${from ? `; ${from}` : ''}`;
}

/** The label of a lift for stat rows. */
export const liftName = (l: Lift): string => LIFT_LABEL[l];
