/** One sport picker everywhere (UI audit step 4, docs/security/breaks/one-of-each.md):
 *  your sports first, then the chosen ones, then the everyday ones; the rest
 *  behind "More sports…". Pure. */

/** The everyday sports shown before "More sports…" (the MVP list). */
export const EVERYDAY_SPORTS = ['football', 'basketball', 'kabaddi', 'badminton', 'tennis', 'pickleball', 'padel'] as const;

/** The chips to show: `mine` (the person's sports), then anything `selected`,
 *  then the everyday sports — or every known sport after "More". Unknown ids
 *  are dropped; nothing appears twice. `limitTo` (e.g. a club's sports) wins. */
export function sportChips(o: { known: readonly string[]; mine?: readonly string[]; selected?: readonly string[]; showAll: boolean; limitTo?: readonly string[] }): string[] {
  const known = new Set(o.limitTo?.length ? o.limitTo.filter((s) => o.known.includes(s)) : o.known);
  const ok = (s: unknown): s is string => typeof s === 'string' && known.has(s);
  if (o.limitTo?.length) return [...known];
  const lead = [...new Set([...(o.mine ?? []), ...(o.selected ?? []), ...EVERYDAY_SPORTS].filter(ok))];
  return o.showAll ? [...lead, ...[...known].filter((s) => !lead.includes(s))] : lead;
}

/** Whether "More sports…" still has anything to show. */
export const hasMore = (shown: readonly string[], known: readonly string[]): boolean => known.some((s) => !shown.includes(s));
