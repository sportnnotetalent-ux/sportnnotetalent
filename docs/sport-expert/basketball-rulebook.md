# Basketball: rulebook audit (2026-11-05)

Eighth sport. It builds on `us-sports.md` and the US batches (FIBA 2024 fouls, 3×3, NBA options).

## Sources

| Document | Version | Link |
|---|---|---|
| FIBA Official Basketball Rules 2026 | v1.1, in force 1 Oct 2026 | https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf |
| FIBA Official Basketball Rules 2026: Changes | v1.1 (25 pp.) | https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-rule-changes-v1-1-en.pdf |

## Findings

| # | Priority | Rule (2026) | Gap | Status |
|---|---|---|---|---|
| BK-1 | **P1** | Art. 37–38: the unsportsmanlike foul is replaced by the **disruptive** foul (2 FT or goal + 1, then the ball; a team foul; doesn't count towards disqualification) and the **flagrant** foul (same penalty; counts towards disqualification) | The picker offered "Unsportsmanlike". Flagrant (NBA-only before) didn't count towards disqualification. | **Fixed:** picker shows Disruptive and Flagrant. Disqualification = a D foul, or any two of {category-1 technical, flagrant, unsportsmanlike in older logs}. The discipline table counts flagrant as U. |
| BK-2 | **P1** | Art. 36.2: technical fouls are category 1 (behaviour; counts towards disqualification) or category 2 (delay, hanging on the ring, goaltending on the last free throw; doesn't) | One kind of technical, always counted. | **Fixed:** picker shows "Technical (behaviour)" and "Technical (delay / ring)". A category-2 technical is still 1 FT and a team foul, but never disqualifies. |
| BK-3 | P3 | Art. 36.2.4: head coach disqualified on 2 category-1 "C" technicals, or 3 including "B"s | Already modelled (`coachDisqualified`, 2C / 3B). | ✓ |
| BK-4 | P3 | Appendix F: Instant Replay and the head coach's challenge | Not tracked. | Leave. |

## Checked and fine

- 4 × 10 minutes, 5-minute overtimes, team-foul bonus from the 5th foul in a quarter, 5 fouls to foul out. ✓
- A player's technical is a team foul (FIBA); bench technicals aren't. ✓
- 3×3 ladder (team fouls 7+ / 10+). ✓
