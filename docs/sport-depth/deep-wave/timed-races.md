# Deep wave — timed races (athletics, swimming, rowing, canoe sprint, cycling)

**Date:** 2026-10-22 · **Family:** timed-races · **Status:** built in a worktree, uncommitted, not run live.

**Founder ask:** capture federation-standard depth, let the organiser *choose which stats to track*, and give live results commentary, an event summary / stats panel and career keys — without slowing the default entry and without changing how old results look.

**Standards read against** (rule numbers from memory where marked *verify*):
- **World Athletics** Competition & Technical Rules — TR 16 (start; 16.6 reaction < 0.100 s; 16.8 false start), TR 17 (the race: 17.2 obstruction, 17.3 lanes, 17.5 break line), TR 19 (timing; 19.21 hand times; 19.24/19.25 road gun / chip), TR 20–21 (rounds, ties), TR 22 (hurdles), TR 24 (relays), TR 25–26 (field: trials, heights, jump-off), TR 29 (wind), TR 39 (combined), TR 54–56 (walks, road, XC), CR 31 (records). The WA results-sheet format (place, lane, bib, mark, wind, **reaction time**, Q/q, PB/SB/records, rule-referenced DQs) and WA biomechanics split reports.
- **World Aquatics** Swimming Rules — SW 3 (seeding), SW 4.4 (start), SW 9–10 (relays; 10.13 early take-off), SW 11 (timing; 11.3 manual; split / lead-off times), SW 12 (records); automatic-officiating take-over pads (−0.03 s tolerance *verify*).
- **World Rowing** Rules of Racing + results format (500 m intermediate times with the rank at each).
- **ICF** Canoe Sprint Competition Rules (intermediate times at 250 m / 100 m / 1000 m points).
- **UCI** Regulations Part 2 (road ITT time checks) and Part 3 (track: pursuit / team pursuit km times, kilo / 500 m laps, team sprint laps).

## 1. Gap audit (before this wave → now)

Legend: ✅ already there · 🆕 built now · ❌ still missing · ⛔ out of scope (needs photo-finish / transponders / video / GPS).

### Athletics — track
| Item (federation results standard) | Before | Now |
|---|---|---|
| Place, lane, time 1/100, photo 1/1000, hand times (h), wind per race, Q/q, heats → semis → final, timed finals, ties (TR 21) | ✅ | ✅ |
| Reaction time (start-information system) | ✅ captured (meet toggle), not on the sheet or profile | 🆕 RT on the results sheet, fastest / average / under-0.100 s in the race analysis, **best reaction** on the profile |
| Lap / split times (400 m and longer) | ❌ | 🆕 optional **Lap times** (finish-line passes), lap times, place at each split, the winner's race, fastest last lap |
| Relay leg times / changeovers | ❌ | 🆕 optional **Relay leg times** (changeover splits → each runner's leg, fastest flying leg) |
| DQ with rule reference | ⚠ free text only | 🆕 WA reason picker (TR 17.3 / 17.5 / 17.2 / 22.6 / 24.7 / 24.6 / 6 / 7.1, by race type) + free text kept |
| PB / SB / MR / SR, historic school records | ✅ | ✅ (records now also announced in the commentary) |
| National / state record marks (NR) | ❌ | ❌ follow-up (see §4) |
| Each athlete's path through the rounds | ⚠ per phase only | 🆕 "Through the rounds" card |
| Gaps to the winner | ❌ | 🆕 derived (free) |
| Heats won (career) | ❌ | 🆕 `heatWins` |
| Live commentary | ❌ | 🆕 per heat / round / final / record |
| Photo-finish image, transponder splits | — | ⛔ (typed readings only) |

### Athletics — field, road / XC / walks, combined events
| Item | Before | Now |
|---|---|---|
| Trial series with wind, X / –, countback, top-8 extra trials, HJ / PV O / X / – progression, jump-off, implements | ✅ | ✅ |
| Trial-by-trial / height-by-height commentary ("takes the lead", "clears 1.75 at the second attempt (XO)", "out, best 1.75") | ❌ | 🆕 |
| Distance short of the winner | ❌ | 🆕 derived |
| Foul reason (long-press X) | ❌ | ❌ follow-up (P2) |
| Road: gun **and** chip time (TR 19.24/19.25) | ⚠ one or the other | 🆕 optional **Chip times (road)** beside the official gun time (gun ranks and counts for PBs) |
| Road / XC finish and team-score lines | ❌ | 🆕 commentary |
| Road km split times | ❌ | ❌ follow-up |
| Combined: points per event, standings after each event | ✅ on screen | 🆕 commentary with points per mark and standings after every locked event |

### Swimming
| Item | Before | Now |
|---|---|---|
| Times, manual watches (SW 11.3), 50 m splits, reaction (toggle), DQ codes by stroke, swim-offs, LC / SC / SCY PBs | ✅ | ✅ |
| Relay take-over times (pads), early take-off check (SW 10.13) | ❌ | 🆕 optional **Relay take-over times**, ⚠ below −0.03 s, never auto-DQ |
| Relay leg times | ⚠ raw splits only | 🆕 leg times from the splits |
| Lead-off split as an individual time / PB | ❌ (known P1) | 🆕 written to the lead-off swimmer's line as the individual event's mark (rule `swimLeadOff`, default on, never mixed relays) |
| Place at each split, the winner's race, fastest last length | ❌ | 🆕 derived from splits |
| RT on the results sheet | ❌ | 🆕 |
| 25 m splits (SCM), stroke counts / rates, 15 m times | ❌ | ❌ 25 m splits follow-up; ⛔ stroke counts / 15 m (video) |

### Rowing / canoe sprint
| Item | Before | Now |
|---|---|---|
| Times, photo 1/1000, 500 m / ICF intermediate times (toggle), progression routes, Finals A / B | ✅ | ✅ |
| Rank at every 500 m / split, the winner's race, fastest last 500 m, margins | ❌ | 🆕 derived from splits / times |
| Heats / repechages / semis won (career) | ❌ | 🆕 `heatWins` |
| Commentary with routes ("→ Final A") and the round summary ("2 to Final A, 2 to Repechage") | ❌ | 🆕 |
| Stroke rate per 500 m, GPS speed | — | ⛔ (GPS / cox box) |
| Lightweight weigh-in, quarter-finals | ❌ | ❌ (known SD-99 items, not depth) |

### Cycling
| Item | Before | Now |
|---|---|---|
| ITT / pursuit / kilo / team events by the clock, order events, points, GC, sprint bracket | ✅ | ✅ |
| Intermediate times: pursuit / TP every 1000 m, kilo / 500 m laps, team sprint each rider's lap, road ITT halfway time check | ❌ | 🆕 optional **Intermediate times** (team sprint → each rider's lap) |
| Commentary for timed and order events | ❌ | 🆕 |
| Sprint-bracket / points-race sprint-by-sprint commentary | ❌ | ❌ follow-up |

## 2. What was built

**Organiser choice — "Stats to track"** (sport settings → ⚙ Points & timing; a heading now groups them). All **off** by default except swimming's 50 m splits (on since SD-94, folded behind "＋ Splits"):
- Athletics: Reaction times (existing key), **Lap times** (`lapSplits`), **Relay leg times** (`relayLegs`), **Chip times (road)** (`chipTimes`).
- Swimming: 50 m splits (existing), Reaction times (existing), **Relay take-over times** (`takeovers`).
- Rowing / canoe: splits (existing key, now grouped).
- Cycling: **Intermediate times** (`cycSplits`).
The toggles are read live from `tournament.formats[sport]` (`raceTracking`), so switching one on mid-meet adds the boxes to events already set up. Swimming and crew splits keep exactly their old per-phase behaviour (`splitsOffered`).

**Capture (fast entry):** the existing "＋ Splits" box now serves athletics laps / relay changeovers and cycling intermediate times (`splitDistances` dispatches to `raceSplitDefs.ts`); a three-box take-over field for swim relays (accepts 0.21, −0.05 or pad digits "21"); a chip-time box under each gun time in the road finish card; a WA DQ-reason picker under DQ.

**Engine (pure, recomputed on every view):** `src/data/results/raceSplitDefs.ts`, `raceDepth.ts` (tracking, split points / laps / places, winner's race, fastest finish, relay legs + take-overs, reaction summary, gaps, phase ranking as on screen, heat names, paths through the rounds, heat analysis, DQ reasons, chip / take-over helpers), `raceCommentary.ts` (event and meet commentary, newest first).

**Views:** under each results sheet — 📈 Race analysis (only what was recorded), 🪜 Through the rounds, 📣 Commentary; the hub's 📣 Latest results (tap → the event's sheet); RT on the sheet's detail line; chip time on road rows.

**Career / stat lines** (absolute, per athlete id, rewritten by the existing lock / re-sync): `heatWins` (athletics, swimming, rowing, canoe — heats / semis / repechages won; a final won is a gold), `reaction` (best = lowest; absent when never read), the swim relay lead-off as the lead-off swimmer's individual mark key (`m_sw_100free_lc` …) — a PB / SB candidate and part of the PB history the results screen checks. Profiles show "🏁 N heats won · ⚡ best reaction" only once recorded.

**Rule (SD-141 screen, locks with the others):** `swimLeadOff` — "Relay lead-off times: count as the first swimmer's individual time / relay only" (default on; World Aquatics as remembered, *verify*).

## 3. Decisions taken (recommended option chosen)

1. **Where the toggles live.** Recommended option chosen: the sport's settings (⚙ Points & timing → "Stats to track"), always editable — capture choices never change a result. Alternative: the Competition rules screen, which locks once results exist (would block switching lap times on at lunchtime).
2. **Athletics lap points.** Chosen: the finish-line passes one timekeeper can read (1500 m: 300 / 700 / 1100 m; 3000 m: 200, 600 … 2600 m; 800 m: the bell; 400 m: 200 m). Alternative: round 400 m points from the start (Diamond League style) — needs a second timekeeper on the back straight.
3. **"Wins" for athletes.** Chosen: `heatWins` = heats / semi-finals / repechages won (not finals: a final won is already a gold). Alternative: count every race won including finals (cycling's `raceWins`) — double-counts golds.
4. **Lead-off times.** Chosen: count as an individual time by default (World Aquatics publishes and accepts them), only for a valid relay (status ok), never for mixed relays, organiser can switch off. Alternative: relay only.
5. **Take-over tolerance.** Chosen: flag below −0.03 s for the take-off judge, never auto-DQ (pads assist, judges decide). Alternative: auto-DQ on the pad reading.
6. **Commentary is derived, not stored.** Chosen: rebuilt from results each view, ordered by the phase's scheduled time then round / heat / trial / height / start order (no per-mark timestamps exist). Alternative: store a timestamped event log per save (exact timing, but corrections then need their own lines).
7. **Records in the commentary.** Chosen: a "New meet / school record" line only after the final is locked, against the book as it stood before (`recordsBefore`), and never for an unconfirmed out-of-range mark; live heats show the MR / PB flags the screen computes. Alternative: announce live — but every first final at a new meet "sets" a record (noise).
8. **Chip time.** Chosen: shown beside the gun time; the gun time ranks and counts for PBs / records (TR 19.25). Alternative: let the organiser pick chip as official (already possible: road timing = chip).
9. **Fastest relay leg** ignores leg 1 when flying legs exist (leg 1 includes the reaction and a standing start).
10. **Field-event "wins"**: none — a field final won is a gold; heats don't exist.

## 4. Open questions for the founder

1. **Rule numbers to verify** (from memory): WA TR 17.2 / 17.3 / 17.5 / 22.6 / 24.6 / 24.7 / 6 / 7.1 (the DQ picker); SW 10.13 and the −0.03 s pad tolerance; SW 11.6 / 12.12 for lead-off times.
2. **National / state records (NR):** should organisers type reference marks (AFI / SFI / state lists) shown as "NR" targets, with "beats the national record — subject to ratification"? Who maintains the lists, and per age group?
3. **Heats won in a timed final** (heats ranked across heats) don't count today — fine?
4. **Lap points**: keep finish-line passes, or offer 400 m-from-start as a choice?
5. **Commentary alerts**: should followers get pushes for heat wins / PBs (today only finals and records alert)?
6. **"Records set" on profiles**: wanted? It needs a holder id on record-book entries (today holder is a name) — see §5.
7. Should "Stats to track" also appear on the event setup screen (per event), or stay meet-wide?

## 5. Follow-ups not built

- NR / state reference records and a `recordsSet` career key (needs `holderId` on `RecordMark` and a check of the record-book merge function / migration).
- Road km split times (5 / 10 / 15 km points in a half marathon), walk penalty-zone timing.
- Field: foul reason (long-press X), per-trial PB flags in the commentary, per-athlete TJ board.
- Swimming 25 m splits (SCM); medley relay per-leg stroke check.
- Cycling: sprint-bracket match commentary, points-race sprint-by-sprint lines, omnium / madison.
- Race analysis on the printable sheets (`printSheets.ts`); a lap counter / bell for 800 m+.
- Commentary for weightlifting / shooting / archery (other family; `eventCommentary` returns [] for them).
- The run-* guides were already over 900 words; each got a one-line pointer to the new guide (`race-stats-and-live-commentary`).

## 6. Shared-file edits (minimal, additive)

| File | Edit | Why |
|---|---|---|
| `src/data/results/model.ts` | + `takeovers?`, `chip?` on `EntryResult`; `splits` comment widened | new optional captures (absent on every old row) |
| `src/data/results/index.ts` | + `export * from './raceDepth.ts'` / `'./raceCommentary.ts'` | engine exports |
| `src/data/results/competitionRules.ts` | + `swimLeadOff` rule in the swimming section | organiser rule with standard default (SD-141) |
| `src/screens/ResultsEventScreen.tsx` | imports; `track` const; splits condition → `splitsOffered` (identical for swim / crew); take-over field; `chip` prop on the road card; WA DQ chips + `key` on the rule box; `EventDepthPanel` under the sheet | wire the captures and the views |
| `src/components/results/ResultsSheet.tsx` | RT on the detail line when read | federation sheet shows reaction time |
| `src/components/FormatEditor.tsx` | a heading over fields sharing a `group` | "Stats to track" heading |
| `src/components/athletics/AthleticsHub.tsx` | `MeetCommentaryCard` after the timetable button | hub feed (renders nothing for other event sports) |
| `src/sports/crewStats.ts` | + `heatWins` stat (rowing + canoe) | career key |
| `tests/athletics-track.test.mts` | heat-winner line now has `heatWins: 1` | new derived key |

Own files: `src/data/results/{raceSplitDefs,raceDepth,raceCommentary}.ts`, edits in `athletics.ts` (phaseLines / career), `swimming.ts` (split dispatch, `leadOffDiscipline`), `crews.ts` (heat wins), `road.ts` (chip text), `src/components/results/{RaceDepth,RoadPanel,CrewCareer}.tsx`, `src/components/athletics/AthleticsCareer.tsx`, the five plugins and stat schemas, tests `timed-races-depth.test.mts` / `timed-races-commentary.test.mts`, guide `website/guides/race-stats-and-live-commentary.md` (+ one line in seven run-* guides).
