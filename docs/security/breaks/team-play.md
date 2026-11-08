# Teams for doubles, phase 1: who plays, stand-ins, mapping — break it first

2026-11-08. Phase 1 of docs/product/teams-for-doubles.md (founder decisions there). These are pure rules in `src/core/teamPlay.ts`, used by the screens in later phases:
- who plays for a side;
- the stand-in players when nobody picked;
- whether the scorer picks or sends a reminder;
- moving a stand-in's credits and stats to the real player.

| # | Break | Kind | Fix |
|---|---|---|---|
| TP1 | A squad of exactly the number needed (today's doubles) gets a needless "Who's playing?" prompt. | Ease | Squad size = number needed → chosen automatically, in squad order. Tested. |
| TP2 | A pick with the wrong number of players, a duplicate, or someone not in the squad is accepted. | Data | A pick is used only if it has exactly the number needed, all distinct, all in the squad. Otherwise it falls back to automatic or stand-ins. Tested. |
| TP3 | Nobody picked a larger squad and scoring is blocked. | Founder rule | Never blocked: the side gets stand-ins "{Team} Player 1 … N". Tested. |
| TP4 | Stand-in ids clash with real player ids or with the other side's stand-ins. | Data | Stand-in ids are `ph:{teamId}:{n}`, which no real id can look like. They are unique per team and slot. Tested. |
| TP5 | A scorer who can't manage the team picks its players anyway. | Access | Only a team manager (captain, vice-captain, admins, organisers, club admin; the existing `canManageTeamLocal`) or the match host may pick. Everyone else gets "Ask {Team} to pick". Tested. |
| TP6 | Mapping a stand-in to the real player misses a credit (assist, hitter, error, rebound …) hidden somewhere in the log. | Stats | Every exact occurrence of the stand-in id anywhere in the events is replaced, at any depth. Other strings are untouched. Tested. |
| TP7 | Mapping two stand-ins to the same person, to someone outside the squad, or to the other team's player. | Data | Refused with a reason: targets must be distinct squad members of that team, and not already playing for that side. Tested. |
| TP8 | The real player already has a stat line for the match, so the move duplicates or overwrites it. | Stats | The stand-in's line is merged into the real player's line (numbers added), then the stand-in line is gone. Tested. |
| TP9 | Mapping changes the score or the result. | Integrity | Only player ids change. The side, score and order of every event stay the same. Tested in the 600-user sim. |
| TP10 | A stand-in shows up on a career or leaderboard. | Stats | `isStandIn(id)` marks them, so later phases keep them out of careers. Tested. |
