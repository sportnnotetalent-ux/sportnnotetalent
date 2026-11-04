# Break-it: usage dashboard v1 (2026-11-06)

Founder: a dashboard to track how friends use the app. v1 (agreed): 8 numbers
with a weekly trend — games scored, weekly active users, new sign-ups,
activation (first game within 7 days), game finish rate, link shares → game
views, 1-week retention, crash-free sessions — plus games by sport and today's
counts. Lives in the support console; computed live from analytics.
Migration: supabase/migrations/20261107120000_usage_dashboard.sql.

| # | Break | Fix |
|---|-------|-----|
| UD1 | Anyone (or anon) reads the app's usage | `usage_dashboard` refuses everyone but support / admin (`not_allowed`); no table grants |
| UD2 | Personal data leaks (names, minors' activity) | Counts only — no names, ids or per-person rows in the reply |
| UD3 | A game "scored" with no scoring (walkover, quick result) or counted twice | Games scored = distinct completed matches with ≥ 1 scoring event |
| UD4 | Weeks in UTC split an Indian evening | Weeks start Monday in Asia/Kolkata, like the existing KPI views |
| UD5 | Rates divide by zero / show 0% for "no data" | A rate with no base is null ("—"), never 0% |
| UD6 | Huge ranges (p_weeks = 10 000) slow the database | 1–26 weeks |
| UD7 | Activation misses people who played but didn't score | Activated = scored, or on a side's roster of a game played, within 7 days of sign-up |
| UD8 | Sign-up source isn't recorded, yet the card claims "link → sign-up" | v1 shows shares and game views honestly; attribution is a listed follow-up |

Tests: tests/db-usage-dashboard.test.mts, tests/usage-kpis.test.mts, tests/sim-usage-kpis.test.mts.

| UD9 | Minors / people who chose "Essential only" are tracked as individuals | Unchanged: analytics links only consenting adults (analytics_actor). Sign-ups count everyone; activation and retention are "of people who share usage data", and the cards say so |
