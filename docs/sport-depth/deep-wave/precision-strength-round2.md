# Deep wave, round 2 — precision-strength (weightlifting, shooting, archery)

The founder answered the open questions in [precision-strength.md](precision-strength.md) §4. This round builds those answers.

**Kept as is (founder):**
- "Jury reversed" is enough; there is no separate coach-challenge record.
- **Stats to track** stays locked once results exist, like every other competition rule.

**Ground rules followed:**
- Default entry is as fast as before. New capture switches are off by default, and the clock adds no required tap.
- Old results load identically. New keys are written only when their source exists, so there are no false 0s.
- Rule details are organiser options with standard defaults, on the Competition rules screen and locked once results exist.
- Stats are keyed by athlete id.
- No migration.

## Sources read this round
A research pass read these on 22 Oct 2026 (snippets where a site blocked a direct fetch):
- **IWF TCRR 2024 edition** (copy at iwlf.in): 6.6.7–6.6.13 (clock, changes), 6.8.3–6.8.8 (team classification), 7.10.5. An updated TCRR came out on 5 Nov 2025 but was not accessible, so rule numbers may have moved.
- **IWF Robi document** (iwf.sport download id 1343, which calls itself "Not a Technical Rule"). The IWF also added **GAMX** as a second official points system on 22 Apr 2026.
- **IWF bodyweight categories:** the IWF announcement of 3 Nov 2025 and USA Weightlifting's of 4 Nov 2025. **New categories have applied since 1 Aug 2026** (see open item 1).
- **World-record totals:** the "List of world records in Olympic weightlifting" as of 22 Oct 2026. Not cross-checked against iwf.sport.
- **ISSF Rule Book, Edition 2025 (third print, effective 19 Oct 2026):** 6.11.9, 6.12.6.2 b, 6.14.7, 6.15.1, 6.17.1.5, 6.17.1.14 e, 8.7.6.
- **NRAI Match Book 2024** (amended 17 May 2025): the 10M Rifle (NR) match, 9.6, 16.13. Also the Maharashtra Rifle Association's school open-sight circular.
- **World Archery Book 2 / Book 3, version 2026-01-27:** B2 4.5.1.2, 7.2.2.1, 7.2.3; B3 12.1.4, 12.2.2.2, 12.5.1.

---

## 1. Weightlifting — Robi points next to Sinclair

**Formula (IWF Robi document):** Robi = A × total^b, with b = log 10 / log 2 ≈ 3.3219281 and A = 1000 / WR^b. In other words Robi = 1000 × (total ÷ WR)^b: the world-record total scores 1000, and half of it scores 100. The research checked A against the IWF's own table (men 56 kg: WR 307; women 48 kg: WR 217).

**Decisions:**
- **Reference totals are the organiser's.** Two text rules take "category: kg" lists, for example `60: 290, 65: 312, +110: 470`:
  - `robiRefM` for men / boys;
  - `robiRefF` for women / girls.
- **Defaults when left empty:** the IWF senior world-record total, or the world standard (WS) where no record has been set. There is one table, `ROBI_WR` in `robi.ts`, keyed by category label. It covers both:
  - the categories in force from 1 Aug 2026: M 60/65/70/75/85/95/110/+110, W 49/53/57/61/69/77/86/+86;
  - the retired 2025–26 categories the app still offers (M 71/79/88/94, W 48/58/63), at their final totals.
- **The defaults apply to Senior / Junior / Open categories only.** A youth or school category with the same label is not measured against the senior record: it gets Robi only from the organiser's list, otherwise "–".
- **Display:**
  - A new tournament-level switch, **Best lifter (Robi points)**, off by default, sits next to the existing **Best lifter (Sinclair)**.
  - The results sheet gets a **Best-lifter points** card with Sinclair and/or Robi per lifter, shown when either switch is on.
  - The meet hub gets **Best lifters (Robi)** next to **Best lifters (Sinclair)**.
  - "Best-lifter option" = the organiser turns on either or both, and each gets its own ranked list. There is no separate "rank by" rule.
- **Stat key `robi`** is written by `liftLines` only when the category has a reference. The career shows "Robi points" as a best, like Sinclair; it gives no PB flag.

**Robi defaults (kg, 22 Oct 2026):**

| Category | M | | Category | W |
|---|---|---|---|---|
| 60 | 307 WS | | 48 (retired) | 213 |
| 65 | 329 | | 49 | 215 |
| 70 | 349 | | 53 | 223 WS |
| 71 (retired) | 351 | | 57 | 238 |
| 75 | 366 | | 58 (retired) | 236 |
| 79 (retired) | 365 | | 61 | 251 |
| 85 | 379 (383 awaiting ratification) | | 63 (retired) | 254 |
| 88 (retired) | 397 | | 69 | 273 |
| 94 (retired) | 396 WS | | 77 | 278 |
| 95 | 398 | | 86 | 289 WS |
| 110 | 428 | | +86 | 325 WS |
| +110 | 477 WS | | | |

## 2. Weightlifting — the lifting clock

**Rule (TCRR 2024):**
- **6.6.7:** 1 minute from the call, or 2 minutes for consecutive attempts by the same lifter. Signals sound 30 s after the start and 30 s before the end. If time runs out before the bar leaves the platform, it is a no lift.
- **6.6.8:** consecutive attempts lose the 2 minutes if the clock started for another lifter in between.
- **6.6.10:** no weight increase after the "final call" (30 s left).
- **6.6.12:** on a 2-minute clock, the next weight is declared within the first 30 s.
- **7.10.5:** the clock stops when the bar leaves the platform.

**Built:**
- `liftingClock.ts`:
  - `clockAllowance` gives 2 minutes when the last lift taken in this lift was the same lifter's, else 1 minute. A declined attempt doesn't count.
  - `clockView` returns the clock's state: idle / running / warn / over / stopped, with the time text and a note.
- `LiftingClock.tsx` sits on the next-lift card. The official taps **Start** at the call, **Stop** when the bar leaves the platform, and **Reset**. On a 2-minute clock a note says to declare the next weight once 30 s have gone. At 30 s left the clock turns amber with "final call". At 0 it turns red with "Time — no lift if the bar has not left the platform (the referees decide)".
- It is a scorer aid: nothing is stored and no decision is made. The clock resets when the call moves to another lifter, attempt or lift. A weight change by the same lifter keeps it running.
- **Rule `wlClock`** (Lifting order): **on (IWF)** by default, or off. It is on by default because it adds no required tap.
- **Not built:**
  - weight-change refusal after the final call (the clock and the change dialog don't share state);
  - 6.6.13 (the clock stops while the bar is changed for a lifter who must take a heavier weight next).

## 3. Shooting — penalties in finals

**Rule (ISSF 2025 edition):**
- **6.12.6.2 b:** a deduction is 2 points. Dry firing in a 10 m / 50 m final costs 1 point (6.17.1.14 e).
- **6.17.1.5:** the deduction comes off the score of the shot (or series) in which the violation happened, and no score goes below zero.
- A violation before the first match shot comes off the first shot.

**Built:**
- `EntryResult.fpen[i]`: points off final shot `i`.
- `netFinalShots` (in `shootingDefs.ts`) gives each shot net of its penalty, never below 0. Every final total uses it:
  - `finalState` (eliminations and gold);
  - `rankShootFinal` and `rank.ts` (a finalist's row on its own);
  - the commentary and the final stats.
- **Entry:** the existing **Correct a shot** panel. Tap the finalist, then the shot, then **−2** / **−1 dry fire** / **None**. A shot fired before an elimination asks first, as a shot correction does.
- **Shown in:**
  - the shot cells (−2), the finalist's line, and the results sheet row;
  - the commentary ("Penalty — X −2 on shot 14 (10.4 counts 8.4)");
  - the final stats (penalties line, `pen` per finalist only when > 0);
  - the stat line: a final's penalties (on the shots that count) go into the existing `pen` key, so the career penalties include them.
- **Switch:** the existing **Penalties** rule (`shootPen`, Stats to track, off) now covers series and final shots. An existing penalty always shows, so it can be cleared.
- Best shot and 10.0+ count the shot as fired; the total and the average are net. This matches the series decision: "best series" is as shot, the total is net.

## 4. Shooting — more ISSF events and the NRAI school classes

| Key | Event | Format (source) |
|---|---|---|
| `shoot.50mpr` | 50 m Rifle Prone | 60 shots, decimal (max 654.0), series of 10, **no final** (6.11.9.3) |
| `shoot.25msp` | 25 m Standard Pistol | 60 shots, stages 4 × 5 in 150 s / 20 s / 10 s; integer with inner tens; no final (6.11.9.9) |
| `shoot.25mcf` | 25 m Centre-Fire Pistol | 30 precision + 30 rapid fire (3 s a shot); integer with inner tens; no final (6.11.9.7, 8.7.6). The research read 240 s per precision series; the app doesn't time it, so the label leaves the figure out. |
| `shoot.50mp` | 50 m Pistol | 60 shots, integer with inner tens, no final (6.11.9.8) |
| `shoot.10mps` | 10 m Peep Sight Air Rifle (NRAI) | NR "10M Rifle": 40 shots, ISSF 10 m target, whole rings (NR qualifying score 382/400 ⇒ integer) |
| `shoot.10mos` | 10 m Open Sight Air Rifle (NRAI) | **Organiser-configurable default.** NRAI 9.6 defines only the rifle (a factory spring-piston .177, trigger ≥ 1000 g), not the match, so it uses the peep-sight format: 40 shots, integer, series of 10, with 20 / 10 offered. |

**Decisions:**
- New field `ShootEventDef.level: 'nrai'`. The setup screen lists the NRAI classes under their own heading.
- New field `ShootEventDef.stages`, with `stageOf()`. The series card shows "20 s stage" / "Rapid fire stage". 25 m Pistol also gets precision / rapid-fire stage labels; its ranking is unchanged.
- Ties come from the existing ISSF ranking: inner tens first for integer events (6.15.1 a), decimal countback for prone (6.15.1 f).
- The new events get stat keys (`m_sh_50mpr` …), records and teams of 3 automatically.
- The NRAI classes default to 40 shots at every age; there is no shorter school default.
- **Pinned tests changed deliberately:**
  - `tests/sd137b-team-events.test.mts`: `SHOOT_EVENTS.length` 9 → 15, plus "no team key in the list";
  - `tests/shooting.test.mts`: the ordered key list, with the six new keys last.

## 5. Archery — recurve indoor face

**Rule (WA B2 7.2.2.1 / 7.2.3, B3 12.2.2.2):**
- The 18 m round uses the 40 cm triple face for recurve and compound (individual and team).
- The full 10-ring 40 cm face is still a listed face.
- On a triple face, an arrow outside the 6 ring is a miss.

**Built:**
- **Rule `archIndoorFace`** (new group **Faces**):
  - `full` (default, the founder's school default): the single 40 cm face, rings 1–10;
  - `triple`: rings 6–10, as at WA indoor.
- `faceOf()` / `roundWithFace()` in `archeryDefs.ts` read the rule. The rule applies to the recurve 18 m round and its team / mixed keys.
- The keypad, typed-end check, arrow distribution and header line (`roundLine(round, rules)`) follow the rule.
- The recurve 18 m round's face text is now "40 cm face". Old results are unaffected: arrows are never re-checked, only new entry.
- Compound indoor stays the triple face.

## 6a. Weightlifting — IWF team classification

**Rule (TCRR 2024):**
- **6.8.3:** 28, 25, 23, 22, 21 … 1 points for places 1–25.
- **6.8.4:** at IWF events, points for the snatch, the C&J and the total.
- **6.8.5:** ties go to more higher places.
- **6.8.6 / 6.8.7:** no valid snatch → C&J points only; no total → no total points.
- **6.8.8:** in total-only events, no total → no points.

**Built:**
- `wlTeamClassification()` in `liftingTeam.ts`:
  - one table per age group and gender (gender per IWF practice — not stated in the rule text);
  - a team = the entry's team / house; every competing lifter scores;
  - ties: more 1st places, then 2nd …; still level, the place is shared;
  - `tie: 'share'` is available but no rule exposes it.
- **Rule `wlTeamClass`** (new group **Team classification**):
  - **off** (default);
  - **total**: 28-25-23 on the total;
  - **all**: snatch, C&J and total, the IWF event standard.
- Shown on the meet hub as "Team classification — Senior Men" and so on, with points, lifters and places. It is its own result: the house table and medal table keep the meet's points.
- **Why off by default:** a school meet's champion house comes from the house table, so a second team table with different points could crown a different "winner" unless the organiser asks for it.

## 6b. Archery — arrows credited to each archer in team matches

**Rule (WA B2 4.5.1.2):** teams shoot 6 arrows an end (2 per archer); mixed teams shoot 4 (2 each).

**Built:**
- `ArchSide.by[k]` holds, for end k, the member index of each arrow, in the same order as the stored end (highest first).
  - `creditEnd()` sorts the typed end and keeps who shot what.
  - `setMatchEnd(…, { per })` stores it.
  - An uncredited correction drops that end's credit.
- **Rule `archTeamArrows`** (Stats to track, off). With it on, the team match scorer shows the boxes under each archer's name, two each. The scorer taps archer 1's arrows, then archer 2's, then archer 3's. The team score is the same either way.
  - Correcting a credited end loads it archer by archer.
  - Correcting an uncredited end starts empty, so it can be credited.
- **Counts:** only the ends that counted and that are credited. Shoot-off arrows are not counted, matching `matchPlayOf`.
  - **Stats panel:** an "Each archer (team matches)" table with arrows, average, 10s / X.
  - **Commentary:** a detail line, "Asha X-9 · Bina 10-10 · Chitra 9-8".
  - **Stat line:** the team line gains `tArrows` / `tPts` / `tTens` / `tXs` only for archers with credited arrows. These are their own keys, not `mArrows`, because a team match is not the archer's individual match play.
  - **Career:** `teamArrows`, plus a "team-match average arrow" row (`tAvgArrow`, rate over credited lines only).
- **Credit is by member index**, not player id. A team whose members change mid-bracket re-credits by the new order (rare; noted).

---

## Data shape (all optional, additive)
- `EntryResult.fpen?: number[]`: points off final shot i.
- `ArchSide.by?: number[][]`: member index per arrow, per end.
- **New rules:**
  - weightlifting: `wlClock`, `robi`, `robiRefM`, `robiRefF`, `wlTeamClass`;
  - archery: `archIndoorFace`, `archTeamArrows`;
  - shooting: `shootPen` relabelled to cover finals.
- **New stat keys:**
  - weightlifting: `robi`;
  - archery: `tArrows`, `tPts`, `tTens`, `tXs`, and the derived `tAvgArrow`.

## Shared-file edits (additive)
| File | Edit |
|---|---|
| `src/data/results/model.ts` | +`EntryResult.fpen`, +`ArchSide.by` (optional fields, doc comments) |
| `src/data/results/index.ts` | +4 `export *` lines (liftingClock, robi, liftingPoints, liftingTeam) |
| `src/data/results/competitionRules.ts` | **not edited**: the new rules live in `precisionRules.ts`, which is already spread in |
| `src/screens/ResultsEventScreen.tsx` | `rules={f.rules}` on `EndCard` and `FinalCard`; `roundLine(arch, f.rules)`; `fmt=…` prop on the full `PrecisionInsights` |
| `src/components/results/*` | `ShootingPanel` (final penalties, stage label), `ArcheryPanel` (face, credited entry), `LiftingPanel` (clock), `PrecisionInsights` (best-lifter card, per-archer table, final penalties row), `ResultsSheet` (final penalty on the row), `ArcheryCareer` (team arrows line); new `LiftingClock.tsx` |
| `src/data/results/rank.ts` | the finalist-row total is net of `fpen` (one line + import) |
| `src/components/athletics/AthleticsHub.tsx` | Robi best lifters and team classification sections (+imports, +2 memos) |

**Family files:** `weightlifting.ts`, `shooting.ts`, `shootingDefs.ts`, `shootingRank.ts`, `shootingInsights.ts`, `archery.ts`, `archeryDefs.ts`, `archeryInsights.ts`, `precisionRules.ts`, `sports/{archery,weightlifting}/stats.ts`, `screens/ShootingEventSetup.tsx`, and the four public guides.

**New:** `liftingClock.ts`, `robi.ts`, `liftingPoints.ts`, `liftingTeam.ts`, `components/results/LiftingClock.tsx`, `tests/precision-round2.test.mts` (28 tests).

## Open items / follow-ups
1. **The app's IWF category lists are out of date.** The IWF changed the senior / junior and youth categories again on 1 Aug 2026:
   - senior / junior: M 60/65/70/75/85/95/110/+110, W 49/53/57/61/69/77/86/+86;
   - youth: M 55/60/65/70/75/85/95/+95, W 45/49/53/57/61/69/77/+77.

   `weightClasses()` still offers the 1 June 2025 lists. Updating them changes the weigh-in categories and pinned tests, so it was left for a decision. Robi defaults already cover both lists.
2. **GAMX** (IWF, 22 Apr 2026) is a second official points system. Which one the IWF uses for "best lifter" now was not verified. GAMX could be added as a third option.
3. **Robi references to re-check** after the 2026 World Championships (Ningbo, 27 Oct – 8 Nov 2026), against iwf.sport. Also unverified: whether the IWF uses the world standard in A where no record exists (the app does).
4. **Team classification limits:** at most 2 lifters per category and 10 per gender (TCRR 1.2.7) are not enforced.
5. **Clock:** no refusal of a weight increase after the final call, and 6.6.13 is not built.
6. **WA indoor ties** at short distance are most 10s then most 9s (B3 12.5.1; X not used indoors). The app's `archTie` still counts X for indoor rounds. A one-line follow-up to make the default distance-aware.
7. **NRAI open sight:** the national match format (shots, position, time) and the SGFI rules weren't verified. The 40-shot default is a house choice. The position (standing) is not stored.
8. **Centre-fire precision time** (240 s a series per the 2025 edition, vs 5 min remembered) — verify. Not shown in the app.
