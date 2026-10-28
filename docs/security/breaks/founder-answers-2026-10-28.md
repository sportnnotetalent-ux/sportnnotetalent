# The founder's answers of 2026-10-28: country from the phone, cue-sport rules, usability

**Process:** quality mandate steps 1–6. Each change started with a failing test. The break-it points below were listed before anything was fixed; each fix then got its own failing test first.

**What changed:**
- **CL-04:** the sign-up country comes from the phone number. Migration `20261028233000_phone_country`; tests `tests/db-phone-country.test.mts` and `tests/sim-phone-country.test.mts`.
- **Pool:** the golden break goes to the breaker, and the race and sets lock once the match starts. Tests: `tests/pool-totals.test.mts` and `tests/pool-app.test.mts`.
- **Billiards:** league tables count points. Tests: `tests/billiards-league.test.mts` and `tests/sim-billiards-league.test.mts`.
- **Usability:**
  - pool setup says "Scotch doubles";
  - a pool foul is picked, then recorded;
  - the live correction link waits for a finished frame;
  - snooker and billiards say when the toss wasn't recorded.

  Tests: `tests/cue-usability.test.mts`.

## CL-04: the country comes from the phone
**The rule** (founder: "for India by default it's +91 … if one verifies their phone number, means they are from that country"):
- **At sign-up:**
  - the mobile's dial code decides;
  - when the number and the device disagree on India, the stricter route applies (the guardian confirms);
  - an under-18 with no phone has proven no country, so the guardian confirms.
- **When the SMS check proves the number:** the account takes that number's country, and the route can only get stricter.

| # | Attempt, or what could break | Status |
|---|---|---|
| PC-01 | **A UK child sets the phone's time zone to India.** | **Fixed:** the +44 number says GB, so the guardian confirms (test). |
| PC-02 | **A direct sign-up call says `country: 'IN'` with no phone.** | **Fixed:** no phone means no proven country, so the guardian confirms (test). The app always sends a mobile, so only a hand-made call takes this path. |
| PC-03 | **A +91 number on a device set to the UK.** | **Fixed:** the stricter route, and the account is stored as GB (test). The app now sends the number's country, so an honest phone never disagrees with itself. |
| PC-04 | **A US (+1) under-13 sets the device to India.** | **Fixed:** refused whatever the device says (test). |
| PC-05 | **A child types an Indian number that isn't theirs** and never verifies it. | **Open.** An unverified number is a claim, not proof. Closing this needs phone verification to be required at sign-up (`TESTING_ALLOW_UNVERIFIED` is the founder's switch). Parental proof (CL-03, next) will also cover every under-18. |
| PC-06 | **An Indian child verifies a +44 number.** | **Fixed:** the account becomes GB and waits for a guardian; the change is logged (test). |
| PC-07 | **A child verifies a +91 number to loosen a waiting account.** | **Holds:** the route never gets looser; a confirmed or withdrawn account is kept as it is (test). |
| PC-08 | **The child can call the "record my country" function themselves.** | **Holds:** only the server can call it, after the SMS check (test). |
| PC-09 | **A guardian's verified number changes the child's country.** | **Holds:** only the caller's own number and a claim record a country (test on the function's source). |
| PC-10 | **A number from a country not on the list** (for example +33). | **Holds:** stored as the device's country if that isn't India, else "ZZ" (outside India); the guardian confirms (test). |
| PC-11 | **A child moved to "waiting" has no guardian email** (India accepts a guardian mobile only). | Accepted. The waiting card sends the email when there is one; otherwise the send says "Add your parent or guardian's email in Edit profile first". |
| PC-12 | **Accounts made before this rule.** | Holds (live, read-only, 2026-10-28): 1 under-18 account uses the India checkbox, and its own number is +91. Nothing to change. |
| PC-13 | **The country decides which Terms version is shown.** | Accepted. It now follows the number too, which is the right version for that person. |
| PC-14 | **Every new person asks the database to read their number.** | Holds. One string match per sign-up; 600 sign-ups and 300 verifications ran in about 2.6 s on the test database. |

## Pool
| # | Attempt, or what could break | Status |
|---|---|---|
| CP-01 | **Scotch doubles: who gets the golden break?** | **Fixed:** the partner who broke, from that rack's break shot (test). |
| CP-02 | **The organiser changes the race in the middle of a match.** | **Fixed:** the race and sets are pinned by the first event, as the game already was. The live "Race and sets" setting and the "re-scored" note are gone (tests). |
| CP-03 | **A stored match replays under a new race.** | Holds: there are no pool, snooker or billiards matches on live (read-only, 2026-10-28), so nothing was scored under the old rule. |
| CP-04 | **Set up with the wrong race.** | Accepted: **↺ Restart match** in the first 5 minutes, or reset the fixture. The guide says so. |
| CP-05 | **"Played out of turn" was a chip under "Foul by \<the player at the table\>".** One tap charged the wrong player. | **Fixed:** the chip is gone; its own button names the other player (test). |
| CP-06 | **A stray tap on a foul chip recorded the foul.** | **Fixed:** a chip only picks; the red **Record foul · …** button records (test). The pick clears when the match moves. |

## Billiards league tables
| # | Attempt, or what could break | Status |
|---|---|---|
| BL-01 | **A match won on frames with fewer points.** | Holds: a win, with a negative points difference (test). |
| BL-02 | **A match ended by hand stores frames won as its score.** | **Fixed:** the table reads the points from the match instead (test). |
| BL-03 | **Team ties.** | **Fixed:** rubbers, then points difference (the frames column is gone for billiards) (test). |
| BL-04 | **A walkover.** | Holds: billiards has no walkover score, so it adds nothing to the difference. |
| BL-05 | **Snooker and pool change by mistake.** | Holds: they still count frames and racks (test). |

## Snooker and billiards
| # | Attempt, or what could break | Status |
|---|---|---|
| SB-01 | **The toss row marked Player 1 before anyone tapped.** It looked recorded. | **Fixed:** nobody is marked until the toss is tapped; a note says who breaks off as set up. The Stats tab says "Toss not recorded" (tests). |
| SB-02 | **Tapping Player 1 for the toss did nothing.** | **Fixed:** the first tap records the toss, even for the player already set to break; a repeat still changes nothing (B-15, tests). |
| SB-03 | **Two phones tap different players for the toss.** | Accepted: the later tap wins, as before. |
| SB-04 | **A one-game billiards match showed "Correct a finished frame" with nothing to correct.** | **Fixed:** the link shows once a frame has finished (test). |

## Simulations
- **Sign-ups** (`tests/sim-phone-country.test.mts`): 600 people with a mix of numbers (+91, +44, +971, +1, +33, none), device countries and ages from 9 to 40.
  - Each outcome matched a model of the rule written separately in the test: refused or not, stored country, consent route.
  - Then 300 SMS verifications. None loosened a route, and each tightening was logged once.
- **Billiards league** (`tests/sim-billiards-league.test.mts`): 500 players in 50 groups, 2,250 matches, about 1 in 12 ended by hand.
  - Frames decided every result, and the points matched sums made in the test.
  - Each group's difference summed to zero, and the order held.
- **Existing runs:** the pool (600 scorers) and snooker and billiards (640 matches) simulations ran again with the new toss and foul rules.
