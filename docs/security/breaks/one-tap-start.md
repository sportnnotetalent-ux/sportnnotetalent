# One-tap start (B9 / T17 / K5): break it (2026-10-31)

**Growth plan #2.** Starting a match is two or three steps with near-identical words: "Start the match", then the sport's own first question ("Who serves first?") or a second start button (kabaddi's "Start match" to run the clock).

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| S1 | **Racket sports: two steps.** Badminton, tennis, padel, pickleball, squash and table tennis show "Start the match", then "Who serves first?" with the point buttons locked until it's answered. | **Fixed:** the start panel asks "Who serves first?" with "▶ A serves" / "▶ B serves"; one tap starts the match and logs the same SET_FIRST_SERVER the second step logged (`core/startStep.ts`). Tests; 500 simulated matches; demo-checked (badminton: one tap, point buttons ready, A serving). |
| S2 | **Kabaddi: two start buttons** with almost the same words: "Start the match", then "▶ Start match" to run the clock. | **Fixed:** "Start the match" also starts the clock (the same KICKOFF the second button logged). Tests; 500 simulated halves; demo-checked (straight to the raid buttons). |

**Kept as they are (on purpose):** football's "Kick off" also stamps the starting XIs and turns on FIFA minutes, and basketball's tip-off names the period and its clock. They're a real second moment (the whistle), not a duplicate.

## Follow-on breaks to check while fixing
- **The same events as before:** one tap logs exactly what the two taps logged (the server pick, or the kick-off with its time); saved matches replay unchanged.
- **The uneven-squads warning** still comes first, and "Start anyway" also makes the pick / starts the clock.
- **Changing your mind:** the server can still be changed before the first point ("Who serves first?" stays below the buttons), and fixed later as today.
- **Undo** of the start takes back the pick (or the kick-off): racket sports show "Who serves first?" again under the buttons, as before; the "Start the match" screen itself doesn't come back on this phone (it never did after a start).
- **Viewers, guests, and other devices** see the same start (it's a normal logged event).

## Results
Full suite 6,084 tests, 0 failing; tsc clean.
