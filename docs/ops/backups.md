# Database backups

*Set up 2026-10-25. Free: GitHub Actions on the private repo. Workflow: `.github/workflows/db-backup.yml`.*

The Supabase free plan keeps **no backup we can download or restore from**. Until the Pro plan ($25/month, daily backups for 7 days), a GitHub workflow takes one every night:

- **When:** 02:00 India time, every night. It can also be run by hand.
- **What it saves:** three files made with the Supabase CLI, the method Supabase documents:
  - `roles.sql`
  - `schema.sql`
  - `data.sql`: every table, including sign-in accounts (`auth`)
- **Checks:** each file must be non-empty and must contain the players table. A `MANIFEST.txt` records the sizes, the checksums and the number of player rows.
- **Encryption:** the files are packed together and encrypted with AES-256 using a passphrase only the founder holds. The workflow checks that the copy decrypts before keeping it.
- **Storage:** an artifact on the workflow run.
  - Nightly copies are kept 35 days; Saturday's copy is kept 90 days.
  - The live database is about 22 MB, so a copy is well under 1 MB.
- **If it fails:** GitHub emails the account that owns the schedule.

## What is NOT in the backup

| Not included | Where it lives / how to recover |
|---|---|
| Uploaded files (photos, logos, verification documents) | Storage buckets. Today there are none. When there are, add a file backup or move to Pro. |
| Vault secrets (`functions_anon_key`, `cron_secret`, …) | Vault's root key isn't in any dump. Keep the secret values in the password manager. After a restore, re-create them with `vault.create_secret`. |
| Edge-function secrets (Resend, Firebase, FCM …) | `npx supabase secrets list` shows the names. Keep the values in the password manager. |
| Edge functions | Already in the repo: `supabase/functions/`. Redeploy with `npx supabase functions deploy`. |
| Cron jobs | They are in the dump (`cron.job` rows). They call functions through Vault secrets, so re-create those first. |

## Set it up (founder, about 10 minutes)

1. **The connection string.**
   - In the Supabase dashboard, open the live project → **Connect** (top bar) → **Session pooler** → copy the URI.
   - It looks like `postgresql://postgres.mjzywmnglxyijjebzfcj:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`.
   - Use the **session pooler**, not "Direct": GitHub's machines have no IPv6.
2. **The password.**
   - If you don't know the database password, go to **Project Settings → Database → Reset database password**. Nothing in the app or the functions uses it, so resetting is safe.
   - Put the password into the URI in place of `[YOUR-PASSWORD]`.
3. **The passphrase.**
   - Make a long random passphrase (30+ characters), for example with your password manager's generator.
   - Save it in the password manager as **"SportnNote backup passphrase"**. Without it, the backups can't be opened by anyone, including you.
4. **The secrets.** On GitHub, open `sportnnote-lgtm/sportnnote` → **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `SUPABASE_DB_URL`: the URI from steps 1–2;
   - `BACKUP_PASSPHRASE`: the passphrase from step 3.
5. **Test it now.**
   - Go to **Actions → Database backup → Run workflow** (branch `main`). It takes about 2 minutes.
   - A green run with one artifact `sportnnote-db-YYYYMMDD-HHMM` means it works.
   - Open the run's **Dump** step: the manifest shows a players row count close to the real number.

> The workflow only runs on its schedule from the default branch (`main`). Pushing a file under `.github/workflows/` needs a GitHub login with the **workflow** permission. If `git push` is refused with "refusing to allow … workflow", sign in again with `gh auth login` (or add the `workflow` scope to your token).

## Get a backup back (restore)

### 1. Download and decrypt (on the Mac, nothing to install)

Download the artifact from the run page (Actions → the run → Artifacts) and unzip it. Then, in Terminal, in the folder holding the file:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in sportnnote-db-YYYYMMDD-HHMM.tar.gz.enc -out backup.tar.gz
```

It asks for the passphrase. Then unpack it:

```bash
mkdir backup && tar -xzf backup.tar.gz -C backup
```

### 2. Restore into a NEW Supabase project (never over the live one)

This follows Supabase's guide ("Backup and restore using the CLI"). It needs `psql` (Postgres 17 client). The easiest way is a GitHub Codespace (free hours each month) or any Linux machine:

1. Create a new Supabase project. In it, turn on the same extensions as live: Database → Extensions (`pg_cron`, `pg_net`, `pgcrypto` and the others in our migrations).
2. Copy its session-pooler URI as in setup step 1.
3. Run:

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 --file backup/roles.sql --file backup/schema.sql --command 'SET session_replication_role = replica' --file backup/data.sql --dbname "<NEW PROJECT URI>"
```

4. Re-create the Vault secrets and the edge-function secrets, deploy the functions, and point the app's `EXPO_PUBLIC_SUPABASE_URL` / key at the new project. Moving the live app onto it is a separate, planned step.

**Known restore errors** (from Supabase's guide):
- `supabase_admin` permission errors: comment out the `ALTER … OWNER TO "supabase_admin"` lines in `schema.sql`.
- `cli_login_postgres` grant error: comment out `GRANT "postgres" TO "cli_login_postgres"` in `roles.sql`.

### 3. Practise once a quarter

A backup you have never restored is a hope, not a backup. Once a quarter, restore the latest copy into a throwaway project. Check that the player, match and tournament counts match live, then delete the project. Note the date here:

- 2026-10-26: decrypt test passed. The founder downloaded the first backup, decrypted it on the Mac with the saved passphrase, and listed all four files. This is not yet a full restore into a scratch project.

## When to move to Supabase Pro

Move before schools put real student data in at scale, or before the 11 Jan 2027 launch, whichever comes first. Pro adds daily backups (7 days) with one-click restore. Point-in-time recovery is an add-on. Keep this workflow running even then: it is an off-Supabase copy.
