# Racket sports: the scorer's tap-by-tap mechanism (2026-11-02)

Badminton, table tennis, squash, padel, pickleball. The model is the tennis pass (`docs/security/breaks/tennis-serve-and-endings.md`, `tennis-endings-depth.md`). Items already listed in `docs/sport-depth/audit-2/racket.md` are named by their id (TT-a, PB-f …) and not repeated as new findings.

Read-only audit. Nothing was changed except this file.

**How capture works today (all five).** The scorer taps who won the rally (`PointButtons`). With "Point detail" on, a card under the buttons (`src/sports/PointDetailRow.tsx`) describes the LAST rally: How → Forehand / Backhand → shot → error or fault type → "By:" (doubles, errors only). Each tap is a `POINT_DETAIL` that annotates the point (no score effect). The hows per sport are `DETAIL_HOWS` in `src/sports/pointDetail.ts:480-492`. **Point detail is off by default in all five** (`pointDetailSettings.ts:63`, no `on: true`), so out of the box none of the "how it ended" rows below are ever asked.

Legend: ✓ captured · partial · ✗ cannot be recorded. "Detail" = only with Point detail on.

---

## 1. Badminton (BWF Laws 9, 13, 16)

| How it ends | Who wins it | How the scorer records it now | Gap |
|---|---|---|---|
| Service fault: above 1.15 m | receiver | Detail → Service fault → "Too high" (`pointDetail.ts:482`) | ✓ (detail) |
| Service fault: foot fault (feet moving / on the line) | receiver | Detail → Service fault → Foot fault | ✓ (detail) |
| Service fault: into the net / out (short of the short service line, long in doubles, wrong court) | receiver | Detail → Service fault → Net / Out | ✓ (detail) |
| Service fault: missed shuttle, balk / feint, undue delay, hit not on the base | receiver | Detail → Service fault → "Fault", labelled "Fault (touch / double hit)" (`pointDetail.ts:438`): wrong words for a serve | partial |
| **Receiver fault**: receiver moves before the serve, wrong court, partner hits the serve | server | Nothing: Service fault is offered only when the receiver won (`PointDetailRow.tsx:102`); UE is wrong | ✗ |
| Serve not returned (flick / drive serve winner) | server | Detail → Winner → shot "Serve" | ✓ (detail) |
| Winner by shot (smash, jump smash, drop, clear, net shot, net kill, drive, lift, push, block) | hitter | Detail → Winner → wing + shot | ✓ (detail) |
| Unforced error: net / out / fault | other side | Detail → Unforced error → Net · Out · Fault | ✓ (detail); "out" is not split long / wide (P2) |
| Forced error | other side | Detail → Forced error + wing / shot | partial: **no type** (net / out), unlike tennis |
| Lost by rule (Law 13): shuttle hits the player, touches the net, invades the opponent's court, obstruction, double hit / sling | other side | Only as Unforced error → "Fault", which inflates UE | ✗ |
| Let (Law 14) | none | Nothing (no score effect) | ✓ by design; marker = BD-d |
| Misconduct: yellow / red (fault = point) / black | opponent | Quick options → Misconduct (`conduct.ts`, `RacketQuickOptions.tsx`) | ✓ |
| Service-court error (Law 12) | score stands | Server is derived from the score, so nothing to fix | ✓ |

## 2. Table tennis (ITTF 2.6, 2.9, 2.10, 3.5)

| How it ends | Who wins it | How the scorer records it now | Gap |
|---|---|---|---|
| Ace (legal serve not returned) | server | Detail → Ace (server only) (`pointDetail.ts:484`) | ✓ (detail); no one-tap Ace |
| Service fault: net / misses the table / illegal (toss under 16 cm, hidden, not from the open palm, doubles wrong half) | receiver | Detail → Service fault → Net · Out · Illegal | ✓ (detail) |
| Let (serve touches the net and lands in; disturbance) | none | Nothing | ✓ by design; marker = TT-b |
| Receive error | server | Detail → Unforced / Forced error + shot "Receive" | ✓ (detail) |
| Winner by shot (flick, push, chop, loop, block, smash, lob) | hitter | Detail → Winner → wing + shot | ✓ (detail) |
| Unforced error: net / out | other side | Detail → Unforced error → Net · Out | ✓ (detail) |
| Forced error | other side | Detail → Forced error + wing / shot | partial: **no type** |
| Edge ball / net cord winner | hitter | Only as a plain Winner | partial (TT-b) |
| Lost by rule (2.10.1): obstruction, double hit, free hand on the table, moves the table, touches the net assembly | other side | Nothing fits; scorer must pick UE or leave blank | ✗ |
| Cards: yellow → yellow + red 1 pt → 2 pts → referee | opponent | Quick options → Cards | ✓ |
| Expedite (after 10 min the service alternates; 13 returns = receiver's point) | receiver | Nothing | ✗ (TT-a) |
| Timeout (1 per match) | none | Quick options → Timeout | ✓ |

## 3. Squash (WSF Rules 5, 6, 8, 15; PSA)

| How it ends | Who wins it | How the scorer records it now | Gap |
|---|---|---|---|
| Service fault: foot fault | receiver | Detail → Service fault → Foot fault (`pointDetail.ts:486-490`) | ✓ (detail) |
| Service fault: below the service line on the front wall | receiver | Detail → Service fault → "Short", labelled "Short (below the service line)" (`pointDetail.ts:445`) | partial: two different faults share one chip |
| Service fault: first bounce on / in front of the short line; wrong half | receiver | Same "Short" chip | partial |
| Service fault: out / side wall first | receiver | Detail → Out | partial (side wall first has no chip) |
| Winner by shot, incl. the nick | hitter | Detail → Winner → wing + shot (drive, drop, boast, volley, lob, kill, nick) | ✓ (detail) |
| Unforced error: tin / out | other side | Detail → Unforced error → Tin · Out | ✓ (detail) |
| Forced error | other side | Detail → Forced error | partial: **no type** |
| Let (replayed) | none | "🔁 Let · X asked" buttons (`rallyCore.tsx:117-123`) | ✓ always on; counted in Stats and careers |
| Stroke | the player awarded | "✋ Stroke → X" one tap (`rallyCore.tsx:125-126`) | ✓ always on |
| No let | the other player | "🚫 No let → X" one tap (`rallyCore.tsx:129-130`) | ✓ always on |
| Lost by rule: not up (double bounce), double hit / carry, ball hits the striker | other side | Nothing fits | ✗ |
| Conduct warning / stroke / game / match | opponent | Quick options → Conduct | ✓ |
| Video review (upheld / not) | none | Nothing | ✗ (SQ-e) |

## 4. Padel (FIP Rules, Premier Padel stats)

| How it ends | Who wins it | How the scorer records it now | Gap |
|---|---|---|---|
| Ace | server | "🎯 Ace · X" one tap (`padel/index.tsx:91`) | ✓ |
| Service winner | server | Detail → Service winner | ✓ (detail) |
| **1st-serve fault** (net, long, wrong box, bounces in the box then hits the wire mesh, foot fault, hit above the waist) | none: 2nd serve | **No Fault button.** Only a "2nd serve" chip after the point, with "1st / 2nd serve" switched on (off by default) (`PointDetailRow.tsx:195-199`) | ✗ (tennis TF1 not ported) |
| Double fault | receiver | "⚠️ Double fault" one tap (`padel/index.tsx:92`) | ✓; **no fault type** |
| Let on serve | none | Nothing | ✓ by design |
| Winner by shot (return, volley, bandeja, víbora, smash, por tres, lob, chiquita, bajada, off the glass, drop) | hitter | Detail → Winner → wing + shot | ✓ (detail) |
| Unforced error: net / out (incl. straight into the opponent's glass) | other side | Detail → Unforced error → Net · Out | ✓ (detail) |
| Forced error | other side | Detail → Forced error | partial: **no type** |
| Lost by rule: touches the net, hit by the ball, double hit, played before it crossed the net, double bounce | other side | Nothing fits | ✗ |
| Golden / Star point | either | Banner + stats "Golden / Star points won" | ✓ |
| Code violation (warning → point → game → disqualification) | opponent | Quick options → Code violation | ✓ |
| Time violation | depends | Nothing (only tennis has the time track) | ✗ (P2) |

## 5. Pickleball (USA Pickleball rulebook, PPA)

| How it ends | Who wins it | How the scorer records it now | Gap |
|---|---|---|---|
| Serve not returned (ace) | server | Only "Winner" with no shot: pickleball has no Ace how and no "Serve" shot (`pointDetail.ts:492`) | partial |
| Service fault: net / out / kitchen (on the NVZ line) / foot fault | receiver (rally) or side-out / 2nd server | Detail → Service fault → Net · Out · Kitchen · Foot fault | ✓ (detail) |
| Service fault: illegal motion (above the waist, paddle above the wrist, spin), 10-second rule, wrong server | receiver | No chip | partial |
| **Receiver fault**: volleys the serve (two-bounce rule), wrong receiver | server | Nothing (Service fault is not offered to the server) | ✗ |
| Serving team volleys the return (two-bounce rule) | receiver | Nothing fits but UE | ✗ |
| Winner by shot (return, drive, drop, dink, volley, reset, lob, overhead, Erne, ATP) | hitter | Detail → Winner → wing + shot | ✓ (detail); **in side-out doubles the credit goes to the server, not the hitter** (see P0 below) |
| Unforced error: net / out / kitchen (volley in the NVZ) / foot | other side | Detail → Unforced error → type | ✓ (detail) |
| Forced error | other side | Detail → Forced error | partial: **no type** |
| Lost by rule: net touch, hit by the ball, crossing the net plane | other side | Nothing fits | ✗ |
| 3rd shot, kitchen arrival | (stat) | Detail rows "3rd shot", "Kitchen line" incl. Nobody | ✓ (off by default) |
| Technical warning / foul / forfeit | opponent | Quick options → Technical | ✓ (side-out scoring of a technical: PB-f, unverified) |
| Timeouts 2 / 3 per game, medical | none | Quick options | ✓ |

---

## The chain: Info → Scoring → Stats / Commentary

| # | Link | Break | Sports | Where |
|---|---|---|---|---|
| C1 | Info holds every setting | **The Info "Format" line says almost nothing.** `formatLine` has no case for table tennis, squash, padel or pickleball: they show only "1-a-side" / "2-a-side". Pickleball side-out vs rally, squash PAR vs English, points to win, best of, padel deuce rule (advantage / golden / Star) and match tiebreak never appear. Badminton shows points and best-of only (no cap / golden point). | TT, SQ, PD, PB (BD partly) | `src/screens/LiveScoringScreen.tsx:2911-2945` |
| C2 | Info holds every setting | **The stat toggles show in two places that disagree.** "Edit date, venue & format" is meant to hide them (`omitKeys … /^track[A-Z]/`), but the racket keys are `pointDetail`, `rallyDetail` … so the filter never matches. The form shows the format value (e.g. off) while the live state may be on through a mid-match `SET_DETAIL`. Saving there replays the whole match from point 1, whereas the Scoring settings card applies from the next point. | all 5 | `LiveScoringScreen.tsx:2757` |
| C3 | Settings → scoring | "1st / 2nd serve" (padel) has no control at serve time: no Fault button, only a "2nd serve" chip after the point. The scorer must remember the miss and correct each point by hand. | PD | `PointDetailRow.tsx:132,195-199`; `padel/index.tsx:90-93` |
| C4 | Settings → scoring | The Scoring settings card speaks cricket: "Apply from next ball", "Balls already bowled keep the rules …", toast "New rules apply from the next ball". | all 5 (and tennis) | `src/components/LiveSettingsCard.tsx:71,130,135` |
| C5 | Captured → Stats | Forced errors carry no type, so there is no "forced errors into the net" row. The tally only types `ue` and `sf`. | all 5 | `racketMatchStats.ts:222-223`; `PointDetailRow.tsx:178` |
| C6 | Captured → Stats / careers | **Side-out doubles credits every serving-side winner to the server.** `rallyWon` attributes the point to the server (`rallyCore.tsx:216`). `detailPlayerCredits` then gives the Winner to that player id (`pointDetail.ts` `detailPlayerCredits`, `racketTotals.ts:268-276`). In rally-scoring doubles a winner reaches careers only if the scorer long-pressed a player before the tap. There is no "By:" for winners in the detail card (only for errors, `PointDetailRow.tsx:186`). | PB (side-out doubles is the tournament default), SQ English doubles; BD / PD / TT doubles uncredited | as cited |
| C7 | Captured → Stats | Conduct (cards, penalty points, technicals) and timeouts reach the timeline and the commentary, but **no Stats-tab row** (no "Penalty points" / "Cards" / "Timeouts"). | all 5 | `racketMatchStats.ts` (no `pen` handling) |
| C8 | Stats ← capture | The badminton "Fault" UE type is read as "Unforced errors · fault (touch / double hit)". A rule loss is counted as an unforced error. Once "Lost by rule" exists, the row needs to stay for old logs. | BD | `pointDetail.ts:438,482` |
| C9 | Default hides depth | **Point detail is off by default in all five.** Winners, errors, aces (TT), service faults and shots are never asked on a new match, so Stats shows only serve / points / games and careers write "not tracked". This is the same defect as tennis TF2. Padel's "1st / 2nd serve" is also off (tennis TF3). | all 5 | `pointDetailSettings.ts:63-64` |

Links that hold: every "Stats to track" toggle in Info has a live effect on the detail card; Info's card and the card's "Extra stats: Choose" chips write the same `SET_DETAIL`; every how, shot, error / fault type, net / kitchen mark, rally bucket and 3rd shot reaches both Stats (`racketMatchStats.ts`) and Commentary (`racketCommentaryModel.ts:65-86, 315-325`); squash lets / strokes / no lets reach Stats, careers and commentary; the timeline editor can edit how / shot / type (`RallyPointEditor.tsx:234+`).

**Default recommendation (C9):** turn **Point detail ON for new matches in all five sports** (`on: true` on the `pointDetail` TrackField, exactly as tennis), and **padel 1st / 2nd serve ON** together with a Fault button (F3). Leave rally length, net / kitchen line and 3rd shot off: they are a second tap per rally and are for keen stat-keepers. Scoring stays one tap: the card is optional, after the point, and the next point tap simply moves on. Do C6 first (or with this), or turning detail on in pickleball doubles writes more misattributed winners.

---

## Ranked fix list

Event-log rule: every change adds new optional keys or a new how. Old logs never contain them and replay identically; defaults apply only to new matches (the format key is absent on old ones).

| # | Pri | Size | Fix | Engine / payload | UI | Stats / commentary | Event-log impact | Practicality |
|---|---|---|---|---|---|---|---|---|
| F1 | **P0** | S | **Doubles winner credit (C6).** In side-out (and English) doubles, a winner-credit how is never charged to the event's `playerId` (that's the server, credited for scoring). Add an optional `pd.by` (the hitter, by id). | `validPd` accepts `by: {playerId}`; `detailPlayerCredits`: winner credit = `pd.by` ?? (singles' only player) ?? side-level | Detail card: "By:" chips for winner-credit hows when the side has ≥2 players (as errors have) | Career winners / shot keys go to the hitter | Score replays identically. Careers of **old side-out doubles matches change on re-sync** (winners move off the server to side-level). That corrects wrong data: needs the founder's yes | Optional, after the point |
| F2 | **P1** | S | **Point detail ON by default (C9)** for badminton, TT, squash, padel, pickleball (+ padel 1st / 2nd serve with F3). | none | `on: true` in `trackFields` (`pointDetailSettings.ts:63-64`) | Winners / errors / shots appear on new matches | None (new matches only; old keep their format) | Card is skippable; one tap still scores |
| F3 | **P1** | M | **Padel Fault (1st serve) button + fault type** (tennis TF1 / FT1 port). | Move tennis `FAULT` / `FAULT_TYPE` / `sf1` / `sf2` (`tennis/engine.ts:241-337`) into a shared serve-fault helper; padel engine uses it. Types: net, long, wide (wrong box), **wire mesh**, foot fault | "✋ Fault (1st serve)" beside Ace / Double fault; "Fault again = double fault"; type chips after | Padel 1st serve %, win on 1st / 2nd from real taps; fault-type rows; commentary "1st serve into the net" | New action types only; old logs replay unchanged | One tap at the moment it happens; type optional |
| F4 | **P1** | S | **Forced-error type for all five (C5)**: Forced error takes the sport's UE types (net / out; tin / out; kitchen …). | `R_FE(types)` in `DETAIL_HOWS`; new keys `feNet`, `feOut`, `feTin` … via `detailKeys` | Type chips also for `fe` (`PointDetailRow.tsx:178`) | `racketTally` counts fe types; `errorTypeRows` adds "Forced errors · …"; commentary `fe` adds `(type)` (`racketCommentaryModel.ts:79`) | None: old `fe` has no `stroke`; new keys "not tracked" on old matches | Optional chip |
| F5 | **P1** | M | **"Lost by rule" in all five** (tennis LR1 port), with the sport's rule kinds as optional chips: BD hits player / net touch / invasion / double hit; TT obstruction / double hit / free hand / moved table / net touch; SQ not up / double hit / hits striker; PD net touch / hit by ball / double hit; PB net touch / hit by ball / two-bounce / crossed the plane. | Add `T_RULE` (+ kinds as `stroke`) to each sport's `DETAIL_HOWS` | New chip beside Winner / errors | Row "Points lost by rule" (`racketTally` currently drops it at `racketMatchStats.ts:211`); commentary case `rule` (missing at `racketCommentaryModel.ts:76-85`); career `ruleLosses` already exists | None; badminton's old "UE · fault" stays readable (C8) | Optional |
| F6 | **P1** | S | **Receiver faults** (BWF receiver moving / wrong court; pickleball volleying the serve, wrong receiver): a how credited to the **server**, offered only when the server won. | New how `rf` (credit loser, `serve: 'server'`) for BD and PB, or as F5 rule kinds | Chip when the server won the rally | "Receiver faults" row; commentary | None | Optional |
| F7 | **P1** | S | **Info Format line for every racket sport (C1)**: Singles / Doubles; scoring (PAR / English, rally / side-out); points to win, win by, best of; padel deuce rule, games per set, match tiebreak; badminton cap. | none | `formatLine` cases (`LiveScoringScreen.tsx:2911`) | — | None | Read-only |
| F8 | **P2** | S | **Edit-format sheet shows stat toggles (C2)**: omit every `liveSettings` field key for racket sports (or fix the filter to the plugin's actual keys). | none | `LiveScoringScreen.tsx:2757` | — | None | Removes a second, conflicting control |
| F9 | **P2** | S | **Card wording (C4)**: "Apply from the next point / rally", "Points already played keep …". | none | `LiveSettingsCard.tsx:71,130,135` (word by sport) | — | None | — |
| F10 | P2 | S | **Fault-type labels**: badminton serve "Fault" reads "Missed / balk / delay" for `sf` (keep the id); squash split "Short" into "Below the service line" and "Short line", add "Side wall first"; pickleball add "Illegal serve". | new type ids only | chips | rows / commentary follow | None (old ids keep their meaning) | Optional chip |
| F11 | P2 | S | **Pickleball Ace** (server only, as TT / padel). Add a "Serve" shot to TT / squash / pickleball winner lists so a service winner can be named. | `ACE` in pickleball `DETAIL_HOWS`; shot ids | chip | "Aces" row appears (it keys off `DETAIL_HOWS`) | None | Optional |
| F12 | P2 | S | **Conduct and timeouts on the Stats tab (C7)**: "Penalty points conceded", "Warnings / cards", "Timeouts used", from `pen` / `timeout` marks. | none (derived) | — | `keyStats` section | None | — |
| F13 | P2 | S | Padel time violation track (as tennis: warning, then the server loses a serve). Verify against the FIP text first. | reuse `TIME_VIOLATION` with padel's serve | Quick options tile | timeline / commentary as tennis | None | Quick options only |
| F14 | P2 | S | Known, still open: TT edge / net-cord how and let marker (TT-b), TT expedite (TT-a), badminton let / shuttle-change marker (BD-d), squash video review (SQ-e), pickleball technical in side-out (PB-f). | | | | | |

## Shared racket fixes (do once)

1. **One how list, one rule set:** add `fe` types (F4), `rule` (F5) and optional receiver faults (F6) in `pointDetail.ts` `DETAIL_HOWS`. Then make `racketTally`, `errorTypeRows`, `racketSentence` and the type chips in `PointDetailRow.tsx:178` follow the how's `strokes` generically (ue / fe / sf / rule) instead of naming `ue` and `sf`. Tennis already has fe types and rule; the shared code then serves all six.
2. **Winner "By:" in doubles (F1)** in `PointDetailRow.tsx` and `detailPlayerCredits`: one change fixes pickleball, squash, badminton, padel and TT doubles.
3. **Serve-fault module (F3):** lift tennis' `FAULT` / `FAULT_TYPE` / `sf1` / `sf2` out of `tennis/engine.ts` so padel (and any future sport with a 2nd serve) uses the same code and tests.
4. **Defaults (F2):** one line per sport in `trackFields`; tennis already does it.
5. **Info chain (F7, F8, F9):** `formatLine` cases, the edit-sheet omit filter, and the card's words are all in two shared files.
