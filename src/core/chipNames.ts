/** Telling look-alike names apart (UI audit step 5, #18): when names repeat,
 *  add the first detail that differs (host, then city, then start date). Pure. */
export interface Named { id: string; name: string; hostName?: string | null; city?: string | null; startDate?: string | null }

export function distinctNames<T extends Named>(items: readonly T[], fmtDate: (iso: string) => string = (d) => d): Map<string, string> {
  const out = new Map<string, string>();
  const groups = new Map<string, T[]>();
  for (const t of items) {
    const k = (t.name ?? '').trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const g of groups.values()) {
    if (g.length === 1) { out.set(g[0].id, g[0].name); continue; }
    const pick = (f: (t: T) => string | null | undefined) => {
      const vals = g.map((t) => (f(t) ?? '').trim());
      return vals.every(Boolean) && new Set(vals.map((v) => v.toLowerCase())).size === vals.length ? vals : null;
    };
    const extra = pick((t) => t.hostName) ?? pick((t) => t.city) ?? pick((t) => (t.startDate ? fmtDate(t.startDate) : null));
    g.forEach((t, i) => out.set(t.id, extra ? `${t.name} · ${extra[i]}` : `${t.name} (${i + 1})`));
  }
  return out;
}
