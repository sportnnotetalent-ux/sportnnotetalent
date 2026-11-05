/** One answer to "which teams are in this tournament" (UI audit step 7,
 *  docs/security/breaks/tournament-teams.md): the registered teams plus any
 *  team already scheduled in one of its matches — so the setup checklist, the
 *  Manage row and the Teams tab always agree. Registered teams first. Pure. */
export function tournamentTeamIds(registered: readonly { id: string }[], matches: readonly { homeTeam: { id: string }; awayTeam: { id: string } }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: unknown) => { if (typeof id === 'string' && id && !seen.has(id)) { seen.add(id); out.push(id); } };
  for (const t of registered) add(t?.id);
  for (const m of matches) { add(m?.homeTeam?.id); add(m?.awayTeam?.id); }
  return out;
}

/** UI audit #47: a knockout tournament with games still to play (or none yet) —
 *  the table is "results so far", no medals until the final is done. */
export function knockoutInProgress(structure: string | null | undefined, matches: readonly { status: string }[]): boolean {
  if (structure !== 'knockout') return false;
  return matches.length === 0 || matches.some((m) => m.status !== 'completed' && m.status !== 'cancelled');
}

/** UI audit #45: games of the tournament not yet finished (cancelled ones don't count). */
export const gamesLeft = (matches: readonly { status: string }[]): number =>
  matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length;
