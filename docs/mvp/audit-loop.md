# MVP audit: the shared loop (set up → score → share → follow → result)

2026-10-31. **Checked by:** the live web app (signed out, at sportnnote.expo.app), the offline demo at phone size, and the code. The per-sport scoring audits are in the other files in this folder.

**Ratings:**
- **P0** blocks the MVP or loses or corrupts data.
- **P1** is real friction against the bar in `docs/product/MVP.md`.
- **P2** is polish.

| # | P | Loop step | Finding | Where | Fix | Size |
|---|---|---|---|---|---|---|
| L1 | **P0** | Score | **The eligibility gate would block friends' games.** `TESTING_ALLOW_UNVERIFIED` is `true` today, and the code says it must be `false` before go-live. When it's false, any player without a date of birth, a verified mobile and a verified email can't be picked for a match. Name-only players ("Use 'Ravi' as a name only") have none of these, so a friendly among friends without the app couldn't be scored. | `src/core/eligibility.ts:16-45, 80` | **Decided 2026-10-31: friendlies open, tournaments choose.** Friendlies are never gated. A tournament can require verified players as an organiser option, off by default for community events. Child safety stays with parental proof and name masking, which don't depend on this gate. | S–M |
| L2 | P1 | Share | **The WhatsApp/link preview is generic.** A shared `app.sportnnote.in/m/<id>` previews as "SportnNote: score your games, run tournaments" with the logo. It should show "⚽ LIVE · Panthers 2–1 Cheetahs", which is the hook in the MVP sentence. | Static `og:` tags in `public/index.html` (EAS Hosting serves the same HTML for every path) | A Cloudflare Worker on `app.sportnnote.in` that answers link-preview crawlers (WhatsApp, Facebook, X, LinkedIn, Telegram) for `/m/`, `/t/` and `/p/` with per-match `og:title`/`og:description` and a score-card image. People still get the app. | M |
| L3 | P1 | Follow | **Heavy first load for a spectator.** About 1.5 MB compressed, about 7 MB of JavaScript (`__common` 1.66 MB + `index` 5.29 MB raw), before the match page and its sport load. That's 1.2 s on a fast desktop; my estimate for a mid-range Android on 4G is 5–10 s. The bar is under 3 s. | Web bundle | A light spectator page for `/m/<id>`: a small separate entry with the score, live updates and "Open in app". Or split the main bundle so the match page loads first. Measure on a real mid-range phone first. | L |
| L4 | P1 | Set up | **A quick doubles game takes about 12–14 taps plus typing 3 names** before the first point (sport → doubles → new pair → me → name → name-only → new pair → name → name-only → name → name-only → create). Singles and teams are lighter but have the same pattern. | `src/screens/ScheduleMatchScreen.tsx` | A "Quick game" path: sport (pre-selected) → Start. The sides default to "Side A" and "Side B" (or "Pair A/B"), and names can be added later from the match. | M |
| L5 | P1 | Set up | **Nothing is pre-selected** on Start a friendly. The sport isn't set even though the first-run questions know their sports. Last-used venue and format aren't remembered. | `ScheduleMatchScreen.tsx` | Default to the last-used sport (else their first chosen sport), last venue and last format. | S |
| L6 | P1 | Set up | **The tournament form is long for a community organiser:** about 17 sections (banner, logo, time zone, category, host, contested by, co-hosts, divisions, 33 sport tiles, contact, about, reminders, registration). Adding teams and generating fixtures come after it, on other screens. The bar is 8 teams → fixtures in 5 minutes or less. | `src/screens/CreateTournamentScreen.tsx` | A quick path: name, sport, team names (paste a list), format (league / knockout / groups), then fixtures. Everything else goes under "More options". Pre-fill City from the organiser's home city, which also places their matches for Near you. | M–L |
| L7 | P1 | Result | **No result image.** Share sends good text ("⚽ LIVE / Panthers 2 / Cheetahs 1 / link"), but there's no image card for WhatsApp status or Instagram, which is how players show off a result. | `src/core/shareText.ts` (text only) | A result card image (teams, score, sport, top performer, SportnNote mark), shared with the text. | M |
| L8 | P2 | Follow | The link changes domain: `app.sportnnote.in/m/<id>` redirects to `sportnnote.expo.app/LiveScoring?matchId=…&homeName=…` (a long technical address on the hosting domain). | Cloudflare redirect + app linking | Keep viewers on `app.sportnnote.in` (proxy instead of redirect), and keep the short `/m/<id>` address. | M |
| L9 | P2 | Follow | The spectator's big scoreboard shows short codes ("PAN", "CHE") where full names fit. | LiveScoringScreen scoreboard | Show full names when they fit; codes only on narrow screens. | S |
| L10 | P2 | Sign-up | The email example is "you@school.edu", left from the school focus. | `src/screens/AuthScreen.tsx:300` | "you@example.com". | S |
| L11 | P2 | Home | "Live now" still lists test matches left "live" for months (Lions vs Tigers since 22 Aug, Brazil vs Japan since 26 Sep). Near you already skips them. | Data + Home feed | Offer to end a match nobody has touched for 12 hours (scorer gets a nudge), or end those two by hand. | S |

**Already good:**
- A signed-out visitor opens a match link straight to the live scoreboard, with a soft "Join free" bar.
- Share text is clear.
- Name-only players exist for friends without the app.
- Pickleball offers rally scoring and the common formats.
- Offline scoring is queued (outbox).
- Sign-up is about a minute on the phone path.
