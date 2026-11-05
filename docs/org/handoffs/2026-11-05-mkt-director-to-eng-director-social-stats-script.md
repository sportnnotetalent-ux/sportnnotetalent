# Social stats script (read-only analytics for all platforms)
- From: mkt-director   To: eng-director   Opened: 2026-11-05
- Status: open
- Needed by: before the first posts are a week old (about 17 Nov 2026)

## What and why
The founder wants every platform's analytics connected right away (2026-11-05). Build `scripts/social-stats.mjs` per [marketing/analytics-setup.md](../marketing/analytics-setup.md) part 2: read-only insights from Meta (Instagram, Facebook), Threads, YouTube and LinkedIn, using keys the founder puts in `.env.analytics.local`; counts only into `docs/org/marketing/stats/log.md`.

Security writes the break-it list (token handling, read-only scopes, no personal data) — hand-off to sec-director.

## Done when
- The script runs with whichever platforms have keys, skips the rest with a clear line, never prints a key.
- Tests pass on recorded sample responses (no live calls in tests); quality mandate followed.
- The daily run can call it.

## Reply (the receiving Director writes here)
