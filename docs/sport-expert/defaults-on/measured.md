# Defaults ON: measured family (golf, athletics, swimming, cycling, rowing, canoe, archery, shooting, weightlifting)

Sports Rules Expert, 2026-11-08. Read-only review. The question: should the racket-sport change (every "Stats to track" option ON for new events, plus a clear **Done** on every describe card) carry over to the measured sports?

**Short answer.** The measured family differs from racket sports. Most of its "Stats to track" options are **typed times that need timing gear**: reaction times, lap times, take-overs, chip times and intermediate times. They are the same kind of thing as the tennis serve speed the founder left OFF, so they stay OFF. The tap-only options are golf's six hole-card chips, archery's team arrows per archer and weightlifting's jury line. Those go ON. Two options change the main entry or the score (weightlifting's lights and shooting's −2 button), so they stay OFF. The one technical trap: the precision switches fall back to their rule default on old events, so flipping that default would change events that already have results (see Risks R1).

Cost key: **(a)** tap-optional, never blocks the next entry. **(b)** blocking or changes the main entry. **(c)** typed, or needs equipment.

Where the toggles live:
- **Timed races (meet level):** `src/sports/<sport>/meta.ts` (group "Stats to track"). These are written into `tournament.formats[sport]` at creation by `formatDefaults` (`src/sports/formatPick.ts:20-30`) and read by `raceTracking` (`src/data/results/raceDepth.ts:65-77`). Each event can override them with `EventTrackCard` (`src/components/results/EventTrackCard.tsx`).
- **Precision sports:** competition rules in `src/data/results/precisionRules.ts`, read with `ruleOf` (`competitionRules.ts:369`).
- **Golf:** `src/sports/golf/track.ts`. The round's `format.track` is set at `GolfRoundSetupScreen.tsx:70,325-335`. When it is absent, each marker's phone setting applies (`GolfRoundScreen.tsx:74`, default `[]`).

## Golf

Today every golf toggle is **OFF**: setup starts with `track = null` (`GolfRoundSetupScreen.tsx:70`), and that falls back to the phone setting `[]`. All taps sit in `GolfHoleStats.tsx`, and its own header says nothing there is required (`:1-6`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Putts | `putts` (`track.ts:20`) | OFF | a. Chips 0–4 per player (`GolfRoundScreen.tsx:477-491`) | **ON** | One tap after the score. It gives GIR, scrambling and putts per round; markers already count putts. |
| Fairways | `fairway` (`track.ts:21`) | OFF | a. ◀L · ✓ · R▶, par 4/5 only (`GolfHoleStats.tsx:53-61`) | **ON** | One tap, and the marker watched the tee shot. |
| Bunkers | `bunker` (`track.ts:22`) | OFF | a. One chip (`GolfHoleStats.tsx:78`) | **ON** | Tap only when it happened; an untapped chip just means "not in a bunker" for sand saves. |
| Up and downs | `upDown` (`track.ts:23`) | OFF | a. 1 · 2 · 3+ chips, hidden on a GIR (`GolfHoleStats.tsx:93-101`) | **ON, but see R3** | Tap-only. It shows on every hole when putts are skipped, and it writes `chipIns: 0` and `udChances: 0` (`engine.ts:681`). |
| Penalties | `penalties` (`track.ts:24`) | OFF | a. "Pen 0" stepper (`GolfHoleStats.tsx:79-82`) | **ON** | One tap when a penalty happens; nothing to do otherwise. |
| First-putt length | `firstPutt` (`track.ts:25`) | OFF | a. Four bucket chips, shown only after putts ≥ 1 (`GolfHoleStats.tsx:85-91`) | **ON** | The buckets are eyeballed (inside 3 ft … 20 ft+), with no measuring. |
| Driving distance | `drive` (`track.ts:26`) | OFF | **c.** Typed yards or metres (`GolfHoleStats.tsx:62-75`), needs a rangefinder or pacing | **OFF** | Same as tennis serve speed: a typed value that needs equipment. Organisers turn it on for long-drive holes. |

How to apply this: seed the round's **setup** state with the six tap keys (`GolfRoundSetupScreen.tsx:70`, `null` → `['putts','fairway','bunker','upDown','penalties','firstPutt']`). Do **not** change the phone fallback `[]` (`GolfRoundScreen.tsx:74`). Old rounds without `format.track` read that fallback, so changing it would change rounds already in play (R2).

## Athletics

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Reaction times | `reaction` (`athletics/meta.ts:49`) | OFF | **c.** A typed box on every row, not folded (`ResultsEventScreen.tsx:870-871,1182-1193`). Needs a start-information system. | **OFF** | No school or community meet has false-start blocks. The box would sit empty on every row. |
| Lap times | `lapSplits` (`meta.ts:50`) | OFF | **c.** Typed, folded behind "＋ Splits" (`ResultsEventScreen.tsx:857-862`). Needs a lap timekeeper. | **OFF** | One stopwatch per lane at the finish is the norm; nobody reads laps. |
| Lap points | `lapPoints` (`meta.ts:53`) | `finish` | n/a (a choice) | keep `finish` | Only matters when lap times are on. |
| Relay leg times | `relayLegs` (`meta.ts:57`) | OFF | **c.** Typed changeover times. Needs a timer at each exchange. | **OFF** | Needs a timekeeper at every changeover. |
| Chip times (road) | `chipTimes` (`meta.ts:58`) | OFF | **c.** Typed in RoadFinishCard (`ResultsEventScreen.tsx:773`). Needs chip mats. | **OFF** | A road race without chip timing has nothing to type. |

Wind (`def.wind`, `ResultsEventScreen.tsx:729-730,1419-1421`) is part of the result for records, not a "Stats to track" option. Leave it as it is.

## Swimming

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| 50 m splits | `splits` (`swimming/meta.ts:48`; also competition rule `competitionRules.ts:226`) | **ON** | c, but folded behind "＋ Splits" (`ResultsEventScreen.tsx:857-862`), so tap-optional in practice | **keep ON** | It has been on since SD-94 and costs one hidden chip. It is the model for typed depth: ON but folded. |
| Reaction times | `reaction` (`meta.ts:49`) | OFF | **c.** A typed box on every row. Needs touchpads. | **OFF** | Manual-timing pools have no pads. |
| Relay take-over times | `takeovers` (`meta.ts:50`) | OFF | **c.** Three typed boxes, always visible (`RaceDepth.tsx:198-225`). Needs pads. | **OFF** | Needs pads, and a wrong reading prompts a DQ (SW 10.13, `measuredDepth6.ts:111-117`). |

## Cycling

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Intermediate times | `cycSplits` (`cycling/meta.ts:28`) | OFF | **c.** Typed, folded behind "＋ Splits". Needs lap or time-check timing. | **OFF** | Community time trials time the finish only. |

## Rowing / Canoe sprint

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| 500 m splits (rowing) | `splits` (`rowing/meta.ts:36`) | OFF | **c.** Typed, folded. Needs timers on the bank at 500 m marks. | **OFF** | School regattas time the finish line only. |
| Intermediate times (canoe) | `splits` (`canoe/meta.ts:36`) | OFF | **c.** As for rowing (every 250 m). | **OFF** | Same reason. |

Note: crew splits are also stamped per phase at creation (`f.splits`, SD-99; `raceDepth.ts:153,192`), so the meta default only reaches new phases.

## Archery

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Arrows per archer in team matches | `archTeamArrows` (`precisionRules.ts:95`) | OFF | a. **No extra taps.** The same arrows are keyed in archer order (`ArcheryPanel.tsx:215,281,430-435`), and it turns itself off when team lists are incomplete (`:281`). | **ON (via R1 route)** | The team score is the same either way, and each archer gets their own average, 10s and X. The hint line (`:435`) tells the scorer the order. |

Ranking-round depth (10s, X, 9s, best end, penalty points: `archery/stats.ts:50-69`) comes free from the arrow keypad. There is nothing to switch on.

## Shooting

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Penalties (−2 button in view) | `shootPen` (`precisionRules.ts:77`) | OFF | Tap-optional, but it **changes the score**: −2 on each series or final shot (`ShootingPanel.tsx:46,149-152,178,229`) | **OFF** | This is a result control, not a stat. A stray tap costs 2 points. The −2 is always reachable behind ⋯ (`ShootingPanel.tsx:86`). |

## Weightlifting

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Referees' lights | `wlLights` (`precisionRules.ts:25`) | OFF | **b.** Replaces the one-tap Good lift / No lift with three light taps plus a confirm on **every** attempt (`LiftingPanel.tsx:154,212-232`) | **OFF** | School meets often have one referee. The "3 lights" chip (`:235`) already gives lights for any single attempt. |
| Jury reversals in view | `wlJury` (`precisionRules.ts:31`) | OFF | a. Adds a "Last: Sn 2 · Asha 87 kg — good lift · ⚖ Jury reverses" line, and a reversal asks to confirm first (`LiftingPanel.tsx:256-275`) | **ON (via R1 route)** | That "Last: …" line is the visible saved state of the previous attempt, which is exactly what the founder asked for. The confirm makes a stray tap safe. |

Bodyweight, the clock, Sinclair and Robi are rules or results, not stats to track. They are unchanged.

## Describe cards

The measured sports have no tap-to-describe card like the racket `PointDetailRow`. These are their follow-up prompts:

1. **Golf hole stats rows** (`GolfHoleStats.tsx`, rendered at `GolfRoundScreen.tsx:496-501`). **Clear finish:** yes. "Next: hole N ▶" (`GolfRoundScreen.tsx:527`) moves on, and the hole dots mark played holes (`:418`). **Saved state:** chips stay lit. No Done needed. If R3 is fixed, consider a quiet "✓ Saved" next to each player's name once their score is in.
2. **Splits / lap times** (`SplitsField`, `ResultsEventScreen.tsx:1245-1273`, opened from "＋ Splits" at `:857-862`). **Clear finish:** no. It saves on blur and has no fold. Once a split is saved it stays open for good (`:859`, `r.splits?.length`), so a 1500 m row keeps 3–4 boxes. **Saved state:** none. → **Apply Done here:** Done (or Skip when empty) folds it to "✓ Splits · 3 of 4 · Edit". Remember the choice per result row (entry id), like the racket per-event id.
3. **Take-over times** (`TakeoverField`, `RaceDepth.tsx:198-225`). It saves on blur and is always open, with no saved state. → **Apply Done** (fold to "✓ Take-overs · 0.21 · 0.18 · 0.25 · Edit"; keep the ⚠ early-reading line visible even when folded).
4. **Reaction time** (`ReactionField`, `ResultsEventScreen.tsx:1182-1193`). This is a single box with a blur-save and no ✓. → No Done (one field), but show "✓" after a save. If the R1 rule is not applied, hide it while folded behind a "＋ Reaction" chip.
5. **Swimming DQ reason** (`SwimStatusChips`, `ResultsEventScreen.tsx:1299-1314`) and **athletics DQ reason** (`AthDqChips` / `RuleRef`, `:1347-1350`). **Saved state:** the summary line "SW 7.6 — reason" is good (`:1313`). **Clear finish:** none; the list of rule chips stays open while the row is DQ. → **Apply Done:** after a reason is picked, fold to "✓ DQ · SW 7.6 — reason · Edit".
6. **Weightlifting lights** (`LiftingPanel.tsx:218-231`). The big button ("✓ Good lift (2 white)") is the finish, and "Last: …" is the saved state. OK as it is.
7. **Shooting series / final shot fixer** (`ShootingPanel.tsx:116,267-315`). Confirm sheets end each step, and `onDone` closes the fixer. OK.
8. **Archery ends** use keypad entry with series confirms. Nothing to describe.

## Risks

- **R1. Old-event replay: the precision switches (P0 if done naively).** `ruleOf` falls back to `RuleDef.default` when a phase holds no value (`competitionRules.ts:369-372`). `phaseRules` never stores a value equal to the default (`:387`). So changing `default: false → true` for `archTeamArrows` or `wlJury` in `precisionRules.ts` would switch them on for **every existing event**, including locked ones. That breaks "a started match keeps its settings". **Fix route:** keep `default: false`, and at **tournament creation** write the new value explicitly into `formats[sport]`, so `phaseRules` copies it onto new phases. Use a `tournamentDefault`-style seed like `withNewTournamentPoints` (`CreateTournamentScreen.tsx:153,173`). Add a test that a phase with `rules: {}` still reads OFF.
- **R2. Old-event replay: golf.** Change only the setup seed (`GolfRoundSetupScreen.tsx:70`). Changing the phone fallback (`GolfRoundScreen.tsx:74`) or `effectiveTrack` (`track.ts:70`) would add tracking to rounds already in play. The timed-race meta defaults are safe, because `raceTracking` reads `fmt[k] === true` and old tournaments simply lack the key (`raceDepth.ts:66`). The exception is swimming `splits` (`!== false`), which is already ON.
- **R3. Misleading zeros: golf up and downs.** A card kept with `upDown` gets `chipIns: 0` and `udChances: 0` even if the marker never tapped "Off green" (`engine.ts:681,748-751`). The career section "Around the green" shows those rows (`stats.ts:187`). With ON as the default, every skipped round adds a false "0 chip-ins". Fix: write the up-and-down keys only when at least one `offGreen` value was entered on the card. Same check for `sandSaves`/`sandHoles` (`engine.ts:684`), which is less serious because it is a rate with a 0 denominator. Separately, `penalties: 0` is written on **every** golf line, tracked or not (`engine.ts:670`). That is an existing false zero, so flag it to eng-app.
- **R4. Misleading commentary: partial splits.** `winnerSplitStory` ranks the winner only against rows that have a split (`raceDepth.ts:276-298`). If only the winner's splits were typed, the commentary says "led at every split". This is already possible (swimming splits are ON) and gets likelier with more depth. Fix: tell the story only when at least 2 rows (better: most of the heat) have that split. The same applies to `fastestFinish` (`:303`). `reactionSummary` keeps `n` (`:470-476`), so the UI should say "fastest of n readings".
- **R5. Commentary wording: golf scrambling label.** `statSheet.ts:112` relabels Scrambling depending on whether `udChances` exists. Turning up and downs on by default changes the wording on new rounds only. That is fine, but check that the two labels are not shown together across old and new rounds on the career page.
- **R6. Two homes for swimming splits.** `swimming/meta.ts:48` and `competitionRules.ts:226` both define `splits` (default true). Keep them in step if either changes.
- **R7. Typed depth left ON by mistake.** If any (c) option is switched on later, the always-open boxes (reaction, take-overs) put an empty field on every row of a 60-runner sports day. Fold them behind a "＋" chip first, like splits.
