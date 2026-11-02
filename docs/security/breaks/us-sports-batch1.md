# US sports batch 1: offensive foul turnover, K looking / swinging: break it (2026-11-02)

Fixes 1 and 4 of the expert audit (`docs/sport-expert/us-sports.md`, rows "Offensive foul" and "Strikeout looking / swinging").

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

## What the rules / box scores say
- **Basketball (FIBA box score, NBA play-by-play):** an offensive foul is a personal foul (PF) **and** a turnover (TO) for the fouler.
- **Baseball / softball (OBR 9.15, box scores):** a strikeout is "K"; a called third strike is a strikeout **looking** ("KL", the backwards K), a swinging one a strikeout swinging.

## Failures

| # | Failure | Status |
|---|---|---|
| BB1 | **Offensive foul is not a turnover.** `eventCredits` / `foulAction` credit only `fouls`; TO and EFF are wrong for every offensive foul (player line, team panel `tov`, box score). | **Fixed:** `foulAction` stamps `tov: true` on an offensive foul and credits fouls + turnovers; `eventCredits` and the team panel (`deep.ts` tov) count it. tests/us-sports-batch1.test.mts BB1; tests/sim-us-sports-batch1.test.mts (600 games). |
| BB2 | **Old matches must keep their totals exactly.** Counting every `foulType: 'offensive'` as a turnover would change finished matches' TO / EFF on replay. Only a new foul stamped `tov: true` may count. | **Fixed:** only a stamped foul counts; an unstamped (older) offensive foul credits fouls only. tests/us-sports-batch1.test.mts BB2; tests/sim-us-sports-batch1.test.mts (600 games) replays every game as the old log: same score, fouls, turnovers as before. |
| BB3 | **The stamp must be trustworthy:** a `tov` payload on a non-offensive foul (hostile or buggy client) must not create a turnover. | **Holds (guarded):** the engine keeps `tov` only when it is literally `true` and the foul type is offensive. tests/us-sports-batch1.test.mts BB3. |
| BB4 | **Undo / Remove / Edit:** removing a stamped offensive foul must reverse the turnover too; editing it (remove + re-enter) must leave exactly one foul and one turnover; an old unstamped foul's removal must not take a turnover away. | **Fixed:** Remove reverses fouls -1, turnovers -1 (same `eventCredits`); an old foul's removal reverses the foul only; Edit re-enters through `foulAction` (one foul, one turnover). tests/us-sports-batch1.test.mts BB4; random Removes in tests/sim-us-sports-batch1.test.mts (600 games). |
| BB5 | **Live credit = statTotals:** the attribution the controls attach must equal what `statTotals` derives from the log (the SD-19 contract), so the line never drifts. | **Fixed:** the attribution is built from the same credit table; live sums equal `statTotals`. tests/us-sports-batch1.test.mts BB5; tests/sim-us-sports-batch1.test.mts (600 games). |
| BB6 | **Commentary** must say the offensive foul is a turnover ("Offensive foul on X · turnover") on stamped fouls only. | **Fixed:** "Offensive foul on X · turnover" on stamped fouls; an older one reads as before. tests/us-sports-batch1.test.mts BB6. |
| BB7 | **Points off turnovers** must not double-count: the offensive foul already opens the window (`deep.ts`), the stamp must not change that. | **Holds:** the possession window still opens once on the offensive foul (`deep.ts` unchanged there). tests/us-sports-batch1.test.mts BB7. |
| BS1 | **Quick-mode strikeout always logs swinging.** `buildPlay(s, 'K')` defaults `pitch: 'swinging'`, so a called third strike reads "strikes out swinging" (commentary, timeline). | **Fixed:** the quick pad sends `pitch: 'called'` for K looking, `'swinging'` for K swinging; the commentary and timeline already read `pitch`. tests/us-sports-batch1.test.mts BS1. |
| BS2 | **No strikeouts-looking figure** anywhere (career, match Stats tab), though pitch mode has always stored `pitch: 'called'`. | **Fixed:** `kLooking` (batter) on every K with `pitch: 'called'` (quick pad, pitch mode, voice "strikeout looking"); team Stats tab row "Strikeouts looking" (`teamSplit.kl`, shown only when recorded). Pitch-mode called Ks already in the log now count too (they were always stored as called). tests/us-sports-batch1.test.mts BS2; tests/sim-us-sports-batch1.test.mts (600 games). |
| BS3 | **Old K events keep reading as before:** an old quick-mode K (stored `swinging`, or no `pitch`) stays swinging; strikeouts totals unchanged. | **Holds:** `buildPlay(s, 'K')` still defaults to swinging; a K with `swinging` or no `pitch` reads swinging and has no kLooking; strikeouts unchanged. tests/us-sports-batch1.test.mts BS3. |
| BS4 | **Stats schema:** a new key a plugin writes must be declared on the baseball schema (SD-15 scan) and be in `LIVE_KEYS` (statTotals owns it). | **Fixed:** `kLooking` in `LIVE_KEYS`, declared in `stats.ts` (Batting, "Strikeouts looking", KL, no MVP weight) and in the Batting section after Strikeouts (hideZero). tests/us-sports-batch1.test.mts BS4; tests/stat-schema.test.mts SD-15 scan passes. |
| BS5 | **Live credit = statTotals / Undo:** the K-looking credit must ride on the action's attribution and be reversed by Remove (same `eventCredits`). | **Fixed:** the credit rides on the action (`withCredits` now passes `pitch`); Remove uses the same `eventCredits`. tests/us-sports-batch1.test.mts BS5; random Removes in tests/sim-us-sports-batch1.test.mts (600 games). |
| BS6 | **Hostile pitch value** on a K (e.g. `pitch: 'ball'`, a string not in the list) must never count as looking. | **Holds:** only `pitch === 'called'` counts; the reducer already drops unknown pitch values. tests/us-sports-batch1.test.mts BS6. |
| BS7 | **The tap count stays one:** K looking and K swinging are each one tap on the quick pad, the pad still fits its grid. | **Fixed:** "K swinging" and "K looking" are one tap each; "Other →" shrank to a quarter so the pad keeps two rows of four. tests/us-sports-batch1.test.mts BS7 (source check; not checked in the running app). |

## Follow-on breaks to check while fixing
- Old logs replay identically (both sports): same events, same totals.
- Other foul types and other baseball outcomes are unchanged.
- Voice ("strikeout looking") already sends `pitch: 'called'`; it must now count too.
