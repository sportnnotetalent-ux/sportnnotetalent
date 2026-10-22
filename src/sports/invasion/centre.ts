/**
 * Deep wave (invasion-goal family) — the broadcast-style MATCH CENTRE model.
 * PURE. A match-centre page (Premier League / FIFA match centre, FIH and IHF
 * match statistics) shows the team-vs-team comparison in categories ("Top
 * stats", "Attack", "Penalty corners", "Goalkeeping", "Discipline"…), for the
 * whole match or one half / quarter.
 *
 * A category is just an ordered list of comparison rows (`CompareDef`, the
 * SD-23 vocabulary), so it reuses `comparisonRows` as is: a side's team
 * figure from the box source, else a derived rate over its rows, else the
 * rows' sum. A row neither side has is dropped, and a row the match didn't
 * track is listed as "not tracked" (D8) — never a false 0. A category with no
 * row left is hidden.
 */
import { comparisonRows, type BoxData, type BoxScope, type Comparison } from '../boxScore.ts';
import type { CompareDef, SportStatSchema } from '../statSchema.ts';

export interface CentreCategory {
  id: string;
  label: string;
  rows: CompareDef[];
}

const DASH = '–';

/** One category's comparison for a scope. A rate neither side has a figure
 *  for ("–" v "–": no 6 m shots yet) is dropped, like a missing count. */
export function centreComparison<S extends string>(schema: SportStatSchema<S>, data: BoxData, scope: BoxScope, cat: CentreCategory): Comparison {
  const cmp = comparisonRows({ ...schema, compare: cat.rows }, data, scope);
  return { ...cmp, rows: cmp.rows.filter((r) => !(r.home === DASH && r.away === DASH)) };
}

/** The categories with at least one row to show (or a "not tracked" note). */
export function visibleCategories<S extends string>(schema: SportStatSchema<S>, data: BoxData, scope: BoxScope, cats: CentreCategory[]): CentreCategory[] {
  return cats.filter((c) => {
    const cmp = centreComparison(schema, data, scope, c);
    return cmp.rows.length > 0 || cmp.untracked.length > 0;
  });
}

/** Every key the categories name (for a coverage check in tests). */
export const centreKeys = (cats: CentreCategory[]): string[] =>
  [...new Set(cats.flatMap((c) => c.rows.map((r) => (typeof r === 'string' ? r : r.key))))];

/** Percent 0–100 rounded, or undefined when the denominator is 0. */
export const pct = (num: number, den: number): number | undefined => (den > 0 ? Math.round((num / den) * 100) : undefined);

/** Put `v` on `out[key]` only when it is a number (an undefined rate stays off
 *  the panel instead of reading 0%). */
export function putIf(out: Record<string, number>, key: string, v: number | undefined): void {
  if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
}
