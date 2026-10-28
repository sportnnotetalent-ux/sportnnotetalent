# Sign-up and sign-in test script

*Written 2026-10-26.* Run it after any change to sign-in or to Supabase Auth settings: about 10 minutes, with two accounts and an Android phone with APK 41.

**Automatic part (I run it before every publish):** `node scripts/auth-smoke.mjs`. It checks the live Auth settings the app depends on, and that every real error message turns into a clear one. It needs no inbox, creates no account and sends no email.

**Human part:** the steps below need a real inbox or phone. ✅ is what you should see.

| # | Path | Steps | ✅ Expect |
|---|---|---|---|
| 1 | **Email code sign-in** | Sign in → **Sign in with a code** → your email → **Email me a code** | Within about a minute an email from **SportnNote <no-reply@sportnnote.in>** with a big code (8 digits today). The box says **Code from the email**. |
| 2 | — | Type **every** digit → **Verify & sign in** | Signed in. |
| 3 | **Resend** | Right after sending, look at the links | **Resend code in 60s** counting down, then **Resend code**. |
| 4 | **Wrong code** | Type a wrong code | "That code didn't work. Type every digit from the newest email…" |
| 5 | **No account** | **Sign in with a code** with an email that has no account | "There's no account with this email — check the spelling, or tap Create account." |
| 6 | **Forgot password** | **Forgot password?** → email → **Send reset code** → code + new password → **Reset password & sign in** | Signed in. Sign out, then sign in with the new password. |
| 7 | **Mobile sign-in** (APK 41 or web) | **📱 Continue with your mobile number** → **Send code** → SMS → **Continue** | Signed in (a short "I'm not a robot" check is normal on the APK). |
| 8 | **Mobile, number not verified yet** | A number that's on an account but not verified | The explanation, plus **Forgot the password? Email me a sign-in code**, which opens step 1. |
| 9 | **New account** | **Create account** → mobile → **Text me a code** → type the code → **Verify mobile** → the rest of the form → **Create account** (adult) | "✓ Mobile verified", then signed in straight away. Profile shows the mobile as verified (no second text). An under-18 date of birth shows the parent/guardian fields. |
| 9a | **New account, no text** (once after the 2026-10-29 change) | **Create account** without tapping **Text me a code** | "Verify your mobile number first — tap “Text me a code”." If an account is made anyway, the **Before User Created** hook is off: Supabase → Authentication → Auth Hooks → turn it on (`public.hook_before_user_created`), and delete that account. |
| 10 | **Shared phone** | Sign out → sign in as a different person | No notifications or alerts from the previous person. |

Write down anything that differs from the ✅ and take a screenshot.

## Record of runs

- *(not run yet)*
