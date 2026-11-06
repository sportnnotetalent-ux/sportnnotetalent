/**
 * Match-day roles (reference-video C6, docs/security/breaks/match-roles.md):
 * a captain for every team sport, plus the sport's keeper where it has one.
 * Picked from that match's squad. The database refuses anyone outside the
 * squad; here we clear roles whose player left, exactly as the database does.
 */
import type { MatchSquad, SportId } from './types';

const KEEPER: Partial<Record<SportId, string>> = {
  cricket: 'Wicket-keeper',
  football: 'Goalkeeper',
  handball: 'Goalkeeper',
  hockey: 'Goalkeeper',
  ice_hockey: 'Goalie',
};

/** The keeper role's name in this sport, or null when it has none. */
export function keeperLabel(sport: SportId): string | null {
  return KEEPER[sport] ?? null;
}

/** Roles that point at someone no longer in the squad are dropped (MR5). */
export function cleanSquadRoles(sq: MatchSquad): MatchSquad {
  const ids = new Set([...sq.starters, ...sq.subs]);
  const out: MatchSquad = { ...sq };
  if (out.captainId && !ids.has(out.captainId)) delete out.captainId;
  if (out.keeperId && !ids.has(out.keeperId)) delete out.keeperId;
  return out;
}

/** Tap a player for a role: the same player again clears it. */
export function pickRole(current: string | undefined, id: string): string | undefined {
  return current === id ? undefined : id;
}
