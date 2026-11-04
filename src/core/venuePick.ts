/** The one venue search (UI audit step 4): grounds already used, filtered by
 *  what's typed (any word, any case), recent first; never the exact typed name. Pure. */
export function venueMatches(known: readonly string[], typed: string, limit = 6): string[] {
  const q = typed.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of known) {
    const t = typeof v === 'string' ? v.trim() : '';
    const k = t.toLowerCase();
    if (!t || seen.has(k) || k === q) continue;
    seen.add(k);
    if (!q || k.includes(q)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
