# Stale "Live now" on Home; a person listed several times in the picker: break it (2026-11-04)

From the founder's phone: two quick tennis games (31 Oct, 1 Nov) still showed under Live now; Schedule Match listed "Abhra Chowdhury" three times.

| # | Failure | Status |
|---|---|---|
| SL1 | **Live now never drops an idle match on Home.** The 12-hour rule (`isStaleLive`, MVP L11) needs each match's last activity, but `home_feed` never returned `matches.updated_at`. | **Fixed:** `supabase/migrations/20261104120000_home_feed_updated_at.sql` re-creates `home_feed` from its newest body with `m.updated_at` added (nothing else); the app already reads it. Founder runs it. Test checks the newest definition. |
| DE1 | **One person, several chips.** People are unique (one player record per verified phone); a match's side is a one-person (or two-person) entry pointing at them, and the picker listed entries, so duplicate entries showed a person repeatedly. | **Fixed:** `onePerEntrant` (src/data/doublesPicker.ts) shows each person / pair once (any order); a side already picked stays; entries without a roster are left alone. Tests; simulation. |
| DE2 | **A double tap could create two entries for one person.** | **Fixed:** the entrant handler ignores a second tap while one is being made (`entrantBusy`). Test. |

Not changed: the duplicate entries already stored stay (harmless: every match through either one counts for the same person); a side never given a player keeps reading "Player A".
