---
name: sportfolio-student-lists
description: School bulk student upload (whole school / class / section, recognise existing, parent approves outside matches) — built 2026-10-27 b2eec10, NOT live (migration + edge fn + publish pending)
metadata:
  type: project
---

Founder 2026-10-27 asked for bulk student upload: class-wise, section-wise, new students across classes, existing students recognised, no duplicates. Decisions: **1A** child already on SportnNote outside the school → parent (on file) approves by emailed link, school never sees the profile; **2A** leavers marked only when the school ticks "Mark these as left today" (whole-school list only); **3A** admission number only (school's own), no APAAR/PEN/UPN government IDs.

Built in b2eec10 (DEVLOG entry "Student lists"): StudentImportScreen (academic orgs' Members → 📥 Add students; others keep RosterImport), data/studentList.ts (pure plan: splitClassSection/composeClass/rowClasses — section stays inside the label "Class 7-B", the app's existing convention), data/studentListStore.ts, core/xlsx.ts (zero-dep .xlsx via DecompressionStream, web), migration 20261028100000_student_lists (org_member_ids, org_roster_match, org_roster_invite service-role, org_parent_requests, school_request_preview/decide anon, triggers so a minor can't self-accept), edge fn school-parent-request, public page /school-request (SchoolRequestScreen; app link in app.json → effective from APK 1.1.0), guide add-your-students. Demo-verified end to end.

**Hardened 2026-10-27 (76d8327):** break-it pass docs/security/breaks/student-lists.md — 25 points, 20 fixed (test-first), 3 accepted, SL-19 deferred to founder (pre-existing: any org admin can directly add any player incl. children → circle access; asked: parent approval for minors?). 500-school sim tests/sim-student-lists.test.mts found SL-24/25 (fixed). Migration file changed after b2eec10 — founder must run the CURRENT file. Still not live.

**Why:** schools must load whole year groups each year without duplicate child profiles; DPDP — parent controls linking an existing child to a school.
**How to apply:** go-live needs founder to run the migration, deploy school-parent-request, then publish web/OTA. Plpgsql bodies were never executed (no local Postgres) — after the SQL runs, do a read-only sanity call if possible and watch for errors on first real use. Related: [[sportfolio-org-verification]], [[sportfolio-status-2026-10-25]].

**LIVE 2026-10-28:** both SQL files run by founder + verified read-only; school-parent-request deployed; web index-be6be071 + OTA 9347eaac from 4ad2d10.
