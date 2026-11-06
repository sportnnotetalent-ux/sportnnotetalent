/** Reference-video C9: grounds you've used show how many games each has
 *  hosted, busiest first, so picking several for a tournament is quick. */
export function venueCounts(matches: readonly { venueName?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) {
    const k = m.venueName?.trim().toLowerCase();
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Busiest first; ties keep their order (most recently used first). */
export function rankVenues(names: readonly string[], counts: Record<string, number>): string[] {
  return names.map((n, i) => ({ n, i, c: counts[n.trim().toLowerCase()] ?? 0 })).sort((a, b) => b.c - a.c || a.i - b.i).map((x) => x.n);
}

export function venueLabel(name: string, counts?: Record<string, number>): string {
  const c = counts?.[name.trim().toLowerCase()] ?? 0;
  return c ? `${name} · ${c} game${c === 1 ? '' : 's'}` : name;
}
