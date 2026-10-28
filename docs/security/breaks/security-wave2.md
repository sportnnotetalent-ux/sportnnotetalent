# Security Wave 2a: break the consent model

**The change:** migration `20261028140000_security_wave2`. Design: `../wave2-consent-design.md`.

**Process:** quality mandate step 4, applied to the change. Each point asks whether a stranger can still get round it, or whether it breaks a legitimate use. Each is then fixed with a failing test first, or accepted with a reason.

## Can a stranger still get round it?
| # | Attempt | Status |
|---|---|---|
| W2B-01 | **Pose as the child's side.** `created_by` is reset by `guard_player_write`, and `guardian_profile_id` can't be set by clients (`guard_guardian_fields`, and W1-1 for co-managers). | Holds (tests). |
| W2B-02 | **Write an agreement directly.** `member_consents` has no client grants, and `record_member_consent` / `member_consented` aren't callable by clients. | Holds. |
| W2B-03 | **Become a manager of the child's team.** The captain slot is closed for non-managers. `admin_ids` can only be set by managers. Staff rights come only from a team invite token the coach shared. | Holds (tests). |
| W2B-04 | **Accept on the child's behalf.** Only the invitee, the parent or the parent's page can accept an invite. A join request can only be made for yourself (`guard_org_request`). | Holds. |
| W2B-05 | **Put a House team into a school.** That needs the school's Owner, Admin or Organizer role (`can_place_team_in_org`, `guard_team_write`). | Holds. |
| W2B-06 | **Enter the child's real team in your tournament.** A brand-new entry becomes `invited`, and only the team's manager confirms it. | Holds (tests, simulation). |
| W2B-07 | **Become a staff member of a school, then count its students as yours.** Staff roles need the school to grant them. A school that makes someone staff speaks for its own students. | Accepted: that's the school's decision. |
| W2B-08 | **Links that existed before the migration count as agreed.** On live (read-only, 2026-10-28) there were 0 cross-creator roster links involving a possible minor, 0 community memberships of minors, and 3 club memberships of minors, all from the pilot. | Accepted. |

## Does it break something legitimate?
| # | What could break | Status |
|---|---|---|
| W2B-09 | **The app's "add teams" is an upsert.** Re-adding a confirmed team downgraded it to `invited`, and approving a team that asked to join turned it into `invited`. | **Fixed:** the insert guard applies only to brand-new entries. The update guard never downgrades a confirmed team, and an organiser can't confirm an invite (it stays an invite, without an error). Test: "the app's bulk add (an upsert)…". |
| W2B-10 | **Organisers adding other people's teams.** They now see them as `invited` until the team's manager accepts. The app already has "Accept invite" for team managers on the tournament page. Teams the organiser creates themselves (schools' teams, singles entries, House teams) are confirmed as before. | Accepted, by design. |
| W2B-11 | **Friendlies.** The opponents' children show as initials to the host and to an assigned scorer from outside. The host's own team is unchanged. | Accepted for now. **Wave 2b:** the opponent's manager accepts the friendly. |
| W2B-12 | **A child added by another coach.** A coach who adds a child someone else created, or a child with their own account, to their roster sees initials until the child's side agrees. | Accepted for now. **Wave 2b:** "Requests to confirm". |
| W2B-13 | **Squad changes and the captain slot.** A scorer or host of a friendly can no longer change the other team's squad or fill its empty captain slot. Tournament organisers keep squad rights over confirmed teams. | Accepted, by design (DB-05). |
| W2B-14 | **Match pushes.** Reminders to the opponents' children in friendlies stop. Tournament reminders through confirmed entries continue. | Accepted, by design (EF-02 / EF-03). |
| W2B-15 | **Date-of-birth confirmations.** A school's list shows only agreed members. Children an admin added directly, created by someone else, drop out. | Accepted, by design (DB-14). |
| W2B-16 | **Speed.** `member_consented` runs once per member row inside `player_circle_of`, which runs once per `players_view` query and once per `push_allowed_targets` call. The simulation (about 1,000 people) runs in about 6 s, including setup. | Accepted. Watch in the weekly report. |

**Simulation** (`tests/sim-security-wave2.test.mts`): 100 coaches and 100 assistants, 40 schools with 2 staff and 4 students each, and 200 strangers making each of the 10 self-made link types 20 times. Every stranger was blocked from seeing the child and from pushing to them, and all 920 legitimate views were kept. The same simulation fails without the migration.
