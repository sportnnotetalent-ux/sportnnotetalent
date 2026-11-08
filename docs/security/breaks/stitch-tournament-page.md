# Tournament page, Stitch picks 7–10 — break it first

2026-11-08. From docs/design/stitch-picks/3-tournament.png:
- **7:** a count strip under the title;
- **8:** a standings card at the top of Matches;
- **9:** livelier match cards;
- **10:** seeds and house tags.

| # | Break | Kind | Fix |
|---|---|---|---|
| TP1 | The count strip counts deleted / cancelled matches or the same team twice, so the numbers don't match the lists. | Trust | It counts the same lists the page shows: the fixtures, the tournament's sports, and the distinct teams in entries + fixtures. Tested. |
| TP2 | The strip shows "0 fixtures · 0 teams" on a brand-new tournament (noise). | UX | Zero counts are left out; with nothing to count, there's no strip. |
| TP3 | The standings card shows a table for a knockout-only or event sport (athletics), where a table means nothing. | Trust | It shows only when there is a real table: the medal/house table for a multi-sport meet, or the first league/group table with results. Otherwise nothing. Tested. |
| TP4 | "Q" marks a team as through before it is mathematically through. | Trust | Q comes only from the existing group view's `qualified` mark (decided teams), never from the current position. Tested. |
| TP5 | A long list makes the main page heavy. | UX | Top 4 rows; "Full standings ›" opens the Stats tab. |
| TP6 | "Tap to score ›" on every live card tells viewers they can score. | UX | It reads "Live scorecard ›" for everyone; the scorer still scores from that screen. |
| TP7 | Seeds and house tags (pick 10) would be invented: seeds aren't stored, and an individual entrant has no house on the match. | Trust | **Not built.** Shown only when known, and they aren't yet. Listed as a follow-up (needs seeds saved with the draw). |
| TP8 | "Set alert" on upcoming cards (part of pick 9) would promise an alert the app can't send: there's no "follow a match". | Trust | **Not built.** Listed as a follow-up (needs a match follow + its notification). |
