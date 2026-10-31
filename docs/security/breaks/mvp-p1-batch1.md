# MVP P1s, batch 1: break it (2026-10-31)

**Process note:** this batch worked from the audit's own lists (`docs/mvp/audit-*.md`), and this break-it record was written after the fixes, not before. Each fix did get its own failing test first.

| # | Failure | Status |
|---|---|---|
| F5 | **Football pickup game with no players listed dead-ends:** 12 of 13 stat buttons, the foul and the penalty opened "No players on the field." with only Cancel. | **Fixed:** with no players on that side the "who?" step is skipped and the stat is the team's (as corners and team goals were). Shots and passes still ask on/off target and completed/misplaced; a penalty asks only the outcome; a save with no keeper is the team's. Cards still need a person (a second yellow is per player) and keep "Team official". Tests `football-pickup-no-players`. |
| B7 (basketball) | **No roster: fouls couldn't be logged**, so team fouls, the bonus and bonus free throws never worked. | **Fixed:** a "Team foul" button per side (personal, shooting, offensive, technical; the types that eject a person stay player-only). Counts toward the team-foul limit and the bonus; free throws follow as before. Test `basketball-team-foul`. |
| B3 (basketball) | **A drawn game showed a trophy for the home team** on the line score. | **Fixed:** no winner on a draw. Test `basketball-team-foul`. |
| PB1 | **Pickleball's default "Rec" was secretly best of 3**, so a normal one-game match ran on into game 2 and stayed live. | **Fixed:** "Rec (rally · 1 game to 11)" is the friendly default, plus "Side-out · 1 game to 11"; the best-of-3 presets say so; Match length shows without Customize. Tournaments keep their default. Saved matches keep their stored rules. Test `racket-format-p1`. |
| PD1 | **Padel "Single set" + a match-tiebreak decider made the whole match one 10-point tiebreak.** Tennis had the same trap. | **Fixed:** picking "Single set" resets the deciding set to a full set, and the deciding-set fields hide while the match is one set (`hideWhen`). Tennis's own "Match tiebreak (to 10)" preset is unchanged. Test `racket-format-p1`. |
| B7 (badminton) | **A blank "Points per game" became 0** (every game ended 2-0); the cap stayed at 30 when the points changed. | **Fixed:** leaving the box fixes it (blank → 21, else 5–30); changing the points moves the cap to points + 9. Test `racket-format-p1`. |
| PB4 / PD4 | **Two quick taps logged two rallies** on any racket sport's point buttons. | **Fixed:** a second tap on either button within 400 ms is ignored; the counted one flashes ✓. Test `point-tap-guard`. |

## Follow-on breaks checked
- **F5, a side with players and one without** (e.g. home listed, away not): the check is per side, so the listed side still asks "who?".
- **F5, voice scoring** on a side with no players: says the team name instead of a player's.
- **B7, a team foul that would disqualify:** not offered (U / D / flagrant stay player-only), so no one is ejected by a team foul.
- **PD1, a saved single-set match-tiebreak format:** it keeps playing as saved; only new picks in the editor change.
- **Badminton cap below the points** typed by hand: not blocked (the points change resets it; a hand-typed lower cap still applies). Left as is.
- **Tap guard and the doubles long-press credit:** the credit chips are deliberate picks and aren't guarded.

## Not in this batch
- **F3 football default format** (11-a-side, 45-minute halves): a product decision, 5s or 7s for friendlies. Asked of the founder.
- The rest of the P1 list (undo labels, swap sides, side names as initials, format locked once live, clock, kabaddi raid form, …).
