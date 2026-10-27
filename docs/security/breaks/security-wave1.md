# Security Wave 1: break the fixes themselves

**Wave 1** is the migration `20261028120000_security_wave1` plus the edge-function and client changes (see `../audit-2026-10-27/PLAN.md`).

**Process:** quality mandate step 4, applied to the fixes. Each point asks whether the fix breaks a legitimate use, or can be got around.

| # | What could break | Status |
|---|---|---|
| W1B-01 | **An assistant coach can't correct a child's date of birth or parent email any more.** That was the hole (W1-1). | Accepted, by design. The coach who added the child, the parent or support still can. The screen says "only the person who added this player can change this". |
| W1B-02 | **Email sign-ups lose their automatic link.** Someone added by a coach with their phone number, who then signs up by email and types the same number, no longer links to that profile automatically. Their own profile is created without the number (uq_players_phone), so sign-up never fails. | Fallback fixed (`getMyPlayerId` retries without the number). **Follow-up W1-2b:** "Verify your number to bring your history" (a Firebase SMS code, then the server links the profile) in the next wave. Phone sign-in (APK 41) links on the server, as before. |
| W1B-03 | **Meet age checks for athletes not yet entered.** The event set-up screens offer every player in the directory and used to send all of them to `meet_ages()`. Now only the meet's entrants (team rosters, members, entries, field entries) get an age. An athlete not entered yet shows no age until they're entered. | Accepted. That's the privacy gain: the server no longer returns ages for the whole directory. Follow-up: offer the meet's entrants first in set-up. |
| W1B-04 | **Meets with many age rules.** A multi-sport meet with more than 6 different age cut-off dates in one day is refused after the sixth. | Accepted. Meets use 1–3 (31 Dec, 1 Jan, the meet day). The message says to try tomorrow. |
| W1B-05 | **Legitimate ties with several hosts.** A tie whose rubbers have different hosts can't take a new rubber from someone who doesn't host, or manage the tournament of, every rubber already in it. | Accepted. In the app, tie rubbers are created together by one host, or inside a tournament its organisers manage. |
| W1B-06 | **Offline reads on the web.** Signed-in reads are no longer saved for offline use. A signed-in phone that loses signal mid-match falls back to what the app holds in memory, not the saved copy. | Accepted. A shared school computer must not keep a coach's view of children's data. Logged-out viewers (most match watchers) keep offline copies. |
| W1B-07 | **Live streams on plain http.** A stream link that only works over `http:` (no https) is upgraded to `https:` and may not load. | Accepted. Major stream hosts all serve https. |
| W1B-08 | **Lookups as initials.** A coach looking up a child by phone sees the child's initials, even if the coach is in the child's circle. | Accepted. The app's own screens don't show this name; the coach sees full names on the roster. |
| W1B-09 | **The email cap.** It's per address, 6 a day across every function. A parent with several children at several schools could reach it on a busy day. | Accepted. It resets after 24 hours, and push messages to a linked parent account aren't limited by it. |
| W1B-10 | **Can a minor's own account still claim?** Yes: the claim needs `auth.users.phone_confirmed_at`, which only phone sign-in sets (Firebase-verified), so an adult can't fake a child's number this way. | Holds (simulation). |

**Simulation** (`tests/sim-security-wave1.test.mts`): 100 coaches, 100 assistants, 300 children and 200 strangers made 900 break attempts and 200 lookups. Every attempt was blocked, and all 34 legitimate coach fixes went through, in about 5 s. The same simulation without the migration fails ("lookup returned a child's name").
