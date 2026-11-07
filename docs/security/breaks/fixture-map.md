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

## Part 2 — the organiser's plan drives the map (founder 2026-11-07)

Founder: the map must follow what the organiser set up (how many teams, the format), handle odd numbers, and place custom matches at any stage in the right box. Choices (all recommended options):
- **Odd numbers:** the organiser picks per sport. The options are play-in (the default: top seeds skip the opening round), byes (everyone plays; an odd round gives its top team a bye) or best losers (the closest losers fill the next round).
- **Custom matches:** made two ways. Either tap a box on the map, or, in Schedule match, pick the box the match fills.
- **Planned team count:** the map shows the planned count, with open places until teams come in.
- **Edit draw:** organisers can swap teams or whole matches. The map, the fixture generator and the next round all follow the edited draw.

Stored on `formats[sport]` (no migration): `structTeams` (planned count), `structOdd` (rule), `structDraw` (JSON draw order). One pure module, `src/data/drawRules.ts`, is used by the map, Auto-generate fixtures and the bracket's "create next round".

| # | Break | Kind | Fix |
|---|---|---|---|
| FM19 | The map, the generator and "next round" each apply the odd-team rule their own way, so the map shows one draw and the app makes another. | Trust | All three call `drawRules` (`firstRound`, `nextRoundByRule`). Tested: the map's projected next round equals the round the app creates for the same results, for every rule. |
| FM20 | Best losers picks the wrong loser (or a team that withdrew), or the ranking changes on reload. | Fairness | The ranking is fixed: closest margin first, then most scored, then name. It is deterministic. Only decided ties count; a walkover loser is never a best loser. Tested. |
| FM21 | Best losers when there aren't enough losers to fill the round (e.g. 3 teams). | Integrity | It falls back to byes for the rest. Tested on every field 2–64. |
| FM22 | A planned count below the teams already in, or a silly value (0, −5, 10,000, "abc"). | Input | Planned count = max(entered, planned), clamped to 2–128. Non-numbers are ignored. Tested. |
| FM23 | Open places are shown as real teams, or filling one overwrites something. | Integrity | An open place is its own kind of box, never a team. Filling one first makes a new slot (named by group: A3…), then opens the fill panel for that slot. If the draw was edited, the open place's position passes to the new slot. |
| FM24 | A stored draw is tampered with (huge JSON, scripts, unknown ids) and crashes the map or plants text. | Injection / DoS | It's parsed defensively: at most 256 positions, each a short id or place code, otherwise ignored. Unknown ids make the draw "stale". Names always come from the teams, never from the stored draw. Tested. |
| FM25 | Teams change after the draw was edited (one withdraws, a slot fills), so the edited draw silently drops or doubles a team. | Integrity | An edited draw applies only when its set of places equals the current field exactly. Otherwise the map uses the automatic draw and tells the organiser "Your edited draw no longer matches the teams — edit it again". Tested. |
| FM26 | Someone who isn't an organiser edits the draw or makes matches. | Auth | The edit and "make this match" controls appear only for `canManage`. Writes go through `patchTournamentFormat` / `createMatch`, which the server limits to the tournament's managers (RLS). Tested: the controls sit behind `canManage`. |
| FM27 | A custom match is put in a box that already has a match, giving two matches in one box. | Integrity | Boxes that already have a match aren't offered. Schedule match lists only free boxes. Tested in the model (`freeBoxes`). |
| FM28 | A custom match in a box with the wrong stage (a Final put in a semi-final box). | Integrity | The box sets both the stage and the position (`__koSlot`); they can't be picked separately. |
| FM29 | A custom match has no box (old matches, or made without one): the map hides it. | Trust | Matches without a box fill the round's free boxes in kickoff order, as before. They're never dropped. Tested. |
| FM30 | The generator ignores the edited draw for groups + knockout because the place codes (Group A winner) aren't team ids yet. | Integrity | Place codes are resolved to the real qualifiers when the knockout is made (A winner → whoever won group A). Tested. |
| FM31 | Found in the demo check: a play-in round smaller than the next one made the next round's boxes overlap. | UX | The tree is as tall as its biggest round. Tested: no box overlaps another in a 10-team draw. |
| FM32 | Found in the demo check: once one knockout match existed, a groups tournament with no saved format was read as a straight knockout. | Trust | The order is: the saved format, then group games, then the tournament's structure, then what's been played. A league with playoffs still shows its real knockout. Tested. |
| FM33 | Found in the demo check: in demo mode, a match between teams missing from the demo's team list was stored without teams, which broke every match list after it. | Integrity | Demo `createMatch` refuses it with "Pick two teams of this tournament." (Live matches always point at real team rows.) |

### Part 2 results (2026-11-07)

- **Tests:** `tests/draw-rules.test.mts` has 13 tests. `tests/fixture-map.test.mts` now has 34, including FM19–FM32.
- **Simulation:** 600 organisers, every rule, planned counts, edited draws and custom boxes. For every rule, the map's next round equals the round the app creates.
- **Full suite:** 7,702 pass; tsc clean.
- **Demo checks:**
  - planning 10 teams shows a play-in with 2 open places;
  - best losers ("Winner of match 1 v Best loser 3");
  - Edit draw (England and Brazil swapped);
  - an open place becomes slot A2 and opens the fill panel;
  - "Make Semi-final 1" (A1 v B1) lands in box 1, and the Final waits on its winner;
  - Schedule match lists only the round's free boxes.

