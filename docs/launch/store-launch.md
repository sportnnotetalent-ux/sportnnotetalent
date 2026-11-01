# Play Store + App Store launch (current app, 1.0.x)

**Plan (founder, 2026-11-01):** open both store accounts **in the company's name** once the Private Limited company is registered (about 2 weeks), rather than as a person. Why:
- the stores show the company as the seller, not your legal name;
- Play **organisation** accounts don't have the personal-account rule of a closed test with 12 testers for 14 days, so the launch date barely moves;
- no account or app transfer later.

*(This replaces the 2026-10-30 plan: a sole proprietorship with a personal Play account and an individual Apple account. Both stores change their rules from time to time; check the sign-up pages on the day.)*

**Ready in code (2026-11-01):**
- `eas.json`: the `production` profile builds a Play app bundle (`.aab`) on the `production` update channel.
- `scripts/publish-android-ota.sh` publishes every update to the `production` channel too, so store builds get the same fixes as the APKs (same runtime 1.0.0, same bundle). `SKIP_STORE=1` publishes to the APKs only.
- `app.json`: iPhone export compliance answered in the build (`usesNonExemptEncryption: false`, HTTPS only); every permission has its reason (camera, contacts, microphone, speech, approximate location).
- A trial iPhone prebuild showed the one thing missing for an iPhone build: Firebase's `GoogleService-Info.plist` (step 0.2).
- Reviewers can try the app with no account at all ("Score a game now, no sign-up").

---

## 0. Now, while the company is being registered (nothing here needs it)

**0.1. Company email.** An address on the domain, e.g. `apps@sportnnote.in`, for both store accounts and the D-U-N-S request (support@sportnnote.in works too). *(You.)*

**0.2. Firebase for iPhone.** Firebase console → project → Add app → **iOS**, bundle id **`in.sportnnote.app`** → download **`GoogleService-Info.plist`** → put it in the project folder next to `google-services.json` (it's configuration, not a secret, like the Android one). Tell me, and I add it to `app.json` and rerun the iPhone prebuild to settle Firebase's iOS linking, so the first iPhone build is ready to go. *(You, then me.)*

**0.3. Test phone number for review.** Firebase console → Authentication → Sign-in method → Phone → **Phone numbers for testing** → add one number with a fixed 6-digit code (it goes in the review notes, section E). *(You.)*

**0.4. Screenshots** (section D) and the **feature graphic** (1024×500). *(You.)*

**0.5. Testers anyway.** Not required for an organisation Play account, but 10–20 people trying the store build before launch is the cheapest feedback there is: line up their Google account emails. *(You.)*

## 1. The day the company is registered

**1.1. D-U-N-S number.** Both stores need it for a company. It's free: request it through Apple's D-U-N-S look-up (developer.apple.com → Enroll → organisation → "check D-U-N-S") or directly from Dun & Bradstreet India, with the company's **legal name exactly as registered**, its registered address and your company email. It can take from a few days to about a month, so request it the same day. *(You.)*

**1.2. Website.** Both stores check that the company has a website; sportnnote.in is live. Add the company's legal name to its footer (I can do that when you tell me the exact name). *(You tell me the name; I update the site.)*

## A. Google Play (organisation account)

**A1. Account.** play.google.com/console → **Organisation** account ($25), with the D-U-N-S number, the company's legal name and address, your company email, and your own ID as the authorised person. Verification can take a few days. *(You.)*

**A2. Create the app.** All apps → Create app: name **SportnNote**, default language **English (India)**, **App**, **Free**. Accept the declarations. *(You.)*

**A3. Keep the same signing key (important).** So the APK users can update from Play in place, and App Links and Firebase phone sign-in keep working, Play must use the key EAS already signs with:
1. In a terminal: `npx eas-cli credentials -p android` → *production* → **Download the keystore** (it shows the passwords; keep them private, don't send them to anyone, including me).
2. Play Console → your app → Test and release → **App integrity → App signing** → *Use a different key* → **Export and upload a key from a Java keystore**, and follow its steps (Google's PEPK tool) with that keystore.
*(You. I never handle the keystore or its passwords.)*

**A4. The app bundle.** Tell me when A3 is done; I build it with `npx eas-cli build -p android --profile production` (on EAS; about 20 minutes) and give you the `.aab` link. *(Me, on your go-ahead: a store build uses EAS build credits.)*

**A5. Internal test first.** Test and release → Testing → **Internal testing** → upload the `.aab` → add your testers (0.5) → share the link. A few days of real use catches what we missed. *(You.)*

**A6. Store listing.** Paste the texts in section C. Graphics: the icon (`assets/icon.png`, 512×512 export), the feature graphic and 4–8 phone screenshots (section D). *(You, with the texts here.)*

**A7. App content.** Answer with section E: privacy policy URL, app access (review notes), ads (none), content rating, target audience, data safety, government app (no), financial features (none), health (no). *(You.)*

**A8. Production.** Promote the build to **Production** and send it for review (usually a few days for a new app). *(You.)*

## B. App Store (organisation)

**B1. Account.** Enrol in the Apple Developer Program as an **organisation** (the Apple Developer app or developer.apple.com/enroll) with the D-U-N-S number, the company's legal name, the website and your company email; Apple may phone you to confirm you can sign for the company. About ₹8,700 a year. *(You.)*

**B2. Push key.** Apple Developer → Keys → new key with **Apple Push Notifications service** → upload it in Firebase → Project settings → Cloud Messaging → your iOS app, so phone sign-in and pushes work on iPhone. *(You.)*

**B3. The first iPhone build.** It needs you at the keyboard once: `npx eas-cli build -p ios --profile production` asks you to sign in to your Apple account (EAS then makes the certificates). *(Me + you.)*

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
> To sign in: use the test phone number **[the test number from step 0.3]** with code **[fixed code]**, or the email option.
> Under-18 accounts need a parent's consent and proof; adults are not affected. Messaging for under-18s goes to their guardian.

The test number and code are from step 0.3.

**Ads:** none. **In-app purchases:** none.

**Data safety (Play)** and **privacy labels (Apple)**: as in `docs/international/audit/distribution.md` §1b, plus these updates:
- **Guest scoring:** a game scored without an account stays on the phone and is sent to our servers only when the person signs up and saves it. Nothing new to declare (the same scores, once saved).
- **"Your stats" pushes and the play-again reminder:** push messages to the player's own device. Covered by Device or other IDs (push token) → App functionality, Developer communications.
- **Viewer analytics:** the existing first-party usage events (now also "opened / started / saved a game", with where they came from). Covered by App interactions → Analytics.

**Content rating:** users can interact (messages), shares location only as approximate and not stored, no gambling or violence. Expect Everyone / PEGI 3 with "Users interact".

**Target audience (decide):** the app has under-18 accounts (with parental consent) and school sport. Choosing an audience that includes under-13s puts it under Google's Families policy (we have no ads and a neutral age gate already; Firebase Auth and notifications need checking against the Families SDK list). **My recommendation:** 13 and over for this first release (the MVP is adults' community games), and revisit when schools are the focus.
