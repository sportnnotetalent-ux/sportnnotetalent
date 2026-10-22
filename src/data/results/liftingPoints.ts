/**
 * Round 2 (precision-strength) — best-lifter points across bodyweight
 * categories: Sinclair (weightlifting.ts) and Robi (robi.ts), per session for
 * the results sheet and across the meet for the best-lifter lists. Pure.
 */
import type { Category, ResultEntry } from './model.ts';
import { categoryLabel } from './model.ts';
import { summarizeLifts } from './marks.ts';
import { sinclairTotal } from './weightlifting.ts';
import { ruleOf, sportRule, type CompRules } from './competitionRules.ts';
import { robiPoints, robiRef } from './robi.ts';

/* ------------------------------ best lifter ------------------------------ */

export interface BestLifterRow {
  id: string; athleteId?: string; name: string; team?: string;
  /** "Men 79 kg" */
  category: string;
  total: number; bw?: number;
  sinclair: number | null;
  robi: number | null;
  /** the reference total the Robi points used */
  ref?: number;
}

/** One session's lifters with a total: Sinclair (with the meet's coefficients) and Robi points. */
export function sessionBestLifter(entries: ResultEntry[], f: { category?: Category; rules?: CompRules | null }, period?: unknown): BestLifterRow[] {
  const ref = robiRef(f.category, f.rules);
  const out: BestLifterRow[] = [];
  for (const e of entries) {
    if (['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok')) continue;
    const total = summarizeLifts(e.result?.lifts).total;
    if (total == null) continue;
    const bw = e.result.bodyweight;
    out.push({
      id: e.id, ...(e.athleteId ? { athleteId: e.athleteId } : {}), name: e.name, ...(e.team?.name ? { team: e.team.name } : {}),
      category: categoryLabel(f.category), total, ...(bw != null ? { bw } : {}),
      sinclair: sinclairTotal(total, bw, f.category?.gender, period ?? ruleOf(f.rules, 'sinclairPeriod')),
      robi: robiPoints(total, ref?.kg), ...(ref ? { ref: ref.kg } : {}),
    });
  }
  return out;
}

/**
 * The meet's best lifters by Sinclair or by Robi points, across every finished
 * session (the phase's own rules, then the tournament's — `fmt`). Lifters
 * without that figure are left out.
 */
export function bestLifters(
  events: { category?: Category; phases: { status: string; format: { rules?: CompRules; category?: Category }; entries: ResultEntry[] }[] }[],
  by: 'sinclair' | 'robi',
  fmt?: Record<string, unknown> | null,
): BestLifterRow[] {
  const rows: BestLifterRow[] = [];
  for (const ev of events) {
    const fin = ev.phases.find((p) => p.status === 'completed');
    if (!fin) continue;
    const rules = { ...pickRules(fmt), ...(fin.format.rules ?? {}) };
    rows.push(...sessionBestLifter(fin.entries, { category: fin.format.category ?? ev.category, rules }, sportRule(fmt, 'sinclairPeriod')));
  }
  return rows.filter((r) => r[by] != null).sort((a, b) => (b[by]! - a[by]!) || a.name.localeCompare(b.name));
}

/** The tournament-level Robi references (`formats.weightlifting`) as phase-style rules. */
function pickRules(fmt?: Record<string, unknown> | null): CompRules {
  const out: CompRules = {};
  for (const k of ['robiRefM', 'robiRefF', 'sinclairPeriod']) {
    const v = fmt?.[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}
