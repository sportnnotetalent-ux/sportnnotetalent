# The result picture at full time: break it (2026-11-01)

**Growth plan #4.** On the web, the header's Share already sends a 1080×1080 score card with the text (MVP 2026-10-31). What's missing for spread: nothing invites the scorer to share at the moment the match ends, and the card shows no player, though players' families are the people most likely to pass it on.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| R1 | **No prompt at full time.** The only way to share is the small "Share" in the header; at the final whistle the Scoring tab just says "Match complete — final score saved". | **Fixed:** at full time the Scoring tab says "Full time — final score saved" with a big "Share the result" (the same share as the header: text + score card picture on the web). Guests get "Save & share" instead. Tests; demo-checked (the share sent the text and an 89 KB PNG). |
| R2 | **The picture and message name no one.** Player of the match is known (the scorer's pick, else the stat leader) but isn't on the card or in the text. | **Fixed:** Player of the match (the stored pick, else the stat leader) on the card ("Player of the match: …", lime) and in the message ("🏅 Player of the match: …"), results only. Tests. |
| R3 | **A child's full name on a public card.** The scorer may be in a child's circle and see the full name; a shared picture reaches everyone. The card must use the public form: an adult by name, a possible minor (under 18 or age unknown) by initials. | **Fixed:** `cardStar` names an adult in full and a possible minor (under 18, age unknown, or not on the rosters) by initials, whatever this viewer can see. Tests; 1,000 simulated shares (no possible minor's full name ever on the card or in the message). |
| R4 | **Disputed players.** A player under an open dispute is shown as "X" on live surfaces; the card must not name them either. | **Fixed:** a player under an open dispute isn't named. Tests; simulation. |

**Not in this batch:** the picture on the phone apps (`cardPng` returns null there; they share the text and the link, whose preview carries the score). It needs `react-native-view-shot` in a new native build, so it goes with the store build.

## Follow-on breaks to check while fixing
- **No player known** (no stats, a names-only game): the card and text are as before, with no empty "Player of the match" line.
- **Long names** fit the card (shortened like the team names).
- **Guests:** a guest game's full-time prompt is "Save & share" (the account step), not a share of an unsaved game.
- **Live and upcoming** shares are unchanged.

## Noticed (not changed)
A match ended by hand mid-set (time up, retired) shares the sets won as the big numbers ("Player A 0, Player B 0 … won on time · 1-0 (time)"), as retirements already did. The games are in the line. A candidate for the next polish batch.

## Results
Full suite 6,112 tests, 0 failing; tsc clean.
