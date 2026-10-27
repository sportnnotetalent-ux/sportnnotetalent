# SMS spend cap

*2026-10-27. Phone-number sign-in and number checks send a text through Firebase, about **$0.07 (≈ ₹6) per SMS** on the Blaze plan (`docs/firebase-phone-setup.md`). This page says what limits are in place, and how to add a hard stop if you want one.*

## What already limits spending

| Layer | Limit | Where |
|---|---|---|
| **Firebase, per project** | 3,000 SMS a day on plain Firebase Authentication (our setup). Worst case ≈ $210 a day. Upgrading to Identity Platform removes this ceiling, so don't upgrade without a reason. | Firebase's own limits |
| **Firebase, per IP and per number** | 50 an IP a minute, 500 an IP an hour, and a limit per phone number. Suspicious traffic gets throttled automatically. | Firebase's own limits |
| **SMS region policy** | Texts go to India only (add a country only when a market opens). This stops "SMS pumping" fraud to premium numbers abroad. | Firebase → Authentication → Settings |
| **Bot check** | The web app uses an invisible reCAPTCHA. The Android app uses Play Integrity, or a reCAPTCHA page when installed outside Google Play. | Firebase |
| **The app (new)** | One device asks for at most **5 codes a day**, and at most **3 for the same number**. The 60-second wait before "Resend" stays. Past a limit, the app says why and points to email sign-in. | `src/core/smsLimit.ts`, `smsBudget.ts` |
| **Budget alert** | Google Cloud emails you at 50%, 90% and 100% of the monthly budget (set 2026-10-26). It warns but **doesn't stop** spending. | Google Cloud → Billing → Budgets |

## Optional: a hard stop (about 20 minutes, once)

When the month's Firebase spend passes the budget, a small Cloud Function detaches billing from the Firebase project.
- **What stops:** the project falls back to the free Spark plan, and text-code sign-in pauses. The code doesn't arrive, and people use email sign-in instead.
- **What keeps working:** email sign-in, push notifications (FCM is free) and everything on Supabase.
- **Turning SMS back on:** re-attach billing (step 6).

The code is in `ops/gcp/sms-billing-cap/` and follows Google's documented "disable billing with budget notifications" approach.

1. **Google Cloud console**, the Firebase project (**sportnnote-5c5e7**) → **Billing → Budgets & alerts** → open the budget you made (or **Create budget**):
   - **Scope:** this project only.
   - **Amount:** what you're willing to spend on SMS a month, for example ₹2,000 (≈ 330 codes).
   - **Actions:** tick **Connect a Pub/Sub topic to this budget** → **Create a topic** named `billing-cap` → Save.
2. **Cloud Shell** (the `>_` button at the top of the console) — paste:
   ```bash
   git clone --depth 1 https://github.com/sportnnote-lgtm/sportnnote.git && cd sportnnote/ops/gcp/sms-billing-cap
   gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com cloudbilling.googleapis.com run.googleapis.com eventarc.googleapis.com
   gcloud functions deploy stop-billing --gen2 --runtime=nodejs20 --region=asia-south1 --source=. --entry-point=stopBilling --trigger-topic=billing-cap --set-env-vars=PROJECT_ID=sportnnote-5c5e7
   ```
   The repository is private, so `git clone` asks for your GitHub username and a token (the same as `git push`). Or upload the two files in that folder with Cloud Shell's **Upload** menu instead.
3. Note the **service account** the deploy prints (`…-compute@developer.gserviceaccount.com`).
4. **Billing → Account management** → **Show info panel** → **Add principal** → that service account → role **Billing Account Administrator** → Save. Google needs this role to detach billing. The function only ever detaches this one project.
5. **Test it once:**
   - Budgets → your budget → set the amount to the smallest value → wait for the next notification (a few hours) → check that **Billing** shows the project as "billing disabled".
   - Then do step 6 and put the amount back.
6. **To turn SMS back on later:** Google Cloud → **Billing → My projects** → sportnnote-5c5e7 → **Change billing** → pick the billing account.

## If someone floods the SMS anyway

1. Firebase → **Authentication → Usage** shows SMS sent per day. A jump without matching sign-ups means abuse.
2. Firebase → Authentication → Settings → **SMS region policy**: make sure only India (and live markets) are allowed.
3. To pause SMS at once: Firebase → Authentication → **Sign-in method → Phone → Disable**. Email sign-in carries on; asking for a text code just shows an error.
4. Later, with the next Android build: **Firebase App Check** with Play Integrity on the Identity Toolkit API, so only our real app can ask for codes.
