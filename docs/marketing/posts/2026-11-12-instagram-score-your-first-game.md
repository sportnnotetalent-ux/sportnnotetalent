# Score your first game in 4 steps

| Field | Value |
|---|---|
| Publish | Thu 12 Nov 2026, 12:30 IST |
| Platform / format | Instagram carousel, 5 slides, 4:5 |
| Pillar | How-to |
| Goal | Saves |
| Status | Awaiting founder |
| AI | None. |

## Caption (post exactly)
```
Save this for your next game 📌

Scoring a friendly takes about as long as picking teams.
Swipe for the steps 👉

Works for pickleball, tennis, football, basketball and plenty more.
Start at app.sportnnote.in (link in bio).

#SportnNote #Pickleball #Tennis #HowTo #WeekendSport
```

## Slides
1. **Score your next game. Live.** (sub: "4 steps · save this")
2. **1. Open Home → Score a match.** Screenshot of Home with the "Score a match" tile highlighted.
3. **2. Pick the sport, tap Doubles, add Pair 1 and Pair 2.** Screenshot: pickleball set-up with 🏓 Pickleball and 👥 Doubles chosen, Pair 1 and Pair 2 filled (demo pairs).
4. **3. Tap the point to whoever won it.** Screenshot: live pickleball scoring screen.
5. **4. Tap Share. Send the link.** Anyone can follow live in a browser. End card: "app.sportnnote.in".

## Hashtags
#SportnNote #Pickleball #Tennis #HowTo #WeekendSport

## Alt text (per slide)
1. Title card: "Score your next game. Live."
2. The SportnNote Home screen with the "Score a match" tile highlighted.
3. Setting up a pickleball doubles match between two demo pairs.
4. A live pickleball scoring screen mid-game.
5. The Share button on the scoring screen and the text "Anyone can follow live in a browser. app.sportnnote.in".

## Call to action
Start at https://app.sportnnote.in (link in bio)

## Visual
- **Format and size:** 5 slides, 1080×1350.
- **Frames:** brand background, step number in lime, one phone screenshot per slide (2–5), headline text exactly as in "Slides". 🏓 emoji as sport symbol, no drawn art. "Demo data" on every screenshot.
- **Screen capture:** marketing demo account; pickleball doubles friendly (Asha Rao / Priya vs Meera / Arjun) started from Home → **Score a match**; scoring screen with **Share** in the header.
- **Who makes it:** Design (`des-brand-web`, hand-off in `docs/org/handoffs/`) or founder in Canva.
- **Alt text check:** matches each slide.

## Pre-post checks
- [ ] Every label named above matches the live app (web app.sportnnote.in and Android) on the day.
- [ ] Facts match DEVLOG.md release entries; no invented numbers, quotes or testimonials.
- [ ] No competitor names, no children, no AI faces, no real personal data on screen.
- [ ] "Demo data" label visible for the whole clip / on every screenshot.
- [ ] One call to action; link typed in full, no shortener, no tracking parameters.
- [ ] Hashtags 3–5. Alt text matches the final visual.
- [ ] Founder approval recorded in docs/org/marketing/queue.md.
- [x] Slide 3's set-up screen wording checked in the app (sport picker and side/pair picking labels not verified in this draft — describe, don't quote, if they differ).

## Editor notes
- Title said "4 taps"; it takes more than 4 taps. Changed to "4 steps" (matches slide 1 and the queue).
- Slide 3 labels checked in `src/screens/ScheduleMatchScreen.tsx`: sport chips (`SportPicker`), a "Format" row with "👤 Singles" / "👥 Doubles" (pickleball defaults to Doubles), then pickers "Pair 1" and "Pair 2". Home tile "Score a match" in `src/screens/HomeScreen.tsx` (signed-in scorer; opens the set-up screen).
- Slide 4 "Tap the point to whoever won it" describes, doesn't quote a label — fine.

## Checks
- Editor: ok 2026-11-05
- Security: ok 2026-11-05 — fictional adult pairs; make sure the Pair picker's people list shows only demo accounts (no real names or numbers in the dropdown).
