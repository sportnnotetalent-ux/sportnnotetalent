# Break-it: main job first (UI audit step 6, 2026-11-05)

Audit #6, #9, #20, #22, #25, #26, #27, #28, #29, #40, #41. A tournament with games in play opens on Matches; hosts don't see "Follow" on their own tournament; Manage lists teams, matches and people before set-up and copies; Profile leads with the record (numbers, sports, teams, pairs, communities) and puts links, to-dos, documents and contact details after it; the team page leads with "Next match" / "Playing now"; a friendly's rules, venue and stream link fold under "More options"; New tournament folds co-hosts, divisions, contact and reminders; voice scoring is one compact row until used; football possession reads "—" in the first minute; a linked parent sees their child first; Organize puts "Start a session" in the start grid.

| # | Break | Fix |
|---|-------|-----|
| MJ1 | A link to a tournament tab (?tab=Info) is overridden by the "opens on Matches" rule | The rule applies only when no tab is asked for |
| MJ2 | Folding hides a value already set (a venue typed, custom reminders) | The fold line shows the venue; opening keeps every value; defaults are the same as before |
| MJ3 | A host loses the way to follow their own tournament's alerts | Hosts already get organiser alerts; Follow stays for everyone else |
| MJ4 | "Next match" shows a long-past scheduled game | Live first, else the soonest scheduled game no more than 3 hours past its start |
| MJ5 | The voice panel's privacy note is hidden before speech is sent | The note shows as soon as voice starts (listening opens the panel) |
| MJ6 | Moving profile blocks drops one (e.g. guardian consent for a minor) | Blocks are moved whole, not rewritten; their tests still pass |

Tests: tests/main-job-first.test.mts.
