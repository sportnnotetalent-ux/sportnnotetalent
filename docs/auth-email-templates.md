# Sign-in email templates (Supabase Auth)

*Set up 2026-10-26.* The app's password reset and email sign-in use a **6-digit code** (`verifyOtp`), not a link. Supabase's default templates only contain a link, so each template must show `{{ .Token }}`.

Emails go out through Resend. The settings are in Supabase → **Authentication → Emails → SMTP Settings**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a Resend API key named "Supabase Auth SMTP", with sending access for sportnnote.in |
| Sender | `no-reply@sportnnote.in`, name `SportnNote` |

Two problems we hit while setting this up:
- **Wrong port.** On another port, every request hung for about 10 seconds and failed with `504 Context deadline exceeded` (Auth logs). The app then showed "Something went wrong". Port 465 fixed it.
- **Waiting between requests.** Supabase refuses a second email to the same address within 60 seconds.

## Reset Password

Supabase → **Authentication → Emails → Templates → Reset Password**.

**Subject:** `Your SportnNote password reset code`

**Body:**
```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0E1116">
  <h2 style="margin:0 0 12px">Reset your SportnNote password</h2>
  <p style="margin:0 0 16px">Enter this code in the app to choose a new password:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:0 0 16px">{{ .Token }}</p>
  <p style="margin:0 0 16px;color:#555">The code expires soon. If you didn't ask to reset your password, ignore this email and your password stays the same.</p>
  <p style="margin:0;color:#888;font-size:12px">SportnNote · sportnnote.in</p>
</div>
```

## Magic link or OTP

This template is used by "sign in with an email code" (`signInWithOtp`).

**Subject:** `Your SportnNote sign-in code`

**Body:**
```html
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0E1116">
  <h2 style="margin:0 0 12px">Your SportnNote sign-in code</h2>
  <p style="margin:0 0 16px">Enter this code in the app to sign in:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:0 0 16px">{{ .Token }}</p>
  <p style="margin:0 0 16px;color:#555">The code expires soon and works once. If you didn't try to sign in, ignore this email — nobody can sign in without this code.</p>
  <p style="margin:0;color:#888;font-size:12px">SportnNote · sportnnote.in</p>
</div>
```

## Templates left as they are

- **Confirm signup:** only used once email confirmation is turned on (off for the pilot). When it is, follow `docs/email-verification.md`, which also requires `{{ .Token }}`.
- **Phone sign-in** (`phone-login`) makes its sign-in link on the server and sends no email, so the Magic link template doesn't affect it.
