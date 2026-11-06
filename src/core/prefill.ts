/** Forms fill in what we already know (reference-video B9). The organiser's
 *  own entry always wins, then the hosting community's city, then the
 *  signed-in person's own home city. Nothing about anyone else. */
export function prefillCity(o: { typed: string; touched: boolean; hostOrgCity?: string | null; myCity?: string | null }): string {
  if (o.touched) return o.typed;
  // not typed by the organiser: only what we know now (a previous host's city never sticks)
  return (o.hostOrgCity ?? '').trim() || (o.myCity ?? '').trim();
}
