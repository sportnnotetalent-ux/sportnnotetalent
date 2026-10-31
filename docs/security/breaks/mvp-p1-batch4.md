# MVP P1s, batch 4: break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| T2 | **Tennis presets trap amateurs.** "Match tiebreak (to 10)" makes the whole match one tiebreak. The usual club format, 2 sets + a match tiebreak for the 3rd, exists only inside "Doubles (no-ad …)", which forces no-ad. "One set" is hidden under Customize. "Best of 5" and "Grand Slam" lead the list. | **Fixed:** order Best of 3 · 2 sets + match tiebreak (3rd to 10, advantage games) · One set · Short sets (to 4) · Fast4 · Pro set · Doubles · Match tiebreak only · Best of 5 · Grand Slam. No stored value removed. Tests; 500 simulated matches across every preset; seen in the demo. |
| B2/T8 | **Doubles: a press longer than 350 ms scores nothing.** It opens "credit a player" instead, with no buzz, so a firm press while watching the court is a lost rally. | **Fixed (the simple option):** the hold is 600 ms, buzzes with its own pattern (`holdFeedback`), and the chips say "Not scored yet". Test. Not done: "score on press, credit afterwards" (needs a way to amend a point's credit). |
| B5/T7 | **Both sides can get the same (or a very close) colour.** Colour is the main guard against wrong-side taps. | **Fixed:** `distinctSideColors` — when the two colours are too close, the scorer's view gives away the fallback farthest from home; saved colours unchanged. A new side also takes a palette colour the other side isn't using. Tests; 1,000 simulated pairs. Not shown in the demo (needs two near-colour sides). |
| F9 | **Both team buttons can read the same.** On-the-fly teams get auto-initials: "Kondapur FC" and "Kukatpally FC" are both "KF", so both Goal buttons say "Goal — KF". | **Fixed:** `uniqueShort` keeps a new side's code different from the other side's (KF / KUK); codes are at least 2 characters; a match whose codes already match shows the full team names. Tests; 1,000 simulated pairs. |
| K4 | **Kabaddi: Pause and the two Timeout buttons sit just above the raid buttons and fire on the first tap.** A timeout also pauses the clock as a second step, so undoing it takes two taps, and the bar just says "Undo" for both. | **Fixed:** a timeout pauses the clock in the same step (new logs: `pauseAt`), so one Undo reverses it; the clock row sits below the raid buttons; PAUSE / RESUME have Undo labels. Older logs replay the same. Tests; 500 simulated halves; seen in the demo (one tap paused and counted; one Undo restored both). |
| PB3 | **Pickleball doubles: scoring is locked until "Who starts on the right?" is picked for both teams**, on top of "Who serves first?". | **Fixed:** only "who serves first" blocks scoring; "who starts on the right" is optional and folded away, highlighting the roster-order default. Tests. Not shown in the demo (needs named pairs). |

## Follow-on breaks to check while fixing
- **Saved matches:** formats, logs and colours saved before the change play exactly as before. A stored tennis preset value that moves or is renamed must keep working.
- **Long press:** a quick tap still scores at once; the credit chips still work; a long press never scores twice.
- **Colours:** only the scorer's view changes; the sides' saved colours don't. Two clearly different colours are left alone.
- **Short codes:** a side never gets a blank code; the full name wins on the buttons only when the two codes match.
- **Kabaddi timeout:** an older log (TIMEOUT then a separate PAUSE) replays the same; the new single step pauses and counts the timeout; the 2-per-half limit still holds.
- **Pickleball:** with no pick, the serve order follows the roster order, as older matches do; "Fix who started on the right" still works.

## Found by the simulation
A one-letter team name ("K") got a one-character code. Codes are now padded to 2 characters ("KX"), as player entry codes already were. New teams only.

## Results
Full suite 5,923 tests, 0 failing; tsc clean.
