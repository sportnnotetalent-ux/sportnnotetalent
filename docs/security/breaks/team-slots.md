# Break-it: fixtures first, teams later — team slots (2026-11-06)

Founder: an organiser may have every team ready (add teams → fixtures), or may
want the fixtures first and slot teams in as they register: Group A / B with
slots A1–A4, B1–B4 and fixtures A1 v A2 …; when a team comes in, it replaces
its slot. Migration: supabase/migrations/20261106130000_team_slots.sql.

| # | Break | Fix |
|---|-------|-----|
| TS1 | Fixtures can't be made without real teams | "Teams not known yet": the organiser gives a count (and groups); slots are made as the tournament's entries and fixtures are generated between them |
| TS2 | Slot names don't match their group, so the group stage mixes them | Group slots are named A1…, B1…; the fixtures screen puts each "A…" slot in Group A |
| TS3 | Someone who doesn't run the tournament makes or fills slots | `create_tournament_slots` / `fill_tournament_slot` / `name_tournament_slot` check `can_manage_tournament` |
| TS4 | Filling a slot with a team already in the tournament (two slots, or a slot + its own entry) | Refused (`already_entered`) |
| TS5 | Filling with a team of another sport, or with another slot | Refused (`wrong_team`) |
| TS6 | Filling a slot after one of its games started | Refused (`slot_started`) |
| TS7 | Filling with an existing team moves another tournament's games | Only this tournament's games change; the slot's entry (status, division) passes to the team, the slot row is removed |
| TS8 | A real team filled in by someone who doesn't run it gets in as "confirmed" | Same rule as adding it: confirmed only if the organiser manages it, else invited |
| TS9 | Naming a slot (a brand-new team) loses its games | The slot simply becomes the team: same row, same games, now a real team |
| TS10 | Slots show in Discover, My teams, search | Slots are one-off rows (adhoc), never listed as teams |
| TS11 | Huge slot counts / junk names | 2–128 slots, names 1–60 characters |

Tests: tests/team-slots.test.mts (names), tests/db-team-slots.test.mts (server), tests/sim-team-slots.test.mts.

## Mixed (2026-11-06): some teams known, some not

| # | Break | Fix |
|---|-------|-----|
| TS12 | 5 teams confirmed, 3 to come: slots only when the tournament has no teams | Participating teams → "+ Add slots" any time; Quick tournament: a line "?" (or TBC / TBD) is a slot |
| TS13 | Added slots clash with existing slot names (two "Slot 1") | New names continue after the existing ones (Slot 4, Slot 5 … / A3, B3 …) |
| TS14 | One slot can't be added (the server wanted 2+) | 1–128 slots per call |
| TS15 | Group-named slots pile into one group | Each new group slot goes to the group with the fewest so far |

Tests: tests/team-slots.test.mts (nextSlotNames, splitTypedSlots), tests/db-team-slots.test.mts (one slot).
