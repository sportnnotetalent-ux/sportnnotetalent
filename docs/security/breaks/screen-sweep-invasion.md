# Screen sweep, invasion: break it (2026-11-03)

**Source:** an on-screen QA sweep (offline demo, quick friendly, mobile): hockey strokes / shots, the ice hockey penalty shot and rugby's penalty-try card.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| S1 | **Hockey: Stroke → Saved / Missed and Shot → On goal / Wide / Blocked record nothing in a friendly with no squad.** The engine counts them (batch 1), but the outcome tap only opens a "who took it?" step. With nobody listed that step is a bare "No players listed" panel with a Skip chip, so the scorer reads the tap as done, moves to Stats / Commentary and the pending step is dropped: no STROKE / SHOT is ever fired (Penalty strokes 0, no shots row, empty Commentary). | **Fixed:** `asksWho(listed)` (invasion/asksWho.ts): with nobody on the field the Saved / Missed / Scored stroke tap and the On goal / Wide / Blocked shot tap (and the PC's Saved / Wide) record at once, unnamed. The actions come from new engine builders `strokeTapActions` / `shotTapActions` / `saveAction` (hockey/engine.ts): the same STROKE (shot flag) / SHOT / SAVE as before. Tests S1 in tests/screen-sweep-invasion.test.mts (Stats box + Commentary); sim. |
| S2 | **Ice hockey: Penalty shot → Saved / Missed / Scored records nothing with no squad.** Same dead end ("Penalty shot · shooter" with only Skip). A normal Shot opens straight on its grid, so its Skip is seen and it counts. | **Fixed:** `penaltyShotAction` (ice_hockey/engine.ts) builds the tap's one action — saved = SHOT `ps` (shot on goal, the save to the goalie in net when set), missed = MISS, scored = GOAL `ps` — and the Scored / Saved / Missed tap records at once when no skater is listed. Tests S2; sim. |
| S3 | **Rugby: the penalty-try card with no squad.** Yellow / Red opens a player grid with **no** skip: "No players listed", and the only control is the official's "Record", which logs "Yellow card (sin-bin) · Team official". A player’s offence is booked on an official and the card is lost from the team’s cards. | **Fixed:** `cardTapAction` (rugby/engine.ts) is the player-card tap (second yellow = red as before); no player = an unnamed player's card, never an official. The card's player grid gets a "Player not listed" chip, and after a penalty try with nobody listed Yellow / Red record at once. Tests S3; sim. |

## Follow-on breaks to check while fixing
- F1 **Old logs replay identically**: no reducer change, no new key read; an old STROKE / SHOT / MISS / CARD log replays to the same state. **Proved:** "old logs" tests (exact event lists); the sim replays every log.
- F2 **One tap stays one tap**: with nobody listed the outcome tap records at once; with a squad the picker still shows (and still has its Skip). **Proved:** `asksWho` tests; the sim plays half its matches with no squad and checks every tap lands.
- F3 **A saved stroke / shot / penalty shot still gives the keeper / goalie the save** when one is set, and saves never exceed the other side's shots on goal. **Proved:** S1 / S2 credit tests; sim checks after every tap.
- F4 **An unnamed rugby card is a player's card**: counted in team cards, no player credit, never an official. **Proved:** S3 tests; sim. Note (not changed): the on-field tracker ("playing a player short") follows named players only, as it always has for unnamed cards, so old matches replay the same.
- F5 **Undo** takes a recorded tap back as before (each action its own log entry). **Proved:** sim checks hockey undo prefixes.

## Results
Simulation: tests/sim-screen-sweep-invasion.test.mts, 600 hockey (over 5,000 taps), 600 ice hockey and 600 rugby random matches, half with no squad.

Run: every test file mentioning hockey / ice_hockey / rugby, leading-emoji, pad-icons, info-chain and the two new files: 934 tests, 0 failing; `npx tsc --noEmit -p .` clean. Not checked in the running app.

Side note (not fixed): ice hockey's "Penalty shot" Scored still asks the shooter when skaters are listed (unchanged); the hockey Goal / PC-goal scorer steps keep their picker.
