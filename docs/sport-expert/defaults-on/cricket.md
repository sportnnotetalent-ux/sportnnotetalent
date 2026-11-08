# Cricket: "Stats to track" ON by default + a clear finish for describe cards

Sports Rules Expert, 2026-11-08. Read-only audit of `src/sports/cricket/` against the founder's racket-sports change (every tap-to-describe option ON for a new match; a full-width Done/Skip with a "✓ Saved · summary" state, see `src/sports/describePanel.ts`, `docs/security/breaks/describe-done.md`).

Cricket is the hardest case: ~120 balls an innings, so anything that costs a tap per ball costs ~240 taps a T20. Every cricket capture card already sits **below** the pad and is replaced by the next ball (`index.tsx:1263-1265`, `:1338-1341`). Ignoring a card costs zero taps. So "tap-optional" here really is optional.

How a new match gets its settings: create screens seed `defaultsFor(formatFields)` (`src/sports/formatPick.ts:20-26`, e.g. `GuestGameScreen.tsx:48`, `CreateTournamentScreen.tsx:173`), and the toggles come from `LOCAL_RULE_FIELDS` (`rules.ts:277-328`, spread into `meta.ts:75`). Each ball also stamps the toggles in force on its record (`engine.ts:2144-2145`, `detail.ts:266-271`), so old balls stay honest.

## Toggles

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Wagon wheel (where each shot went) + shot type on dots/wickets | `wagonWheel` | OFF, `rules.ts:291` (and `STANDARD_RULES` `:98`) | (a) shot card under the pad on ~90% of balls (`index.tsx:1277-1330`); ignore it and it goes with the next ball | **ON** | The stat community players ask for first. Ignoring costs nothing, and the Stats tab says "N of M scoring shots tagged" (`MatchStatsView.tsx:440`), so a skip is never a false zero. |
| Pitch map (line & length) | `pitchMap` | OFF, `rules.ts:293` | (a) 6 length + 5 line chips in the detail card, every delivery (`BallDetailPanel.tsx:87-107`) | **ON** | Optional chips, and the tab shows "N deliveries tagged" (`MatchStatsView.tsx:377-380`). It also drives the bouncer-limit warning (`bouncers.ts`). |
| Shot control (beaten / edged) | `shotCtrl` | OFF, `rules.ts:294` | (a) in the UI (3 chips, `BallDetailPanel.tsx:108-115`), **but** an untagged ball counts as "in control" | **OFF for now**, ON once fixed (R1) | If it is ON and the scorer ignores the card, the batter gets Control 100% (`matchStats.ts:101-104, 240`) and enters the career "Best control %" table (`stats.ts:170-171`). That is a false perfect score. |
| Ball speed (speed gun) | `ballSpeed` | OFF, `rules.ts:295` | (c) a typed km/h with its own Save (`BallDetailPanel.tsx:116-125`), and it needs a speed gun | **OFF** | Same exception as tennis serve speed. Also, `trk.speed` alone makes the detail card open on every ball (`index.tsx:1338`). |
| Bowler type (pace / spin) | `bowlerType` | OFF, `rules.ts:296` | (a) one tap per bowler, not per ball, and free from the profile (`BallDetailPanel.tsx:138-170`, `index.tsx:1501-1504`) | **ON** | About 5 taps a match, and it powers "vs pace / vs spin". The cheapest stat in cricket. |
| Wide / no-ball reason | `extraWhy` | OFF, `rules.ts:298` | (a) 4 chips, only after a wide or no-ball (`BallDetailPanel.tsx:78-85`) | **ON** | Fires on ~5-10% of balls, and the stats say "tagged X of N" (`matchStats.ts:271`). |

These are **not** "Stats to track" (playing rules or organiser options with standard defaults), so leave them as they are: `phasePP`/`phaseDeath`/`bouncerMax` = 'auto' (`:300-318`), `reviews` = 0 (`:320`), `lastManStands` = 0 (`:325`).

Where to change them: the field `default`s (`rules.ts:291-298`) and `LOCAL_RULE_DEFAULTS` (`:330-332`, which today maps every TRACK_KEY to `false`, plus `wagonWheel` through `rulesToConfig(STANDARD_RULES)`). **Do not** change the replay fallbacks: `rulesFromConfig`'s `bool(c[k], false)` (`:143`) and `STANDARD_RULES.wagonWheel` (`:98`). See R2.

## Describe cards

1. **Shot card (wagon wheel)**, `index.tsx:1281-1330`. There are two variants: dot/wicket "the shot?" (`:1294-1308`) and scoring "where did it go?" (`:1309-1328`).
   - The finish is a small ghost **Done/Skip** at the top right (`:1299`, `:1313`). It is the same hard-to-notice spot as the old racket "Choose".
   - Both buttons call `setShotSkip(shotKey)`, and the card **vanishes**. There is no saved state. The scoring variant shows a "✓ zone · shot" meta line (`:1317`) before Done; the dot variant shows nothing.
   - **Apply the Done pattern:** a summary line, then a full-width Done (Skip when nothing is picked). Done greys the card to "✓ Saved · Cover drive · deep cover" with Edit. Skip hides it.
2. **Ball detail card** (length, line, false shot, speed, catch spot, wide/NB reason, bouncer chip), `BallDetailPanel.tsx:71-130`, mounted at `index.tsx:1343-1348`.
   - Same small ghost Done/Skip at the top right (`BallDetailPanel.tsx:75`). `onDone` sets `setDetailSkip(dKey)` and the card **vanishes**.
   - There is no summary line and no saved state. **Apply the Done pattern.**
   - Bug risk: the speed field has its own Save (`:121-122`). Tapping Done with a valid unsaved km/h drops it silently. Done should save a valid pending speed first.
3. **Two cards stack on one ball** (`index.tsx:1710-1711`): the shot card, then the detail card, each with its own Done. With the defaults ON this becomes the normal case, so the scorer would face 2 finishes per ball.
   - **Recommend one "Ball 4.3" card** with the shot section and the detail section, one summary and one Done.
   - Keys: `describePanel.panelMode` takes a numeric event id. Cricket keys are strings (`shotKey` `:1280`, `dKey` `:1336`), so either widen the map key or key by the log index. `shotSkip`/`detailSkip` hold only the last key (`:818`, `:820`). A `Map` per key, as in racket, keeps undo honest.
4. **Bowler type chips**, `BallDetailPanel.tsx:148-157`. These already have a saved state ("Name: Right-arm fast · Change"), and one tap both sets and closes. This is the model. No Done needed.
5. **Wicket flow optional chips** (substitute fielder `index.tsx:1124-1130`, 2nd fielder / direct hit `:1134-1150`). These sit inside the wicket confirmation, which already has a final confirming tap. No Done needed.
6. **Retire-at-N prompt**, "Not now" (`index.tsx:1249`). This is a rule prompt, not a describe card. Leave it.

## Risks

- **R1 False perfect from shot control.** An untagged ball faced counts as in control (`rules.ts:294` hint; `matchStats.ts:101-104`, `:361-362`, `:432-433`; career `stats.ts:170-174`). Keep it OFF until "tracked" means the card was finished with **Done** (Done with no chip = in control; Skip or ignored = not tracked). Then turn it ON. That needs a score-neutral `BALL_DETAIL` marker (e.g. `ok: true`), and old balls keep the current reading.
- **R2 Old-match replay.** Only flip the field defaults and `LOCAL_RULE_DEFAULTS`. Older matches have explicit `false` stored, because create screens seed every default. A config missing a key reads as OFF in `rulesFromConfig` (`rules.ts:143`), and per-ball `trk` (`engine.ts:2144`) keeps old balls as they were. Test: an old log replays byte-identical.
- **R3 Info shows ON while the match scores OFF.** `LiveScoringScreen.tsx:948` fills missing keys from the **new** field defaults. A match created before a key existed (e.g. pre-`extraWhy`) would show it ON in Info while the engine treats it as OFF. Fill missing track keys with `false` there, or read through `CRICKET_LIVE_SETTINGS.read` (`rules.ts:344-352`).
- **R4 The detail card on every ball.** With `pitchMap` ON, `dHas` is true for every delivery (`index.tsx:1338-1340`). This is fine because the card is non-blocking and below the pad, but on a small phone the wagon field and pitch chips stack tall. Merge the cards (Describe card 3) and let Done collapse them to one line.
- **R5 Bouncer warning ≠ bouncer count.** With the pitch map ON but untagged, "no warning" does not mean "no bouncers" (`bouncers.ts`). The warning text should not imply that the over is clean.
- **R6 Commentary wording.** Phrases come only from tags: `controlPhrase(undefined)` returns '' (`detail.ts:259`) and km/h appears only when set (`commentary.ts:373-378`). Safe. Keep it that way: never write "in control" for an untagged ball.
- **R7 Reset to standard.** `LiveSettingsCard.tsx:78` resets to `standardOf ?? f.default`. After the flip, a mid-match "reset" turns the captures ON from the next ball. That is acceptable (logged as SET_RULES with "Pitch map on", `rules.ts:246`), but say so in the hint.
- **R8 Tournament context.** `formatDefaults(..., 'tournament')` honours `tournamentDefault` (`formatPick.ts:26`). None is set for these keys, so tournaments get ON too. Confirm that this is wanted for school meets with a volunteer scorer.
