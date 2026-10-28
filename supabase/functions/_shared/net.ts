/**
 * Network helpers for the edge functions (security Wave 3, EF-07 / EF-11).
 * Pure web APIs only (no Deno globals at import), so the node test runner
 * covers them: tests/security-wave3.test.mts.
 */

/** The caller's address, as the proxy reports it ('unknown' when absent or junk). */
export function clientIp(h: Headers): string {
  const raw = h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? (h.get('x-forwarded-for') ?? '').split(',')[0];
  const ip = (raw ?? '').trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : 'unknown';
}

/** Read a response body as text, up to `max` bytes; null when it's bigger. */
export async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}
