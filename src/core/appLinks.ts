/** Read a scanned QR / pasted link that points at one of SportnNote's own
 *  public pages and say which screen opens it. Pure (node tests load it); the
 *  caller passes the hosts we own (core/hosts.ts linkPrefixes()) so a look-alike
 *  link on someone else's site never opens a screen. */

export type AppLinkTarget =
  | { screen: 'Certificate'; params: { code: string } }
  | { screen: 'Passport'; params: { code: string } }
  | { screen: 'HallOfFame'; params: { orgId: string } }
  | { screen: 'MatchLink'; params: { matchId: string } }
  | { screen: 'Tournament'; params: { tournamentId: string } }
  | { screen: 'PlayerProfile'; params: { playerId: string } }
  | { screen: 'GolfRound'; params: { eventId: string } }
  | { screen: 'ResultsEvent'; params: { phaseId: string } };

const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

export function parseAppLink(raw: string, prefixes: readonly string[]): AppLinkTarget | null {
  const text = (raw ?? '').trim();
  const prefix = prefixes
    .map((p) => p.replace(/\/+$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((p) => text.toLowerCase().startsWith(p.toLowerCase()) && /^($|[/?#])/.test(text.slice(p.length)));
  if (!prefix) return null;
  const path = text.slice(prefix.length).replace(/^\/+/, '').split(/[?#]/)[0];
  const [kind, id] = path.split('/');
  if (!id || !ID.test(id)) return null;
  switch (kind) {
    case 'c': return { screen: 'Certificate', params: { code: id } };
    case 'pp': return { screen: 'Passport', params: { code: id } };
    case 'h': return { screen: 'HallOfFame', params: { orgId: id } };
    case 'm': return { screen: 'MatchLink', params: { matchId: id } };
    case 't': return { screen: 'Tournament', params: { tournamentId: id } };
    case 'p': return { screen: 'PlayerProfile', params: { playerId: id } };
    case 'g': return { screen: 'GolfRound', params: { eventId: id } };
    case 'r': return { screen: 'ResultsEvent', params: { phaseId: id } };
    default: return null;
  }
}
