---
name: sportfolio-multisport-medal
description: "Multi-sport medal/position-scored tournaments (Olympics/sports-day) — contingents, position points, walkovers"
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-08-28T14:33:58.956Z
---

Multi-sport **medal meet** capability shipped 2026-08-25 (commit d8d9ee4), needs migration **0015** `20260829120000_medal_scoring.sql` (adds one `tournaments.scoring` jsonb column; graceful pre-migration fallback via `withTournamentCols`).

**Model:** each sport's own league table gives a finishing position → configurable **position points** (per-sport weight optional) → summed **by contingent NAME** into an overall medal table (total + 🥇/🥈/🥉 + per-sport placement). Reuses each sport's tie-breakers ([[sportfolio-tournament-org-audit]] gap #4).

**Key pieces:**
- `data/medalStandings.ts` (pure, 7 tests) — `medalStandings(matches, sports, scoring, formats)`.
- `Tournament.scoring` = `{ mode: 'match'|'position', positionPoints[], sportWeights }`.
- **Contingents** (repos: `addContingent`/`getContingents`/`setContingentParticipation`; `ContingentsScreen`): add a team once → entered into EVERY sport as per-sport rows sharing name/colour (the app's cross-sport identity is name-merge, same as `overallStandings`).
- **Walkovers** = zero-migration `__walkover` flag on `match.format`; `walkoverMatch(id, winner)` sets completed+winner. Host-only "🏳 Award a walkover" on the match screen; marking a contingent OUT of a sport auto-walkovers its existing scheduled fixtures (opponents win). MatchCard shows "W/O". `Match.walkover` derived in `toMatch`.
- `MedalScoringEditor` on Create/Edit Tournament (multi-sport only); TournamentProfile shows 🏅 Medal table when `scoring.mode==='position'`.

**Follow-up (not built):** auto-walkover at fixture-GENERATION time for teams already marked out before fixtures exist (currently withdrawn teams are just excluded from new fixtures; existing ones are walkover'd when you toggle them out).

**Verified:** tsc + 268 tests + clean bundle. Live UI click-through NOT done — the shared live DB (localhost:8091 is LIVE, see [[sportfolio-overview]]) logs out on server restart and I can't sign in. Needs a signed-in session to verify end-to-end.
