# One top bar, name → Home — break it first

2026-11-08. The founder asked for Home's top row (the SportnNote name, search, alerts, menu) to be available across the app, with a tap on the name taking you Home. We agreed on this scope:
- **Phones:** the bar sits on the five tab screens: Home, Matches, Organize, Discover, Profile.
- **Match, scoring and detail screens:** these keep a back arrow and a title. They need the height for the score, and the top-left spot belongs to the back arrow.
- **Wide web (≥ 1024 px):** one bar across the top of every signed-in screen.

One component (`src/components/BrandBar.tsx`) draws it everywhere. Where it shows is decided by a pure function (`src/core/brandBar.ts`).

| # | Break | Kind | Fix |
|---|---|---|---|
| BB1 | The name looks like a logo but does nothing, or opens the wrong place. | Navigation | The name is a button labelled "SportnNote, go to Home". It opens the Home tab from anywhere. Tested. |
| BB2 | Home and the other tabs drift apart: different icons, sizes or colours. | Consistency | Home's own header row is replaced by the same `BrandBar`. HomeScreen no longer draws its own search, bell or menu. Tested. |
| BB3 | The bar shows up on phone detail or scoring screens and eats the scorer's room or fights the back arrow. | Layout | On phones only the five tab screens draw it. Stack screens never do. Tested, including in the 600-user sim. |
| BB4 | Wide web shows two bars: the global one plus a tab screen's own. | Layout | On wide web, tab screens and Home's hero skip their own bar, and the root draws one. The sim checks it is exactly one bar on every route. Tested. |
| BB5 | Guests, sign-in, the first-run questions or the launch screen get a bell and menu that need an account. | Access | No bar when signed out, or on Auth, Legal or Personalise. Tested. |
| BB6 | The menu only works on Home: "Voice — find a game" needs Home's match list. | Function | Away from Home, Voice opens Home with `voice: true` and Home opens the panel. "Start a friendly" shows only for people allowed to start one, as before. Tested. |
| BB7 | Dark status-bar text lands on the green bar on the other tabs, so the clock becomes unreadable. | Legibility | The bar sets light status-bar text while its screen is focused. Tested. |
| BB8 | The unread count differs between screens. | Consistency | It comes from one shared hook (`useNotifications`) inside the bar. Tested. |
| BB9 | The status-bar inset is counted twice (a gap) or not at all (the bar sits under the notch). | Layout | The tab screens no longer pad the top edge. The bar adds `insets.top` itself, once. Tested. |
| BB10 | On a 320 px phone the name and three icons don't fit. | Fit | The name is 24 px tall below 420 px wide. The name, three 42 px buttons and the gaps fit in 320 px. Tested. |
| BB11 | Tapping the name on Home again reloads or jumps around. | Navigation | On Home it does nothing; you are already there. Tested. |
