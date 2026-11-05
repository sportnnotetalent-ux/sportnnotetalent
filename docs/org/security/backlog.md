# Security backlog

Status: `todo` / `doing` / `review` / `awaiting founder` / `done`. "check" = seeded from older docs; confirm it is still open before working on it.

| Id | Title | Owner | Status | Source |
|---|---|---|---|---|
| SEC-01 | Anti-scraping at scale: plan CAPTCHA (needs an APK with a WebView; not APK 41), stop logged-out list reads of raw tables, Supabase Pro log drains for daily busy-IP alerts | sec-ops → eng | todo | `docs/security/anti-scraping.md` "Later, at scale"; `docs/HANDOFF.md` §4.6 |
| SEC-02 | App Check + Firebase SMS region policy (CL-20) | founder (console) | awaiting founder | `docs/security/breaks/security-wave4.md` CL-20 |
| SEC-03 | EAS Update code signing with the 1.1.0 APK (CL-29) | founder / eng build | awaiting founder | `docs/security/breaks/security-wave4.md` CL-29; `docs/HANDOFF.md` §4.6 |
| SEC-04 | Re-check Play data-safety / Apple privacy labels against the current app (location, guest scoring, stats pushes, viewer analytics) and the target-audience choice (13+ recommended, founder decides) | sec-compliance | todo | `docs/launch/store-launch.md` §E; `docs/security/breaks/store-prep.md` SP7 |
| SEC-05 | Points list for the lawyer: privacy version 2026-10-31, under-18 matches in Near you (PH-04), location, proprietorship name/address, scraping clauses in Terms | sec-compliance | todo | `docs/HANDOFF.md` §4.5; `docs/security/breaks/personalised-home.md`; `docs/security/anti-scraping.md` |
| SEC-06 | Restore drill step list for the founder | sec-ops | todo (due ~Jan 2027) | `docs/HANDOFF.md` §4.5 |
| SEC-07 | `report-invite` / `join` links keyed by guessable player ids → signed links | sec-appsec → eng | check | `docs/security-hardening.md` "Still open" |
| SEC-08 | Wave 2b follow-up: "Report" on a request (abuse path) | eng (sec-appsec reviews) | check | `docs/security/audit-2026-10-27/PLAN.md` follow-ups; `docs/HANDOFF.md` §4.6 |
| SEC-09 | Wave 2b follow-up: "Declined requests" in Settings | eng (sec-appsec reviews) | check | same as SEC-08 |
| SEC-10 | Delete the under-18 test account "Sravan" after the parental-proof end-to-end test | founder | awaiting founder | `docs/HANDOFF.md` §4.5 |
| SEC-11 | Encrypted DB backup `sportnnote-db-20261027-2105.tar.gz.enc` sits in the repo folder (untracked): founder to move or delete; never commit | founder | awaiting founder | `docs/handoff/memory/sportfolio-status-2026-10-25.md` (2026-10-29 refresh); charter commit rules |
| SEC-12 | App attestation (Play Integrity / App Attest) behind an API proxy — later | sec-ops | todo (later) | `docs/security/anti-scraping.md` |
| SEC-13 | Break-it review of `feat/sport-formats-and-scoring` branch before it ships, if it touches data or permissions | sec-appsec | check | current branch (git) |
