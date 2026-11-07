# Publish lock

One publish (web + Android OTA) at a time, across every session and agent. Before publishing, check this file. If it's free, write your line under "Now", publish, then move the line to "History" with the result.

Why: on 2026-11-05 two sessions published within minutes of each other, and one republished an older commit, briefly rolling back the other's live change.

## Now
*(free)*

## History
| When | Who | Commit | Web | OTA (preview / production) |
|---|---|---|---|---|
| 2026-11-05 | usage-filters session | 8333121 | index-dede4b01 | 04a6da93 / 5cbf9deb |
| 2026-11-06 | start-a-friendly session | 8a836d66 (live a003c574 + fix) | index-cb8bbda2 | af154c36 / fdd92fd8 |
| 2026-11-06 | slot-fill session | b68ced4c | index-d4c15664 | 593a1d8f / ab6d1e7a |
| 2026-11-07 | full-time session | 9cb857de | index-d4c15664 (common 00e7ae0f) | 002325b8 / f2607216 |
| 2026-11-07 | held-result session | fb489589 | index-894e077b | c8d07027 / cce6bf84 |
| 2026-11-07 | main session (demo-recording fixes + launch animation) | 1f327540 | index-f300b6f2 | 4c4128bc / 960e2ed7 |
