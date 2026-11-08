# Teams for doubles, phase 2: match setup picks teams — break it first

2026-11-08. Phase 2 of docs/product/teams-for-doubles.md. A doubles side is already a team under the hood. Setup now says so and offers every team, not only exactly-two "pairs". Screens covered: Schedule match (friendly / tournament match), Quick tournament, tournament entries, Create tournament, the standings heading. Pair profile pages and "Your pairs" are phase 5.

| # | Break | Kind | Fix |
|---|---|---|---|
| TD1 | Setup says "Pair 1 / Pair 2", "Doubles (pairs)", "＋ Add pair", "Pair standings": the founder's confusion. | Wording | Every user-visible "pair" in these screens reads "team" ("Team 1 / Team 2", "＋ Add team", "Team standings"). The internal mode name is unchanged, so nothing else breaks. Tested. |
| TD2 | A doubles side can only be a two-person team, so a team with a squad of 3+ can't play doubles. | Function | The doubles picker lists every team with at least two different people (`sidesForStructure('pair')`). Who actually plays is picked before scoring (phase 3; phase 1's `playingFor`). Tested. |
| TD3 | "Start now" doubles sides are called "Pair A / Pair B". | Wording | They are "Team A / Team B". Tested. |
| TD4 | Renaming the stand-in to "Team A" breaks the auto-rename: a "Pair A" side became "Ravi / Asha" once its two people were added, a "Team A" side never did. | Function | In a racket / cue sport (`isPairSport`), a "Team A / B" stand-in with exactly two people is renamed to them, like "Pair A" was. In team sports "Team A" keeps its name, as today. Tested. |
| TD5 | Old "Pair A / Pair B" sides in the database stop being recognised. | Data | Still recognised and renamed as before. Tested. |
| TD6 | A football side of two people gets renamed "X / Y". | Data | Only racket / cue sports rename a "Team" stand-in. Tested. |
