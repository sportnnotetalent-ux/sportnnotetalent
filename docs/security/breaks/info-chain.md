# The chain: Info shows every rule and every capture, in every sport: break it (2026-11-03)

**Founder rule (2026-11-02):** a match's Info holds every setting and every kind of stat the match captures → that is exactly what Scoring offers → what scoring captures is what Stats and Commentary show. Same chain in every sport. All seven sport-expert audits (`docs/sport-expert/PLAN.md`, shared breaks 1 and 2) found the first link broken everywhere.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| IC1 | **Info doesn't show the rules.** The Format row is a hand-written line (`formatLine`) that knows a handful of settings in some sports; most sports show "1-a-side" or "—" (pool, carrom, squash, padel, pickleball, chess, snooker …); deciders, tiebreaks, no-ad, sin-bin, rule sets are never shown. | **Fixed:** Info › "Rules & stats captured" lists every format field as label: value (the match's value, else its standard; `hideWhen` respected; raw keys never shown) for every sport (`src/sports/matchRules.ts`). Tests on all sports; 1,000 random and hostile formats per sport; demo-checked (tennis, pool, kabaddi). |
| IC2 | **Info doesn't show what the match captures.** The Scoring settings card (stats to track) is hidden from viewers in most sports and disappears after full time, so nobody can see which stats a match recorded. | **Fixed:** the same card lists every stats switch on or off (Scoring settings' toggles read from the match, plus stats switches among format fields), and the settings' other options as rules; shown to everyone, live and after full time. Tests; simulation; demo-checked (tennis: Point detail ✓, 1st / 2nd serve ✓, three off). |
| IC3 | **Stats switches in two places.** Edit format (Info) offers the same switches as Scoring settings, except a few named `track…`; the two can disagree, and switching one on in Edit format during a match replays it as on from the first point (volleyball attack efficiency inflated). | **Fixed:** Edit format leaves out every key Scoring settings owns (`liveOwnedKeys`), not just `track…` keys; the same people still edit them in Scoring settings. Test. |
| IC4 | **Cricket words everywhere.** The settings card says "Apply from next ball" / "Balls already bowled …" in tennis, volleyball, kabaddi, carrom, chess. | **Fixed:** the settings card says "Apply from the next point / ball / board / raid / rally / game" and "Points already played keep …" per sport (`settingsUnit`). Tests. |

## Follow-on breaks to check while fixing
- **Every sport:** the rules list covers every format field the match has (values from the match, else the field's standard), hides a field its `hideWhen` hides, never prints `undefined`, `NaN`, `[object …]` or a raw key, and never repeats a capture switch as a rule.
- **Old matches:** a format saved before a field existed reads that field's standard (what the engine plays it under).
- **Captures** list each stats-to-track switch on or off as the match has it now (event-mode settings from the match log, config-mode from the format), for everyone, live and after full time.
- **Nothing hidden that was editable:** a switch removed from Edit format is still editable in Scoring settings by the same people.
