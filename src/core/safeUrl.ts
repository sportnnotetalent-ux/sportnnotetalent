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

/** Security W3 (CL-12): the host of a stream link (lower case), or ''. */
export function streamHost(url: string | null | undefined): string {
  try { return new URL(String(url ?? '')).hostname.toLowerCase(); } catch { return ''; }
}

/** Streaming sites people use for match streams. A link elsewhere opens only
 *  after the viewer is told where it goes (any https site can be a phishing page). */
const STREAM_HOSTS = ['youtube.com', 'youtu.be', 'twitch.tv', 'facebook.com', 'fb.watch', 'instagram.com', 'vimeo.com', 'x.com', 'twitter.com'];

export function isKnownStreamHost(url: string | null | undefined): boolean {
  const h = streamHost(url);
  return !!h && STREAM_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}
