# Cricket, batch 5: break it (2026-11-03)

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5). Source: the expert audit `docs/sport-expert/cricket.md` (C2, C3, C4, C5, C10, fix 3 DRS).

**Hard rules:** old logs replay byte-identically (cricket-legacy-replay.test.mts fingerprints); new payload keys and actions are additive; hostile values are ignored; one scorer on one phone, every new tap optional. Chain: Info (Match rules / "Rules & stats captured") → Scoring → Stats and Commentary.

| # | Failure | Status |
|---|---|---|
| B5-1 | **C2: a shot type can't be tagged on a dot ball or a dismissal.** The shot panel opens only when `bat > 0`, so the `Defended` chip is dead and "out pulling" / "dismissals by shot" can't be recorded. | **Fixed:** with the wagon wheel on, a dot ball or a wicket ball (not a wide / bye / leg bye) opens shot-type chips only (no field tap), `Defended` included; Skip / the next ball closes it. The engine already keyed `SHOT` by ball; commentary reads "no run, defended" / "OUT! Caught, pulled". Tests. |
| B5-2 | **C2: the Shots tab counts shot types by the tag's own `runs`.** A tag on a wicket ball has no notion of "out"; a hostile tag can claim runs the ball never had. Stats must join the tag to its logged ball. | **Fixed:** `shotTypeStats` joins each tag to its logged ball (runs, dots, dismissals by shot); a tag with no ball counts nothing, a tag's own `runs` is never trusted. Shots tab: Runs · Balls · Dots · Out. Tests; 600 simulated matches. |
| B5-3 | **C2: the wagon wheel note counts dot / wicket tags as "scoring shots tagged".** | **Fixed:** the note counts only zone tags on scoring shots. |
| B5-4 | **C3: the catch position (`cz`) reaches only the commentary.** The Stats tab has no "catches by area" (ring / deep, off / leg). | **Fixed:** `catchAreas` (ring / deep × off / leg, plus how many catches carry a position); a **Catches** view on the Stats tab once a position is tagged. Tests; simulation. |
| B5-5 | **C3: a catch position left on a ball that is no longer caught** (corrected later) must not count. | **Holds:** only caught dismissals count (`detailByRec` drops a detail whose ball no longer matches); a spot on a bowled ball is ignored. Test. |
| B5-6 | **C4: `⇄ Swap` writes no event.** The commentary and the timeline can't explain the changed strike; Undo says only "strike swap". | **Fixed:** `⇄ Swap` sends `SWAP_STRIKE {v:2}`: once the innings has started it logs `⇄ STRIKE CHANGED — X on strike`; the commentary shows it and Undo reads "STRIKE CHANGED (4.3)". Tests; simulation (every logged swap is one note). |
| B5-7 | **C4: logging every swap would add an event to old logs** (the frozen logs contain `SWAP_STRIKE`), changing their replayed state. | **Holds:** a swap without `v` (every older log, and the post-wicket "Who's on strike now?" card in LiveScoringScreen, left untouched) stays silent; the frozen logs replay byte-identically. Tests. |
| B5-8 | **C4: a swap with an empty crease** (setup) must not log a confusing "undefined on strike". | **Fixed:** a `v:2` swap with an end empty does nothing; during setup (no ball yet) it swaps silently. Test. |
| B5-9 | **C10: the toss isn't in the commentary** (only the summary line has it). Adding a `SET_TOSS` event would change old logs. | **Fixed:** read-side: the commentary opens innings 1 with "🪙 X won the toss and elected to bat / bowl" (also before ball 1). `SET_TOSS` still logs nothing, so no state changes. Tests. |
| B5-10 | **DRS (R9): reviews aren't tracked.** No per-side count, no upheld / overturned / umpire's call, nothing in Stats or Commentary. | **Fixed:** match rule `reviews` (Off by default, 1–5 per side per innings) in ⚙️ Match rules, so Info lists it ("DRS reviews: 2 per innings"); new `REVIEW {v:2, side, outcome, batterId?}` action (score-neutral) → `state.reviews`, a `📺 DRS REVIEW` event, `reviewsLeft()`; Scoring shows "📺 Reviews left — A 2 · B 1" and a who / outcome panel; the Stats Compare tab gets a DRS card; commentary "DRS — Team: Out decision overturned — review retained · 2 left". Tests. |
| B5-11 | **DRS hostile:** a REVIEW with the setting off, an unknown side / outcome, with no reviews left, after the match ended or in a live Super Over must change nothing. | **Fixed:** refused when off, without `v:2`, with an unknown side / outcome, with none left, after the end, in a live Super Over; a non-text batterId is dropped. Tests; simulation with hostile payloads. |
| B5-12 | **DRS:** "umpire's call" and an overturned decision keep the review; only an upheld (struck down) one is lost; the count resets each innings. | **Fixed:** only `upheld` costs a review; the count is per innings. Tests; simulation (0 ≤ left ≤ count). |
| B5-13 | **DRS:** the setting must show in Info (Match rules) and only be offered in Scoring when on (off by default). | **Fixed:** a `choice` field (not a toggle), so Info shows it as a rule line; the Review button renders only when `reviews > 0`. Test (`matchCaptures`). |
| B5-14 | **C5: Impact Player / concussion subs aren't marked on the scorecard.** A concussion sub stores no structured record (only a timeline note). | **Fixed:** `subMarks`: the Impact Player who came in gets ⚡, a concussion replacement "(concussion sub)" on the scorecard. The UI now sends `v:2` on subs; a `v:2` CONCUSSION_SUB naming the player on records `concussionSubs`. Tests. |
| B5-15 | **C5: storing a concussion record for every CONCUSSION_SUB would change old logs.** | **Holds:** a sub without `v:2` (older logs) adds no key; those matches show no concussion mark. Test. |

## Not done in this batch (size L)
- CK-09 multi-innings: two innings each, declaration, follow-on, innings victory (audit fix 4). **Not done.**
- Also not in scope here: last man stands, powerplay after a rain cut, free-hit policing, "c sub (X)" (audit fixes 5, 6, 8, 12b).

## Notes
- Overturning an OUT is two steps: Undo the wicket, then log the review (the panel says so). An automatic undo would reorder the event log.
- A review in a Super Over is not offered (ICC allows one; left out for now).
- Not checked on a device: the new panels are type-checked, not demo-driven.

## Results
- tests/cricket-batch5.test.mts: 28 tests. tests/sim-cricket-batch5.test.mts: 600 random two-innings matches.
- `node --test tests/cricket*.test.mts tests/sim-cricket*.test.mts tests/ids-only-cricket.test.mts`: 483 pass, 0 fail. Full suite 6,542 tests: only timing-sensitive pool / student-list sims failed under full-suite load (unrelated to cricket); they pass when run alone (56/56). `npx tsc --noEmit -p .` clean.
- Pinned test updated: tests/pad-icons.test.mts, `['swap', 'strike changed']` added to its SAME list (the ⇄ Swap button and its new timeline entry are the same action, so they share the icon).
