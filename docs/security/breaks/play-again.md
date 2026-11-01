# Play again, and the 7-day nudge: break it (2026-11-01)

**Growth plan #7 (retention).** The funnel's last step is "a second match within 7 days". Today a finished friendly offers nothing next: running it again means "Start a friendly", picking both teams and the format again; and nothing reminds a scorer who doesn't come back.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| PA1 | **No "again".** A finished friendly can't be replayed without re-entering everything. | **Fixed:** at full time a friendly's scorer gets "Play again (same teams & rules)": one tap creates the next match and opens it at "Start the match" (`data/playAgain.ts`). Tests; demo-checked (Red House vs Blue House → a new match, 0-0, ready to start). |
| PA2 | **Copying the wrong things.** A replay must copy the teams, the effective format, the venue and the squads, never the result, officials, player of the match, the scorer list or internal keys (walkover, series / tie markers, an aggregate prior). | **Fixed:** `playAgainDraft`: the clone rules (teams, effective format, venue; squads copied after), minus the live-stream link and the series / aggregate keys; internal `__` keys never come. Tests; 1,000 simulated replays. |
| PA3 | **Tournament matches** follow their fixtures; a "play again" there would create a stray friendly between two tournament teams. | **Fixed:** no Play again for tournament matches (null draft; the button isn't shown). Tests; simulation. |
| PA4 | **Double taps** must not create two matches. | **Fixed:** one replay at a time ("Setting up…", taps ignored while it runs). Test. |
| PA5 | **No nudge.** A scorer who doesn't score again within a week hears nothing. | **Fixed:** when a friendly's result is final, a local reminder six days later: "Another game this week? Play again: Panthers vs Cheetahs, set up in one tap."; tapping it opens that match. Phone app only. Tests. |
| PA6 | **Nagging.** The nudge must be one at a time (a newer match replaces it), cancelled the moment they score another match, and switchable off; it must not disturb the match reminders' scheduler. | **Fixed:** one id (`nudge:replay`, outside the reminders' prefixes, so their scheduler never touches it); a newer match replaces it; scoring another match cancels it; Settings → Match reminders → "Nudge me to score my next game" switches it off. Tests. |

## Follow-on breaks to check while fixing
- **The new match is theirs:** the person tapping is host and scorer, as for any friendly they create.
- **Guests:** a guest game saves first ("Save & share"); "Play again" appears once it's a real match.
- **Web:** no local scheduler, so no nudge there (phone app only); Play again works everywhere.

## Not shown in the demo
The nudge (the web has no local scheduler; the offline demo runs on the web). Check on the Android app after the update: finish a friendly, then look under the phone's scheduled notifications, or wait six days.

## Results
Full suite 6,141 tests, 0 failing; tsc clean.
