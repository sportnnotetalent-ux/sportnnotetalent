# Store launch: your steps, starting now (30 Oct 2026)

**The plan:** a personal Google Play account and an individual Apple account. Neither needs the proprietorship. Do them in this order: the first one takes the longest to clear.

| # | Step | Your time | Then it waits |
|---|---|---|---|
| 1 | Google Play Console account | 20 min | 1–3 days for checks |
| 2 | Line up Android testers | 15 min | — |
| 3 | Apple Developer Program | 20 min | 1–2 days for checks |
| 4 | Firebase: the iPhone app file | 5 min | — |
| 5 | Firebase: reviewer sign-in + SMS countries | 10 min | — |
| 6 | Install Xcode | 10 min | 1–2 h download |
| 7 | Parental proof test, then delete the test child account | 25 min | — |
| 8 | New pictures on the social accounts | 20 min | — |
| 9 | Push the last commit | 1 min | — |

---

## 1. Google Play Console account (personal)
Use a computer.
1. Pick the Google account that will own the app. **I suggest sportnnote@gmail.com** rather than your personal Gmail, so the app isn't tied to your inbox. Turn on 2-Step Verification for it (myaccount.google.com → Security).
2. Go to **play.google.com/console/signup** and sign in with that account.
3. When asked who the account is for, choose **Yourself** (personal).
4. **Developer name:** `SportnNote`. This is the public name under the app.
5. **Payments profile:** create one as an **Individual**. Enter your legal name and home address exactly as on your ID.
6. **Contact email and phone:** your own. Google uses them and doesn't show them. Verify each with the code Google sends.
7. **Developer email** (shown publicly): `support@sportnnote.in`. The code arrives at sportnnote@gmail.com.
8. **Website:** `https://sportnnote.in`.
9. Answer the short questions about yourself and your app: a sports app, 1 app, distributed in India first.
10. Pay the **US$25** one-time fee. Indian cards need **international payments switched on** in your bank app.
11. When asked, **verify your identity** with a government photo ID. The name must match the payments profile.
12. **Phone check:**
    1. On the Play Console Home page, open the task **"Verify that you have access to an Android mobile device"** → **View details**.
    2. Scan the QR code with your Android phone (Android 10 or newer) to install the **Play Console** app.
    3. In the app, sign in, pick the account and tap **Verify**.

**Done when:** the Home page shows no verification tasks. **Tell me**, and I'll set up the app and upload the first build for the testers.

## 2. Line up 15–20 Android testers
Google needs **at least 12 people opted in for 14 days in a row** before the app can go public. Ask for 15–20, in case some drop out.
1. Ask friends, family and pilot players who have **Android** phones.
2. Collect the **Gmail address each person uses for the Play Store** (Play Store app → tap the profile picture at the top right).
3. Put them in a list and send it to me. I'll format it for the Play Console.
4. Message you can send on WhatsApp:

> Hi! SportnNote, the sports scoring app I'm building, is going on the Play Store. Google needs 12+ people to test it for 14 days first. Could you help? Send me the Gmail you use on your Android phone's Play Store. You'll get a link: join, install the app, keep it installed for 14 days and open it a few times. Please don't leave the test early, or your days won't count. Thank you! 🙏

The 14 days start when the first build is up (after step 1), not today.

## 3. Apple Developer Program (individual)
In India this works **only in the Apple Developer app** on an iPhone or iPad.
1. On your iPhone: **Settings → your name**. Check the name is your **legal name** and that **two-factor authentication** is on (**Sign-In & Security**).
2. Install the **Apple Developer** app from the App Store.
3. Open it → **Account** → sign in → **Enroll Now**.
4. Choose **Individual** (a sole proprietorship enrols as an individual). Use your legal name and home address exactly as on your ID, and not a P.O. box.
5. Scan your government photo ID when asked.
6. Pay **US$99 a year**. It's shown in rupees and charged to your Apple Account's payment method.
7. Wait for the **"Welcome to the Apple Developer Program"** email, usually 1–2 days. If developer.apple.com/account asks you to accept an agreement, accept it.

**If it says "Unable to Continue" or "not eligible":** don't make a new Apple Account. Contact Apple at **developer.apple.com/contact** → *Membership and Account* → *Program Enrollment*. Other Indian developers report this, and Apple support sorts it out.

**Note:** the App Store will show your **legal name as the seller**. The app's name stays SportnNote.

## 4. Firebase: the iPhone app file
1. Go to **console.firebase.google.com** → project **sportnnote-5c5e7** → ⚙ **Project settings** → **General**.
2. Under **Your apps**, click **Add app** → **Apple (iOS+)**.
3. **Apple bundle ID:** `in.sportnnote.app`, exactly. **App nickname:** `SportnNote iPhone`. Leave **App Store ID** empty.
4. Click **Register app**, then **Download GoogleService-Info.plist**.
5. Click **Next** through the remaining steps (skip the code steps) → **Continue to console**.
6. Put the file in the **sportfolio** folder, next to `google-services.json`, and tell me.

## 5. Firebase: reviewer sign-in and SMS countries
**A. A sign-in for Apple's and Google's reviewers.** They can't receive our text codes, so give them a test number that never sends one.
1. **Authentication → Sign-in method → Phone** → open **Phone numbers for testing**.
2. Add a **made-up** Indian mobile number: 10 digits starting with 6–9, not someone's real number. Add a **6-digit code** of your choice. **Save**.
3. Keep the number and code in your password manager. You'll type them into the reviewer notes later; there's no need to send them to me.
4. Set up the reviewer's profile once:
   1. Open a **private browser window** → **app.sportnnote.in** → sign in with mobile → enter the test number and code.
   2. Finish sign-up as an adult named **App Review** (e.g. born 1 Jan 1990).
   3. Optionally create one team and one friendly match, so reviewers see something.
   4. Close the window.

**B. Allow SMS only to India for now.**
**Authentication → Settings → SMS region policy** → **Allow** → **India** only → **Save**. We add other countries when we open there.

## 6. Install Xcode
For testing the iPhone app on this Mac while Apple checks your account. Your Mac (macOS 15.7, 378 GB free) is fine.
1. **App Store** on the Mac → search **Xcode** → **Get**. It's a big download.
2. Open Xcode once → **Agree** → when it asks which platforms to download, include **iOS**.
3. In Terminal, run this. It asks for your Mac password:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

4. Tell me. I'll build the iPhone app and test it in the simulator.

## 7. Parental proof test, then delete the test child account
The live database has one under-18 account: **"Sravan", born 2024**. It's the test account, so use it for this test first, then delete it. *If "Sravan" is really your own account with a wrong date of birth, fix the date in **Edit profile** instead of deleting it.*

You need three accounts, each in its own private browser window: **Sravan** (the child), a **parent** account (an adult account on an email you can open, new or existing), and **your support account** (the reviewer).
1. **As Sravan:** open **Edit profile** and check the parent/guardian email is the parent account's email. On **Home**, tap **Send the link again**.
2. **As the parent:**
   1. Open the email → tap the link → **Sign in** as the parent.
   2. Choose **Mother**, **Father** or **Legal guardian** and type a name.
   3. Add **two photos**: any pictures, **not real IDs**.
   4. Tap **Send for checking**.
3. **As Sravan:** the Home card should now say the documents are being checked.
4. **As support:**
   1. **Settings → Review verifications** → the parental-proof request.
   2. Open both files, tick the checks → **Approve**.
5. **Check:**
   - Sravan's Home card is gone.
   - The parent and Sravan both got a message.
   - The parent's **Settings → Parental approvals** shows it approved.
6. **Delete Sravan:** sign in as Sravan → **Settings → Delete account** → type `DELETE` → confirm.

Tell me anything that looked wrong or confusing.

## 8. New pictures on the social accounts
The files are in `sportfolio/docs/marketing/brand-kit/`. AirDrop them to your phone if you upload from there.
- **Instagram:** Profile → Edit profile → Edit picture → `profile-1080.png`.
- **Threads:** Profile → Edit profile → picture (it can import the Instagram one).
- **Facebook Page:** switch to the Page → profile picture `profile-1080.png`; cover `facebook-cover-1640x624.png`.
- **YouTube:** YouTube Studio → Customisation → Branding:
  - Picture → `profile-1080.png`;
  - Banner → `youtube-banner-2560x1440.png`.
- **X:** Profile → Edit profile → avatar `profile-1080.png`; header `x-header-1500x500.png`.
- **LinkedIn page:** Edit page → logo `linkedin-logo-400.png`; cover `linkedin-cover-1128x191.png`.

## 9. Push the last commit

```bash
cd ~/Desktop/rudy/sportfolio && git push origin feat/sport-formats-and-scoring main
```

---

**While you do these,** I prepare the store builds, listings, screenshots and review answers. When step 1 is done I upload the Android build for testers, and when steps 4 and 6 are done I test the iPhone app.
