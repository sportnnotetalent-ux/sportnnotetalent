# Wave 2: the consent model

**Founder decision 1A, 2026-10-28:** a relationship with a child counts only when the other side agrees.

**Fixes:** DB-01, DB-04, DB-05, DB-14, EF-02, EF-03 and SL-19 (see `audit-2026-10-27/PLAN.md`).

## The rule
A link between a **player** and a **group** gives the group's people the player's circle. The circle means their full name, card and contact (for a coach managing an unclaimed child), the right to follow them and push to them, and admin edits. That holds only when **the player's side agreed** to the link.

**The player's side** means one of:
- the player's own account;
- their linked parent account (`guardian_profile_id`);
- for an unclaimed player, the person who added them (`created_by`), who looks after that record.

A link the player's side didn't agree to still exists. The roster still shows the player and matches can still be scored. It just gives no visibility of a child and no privilege over them. Adults are public anyway, so this matters only for possible minors.

Groups go through the same check:
- a team in a tournament counts only once **the team's side** agreed (a team manager);
- a co-host named on a tournament gets no admin rights over its teams' players.

## Where agreement comes from
| Link | Agreed when |
|---|---|
| Team roster, `team_members`, `team_player_roles`, captain / vice / admin slots | The player's side made the change (recorded by a trigger). Or the team's creator is the player's side (the same coach added both; or the player or parent made the team). Or the link was accepted later (Wave 2b). Or it already existed (see below). |
| Club membership | The same rule, with the club's creator. Joining with a club code is the player's own account acting, so it's recorded. |
| Community (org) membership | An accepted join request or invite (the invitee, the parent, or the parent page from student lists). Or the player was added by the community's own staff (Owner / Admin / Organizer), as with a school's own students. Or the player's side made the change. Or it already existed. |
| Field-event entry (athletics, golf…) | The player's side made it. Or the event's creator added the player. Or the entry's team is a confirmed entry with an agreed roster. Or it already existed. |
| School House team with no roster | Counts only for players who are agreed members of that team's community (`teams.org_id`). Or the team's creator added them. |
| A team in a tournament | `tournament_teams.status = 'confirmed'`. From now on, "confirmed" needs the team's side: a team manager confirms, or accepts an invite. An organiser approving a team that asked to join (`pending`) also counts, because the team asked. An organiser entering a team they don't manage gets `invited`. Entries that already exist stay as they are. |
| A friendly against another team | The opponents' children are no longer in the host's circle. They show as initials until the other team's manager accepts the friendly (Wave 2b). The host's own team is unaffected. |

**Agreements already in place on the day of the migration:** every existing link is recorded as agreed (method `existing`), so nobody who uses the app today loses anything. The live data is a small pilot, made by known users.

## Privileges that change
- **`player_circle_of`:** each member source is filtered by agreement. The viewer's own groups stay as they are, since the viewer agrees to their own groups. What's checked is the other side.
- **Admin edits (`can_admin_player`):**
  - the tournament arm needs a `confirmed` entry;
  - the co-host clause (`host_ids` profiles) is dropped, because co-hosts are named without the team's agreement;
  - the team, club and org arms need the player's link to be agreed.
- **Roster rights (`can_edit_team_roster`, `my_roster_editable_team_ids`):**
  - matches give roster rights only for matches in a tournament where that team's entry is `confirmed`, never for friendlies;
  - a non-manager can no longer fill an empty captain or vice-captain slot.
- **Pushes (`push_allowed_targets`):** a possible minor can be a target only if they're in the caller's agreed circle. In `push-send`, minors also go through the same follow and circle filter that `notify-followers` uses.
- **`provisional_contact`** (an unclaimed player's number) is shown only to their creator and to the managers of teams where the player's link is agreed.
- **Community date-of-birth confirmations (`org_member_dobs`):** only for agreed members.

## Storage
- **`member_consents`:** columns `kind` ('team' | 'club' | 'org' | 'field_event'), `group_id`, `player_id`, `by_profile`, `method` ('self' | 'creator' | 'accepted' | 'existing' | 'joined') and `at`. The primary key is (kind, group_id, player_id).
  - Clients can't write it. Triggers and server functions do.
  - RLS: the player's side and the group's managers can read their rows.
- **`member_consented(kind, group, player)`:** returns true when there's a record, or when agreement holds by construction (the group's creator is the player's side).
- **Triggers:**
  - on `teams` (roster, captain, vice, admin_ids diffs), `team_members`, `team_player_roles`, `club_members`, `org_members` and `field_entries`: when the acting user is the added player's side, record `self` or `creator`;
  - on `org_requests` becoming accepted: record `accepted`.
- **`tournament_teams` guard:** the status rules above.

## Wave 2b (the app side, after 2a is live): BUILT 2026-10-28
Built as `20261028160000_security_wave2b`. See `breaks/security-wave2b.md` and the DEVLOG.
- Built: the Home card, team managers' friendly answers, and W1-2b.
- Still follow-ups: the push to the player's side, and the roster's "waiting" hint.
- Tournament entries already had **Accept invite** on the tournament page.

- **"Requests to confirm":** for a player, a parent, or the coach who looks after an unclaimed player. "Coach X added Asha to Team Y. Confirm or Not us." Plus a push to that side.
- **Team managers:** confirm "Team Y was entered in Tournament T", and accept or decline a friendly.
- **The roster screen** says "waiting for Asha's parent to confirm" where it shows initials.
- **W1-2b:** verify your number to link a profile your coach added.

## Tests (PGlite)
- **Characterisation:** everything that's legitimate today stays visible:
  - a coach sees their own children;
  - teammates who joined themselves see each other;
  - school staff see their students;
  - an organiser sees confirmed teams;
  - a parent sees their ward;
  - links that already existed still count.
- **Attacks, red before the fix:** each self-made source no longer reveals a child (roster, members, roles, captain slot, club, org, tournament entry, friendly, field entry, house team). The `host_ids` admin path is closed, friendlies give no roster rights, the captain slot is protected, and pushes to a stranger's children are refused.
- **Simulation:** at least 500 users (coaches, parents, children, strangers) trying every self-made link. A stranger never sees a child's full name, birth date or contact, and every legitimate view survives.
