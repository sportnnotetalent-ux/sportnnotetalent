# Break-it: overdue games (2026-11-05)

From the founder's phone: "Fnatic Team 1 … vs Fnatic Team 2 …" scheduled for
8 Oct, never played or cancelled, still showed as Upcoming a month later — and
because lists sort by date, such games sit FIRST in Home's "Up next".

Rule: a SCHEDULED game more than 12 hours past its start is overdue (same
window as an idle live game, core/staleLive). Postponed / cancelled games are
already badged and keep their place.

| # | Break | Fix |
|---|-------|-----|
| OD1 | An overdue game heads Home's "Up next" | Home leaves overdue games out (it looks forward) |
| OD2 | Matches → Upcoming mixes overdue games in at the top | Upcoming shows real upcoming first, then an "Overdue" group, most recently missed first, each card saying what to do |
| OD3 | The sport hub lists an overdue fixture first | Listed after the upcoming ones, marked "Date passed" |
| OD4 | A game an hour late counts as overdue | Only after 12 hours past its start |
| OD5 | A postponed or cancelled game counts as overdue | Only status scheduled |
| OD6 | A game with no / bad start time | Never overdue, no crash |
| OD7 | The Upcoming count hides overdue games (they vanish) | The tab count includes them; they're never dropped from Matches |

Tests: tests/overdue-games.test.mts (+ the Matches view tests), tests/sim-overdue-games.test.mts.
