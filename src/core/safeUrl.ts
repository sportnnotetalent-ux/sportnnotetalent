/**
 * Security W1-10 (CL-11 / CL-12, docs/security/audit-2026-10-27/client.md): a
 * link that comes from someone else's data (a match's live-stream or map link)
 * opens only as a web page. https: — a bare "youtu.be/x" gets it, http: is
 * upgraded — and never intent:, upi:, javascript:, data: or file:, a link with
 * a user name or password in it, or one with no real host. The database cleans
 * the same columns for every app version (migration security_wave1).
 */
export function safeWebUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s);
  const withScheme = hasScheme ? s.replace(/^http:/i, 'https:') : `https://${s.replace(/^\/+/, '')}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !/\.[a-z]{2,}$/i.test(u.hostname)) return null;
  return u.toString();
}
