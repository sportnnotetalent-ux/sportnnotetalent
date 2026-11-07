# Fixture map — break it first

2026-11-07. Founder (Figma "Tournament Fixture Map"): "within all tournaments, we should have a way to show the fixture format and then slot in different teams participating in the tournament into those slots."

**What it is:** one picture of a sport's whole format from day one. It shows:
- the groups, with their teams and open slots;
- the knockout, whose boxes say where each team comes from ("Group A winner", "Winner of Semi-final 1");
- the final, the third-place play-off and the champion.

An organiser taps an open slot on the map to put a team in it. The map uses the same seeding the app uses to make the real rounds. The model is `src/core/fixtureMap.ts`, the screen is `src/screens/FixtureMapScreen.tsx`, and the fill panel is `src/components/SlotFillPanel.tsx`. The fill panel is shared with Participating teams.

## Break points (listed before fixing)

| # | Break | Kind | Fix |
|---|---|---|---|
| FM1 | The map shows a knockout that differs from the one the app later makes, e.g. it draws A1 v A2 while the app makes A1 v B2. People plan travel around a wrong tree. | Trust | Group qualifiers are projected through the app's own `seedFromGroups` (cross-over, or seeded with byes). A straight knockout goes through `seededRound`. Tested: same ties as the real seeding of the same field. |
| FM2 | Anyone viewing a public tournament fills a slot. | Auth | Fill is offered only when `canManageTournament`. The server already refuses `fill_tournament_slot` / slot renames from non-managers (team-slots.md TS3). Tested: the screen gates the panel on `canManage`. |
| FM3 | A slot is filled with a team that already plays in this tournament, so one team is in two places. | Integrity | Same `slotCandidates` rule as Participating teams (hides slots and teams with fixtures); the server check (SL1) stays. |
| FM4 | A big field (128 teams, 32 groups) freezes the phone or overflows the screen. | Perf / DoS | Pure model, linear in matches; 600-user sim includes 128-team draws under a time budget. The tree scrolls sideways; the round stepper shows one round at a time on a phone. |
| FM5 | An odd field (6, 12, 24 teams) loses a team or invents one in the projection. | Integrity | Byes come from `seededRound`. Tested for every field 2–64: every entrant appears exactly once in round 1 or as a bye, and the rounds halve down to one final. |
| FM6 | Double elimination, IPL double-chance, Swiss, Americano or a hand-kept table get drawn as a straight knockout, which is wrong. | Trust | The map says "This format has its own view" and links to the existing bracket or standings. It never draws a tree it can't stand behind. Tested for each. |
| FM7 | The map leaks contact details or an under-18's full name. | Privacy | It shows only the names the fixture list already shows (team / entrant display names). There are no phones or emails, and the PDF carries the same names only. Tested: the PDF HTML has no `tel:`/`@`/phone digits from the input. |
| FM8 | In a tournament with divisions (U14 Boys / U17 Girls), the map mixes divisions. | Integrity | It scopes like the bracket: `matchesInDivision` + entries of the active division. |
| FM9 | After a slot is filled the map still shows the slot (stale), and the organiser fills it twice. | UX | Refetch after every fill. The panel closes, and the box shows the team at once. |
| FM10 | A team that plays group games but isn't in the entries vanishes from its group. | Integrity | Groups are read from the group-tagged matches first; entries only add teams still without a game. |
| FM11 | Super round (Asia Cup) projected as group → knockout, skipping the Super round. | Trust | With `superPhase` the map shows the groups, then "Super round: top N of each group", and draws no knockout until the Super round's matches exist. |
| FM12 | A real round is half played: the next box says "TBD" instead of who's through, or shows a loser. | Trust | A decided tie puts its winner's name in the next box. An undecided tie says "Winner of Quarter-final 2". Byes carry on by name. Tested. |
| FM13 | Group labels read "Group Group A" or "A winner". | Polish | Labels normalise: a 1–2 character tag becomes "Group A"; longer names are kept as typed. |
| FM14 | A team or tournament name with `<script>` breaks or injects into the PDF. | Injection | Every string goes through `esc`; tested with a hostile name. |
| FM15 | A slot box that is a real team (not a slot) offers "Fill", which would overwrite a real team's place. | Integrity | Only ids in `getTournamentSlotIds` are fillable; a real team's box opens its journey instead. Tested in the model (`slot` flag only from the slot set). |
| FM16 | An empty tournament (no teams, no format) shows a blank screen or crashes. | UX | An empty state: "No format yet — set the structure", with a link for organisers. Tested: model returns `empty`. |
| FM17 | Found in the demo check: before the group fixtures exist, a slot's group is only its name (A2), so a team put in A2 then shows as "not in a group yet". | UX | That's how slots work (the place lives in the slot's fixtures). Organisers see a tip on the map: make the group fixtures first, so the team keeps A2's group and games. Remembering a group before fixtures would need a database change, so it's left for later. |
| FM18 | Found in the demo check: teams that only appear in fixtures (no entry) were missing from the map — an empty knockout, empty groups. | Integrity | A knockout draws fixture-only teams; a groups map lists ungrouped fixture teams under "Not in a group yet" (knockout teams excluded). Tested. |

## Checks

Results 2026-11-07: 24 unit tests and the 600-organiser sim pass. The full suite has 7,676 passing, and tsc is clean. Demo check (offline demo):
- the World Cup knockout tree draws with joining lines;
- Inter-School: groups, crossed semis (Group A winner v Group B runner-up), slots shown dashed;
- tapping A2 opens the fill sheet and filling it updates the map;
- the phone-width stepper fits.

- `tests/fixture-map.test.mts`: unit (FM1, FM5, FM6, FM10–FM16) and screen wiring (FM2, FM8, FM9).
- `tests/sim-fixture-map.test.mts`: 600 organisers with random formats, fields 2–128, half-played rounds, random fills.
- No new database change: filling reuses `fill_tournament_slot` / `nameTournamentSlot` (team-slots, slot-fill-existing), which already have PGlite tests.
