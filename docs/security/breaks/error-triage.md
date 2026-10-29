# Daily error triage: break it

**Process:** quality mandate step 4. These points were listed after the build and before any fix. Each fix then got its own failing test first (step 5).

**What is under test:**
- `supabase/functions/_shared/errorTriage.ts`, the labels: new / on an older version / noise;
- the daily email (`weekly-report`, `period: 'day'`), which now uses them;
- `scripts/error-triage.mjs`, which the morning check on the founder's Mac runs;
- the morning check itself, a scheduled Claude task (`sportnnote-morning-errors`).

| # | Attack or failure | Status |
|---|---|---|
| ET-01 | **Text in an error tells the morning check what to do.** Anyone can write error rows, even signed out (rate limited), so an error message could say "push this" or "run that". | **Bounded.** The task treats error text as data and never acts on it. It may only read the code, work in its own new worktree, run tests and commit there. It never pushes, publishes, deploys, writes the live database or sends anything. It reads the database only through the script's fixed query. |
| ET-02 | Someone writes fake errors with an old build's stack or a noise message, to hide them. | **Accepted.** That only hides their own fake rows. Real errors come from real browsers and phones. |
| ET-03 | A flood of fake errors pushes real ones out of the 500 the email reads (2,000 for the script). | **Accepted.** Signed-out writes are capped at 3,000 an hour in total, and a flood shows up as a jump in "new". Follow-up: group by message in the database. |
| ET-04 | The live app page can't be read, so nothing can be told apart by version. | **Holds:** nothing is marked older, everything shows as new, and the email says why (test). Errs on the side of looking. |
| ET-05 | A deploy lands between an error and the email, so an error from the build that was live then shows as "older" though the bug may still be there. | **Accepted.** The email says older ones matter only if they come back; if the bug is still there, it comes back as new. |
| ET-06 | **The noise rules hide real bugs.** "Unexpected token '<', "<!DOCTYPE"... is not valid JSON" is the app reading a web page as data. "Script error." recorded on the live build would count as new every day, because its stack is our own reporter's. | **Fixed:** only the bare script-load message with no build counts as noise; "Script error." is always noise (tests, from the live data). |
| ET-07 | Phone app errors can't be placed by build. | **Holds:** always new (test). Follow-up: compare the app version and update. |
| ET-08 | The morning check changes the founder's working copy (uncommitted work). | **Bounded.** It works only in its own worktree, on a new `fix/errors-<date>` branch. It never stashes, resets, checks out or commits in the main checkout. |

**500 users** (`tests/error-triage.test.mts`): a day of random errors from 500 users, every kind mixed. Every error lands in exactly one group, the right one, the counts add up and the email stays short.
