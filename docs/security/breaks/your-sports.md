# Home › Your sports includes sports you've played: break it (2026-11-04)

Founder: after playing pool, pool still sat under "Try a new sport". Your sports read only the sports picked at first launch (`player.sports`).

| # | Failure | Status |
|---|---|---|
| YS1 | A sport you played, scored or hosted never joins Your sports. | **Fixed:** `yourSports` (src/core/playedSports.ts): your picked sports, then every sport you took part in (on a side's roster, a scorer or a host) from Home's own feed, newest first, each once; Try a new sport is the rest. Tests; simulation. |
| YS2 | A match you only follow must not add its sport. | **Holds:** only roster / scorer / host count. Test; simulation. |
| YS3 | No player yet, or junk in the feed, must not crash or add anything. | **Holds:** test; simulation. |

Limit: the played sports come from Home's feed (your own and followed matches it already loads), so a sport played long ago that isn't in the feed isn't listed — no extra loading on Home (perf F-09).
