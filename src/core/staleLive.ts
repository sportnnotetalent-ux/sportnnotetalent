/** MVP L11 — a "live" match nobody has scored (or updated) for 12 hours is a
 *  match left running by mistake (often a test). Live lists skip it, as Near
 *  you already does on the server (20261031130000_near_places.sql). It still
 *  opens from its link, and its scorer can still end it. Pure. */
export const STALE_LIVE_MS = 12 * 60 * 60 * 1000;

export function isStaleLive(m: { status: string; updatedAt?: string }, now: number = Date.now()): boolean {
  if (m.status !== 'live' || !m.updatedAt) return false;
  const t = Date.parse(m.updatedAt);
  return Number.isFinite(t) && now - t > STALE_LIVE_MS;
}
