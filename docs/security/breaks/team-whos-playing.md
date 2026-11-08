# Teams for doubles, phase 3: "Who's playing?" before the first point — break it first

2026-11-08. Phase 3 of docs/product/teams-for-doubles.md. In a doubles match (racket / cue sport, 2+ a side), a side whose squad is bigger than the number playing needs its playing players picked before the first point.
- **A team manager** (captain, vice-captain, admins, organisers; or the match host) picks them on the Scoring tab. The pick is saved as the matchday squad.
- **Anyone else** taps "Ask {Team} to pick", which reminds the captain, vice-captain and admins. Any other squad member can be reminded with one tap.
- **Scoring is never blocked:** an unpicked side plays as "{Team} Player 1 / 2" stand-ins (phase 4 maps them to the real players).

| # | Break | Kind | Fix |
|---|---|---|---|
| WP1 | A two-person team (every doubles side today) is asked "Who's playing?" | Ease | No card: a squad equal to the number playing is picked automatically (phase 1 `playingFor`). Tested. |
| WP2 | A 3+ squad plays with its whole squad on the scoring buttons ("By:" chips list 5 people). | Function | The scoring roster is the picked players, else the stand-ins, never the whole squad. Tested. |
| WP3 | Stand-ins are filtered out as "unverified players", leaving an empty side. | Function | Stand-ins skip the eligibility filter (they're not people). Real players are still checked. Tested. |
| WP4 | A stand-in's id (`ph:…`) is written to the career table, which only takes real player ids: a failed write, or a ghost career. | Data | `recordStatLine` and `planStatSync` skip stand-ins. Their stats wait in the match for phase 4's mapping. Tested. |
| WP5 | The board shows "Smashers Player 1 / Smashers Player 2" instead of the team. | Wording | A side on stand-ins shows its team name. Tested. |
| WP6 | A non-manager scorer picks a team's players. | Access | Only `pickerFor` = 'pick' sees the picker. Everyone else sees "Ask {Team} to pick". Tested. |
| WP7 | A pick of the wrong size is saved. | Data | Save is enabled only with exactly the number playing, all distinct. Tested. |
| WP8 | The reminder goes to nobody when the team has no captain. | Function | It goes to the captain, vice-captain and admins. With none, the card lists squad members to remind one tap each. Tested. |
| WP9 | The server sends "Squad needed" to every two-person doubles team before every match. | Noise | The server reminds a racket / cue side only when its squad is bigger than the number playing (2 when unknown). Singles and two-person teams are never nudged. Tested. |
