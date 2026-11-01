# Play Store + App Store launch (current app, 1.0.x)

**Plan (founder, 2026-10-30):** go live on both stores now, as a sole proprietorship. Play on a personal account (closed test with at least 12 testers for 14 days in a row, then production); App Store as an individual (seller name = your legal name).

**Ready in code (2026-11-01):**
- `eas.json`: the `production` profile builds a Play app bundle (`.aab`) on the `production` update channel.
- `scripts/publish-android-ota.sh` now also publishes every update to the `production` channel, so Play builds get the same fixes as the APKs (same runtime 1.0.0, same bundle). `SKIP_STORE=1` publishes to the APKs only.
- `app.json`: iPhone export compliance answered in the build (`usesNonExemptEncryption: false`, HTTPS only); every permission has its reason (camera, contacts, microphone, speech, approximate location).
- A trial iPhone prebuild showed the one thing missing for an iPhone build: Firebase's `GoogleService-Info.plist` (step B2).
- Reviewers can try the app with no account at all ("Score a game now, no sign-up").

---

## A. Google Play (personal account)

**A1. Account.** Sign up at play.google.com/console (personal, $25), with identity verification. *(You.)*

**A2. Create the app.** All apps → Create app: name **SportnNote**, default language **English (India)**, **App**, **Free**. Accept the declarations. *(You.)*

**A3. Keep the same signing key (important).** So the APK users can update from Play in place, and App Links and Firebase phone sign-in keep working, Play must use the key EAS already signs with:
1. In a terminal: `npx eas-cli credentials -p android` → *production* → **Download the keystore** (it shows the passwords; keep them private, don't send them to anyone, including me).
2. Play Console → your app → Test and release → **App integrity → App signing** → *Use a different key* → **Export and upload a key from a Java keystore**, and follow its steps (Google's PEPK tool) with that keystore.
*(You. I never handle the keystore or its passwords.)*

**A4. The app bundle.** Tell me when A3 is done; I build it with `npx eas-cli build -p android --profile production` (on EAS; about 20 minutes) and give you the `.aab` link. *(Me, on your go-ahead: a store build uses EAS build credits.)*

**A5. Closed test (the 14-day clock).** Test and release → Testing → **Closed testing** → Create track → upload the `.aab` → add a testers list (at least **12** Google account emails: friends, players) → share the opt-in link. The clock starts once 12 have opted in; keep them in for **14 days in a row**. *(You.)*

**A6. Store listing.** Paste the texts in section C. Graphics: the icon (`assets/icon.png`, 512×512 export), a feature graphic (1024×500) and 4–8 phone screenshots (section D). *(You, with the texts here.)*

**A7. App content.** Answer with section E: privacy policy URL, app access (reviewer notes), ads (none), content rating, target audience, data safety, government app (no), financial features (none), health (no). *(You.)*

**A8. Production.** After the 14 days: apply for production access (Play asks a few questions about the test), then promote the build. *(You.)*

## B. App Store (individual)

**B1. Account.** Enrol in the Apple Developer Program as an **individual** through the **Apple Developer app** on an iPhone (India: about ₹8,700 a year). *(You.)*

**B2. Firebase for iPhone.** Firebase console → project → Add app → **iOS**, bundle id **`in.sportnnote.app`** → download **`GoogleService-Info.plist`** → put it in the project folder next to `google-services.json` (it's configuration, not a secret, like the Android one). Also add the **APNs key** (Apple Developer → Keys → new key with Apple Push Notifications; upload it in Firebase → Project settings → Cloud Messaging → Apple app) so phone sign-in and pushes work. *(You.)*

**B3. Tell me.** I add the file to `app.json`, rerun the iPhone prebuild to settle Firebase's linking on iOS, and prepare the build. The first iPhone build needs you at the keyboard once: `npx eas-cli build -p ios --profile production` asks you to sign in to your Apple account (EAS then makes the certificates). *(Me + you.)*

**B4. App Store Connect.** New app: SportnNote, bundle id `in.sportnnote.app`, SKU `sportnnote-ios`, primary language English (India). Fill it with sections C and E, add iPhone screenshots (6.9" and 6.5"), and submit for review after `eas submit -p ios`. *(You, with me preparing the submit.)*

---

## C. Listing text (paste as is)

**Name:** SportnNote

**Short description (Play, ≤ 80):** Score any match live from your phone. Friends follow from a link.

**Subtitle (App Store, ≤ 30):** Live scores for every game

**Full description:**

Score your game live from your phone. Everyone follows from one link, no app or sign-up needed, and the results, standings and player stats build themselves.

Made for real games: turf football on a Sunday, a badminton doubles after work, a kabaddi match at the ground, a padel court booking that runs out.

• Start in one tap. Pick a sport, name the sides (or don't), and start scoring. No sign-up needed to try it.
• Share a live link. Friends and family watch the score update live on WhatsApp, with no app.
• Every rule, done right: deuce and tiebreaks, golden point, side-out scoring, all outs and super tackles, halves and extra time. Change the format mid-game if you set it wrong.
• Finished? Share the result as a picture, with the player of the match. Every player gets their own stats.
• Run a tournament: add teams, make the fixtures, and the table fills itself.
• Your stats, your profile: goals, points, aces, raids, every match you play.

Sports: football, basketball, kabaddi, badminton, tennis, pickleball and padel, plus cricket, volleyball, table tennis, squash, hockey and many more.

Built in India for school, college and community sport. Free while we're new.

**Keywords (App Store, ≤ 100):** score,scoreboard,live score,football,badminton,kabaddi,tennis,padel,pickleball,tournament,stats

**Category:** Sports

**What's new (first release):** First release: score any match live, share the link, and get every player's stats.

**Links:** Privacy https://sportnnote.in/privacy/ · Terms https://sportnnote.in/terms/ · Delete account https://sportnnote.in/delete-account/ · Support https://sportnnote.in/support/ (support@sportnnote.in)

## D. Screenshots (take on your phone, from the live app)

1. Home with "Live now".
2. "Score a game" setup (the seven sports).
3. Scoring a badminton or tennis match (the big point buttons).
4. The shared live score page on a phone browser.
5. Full time: "Share the result" and "Play again".
6. A tournament table.

## E. Store answers

**Privacy policy:** https://sportnnote.in/privacy/

**App access (Play) / Review notes (Apple):**
> No account is needed to try SportnNote: on the first screen tap "Score a game now, no sign-up", pick a sport and score.
> To sign in: use the test phone number **[set in Firebase, step below]** with code **[fixed code]**, or the email option.
> Under-18 accounts need a parent's consent and proof; adults are not affected. Messaging for under-18s goes to their guardian.

Set the test number once: Firebase console → Authentication → Sign-in method → Phone → **Phone numbers for testing** → add one number with a fixed 6-digit code, and put both in the note above. *(You.)*

**Ads:** none. **In-app purchases:** none.

**Data safety (Play)** and **privacy labels (Apple)**: as in `docs/international/audit/distribution.md` §1b, plus these updates:
- **Guest scoring:** a game scored without an account stays on the phone and is sent to our servers only when the person signs up and saves it. Nothing new to declare (the same scores, once saved).
- **"Your stats" pushes and the play-again reminder:** push messages to the player's own device. Covered by Device or other IDs (push token) → App functionality, Developer communications.
- **Viewer analytics:** the existing first-party usage events (now also "opened / started / saved a game", with where they came from). Covered by App interactions → Analytics.

**Content rating:** users can interact (messages), shares location only as approximate and not stored, no gambling or violence. Expect Everyone / PEGI 3 with "Users interact".

**Target audience (decide):** the app has under-18 accounts (with parental consent) and school sport. Choosing an audience that includes under-13s puts it under Google's Families policy (we have no ads and a neutral age gate already; Firebase Auth and notifications need checking against the Families SDK list). **My recommendation:** 13 and over for this first release (the MVP is adults' community games), and revisit when schools are the focus.
