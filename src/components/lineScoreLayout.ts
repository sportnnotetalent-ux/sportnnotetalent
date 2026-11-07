/** DR6 (demo-recording-bugs.md): the set-by-set scoreboard's name column grows
 *  into the room the score columns leave — never below the old 120 px, never
 *  over 220 px, so the scores never squeeze or scroll for it. */
export const NAME_MIN = 120;
export const NAME_MAX = 220;
export const CELL = 34;

export function nameColumnWidth(cardInnerWidth: number, periods: number, wideLead: boolean): number {
  if (!cardInnerWidth) return NAME_MIN;
  const room = cardInnerWidth - (wideLead ? 64 : 52) - periods * CELL - 8;
  return Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(room)));
}
