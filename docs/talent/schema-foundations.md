# Talent database foundations (spec, 2026-11-09)

PLAN §8 step 2: schools, licences, memberships with Talent roles, the phone
allow-list login check, and seat caps. Migration
`supabase/migrations/20261117120000_talent_foundations.sql`, tests
`tests/db-talent-foundations.test.mts` (written first) and
`tests/sim-talent-foundations.test.mts` (500+ users).

The SportnNote schema stays as it is underneath. Talent adds four tables and a
set of functions on top. Nothing here changes an existing table or function.

## Tables

| Table | One row per | Key columns |
|---|---|---|
| `talent_schools` | school (an `organizations` row, type `School`) | `student_licences`, `staff_seats` (default 10) |
| `talent_memberships` | person × school × role | `phone` (E.164 via `phone_key`), `role`, `display_name`, `email`, `profile_id` (null until first login), `removed_at` |
| `talent_students` | student × school | `full_name`, `dob`, `gender`, `class`, `section` |
| `talent_student_guardians` | parent membership × student | links a `parent` membership to a student of the same school |

Roles: `org_leader`, `admin`, `organizer`, `scorer`, `parent`. A membership is
active while `removed_at` is null. A person (one phone) can hold several roles
at a school and memberships at several schools.

A student is **not** a SportnNote `players` row. Name, DOB, gender, class and
section all live on `talent_students`, so only the Talent rules below decide
who sees a child; SportnNote's older player features (claims, teams, share
links, "known adult" names) can't reach them. How a student takes part in
scored matches is designed in the app step. Parent name is the parent
membership's `display_name`, so it is stored per school.

Phones are Indian mobiles only (`+91` and 10 digits starting 6–9). Names and
other free text can't contain control or text-direction characters; emails
must look like emails. A student's DOB must be school age (2 to 21 years).

## Rules (each one has a test)

**Writes go through functions only.** Clients (anon, authenticated) can't
insert, update or delete any `talent_*` row directly.

**Who can do what**
- `talent_create_school(name, student_licences)` and
  `talent_set_licences(school, n)`: SportnNote support only (`is_support()`).
  Licences can't be set below what is already in use.
- `talent_add_member(school, phone, role, name, email)`, staff roles only
  (`org_leader`, `admin`, `organizer`, `scorer`):
  - support: any staff role;
  - Org Leader: any staff role, including another Org Leader;
  - Admin: `admin`, `organizer`, `scorer`; never `org_leader`;
  - anyone else: refused.
  The same phone can't hold the same active role twice at a school.
- `talent_remove_member(membership)`:
  - support: any;
  - an Org Leader membership: only its own holder, and only while another
    active Org Leader who has signed in remains; nobody else (Admins
    included) can remove it;
  - other memberships: Org Leader or Admin of that school.
  - a caller with no role at that school gets "No such membership" whether
    or not the id exists.
- `talent_add_student(school, name, dob, gender, class, section,
  parent_phone, parent_name)`: Org Leader or Admin (or support). Creates the
  student row, the school's parent membership for that phone if there isn't
  one yet, and the guardian link. The same name + DOB + parent phone again
  returns the existing student (a double submit uses one licence).
- `talent_remove_student(student)`: Org Leader or Admin (or support). Deletes
  the student row, so the child's details are erased. A parent membership
  whose last child is removed is removed too.

**Caps (enforced by triggers, so they hold for every write path)**
- Caps are checked when a membership or student becomes active, never when a
  person signs in, so one school over its cap can't block their other schools.
- Licences and staff seats can't be lowered below what is in use.
- Active staff at a school, counted as distinct phones holding any staff role,
  never exceeds `staff_seats`.
- Active students never exceed `student_licences`.
- Active parent memberships (distinct phones) never exceed `student_licences`.

**Login**
- `talent_phone_allowed(phone)`: true only if the number has an active
  membership at some school. Callable by `service_role` only (the phone-login
  edge function and the sign-up hook), so it can't be used to probe numbers.
- `talent_attach_me()`: a signed-in user whose sign-in phone is confirmed
  (`auth.users.phone_confirmed_at`) gets every active, unattached membership
  with that phone linked to their profile. It compares the full international
  number (no guessing a country). Never uses a typed phone. Never takes a
  membership already linked to someone else.
- A role only counts while the membership's phone is still the person's
  confirmed sign-in number: moving to a new number ends the old number's
  roles.

**Who can read what (RLS)**
- `talent_schools`: active members of that school, and support.
- `talent_memberships`: your own rows; all rows of a school for its Org
  Leaders and Admins; support.
- `talent_students` (including the child's name and DOB): the school's staff
  (all four staff roles); a parent sees only the students linked to their own
  parent membership; support. Nobody else, whatever the child's age.
- `talent_student_guardians`: Org Leaders and Admins of the school, the parent
  in the link, support.
- A parent with children at two schools sees both, grouped by school, and
  school A sees nothing of school B.
- Removed memberships give no access.

## Not in this step
Bulk upload (CRM), editing the phone-login edge function and the sign-up hook
to call `talent_phone_allowed`, linking students to scored matches, an "add
another guardian" call, an audit log, rate limits, parent sports-profile edits,
correction requests, video, dashboards. Accepted break points and their
reasons are in docs/security/breaks/talent-foundations.md.
