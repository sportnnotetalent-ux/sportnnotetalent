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
