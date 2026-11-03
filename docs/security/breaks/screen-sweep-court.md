# Screen sweep, court sports (chess, handball, volleyball, netball): break it (2026-11-03)

**Source:** on-screen QA sweep (offline demo, quick friendly, 375-px mobile). Four bugs:

1. **Chess:** after a second illegal move the banner says the loss is pre-selected, but a result picked earlier ("1-0 White wins") stays selected and the button reads "Record 1-0…".
2. **Handball:** Shot › "From where?" › "Not sure" does not advance; "Breakthrough" overflows its pill at 375 px.
3. **Volleyball:** "Opp. fault" only logs "Opp. error"; the fault-type chips (Catch / lift, Back-row / libero fault, Centre line, batch 5) never appear.
4. **Netball:** "Toss-up won by A" before the first centre pass does nothing and says nothing.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix, each with Status: Open. Failing tests first (`tests/screen-sweep-court.test.mts`), then a seeded simulation (`tests/sim-screen-sweep-court.test.mts`).

| # | What could go wrong | Status |
|---|---|---|
| C1 | **The pre-select loses to an earlier pick.** The second-illegal-move effect only set the result when nothing was picked (`pick == null`), so a 1-0 picked before the illegal moves stayed, contradicting the banner. | **Fixed:** the effect (keyed by the illegal-move counts) now always sets the pick (`presetPick`), clearing "no method". Test C1; simulation (200 games, earlier picks overridden). |
| C2 | **The pre-select locks the scorer in.** After it, the scorer must still be able to pick another result (the arbiter confirms). | **Holds:** the effect runs only when a new illegal move changes the key, so a later pick stands. Test C2; simulation. |
| C3 | **The wrong colour is pre-selected.** With White changed in the colour draft, the losing side's opponent must still be the one shown as winning. | **Fixed:** the tile comes from the colour on screen (`whiteDraft ?? s.white`), not the paired colour. Test C3; simulation (winner = preset winner for either colour). |
| H1 | **"Not sure" does not advance.** Shot (and Goal) › "Not sure" must go to the next step with no position, exactly like a position does; the logged payload is `shotType: 'unknown'`. | **Fixed:** both flows step through one pure `afterPosition` (`shotPick.ts`): a position and "Not sure" go to the same next step (shot → saved / missed / blocked, goal → who scored). No logic fault reproduced in node (the old inline handlers also advanced); the screen fault is taken to be the cramped 3-a-row grid (H3), which this also clears. Test H1; simulation. |
| H2 | **"Not sure" records a position.** The stored event must carry `unsure: true` and no `shotType`; no 9 m credit. | **Holds:** the reducer stores `unsure: true`, no `shotType`. Test H2; simulation (200 attempts). |
| H3 | **"Breakthrough" overflows at 375 px.** Three buttons a row leave ~100 px each, too narrow for the word plus the pill padding. | **Fixed:** the grid is two a row with 8 px side padding (`GRID_BTN`): ~150 px per button at 375 px, "Breakthrough" fits; the label is unchanged. Test H3. Not checked on screen. |
| V1 | **Fault chips unreachable without a roster.** With no roster for the scoring side, "Opp. fault" is one button and the chips never show. | **Fixed:** the no-roster panel has an "Opp. fault type (optional)" link that opens the fault chips (all of `VB_ERROR_TYPES`, incl. Catch / lift, Back-row / libero fault, Centre line); with a roster the chips sit under the Opp. fault mode as before. Test V1. |
| V2 | **Fault chips change one tap.** The chips must stay optional: a plain "Opp. fault" tap still logs exactly `OPP_ERROR` with no payload. | **Holds:** tapping 🚩 Opp. fault with no type picked logs `OPP_ERROR` with no payload, one tap. Test V2; simulation. |
| V3 | **A fault type sticks to the next point.** A picked type applies to the next Opp. fault only, then clears. | **Holds:** `reset()` clears the type after every point. Test V3; simulation (score identical with and without types). |
| N1 | **Toss-up before play is silent.** Before play starts the button is disabled with no reason; a tap must say "Start play first (pick the first centre pass)". | **Fixed:** the button is no longer silently disabled; before play a tap shows `tossUpBlocked`: "Start play first (pick the first centre pass)", or "(start the clock)" once the centre pass is picked. Tests N1; simulation. |
| N2 | **Toss-up before play logs.** Following World Netball (a toss-up happens in play), nothing is dispatched before the period starts. | **Holds:** before the period starts nothing is dispatched (UI gate; the reducer is unchanged). Test N1/N2; simulation (200 matches). |
| R1 | **Old logs change.** No reducer changes: chess, handball, volleyball and netball logs replay identically. | **Holds:** no reducer changed (only new pure exports). Chess: 200 old-style logs give the fingerprint recorded on 35a2cb8; volleyball / netball / handball: batch 6's 180-log fingerprint unchanged. Simulation R1. |
| U1 | **Emoji-leading text.** Any new emoji-leading `Text` uses `IconText`. | **Holds:** no new emoji-leading `Text` (the volleyball hint starts with words). `leading-emoji.test.mts` passes. |

**Pinned tests updated:** none.

**Not verified:** the four screens were not re-checked in the demo preview (the lead re-checks on screen).

**Runs:** every test file mentioning chess, handball, volleyball or netball, plus leading-emoji, pad-icons, info-chain and this fix's two files (99 files, 1,851 tests), 0 failing; `tsc --noEmit` clean.
