/**
 * Security W1-6 (EF-04, docs/security/audit-2026-10-27/edge-functions.md): an
 * invite email may carry only the exact links the app sends — an invite
 * (`/i/<id>`, optionally `?notme=1`) or the older join function
 * (`functions/v1/join?p=<id>`) — under one of our prefixes. Anything else under
 * our hosts (a redirect parameter, another path, a fragment) is refused, so
 * send-invite can never relay someone else's link from our address.
 * Pure (no Deno APIs) — node tests import it.
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SHAPE = new RegExp(`^(?:i/${UUID}(?:\\?notme=1)?|join\\?p=${UUID})$`, 'i');

export function isInviteLink(link: unknown, prefixes: readonly string[]): boolean {
  if (typeof link !== 'string' || !link || link.length > 300 || /\s/.test(link)) return false;
  return prefixes.some((p) => link.startsWith(p) && SHAPE.test(link.slice(p.length)));
}
