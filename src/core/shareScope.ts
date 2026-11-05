/** Signed-out scope (docs/security/breaks/signed-out-scope.md): while signed
 *  out, every Supabase request says which shared item is in view —
 *  `x-share: <kind>:<uuid>` — and the database returns only that item's rows.
 *  Signed-in requests send nothing. Pure (no React Native). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ok = (kind: string, id: unknown): string | null => (typeof id === 'string' && UUID.test(id) ? `${kind}:${id.toLowerCase()}` : null);

/** The scope for a screen and its params, or null (not a shared page). */
export function scopeForRoute(name: string, params?: Record<string, unknown> | null): string | null {
  const p = params ?? {};
  switch (name) {
    case 'MatchLink': case 'LiveScoring': return ok('m', p.matchId);
    case 'Tournament': case 'Standings': case 'Bracket': case 'SportHub': case 'TeamJourney': return ok('t', p.tournamentId);
    case 'PlayerProfile': case 'SportProfile': case 'Invite': return ok('p', p.playerId);
    case 'GetApp': return ok('p', p.from);
    case 'HeadToHead': return ok('p', p.a);
    case 'Team': return ok('team', p.teamId);
    case 'GolfRound': return ok('e', p.eventId);
    case 'ResultsEvent': return ok('e', p.phaseId);
    case 'HallOfFame': return ok('h', p.orgId);
    default: return null;
  }
}

/** The stream overlay (`/o/<matchId>`, web, outside the navigator). */
export const overlayScope = (path: string): string | null => ok('m', /^\/o\/([^/?#]+)/.exec(path)?.[1]);

let current: string | null = null;
let provider: (() => string | null) | null = null;
/** The navigator registers how to read the scope from the page in view at
 *  request time (screens fetch before the navigator's state-change callback). */
export function setShareScopeProvider(fn: (() => string | null) | null): void { provider = fn; }
/** The scope now: the page in view, else one set by a screen (null = none). */
export const getShareScope = (): string | null => (provider ? provider() : null) ?? current;
/** Set the scope (null = none). Returns true when it changed — the caller then
 *  clears the read cache, so one page's rows never answer another's. */
export function setShareScope(next: string | null): boolean {
  if (next === current) return false;
  current = next;
  return true;
}

/** A fetch init with the scope header added (when there is a scope). */
export function withShareHeader<T extends { headers?: HeadersInit }>(init: T = {} as T): T {
  const scope = getShareScope();
  if (!scope) return init;
  const headers = new Headers(init.headers);
  headers.set('x-share', scope);
  return { ...init, headers };
}
