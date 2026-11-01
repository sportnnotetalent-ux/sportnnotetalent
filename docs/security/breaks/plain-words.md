# Plain words in the setup and on the board: break it (2026-11-01)

**Growth plan #3** (MVP audit B11, B12, T12, T13, T14, K13, PB9, PD7). A newcomer meets federation shorthand at the moment they're deciding whether the app is for them.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| W1 | **Badminton setup jargon:** "BWF · 21 rally", "5×11 (rally, cap 15)", "15-point", "Deuce cap", "Golden point (next wins)". | **Fixed:** "Games to 21, best of 3", "Games to 11, best of 5", "Games to 15, best of 3", "One game to 21"; "Longest a game can go"; "Next point wins" / "Play on until 2 clear". Tests. |
| W2 | **Tennis setup jargon:** "Fast4", "Pro set (to 8)", "Grand Slam (Bo5, 10-pt TB at 6-6 in set 5)", "Set tiebreak at N-N", "Sudden death at 4-4", "deuce court". | **Fixed:** "Short sets to 4, no deuce (Fast4)", "One long set to 8 (pro set)", "Best of 5, tiebreak at 6-6 in the 5th (Grand Slam)", "Doubles: no deuce, 3rd set is a tiebreak to 10", "Tiebreak when a set is level", "Next point wins at 4-4 (Fast4)", "right-hand (deuce) court". Tests. |
| W3 | **Padel's default is "Golden point (WPT style)"**; WPT no longer exists. | **Fixed:** "Golden point (best of 3)". Test. |
| W4 | **Kabaddi:** "Revival style: Sanjeevani / Amar / Gaminee" leads with the Hindi rule names; the timeline says "All out" where Indian amateurs say "Lona". | **Fixed:** "When a player is out": "They come back as you score (Sanjeevani)", "No one goes off, points only (Amar)", "No revivals until an all out (Gaminee)"; the timeline says "All out (Lona) +2". Tests. |
| W5 | **Boards say "best of 1"** for one game (badminton) or one set (tennis); the summary says "single game" / "single set". | **Fixed:** "single game" / "single set" on the badminton and tennis boards, as padel and the rally sports already said. Tests. |
| W6 | **Tennis at 40-40 shows "40 40"**, never "Deuce"; in no-ad nothing says "deciding point". | **Fixed:** `tennisStatus`: the board reads "Set 1 · Deuce", "Set 1 · Advantage", or (no-ad) "Deciding point". Tests; demo-checked. |
| W7 | **Pickleball side-out's three-number call** ("4-2-1") and "server 2" aren't explained. | **Fixed:** a line under the side-out serve: "The call is the serving side’s score, the other side’s score, then server 1 or 2." Test. |

## Follow-on breaks to check while fixing
- **Only words change:** every stored value (`bwf21`, `fast4`, `premier`, `sanjeevani`, …) and every preset's rules stay the same, so saved matches and tournaments read and play exactly as before.
- **Regulars still find their term:** the known name stays in brackets where it helps ("Fast4", "Sanjeevani", "Lona", "deuce court").
- **Words that other screens match on** (the timeline, the website guides) are updated together.

## Checks
- **Only words changed:** every option's value and rules in the badminton, tennis, padel and kabaddi formats compared with the last commit: identical.
- **Simulation:** none needed for a words-only change (no rule, score or data path moved); the comparison above stands in for it.
- The website guides (badminton, tennis, padel, kabaddi) use the new words; the tennis guide's format list was also brought up to date with batch 4's order.

## Results
Full suite 6,098 tests, 0 failing; tsc clean.
