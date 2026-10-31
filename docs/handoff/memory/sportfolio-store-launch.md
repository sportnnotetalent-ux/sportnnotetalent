---
name: sportfolio-store-launch
description: "2026-10-30 plan change — sole proprietorship (not Pvt Ltd); go live NOW on Play Store + App Store with current version (SDK 56, 1.0.x), learn from marketing, iterate"
metadata:
  node_type: memory
  type: project
  originSessionId: dac368ef-8ce3-4d41-b4c5-d2930055ea8a
  modified: 2026-10-30T06:06:26.572Z
---

Founder 2026-10-30: company registration started as a **sole proprietorship** (a few days to finish). Wants Play Store + App Store live **right away** with the current app, then improve from marketing learnings. This supersedes "Pvt Ltd first" and "store accounts before Dec" in [[sportfolio-master-roadmap]] / [[sportfolio-international]].

Store rules checked 2026-10-30:
- **Apple:** a sole proprietorship must enrol as an **individual** (no D-U-N-S; seller name = founder's legal name). India enrolment via the Apple Developer app. Uploads need Xcode 26 / iOS 26 SDK (since 28 Apr 2026).
- **Google Play:** personal account ($25) → closed test with ≥12 testers opted in for 14 consecutive days before production. Organisation account needs a D-U-N-S (free, can take ~30 days) and skips that test. New apps must target API 36 (SDK 56 already does).
- Android developer verification for sideloaded APKs: enforced in BR/ID/SG/TH from 30 Sep 2026, global 2027. India not yet.

App facts: bundle/package `in.sportnnote.app`; iOS never built; needs GoogleService-Info.plist (Firebase iOS app). OTA script publishes only android/channel `preview`, so store builds need their channel covered. Reviewer sign-in: OTP-only UI, so use a Firebase test phone number with a fixed code. Block and report exist in messages; account deletion exists. Keep pilot users on the same signing key: upload the EAS key as Play's app signing key, so APK 41 users can update via Play and Firebase/App Links fingerprints stay valid.

**How to apply:** store prep is the top of my backlog. SDK 57 / 1.1.0 becomes the first store update after launch. Founder runs the account sign-ups and logins; I never enter passwords. Related: [[sportfolio-golive-lowcost]], [[sportfolio-status-2026-10-25]].
