---
name: sportfolio-web-crash-noise
description: "Requiring unknown module" web crash reports were false alarms (Metro probe via ErrorUtils); EAS Hosting 429s after ~100 files — warm-up paced + backs off (aa0a9e1)
metadata:
  type: project
---

Found 2026-10-26 from the weekly email: crash-free sessions read 38%, and the top errors were "Requiring unknown module N", all on the web.

- **Cause:** Metro's async loader probes `importAll(id)` before fetching the chunk. The guard sends the throw to `ErrorUtils.reportFatalError`; our telemetry handler logged it as fatal, then the previous handler re-threw and loading continued. It's about 1 false crash per session.
- **Fix:** `isUnknownModuleProbe` in `src/core/telemetry.ts` skips reporting it on the web only, and still calls the previous handler.
- **EAS Hosting 429:** it answers 429 after roughly 100 files in a few seconds. Measured about 20–25 files a second → 429. The warm-up is now 2 at a time with a 250 ms pause, sports one at a time with a pause, and it stops at the first refusal.

**Why:** don't chase "unknown module" reports as real crashes again unless they come with "Loading module … failed" or "Unexpected token '<'".

**How to apply:** after the web publish, the crash-free figure should rise sharply; past weeks are inflated. PUBLISHED + verified 2026-10-26 (index-3d61aede): clean live visit 122/122 files 200, no error logged. If real crashes appear, look at the other error messages.

Related: [[sportfolio-speed-waves]], [[sportfolio-analytics]], [[sportfolio-golive-lowcost]].
