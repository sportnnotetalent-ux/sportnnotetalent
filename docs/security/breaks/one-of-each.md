# Break-it: one of each (UI audit step 4, 2026-11-05)

Audit #7, #8, #10, #28, #30. One sport picker (your sports first, the everyday seven, the rest behind "More sports…") in Quick tournament, New tournament and Squad session; one city field (search the app's city list, typing still allowed) for tournaments and communities; the venue field becomes a search over grounds already used with the Maps link folded; one date-range format ("29 Oct – 12 Nov") everywhere a tournament's dates show.

| # | Break | Fix |
|---|-------|-----|
| OE1 | A chosen sport that isn't in "your sports" or the everyday list disappears from the picker | Selected sports always show, before "More sports…" |
| OE2 | Junk or retired sport ids (old profile data) appear as chips | Only known sports are shown |
| OE3 | A club's session offers sports the club doesn't play | `limitTo` (the club's sports) wins, no "More" |
| OE4 | A town not on the city list can't be entered | The city field still accepts typing; the list only suggests |
| OE5 | City search hammers the server on every key | 250 ms debounce, latest answer wins, at most 8 results (search_cities) |
| OE6 | Venue suggestions show duplicates or the name already typed | De-duplicated case-insensitively; the exact typed name is left out; at most 6 |
| OE7 | Hiding the Maps link loses a link already set | Shown whenever a link is set |
| OE8 | Bad or missing dates print "undefined" | Missing end → "from 29 Oct"; same day → one date; unreadable → as stored |

Tests: tests/one-of-each.test.mts.
