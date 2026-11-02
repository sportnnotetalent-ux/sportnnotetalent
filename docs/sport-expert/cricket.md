# Cricket: every way a delivery ends, and the Info → Scoring → Stats chain (expert audit, 2026-11-02)

An international scorer's read of the cricket scoring mechanism, following the tennis model (`docs/security/breaks/tennis-serve-and-endings.md`, `tennis-endings-depth.md`). The audit was **read-only**. It is a list made before any fix (quality mandate step 4). Each fix gets its own failing test first.

It does **not** repeat solved items. The CricHeroes parity queue (docs/cricheroes-parity), `docs/sport-depth/cricket.md`, the SD-109 scorer UX audit and both deep waves already cover overthrows, the run-out end, Mankad, penalties on a ball, the wagon wheel, the pitch map, speed, control, bowler type, wide/no-ball reasons, phases, the bouncer limit, DLS v3, rain par, the Super Over, Hundred rules, retire-at-N, keeper/captain stats and the records leaderboards. Of the older open items, these were re-checked against the code and are **still open**:
- R6: free-hit policing is UI-only.
- A5: a strike swap is silent.
- R7: there is one powerplay band.
- R8: there is no "last man stands".
- R9: DRS is not tracked.
- CK-09: there is no multi-innings format.

Files: `src/sports/cricket/index.tsx` (scorer UI), `engine.ts` (reducer), `rules.ts`, `meta.ts`, `commentary.ts`, `matchStats.ts`, `stats.ts`, `src/screens/LiveScoringScreen.tsx`.

## 1. Every way a delivery ends (MCC Laws 2017, 3rd ed. 2022; ICC Men's T20I / ODI playing conditions)

✓ = recorded correctly. Partial = possible but awkward, or only part of the Law. ✗ = no way to record it.

### Runs

| Delivery outcome | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Dot, 1, 2, 3 | Runs to the striker; odd runs swap ends | Run pad `0 1 2 3`, one tap (index.tsx:1446-1450); the engine rotates strike (engine.ts:1353-1356) | ✓ |
| Boundary 4 / 6 | Boundary allowance, a 4s / 6s count | Pad `4` / `6` send `boundary:true` | ✓ |
| All-run 4, 5, 7 | Runs, not a boundary | `5·7·+` key → "All run" 4/5/7 (index.tsx:1452-1472), or type other runs | ✓ |
| Overthrows (incl. an overthrow boundary, Law 19.7) | Runs completed + overthrows, to the striker | `5·7·+` → runs completed 0-3 + overthrows 1-4 ("4 (boundary)") (index.tsx:1475-1488). The "run in progress if crossed" part of Law 19.7 is left to the scorer's sum | ✓ |
| Short run, unintentional (Law 18.9) | The short run isn't scored | Tap one run fewer. There is no "one short" tag, so commentary and Undo can't say it | partial |
| Short run, deliberate (Law 18.10) | Runs disallowed + 5 penalty runs to the fielding side | Tap 0, then ⚖️ Penalty → batting side → "Short run" (index.tsx:521). Two separate steps, and the screen never tells the scorer to zero the runs | partial |

### Extras

| Delivery outcome | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Wide (+ runs run, + 4 past the keeper) | 1 + runs, all wides charged to the bowler, not a ball | `Wide` → `Wd`, `Wd+1…+4 (=5)` or type (index.tsx:1538-1549) | ✓ |
| No-ball + runs off the bat (incl. 4 / 6) | 1 nb + bat runs to the striker; a ball faced, not a ball of the over; free hit | `No ball` → `Nb`, `+1…+6` (index.tsx:1505-1515) | ✓ |
| No-ball + byes / leg byes (Law 21.13) | nb penalty + byes as team extras; the bowler is charged only the nb | `No ball` → Byes / Leg byes chip → `Nb+n` (index.tsx:1518-1530) | ✓ |
| Free hit | The next legal ball: only the non-bowler dismissals; carries over a wide / no-ball | Engine sets it (engine.ts:1598); FREE HIT pad tint; the wicket list shrinks (index.tsx:252, 912) | partial: the reducer doesn't refuse a bowled / caught on a free hit (voice or the over editor can bypass; R6) |
| Byes / leg byes (incl. 4) | Team extras; a ball faced, not charged to the bowler | `Bye` / `Leg bye` → `B 1…5` / `LB 1…5` or type (index.tsx:1558-1572); refused by the engine when the local rules ban them (engine.ts:1363) | ✓ |
| Penalty runs: 5 (helmet, illegal fielding, fake fielding, time wasting, damaging the pitch, ball tampering, stop-clock 3rd breach) | 5 to the other side, as extras; may make the ball not count | ⚖️ Penalty → side → reason chips (index.tsx:518-530, 598-626); "on the next ball" arming (R2 done); goes to the fielding side's innings even before it bats | ✓ (stop-clock and beamer warning **counts** are not kept, see P2) |
| Local rules: wide / nb runs and legality, no byes, standard rules in the last N overs | Per the organiser | Match rules card (rules.ts:244-285) | ✓ |

### Dismissals

| Delivery outcome | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Bowled, LBW, hit wicket | Bowler's wicket; new batter takes strike unless the over ended | WICKET → chip → next batter → Confirm (index.tsx:976-1107) | ✓ |
| Caught (incl. c & b) | Bowler + catch; Law 18.11 (2022): the new batter is always on strike unless the over ended | WICKET → Caught → "c & b X" first, keeper first (index.tsx:1029-1038); vacated striker's end (engine.ts:1393-1395) | ✓ |
| Caught off a no-ball / a free hit | Not out | Caught isn't offered off a no-ball or on a free hit (index.tsx:910-913); the engine refuses a bowler's wicket off nb (engine.ts:1612) | ✓ (free hit: UI only) |
| Stumped (incl. off a wide) | Bowler + keeper | WICKET → Stumped, or Wide → "…or a WICKET off the wide" (index.tsx:1550) | ✓ |
| Run out: which batter, which end, runs completed, byes / nb runs, direct hit, 2nd fielder | Fielder credit; completed runs count; the new batter takes the broken end | Run out → runs 0-3 + "Runs were" → fielder → optional 🎯 Direct hit / + 2nd fielder → one combined "who's out · which end" chip (index.tsx:1001-1075); `creaseAfterWicket` (engine.ts:547) | ✓ |
| Run out off a wide / no-ball | Wide / nb + runs + wicket | "…or a WICKET off the wide / no-ball" → Run out | ✓ |
| Non-striker run out backing up (Law 38.3, ex-41.16) | A run out, not a ball, no bowler's wicket; the free hit stays pending | More ▾ → "Mankad" (engine.ts:1398-1418); the scorecard reads "run out (bowler)" | ✓. The chip **label** "Mankad" isn't the Law's word (P2) |
| Hit the ball twice | Striker; not the bowler's | More ▾ → Hit twice; also off a no-ball | ✓ |
| Obstructing the field (incl. handled the ball, merged in 2017) | Not the bowler's; completed runs count | More ▾ → Obstructing, with the inline hint (index.tsx:258) | ✓ |
| Timed out | A wicket, no ball | More ▾ → Timed out (also on a free hit) | ✓ |
| Retired hurt / retired not out / retired out | Hurt: not a wicket, may resume; out: a wicket | More ▾ → Retired hurt / Retired out; the retire-at-N panel (index.tsx:1127-1157); a resuming batter is labelled "(resumes, 23*)" | ✓ |
| No batter left (absent / hurt, short squad) | The innings closes, counted all out | "Confirm wicket — innings closed" (index.tsx:1110-1115) | ✓ |

### Match events

| Delivery outcome | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Dead ball (Law 20) / ball not counted | Nothing scored | Nothing to tap (correct). A penalty that voids the ball says "Undo it" (index.tsx:618) | ✓ |
| New-batter crossing rule | See caught / run out | Engine | ✓ |
| Strike corrected by hand | — | `⇄ Swap` (index.tsx:1283) → `SWAP_STRIKE` with **no timeline event** (engine.ts:1775) | partial (A5): commentary can't explain the change, Undo has no name for it |
| Bowler injured / suspended mid-over (Law 17.8, 41) | Balls stay with the 1st bowler; both sit out the next over; suspended = barred for the innings | "Change" → Injured / Suspended / Other → who finishes (index.tsx:1410-1430; engine.ts:1800-1808) | ✓ |
| Bowler over the quota / consecutive overs | Refused | Chips greyed; "Allow anyway" logs a ⚠️ quota override | ✓ |
| Beamer / dangerous bowling warnings → suspension (Law 41.7) | 2nd beamer = removed | Reason chip "Above waist" (extraWhy, if on); suspension done by hand | partial: no warning count or prompt |
| Bouncers per over (ICC 1 T20I / 2 ODI) | Over the limit = no-ball | `bouncerMax` + warning, **only when the pitch map is on** (rules.ts:279-284) | partial |
| Powerplay | Fielding restrictions | One band, overs 1–N (engine.ts:419-424); stats phases can be set apart (rules.ts:266-277) | partial: no ODI P2 / P3; a rain cut **doesn't shorten the powerplay** (ICC reduced-overs table) |
| Over-rate penalty in the match (ICC 2022: one fewer fielder outside the circle) | Fielding only | — | ✗ (display only) |
| Strategic timeout (IPL) | No score effect | — | ✗ (a timeline note at most) |
| DRS / player review | Reviews per side per innings; "umpire's call" keeps it | — (an overturned decision = Undo) | ✗ (R9) |
| Impact Player (IPL) | One sub per side; the replaced player takes no further part | Quick options → Impact sub (LiveScoringScreen.tsx:2376; engine.ts:1738-1756) | ✓ live; not marked on the scorecard (P2) |
| Concussion replacement (like-for-like) | The same | Quick options → Concussion sub (engine.ts:1757-1774) | ✓ live; not marked on the scorecard |
| Substitute fielder catch ("c sub (X)") | The catch counts; the scorecard says sub | A squad player can be picked, but the text reads "c X b Y". The format's `substitutes` count does nothing | partial |
| Change of wicket-keeper | Later stumpings go to the new keeper | Keeper † re-pick → 🧤 NEW KEEPER event (engine.ts:1832-1850) | ✓ |
| DLS / rain: reduced before start, cut mid-innings, innings 1 ended by rain, no more play (par), manual target | Revised target / result on par / no result | ⏱ Overs & target card → Change overs / ☔ Rain (DLS) / Set target / ☔ Innings ended by rain / ☔ No more play (index.tsx:328-420); live par chip (index.tsx:1163) | ✓ |
| Super Over / Super Five, repeated, ICC eligibility | Tie decider | Tie call card → 🔥 Start Super Over (index.tsx:70-140) | ✓ |
| Chase not finished, no rain (bad light, time up, conceded) | Limited overs: a no result, or the umpires award it. A timed game: a **draw** | `End match` sends `END`, and `outcome()` then gives the defending side "Won by N runs" (engine.ts:2124-2127; index.tsx:1599-1610). The "No more play" route exists only when overs < 100, so a Test / 2-day game has none. Manual end calls the draw **"Tie"** (index.tsx:2475) | ✗ wrong result (P0) |
| Declaration, follow-on, 2 innings each | Timed cricket | "Test / timeless" = one innings each | ✗ (CK-09) |
| Last man stands (box / gully) | The last batter bats alone | — | ✗ (R8) |

## 2. The chain: Info → Scoring → Stats / Commentary

**Link 1 (Info holds every setting).**
- The Info tab shows the Format line (`formatLine`, LiveScoringScreen.tsx:2911-2925) and the ⚙️ Match rules card. The card covers every local rule and every "Stats to track" toggle (LiveScoringScreen.tsx:2793, rules.ts:295-310), and everyone can see it.
- The format can't be edited live (`canChangeLiveFormat` excludes cricket, formatChange.ts:41-43). That is correct: after ball 1, changes are `SET_RULES` events.

**Breaks**

| # | Link | Break | Pri |
|---|---|---|---|
| C1 | Scoring → result | The format allows a timed / unfinished game, but `End match` mid-chase awards the defending side a win by runs. The timed format has no draw, and the manual end says "Tie" for a draw. A tie and a draw are different results in cricket | **P0** |
| C2 | Scoring offers → capture possible | The `Defended` shot type is on offer but can never be tagged: the shot panel opens only after runs off the bat (`lastRec.bat > 0`, index.tsx:1179-1181). No shot type can be recorded for a **dismissal** or a dot ball either, so "out pulling" and "dismissals by shot" are impossible | P1 |
| C3 | Capture → Stats | The catch position ("Where was the catch taken?", BallDetailPanel.tsx:120, `cz`) reaches only the commentary (commentary.ts:401). It never reaches the Stats tab (no catch map, no "caught in the deep" split; matchStats.ts has no `cz`) | P2 |
| C4 | Capture → Commentary | `⇄ Swap` logs nothing (engine.ts:1775), so a corrected strike is invisible in the commentary and timeline | P2 |
| C5 | Capture → Stats / scorecard | Impact Player and concussion subs reach the commentary as notes, but the scorecard has no ⚡ / "(concussion sub)" mark (scorecard.ts has no `impact`) | P2 |
| C6 | Info → Scoring | The format's `substitutes` setting (meta.ts:72) has no effect in cricket: no sub list, no "c sub (X)" | P2 |
| C7 | Info → Scoring | `pitchType` and `ballType` (meta.ts:37-46) have no effect on scoring. That is intended (pitch is informational). But ball type should split careers (CK-03); check it is wired before calling it done | P2 |
| C8 | Info shows the settings | The Format line shows overs, side size, subs, balls/over, Impact and powerplay only. It leaves out ball type, tie-break (Super Over vs tie stands), DLS on/off, bowler quota, minimum overs, Hundred rules and non-standard local rules (the `rulesChip` text appears only on the Scoring tab) | P2 |
| C9 | Default hides depth | The bouncer limit works only with the pitch map on. A scorer who wants just the bouncer count must turn on the full line-and-length capture | P2 |
| C10 | Scoring → Commentary | The toss isn't in the commentary (`SET_TOSS` logs no event; only the summary line has it). Cricinfo opens with it | P2 |
| C11 | Info → Scoring | Powerplay overs stay as set after a rain cut, so the live powerplay strip and the "auto" stats phase are wrong in a shortened game | P2 |

**Holds:**
- Every "Stats to track" toggle (wagon wheel, pitch map, control, speed, bowler type, wide / nb reason) is set in Info, offered in Scoring only when on (`BallRec.trk`), and reaches both the Stats tab and the commentary, with "not tracked" when it is off.
- Each of these items is recorded and reaches the Stats tab, the commentary or both:
  - field notes (drop / saved / missed)
  - direct hits
  - penalty reasons
  - rain / DLS events
  - bowler replacements
  - keeper changes
  - retire-at-N
  - ball time stamps
- I found no Stats row without a way to record it. The keyed rows are `coverage: 'keyed'`.

## 3. Ranked fix list

The practicality filter for every item is one scorer on one phone: every new capture is optional and comes after the ball, and one tap still scores. Event-log rule: old logs must replay identically, so new behaviour is gated on `v: 2` or a new key or action.

| # | Pri | Size | What changes | Event-log impact | Practicality |
|---|---|---|---|---|---|
| 1 | **P0** | S | **Unfinished chase / timed draw (C1).** `End match` with the chase alive (wickets and overs left, no target reached) asks one question: "No result · Draw (timed game) · Award to X". It sends `END {v:2, how}`. `outcome()` honours `how`. The result kind `draw` is separate from tie, and manualEnd's `drawLabel` reads "Draw" for a timed format (oversLimit ≥ 100). "No more play" is offered in a Test-preset game too | New optional payload on `END`. Legacy `END` (no `v`) replays as today | One extra tap, only in the rare case |
| 2 | P1 | S | **Shot type for dismissals and dots (C2).** With the wagon wheel on, the shot chips (no field tap) also show after a wicket off a delivery and after a dot. `Defended` becomes reachable. Stats: "dismissals by shot", "dot balls defended" | `SHOT` already keyed by ball. `runs: 0` / a wicket ball is a new combination; older logs have none | Optional; Skip / next ball closes it |
| 3 | P1 | M | **DRS / reviews (R9)** as a "Stats to track" toggle `reviews` (+ per-innings count, default 0 = off; ICC T20I 2, ODI 2 pre-2023 / 3). A "Review" chip in Quick options → batting or fielding side → Upheld / Struck down / Umpire's call (retained). The pad shows "Reviews left 1·2". The commentary gets a note. An upheld out-overturn = Undo of the wicket plus the note | New `REVIEW` action (score-neutral); absent in old logs | Off by default; club cricket never sees it |
| 4 | P1 | L | **Multi-innings (CK-09)**: two innings each, `DECLARE`, follow-on, innings victory, draw. Needed for school 2-day fixtures; pairs with #1 | New actions plus `inningsNo` on BallRec. One-innings logs unchanged | Only in the Test / 2-day preset |
| 5 | P2 | M | **Last man stands (R8)**: a local-rule toggle. The last batter may bat on alone; strike never rotates; the innings ends at the true all out | New rules key, present only when on | Box / gully cricket; off by default |
| 6 | P2 | S | **Powerplay follows a rain cut** (ICC reduced-overs table) **plus ODI P2 / P3 bands** shown on the strip (C11, R7) | Derived from `oversLimit` under `dlsV === 2` only; the display only | None |
| 7 | P2 | S | **Strike swap logged (C4, A5)**: `SWAP_STRIKE {v:2}` writes a "Strike changed" event; Undo is named | `v:2` only; legacy swaps stay silent | None |
| 8 | P2 | S | **Free-hit policing in the reducer (R6)**: a `v:2` bowler's wicket on a free hit is refused (voice, over editor) | `v:2` gate | None |
| 9 | P2 | S | **Info Format line completes (C8)**: ball, tie-break, DLS, quota, minimum overs, Hundred, plus the `rulesChip` text | Read-only | None |
| 10 | P2 | S | **Catch map in Stats (C3)**: "Catches by area" (ring / deep, off / leg) from `cz` | Read-only | None |
| 11 | P2 | S | **Bouncer count without the pitch map (C9)**: a one-chip "Bouncer" tag after a ball when the limit is set but the pitch map is off | `BALL_DETAIL len:'bouncer'` already exists | Optional |
| 12 | P2 | S | **Scorecard marks** Impact / concussion subs and "c sub (X)"; the `substitutes` count gives a sub-fielder list (C5, C6) | Read-only, plus an optional `sub:true` on a fielder pick (v:2) | None |
| 13 | P2 | S | **Small Law polish**:<br>- a "1 short" chip in `5·7·+`, which records runs − 1 and says "one short" in the commentary<br>- a deliberate short run pre-fills 0 runs with the penalty<br>- rename the "Mankad" chip "Run out (backing up)" (Law 38.3), with "Mankad" kept as a search alias<br>- the toss in the commentary (C10)<br>- beamer and stop-clock warning counts that prompt at the limit<br>- a strategic-timeout note | Optional `short:1` on `RUNS` (v:2); the rest is labels and read-side | Optional |
| 14 | P2 | M | Over-rate in-match penalty (one fewer fielder outside the circle) as a fielding note on the strip | A new note event | Display only |

**Not worth building (one phone):** ball-tracking LBW / UltraEdge detail, fielder GPS, xRuns. These were already ruled out in `deep-wave/cricket.md`.
