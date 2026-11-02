# Tennis: the 1st-serve fault, and every way a point ends: break it (2026-11-02)

Found by the founder scoring a singles friendly (Hrudhay vs Likhi): there is no way to say "1st serve was a fault", and nothing on the scoring screen asks whether a point was a forehand winner, a backhand winner or an unforced error. Only what is captured in scoring can reach the stats.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

## Every way a tennis point ends (ITF Rules of Tennis, ATP / WTA match-stat conventions)

| # | How the point ends | Who wins it | Captured before this batch |
|---|---|---|---|
| 1 | **Ace**: a good serve the receiver doesn't touch | server | ✓ one-tap button |
| 2 | **Service winner**: the receiver touches the serve but can't return it into play | server | only with "Point detail" switched on (off by default) |
| 3 | **1st-serve fault** (net, long, wide, or a foot fault): no point, the server has a 2nd serve | — | ✗ nothing to tap; a "2nd serve" chip after the point, only with "1st / 2nd serve" switched on (off by default) |
| 4 | **Double fault**: the 2nd serve is a fault too | receiver | ✓ one-tap button |
| 5 | **Let**: the serve clips the net and lands in the right box; that serve is replayed (1st stays 1st, 2nd stays 2nd), any number of times | — | nothing to record (correct: no score effect) |
| 6 | **Return winner** / **return error** (forced or unforced) | either | only with Point detail on (Winner / error + shot "Return") |
| 7 | **Winner** in the rally: forehand or backhand; groundstroke, volley, approach, passing shot, lob, overhead, drop shot | hitter | only with Point detail on |
| 8 | **Forced error**: the opponent's shot forced the miss | the other player | only with Point detail on |
| 9 | **Unforced error**: a miss under no pressure (forehand / backhand, by shot) | the other player | only with Point detail on |
| 10 | **Point penalty** (code violation) | the other player | ✓ Quick options → code violation |
| 11 | **Time violation**: warning, then the server loses a serve (a fault) or the receiver a point | depends | warning and point ✓; the server's "fault · loss of serve" is only a note: the server still has the 1st serve |
| 12 | **Lost by rule**: net touch, hindrance, double bounce, ball touches the player, a carry | the other player | a plain point (no winner or error is counted, which is right for the winners / errors figures) |

## Failures

| # | Failure | Status |
|---|---|---|
| TF1 | **No Fault button.** A 1st-serve fault can't be recorded as it happens; a 2nd serve is marked only afterwards, behind a setting that is off. | **Fixed:** "✋ Fault (1st serve)" beside Ace and Double fault, for the server. One tap: no point, the banner reads "Serving: A · 2nd serve", the button becomes "⚠️ Fault again = double fault", and the next point (ace, winner, error) is recorded as a 2nd-serve point. Undo reads "1st-serve fault". Tests; simulation; demo-checked. |
| TF2 | **Point detail is off by default**, so winners, errors, forehand / backhand and shot types are never asked, and the Stats tab and profiles never get them (rows 2, 6–9). | **Fixed:** Point detail is on for every new tennis match: after each point the card asks how it ended (Service winner / Winner / Forced error / Unforced error), then Forehand / Backhand and the shot (Skip any time). Tests; demo-checked. |
| TF3 | **1st / 2nd serve is off by default**, so 1st serve %, 1st / 2nd serve points won are never filled. | **Fixed:** 1st / 2nd serve is on for every new tennis match; a Fault on an older match switches it on from that point. Tests; simulation; demo-checked (Stats: 1st serve in 0/1, 2nd-serve points won 1/1). |
| TF4 | **A time-violation fault doesn't cost the serve** (row 11): the server keeps the 1st serve; on a 2nd serve it must be a double fault (the point to the receiver). | **Fixed:** the server's time-violation "fault · loss of serve" is a fault (2nd serve next); on a 2nd serve it is a double fault, the point to the receiver. A receiver can't lose a serve. Tests; simulation. |
| TF5 | **The fault must be exact:** cleared by every point (ace, double fault, penalty point, a game or set ending); only the server can fault; a second Fault on the same point can't be logged twice (the 2nd-serve fault is the Double fault button); Undo takes the fault back; a timeline correction keeps it. | **Fixed:** every point clears the fault (penalty points, game and set ends too); only the server, only after the toss and before the end, once a point; Undo takes it back; a timeline correction keeps it. Tests; 1,000 simulated matches. |
| TF6 | **Old matches must not change:** matches created before this keep their settings and replay exactly as before; default-on applies only to new tennis matches. | **Holds:** a format without the keys keeps both off and replays as before (tested); the defaults reach only new matches (new-match forms); the organiser and the scorer can still switch either off. |

## Follow-on breaks to check while fixing
- **A Fault on a match with serve tracking off** switches 1st / 2nd serve tracking on from that point (earlier points stay untracked, as with the setting), so a fault never goes uncounted.
- **Ace after a fault** is a 2nd-serve ace; a service winner likewise.
- **Doubles:** the fault is the serving player's; only the serving side can fault.
- **The organiser can still switch either default off** (format settings, or Scoring settings on a live match).

## Later: done 2026-11-02
Error direction, the fault's type and "Lost by rule": see `tennis-endings-depth.md`.
