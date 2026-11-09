# Founder: build the Talent database (first time)

Target: the Talent Supabase project `mjzywmnglxyijjebzfcj` (Mumbai) only. It
is empty today, so if anything goes wrong it can be wiped and rebuilt (step 6).
Never run any of this from the SportnNote folder.

What gets built: SportnNote's base schema (`supabase/schema.sql`), then every
migration in `supabase/migrations/` in date order, ending with
`20261117120000_talent_foundations.sql` (schools, licences, Talent roles, seat
caps, phone allow-list). All of it is tested together in `npm test` (PGlite);
it has never been run on a real Supabase project before, so stop at the first
error and send it over.

Not included: the cron/Vault scripts in `supabase/release/`, edge functions,
the sign-up hook and storage buckets. Those come with the app and login steps.

## Steps (Terminal)

**1. Go to the Talent folder and confirm the link**
```bash
cd "/Users/macbookpro/Desktop/rudy/SportnNote Talent"
```
```bash
cat supabase/.temp/project-ref
```
It must print `mjzywmnglxyijjebzfcj`. If not, stop.

**2. Base schema**
```bash
npx supabase db query --remote=mjzywmnglxyijjebzfcj -f supabase/schema.sql
```
No output, or an empty result, means it worked. Any `ERROR` line: stop and send it.

**3. See what the migrations will do (changes nothing)**
```bash
npx supabase db push --remote=mjzywmnglxyijjebzfcj --dry-run
```
It should list the migration files, ending with `20261117120000_talent_foundations.sql`.

**4. Apply the migrations**
```bash
npx supabase db push --remote=mjzywmnglxyijjebzfcj
```
Type `Y` when asked. It may ask for the database password: type it in the
Terminal, never in chat. Any `ERROR`: stop and send the whole message; the
files before it stay applied and are recorded, so a re-run continues after a fix.

**5. Check it worked (read only)**
```bash
npx supabase db query --remote=mjzywmnglxyijjebzfcj "select count(*) as talent_tables from information_schema.tables where table_schema = 'public' and table_name like 'talent_%'"
```
It should say `4`.

**6. If something went wrong**
Send the error first. The database is empty, so the fallback is a clean slate,
but `db reset` would replay the migrations without `schema.sql` first and fail
the same way, so the exact recovery commands depend on the error.

## After it's built
- Advisors: Supabase dashboard → Advisors → Security. Send any errors over.
- Nobody can sign in yet: login goes through the phone-login edge function and
  the sign-up hook, which are switched to the Talent allow-list in the next step.
