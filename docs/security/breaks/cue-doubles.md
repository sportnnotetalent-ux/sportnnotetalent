# Break-it: doubles in snooker and English billiards (2026-11-06)

Founder: every sport played in pairs gets the pairs set-up. Snooker and
billiards doubles: partners take alternate visits (A1, B1, A2, B2 …). The rule
engines stay as they are; a shared layer (src/sports/cue/doubles.ts) tags each
visit with the player at the table (`pid`, as pool's scotch doubles does).

| # | Break | Fix |
|---|-------|-----|
| CD1 | No doubles option | Singles / Doubles (playersPerSide 1 / 2); the sports become "singles or doubles" so every pairs piece applies |
| CD2 | A visit credited to nobody / the wrong player | The visit the stroke belonged to is tagged — whether it goes on, ends, or ends the frame |
| CD3 | A visit re-tagged mid-way by a different id | The first player stays; later ids don't move it |
| CD4 | An id from the other side, or a 3rd player on one side | Refused (2 per side, never one on both) |
| CD5 | Junk ids (objects, huge strings, `__proto__`) | Ignored |
| CD6 | Singles changed | Nothing tagged in singles; replay identical |
| CD7 | Who's next is unclear | Partner of the side's last visit; mid-visit the same player keeps going; the scorer can Change |
| CD8 | Doubles stats give both partners every break | Frames and points to both (the pair's result); breaks, points from pots, pots and visits per player from their own visits |
| CD9 | Replay changes the tags | Pure: the same log always gives the same tags |

Tests: tests/cue-doubles.test.mts, tests/sim-cue-doubles.test.mts.
