# Tennis: error direction, fault type, lost by rule: break it (2026-11-02)

The three gaps left by `tennis-serve-and-endings.md` ("Later"), approved by the founder: which way an error went, what kind of fault a serve was, and points lost by a rule.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

## What a tennis stat-keeper records (Match Charting Project, broadcast stats)
- **Errors:** into the net, long (past the baseline) or wide (past the sideline), for unforced and forced errors.
- **Serve faults:** into the net, long (past the service line), wide, or a foot fault, for the 1st serve and for the 2nd (a double fault).
- **Lost by rule (ITF Rule 24):** the player touched the net, hindered the opponent, let the ball bounce twice, was hit by the ball, carried or double-hit it. No winner and no error: a point of its own.

## Failures

| # | Failure | Status |
|---|---|---|
| ED1 | **No error direction.** An unforced or forced error can't say net, long or wide, so "Unforced errors into the net" never exists. | **Fixed:** Forced / Unforced error then "Went: Net · Long · Wide" (optional); the timeline reads "Unforced error (backhand, long)", the commentary "… into the net". Keys ueNet / ueLong / ueWide / feNet / feLong / feWide. Tests; simulation; demo-checked. |
| ED2 | **Direction must not break older details:** a tennis point's `stroke` held legacy shot ids (fh, bh, volley …); a direction must never be read as a shot, nor a legacy id as a direction; a winner has no direction. | **Holds:** a direction is read only for errors and only from net / long / wide; a legacy shot id stays a shot; hostile keys (`__proto__`) are dropped (own-property checks added). Badminton / table tennis keep their own types. Tests; simulation. |
| FT1 | **No fault type.** A 1st-serve fault and a double fault can't say net, long, wide or foot fault. | **Fixed:** after Fault, "1st serve was: Net · Long · Wide · Foot fault"; after a double fault, "Double fault was: …" (optional, one tap, tap again to clear). Tests; demo-checked. |
| FT2 | **The type must stay with its point:** the 1st serve's type rides on the point that follows; a double fault's own type on the double-fault point; both survive a timeline correction; Undo takes a type back; nothing is typed when there is no fault. | **Fixed:** the 1st serve's type rides on the next point (`sf1`), a double fault's own on that point (`sf2`); both replay through a timeline correction; Undo reads "fault type"; with nothing to type the tap changes nothing. Tests; 1,000 simulated matches (250 corrections replay identically). |
| LR1 | **No "lost by rule".** A net touch, hindrance or double bounce must be scored as an unforced error or left blank, which skews winners / errors. | **Fixed:** "Lost by rule" beside the winner / error choices (tennis only), charged to the player who broke the rule; commentary "… loses the point by rule"; counted apart from errors. Tests; demo-checked. |
| ST1 | **Stats:** each new figure shows on the match Stats tab only when the match recorded it, and reaches the player's career (keyed: a match that didn't record it reads "not tracked", never 0). | **Fixed:** Stats tab rows (serve faults into the net / long / wide, foot faults; unforced and forced errors by direction; points lost by rule) only when recorded; career keys srvFaultNet / srvFaultLong / srvFaultWide / srvFootFaults (the serving player's), ueNet … feWide and ruleLosses, all keyed (an older match reads "not tracked"). Tests; simulation (the rows add up); demo-checked. |

## Follow-on breaks to check while fixing
- **Hostile input:** an unknown direction, fault type or how is ignored (never stored, never printed).
- **Other racket sports unchanged:** badminton / table tennis keep their own error types; nothing new appears there.
- **One tap still scores:** every new choice is optional and comes after the point (or after the Fault tap).
