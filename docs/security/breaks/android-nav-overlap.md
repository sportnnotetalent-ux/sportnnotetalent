# Android navigation keys over the tab bar — break it first

2026-11-08, from a friend's Android phone (3-button navigation): the phone's back / home / recents keys sit on top of the app's bottom tabs (Home, Matches …), so the tab labels are hidden and taps can hit the wrong thing. Android 15 draws apps edge to edge, behind a translucent navigation bar. The tab bar must add the navigation bar's height under itself. React Navigation normally does this from the safe-area inset, but on this phone the inset reaches the tab bar as 0. The top inset is fine: the green hero sits correctly under the status bar.

| # | Break | Kind | Fix |
|---|---|---|---|
| AN1 | The tab bar ignores the navigation bar on some Android phones. | Layout | On Android the tab bar's bottom padding and height come straight from the app-level safe-area inset (`useSafeAreaInsets` in `Tabs`). The fallback is the inset measured at launch (`initialWindowMetrics`). The larger of the two is used. Tested. |
| AN2 | The fix doubles the gap on phones that were already right. | Layout | The tab bar's own height and padding are set explicitly, so React Navigation does not add a second inset. Tested. |
| AN3 | iPhone or web changes look. | Layout | Only Android is changed. iPhone keeps React Navigation's own handling, and web keeps its 64 px. Tested. |
| AN4 | Gesture navigation (no buttons) gets a big empty band. | Layout | The inset there is the small gesture-handle height, so the band is small, as Android intends. Tested. |
