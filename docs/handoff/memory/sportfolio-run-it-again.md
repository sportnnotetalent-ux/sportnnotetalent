---
name: sportfolio-run-it-again
description: "Run it again (next edition, linked) + Copy this setup (any tournament) — built 2026-10-27 (a3a1a33); migration 20261027140000_tournament_editions pending founder run"
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-27T06:20:40.358Z
---

Founder asked 2026-10-27 for "Run it again next year" plus a clone option on every tournament (incl. others') to retrieve sports, format, rules, events and venues. Built in commit a3a1a33.

- Next edition = linked via tournaments.previous_edition_id / first_edition_id (trigger guard_tournament_edition: only the earlier edition's organisers, forward in time, set at insert only). Clone = unlinked; someone else's comes without branding/contact/records, About only on request.
- Meet events can't exist without start lists, so they carry as formats[sport].programme; hub "Events from last time". Every event sport's setup pre-fills (8d00c79, LIVE 2026-10-27: web 1dd270da, OTA ae032995): route param `slot`, useCarriedEvent preloads, data/carriedSetup.ts seeds, useEffectAfterSeed skips reset effects' first run. A new setup field that should carry needs adding to PROGRAMME_SETTING_KEYS + the sport's seed.
- Edition-only keys stripped from formats: meetEntries, manualRows, americano, pointsAdj, rulesSetAt, swissSeed (+ swissOps except hpbLimit, prizeCats add/drop); records kept only for next edition.
- Golf (2026-10-27, commit 4700407, not yet published): rounds carry as formats.golf.roundPlan (GOLF_ROUNDS_KEY; golfRoundsFrom / golfGroupsOf / readGolfRounds in tournamentCopyPlan.ts). Per-round edition data never carried = GOLF_ROUND_EDITION_KEYS (entryTees, playoffWinner, courseSnap, alert, highlights, cutAfterRound) — add new per-round result keys there. Hub card "Rounds from last time"; GolfRoundSetupScreen pre-fills by roundNo (round 1 everything; later rounds only name/time/groups/cut). Also fixed: golf hub organiser gate now includes canManageTournament.
- Guide builder now renders tables (live on sportnnote.in 2026-10-27).
- Web header fit (webHeaderFit in RootNavigator, web only): right header buttons keep their width, title ellipsizes — re-check after a React Navigation / SDK 57 upgrade (tests/header-fit.test.mts).
- EAS Hosting can serve old+new index for ~6 min after promotion; poll until 10/10 new before calling a web publish live.

**Why:** schools/colleges host the same meet year on year ([[sportfolio-tournament-vision]], [[sportfolio-org-verification]]).
**How to apply:** the editions migration is live (checked read-only 2026-10-27); future tournament-level settings that hold per-edition data must be added to EDITION_KEYS in src/data/tournamentCopyPlan.ts.
