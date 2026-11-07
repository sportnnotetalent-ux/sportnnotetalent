# Break it: launch voice (A2) and native splash (A3)

2026-11-06. Founder: "A2+A3 next". Both need native code (`expo-audio`, `expo-splash-screen`), so they take effect in the next app build (1.1.0, planned near go-live on branch `sdk57`). The runtime policy is `appVersion`, so phones on 1.0.0 (APK 41) keep receiving every over-the-air update from main, including this code.

| # | Break | Risk | Fix |
|---|---|---|---|
| LV1 | The voice plays every launch, on the web, with reduced motion, or when switched off. | Annoyance / a11y | `shouldPlayVoice`: full first-launch version only, phones only, not with reduced motion, respects the Settings switch. |
| LV2 | An over-the-air update with `import 'expo-audio'` reaches APK 41, which has no ExpoAudio native module. `requireNativeModule` throws at load and **the app crashes on open for every Android user**. | Crash | Never imported at the top of a file; loaded with `require` only after `requireOptionalNativeModule('ExpoAudio')` confirms it exists, inside try/catch. A test fails on any top-level import. |
| LV3 | The voice ignores the silent switch, or stops the user's music. | UX | `playsInSilentMode: false`, `interruptionMode: 'duckOthers'`. |
| LV4 | `expo-audio`'s config plugin declares background audio by default (iOS UIBackgroundModes audio + an Android foreground service). App Review rejects background modes an app doesn't use. | Store rejection | `enableBackgroundPlayback: false`, `enableBackgroundRecording: false`; checked with `expo config --type introspect` (no background modes). |
| LV5 | The plugin overwrites our microphone wording (used for voice scoring). | Review / privacy | `microphonePermission` passes our own text; a test checks it matches. |
| LV6 | A robotic machine voice ships as the brand sound. | Brand | The clip is a placeholder and `VOICE_CLIP_READY = false`, so nothing plays until the founder's recording replaces it. Both are JS and an asset, so they ship over the air. |
| SP1 | The splash doesn't match the animation's first frame, causing a jump. | Polish | Same green `#0D5A3F`, the same mark (`assets/splash-icon.png`), `imageWidth` 96 = the animation's mark size (tested). |
| SP2 | Holding the splash from code (`preventAutoHideAsync`) and failing to hide it leaves the app stuck on the splash. | Hang | Not used. The splash hides on the first React frame, which is the launch animation's identical first frame (tested: no `preventAutoHideAsync` anywhere). |
| LV7 | Installing expo-audio pulled expo-asset 58 (another SDK) to the top level, which broke the bundle, and bumped expo-asset and expo-constants patches. Their native parts in APK 41 would no longer match the over-the-air JS. | Crash | npm `overrides` pin expo-asset 56.0.17 and expo-constants 56.0.18 (the exact versions APK 41 has). Android and web exports build; a test checks the lock. |

**Checks:**
- `tests/launch-voice-splash.test.mts` (7);
- `expo config --type introspect`: no `UIBackgroundModes`, our microphone text;
- the placeholder clip is 1.06 s, AAC.

**Not checked yet:** sound and splash on a real phone. That needs the 1.1.0 build (or the iOS simulator once Xcode is in).

**2026-11-07 update — the AI voice, every launch.** The founder chose an AI voice (option 1: MiniMax Speech 2.8 HD via Figma Weave, `Deep_Voice_Man`, speed 0.85, pitch −1 — slow, smooth, deep). The clip is 1.75 s, AAC mono, 19 KB; `VOICE_CLIP_READY = true`. Founder: "First S:N should get displayed and then with voice Sport n Note."

| # | Break | Kind | Fix |
|---|---|---|---|
| LV8 | The voice starts before the S:N mark shows, because a slow font delays the animation by up to 1 s while the voice timer runs from the plan. | Timing | The voice timer starts in the same effect as the animation, `VOICE_AT_MS` = 600 ms after it (the mark is in at 580 ms). The timer is cleared if the animation is torn down. |
| LV9 | The voice runs past the end of the animation, talking over Home. | Polish | `VOICE_AT_MS + VOICE_MS` (600 + 1750) stays within `LAUNCH_FULL_MS` (2400), tested. |
| LV10 | Playing the voice every launch annoys people. | UX | The existing "Launch sound" switch turns it off; reduced motion never plays it; web never plays it. |

**Open:** confirm MiniMax/Weave commercial-use terms for the brand sound before the 1.1.0 build ships it.

**At the 1.1.0 merge with `sdk57`:** run `npx expo install --fix` so `expo-audio` / `expo-splash-screen` move to their SDK 57 versions.
