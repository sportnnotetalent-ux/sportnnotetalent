# "N custom" counts rules, not stats choices — break it first

2026-11-08, wave 4. The settings card's "N custom" badge compares every field with today's standard. After wave 3 turned the "Stats to track" defaults on, every older match (stats off) and every football tournament fixture (possession on, while the live standard is the friendly set) read "1 custom", "2 custom" … for choices that aren't rule changes.

| # | Break | Kind | Fix |
|---|---|---|---|
| CC1 | Older matches show "N custom" only because the stats defaults changed. | Clarity | `customCount` skips fields in the "Stats to track" group. The badge counts rule changes only. Tested. |
| CC2 | A football tournament fixture shows possession as "1 changed". | Clarity | Same fix (possession is a stats field). Tested. |
| CC3 | Reset to standard stops resetting the stats. | Function | Unchanged: Reset still sets every field, stats included, to the standard. Tested. |
| CC4 | A real rule change (game length, buckets, serve speed unit) stops counting. | Clarity | Only "Stats to track" fields are skipped; every other field counts as before. Tested. |
