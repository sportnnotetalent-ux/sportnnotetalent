# Break-it: fill a tournament slot with a team you already have (2026-11-06)

Found while making the marketing demo (docs/org/marketing/assets/screens/README.md). On Participating teams → Fill slot → "Or a team already on SportnNote", the search found nothing for kabaddi teams the organiser had just made, even teams already added to the tournament. Two causes:
1. The app hid every team made from a friendly's "+ New team" (stored as ad-hoc), not only the untouched "Team A / Player B" quick sides that QG-01 meant to hide.
2. The app and the server (`fill_tournament_slot`, `already_entered`) refused any team already in the tournament, so "add the team, then place it in Team 1" was impossible.
Result: a fixtures-first tournament could only fill a slot with a brand-new team plus a captain's name and mobile. Founder 2026-11-06: "Fix the bug first".

Fix: the search uses the QG-01 rule (`isQuickPlaceholder`); a team already entered may take a slot as long as it has no fixture in the tournament yet. Its existing entry is kept (status unchanged) and the slot's entry is removed.

| # | Break | Fix / why it's safe |
|---|-------|-----|
| SL1 | A team already playing in the tournament takes a second slot (plays twice) | Still refused: `already_entered` when the team is home or away in any of the tournament's matches |
| SL2 | Filling makes two entries for the same team | The existing entry is kept; no second insert (one row per team) |
| SL3 | A stranger's team is placed as "confirmed" | Unchanged: a new entry is confirmed only if the organiser can manage the team, else invited; an existing entry keeps its status |
| SL4 | Untouched quick sides ("Team A") flood the search again | The QG-01 rule still hides them; named teams the organiser made are shown |
| SL5 | A slot that already started, a team of another sport, another slot, a stranger filling | Unchanged refusals: slot_started, wrong_team, not_allowed, not_a_slot |

Tests: tests/slot-fill-existing.test.mts (search), tests/db-team-slots.test.mts (SL1–SL3), a 600-fill simulation in tests/slot-fill-existing.test.mts.
Migration: supabase/migrations/20261113120000_slot_fill_existing.sql.
