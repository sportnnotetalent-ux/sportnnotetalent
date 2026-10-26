# Go-live checklist (India pilot and other countries)

Everything the founder does by hand before or at go-live, in one place. Code work is not listed here; it ships through publishes. Tick items as you go.

## Before the India launch (11 Jan 2027)

- [x] **Daily ID-proof cleanup job.** Done 2026-10-12 (job 4, active). This deletes uploaded ID documents 30 days after they are reviewed, as the privacy policy promises.
  1. Supabase dashboard → project **sportfolio-staging** → **SQL Editor** → **New query**.
  2. Paste the block below and click **Run**. It should return one number, which is the job id.
  3. To check it worked: `select jobname, schedule from cron.job where jobname = 'privacy-retention';` should return one row.

  ```sql
  select cron.schedule(
    'privacy-retention', '30 3 * * *',
    $$ select net.http_post(
         url := 'https://mpgbvbylmkwasjgupsbq.supabase.co/functions/v1/privacy-retention',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'functions_anon_key'),
           'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
         body := '{}'::jsonb) $$
  );
  ```
- [x] **Firebase SMS budget alert.** Done 2026-10-26 (see step 8 below).
- [ ] **Test these on APK 41** (everything since APK 38; APK 41 already passed app links, mobile sign-in and PDF picking):
  - spoken voice scoring;
  - PDF printing;
  - Settings → Region with Dubai, London and Sydney;
  - phone numbers from other countries;
  - screen stays on while scoring, scoring buzz;
  - QR image arrives in WhatsApp.
- [x] **Fix the 2 phone numbers** listed by `select * from phone_review;`. Done 2026-10-13: both numbers removed (placeholder + duplicate); players kept.
- [x] **Turn on Cloudflare Web Analytics** (cookie-free; the privacy policy says so from 2026-10-13). Done: automatic setup, confirmed loading on the live site 2026-10-13. Cloudflare adds the script only for browsers, so a plain `curl` won't show it.
  1. Log in at dash.cloudflare.com and pick your account.
  2. Open **Workers & Pages** → the website project → **Metrics** tab → under **Web Analytics**, click **Enable**. Cloudflare adds its script to every page itself; no code change.
  3. Data shows under **Analytics & Logs → Web Analytics** within a few minutes.
  4. To check: on sportnnote.in, right-click → **View page source**, press Ctrl/Cmd+F and search for `cloudflareinsights`. "Found" means it is on.
  - Never turn on anything in Cloudflare that sets cookies or tracks visitors; the policy promises it doesn't.

## Low-cost go-live setup (added 2026-10-25)

All free, except SMS, which is already pay-as-you-go. Do them in this order. Steps 1 and 2 must be done **before** installing APK 41 (build 41; the failed attempt used 40).

- [x] **1. Android phone sign-in (Firebase).** *Fingerprints + Play Integrity done by the founder 2026-10-26; proven by the APK 41 sign-in test.* Add the APK's SHA-1 and SHA-256 fingerprints and enable the Play Integrity API. Exact steps: `docs/firebase-phone-setup.md` → "Android app". Without this, the mobile + code option on Android stops at "SMS sign-in isn’t set up".
- [x] **2. One-tap app links** (a shared app.sportnnote.in link opens in the app). *Done 2026-10-26: redirect exception + Worker route; `app.sportnnote.in/.well-known/assetlinks.json` returns 200 JSON; Google's Digital Asset Links check says `linked: true`; on APK 41 a WhatsApp link opened in the app. On the same install, mobile + code sign-in and PDF picking worked.* Android checks `https://app.sportnnote.in/.well-known/assetlinks.json` and won't follow a redirect, but app.sportnnote.in redirects everything to sportnnote.expo.app today. So:
  1. dash.cloudflare.com → **sportnnote.in** → **Rules**. Find the rule that sends app.sportnnote.in to sportnnote.expo.app and edit its filter (expression) to:
     `(http.host eq "app.sportnnote.in" and not starts_with(http.request.uri.path, "/.well-known/"))`
     If it is an old **Page Rule** (`app.sportnnote.in/*`), Page Rules can't make exceptions. Replace it with a **Redirect Rule**:
     - the expression above;
     - **Dynamic** target `concat("https://sportnnote.expo.app", http.request.uri.path)`;
     - 301;
     - **Preserve query string** ticked.
     Then delete the Page Rule.
  2. **Workers & Pages** → **sportnnote** (the website) → **Settings** → **Domains & Routes** → **Add** → **Route**: `app.sportnnote.in/.well-known/*`, zone `sportnnote.in`.
  3. After the next push to `main`, this should show a short JSON with `in.sportnnote.app` (status 200, no redirect):
     `curl -i https://app.sportnnote.in/.well-known/assetlinks.json`
  4. Install APK 41. Then Android **Settings → Apps → SportnNote → Open by default**: app.sportnnote.in should be listed as a verified link. Tap a match link in WhatsApp: it opens in the app.
- [x] **3. Nightly database backup.** *Done 2026-10-26: secrets added, first run green (the first try failed on `[ ]` left around the password; the workflow now says so plainly).* Add the two GitHub secrets and run it once by hand: `docs/ops/backups.md` → "Set it up". The Supabase free plan has no backups of its own.
- [x] **4. Password-reset emails for everyone (custom SMTP through Resend).** *Done 2026-10-26: code-based reset tested end to end by the founder.* Supabase's built-in mailer only delivers to the project team's own addresses, a few an hour. So "Forgot password" and email-code sign-in don't reach real users until this is set:
  1. resend.com → **API Keys** → **Create**: name "Supabase Auth", permission **Sending access**, domain `sportnnote.in`. Copy the key.
  2. Supabase → **Authentication → Emails → SMTP Settings** → **Enable custom SMTP**:
     - sender `no-reply@sportnnote.in`, name `SportnNote`;
     - host `smtp.resend.com`, port `465`;
     - username `resend`, password = the key.

     Save.
  3. **Authentication → Rate Limits** → emails sent per hour: **100**.
  4. **Templates:** the Reset Password and Magic link templates must show the 6-digit code (`{{ .Token }}`). Supabase's defaults only send a link. The ready-to-paste templates are in `docs/auth-email-templates.md`.
  5. Test "Forgot password" on the web app with an address that isn't on the Supabase team.

  *2026-10-26: SMTP set and the first reset email sent. On the wrong port every request timed out (504 "Context deadline exceeded"); port 465 fixed it. The friend's email held a link, not a code, so the templates were updated. Code-based reset then worked end to end.*

  Resend's free plan covers 3,000 emails a month (100 a day).
- [x] **5. support@sportnnote.in must reach you.** *Done 2026-10-26: Cloudflare rule support@ → sportnnote@gmail.com, test email arrived. The app, website, privacy policy and terms, and the server `SUPPORT_EMAIL` setting all use it now (web + OTA `05f9c106` from `e0c8527`).* The app and the API's "automated access" message tell people to write there. Cloudflare → **sportnnote.in → Email → Email Routing → Routing rules**: check `support@sportnnote.in` exists and forwards to your inbox. Send it a test email from another account. Once it works, the app can use it everywhere: set `EXPO_PUBLIC_SUPPORT_EMAIL=support@sportnnote.in` in `.env.local.bak`, set `contactEmail` in `website/config.json`, and tell me; it reaches people with the next publish.
- [x] **6. Uptime alerts (UptimeRobot, free).** *Done 2026-10-26: three monitors (website, app, server auth health), all green.* uptimerobot.com → free account → **New monitor**, type HTTP(s), every 5 minutes, alert by email. Three monitors:
  - `https://sportnnote.in`
  - `https://app.sportnnote.in`
  - Supabase: `https://mpgbvbylmkwasjgupsbq.supabase.co/auth/v1/health?apikey=<the anon key>`. Use the public anon key from `.env.local.bak` (`EXPO_PUBLIC_SUPABASE_…KEY`); it is the same key every browser already gets.

  Don't add a monitor on `/rest/v1/…`: the anti-scraping gate rightly blocks robots there.
- [x] **7. Google Search Console (free).** *Done 2026-10-26: Domain property verified (TXT record), sitemap submitted as the full URL `https://sportnnote.in/sitemap.xml` (a Domain property won't take just `sitemap.xml`); Google has discovered the guides.* search.google.com/search-console → **Add property** → **Domain** `sportnnote.in` → add the TXT record it shows in Cloudflare DNS → **Verify** → **Sitemaps** → submit `https://sportnnote.in/sitemap.xml`. The guides then show up in Google search sooner.
- [x] **8. Firebase SMS budget alert.** *Done 2026-10-26: "Alerts only" budget (the founder chose the amount), not "Spend cap enforcement", which would pause sign-in when hit. Protection against SMS abuse is the India-only SMS region policy.*

- [ ] **Expo SDK 57 upgrade: with the next new APK, not on its own.** Decided 2026-10-26. The Hermes memory regression `expo doctor` warns about affects only apps using reanimated/worklets, and we use neither. The upgrade needs a new APK and a version bump to 1.1.0 (runtime `appVersion`), after which older APKs stop getting updates. Bundle it with the Play Store release so users reinstall once. See DEVLOG 2026-10-25.

**Cheap paid items** (decide when ready):

| Item | Cost | Why |
|---|---|---|
| Supabase Pro | $25/month | Backups with one-click restore. No pausing. Higher limits. Needed before real school data at scale. |
| Google Play developer account | $25 once | Play Store listing, Play Integrity (no robot check), automatic updates. |
| sportnnote.com | about ₹1,000/year | `docs/international/domain-move-com.md` |
| Trademark (India, class 9 + 41) | ₹4,500 per class as a startup/individual | Protects the name before marketing spend. |

## Before opening to other countries

- [ ] **Company and store accounts** (planned before December):
  - Google Play developer account;
  - Apple Developer Program;
  - company legal name and address in the privacy policy (`src/data/legal.ts` placeholders).
- [ ] **Firebase SMS region policy.** Firebase console → **Authentication** → **Settings** → **SMS region policy** → **Allow**: IN, AE, QA, GB, SG, MY, AU, US. Today it should be India only.
- [ ] **Lawyer review:**
  - the international privacy policy and terms draft (`docs/international/legal-draft.md`, every item tagged LAWYER);
  - UK Online Safety Act scope;
  - Australia's under-16 social-media rule;
  - whether pending child accounts are auto-deleted;
  - confirm cookie-free Cloudflare Web Analytics needs no consent banner in the UK and EU.
- [ ] **Appointments:** a data protection officer (Singapore, Malaysia) and a UK representative.
- [ ] **US under-13s:** contract a COPPA parental-consent verification vendor. Until then, US under-13s can't sign themselves up.
- [ ] **School data agreements:** a template DPA with country add-ons (UK transfer addendum; US FERPA / state student-privacy terms).
- [ ] **.com domain:** buy it, then follow `docs/international/domain-move-com.md` step by step. .in keeps working forever.
- [ ] **Store listings** (draft answers are in `docs/international/audit/distribution.md`):
  - Play: mixed audience including children, data-safety form, account-deletion URL (`/delete-account/`);
  - App Store: privacy labels, age rating.
- [ ] **iPhone app:** phone sign-in and push need the Apple Developer account (APNs key) and a `GoogleService-Info.plist`. The React Native Firebase plugin stops an iOS build without it. Android sign-in and app links are in the low-cost section above.
- [ ] **Rules marked "verify":** confirm with organisers in each market. The app lets organisers change all of them:
  - walkover scores, ban lengths and tie-breaks for the new sports;
  - school age cut-offs (BSME/ESAA 31 Aug, Singapore A/B/C, US 1 Sep);
  - swimming yards ranges.
- [ ] **Payments**, if the small fee starts: currencies, store billing rules, tax. This is design only so far.
