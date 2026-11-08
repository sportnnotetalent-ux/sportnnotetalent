# Sport row that doesn't scroll; "Pick from contacts" with no number — break it first

2026-11-08, founder (urgent), two bugs from real phones:

1. **Organize → Start a session → Sport.** The sport chips run off the right edge in one row and can't be scrolled, so only the first 3–4 sports can be picked (iPhone). The cause: the screen puts the shared `SportPicker` (a wrapping row) inside a second row container. Inside that, the picker has no width limit, so it never wraps. Create tournament nests it the same way.
2. **Invite a friend → Pick from contacts** (Android app). A friend picked a contact and got "No mobile number — That contact has no number saved". The cause: Android's picker grants access only to the picked contact's link. Reading its name and numbers is a separate query that needs the contacts permission, which the app never asked for. That read failed, the error was swallowed (`.catch(() => [])`), and the contact came back empty: no name, no number. The same picker is used in "Add / invite a player".

| # | Break | Kind | Fix |
|---|---|---|---|
| SR1 | The session sport row runs off-screen; badminton and the other 30 sports can't be reached. | Layout | `SportPicker` always takes the full width and wraps onto more lines, whatever it is placed in. The extra row wrappers in the session and create-tournament screens are removed. "More sports…" still opens the rest. Tested. |
| SR2 | The same nesting is lurking on any other screen. | Layout | The fix lives inside `SportPicker` (`width: '100%'`), so every screen gets it. Tested. |
| PC1 | A picked contact comes back with no name and no number (the permission-less read fails silently). | Function | When the first read fails or comes back empty, the app asks for the contacts permission once and reads again. Tested. |
| PC2 | The user says no to the permission. | Function | The message explains it: "Allow contacts access to pick a friend, or type their number below." No misleading "has no number saved". Tested. |
| PC3 | The contact really has no number. | Content | Only then: "<Name> has no number saved — type it below." Tested. |
| PC4 | Asking for the permission up front scares people off. | Privacy | It is asked only after they have picked someone, and only if the read needs it. Only that one contact is read; nothing is uploaded. Tested. |
