/** Pair names (founder 2026-11-08, docs/security/breaks/pair-names.md): a
 *  pair's side name "Aanya Verma / Divya Nair" is shown on two lines — "Aanya
 *  Verma /" over "Divya Nair" — on every scorecard. Pure; reads only the name
 *  it is given (already masked for children by the existing rules, PN4). */

const parts = (name: string): string[] | null => {
  const p = name.split('/').map((x) => x.trim());
  return p.length === 2 && p[0] && p[1] ? p : null;
};

/** The lines to show: two for a pair (PN1), one for anything else (PN3). */
export function sideLines(name: string): string[] {
  const p = parts(name);
  if (p) return [`${p[0]} /`, p[1]];
  return [name.trim().replace(/\s*\/\s*$/, ' /').trim() || name.trim()];
}

/** PN5: what a screen reader says — "Aanya Verma and Divya Nair". */
export function sideSpoken(name: string): string {
  const p = parts(name);
  return p ? `${p[0]} and ${p[1]}` : name.trim();
}
