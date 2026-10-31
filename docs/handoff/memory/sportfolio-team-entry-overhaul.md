---
name: sportfolio-team-entry-overhaul
description: Team-entry basics overhaul (2026-08-16) — make adding teams match real event organizing; 3 sequenced phases
metadata: 
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-08-23T18:57:51.005Z
---

Reworking how teams get into a tournament so it matches real sports-event organizing (user's ask 2026-08-16). Old mental model was wrong: "add teams" assumed teams already exist on the app (created by individuals) and the organizer just picks them; the on-the-fly "New team" form created an orphan (name/short/colour, no owner, no contact, no squad).

Real-event model: organizers (1) enter teams they know are coming — needs a manager/captain **contact**; (2) **invite** clubs/captains to participate (accept flow); (3) accept **self-registrations** with an approval gate (invited→registered→confirmed→withdrawn/DQ lifecycle). Plus two structural gaps: a team needs an **owner + contact**, and school sport needs **categories/divisions** (U14/U16/U19 × Boys/Girls).

User chose **"do all three, sequenced"** — ship + test each before the next:
- **① Real team entry + contact** — SHIPPED + committed 2026-08-16 (commit `1a6a054`). Enriched on-the-fly add: manager/captain contact, team-claim invite (email auto / WhatsApp+SMS), attribute team to host org.
- **② Invite / self-register teams** — BUILT 2026-08-16, NOT yet committed; **needs migration 0007 run live** (adds `tournament_teams.status`). Organizer "Requests & invites" gate + "Invite (captain accepts)" mode; captain "Enter a team" (request / accept invite); notifications both ways. Backward-compat fallback so confirmed participation works pre-0007.
- **③ Categories/divisions** — SHIPPED + committed 2026-08-18 (commit `92430f2`); migration 0008 run live. `tournament_categories` table + `tournament_teams.category_id` (separate table, backward-compat fallbacks); `DivisionsEditor` at create; Division selector on TournamentTeamsScreen, teams rostered per division (one division each). Verified live (Inter-School Championship 2026 seed: U14 Boys / U16 Girls). **Phase 2 SHIPPED 2026-08-24 (commit `39a9f2c`)**: divisions are a real competition boundary — a match's division is *derived* from its teams' entry roster (no `matches.category_id` column) via `groups.matchesInDivision`; `useDivisions` hook + `DivisionTabs` component scope GenerateFixtures (team picker + advance tables), SportHub (schedule+table), Standings (table), and Bracket (knockout). Backward-compatible (no categories ⇒ shows all). Leaders on Standings stay tournament-wide (not division-scoped) — minor follow-up if wanted.

All three phases done. Related: dev-only live seeder `window.__sportfolioSeedDemo()` + clean-slate wipe — see [[sportfolio-repo]] and `docs/seed-and-wipe.md`.

Key files: `src/screens/TournamentTeamsScreen.tsx` (add-team UI), `src/data/repos.ts` (createTeam, addTournamentTeams, invitePerson/lookupPeople), `src/components/CoHostPicker.tsx` (invite pattern to mirror), Team type in `src/core/types.ts` (orgId, roster, adhoc; captain via TeamLeadership). See [[sportfolio-tournament-vision]] and [[sportfolio-devlog]].
