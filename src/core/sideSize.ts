/** Two players a side score as doubles (founder 2026-11-06,
 *  docs/security/breaks/pairs-play-as-doubles.md). In a sport played as
 *  singles or doubles, the sides decide: both sides two players → 2 a side,
 *  both one → 1. Uneven or empty sides, and team / individual-only sports,
 *  change nothing. Returns the playersPerSide to set, or null. Pure. */
export function perSideFromRosters(
  kind: 'team' | 'individual' | 'both' | string | undefined,
  home: number,
  away: number,
  current: unknown,
): 1 | 2 | null {
  if (kind !== 'both') return null;
  const cur = Number(current) === 2 ? 2 : 1;
  if (home === 2 && away === 2) return cur === 2 ? null : 2;
  if (home === 1 && away === 1) return cur === 1 ? null : 1;
  return null;
}
