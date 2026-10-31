---
name: sportfolio-keyboard-safe-fields
description: The keyboard must never cover a field — new screens use KeyboardAwareScrollView, forms pin their action in KeyboardFooterLayout, sheets use useKeyboardSheet (src/components/keyboard.tsx)
metadata:
  type: feedback
---

On 2026-10-22 the founder, signing in on Android, found the keyboard sitting over the password box (typed blind) and asked for every field on Android, iOS and web to be sorted. Cause: Expo SDK 56 / RN 0.85 Android is edge-to-edge, so the window no longer resizes for the keyboard.

**Why:** a field you can't see while typing is a blocker, and Android modals report no keyboard events at all.

**How to apply:**
- A new screen's scroll root is `KeyboardAwareScrollView` from src/components/keyboard.tsx, not a plain ScrollView.
- A form's primary action (create / save / send) goes in `KeyboardFooterLayout`'s footer, not at the end of the scroll. It's pinned and rides on the keyboard, the top-app pattern the founder asked for on 2026-10-22.
- Custom inputs in a form spread `useFormField()` so keyboard "Next" / "Done" works.
- A pop-up sheet (Modal) with a text field uses `useKeyboardSheet(visible)` plus `<KeyboardSheetScope>`.
- A composer pinned under a list uses `KeyboardAvoidingBox`.
- Custom TextInputs spread `useKeyboardFocus()` so the reaction is immediate.
- Verify the native keyboard on a real phone via OTA; there is no emulator on this Mac. To check which update a phone is running, query `analytics_events.app_version` (read-only, live). It reads `1.0.0+<first 8 chars of the Android update id>`. An update only runs on the second app start.
- Android gotcha (fixed 2026-10-22): RN reports the keyboard's top from the screen top but `measureInWindow` from under the status bar, so subtract the status-bar height. Confirmed working on the founder's Android phone (update 01a16460).
- **Web gotcha (2026-10-24):** never set `keyboardDismissMode="on-drag"` on web. react-native-web blurs the focused input on ANY scroll event, including the browser scrolling the tapped field into view, so the keyboard opens and then shuts at once. KeyboardAwareScrollView now leaves it undefined on web. Test: a real tap (computer tool), not `el.focus()` from JS, because focus events don't fire in an unfocused pane. Web publish f83094d confirmed working on the founder's iPhone 2026-10-24.

Related: [[sportfolio-app-lifecycle]].
