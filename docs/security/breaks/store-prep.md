# Store prep (Play Store + App Store, current 1.0.x): break it (2026-11-01)

**Founder's plan (2026-10-30):** go live on both stores now with the current app (SDK 56), as a sole proprietorship: Play on a personal account (closed test, 12 testers × 14 days, then production) and the App Store as an individual.

**Process:** quality mandate step 4. Listed after reading the config and scripts and **before** any change.

| # | Failure | Status |
|---|---|---|
| SP1 | **Store builds would never get fixes.** `publish-android-ota.sh` publishes only to the `preview` channel (the APKs); store builds read `production`. | **Fixed:** `publish-android-ota.sh` publishes each update to `preview` and `production` (same bundle; `SKIP_STORE=1` for the APKs only). Test. |
| SP2 | **A store build and the APKs must take the same updates safely.** `runtimeVersion` follows the app version (1.0.0): a JS update is shared, so no update may need a native module only one build has. | **Holds:** one runtime (the app version, 1.0.0) for both; shipped JS already guards native modules the APK lacks (checked: location loads only via `requireOptionalNativeModule`, `src/core/location.ts`). Rule kept: a new native module means a new app version. Test. |
| SP3 | **A new signing key would strand the APK users.** If Play makes its own app-signing key, the 41 sideloaded APK users can't update in place, and the App Links and Firebase phone sign-in fingerprints stop matching. | **Your step (A3 in `docs/launch/store-launch.md`):** upload the EAS keystore as Play's app-signing key before the first upload. I never handle the keystore or its passwords. |
| SP4 | **The first iPhone build would fail:** Firebase on iOS needs `GoogleService-Info.plist` (an iOS app in Firebase) and static frameworks. | **Confirmed by a trial prebuild** ("Path to GoogleService-Info.plist is not defined"). **Your step B2:** the Firebase iOS app and its plist (+ APNs key); then I settle Firebase's iOS linking with a second prebuild. |
| SP5 | **iPhone review questions:** export compliance (encryption) and every permission string (camera, contacts, microphone, speech, location). | **Fixed:** `ios.config.usesNonExemptEncryption: false` (HTTPS only); all permission reasons present (Info.plist + plugins). Test; resolved config checked. |
| SP6 | **The reviewer can't sign in:** sign-in is a one-time code to a phone or email. | **Ready:** reviewers can use "Score a game now, no sign-up"; for sign-in, a Firebase test phone number with a fixed code (your step in section E). Review notes written. |
| SP7 | **Out-of-date store answers:** data safety and privacy labels written before guest scoring, the stats pushes and the nudge. | **Fixed:** section E adds guest scoring, the stats pushes / reminder and the viewer analytics to the existing answers; target-audience recommendation (13+) for you to decide. |
| SP8 | **No listing text** ready to paste (name, short and full description, keywords, what's new, reviewer notes). | **Fixed:** section C: name, short description (≤ 80), subtitle (≤ 30), full description, keywords (≤ 100), category, what's new, links. Tests check the limits. |

## Results
Full suite 6,146 tests, 0 failing; tsc clean. No simulation: configuration and documents only (no app behaviour changed).
