# Teams for doubles, phase 4: "Who played?" maps stand-ins to the real players — break it first

2026-11-08. Phase 4 of docs/product/teams-for-doubles.md. Founder: if a side played as "{Team} Player 1 / 2", someone later says who they really were, and every stat moves to those players' own profiles.

**How:** one AMEND correction (the existing, append-only mechanism: live screens rebuild, Undo reverses it, stats are resynced). It replaces every play that names a stand-in with the same play naming the real player. The side's matchday squad is set to the real players. Pure part: `standInAmendOps` in `src/core/teamPlay.ts`.

**Who:** the match's scorer or host through the normal correction path. Founder 2026-11-08: **team captains too**. A side's team managers (captain, vice-captain, admins, club / org admins, staff) use the database function `map_team_stand_ins` (migration 20261115120000), which checks every play itself.

| # | Break | Kind | Fix |
|---|---|---|---|
| WH1 | A credit is missed because it sits deep in a play (the "By:" hitter, an error, a second credit `_attr2`). | Stats | Each play is rewritten as a whole (payload and attribution, any depth: phase 1 `remapEvents`). Tested. |
| WH2 | Plays without a stand-in are rewritten too, inflating the correction. | Data | Only plays that actually change get a replace op. Tested. |
| WH3 | An earlier correction (AMEND) is lost or re-applied. | Data | Ops are built from the effective log (earlier AMENDs already applied) and target each play's own seq. Tested. |
| WH4 | The score, side or order of play changes. | Integrity | Only player ids change; type, side and seq are kept. Tested in the 600-match sim. |
| WH5 | Mapping to the same person twice, someone outside the squad, or someone already playing. | Data | Refused with the phase 1 `checkMapping` reason, and nothing is written. Tested. |
| WH6 | After mapping, the board still shows "{Team}" and the scoring buttons still say "Player 1". | Display | The side's matchday squad is set to the mapped players, so `sidePlayers` returns them ("picked"). Tested. |
| WH7 | Career stats keep nothing (stand-ins were never written) or double-count. | Stats | The AMEND path resyncs the finished match's totals for the real players (absolute sports), or writes the deltas for the real players (stand-in deltas are skipped). Tested. |
| WH8 | A viewer or non-scorer sees a "Who played?" button that can't work. | Access | The card shows only to someone who can score / amend the match. Tested. |
| WH9 | Mapping is impossible to undo. | Recovery | It's one AMEND row, so Undo removes it like any correction. Tested. |
| WH10 | Someone who manages neither the team nor the match adds a "who played" correction. | Access | `map_team_stand_ins` requires `can_manage_team(that side's team)` or `can_manage_match`. Tested in PGlite. |
| WH11 | A captain names someone outside the squad, twice, or the wrong number. | Data | Checked in the database: exactly the number playing (format, 2 if unknown), distinct, all in the team's squad. Tested in PGlite. |
| WH12 | A captain uses the function to change a play (the side, the score, someone else's credit) or void one. | Integrity | Only `replace` ops. Each op must equal the play as it stands (latest correction wins) with only `ph:{team}:{n}` → that player's id swapped, compared as normalised JSON in the database. A play without a stand-in can't be touched. Tested in PGlite. |
| WH13 | A captain inflates their own career with made-up stats. | Stats | Stats only for the mapped players, whole numbers ≥ 0, each at most the number of plays in the match. They replace that player's line for this match. Tested in PGlite. (The numbers come from the app's own totals of the corrected log.) |
| WH14 | The correction, squad and stats land partly. | Data | One function call, one transaction. Tested in PGlite. |
| WH15 | The host loses the ability. | Access | Match managers can still map. Tested in PGlite. |
| WH16 | The function is used on a match with no stand-ins. | Data | No op passes WH12, so nothing is written. Tested. |
