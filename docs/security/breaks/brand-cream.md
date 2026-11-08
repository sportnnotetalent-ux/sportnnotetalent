# The cream logo (option 2d) — break it first

2026-11-08. Founder's design (docs/design/logo-options/cream-option-2d.png), one look everywhere, on cream `#F3F0E8`:
- the **S** and **"Sport"**: lime, with a thin dark green outline;
- the **N** and **"Note"**: white, with the same outline;
- the **colon** and **"n"**: plain near-black, no outline;
- continuous letter spacing, as before.

Where it applies:
- the app icon, splash and favicon;
- the launch screen (now on cream);
- the Home header (on a cream badge);
- the sign-in screen;
- the website header.

"SportnNote" is turned once into vector shapes from the brand font (`scripts/build-wordmark.mjs` → `src/brand/wordmark.ts` + `assets/brand/sportnnote-wordmark.svg`), so it draws the same on every platform with no font loading.

| # | Break | Kind | Fix |
|---|---|---|---|
| BC1 | Lime and white letters vanish on cream. | Legibility | Every lime/white letter has the dark green outline (≥ 4.5:1 on cream). The colon and n are near-black (≥ 4.5:1). Tested. |
| BC2 | The outline of the next letter covers the "n", making it look thin or gapped (the founder spotted it in 2b/2c). | Polish | Outlines are drawn in a layer underneath; all letters are drawn on top; no extra spacing. Tested: the n path has no stroke and is drawn after the outline layer. |
| BC3 | The wordmark looks different on web and phone (font loading, fallback font, no text outlines in React Native). | Consistency | One set of vector shapes, generated from the brand font and drawn by the same `Wordmark` component everywhere. The website uses the same shapes as an SVG file. |
| BC4 | The black "n" on the dark green Home banner is unreadable. | Legibility | On green, the logo and name sit on a cream badge, never straight on green. Tested. |
| BC5 | The native splash (green, built into APK 41) flashes before the cream launch screen. | Polish | `app.json` splash and the adaptive-icon background become cream, effective from the next APK. Until then APK 41 shows a brief green splash before the cream animation; the web has no native splash. Stated in the release note. |
| BC6 | The favicon or app icon stays cached in its old look. | Polish | The favicon gets a new name (`favicon-v4.png`); the app icon updates with the next APK/store build. |
| BC8 | Founder 2026-11-08 (option 2f): the near-black n looked out of line with the outlined letters. | Consistency | The n and the colon are now green `#1F7A50` with the same dark outline as every other letter, so all ten letters share the same weight and line. Tested. |
| BC7 | The generated shapes drift from the real font, e.g. after an update. | Integrity | The generator reads the brand TTF already in the repo, and a test checks the module was made from it (font name and units). |
| BC9 | Founder 2026-11-08: on app screens (other than the launch screen), the S:N next to the name is repetition. | Brand | Home, sign-in, Get the app and Invite show only the "SportnNote" wordmark. The S:N mark stays on the launch screen, the app icon, the favicon and the website. Tested. |
