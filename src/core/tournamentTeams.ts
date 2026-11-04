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
