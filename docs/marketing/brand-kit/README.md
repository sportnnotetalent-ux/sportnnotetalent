# Social brand kit

Made 2026-10-23 from the S:N mark (`assets/brand/sportnnote-icon-square.svg`) for creating the @sportnnote handles (checklist: `docs/marketing/README.md` → "Up next"). The same profile picture goes on every platform.

| File | Where it goes | Notes |
|---|---|---|
| `profile-1080.png` | Profile picture on Instagram, Facebook, YouTube, X, Threads, TikTok, WhatsApp Channel | The mark sits at about 62% of the square, so round crops never clip it. |
| `linkedin-logo-400.png` | LinkedIn company page logo | A square logo (LinkedIn shows it square). |
| `linkedin-cover-1128x191.png` | LinkedIn company page cover | The text is right-aligned, because the logo overlaps the cover's left side. |
| `youtube-banner-2560x1440.png` | YouTube channel banner | Everything sits inside the 1546×423 area every device shows. |
| `facebook-cover-1640x624.png` | Facebook Page cover | Centred, so phones (which crop the sides) still show it all. |
| `x-header-1500x500.png` | X header | Centred, clear of the profile picture at bottom left. |

Colours: background `#0E1116`, green `#3DDC97`, amber `#FFB454`, white text. To regenerate, run the render script with `@resvg/resvg-js` (as in `scripts/build-icons.mjs`); the layouts are simple SVG.
