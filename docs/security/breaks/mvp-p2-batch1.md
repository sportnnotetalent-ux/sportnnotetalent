# MVP P2s, batch 1: break it (2026-10-31)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

**Left out:** L8 (keep viewers on `app.sportnnote.in`). It means proxying the whole web app through the Cloudflare Worker (every bundle and route), and a Worker deploy from the founder's Cloudflare account. It gets its own batch.

| # | Failure | Status |
|---|---|---|
| L10 | **Sign-up's email example is "you@school.edu"**, left from the school focus. | **Fixed:** "you@example.com". Test. |
| L9 | **The spectator's big scoreboard shows short codes ("PAN", "CHE") where full names fit.** | **Fixed:** `boardName`: the spectator board shows the full team name when it fits (about 22 px a character, 360 px and up), else the code; singles and the same-code case unchanged; the Scoring tab keeps codes. Tests; 1,000 simulated names × widths; demo-checked ("Panthers FC 1 : 0 Chennai Stars" wide, "PAN 1 : 0 CHE" at 340 px). |
| L11 | **"Live now" lists matches left "live" for months** (test matches nobody ended). Near you already skips a live match with no activity for 12 hours; Home and the sport hub don't. | **Fixed:** match reads now carry `updated_at`; Home and the sport hub skip a live match idle for 12 hours (`isStaleLive`), as Near you does. Unknown activity shows as before; the match still opens and can be ended. The two old test matches still need ending (by their scorer, or one SQL line from the founder). Tests; 1,000 simulated matches. |
| QT-04 | **The quick tournament says "Today", but the fixtures screen's first kick-off defaults to tomorrow 10:00.** The organiser who picked Today gets tomorrow's fixtures unless they notice. | **Fixed:** the quick form passes Today / Tomorrow to the fixtures screen: Today = the next half hour at least 15 minutes ahead; Tomorrow = 10:00 tomorrow (as before); an organiser's own pick is kept. Tests; 1,000 simulated times. |
| QG-01 | **Every quick game adds a new "Team A" and "Team B"** (or Player / Pair A, B) to the team pickers, so they fill with identical placeholders. | **Fixed:** untouched quick-game sides (ad hoc, named exactly Team / Player / Pair A or B) stay out of the friendly form's pickers; a side already picked stays; renamed sides and real teams always show. Tests; 1,000 simulated names. |

## Follow-on breaks to check while fixing
- **L9:** a long name never pushes the score off the board (one line, ellipsis); narrow phones keep the codes; singles and the "same code" case keep their names.
- **L11:** a live match with any scoring (or row update) in the last 12 hours always shows; a match with no `updated_at` known (demo, older reads) shows as before; the stale match still opens from its link and its scorer can still end it.
- **QT-04:** "Tomorrow" keeps 10:00 tomorrow; "Today" never proposes a time in the past; an organiser's own pick is never overwritten.
- **QG-01:** only untouched placeholders are hidden (ad hoc and named exactly "Team A" … "Pair B"); a renamed side or a real team always shows; a side already picked for this match stays visible.

## Results
Full suite 6,006 tests, 0 failing; tsc clean.
