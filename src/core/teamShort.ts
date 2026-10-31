/**
 * A side's short code (2–4 characters) for teams created on the fly. PURE.
 * MVP F9 — kept different from the other side's code ("Kondapur FC" KF,
 * "Kukatpally FC" KUK), so the two buttons never read the same.
 */
export const shortFrom = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  // at least 2 characters (a one-letter name "K" → "KX"), as player entry codes are
  return ((initials.length >= 2 ? initials : name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()) || 'TM').slice(0, 4).padEnd(2, 'X');
};

export function uniqueShort(name: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toUpperCase()));
  const base = shortFrom(name);
  if (!used.has(base)) return base;
  const first = (name.trim().split(/\s+/)[0] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  for (const c of [first.slice(0, 3), first.slice(0, 4)]) if (c.length >= 2 && !used.has(c)) return c;
  for (let n = 2; n <= 99; n++) {
    const c = `${base.slice(0, 4 - String(n).length)}${n}`;
    if (!used.has(c)) return c;
  }
  return base;
}
