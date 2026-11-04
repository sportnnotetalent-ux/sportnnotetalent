/** Sign-up source (founder 2026-11-04, docs/security/breaks/signup-source.md):
 *  which link a new user came from. A link the device opens → its kind (and, for
 *  public pages, which one); kept on the device for 30 days, first link wins;
 *  sent once after sign-up (data/signupSource.ts). Pure. */

export type SourceKind = 'game' | 'tournament' | 'invite' | 'team' | 'profile' | 'results' | 'parent' | 'school';
export interface LinkSource { kind: SourceKind; ref?: string }
export interface Landing extends LinkSource { at: number }

export const LANDING_TTL_DAYS = 30;
const KINDS: readonly SourceKind[] = ['game', 'tournament', 'invite', 'team', 'profile', 'results', 'parent', 'school'];
const isKind = (k: unknown): k is SourceKind => typeof k === 'string' && (KINDS as readonly string[]).includes(k);
const isRef = (r: unknown): r is string => typeof r === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(r);

/** First path part → kind, and whether its id is public (kept) or a secret
 *  token / code (SS1: never kept). Query strings are never read. */
const ROUTES: Record<string, { kind: SourceKind; keepRef: boolean }> = {
  m: { kind: 'game', keepRef: true },
  t: { kind: 'tournament', keepRef: true },
  'join-tournament': { kind: 'tournament', keepRef: false },
  i: { kind: 'invite', keepRef: true },
  get: { kind: 'invite', keepRef: true },
  join: { kind: 'team', keepRef: false },
  'join-club': { kind: 'team', keepRef: false },
  p: { kind: 'profile', keepRef: true },
  pp: { kind: 'profile', keepRef: false },
  c: { kind: 'results', keepRef: false },
  r: { kind: 'results', keepRef: false },
  g: { kind: 'results', keepRef: false },
  h: { kind: 'results', keepRef: false },
  'guardian-consent': { kind: 'parent', keepRef: false },
  'school-request': { kind: 'parent', keepRef: false },
  'org-confirm': { kind: 'school', keepRef: false },
};

/** The link source of a URL the app opened, or null (home page, tabs, other). */
export function sourceFromUrl(url: string): LinkSource | null {
  if (typeof url !== 'string' || !url) return null;
  let path = url.split(/[?#]/)[0];
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(path);
  if (scheme) {
    path = path.slice(scheme[0].length);
    const dev = path.indexOf('/--/'); // Expo dev links: exp://host:port/--/path
    if (dev >= 0) path = path.slice(dev + 4);
    else if (/^https?$/i.test(scheme[1])) path = path.replace(/^[^/]*/, ''); // drop the host
  }
  const parts = path.split('/').filter(Boolean);
  const route = parts[0] ? ROUTES[parts[0]] : undefined;
  if (!route) return null;
  let ref: string | undefined;
  if (route.keepRef) {
    try { ref = decodeURIComponent(parts[1] ?? ''); } catch { ref = undefined; }
  }
  return isRef(ref) ? { kind: route.kind, ref } : { kind: route.kind };
}

/** A saved landing that is well-formed and fresh (not older than 30 days, not
 *  from the future) — refs that don't look like ids are dropped. */
export function landingToSend(saved: unknown, now: number): Landing | null {
  const s = saved as Partial<Landing> | null;
  if (!s || typeof s !== 'object' || !isKind(s.kind) || typeof s.at !== 'number') return null;
  if (now - s.at > LANDING_TTL_DAYS * 86_400_000 || s.at > now + 60_000) return null;
  return isRef(s.ref) ? { kind: s.kind, ref: s.ref, at: s.at } : { kind: s.kind, at: s.at };
}

/** What to save when a link opens: null = leave storage as it is (an earlier
 *  fresh link wins, or this wasn't a link). */
export function landingToKeep(saved: unknown, incoming: LinkSource | null, now: number): Landing | null {
  if (!incoming || landingToSend(saved, now)) return null;
  return incoming.ref ? { kind: incoming.kind, ref: incoming.ref, at: now } : { kind: incoming.kind, at: now };
}

const LABELS: Record<SourceKind, string> = {
  game: 'Game link', tournament: 'Tournament link', invite: 'Friend invite', team: 'Team / club invite',
  profile: 'Profile link', results: 'Results / certificate', parent: 'Parent link', school: 'School link',
};
export const sourceLabel = (k: string | null | undefined): string => (isKind(k) ? LABELS[k] : 'Direct / unknown');
