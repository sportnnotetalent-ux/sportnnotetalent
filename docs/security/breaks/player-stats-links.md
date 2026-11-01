# "Your stats from today's game": break it (2026-11-01)

**Growth plan #5.** Every player in a scored match is the best person to spread it, but today nobody tells them: alerts go to *followers*, and a player added by mobile number only ever got the "you've been added" invite.

**Design:**
- **Players with an account:** a push to each of them, from the scorer's phone, once the result is final: "Your stats from today's game: 2 goals · 1 assist. Panthers 2–1 Cheetahs". The push function already allows pushes between people in the same match.
- **Players without an account** (added by mobile number): no free channel exists (SMS costs money; WhatsApp business sending isn't set up). So at full time the scorer gets "Send players their stats": one row per player, one tap opens the scorer's own WhatsApp with that player's message ready, ending "Sign up with this number to keep your stats".

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| PS1 | **Players hear nothing about their own game.** | **Fixed:** players with an account get a push ("Your stats from today’s game": their figures and the score); players added by mobile number are listed at full time under "Send players their stats", one WhatsApp tap each from the scorer's phone (`core/playerStatsMessage.ts`). Tests; demo-checked ("Hi Rohan! Your stats from today’s football game: 1 goal · 1 shot on target. Red House 1–0 Blue House" + the match link). |
| PS2 | **Too early or too often.** The deciding tap is held ~60 s (Undo can take it back), and the screen can be reopened: the push must wait for the final result and go once per match. | **Fixed:** only once the result is final (no ~60 s hold running), and once per match on this device (a saved flag). Tests. |
| PS3 | **Messaging a child.** A player known to be under 18 must not be messaged directly: their guardian's number, or nobody. Numbers come only from what this viewer is allowed to see. | **Fixed:** a player known to be under 18 is reached through their guardian's number ("Hi Mom! Kiran’s stats…"), never their own; with no guardian number, not at all. Numbers come only from players_view. Tests; 1,000 simulated rounds. |
| PS4 | **Empty messages.** A player with no counted stats ("0 goals") gets nothing. | **Fixed:** no message for a line with nothing to say. Tests; simulation. |
| PS5 | **Disputed identities.** A player under an open dispute isn't messaged or pushed. | **Fixed:** disputed players are left out of both. Tests; simulation. |
| PS6 | **The scorer pushing themselves**, or a guest game (nothing on the server) pushing anyone. | **Fixed:** never the scorer; never from a guest game (no match on the server). Tests. |

## Follow-on breaks to check while fixing
- **Same words as the profile:** stats are described with the sport's own headline order and short labels (`sportSummary`).
- **The push names no one else:** a push goes to the player it's about and says only their own figures and the score.
- **Message length / links:** the WhatsApp text links only to SportnNote (the match page); names come from the scorer's own rosters.

## Not shown in the demo
The push to players with an account (the offline demo has no push server). Covered by tests; the push function already allows pushes between people in the same match.

## Results
Full suite 6,125 tests, 0 failing; tsc clean.
