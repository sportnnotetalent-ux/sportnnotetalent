# Break-it: the four MVP score P0s (2026-10-31)

Listed before fixing (quality mandate step 4). Each fix has its own failing test first.

| # | Break | Fix | Test |
|---|---|---|---|
| T1 | Tennis custom "Games per set" keeps the preset's tiebreak: 4 games breaks at 6-6, 8 games ends 7-6. | Each "Games per set" option now snaps `tiebreakAt` = games, win by 2, a 7-point tiebreak (`set` on a choice option, applied by `fieldChanges` in every format editor). Saved matches keep their stored rules. | `tests/tennis-games-per-set.test.mts` |
| B1 | Basketball: one tap on "Start Overtime" mid-game (3×3 at any tie, 5×5 any Q4 tie) jumps to OT; no confirm; reducer doesn't check time. | Button shows only at 0:00 (or with no game clock), asks "Start overtime?", and the reducer refuses START_OVERTIME while time is left. | `tests/basketball-overtime-guard.test.mts` |
| K1 | Kabaddi: a failed do-or-die against ≤3 defenders gives +2 and a "Super tackle". | +1 to the defence, no super tackle (AKFI / PKL: the raider is out, the defence gets 1 point). | `tests/kabaddi-mvp-k1-k2.test.mts` |
| K2 | Kabaddi 5-raid shootout ends as if each raid were worth 1 point (home +3, away 0, home +2 ends it after 3 raids). | Clinch early only if the trailer can't catch up at teamSize + 1 a raid. | `tests/kabaddi-mvp-k1-k2.test.mts` |

## Follow-on breaks checked
- **Old matches re-scoring on replay.** Every engine change is gated: B1 only checks a START_OVERTIME that carries `at`; K1 only raids marked `rv: 3`; K2 only shootouts started with `v: 2` (they store `max`). Old-log tests in each file prove the old replay is unchanged.
- **Running clock with no re-render.** The scoring controls re-render once when the running clock hits 0:00, so the overtime button appears without a tap.
- **Editing an old kabaddi raid** re-enters it through the form, so it takes the new rule. Accepted: the scorer re-entered it.
- **Shootout buttons go to +3 only** while the clinch uses teamSize + 1. Safe (never ends early); a bigger raid can't be entered yet (P2).
- **Legacy `tests/kabaddi.test.mts:46-48`** still asserts the old clinch; it now documents the old-log rule (default `maxPerRaid = 1`).

Not done yet: the 500-user simulation and publish (mandate steps 6–7).
