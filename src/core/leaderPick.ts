/** Which stat the leaders list shows (UI audit #48): the one picked, if it's
 *  still there (filters can change the categories), else the first. Pure. */
export function pickedCategory<T extends { key: string }>(cats: readonly T[], picked: string | null | undefined): T | null {
  return cats.find((c) => c.key === picked) ?? cats[0] ?? null;
}
