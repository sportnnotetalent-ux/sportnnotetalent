# Racket family, round 2: building the founder's answers

The founder answered the deep wave's open questions for tennis and the racket family (tennis.md §open questions, racket.md §4). This round builds those answers. The usual rules still apply. Scoring stays one tap, and new capture is optional and off by default. Old matches replay identically. Nothing untracked shows as 0. Career keys are written only when tracked, and stat lines are keyed by player id. Rule details that vary are organiser options with standard defaults.

Tests: `tests/racket-round2.test.mts` (23 tests). Pins updated for this family's lines only: `tests/leaders-awards.test.mts` (padel, table tennis and pickleball leader lists; tennis minimum rows), `tests/point-detail.test.mts`, `tests/racket-deep-wave.test.mts` and `tests/tennis-match-stats.test.mts` (the settings cards' new options, `cov.arrival`, the badminton shot list, and the minimum on "Fastest serve").

## What was built

### 1. Tennis serve speed in mph as well as km/h
- **Option.** `speedUnit` is `'kmh'` by default, or `'mph'`. It appears in three places:
  - a choice field "Serve speed unit" in ⚙️ Scoring settings (event mode: before the first point it sets the format, after that it logs SET_DETAIL);
  - an advanced format field, so the organiser sets the default;
  - a one-tap **km/h · mph** chip pair beside the speed box in the point card.

  The state carries `speedUnit` only when it is mph, so an old state is unchanged.
- **Stored values stay km/h.** `validSpeed(typed, unit)` converts on entry. mph is rounded to a whole mph and then converted to a whole km/h, so every whole mph reads back exactly (tested 19 to 168). `speedText` / `speedIn` convert on display: the Match stats "Fastest serve" and averages, the commentary meta line, and the card summary.
- **Validation per unit.** km/h must be 30–270 (unchanged). mph must be 19–168, which is the same range as km/h. The card shows the error "Type 19–168".
- Careers and leaderboards stay in km/h (labels "Fastest serve (km/h)"). A tournament can mix matches of both units, so one unit is used.

### 2. "Fastest serve" is a tournament leader with a minimum
- `srvKmhMax` was already in the tennis leaders list. It now carries `qualifier { den: 10, unit: serves clocked }` with `agg.den = 'srvKmhN'`. The leaderboard reads "min 10 serves clocked", and an organiser can change or remove the minimum (leaderMins). Ties go to the better serve average.
- **Shared-core change (additive), `statSchema.ts`.** A `max` aggregation may now declare `den` + `qualifier`. `aggregateValue` returns `den`, which is the sum over the lines carrying the figure. `qualifierOf` / `qualifierText` know about it. `validateSchema` checks the den keys and refuses a den minimum without `agg.den`. No existing stat changes. Cricket's "Fastest ball" (min balls clocked) can use the same mechanism.

### 3. Badminton: Jump smash and Block
- `RACKET_SHOTS.badminton` is now: smash, **jump smash**, drop, clear, net shot, net kill, drive, lift, push, **block**, serve. They are optional chips like the rest, on winners, unforced errors and forced errors.
- New keys: `winnersJumpSmash` / `ueJumpSmash` / `feJumpSmash` (label "Jump smash winners"…), plus `winnersBlock` / `ueBlock` / `feBlock`. The block keys are the same keys as table tennis's Block, with the same labels. Career rows hide at 0. The commentary reads "Forehand Jump Smash Winner".

### 4. Rally-length buckets are an organiser option per sport
- `RALLY_SCHEMES` holds each sport's bucket sets. The deep-wave buckets are the default (`'std'`), and every sport gets one standard alternative:

| Sport | Default | Alternative |
|---|---|---|
| Tennis | 0–4 · 5–8 · 9+ (ATP) | 1–3 · 4–6 · 7–9 · 10+ (Match Charting Project) |
| Padel, pickleball | 0–4 · 5–8 · 9+ | 1–3 · 4–6 · 7–9 · 10+ (finer) |
| Badminton | 0–4 · 5–10 · 11+ | 1–3 · 4–6 · 7–9 · 10+ (finer) |
| Table tennis | 1–2 · 3–4 · 5+ (three phases) | 1–2 · 3–4 · 5–6 · 7+ (four phases: transition, stalemate) |
| Squash | 0–5 · 6–15 · 16+ | 0–10 · 11–20 · 21+ (long rallies) |

- **The option.** `rallyBuckets` is a scheme id. It is a "Rally-length buckets" choice in Scoring settings and an advanced format field for every racket sport. Tennis now also spreads `trackFormatFields('tennis')`, so its Stats-to-track toggles became advanced format fields like the other racket sports'. `initDetailFlags` / `detailFlags` read it, and the state carries it only when it is not the default.
- **Capture.** The Rally chips offer the match's scheme. `applyPointDetail` accepts any bucket of any of the sport's schemes, and never another sport's bucket.
- **Panels and careers** read `matchRallyBuckets`: the scheme's buckets plus any other bucket a point carries (a mid-match change), ordered by length. An old match has no scheme, so it reads the deep-wave buckets as before. Career keys follow the buckets: `rl13Pts`, `rl46Won`, `rl10Pts`, `rl56Pts`, `rl7Won`, `rl010Pts`, `rl1120Won`, `rl21Pts` and so on. The schema declares every scheme's keys. A key shared across sports reads the same in each (tested). Career rows show only the buckets a player has.
- **Table tennis four phases.** Serve & 3rd ball and receive & 4th ball are identical in both schemes. The phase rows add "Transition (5–6 shots)" and "Stalemate (7+ shots)", and the panel header becomes "Four-phase analysis".

### 5. New leaders, each with a minimum
| Sport | Leader | Minimum | Tie-break |
|---|---|---|---|
| Padel | Net points won % (`netPtsPct`) | 20 net points | net points won |
| Pickleball | 3rd-shot drop success % (`thirdDropPct`: rallies won after a 3rd-shot drop) | 15 drops | drops that won the rally |
| Table tennis | Serve & 3rd ball won % (`serve3Pct`) | 30 serve & 3rd-ball points | such points won |

Each new leader is appended last to its sport's leaders, and organisers can change the minimum. Award slots and MVP weights are unchanged.

### 6. Squash: "lets asked" in careers
- `letsAsked` counts the lets each player asked, from the per-side Let buttons. Coverage is `keyed`, it shows on the career's Shot making section next to strokes and no-lets, and it is marked lower-is-better.
- It is written only on a match where a let was asked **with the side named**. An older match (one unnamed Let button) or a match without a let writes nothing, because a 0 there could be false. Careers therefore show the **total** lets asked (with the "x of y matches" coverage note), not a per-match rate.
- Doubles: the button names a side, so both of its players are credited (the family's side-figure convention).

### 7. Pickleball: "Nobody" on the kitchen line → kitchen arrival %
- The kitchen-line row is now **[Home] [Away] [Nobody]**. Nobody logs `atNet: 'none'`, which is accepted for pickleball only. Tapping a side replaces Nobody, and tapping Nobody again clears it.
- **Kitchen arrival** is calculated over the rallies with a kitchen-line mark (a side, both, or nobody). It is how often each side got there, overall, **when serving** and **when returning** (the PPA split). Unmarked rallies are "not described" and left out.
- **Only when tracked.** A match tracks arrival once a rally was marked Nobody. Before the chip existed, an unmarked rally might have meant nobody got there, so an older match never shows a false 100%. Kitchen-line rallies won is unchanged.
- **Panel** (Key stats → Points won, under "Kitchen-line rallies won"): Kitchen arrival · serving · returning.
- **Careers.** Keys `kitchenArrOf`, `kitchenSrvArr` / `kitchenSrvArrOf`, `kitchenRcvArr` / `kitchenRcvArrOf` (arrived overall = `kitchenPts`). Rates `kitchenArrPct`, `kitchenSrvArrPct`, `kitchenRcvArrPct` appear in Shot making. These are the side's figures: in doubles, both players get them.
- The commentary says "Nobody at the kitchen line". EDIT_LOG keeps the mark.

### Also
- `RallyPointEditor` (shared with volleyball, but only the racket edit path is touched): an edited rally kept its net mark, rally length and speed but **lost pickleball's 3rd shot**. It now keeps the 3rd shot too.

## Decisions taken where still unsure
1. **mph scope.** The unit is per match, set by the format default or the scorer. It covers typing, the match panel and the commentary. Careers and leaderboards stay km/h so one unit compares across matches. *Alternative:* a tournament-level unit for its leaderboard.
2. **Fastest-serve minimum = 10 serves clocked**, counted over the matches that carry a fastest serve. It is not a per-match minimum.
3. **Bucket alternatives** are the five schemes in the table above. Squash and table tennis got sport-specific alternatives (long rallies; four phases) instead of the generic finer set.
4. **Mid-match scheme change.** It is allowed (from the next rally). Points keep their bucket, and the panel shows both schemes' used buckets by length. *Alternative:* lock the scheme after the first tagged rally.
5. **Leader minimums:** 20 net points, 15 drops, 30 serve & 3rd-ball points, sized for 3–6-match school events like `RACKET_MINIMUMS`.
6. **3rd-shot drop "success"** means the serving team won the rally after the drop (the deep wave's 3rd-shot definition). PPA's "drop landed in the kitchen" would need another tap.
7. **Kitchen arrival coverage** turns on with the first "Nobody" mark (see 7). In the edge case where both teams reach the kitchen in every rally, Nobody is never tapped, so arrival isn't shown.
8. **Squash lets in doubles** are credited to both players of the side.

## Not done / follow-ups
- Leaderboards in mph for an mph tournament (decision 1).
- A per-player kitchen arrival in doubles (who reached the line), like the 3rd-shot follow-up.
- Voice entry for the new chips (jump smash, block, Nobody, unit).
- Public guides (website/guides) for the unit, bucket and kitchen-arrival options.

## Needs wiring
None. Everything sits in existing components: the tennis point card, `PointDetailRow`, `MatchStatsPanel` / tennis `StatsPanel` rows, the Scoring settings card and the format fields. No new view-level component.

## Migration / deploy
No migration. Everything lives in the match log / format / stat-line JSON. Lines from before this round are unaffected. To give older squash or pickleball lines the new keys, re-sync their stats; only matches that named a let or used "Nobody" gain any.
