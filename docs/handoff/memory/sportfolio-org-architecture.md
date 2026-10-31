---
name: sportfolio-org-architecture
description: "Individuals/orgs/membership/roles/ownership/schools model — the big platform-foundation spec; M1 (roles+membership lifecycle) shipped, M2-M5 pending"
metadata:
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-29T07:06:51.857Z
---

Big foundational spec (2026-09-29): one person identity across many orgs/teams/tournaments with contextual roles; orgs with Owner/Admin/Organizer/Scorer/Referee/Member; tournament individual-vs-org ownership + transfer; schools with houses/classes/students preserved by academic year. Planned as milestones **M1 roles+membership lifecycle · M2 context switcher · M3 ownership/transfer · M4 school structure · M5 audit**.

**Key existing facts:** person = Profile (login) + Player (sport), linked by profile_id; almost everything keys on PLAYER id via getMyPlayerId. Tournament ownership already first-class: `hostOrgId` (org) vs `hostIds` (player ids), enforced by canManageTournament/tournamentHostPlayerIds. Schools = Organization(type School/College); classes = per-member `grades` GradeStint timeline; houses = Player.houseName strings (not entities).

**User decisions:** (1) membership = **full join-table refactor** (not hybrid); (2) build **M1 first**.

**M1 SHIPPED (commits 495fde9 data, 445ec2b console, deaf358 discover):**
- Membership moved from `organizations.members` JSONB → **`org_members` join table** (migration **0020**), but the data layer RE-ASSEMBLES `Organization.members` on read (getOrganization[s] + loadOrgMembers), so org.ts's ~30 helpers + academic timeline + org console are unchanged. setOrgMembers now upserts+deletes rows.
- Roles gained **Owner** (top; org must never have 0 — HARD-enforced in setOrgMembers, no UI path can violate) + **Referee**. Helpers: isOrgOwner/canManageOwners/activeOwners/isSoleActiveOwner in core/org.ts. Owner ⊇ Admin in canManageOrg/canOrganizeEvents/tournamentHostPlayerIds. Org creator = Owner.
- **org_requests** table + lifecycle repos: inviteToOrg/requestToJoinOrg/getOrgRequests/getMyOrgRequests/respondToOrgRequest/cancelOrgRequest (demo+live). Joining is never automatic — request → owner/admin accepts.
- UI: OrganizationScreen Owner/Referee sections + guarded role editor + pending-requests panel; DiscoverOrgsScreen (search + request-to-join) + Organize "🔎 Find a community" + Invitations card. Bootstrap: any manager can appoint the FIRST owner if an org has none.
- Demo seed: withSeedOwners promotes an Owner per seeded org.

**M2 SHIPPED (commit 6fe1234):** "acting as" context. `src/core/orgContext.tsx` OrgContextProvider (activeOrgId persisted in AsyncStorage, self-heals to Personal) + useActiveOrg(); `ContextSwitcher` component in Organize header; hub context-aware (Personal shows personally-hosted only; org context shows that org's tournaments + "Manage <org>" + New tournament defaults orgId). App.tsx wraps OrgContextProvider inside AuthProvider. (Visual walk was pending — browser pane hidden at build; verify switcher next demo session.)

**M3 SHIPPED (commit 9ec9396):** tournament ownership. `Tournament.createdBy` (player id, retained across transfers, backfilled from organizer_id); `transferTournamentOwnership(id, OwnerRef, byPlayerId)` flips host_org_id/host_ids+host_name (individual⇄org); audit `tournament_ownership_events` + `getOwnershipEvents()`. Migration **0021** (created_by col + events table). UI: TournamentProfileScreen Info "Organized by…·Created by…" + Settings 🔑 Ownership card (transfer + history). demo.ownershipEvents mirror.

**M4 SHIPPED (M4a 0a9a933, M4b 961ff34):** School structure. M4a Houses first-class: types House/HouseStint, Organization.houses + OrgMember.houses; org.ts housesOf/houseAt/currentHouse/assignHouse/houseColorOf (timeline like grades, history-preserving); migration **0022** (organizations.houses + org_members.houses jsonb; graceful fallback via withOrgCols + member-cols retry); repos setOrgHouses; console 🏠 Houses manager + per-student picker. M4b participation: Tournament.participation (open|inter_house|school_team|individual), migration **0023**; CreateTournament "Contested by" chooser + display; `enterOrgHousesAsTeams()` seeds a school's Houses as teams for inter-house events. Team flexibility §22 already covered (Club with zero sports = non-sport team).

**M5 SHIPPED (commit de4a798) — EPIC COMPLETE.** §9 per-tournament officials: `tournament_officials` table (org Scorer/Referee = eligibility; assignment = actual duty); repos get/assign/unassignTournamentOfficial; TournamentProfile Settings 🎽 "Scorers & referees" card (assign from host org's eligible members or hosts). §27 audit: `activity_log` + logActivity/getActivity; membership join/leave/role changes logged (joinOrg/leaveOrg now take byPlayerId; new `changeOrgMemberRole`) + official assign/unassign; org console 🕓 History section. Migration **0024** (tournament_officials + activity_log). Demo mirrors.

**ALL FIVE MILESTONES DONE (M1-M5).** **MUST run migrations 0020–0024 for live.** M2-M5 visual walk still pending (browser pane hidden during builds — verify next demo session). One-per-category active-membership rule still in joinOrg (unchanged, could revisit vs §4 "belong to multiple orgs"). Possible follow-ups: wire tournament_officials into per-match scorer assignment (LiveScoring currently uses match.scorer_ids independently); unified activity view on tournaments too. See [[sportfolio-devlog]].
