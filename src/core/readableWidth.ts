/**
 * iPad (and wide browser windows): screens lay their content out in a centred
 * column instead of stretching edge to edge (docs/security/breaks/ipad.md).
 * The header and the tab bar stay full width. The cap is wider than any phone,
 * iPad portrait or Split View pane, so those are untouched.
 */
export const READABLE_MAX_WIDTH = 840;

/** Screens whose brackets, grids or side-by-side columns need the full width.
 *  (Standings tables read better in the column: names sit near their numbers.) */
export const FULL_WIDTH_SCREENS: ReadonlySet<string> = new Set([
  'Bracket',
  'MeetTimetable',
  'GolfRound',
  'SupportConsole',
  'UsageDashboard',
]);

export type ReadableStyle = { width: '100%'; maxWidth: number; alignSelf: 'center' };

/** The content style for a screen: a centred column, or none for wide screens. */
export function readableContentStyle(screen: string): ReadableStyle | undefined {
  return FULL_WIDTH_SCREENS.has(screen) ? undefined : { width: '100%', maxWidth: READABLE_MAX_WIDTH, alignSelf: 'center' };
}

/** The stack's content style. The tab host is left full width so the tab bar
 *  spans the screen; its tab scenes carry the column themselves. */
export function stackContentStyle(screen: string): ReadableStyle | undefined {
  return screen === 'Tabs' ? undefined : readableContentStyle(screen);
}

/** How wide a screen's content is in a window this wide. */
export function columnWidth(windowWidth: number, screen: string): number {
  return readableContentStyle(screen) ? Math.min(windowWidth, READABLE_MAX_WIDTH) : windowWidth;
}
