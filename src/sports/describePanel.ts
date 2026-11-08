/** The "Last point" describe card's state (docs/security/breaks/describe-done.md).
 *  Done / Skip are remembered per point (its event id), so the next point opens
 *  fresh and an undo shows the earlier point as it was left. Done only changes
 *  what is shown — every tap is already saved (POINT_DETAIL). PURE. */
export type PanelMark = 'done' | 'skipped';
export type PanelMode = 'open' | 'saved' | 'hidden';

export function panelMode(eventId: number, marks: ReadonlyMap<number, PanelMark>): PanelMode {
  const m = marks.get(eventId);
  return m === 'done' ? 'saved' : m === 'skipped' ? 'hidden' : 'open';
}

/** the button under the summary: Done once something is picked, else Skip */
export const doneLabel = (summary: string) => (summary ? 'Done' : 'Skip');

/** DD10: the endings in two groups for a quick glance — the point winner's
 *  ("Won it": winner, ace, service winner, stroke) first, then the loser's
 *  ("Errors": forced / unforced error, service fault, lost by rule, no let).
 *  An empty group is dropped. */
export function howSections<H extends { credit: 'winner' | 'loser' }>(hows: readonly H[]): { title: string; hows: H[] }[] {
  return [
    { title: 'Won it', hows: hows.filter((h) => h.credit === 'winner') },
    { title: 'Errors', hows: hows.filter((h) => h.credit === 'loser') },
  ].filter((x) => x.hows.length > 0);
}

/** DD12: doubles credits a player ("By:"); with fewer than two named players on
 *  that side there is nobody to pick, so say how to add them instead of
 *  silently skipping. Singles: none (the opponent is credited automatically). */
export function byHint(doubles: boolean, named: number, side: string): string | null {
  return doubles && named < 2 ? `By: add ${side}'s two players (Add / invite a player) to credit each one` : null;
}
