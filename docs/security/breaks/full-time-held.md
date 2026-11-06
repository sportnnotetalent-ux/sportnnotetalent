# Break-it: viewers see LIVE after full time (2026-11-07)

Found while making the marketing demo (docs/org/marketing/assets/screens/README.md). SD-111 holds a match result
for ~60 s after the deciding tap, so a mis-tap can be undone before followers are told; `status = completed` (the
follower push, the result write-back) is written when the hold runs out, when the scorer leaves the screen or the app
goes to the background, or on the next open. Meanwhile the saved score already says "Full Time" — but the viewer page
(worker/matchPage.ts) and the link preview showed **LIVE**. On the web, closing or reloading the tab didn't send the
held result at all, so viewers kept seeing LIVE until the scorer next opened the app (seen: 60+ s, still live).
Founder 2026-11-07: "Fix LIVE issue first".

Fix:
1. The saved summary carries `f: 1` while the board says the match is decided (`liveSummaryOf`). The viewer page and
   the preview show **FULL TIME** (not LIVE) for a live match with that mark, and keep refreshing until the result lands.
2. Web: `pagehide` (tab closed, reloaded or navigated away) sends the held result at once, like backgrounding the app.

| # | Break | Fix / why it's safe |
|---|-------|-----|
| FT1 | The scorer undoes the deciding tap; viewers saw FULL TIME | The next save writes a summary without `f`, so the page goes back to LIVE on its next refresh (5 s) |
| FT2 | Someone writes `f` by hand to fake a result | It only changes a word on the page; the status, winner, standings and pushes still need the real completed write (unchanged rules) |
| FT3 | The summary grows past the 600-character limit | `f` is one short key; the existing shortening still runs before it's added and the total is re-checked |
| FT4 | pagehide sends a result the scorer was about to undo | Same as backgrounding the app today: leaving the page means the scorer is done; the persisted record still covers a write that doesn't finish |
| FT5 | An old app version (no `f`) | Shows LIVE as before; nothing breaks |

Tests: tests/full-time-held.test.mts.
