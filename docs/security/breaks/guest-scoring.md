# Score first, sign up later: break it (2026-10-31)

**Goal (growth plan, founder "Yes, start it"):** a new person scores a friendly straight away, with no sign-up. The account is asked for only when they share the live link or save the game; the match is then uploaded as a normal match.

**Design:** a guest match lives only on the phone (one at a time, device storage) and is scored by the same screen and engines, with no match id (the existing local mode). Nothing reaches the server until the person has an account. Signing up "claims" it: the teams and match are created as theirs, the taps uploaded one by one through `append_match_event` (idempotent by client id), the board saved, and the screen switches to the real match. No database or sign-in change.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| G1 | **No way to score without an account.** A signed-out person starts on the sign-in screen; scoring needs a match created on the server. | **Fixed:** the sign-in screen has "Score a game now, no sign-up" (and "Continue your game: …" when one is unsaved); a short public setup (the seven MVP sports, optional names, the format) goes straight to scoring. Tests; demo-checked. |
| G2 | **Local scoring forgets everything.** With no match id, taps aren't kept: Undo does nothing, and closing or reloading the app loses the game. | **Fixed:** with a guest id the scoring hook keeps every tap on the device (`core/guestMatch`, `data/guestStore`): Undo and Restart work; a reload resumes. Tests; demo-checked (3-1 kept after a reload; Undo then 3-0). |
| G3 | **The upload can duplicate or lose a game.** A crash or a dropped network mid-claim must not create the match twice, upload a tap twice, or drop taps; a retry finishes the job. | **Fixed:** the claim chooses the team and match ids itself and saves them first; creating with an existing id counts as done (`ensureTeamWithId`, `ensureFriendlyWithId`); taps go one at a time through `append_match_event` (idempotent by client id) with progress saved. Found by the simulation: re-sending every tap on each retry could never finish on a patchy network. Tests (a lost reply at every step); 500 simulated games over a flaky network. |
| G4 | **Another person's game on a shared phone.** If someone else later signs in on the same phone, they must not silently take over an unsaved game they didn't start. | **Fixed:** only a game whose scorer asked to save it (`claimRequested`) is claimed automatically on sign-in; anyone else signed in sees "Save to my account" and decides. Test. |
| G5 | **Abuse / public content.** Nothing a guest types (team names) may appear publicly (feeds, Near you, the link preview) before an account owns it. | **Fixed:** nothing leaves the phone before an account owns it: no match id, so no server reads or writes; the guest branch of a tap returns before stats, alerts, the outbox and results. Tests. |
| G6 | **A finished or hand-ended guest game** must upload as finished, with its result, not as a live match. | **Fixed:** a hand-ended result is kept with the guest game and uploaded with it (`endMatchManually`). Tests. |
| G7 | **Sharing as a guest** must lead to sign-up, then straight back to the same game, now shareable, without retyping anything. | **Fixed:** Share (header) and the bar lead to sign-up; back signed in, the game is saved and the screen switches to the real match in place, then scoring carries on (the claim also takes the scoring lock on this device). Tests; demo-checked (saved at 2-1, then 3-1 as a real match). |

## Follow-on breaks to check while fixing
- **Same engines, same board:** a claimed match replays to exactly the board the guest saw.
- **One guest game at a time:** starting another asks before discarding the unsaved one.
- **Signed-in people** are untouched: they keep the normal flow.
- **Storage off** (private browsing): the game still scores and can be saved in the same visit; it can't be resumed after a reload. (No message about it yet.)
- **Old app versions / other screens:** nothing else reads the guest store.

## Not shown in the demo
The offline demo is always signed in, so the signed-out path (sign-up from "Save & share", then the automatic save) is covered by tests, not seen. Check it once on the live app after publishing: sign out, "Score a game now", score, "Save & share", sign up.

## Results
Full suite 6,062 tests, 0 failing; tsc clean.
