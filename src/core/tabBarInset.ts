/** Android: the tab bar's room for the phone's navigation bar
 *  (docs/security/breaks/android-nav-overlap.md). Edge to edge, the system
 *  keys sit over the app; on some phones the inset reaches the tab bar as 0,
 *  so take the larger of the live and the launch inset. null = leave it to
 *  React Navigation (iPhone, web). PURE. */
export const TAB_BAR_BODY = 62; // the bar itself: icon + label + the 6 px top padding

export function tabBarBottom(os: string, live: number, atLaunch: number): number | null {
  if (os !== 'android') return null;
  return Math.max(live || 0, atLaunch || 0);
}
