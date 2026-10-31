# SportnNote MVP

Set by the founder on 2026-10-31. This is what we perfect first: before marketing spend, and before more breadth.

## The MVP in one sentence
**Score any match live from your phone, everyone follows it from a link, and the results, standings and player stats build themselves.**

The hook is the **live score link**. Every match scored puts SportnNote in front of the players' families and friends, and that's how it spreads. (Strava's first version was a leaderboard on one hill; ours is the live link.)

## Who it's for first
**Community and friends' games:** adults running friendlies, turf games and community tournaments.
- The person we optimise for is the **organiser or scorer at the ground**, phone in one hand and often in a hurry.
- Next come the **players** and the **people following** the match.
- **Schools and colleges** are wave two.

## The sports to perfect first
Football, basketball, kabaddi, badminton, tennis, pickleball and padel.

Every other sport stays in the app as it is. These seven get the polish first.

## The core loop
1. **Set up:** a match in under a minute, or a tournament with fixtures in a few minutes.
2. **Score:** fast, never wrong, works on a weak network, one hand.
3. **Share:** one tap to WhatsApp.
4. **Follow:** anyone opens the link with no sign-up and watches it live.
5. **Result:** the final score, standings and each player's stats appear on their own, ready to share.

## What "perfect" means (the bar)
| # | Check | Target |
|---|---|---|
| 1 | A brand-new person, from download to scoring live (including sign-up) | ≤ 2 minutes |
| 2 | A full match in each MVP sport, standard amateur format | 0 wrong scores, 0 lost taps, even offline |
| 3 | A shared link on a mid-range Android on 4G | Opens in < 3 s, no sign-up, updates live, good WhatsApp preview |
| 4 | 8 teams → fixtures → correct standings | ≤ 5 minutes |
| 5 | The moment a match ends | Shareable result and player stats |
| 6 | Stability | ≥ 99.5% crash-free sessions; no match stuck on "live" |

## The funnel we watch every week
sign-up → first match created → started → completed → shared → viewers per match → a second match within 7 days.

**Baseline (live, 60 days to 2026-10-31):**
- 74 people opened the app; 10 accounts; 6 sign-ups.
- 34 matches created → 5 started → 5 completed. Only 2 matches have ever had a score tapped in, by 2 people. 10 share links sent.
- 39 of 44 matches are football.

## Not the MVP (later layers; kept, not polished first)
- Verification and parental proof; certificates, passport, Hall of Fame.
- Clubs and communities, find a game, messages, voice scoring.
- Golf, athletics and other meets.
- Schools' structures.
- The depth of the other 26 sports.

## How we perfect it
1. **Audit the loop** as a brand-new user, for each MVP sport. Time every step and note every point of friction, ranked:
   - **P0:** a wrong score, lost data, or a standard amateur match can't be finished;
   - **P1:** friction or confusion;
   - **P2:** polish.
   Findings go in `docs/mvp/`.
2. **Fix in loop order,** tests first (quality mandate).
3. **Real games:** 3–5 real matches or tournaments with friends in Hyderabad, watching the funnel.
4. **Re-check the bar,** then point the marketing at it.
