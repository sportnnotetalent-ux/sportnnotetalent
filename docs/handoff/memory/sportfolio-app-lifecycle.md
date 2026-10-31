---
name: sportfolio-app-lifecycle
description: "Founder expects standard app lifecycle behaviour — minimise keeps place, close starts fresh; never hang on a spinner"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-08T05:51:39.571Z
---

Minimise → come back to the exact same screen (tab, open panel). Close/swipe away → fresh start on Home. Every wait (lookups, spinners) must end — time out and let the user carry on. The founder called these "basics of app running across all industries" after I first made restore too sticky (localStorage, reopened old page after close).

**Why:** pilot users judge the app against mainstream apps; sticky/hanging behaviour reads as broken.
**How to apply:** iPhone web app nav state lives in sessionStorage (RootNavigator), screen tabs in route params via `useParamState`; Android needs no restore. Any new network wait gets a timeout + fallback. When fixing one picker/flow, sweep its siblings for the same bug (see [[sportfolio-overview]]).
