# Break it: app issues found while recording the marketing demo

2026-11-07. Logged in `docs/org/marketing/assets/screens/README.md`. Of the nine, the slot fill (b68ced4c) and the held result (e935f2e9 / fb489589 / 9cb857de) were already fixed and live. The founder decided item 4 stays as it is: a new team in a tournament keeps the captain's name and mobile compulsory. This covers the other six.

| # | Issue | Cause | Risk if fixed carelessly |
|---|---|---|---|
| DR1 | Pair names swap order: "Meera / Arjun" at setup becomes "Arjun / Meera" in scoring. | `getRoster` returns players in database-id order (live) or demo-list order, not the team's roster order. | Changing squad order elsewhere (squad pages, pickers) in a way people notice. Losing players when the roster lists someone the read can't see. |
| DR2 | A pale team colour (yellow, peach) as text on white is unreadable. | The team colour is used raw as text in the set-by-set scoreboard, commentary and stats tables. | Changing the colour of fills and dots, which are fine, or making every team colour look the same. |
| DR3 | The undo button shows short codes ("point to KD") instead of names. | The label gets `homeName` / `awayName` (the codes) instead of the names the screen shows. | Long names overflowing the button (it's one line, ellipsised). |
| DR4 | On Participating teams, the slot-fill search sits just above the team chips. A tap meant for a search result toggles a team in the tournament instead. | Same chip style for "put this team in the slot" and "include this team"; the search is last in the panel, right above the picker. | Removing the new-team route (captain details stay compulsory). |
| DR5 | Slots listed out of order (Team 3, Team 1, Team 2). | Entries are in database order. | Moving real teams around, or "Team 10" sorting before "Team 2". |
| DR6 | Long team names are cut on the scoreboard ("Demo Go…") though the card has room. | A fixed 120 px name column. | Pushing the score columns off-screen on narrow phones or with many periods. |

## Fixes and checks

- **DR1:** `getRoster` returns the squad in the team's own order (`inRosterOrder`), live and demo. Anyone not in the list keeps their place after; an unreadable id is skipped, so nobody is lost (600-case simulation). Demo: "Aanya / Divya" and "Aisha / Tina" kept their set-up order.
- **DR2:** team colours used as **text** go through `ensureContrast` (WCAG AA 4.5:1); fills and dots are unchanged.
  - Where: the set-by-set scoreboard (all line-board sports), commentary, the two stats tables, the Summary card, the archived final score, cricket's tie and final cards, and the team-initial avatars.
  - A losing side now dims its **numbers**, not its name.
  - Demo: Green House reads in a darker green; the losing Red House stays readable.
- **DR3:** the undo label uses the names the screen shows (`homeShown` / `awayShown`): pairs by name ("Undo: point to Aisha / Tina"), team sports by the code shown next to the buttons. Demo checked.
- **DR4:** the fill-slot panel is a boxed area, set apart from the team picker.
  - It leads with "Or a team already on SportnNote".
  - Results are rows reading "Put X in Team 1" (`ListRow`), not chips like the picker below.
  - The new-team route (captain's name and mobile, still compulsory per the founder) follows "— or a new team —".
- **DR5:** `slotsInOrder`: slots read Team 1, Team 2 … Team 10 (numeric), in the places slots hold; real teams keep theirs (600-case simulation).
- **DR6:** the scoreboard's name column grows into the free room (`nameColumnWidth`, 120–220 px, never squeezing the scores). A name that still doesn't fit wraps to a second line instead of being cut. Demo: "Green House" with 4 sets wraps; with 2 halves, "Demo Panthers" fits on one line.

**Tests:**
- `tests/demo-recording-bugs.test.mts` (9);
- `tests/sim-demo-recording-bugs.test.mts` (600 cases);
- `tests/undo-labels-quick-sheet.test.mts`: updated for DR3.
- Full suite: 7,652 pass, 0 fail; tsc clean.

**Not checked in the demo:** DR4 and DR5. The offline demo has no slot tournament, so the tests cover them; I'll check them on the live Demo Kabaddi League after publishing.
