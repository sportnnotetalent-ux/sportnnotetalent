/** Pick tournament teams, don't type them (founder 2026-11-06,
 *  docs/security/breaks/pick-tournament-teams.md): every team is one record,
 *  so Quick tournament searches the sport's real teams; a team not on
 *  SportnNote is quick-created with its captain's mobile. Pure. */
import { isValidPhone } from './phone.ts';

type T = { id: string; name: string; shortName?: string; sport: string; adhoc?: boolean | null; slotTournamentId?: string | null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
/** A real team of this sport (not a one-off side, not a slot). */
const real = (t: T, sport: string) => t.sport === sport && !t.adhoc && !t.slotTournamentId;

/** Teams matching `q` (2+ letters): names starting with it first, then containing it; picked ones hidden. */
export function searchPickTeams<X extends T>(teams: readonly X[], q: string, sport: string, picked: readonly string[], max = 20): X[] {
  const s = norm(q);
  if (s.length < 2) return [];
  const taken = new Set(picked);
  const hits = teams.filter((t) => real(t, sport) && !taken.has(t.id)
    && (norm(t.name).includes(s) || norm(t.shortName ?? '').startsWith(s)));
  const starts = (t: X) => (norm(t.name).startsWith(s) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name)).slice(0, max);
}

/** An existing real team of this sport with exactly this name (PK4). */
export function sameNameTeam<X extends T>(teams: readonly X[], name: string, sport: string): X | undefined {
  const n = norm(name);
  return n ? teams.find((t) => real(t, sport) && norm(t.name) === n) : undefined;
}

/** What stops a new team being made, or null (PK5/PK6). */
export function newTeamProblem(name: string, captainName: string, captainPhone: string): string | null {
  if (!name.trim()) return 'Type the team’s name.';
  if (!captainName.trim()) return 'Type the captain’s name.';
  if (!captainPhone.trim()) return 'Add the captain’s mobile — they get the invite to add players.';
  if (!isValidPhone(captainPhone)) return 'That mobile number doesn’t look right.';
  return null;
}
