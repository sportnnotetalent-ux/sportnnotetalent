# Firebase SMS phone verification — setup (≈15 minutes, founder)

Why: Indian OTP SMS needs TRAI DLT registration (a registered business + ₹5,900).
Firebase sends the SMS under Google's registration, so phone numbers can be verified
now. Cost ≈ **$0.07 (≈₹6) per SMS** on the pay-as-you-go **Blaze** plan. Firebase is
only the SMS courier — our login stays Supabase. Works in the **web app** (iPhone
pilot) and, from APK 41, in the **Android app** (React Native Firebase — see below).

## Steps (Firebase console — https://console.firebase.google.com)
1. **Create a project** (or reuse the one planned for push notifications), e.g. "SportnNote".
   Google Analytics: optional (off is fine).
2. **Upgrade to Blaze** (Spark/free can't send SMS since Sept 2024) and immediately set a
   **budget alert** (Google Cloud → Billing → Budgets) — e.g. ₹1,000/month.
3. **Authentication → Get started → Sign-in method → Phone → Enable.**
4. **Authentication → Settings → SMS region policy → Allow only India** (plus any countries
   you need). Blocks SMS-pumping fraud to premium numbers abroad.
5. **Authentication → Settings → Authorized domains → Add** `sportnnote.expo.app`
   (`localhost` is there already for testing).
6. **Project settings → General → Your apps → Add app → Web (</>)** → name "SportnNote web"
   → copy the config values `apiKey`, `authDomain`, `projectId`, `appId`.

## Give the values to the app
Add to `.env.local.bak` (the live-keys file) — these are public web keys, not secrets:
```
EXPO_PUBLIC_FIREBASE_API_KEY=…
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=…firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=…
EXPO_PUBLIC_FIREBASE_APP_ID=…
```
And the server secret (after `npx supabase login`):
```
npx supabase secrets set FIREBASE_PROJECT_ID=<projectId> --project-ref mpgbvbylmkwasjgupsbq
npx supabase functions deploy verify-phone-firebase --project-ref mpgbvbylmkwasjgupsbq
```

## How it works (for reference)
Profile → contact card → mobile **Verify** → Firebase sends an SMS (invisible reCAPTCHA) →
user enters the code → app gets Firebase's signed ID token → `verify-phone-firebase` checks
Google's signature, freshness (≤10 min) and that the number matches the profile → sets
`phone_verified` (or the guardian's `phoneVerified`). The app can never set these itself.

## Android app (APK 41 onwards, 2026-10-25)

The APK uses React Native Firebase (`@react-native-firebase/auth`), so the mobile + code
option shows on Android too (`src/core/firebasePhone.native.ts`). Older APKs don't have
the native module; the option stays hidden there and email sign-in works as before, so
the over-the-air update is safe for everyone.

Founder steps (once, about 5 minutes), **before** testing APK 41:
1. Firebase console → project **sportnnote-5c5e7** → ⚙ **Project settings** → **General** →
   **Your apps** → the Android app **in.sportnnote.app** → **Add fingerprint**. Add both:
   - SHA-1 `A0:F3:C4:03:D9:88:B7:7D:AB:0A:F3:30:C3:ED:84:9D:D8:94:65:AD`
   - SHA-256 `BA:A5:3A:E6:77:82:46:EA:D5:0C:56:4B:E7:1F:D1:F1:CE:BA:A5:3B:AC:BA:92:48:BD:5B:B3:E7:7F:96:7D:05`

   (These belong to the EAS signing key; every APK from EAS uses the same key.)
2. Google Cloud console (same project) → **APIs & Services → Library** → search
   **Play Integrity API** → **Enable**.
3. Nothing to download: the app's `google-services.json` stays as it is.

How it behaves: an APK installed from outside Google Play can't use Play Integrity, so
Firebase opens a short "I'm not a robot" browser check before sending the SMS. That is
normal; once the app is on Google Play the check is mostly invisible. When the app moves
to Play App Signing, add Play's app-signing SHA-1 and SHA-256 here too (Play Console →
Setup → App signing).
