---
name: sportfolio-multisport-teams
description: "Multi-sport \"Team\" (Club) system — one team, many sports, each with own captain/squad/roles; Club layered over per-sport teams"
metadata:
  node_type: memory
  type: project
  originSessionId: 66aee31b-d6ba-4c85-ac6e-54bbeecf2b1c
  modified: 2026-09-28T21:59:42.281Z
---

Team Creation & Management: one real-world team ("Club" internally, "Team" in UI) that plays MANY sports. Started 2026-09-29.

**Architecture (decided): Club layered ABOVE existing per-sport `teams` rows, NOT a refactor of Team.** A `Team` row stays bound to one sport (`teams.sport`); each becomes a sport "profile" linked by new `teams.club_id`. Reuses that row's existing captain_id/vice_captain_id/roster for sport leadership + squad. Keeps every match/tournament FK to `teams` intact.

Spec→model: Club = the team; `club_members.role` (admin|member, **first member auto-admin**) = team admin (separate from sport captains); per-sport `teams` row = sport profile; `team_player_roles` = sport-specific player roles (no universal list — catalogue in `src/data/teamRoles.ts`: cricket WK/Bat/Bowl/AR, football GK/DEF/MID/FWD, basketball/volleyball/kabaddi; racket sports none).

**ID gotcha:** `clubs.created_by` = PROFILE id; `club_members.player_id` = PLAYER id. `createClub` takes both `createdBy` (profile) and `firstMemberPlayerId` (player) — don't conflate.

Shipped (all commits on feat/sport-formats-and-scoring): Ph1 data (migration **0018** clubs/club_members/teams.club_id/team_player_roles + repos club data layer, 37ef0ac); Ph2 screens (ClubsScreen/CreateClubScreen/ClubHomeScreen/ClubSportScreen + routes; Organize "🛡️ My teams", d342cef); Ph5 game/tournament integration (§16 — `getClubsForPlayer` + `ClubQuickPick` "Your teams" in TournamentTeamsScreen + ScheduleMatchScreen; picking a club resolves/mints its per-sport team, captain+squad come free, 83d64c3); Ph3 invite/add (§10 — dashboard search-existing + add-by-phone; migration **0019** club_invites + createClubInvite/getClubInvite/claimClubInvite; JoinClubScreen + deep link sportnnote://join-club/:token; "🔗 Invite" native Share sheet, 3238664). Both demo + live paths. 292 pure tests pass.

Also shipped: logo upload (reuse LogoPicker/pickPhoto on create + dashboard + list) and invite **QR** (added deps react-native-svg + react-native-qrcode-svg via `expo install`, SDK-56; QR encodes sportnnote://join-club/<token>) — commit f7c3cb6. **Migrations 0018 + 0019 run by user 2026-09-29.** Full flow visually verified in demo mode 2026-09-29 (create/dashboard/search-add/cricket roles/sport-independence/§16 quick-pick/QR).

Also shipped (2026-09-29): **join-club edge function** (public browser landing for `?c=<code>`; `clubJoinLink` targets it when backend URL set; QR encodes the https link) + in-app **QR scanner** ScanQRScreen (expo-camera; `parseClubToken` in core/invite parses deep link/https/bare code) reached from JoinClub "📷 Scan a team QR". **User must deploy: `npx supabase functions deploy join-club --no-verify-jwt`.**

NEW NATIVE DEPS for Oct 1 EAS build: react-native-svg, react-native-qrcode-svg, expo-camera (app.json has camera permission plugin). Teams feature essentially complete. See [[sportfolio-devlog]], [[sportfolio-scorer-model]].
