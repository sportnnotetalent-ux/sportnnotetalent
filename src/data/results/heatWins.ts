/**
 * Timed races, round 2 — who WON A HEAT in a round of a timed race (the
 * `heatWins` career key and the heat-win follower alert):
 *  - a heat / semi-final / repechage (ranked per heat): first in the heat;
 *  - a TIMED FINAL (a final run in several heats and ranked across them —
 *    the founder: these heats count too): the fastest in each heat, i.e. the
 *    best overall place among that heat's runners (an equal mark shares it).
 *    The overall winner also won their heat, so they get the heat win as well
 *    as the gold;
 *  - a single final, or Finals A / B (lettered races are placing races, not
 *    heats): nobody — a final won is a gold.
 * Pure (types only).
 */
import type { PhaseFormat, RankedEntry } from './model.ts';

/** A final run as lettered races (Finals A / B …) rather than heats. */
const letteredFinal = (f: Partial<Pick<PhaseFormat, 'races'>>, rows: RankedEntry[]): boolean =>
  (f.races?.length ?? 0) > 1 || rows.some((r) => r.entry.result.race != null);

/** Is this phase a timed final (a final run in more than one heat, ranked across them)? */
export function isTimedFinalRows(f: Pick<PhaseFormat, 'phase'> & Partial<Pick<PhaseFormat, 'races'>>, rows: RankedEntry[]): boolean {
  return f.phase === 'final' && !letteredFinal(f, rows) && new Set(rows.map((r) => r.entry.heat)).size > 1;
}

/**
 * The entry ids that won their heat in this phase. `rows` = the whole phase:
 * ranked per heat for a round, ranked across the heats for a final (as the
 * lock ranks it).
 */
export function heatWinnerIds(f: Pick<PhaseFormat, 'phase'> & Partial<Pick<PhaseFormat, 'races'>>, rows: RankedEntry[]): Set<string> {
  const out = new Set<string>();
  if (f.phase !== 'final') {
    for (const r of rows) if (r.position === 1) out.add(r.id);
    return out;
  }
  if (!isTimedFinalRows(f, rows)) return out;
  for (const h of new Set(rows.map((r) => r.entry.heat))) {
    const placed = rows.filter((r) => r.entry.heat === h && r.position != null);
    if (!placed.length) continue;
    const best = Math.min(...placed.map((r) => r.position as number));
    for (const r of placed) if (r.position === best) out.add(r.id);
  }
  return out;
}
