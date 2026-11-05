# The score link in the group chat

| Field | Value |
|---|---|
| Publish | Tue 10 Nov 2026, 19:00 IST |
| Platform / format | Instagram Reel + Facebook Reel, 15 s, 9:16 |
| Pillar | The link |
| Goal | Awareness |
| Audience | Adult organisers and players of friends' and community games |
| Status | Approved by founder 2026-11-05 |
| AI | None. Screen recording + text. |

## Caption — Instagram (post exactly)
```
Your mates can't make it to the game. They can still watch the score.

Score the match on your phone, tap Share, drop the link in the group chat.
Anyone can open it in a browser and follow the score live. No app needed.

Football, basketball, kabaddi, badminton, tennis, pickleball, padel and more.

Try it: link in bio 👆

#SportnNote #Football #Badminton #Pickleball #SundayLeague
```

## Caption — Facebook (post exactly)
```
Your mates can't make it to the game. They can still watch the score.

Score the match on your phone, tap Share, drop the link in the group chat. Anyone can open it in a browser and follow the score live. No app needed.

Football, basketball, kabaddi, badminton, tennis, pickleball, padel and more.

Try it: https://app.sportnnote.in
```

## Per-platform notes
- **Instagram:** link lives in bio (sportnnote.in → app); caption says "link in bio". Reel cover = frame 3.
- **Facebook:** same Reel file; link in the caption itself; no hashtags (or the same 5 if the founder prefers).

## Hashtags
#SportnNote #Football #Badminton #Pickleball #SundayLeague

## Alt text
A phone scoring a five-a-side football match taps Share; the link is pasted into a group chat; a second phone opens it in a browser and the score changes live from 2–1 to 3–1. Text: "No app needed."

## Call to action
Try it: https://app.sportnnote.in (Instagram: via link in bio)

## Visual
- **Format and size:** Reel 1080×1920, 15 s, same file for Instagram and Facebook. Cover frame 1080×1920 (grid crop 1080×1350 safe area).
- **Frames:**
  | Time | On screen | Text overlay | Colours |
  |---|---|---|---|
  | 0:00–0:03 | Phone A: live football scoring screen, demo match Red House vs Blue House, 2–1 | "Can't make the game?" | Court theme background, lime accent |
  | 0:03–0:06 | Tap **Share** (top right of the scoring screen), share sheet → a demo group chat | "Share the link" | — |
  | 0:06–0:11 | Phone B: chat bubble "Follow live on SportnNote: app.sportnnote.in/m/…" → opens in a browser → goal tapped on Phone A → B updates to 3–1 | "Follow live. No app." | — |
  | 0:11–0:15 | S:N logo end card | "app.sportnnote.in" | Brand background |
- **Screen recording shot list:** marketing demo account, tournament **SportnNote Demo Meet 2026**, football friendly Red House vs Blue House, fictional adult players (Ravi, Arjun, Kabir, Dev). Taps: open match → score goal to 2–1 → **Share** → paste in a chat with demo-only contacts → open link on second device → tap goal on A. Record both phones (~20 s raw each). Small "Demo data" label bottom-left throughout. Do Not Disturb on; group chat uses demo names, no phone numbers visible; crop or blur the match id in the URL so the link reads app.sportnnote.in/m/… only.
- **Who makes it:** founder records both phones; edit in Canva (text overlays from brand kit `docs/marketing/brand-kit/`).
- **Alt text check:** matches the frames above (2–1 → 3–1, "No app needed").

## Pre-post checks
- [ ] Every label named above matches the live app (web app.sportnnote.in and Android) on the day.
- [ ] Facts match DEVLOG.md release entries; no invented numbers, quotes or testimonials.
- [ ] No competitor names, no children, no AI faces, no real personal data on screen.
- [ ] "Demo data" label visible for the whole clip / on every screenshot.
- [ ] One call to action; link typed in full, no shortener, no tracking parameters.
- [ ] Hashtags 3–5. Alt text matches the final visual.
- [ ] Founder approval recorded in docs/org/marketing/queue.md.
- [ ] Founder decision on "live now" vs "coming soon" (decisions.md, Open) — this draft assumes live now.

## Editor notes
- "every point" → "the score" (football has goals, not points).
- Verified: Share on the scoring screen (`src/screens/LiveScoringScreen.tsx`), share text "Follow live on SportnNote: app.sportnnote.in/m/…" (`src/core/shareText.ts`).

## Checks
- Editor: ok 2026-11-05
- Security: ok 2026-11-05 — demo houses, fictional adults, match id blurred, demo-only chat contacts (the dev seed's Red House players are children aged 10–11: record only on the marketing demo account, never the seed).
