/** Where the SportnNote top bar shows (docs/security/breaks/brand-bar.md).
 *  Phones: on the five tab screens, drawn by each screen. Wide web: one bar
 *  across the top, drawn by the root, on every signed-in screen. Never for
 *  guests or on sign-in / first-run screens. */
export const TAB_ROOTS = ['Home', 'Matches', 'Organize', 'Discover', 'Profile'];
export const NO_BAR = ['Auth', 'Legal', 'Personalise'];
/** a laptop-width browser; iPads and phones keep the tab layout */
export const WIDE_WEB = 1024;

/** sizes the bar is built from (BB10) */
export const BAR_ICON = 42;
export const BAR_GAP = 8;
export const BAR_PAD = 16;

export const isWideWeb = (os: string, width: number) => os === 'web' && width >= WIDE_WEB;

export function barPlacement({ os, width, authed, route }: { os: string; width: number; authed: boolean; route: string | undefined }) {
  if (!authed || !route || NO_BAR.includes(route)) return { root: false, screen: false };
  if (isWideWeb(os, width)) return { root: true, screen: false };
  return { root: false, screen: TAB_ROOTS.includes(route) };
}

/** the name's height for the window width (BB10) */
export const brandHeight = (width: number) => (width < 420 ? 24 : 27);
