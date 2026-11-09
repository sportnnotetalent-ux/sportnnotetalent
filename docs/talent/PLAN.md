# SportnNote Talent — plan (founder, 2026-11-09)

SportnNote Talent is a copy of the SportnNote app, made for schools only.
Schools pay per student. Parents follow their children's matches, live video
and stats. Staff organize and score. Org Leaders and Admins run the school from
a CRM website.

This project was copied from SportnNote `main` at `f9620aed` on 2026-11-09.
**SportnNote must never be touched from here.** The `upstream` remote points
at the SportnNote repo for fetching fixes only, and pushing to it is disabled.

## 1. Separation from SportnNote (done on 2026-11-09 unless marked TODO)

| Item | SportnNote | Talent |
|---|---|---|
| App name / slug / scheme | SportnNote / sportnnote / sportnnote | SportnNote Talent / sportnnote-talent / sportnnotetalent |
| Bundle ID / Android package | in.sportnnote.app | in.sportnnote.talent |
| EAS project + OTA updates | linked | **removed** — TODO: create a Talent EAS project |
| Firebase (push) files | SportnNote's | **removed** — TODO: Talent Firebase project |
| Supabase | live project `mpgbvbylmkwasjgupsbq` | Talent project `mjzywmnglxyijjebzfcj` (Mumbai, ap-south-1; replaces an empty Seoul project made by mistake), set in the local `.env` (gitignored). Schema not applied yet, so the app has no working backend until the schema task lands |
| Cloudflare worker | sportnnote | renamed sportnnote-talent, Supabase values blanked |
| Web hosts (share links, app links) | app.sportnnote.in | unchanged for now. TODO: pick the Talent domain, set it through `EXPO_PUBLIC_APP_URL` / `EXPO_PUBLIC_SITE_URL` (src/core/hosts.ts) and the app.json intent filter |
| Android app-links package | in.sportnnote.app | in.sportnnote.talent. TODO: replace SportnNote's signing-key fingerprints in src/core/androidAppLinks.ts with Talent's EAS key |
| Nightly DB backup workflow | runs on live DB | **removed** — re-add pointed at Talent's DB |

Tests for the removed parts are marked `todo`/`skip` with a pointer to this
section (tests/go-live-setup.test.mts, tests/store-prep.test.mts). Turn them
back on when Talent's Firebase and backup are set up.

Live-project references (done 2026-11-09): every migration, release script,
edge function, script, agent and how-to doc now names the Talent project
`mjzywmnglxyijjebzfcj`. The two release cron scripts that hardcoded
SportnNote's anon key now read it from Vault (`functions_anon_key`). Only
history docs still name SportnNote's `mpgbvbylmkwasjgupsbq`: DEVLOG.md,
docs/HANDOFF.md, docs/handoff/memory/*, the 2026-10-24 API exposure audit
and the founder IP deed template. Check with
`grep -rIl mpgbvbylmkwasjgupsbq --exclude-dir=node_modules .`

## 2. Roles

Order: **Org Leader → Admin → Organizer → Scorer → Parent.**

| Role | CRM website | Talent app | Can do |
|---|---|---|---|
| Org Leader | ✅ | ✅ | Everything an Admin can, plus school dashboards and reports |
| Admin | ✅ | ✅ (full access) | All records; creates Admins, Organizers, Scorers, Parents; bulk upload |
| Organizer | ❌ | ✅ (full access) | Organize games and tournaments, edit info, remind captains, edit squads |
| Scorer | ❌ | ✅ | Score assigned games only. Cannot change squads or edit info |
| Parent | ❌ | ✅ | Follow own children: live scores, video, stats; edit sports profile |

In the app, Org Leader, Admin and Organizer all have complete access.

**Org Leader protection.** Admins cannot add, change or remove an Org Leader.
An Org Leader can add another Org Leader and can remove **only themselves**,
and only while another Org Leader remains. Any other Org Leader change is made
by the SportnNote team only.

**Licences per school.** Org Leaders + Admins + Organizers + Scorers share
**10 staff seats** in total. Parent logins are capped by the number of student
licences bought. The database enforces both caps, not only the screens.

**One person, many roles.** Roles belong to a membership, not to a person. A
teacher who is an Organizer and also a parent at the same school uses one
login and sees both.

## 3. Login and how the CRM and the app connect

There is no sync. The CRM and the app share **one Talent database**.

1. The SportnNote team creates a school in the super-admin console (the
   current support console, extended). They set student licences and add the
   Org Leader and Admin email + phone. Both get an automatic email with the
   CRM link.
2. Org Leaders and Admins sign in to the CRM by email code.
3. The Admin adds staff and bulk-uploads students from a sheet: name, class,
   section, gender, **date of birth**, parent phone, parent name.
4. The app has **phone + OTP login only**. A number not on any school's list
   is refused ("Your school hasn't added this number"). On first login the
   account is matched by phone to its roles and children.
5. Removing someone in the CRM ends their access at the next check.

**Siblings, including at different schools.** One phone is one account
across all schools. Each school's upload links that account to that school's
student. So a parent with children at two Talent schools sees both children
under one login, grouped by school. Each school is billed for its own
students and sees only its own students. School A never sees the child at
school B, or that the parent has another child elsewhere. Contact details the
school uploaded (for example, parent name) are stored per school.

## 4. Age and consent

The school uploads and vouches for its students, so the **parental-proof /
age-proof flow is hidden in Talent**. DOB comes from the upload. The school
contract must state that the school has parental consent for its students'
data and for filming them (lawyer to word this under the DPDP Act).

What a parent can edit: the **sports profile**, for example batting hand,
bowling style, playing position, preferred foot, dominant hand. What a parent
cannot edit: name, class, section, gender and DOB. These belong to the school;
a parent can only send a correction request to the Admin.

## 5. School video (not YouTube)

This is possible. The school's own camera streams or uploads to a **private
video service** (Cloudflare Stream or Mux), and the match page plays it. Only
that school's parents and staff can watch.

- **Live:** for each match, the app creates a stream with a stream URL and
  key. The school enters them in its camera or encoder (IP camera, a laptop
  running OBS, a phone camera app like Larix, or an AI sports camera with RTMP
  out). Parents watch in the match page.
- **Recorded:** an Admin or Organizer uploads the file in the CRM or app and
  attaches it to the match. Optionally, later: tag key moments from the score
  feed (goals, wickets) so parents can jump to their child's moments.
- **Access:** short-lived signed playback links tied to the logged-in user.
  No public link, no download button.
- **What's needed:** a video provider account (pay per minute stored and per
  minute watched, so price it into the per-student fee), a per-school
  retention rule (e.g. delete after 1 year), filming consent in the school
  contract, and a camera at the school. Confirm current provider prices before
  quoting schools.

## 6. Org Leader dashboards and reports (CRM)

- Per year, filter by sport, class and gender: **top 10 boys and top 10 girls
  per sport**, medals, participation, results by team.
- "Top performer" needs a per-sport score (position points + key stats).
  Define it per sport with the rules expert.
- **Spending:** Admins record expenses per sport in the CRM (equipment,
  travel, coach fees, event fees, against a budget). The report reads from
  those records.
- **Monthly emailed summary** (one-page PDF) to Org Leaders.
- Rankings of students are visible to Org Leaders and Admins only, never to
  parents.

## 7. Where the CRM lives

A **separate CRM website, not a separate system**: same codebase, same
database, its own web address (e.g. `crm.talent.sportnnote.in`). It is never
included in the phone app. It reuses the existing student upload, support
console and dashboard code.

## 8. Next steps

1. Founder: create the Talent Supabase project and a Talent GitHub repo
   (then `git remote add origin <url>`; founder pushes).
2. Talent database: copy the schema, switch the live-project names listed in
   §1, then add schools, licences, memberships with Talent roles, the phone
   allow-list login check, and seat caps (test-first per the quality mandate).
   **Built and tested 2026-11-09** (migration `20261117120000_talent_foundations`,
   spec docs/talent/schema-foundations.md, breaks docs/security/breaks/talent-foundations.md).
   Not applied yet: the founder runs docs/talent/RUNBOOK-apply-schema.md.
3. App: phone-OTP-only login; role-based tabs; hide parental proof; parent
   sports-profile edit; multi-school child switcher.
4. CRM website: sign-in, staff management, bulk upload, Org Leader rules.
5. Super-admin console: create schools, licences, Org Leader/Admin invites.
6. Dashboards and expense records; monthly email.
7. Private video (provider choice + cost model first).
