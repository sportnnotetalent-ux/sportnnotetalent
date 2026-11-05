# Engineering roadmap (2026-11-05 → early February 2027)

Priority order. Dates are targets. Items marked **check** need confirming before work starts.
Note: DEVLOG has entries dated up to 2026-11-09 (ahead of today, 2026-11-05). Trust DEVLOG's content, and **check** dates with the founder.

## 1. Keep the MVP loop at the bar (ongoing, every week)
- Watch the bar in `docs/product/MVP.md`: 0 wrong scores, link opens < 3 s, no match stuck "live".
- Any new P0 score bug jumps the queue. The four from HANDOFF §4.1 (T1, B1, K1, K2) are done.
- Source: `docs/product/MVP.md`; DEVLOG.

## 2. Per-tournament "verified players only" (target: 2026-11-30)
- Founder decided: friendlies never gated; a tournament can turn it on, off by default.
- Not built. `TESTING_ALLOW_UNVERIFIED = true` in `src/core/eligibility.ts:45`. Build the option before ever turning that off.
- Touches children + permissions: Security break-it needed.
- Source: `docs/HANDOFF.md` §4.3; code checked 2026-11-05; no DEVLOG entry found.

## 3. Store launch builds (target: when accounts exist; founder-blocked)
- Play `.aab` (production profile exists, DEVLOG line ~405) after the founder's Play **organisation** account.
- First iPhone build after Xcode: `supportsTablet` false, camera text, `ITSAppUsesNonExemptEncryption`, `GoogleService-Info.plist`.
- Upload the EAS signing key to Play so APK 41 users update in place.
- Blocked on company registration (Pvt Ltd, ~2 weeks from 2026-11-01) and D-U-N-S. `docs/launch/store-launch.md` was written for the personal route and needs rework for the company. **check**
- Source: `docs/HANDOFF.md` §4.4; memory note "Store launch" (2026-11-01); `docs/launch/`.

## 4. 1.1.0 / Expo SDK 57 (target: with the first store build)
- Ready on branch `sdk57` (`3f07fc2`, DEVLOG 2026-10-27). Ships with App Check and EAS update code signing.
- Never publish over-the-air from `sdk57`. Needs rebasing onto the current tip. **check** how far behind it is.
- Source: `docs/HANDOFF.md` §4.6; DEVLOG 2026-10-27.

## 5. Sport depth left from the rulebook batches (target: December 2026)
- Cricket: multi-innings, declaration, follow-on (CK-09); live-screen items (strike swap prompt, Format line). Cricket is outside the MVP's first seven sports, so after them.
- Softball DP / FLEX. Golf par / bogey (Rule 21.3).
- Rule details marked "verify" in `docs/sport-expert/*`.
- Source: `docs/sport-expert/PLAN.md` line 26; `cricket.md` #4; `measured.md` #12.

## 6. Requests and links follow-ups (target: January 2027)
- Wave 2b follow-ups: push on a new request, Declined requests in Settings, Report on a request. **check**: DEVLOG 2026-10-28 "Waves 3A–3F … plus the Wave 2b follow-ups" may have covered some.
- iPhone universal links (needs the iOS build; Android App Links are live).
- Source: `docs/HANDOFF.md` §4.6.

## 7. Founder's calls (not scheduled)
- Dark mode: light only until the founder decides (DEVLOG line ~1019).
- Fit the founder's illustrations when they arrive (`docs/design/illustrations.xlsx`), with Design. Note: the founder rejected drawn sport art; **check** scope.
