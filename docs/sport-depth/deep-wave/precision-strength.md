# Deep wave — precision-strength family (weightlifting, shooting, archery)

Founder ask (2026-10): capture the depth of a Grand Slam "Match Stats" page and its point-by-point commentary for every sport, with the extra capture optional ("Stats to track") and everything else derived from what is already stored.

**Standards read against.** These are from memory; the rule PDFs could not be opened in this session. Items marked *verify* are listed again under the open questions.
- **Weightlifting:** IWF Technical & Competition Rules & Regulations (TCRR, 2020 edition, rule numbers as remembered), the IWF categories from 1 June 2025, and IWF World Championships results protocols.
- **Shooting:** ISSF General Technical Rules and the Rifle / Pistol / Shotgun rules (2022 edition), and ISSF World Cup results books.
- **Archery:** World Archery Rulebook Book 2 (events) and Book 3 (target archery), and WA results sheets.

**Founder rules followed:**
- Entry stays as fast as today, and every new capture switch is off by default.
- Old results load identically. A new key is written only when its source exists, so there are no false 0s.
- Rule details are organiser options with the federation standard as the default, locked once results exist (SD-141).
- Stat keys are absolute, per athlete id, and recomputed on correction through the existing results engine.

What SD-95 / SD-96 / SD-97 / SD-137b already did is not rebuilt.

---

## 1. Gap audit

### Weightlifting (IWF)
| Item | Standard | Before | Now |
|---|---|---|---|
| Attempt protocol: declared weight, decision, IWF calling order, lot, bodyweight | TCRR | ✅ SD-97 | ✅ |
| Best snatch / C&J / total, bomb-out, equal totals by lifted-first | TCRR | ✅ | ✅ |
| Referees' decision 3-0 / 2-1 | IWF scoreboard | ⚠️ lights could be entered, but were never shown | ✅ shown on the attempt cell, in the commentary and in the stats; optional **Referees' lights** switch makes lights the default entry |
| Jury reversal | TCRR jury (*verify*) | ❌ | ✅ optional **Jury reversals** switch |
| Declared-weight changes: counted, two per attempt | TCRR (*verify*); audit-2 measured P2 | ❌ | ✅ counted for free; **asks** before a third (rule `wlChanges`, IWF default; never refuses) |
| Sinclair best lifter | IWF | ✅ | ✅ |
| Robi points | IWF | ❌ | ❌ open question |
| Live commentary per attempt | broadcast / scoreboard | ❌ | ✅ |
| Session stats: make rate per lift, openers, average jump, margin | coaching / protocol | ❌ | ✅ |
| Career: make rate per lift and for openers, bests per bodyweight category | — | ❌ | ✅ |
| Competition clock, A / B groups, team classification, 20 kg entry-total rule | TCRR | ❌ | ❌ follow-up |

### Shooting (ISSF)
| Item | Standard | Before | Now |
|---|---|---|---|
| Series scores, decimal / integer scoring, inner tens, shot by shot (optional per event) | GTR | ✅ SD-96 | ✅ |
| Elimination final (decimal), shoot-offs, ties (X → series back → shots back) | GTR | ✅ | ✅ |
| Penalties: 2-point deductions | GTR (*verify*) | ❌ | ✅ optional **Penalties** switch (−2 per tap, per series) |
| Commentary: series by series; final shot by shot; mixed-team medal matches | results service / TV | ❌ | ✅ |
| Match stats: best / worst / spread / average series, position totals, shot distribution | results books | ⚠️ series line only | ✅ |
| Final stats: average shot, 10.0+ shots, place after each elimination, lead changes | TV graphics | ❌ | ✅ |
| Career: best series, perfect series, average final shot, penalties | — | ❌ | ✅ |
| 50 m prone, 25 m standard / centre-fire, 50 m pistol; NRAI peep / open sight | ISSF programme; audit-2 P1 | ❌ | ❌ follow-up (see decisions) |
| 25 m and shotgun finals | ISSF | ❌ | ❌ follow-up |
| Electronic-target data (shot position, time) | — | — | out of scope (manual scoring) |

### Archery (World Archery)
| Item | Standard | Before | Now |
|---|---|---|---|
| Arrows X / 10–1 / M per end, ends, set system / cumulative, shoot-off with closest to centre, ranking → bracket, team / mixed | Book 3 | ✅ SD-95, SD-137b | ✅ |
| Face rings: 80 cm 6-ring scores 5–X; 40 cm triple scores 6–X | Book 3 (*verify*); audit-2 P2 | ⚠️ keypad offered 1–4 | ✅ compound 50 m and compound indoor keypads show only their rings; typing a lower value is refused ("outside the ring is M") |
| Commentary: end by end in the ranking round; every match end with set points; shoot-offs; podium | results service | ❌ | ✅ |
| Round stats: average arrow, X per end, best / worst end, distribution X / 10 / 9 / 8 / 7 / ≤6 / M | WA results | ⚠️ career-level only | ✅ per event |
| Match play stats: sets won / shared / lost, average arrow in matches, best end, shoot-offs | TV graphics | ❌ | ✅ |
| Career: X per end, best end per round, average arrow in matches, shoot-offs won | — | ❌ | ✅ |
| End-total-only entry, per-archer arrows in team matches, Indian round, brackets over 64 | — | ❌ | ❌ follow-up |
| Arrow plotting / timing | — | — | out of scope |

---

## 2. What was built

### Optional capture: "Stats to track" (Competition rules, off by default)
| Rule key | Sport | What it does |
|---|---|---|
| `wlLights` | weightlifting | The next-lift card opens on the three referees' lights (white / red); 3-0 / 2-1 is kept on the attempt. The per-attempt **3 lights** chip still works when this is off. |
| `wlJury` | weightlifting | **⚖ Jury reverses** under the last decision, and on any decided attempt in the lifter's grid. It flips the decision (`jury: true`) and keeps the lights. An automatic next declaration follows the new decision; a coach's declaration is left alone. A second tap restores the referees' decision. |
| `shootPen` | shooting | **＋ Penalty −2** on each saved series (−2, then −4, then clear). Stored as `pen[i]`; the total, the ties (countback on net series) and the records use the net score. |

Rule `wlChanges` (default 2 = IWF; 0 = no limit) sits in **Lifting order**. Every change of a coach's declaration is counted for free (`chg`: the earlier weights). A third change asks first.

### Results commentary (derived, newest first; never stored)
Shown on the results screen: the 3 newest lines while entering, and all of it on the results sheet.

- **Weightlifting:** one line per attempt in competition order (`seq`), for example "Sn 2 · Asha Rao 88 kg (changed from 87 kg) — good lift (3-0)". Extra lines cover the lead changing in the snatch and on total, each new total, no total ("bomb out"), the snatch standings once the snatch is over, and the medals.
- **Shooting:**
  - **Match:** each shooter's series with running total and place (fields up to 12), a series summary (best series, leader, margin), perfect series, penalties, lead changes, and the end standings.
  - **Final:** a line per shot (best shot, leader and gap; every finalist's value as the detail line), lead changes, shoot-offs, eliminations with place and score, and the podium.
  - **Mixed-team medal matches:** series by series with the 2-1-0 points.
- **Archery:**
  - **Ranking round:** each archer's end with running total and place (fields up to 12), an end summary, lead changes, the halfway standings, and the end of the round.
  - **Match play:** every end with both archers' arrows and the set score (or the cumulative totals), shoot-offs (higher, or closer to the centre), the winners and the podium.

### Stats panel (results sheet)
- **Weightlifting:**
  - The winner and the margin (or "level, lifted it first"), and where they stood after the snatch.
  - Per lift: good / attempted, openers, the heaviest lift, the average jump, declined attempts.
  - When recorded: referees' unanimous and split decisions, jury reversals, weight changes, and a per-lifter decision line.
  - Lifters with no total.
- **Shooting:**
  - **Match:** best series of the event, perfect series, penalties, lead changes. Per shooter: best / worst / average series, X, spread, position totals (3P), and the shot distribution when shots were entered one by one.
  - **Final:** shots counted, average, best, 10.0+, the place after each elimination, lead changes, and the best shot.
- **Archery:**
  - **Ranking:** per archer average arrow, X per end, best / worst end, halves, and the distribution; the best end and most X of the field; lead changes.
  - **Match play:** per archer won–lost, sets won-shared-lost, average arrow over the ends that counted, 10s / X, best end, shoot-offs.

### New stat-line keys
All are written by `liftLines`, `shootLines` and `archLines`, so they are recomputed on correction, re-sync and reopen. They are written only when their source exists.

| Sport | Keys | Career / labels |
|---|---|---|
| Weightlifting | `snMade`, `snAtt`, `cjMade`, `cjAtt`, `o1Made`, `o1Att` (only for a lift that had an attempt) | `snRate`, `cjRate`, `o1Rate`; `liftingCareer().perLift`; `byCategory` (bests per bodyweight category, from the phase's category, so old lines get it too) |
| Shooting | `bestSer` (best series as shot), `perfect` (only when > 0), `pen` (only when > 0), `fShots` (final shots counted in `fpts`) | `finalAvg` = fpts ÷ fShots over finals that carry `fShots` (filter `hasFShots`); career `bests[].bestSeries`, `perfect`, `penalties`, `finalAvg` |
| Archery | ranking: `rEnds`, `n9`, `bestEnd`; match play: `mArrows`, `mPts`, `mTens`, `mXs`, `soW` / `soL` (only when shot) | `xPerEnd` = xs ÷ rEnds over rounds that carry `rEnds` (filter `hasREnds`, so old rounds' X aren't divided by nothing); `mAvgArrow`; career `xPerEnd`, `match`, `shootOffs`, `bests[].bestEnd` |

**Data shape (all optional, additive):**
- `LiftAttempt.jury`: the jury reversed the referees.
- `LiftAttempt.chg`: the earlier declared weights.
- `EntryResult.pen`: penalty points per series.

---

## 3. Decisions taken where unsure

- **Where the switches live.** Recommended option chosen: the Competition rules screen (SD-141), new group **Stats to track**, copied onto the phases. It is locked once results exist, like every other rule. Alternative: per-event switches that can change mid-meet. Mitigation: lights can still be used per attempt without the switch, and an attempt that already has a jury reversal always shows its button.
- **Weight-change limit default.** Recommended option chosen: IWF two changes, and the app **asks** before a third (SD-112 pattern, never refuses). Alternative: no limit by default. This is the only new prompt on the default path, and it fires only on a third change.
- **What counts as a change.** Recommended option chosen: replacing the app's automatic +1 kg / same-weight declaration is the coach's declaration, not a change. Changes on the weigh-in card (openings before the session) are not counted. Alternative: count every edit.
- **Jury mechanics.** Recommended option chosen:
  - the decision flips and `jury: true` is stored;
  - the referees' lights are kept, so the commentary reads "no lift — jury reversed the referees' 2-1";
  - an automatic next declaration follows, and a coach's declaration is left alone.

  Alternative: record a separate "coach challenge requested / upheld" (open question).
- **Lights notation.** Recommended option chosen: white–red always. A good lift reads "(3-0)" / "(2-1)", a no lift "(1-2)" / "(0-3)". Alternative: majority first ("no lift 2-1").
- **Penalties.** Recommended option chosen:
  - per series, in 2-point taps;
  - totals, ties and records use the net score;
  - "best series" and "perfect series" use the series as shot.

  Alternative: deduct from the stored series value (loses the shot score). Final-shot penalties are not built (open question).
- **Commentary order.** Recommended option chosen:
  - Weightlifting follows the competition attempt number. Attempts entered on the grid without one come last.
  - Shooting and archery go series by series and end by end, in firing / target order. No timestamps are stored.
  - Per-athlete lines appear for fields up to 12; bigger fields get the summaries only.

  Alternative: store timestamps (needs an event log the results engine doesn't have).
- **Face rings.** Recommended option chosen: restrict only compound 50 m (80 cm 6-ring, 5–X) and compound indoor (triple face, 6–X). Recurve indoor is left on the full keypad, because schools often shoot a single 40 cm face (open question). Old results with lower arrows still load; only new entry is checked.
- **Programme breadth.** Recommended option chosen: not adding the missing ISSF events (50 m prone, 25 m standard / centre-fire, 50 m pistol) in this wave. They are programme breadth, not depth, and adding them changes a shared SD-137b test that pins the 9-event list. Alternative: add them now (about 4 catalogue lines plus that test). Listed under follow-ups.
- **No false 0.** Recommended option chosen: new career rates are computed only over lines that carry their keys (filters `hasREnds` / `hasFShots`; per-lift rates need both keys). Old sessions show "–" / nothing, never 0%.

## 4. Open questions for the founder

1. **Robi points.** IWF's newer best-lifter formula needs the current world record of each category. Should we build it with an organiser-entered reference total per category, or keep Sinclair only?
2. **Coach challenge (IWF).** Should a challenge be recorded on its own (requested, upheld or rejected), or is "jury reversed" enough?
3. **Switch timing.** Should **Stats to track** stay locked with the other rules once results exist, or be allowed to change mid-meet (they don't change results, apart from penalties)?
4. **Weightlifting clock.** Is a competition clock (1 min, or 2 min for consecutive attempts) in scope? It's a scorer aid, not a result (audit-2 P1).
5. **Shooting final penalties.** Do we need penalties in finals (a deduction from a shot)?
6. **More ISSF events.** Should we add 50 m Rifle Prone (decimal), 25 m Standard Pistol, 25 m Centre-Fire Pistol and 50 m Pistol, plus NRAI 10 m peep-sight / open-sight school classes?
7. **Recurve indoor face.** Should recurve indoor use the triple face (6–X only, as at WA indoor championships), or keep the full 40 cm face for schools?
8. **Team classification.** Should we add IWF team classification (28-25-23-… per gender) as its own result, not only house points?
9. **Team-match arrows.** Should arrows in team matches be attributed to each archer, for individual stats from team events?

## 5. Follow-ups not built

- **Weightlifting:**
  - competition clock;
  - A / B groups and "move to another category" at the weigh-in;
  - team classification;
  - the 20 kg entry-total rule;
  - Robi points;
  - coach-challenge record.
- **Shooting:**
  - the missing ISSF events listed above;
  - 25 m rapid-fire / 25 m pistol hit-scored finals and shotgun finals;
  - penalties in finals;
  - a team of 3's countback reads its members' series as shot. Its total is net of penalties, but a member's penalty doesn't reach the team's series countback (`teamEvents.memberScoreOf`, a shared file — left alone).
- **Archery:**
  - end-total-only entry for big school fields;
  - per-archer arrows in team matches;
  - Indian round (national);
  - brackets over 64 untested.
- **All three:**
  - the latest commentary line in the WhatsApp share text;
  - follower push for "takes the lead" or a perfect series (would need notify rules).

## 6. Shared-file edits (minimal, additive)

| File | Edit | Why |
|---|---|---|
| `src/data/results/model.ts` | +`LiftAttempt.jury`, +`LiftAttempt.chg`, +`EntryResult.pen` (optional fields) | New optional capture; old rows are unchanged. |
| `src/data/results/competitionRules.ts` | +1 import, +1 spread `...PRECISION_RULES` (after the shooting section) | The new rules live in `precisionRules.ts`. |
| `src/data/results/index.ts` | +5 `export *` lines at the end | The new insight modules. |
| `src/screens/ResultsEventScreen.tsx` | +1 import; `<PrecisionInsights mode="live">` after the live ranking; `<PrecisionInsights mode="full">` before Medals & points; `rules={f.rules}` on `SeriesCard` | Commentary and stats; penalties switch. |
| `website/guides/competition-rules-for-meets.md` | weightlifting and shooting lines only | Documents the new rules. |

Sport-specific files changed (owned by this family):
- `data/results/weightlifting.ts`, `shooting.ts`, `shootingRank.ts`, `archery.ts`, `archeryDefs.ts`;
- `components/results/LiftingPanel.tsx`, `ShootingPanel.tsx`, `ArcheryPanel.tsx`, `LiftingCareer.tsx`, `ShootingCareer.tsx`, `ArcheryCareer.tsx`;
- `sports/{weightlifting,shooting,archery}/stats.ts`;
- `tests/shooting.test.mts` (two expected lines now include `bestSer` / `fShots`);
- the three public guides.

New files:
- `data/results/insightFeed.ts`, `precisionRules.ts`, `liftingInsights.ts`, `shootingInsights.ts`, `archeryInsights.ts`;
- `components/results/PrecisionInsights.tsx`;
- `tests/weightlifting-deep.test.mts`, `shooting-deep.test.mts`, `archery-deep.test.mts`.

## 7. Tests

There are 47 new tests across the three new test files:
- weightlifting: weight changes, jury, decision text, commentary, session stats, lines, career, schema, rules, feed helpers;
- shooting: penalties, net countback, perfect series, all three feeds, stats, lines, career, schema;
- archery: face rings, ranking and bracket feeds, stats, lines, career, schema.

`npx tsc --noEmit` is clean and `npm test` is green.
