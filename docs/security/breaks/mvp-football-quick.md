# Football "Quick" stats for friendlies: break it (2026-10-31)

**Decision:** founder, 2026-10-31 — football friendlies default to "Quick": goals, assists, cards and subs; everything else opt-in in ⚙️ Scoring settings; possession off. (MVP F8; this changes the 2026-10-22 "deep stats" defaults for friendlies only.)

**Process:** quality mandate step 4 — listed before the change; each point then gets a failing test first.

| # | What could go wrong | Status |
|---|---|---|
| Q1 | **Saved matches change.** Every saved match has no `track*` keys and falls back to "all on" in `readTrack`. Changing that fallback would hide stat buttons on old matches and change their live settings. | **Holds:** `readTrack`'s fallback is unchanged (now read from one list, `BASE_TRACKABLE`). Test; 500 simulated saved matches. |
| Q2 | **Tournaments go Quick by accident.** Tournament matches must keep the full set unless the organiser chooses otherwise. | **Holds:** each toggle's `tournamentDefault` is the old full-set value; tournament screens ask for tournament defaults. Test; 500 simulated tournament matches. |
| Q3 | **The match-info format editor shows the wrong toggles.** For an older match (no `track*` keys) it would fill them from the new Quick defaults and show "off" while the match tracks everything. | **Fixed:** the match-info format editor leaves the `track…` toggles to ⚙️ Scoring settings. Test. |
| Q4 | **A scorer can't get a stat back.** Every Quick-off stat must still be switchable on mid-match. | **Holds:** every toggle stays in Scoring settings. Test; in the demo, switching Shots on brought the Shot button back. |
| Q5 | **Goals, assists, subs or cards disappear.** Goals, assists and subs are always on; cards must stay on in Quick. | **Holds:** Quick = cards on; goals, assists and subs are always on. Test; demo shows Goal, Card and Sub only. |
| Q6 | **Possession still runs.** Quick must not tick possession from kick-off. | **Holds:** possession off — no bar, and the match centre shows no possession figure. Test; 500 simulated friendlies. |

Full suite 5,898 tests, 0 failing; tsc clean.
