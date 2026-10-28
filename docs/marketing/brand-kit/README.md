# Social brand kit

Made 2026-10-23 from the S:N mark for creating the @sportnnote handles (checklist: `docs/marketing/README.md` → "Up next"); **redrawn 2026-10-29 for the new design** — upload the new files to replace the old ones. The same profile picture goes on every platform.

| File | Where it goes | Notes |
|---|---|---|
| `profile-1080.png` | Profile picture on Instagram, Facebook, YouTube, X, Threads, TikTok, WhatsApp Channel | The mark sits at about 62% of the square, so round crops never clip it. |
| `linkedin-logo-400.png` | LinkedIn company page logo | A square logo (LinkedIn shows it square). |
| `linkedin-cover-1128x191.png` | LinkedIn company page cover | The text is right-aligned, because the logo overlaps the cover's left side. |
| `youtube-banner-2560x1440.png` | YouTube channel banner | Everything sits inside the 1546×423 area every device shows. |
| `facebook-cover-1640x624.png` | Facebook Page cover | Centred, so phones (which crop the sides) still show it all. |
| `x-header-1500x500.png` | X header | Centred, clear of the profile picture at bottom left. |

Colours (the app's design tokens): pitch green `#0D5A3F` behind the mark, hero green `#0A3A2B` behind the covers, lime `#C6EE3E` for the "S:" and "nNote", white for the "N", "Sport" and the tagline. The wordmark is Barlow Condensed ExtraBold Italic, like the app's headlines. Regenerate with `npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-brand-kit.mjs` (the mark comes from `scripts/build-icons.mjs`; the sport count from the website's list).
