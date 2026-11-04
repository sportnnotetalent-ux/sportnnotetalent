# Squash: rulebook audit (2026-11-05)

Fourth sport checked against the federation's own text (Firecrawl). It builds on `racket.md` §3 (SQ-e, video review, already built).

## Source

| Document | Version | Link |
|---|---|---|
| World Squash Singles Rules | Effective 1 Sep 2025, v1.2.2 (21 pp.) | https://www.worldsquash.sport/wp-content/uploads/2025/07/250901_World-Squash-Rules-of-Singles-Squash-2025-V1.2.2.pdf |

## Findings

| # | Priority | Rule | Gap | Status |
|---|---|---|---|---|
| SQ-1 | **P1** | Appendix 3.1: best of 5 → **2 video reviews per player per match**, plus 1 fresh one in the 5th game (unused ones not carried over). Best of 3 → 1 per match, plus 1 in the 3rd. A review is kept when the decision is overruled and lost when it is upheld. | We allowed one lost review per game, resetting every game (an old PSA reading). | **Fixed:** per-match allowance by match length; the deciding game gives one fresh review. Hint text updated. |
| SQ-2 | P3 | Appendix 3.3.3: the video referee can overrule a down / out call with conclusive evidence | Recorded as an ordinary point (a fix in the timeline). | Leave. |
| SQ-3 | P3 | 7.1: 1 minute after the warm-up, 2 minutes between games, 2 minutes to change equipment | No interval cue. | Possible "2 min between games" cue, like table tennis. |

## Checked and fine

- 2.1–2.3: point-a-rally scoring (PAR) to 11, two clear at 10-all, best of 5 (or 3). ✓ English scoring stays an option.
- Server keeps serving after winning a rally and alternates boxes; "hand out" on a change of server. ✓
- Rule 8: let / stroke / no let as rally outcomes (Let buttons, stroke = a point). ✓
- Conduct: warning → conduct stroke → conduct game → conduct match, per player (Rule 15 / Appendix). ✓
- Injury categories (self-inflicted / contributed / opponent-inflicted) as markers. ✓
