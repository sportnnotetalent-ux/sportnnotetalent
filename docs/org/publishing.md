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
| 2026-11-07 | launch-voice session | a88e7f48 | index-9a7ceda6 | 2441c19a / aeed18ea |
| 2026-11-07 | fixture-map session | 96335226 | index-58d99960 | 5b7ea53e / 709a3294 |
| 2026-11-08 | stitch-picks session | 825223e8 | index-27f428a3 | 7086e031 / f5b96b51 |
| 2026-11-08 | home-round-2 session | 049e44ed | index-d213aee5 | b5a32573 / bf166feb |
