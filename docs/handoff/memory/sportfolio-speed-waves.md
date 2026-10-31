---
name: sportfolio-speed-waves
description: App speed work — audit in docs/perf/audit.md; Waves 1+2 live 2026-10-13; Wave 3 parked by founder
metadata:
  node_type: memory
  type: project
  originSessionId: 74d70f9a-afc5-46f1-82ac-9241cfb7ffcf
  modified: 2026-10-11T21:15:09.956Z
---

Speed audit (founder saw 5–10 s phone sign-in on the web Home-screen icon + launch lag): docs/perf/audit.md.
Waves 1 and 2 shipped 2026-10-13; their migrations (20261022100000, 20261023100000) were run, and phone-login was deployed. Founder decisions:
- no instant code box (wait for Google);
- reminders every 5 min;
- no cached feed on open;
- no APK phone sign-in;
- full phone metadata;
- keep the 10 s read cache.

**Why:** founder wants every part of the app fast with no feature loss; cross-check anything doubtful.
**How to apply:** Wave 3 (lazy sports, scoring-screen speed, bundle trims; about half a day, no migration) is PARKED until the founder asks. Re-running older players_view migrations brings back the slow view.
