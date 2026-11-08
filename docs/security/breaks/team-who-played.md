# Teams for doubles, phase 4: "Who played?" maps stand-ins to the real players — break it first

2026-11-08. Phase 4 of docs/product/teams-for-doubles.md. Founder: if a side played as "{Team} Player 1 / 2", someone later says who they really were, and every stat moves to those players' own profiles.

**How:** one AMEND correction (the existing, append-only mechanism: live screens rebuild, Undo reverses it, stats are resynced). It replaces every play that names a stand-in with the same play naming the real player. The side's matchday squad is set to the real players. Pure part: `standInAmendOps` in `src/core/teamPlay.ts`.

**Who:** the match's scorer or host. The amendment path and the database's write guard allow only them; a team captain who isn't scoring is an open question for the founder.

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
