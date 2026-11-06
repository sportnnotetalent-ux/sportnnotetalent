# Demo screenshots (marketing demo account, live app, 2026-11-06)

All from the dedicated marketing demo account with fictional adult names ("name only" players; demo teams "Demo Reds" / "Demo Blues"). 750×1624 (iPhone-size, 2×). No real people, no phone numbers.

| File | Shows | For |
|---|---|---|
| home.jpg | Home with Score a match | post 4 slide 2 |
| football-scoring-2-1.jpg | live football scoring, Share in the header | posts 1, 5 (and post 4 slide 5) |
| football-spectator-2-1.jpg | what a viewer sees from the link, no app | posts 1, 5 |
| pickleball-doubles-setup.jpg | Doubles, Pair 1 Asha Rao / Priya, Pair 2 Meera / Arjun | post 4 slide 3 |
| pickleball-scoring-3-4.jpg | live pickleball doubles, serving badge | post 4 slide 4 |
| badminton-doubles-4-2.jpg | live badminton doubles 4–2 | post 2 |

| kabaddi-fulltime-scorer.jpg | scorer's full-time screen, Demo Golds 5–3 Demo Panthers | spare |
| kabaddi-result-5-3.jpg | viewer's result page | post 3 |
| kabaddi-standings.jpg | tournament standings + records | post 3 |

Still to make: squad session (post 6, needs a demo team).

## App issues noticed while recording (for Design / Engineering)
- Pair names swap order between set-up and scoring ("Meera / Arjun" → "Arjun / Meera", "Kabir / Dev" → "Dev / Kabir").
- Yellow pair colour as text on white (badminton "Dev / Kabir" header before the first point) is hard to read.
- Undo label uses short codes ("point to KD", "point to MA") instead of names.
- **Blocking (tournament slots):** Participating teams → Fill slot → "Or a team already on SportnNote" finds nothing ("No team by that name in this sport") for kabaddi teams the same account just made (Demo Greens / Golds / Panthers), even ones already added to the tournament. So a fixtures-first tournament can only fill a slot with a brand-new team, which requires a captain's name + mobile (sends an invite).
- **Inconsistent:** a new team in a friendly needs only a name; a new team in a tournament (Quick tournament, Fill slot) requires a captain's name and mobile.
- **Confusing:** on Participating teams, the slot-fill search sits right above the "teams in" picker chips; tapping a chip there changes the participant list instead of filling the slot.
- Slots are listed out of order (Team 3, Team 1, Team 2).

Demo data left on the demo account: tournament "Demo Kabaddi League" (3 slot fixtures; Demo Golds and Demo Panthers added as extra participants), friendlies Demo Reds v Demo Blues (football), Asha Rao / Priya v Meera / Arjun (pickleball), Kabir / Dev v Rahul / Veer (badminton).
- **Result held ~60 s after full time:** the result is written when the scorer's countdown ends, or the next time their app opens. If the scorer leaves the screen, viewers keep seeing LIVE (with "Full Time" under it) until then. Seen on the demo kabaddi game: still live in the database 60+ s later, completed only after the app was reopened.
- Long team names are cut on the scorer's full-time card ("Demo Go…", "Demo Pant…") although there's room.
