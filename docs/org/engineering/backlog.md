# Engineering backlog

Statuses: `todo` / `doing` / `review` / `awaiting founder` / `done`. Check DEVLOG before marking anything open: many older items have shipped.
Seeded 2026-11-05 from `docs/HANDOFF.md` §4, `docs/sport-expert/PLAN.md`, DEVLOG and the code.

## Open
| Id | Title | Owner | Status | Links |
|---|---|---|---|---|
| ENG-001 | Per-tournament "verified players only" option (off by default; friendlies never gated). Then plan turning off `TESTING_ALLOW_UNVERIFIED` | eng-pm → eng-app + eng-backend | todo | HANDOFF §4.3; `src/core/eligibility.ts:45`; Security break-it needed |
| ENG-002 | Play app bundle (`.aab`) build + upload EAS signing key to Play | eng-release | awaiting founder | HANDOFF §4.4; needs Play organisation account (company + D-U-N-S) and build-credit yes |
| ENG-003 | First iPhone build: `supportsTablet` false, camera text, `ITSAppUsesNonExemptEncryption`, Firebase iOS plist | eng-app | awaiting founder | HANDOFF §4.4; needs Apple account + Xcode |
| ENG-004 | OTA for store builds on iOS (publish script covers Android only) | eng-app | todo | HANDOFF §4.4; **check** `publish-android-ota.sh` already does `production` for Android |
| ENG-005 | Rework `docs/launch/store-launch.md` from personal to company route | eng-pm | todo | memory "Store launch" 2026-11-01; **check** |
| ENG-006 | Result picture on phones (`react-native-view-shot` + `expo-sharing`), needs a native build | eng-app | todo | HANDOFF §4.4 ("possibly"); **check** |
| ENG-007 | 1.1.0 / SDK 57: rebase `sdk57` on the tip, App Check, EAS update code signing; ship with first store build | eng-app | todo | HANDOFF §4.6; DEVLOG 2026-10-27; never OTA from `sdk57` |
| ENG-008 | Cricket multi-innings, declaration, follow-on (CK-09) | eng-sports-rules → eng-app | todo | `docs/sport-expert/cricket.md` #4; PLAN.md:26 |
| ENG-009 | Cricket live-screen: strike swap prompt, Format line | eng-app | todo | PLAN.md:26 |
| ENG-010 | Softball DP / FLEX | eng-sports-rules → eng-app | todo | PLAN.md:26 |
| ENG-011 | Golf par / bogey competition (Rule 21.3) | eng-sports-rules → eng-app | todo | `docs/sport-expert/measured.md` #12 |
| ENG-012 | Rule details marked "verify" across `docs/sport-expert/*` | eng-sports-rules | todo | PLAN.md:26 |
| ENG-013 | Wave 2b follow-ups: push on a new request, Declined requests in Settings, Report on a request | eng-pm | todo | HANDOFF §4.6; **check** DEVLOG 2026-10-28 Waves 3A–3F |
| ENG-014 | iPhone universal links | eng-app | todo | HANDOFF §4.6; after ENG-003 |
| ENG-015 | Dark mode | — | awaiting founder | HANDOFF §4.6; DEVLOG ~line 1019 |
| ENG-016 | Fit the founder's illustrations into the UI when they arrive | eng-app + Design | awaiting founder | HANDOFF §4.5; **check** vs the "no drawn sport art" decision |
| ENG-017 | Remaining P1s in `docs/mvp/*.md` not covered by P1 batches | eng-pm | todo | **check** each audit against DEVLOG "mvp-p1-batch*" entries |
| ENG-018 | Re-create the 08:30 morning error check under the new account, if not running | eng-director | awaiting founder | HANDOFF §6; **check** |
| ENG-019 | Live fatal error (new 2026-11-06 20:27 IST): Android 1.0.0, Discover screen, `TypeError: Cannot read property 'icon' of undefined`, seen once, first time ever. Also: `scripts/error-triage.mjs` fails under the new account (`--linked`); the plain `--remote` read-only query works | eng-director → eng-app | todo | routed by cos 2026-11-07 from the daily error count (counts only) |

## Done (verified in DEVLOG, for reference)
| Id | Title | Where |
|---|---|---|
| — | P0 score bugs T1, B1, K1, K2 | DEVLOG (HANDOFF §4.1) |
| — | QT-04, QG-01, L8–L11 (loop audit) | DEVLOG; L11 ~line 495 |
| — | MVP P1 batches 1–6; rulebook Batches 1–6 | DEVLOG 2026-11-03; `docs/security/breaks/mvp-p1-batch*.md` |
| — | Rulebook audit fixes across 9 sports | DEVLOG 2026-11-08 Release |
| — | Squad sessions v1 + v2, team slots, group choice, usage dashboard + filters | DEVLOG 2026-11-05 → 11-08 |
| — | UI audit steps 1–7, round 5, stat leaders (#48) | DEVLOG 2026-11-09 |
