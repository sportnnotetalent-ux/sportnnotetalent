/** Team slots (founder 2026-11-06, docs/security/breaks/team-slots.md): an
 *  organiser without their teams yet makes fixtures between slots, then slots
 *  teams in. Group slots are named by group (A1…A4, B1…B4) so the group stage
 *  puts each in its group; otherwise Team 1, Team 2 … Pure. */
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 128;

/** Slot names for `count` teams, split into `groups` groups (letters A…) as
 *  evenly as possible, earlier groups taking the extra. */
export function slotNames(count: number, groups = 0): string[] {
  const n = Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, Number.isFinite(count) ? Math.floor(count) : MIN_SLOTS));
  const g = Math.min(26, Math.max(0, Math.floor(groups) || 0), Math.floor(n / 2));
  if (g < 2) return Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
  const out: string[] = [];
  for (let gi = 0; gi < g; gi++) {
    const size = Math.floor(n / g) + (gi < n % g ? 1 : 0);
    for (let k = 1; k <= size; k++) out.push(`${String.fromCharCode(65 + gi)}${k}`);
  }
  return out;
}

/** The group a slot name belongs to (0 = A), for groups that exist. */
export function groupFromSlotName(name: string, groupCount: number): number | undefined {
  const m = /^([A-Z])(\d{1,3})$/.exec(name.trim());
  if (!m) return undefined;
  const gi = m[1].charCodeAt(0) - 65;
  return gi < groupCount ? gi : undefined;
}
