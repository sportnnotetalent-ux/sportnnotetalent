# Break-it: usage dashboard filters (2026-11-04)

Founder: filter the usage dashboard by **time period**, **sport** (pick several)
and **location** (pick several).

Design:
- Period presets: Today, Last 7 days, This week, Last 30 days, This month, Last 3 months, or Custom (from–to).
  The tiles show the whole period, the change against the period just before it (same length), and a trend in
  days (≤ 31 days), weeks (≤ 26 weeks) or months.
- Sport: games of those sports; people who play one of them (the sports on their profile).
- Location: cities from the app's city list. A person's city is their "Where are you based?" answer, otherwise
  their profile city. A game's city is its tournament's city, otherwise the city of the people running it (hosts,
  then scorers). "No city set" is an option, because many people haven't given one.
- Some numbers can't be split by sport or place. Links shared, sessions and crashes aren't tied to a sport or place,
  and installs that aren't signed in have neither. Those tiles say "All sports and places" while a filter is on.
  When a filter is on, active users count only signed-in people.
- New server functions: `usage_report` and `usage_report_people`. The v1 `usage_dashboard` / `usage_people` stay as
  they are, so app versions still on the old screen keep working.
Migration: supabase/migrations/20261109120000_usage_filters.sql.

| # | Break | Fix |
|---|-------|-----|
| UF1 | Anyone (or anon) reads filtered usage, or the list of places | Support / admin only (`not_allowed`), like v1 |
| UF2 | A huge or reversed range (year 1900 → 2100, from after to) slows or breaks the database | from ≤ to; at most 400 days; to no later than today; bad dates refused (`bad_range`) |
| UF3 | Junk filter values (unknown sport, SQL text, 10 000 cities) | Sports must look like a sport id; up to 30 sports and 50 cities; unknown values just match nothing |
| UF4 | A filter quietly changes what a number means (anon installs counted under "Hyderabad") | Unfilterable parts are left out under a filter, and the tile says so |
| UF5 | The drill-down lists ignore the filters, so the list doesn't match the number | `usage_report_people` takes the same period, sports and cities |
| UF6 | Minors' or private details leak through the places list | Places list = city names with counts only; lists keep v1's rules (no contact details, under-18 marked) |
| UF7 | The comparison period is wrong (Today vs "previous 1 day" on a month boundary, This month vs a shorter last month) | Previous = the same number of days just before `from`; the label names it ("vs previous 30 days", "vs yesterday") |
| UF8 | "Retention" means nothing for a 1-day period | Defined per person: of the period's sign-ups at least 7 days old, how many were active again 7–14 days after joining; "—" when none are old enough |
| UF9 | Times in UTC split an Indian evening | All days are Asia/Kolkata |

Tests: tests/usage-filters.test.mts (periods, buckets, tiles, summary), tests/db-usage-filters.test.mts
(UF1–UF9 on PGlite), tests/sim-usage-filters.test.mts (600 people, random filters: filtered counts add up to the totals).
