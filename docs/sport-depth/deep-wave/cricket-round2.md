# Deep wave: cricket, round 2 (the founder's answers)

**The ask (founder, 2026-10-22).** The founder reviewed every decision in [cricket.md](cricket.md) and answered every open question. This round builds those answers. The same ground rules apply:

- Scoring stays one tap. New capture is optional and off by default.
- Old matches replay identically. Nothing untracked shows as 0.
- Career keys are written only when tracked.
- Rule details are organiser options with standard defaults.
- Players are identified by id, never by name.

Not wanted now: Hindi / regional-language commentary.

## What the founder asked, and what was built

| # | Founder's answer | Built |
|---|---|---|
| 1 | Turn on the "Fastest ball" and "Best control %" leaders, with minimums | ✅ |
| 2 | Powerplay / middle / death become organiser options, with today's automatic phases as the default | ✅ |
| 3 | Bowler type from the profile even with the toggle off: keep | ✅ (no change) |
| 4 | Ball speed: keep the toggle (a speed gun isn't realistic now; keep it for future tech) | ✅ (no change) |
| 5 | A WhatsApp share card at the end of an innings and of the match, plus an optional end-of-over share | ✅ (text: the app makes no share images). Wired 2026-10-22 |
| 6 | All three optional details: wide / no-ball reason, direct-hit run outs, a bouncers-per-over warning | ✅ |
| 7 | Dot %, boundary % and phase economy in careers, for matches scored from now on, behind a new-era marker | ✅ |

### 1. Leader rails

- **Fastest ball** and **Best control %** are appended to cricket's leader list, in that order.
- Each has a minimum (`DETAIL_QUALIFIERS` in stats.ts):
  - control % ranks only on **60 tracked balls faced** (about 3 T20 innings);
  - the fastest ball ranks only on **12 balls clocked** (two overs).
- Organisers can change either minimum, like every other one (SD-27 "Leader minimums").
- Tie-breaks:
  - fastest ball → the higher average speed;
  - control % → more tracked balls.
- **Shared change:** a `max` stat (a single-match high) couldn't carry a minimum before. `statSchema.ts` now lets it name its sample (`den`, summed over the counted lines) and a `qualifier`. The change only adds; every other sport is unchanged.

### 2. Phases as organiser options

Two new choices sit in Match rules and the format editor (`phasePP`, `phaseDeath` in rules.ts; the logic is in the new **phases.ts**):

- **Stats phases — powerplay:** format's powerplay (default) · None · Overs 1–N (2, 3, 4, 5, 6, 8, 10, 15).
- **Stats phases — death overs:** Automatic (default) · None · Last N overs (1–6, 8, 10).

How they behave:

- **The default is exactly today's split.** The format's powerplay (The Hundred: 25 balls); a death of the last quarter (the last 10 overs from 40 overs up). The frozen tests and the deep-wave phase test are unchanged.
- **Stats only.** These choices split the stats. The format's **Powerplay overs** still sets the fielding restrictions and the live "POWERPLAY" strip. So a school T20 with no fielding restrictions can set the stats powerplay to None and still keep its format.
- **They apply to the whole match.** Unlike a playing rule, a mid-match change re-splits every ball already bowled. The timeline still logs it as a RULES line ("Powerplay phase: overs 1–4").
- **What follows the chosen phases:**
  - the Stats tab: the Compare phase chips, the Phases table, the bowler economy by phase;
  - the commentary's "End of the powerplay" note;
  - the new-era phase economy in careers.
- **When there are no phases:**
  - an innings of 100+ overs never has phases;
  - one under 4 overs has none by default, but has them from 2 overs when the organiser chose phases;
  - choosing None for both gives no phases at all.

### 3 & 4. Kept as they are

- Bowler type still comes free from the profile, even with the toggle off.
- The ball-speed toggle is unchanged.

### 5. WhatsApp share card (text)

The app makes no share images today (no view-shot), so the card is WhatsApp-formatted text: `*bold*` team lines and the match link at the end. It goes through the app's one share path, `core/share.ts shareMessage(…, 'match')`: the system share sheet, with WhatsApp first on the desktop web.

**The text builders** (`shareCard.ts`):

- **End of the 1st innings:**
  - the total and run rate;
  - the top 3 batters, and the bowling side's top 3 bowlers;
  - what the chase needs: "from N overs", or "from 100 balls" in The Hundred, with (DLS) or (revised target) when the target was changed.
- **Result:**
  - both totals, plus the Super Over score when there was one;
  - the result line (or a hand-closed result line);
  - each innings' top batters and bowlers;
  - the Player of the Match, when passed in.
- **Over (optional):** the commentary's over block.
  - The over's headline, its balls ("4 1 6 0 W 2"), the batters and the bowler's figures.
  - In a chase, "Need N from B · RRR".

**The views** (new **ShareCardView.tsx**):

- `CricketShareCard`: a preview with the bold markers removed, an "End of 1st innings / Result" chip, and one Share button.
- `ShareOverButton`: the "Share over" action for one over block.
- Names a dispute has hidden stay hidden (`useMask`).

### 6. The three optional details

**Wide / no-ball reason.** This is a new "Stats to track" toggle, **Wide / no-ball reason** (`extraWhy`), off by default.

- With the toggle on, the detail panel after a wide or a no-ball offers reason chips. Each one is optional, and tapping it again clears it.
  - Wides: Down leg · Outside off · Over head height · Other.
  - No-balls: Front foot · Above waist (full toss) · Bouncer limit · Fielding restriction · Other.
- It rides on `BALL_DETAIL` (v:2) as `why`. The ball carries `trk.why` only while the toggle is on.
- Where it shows:
  - in the commentary: "wide, down the leg side", "no ball, overstepped";
  - in a tracked Compare section, "Wides & no-balls — why (tracked)": how many were tagged, then one row per reason that happened;
  - on each bowler's Stats line: "wd down leg 2 · nb front foot 1".
- No career key: none was asked for.

**Direct-hit run outs.**

- An optional **🎯 Direct hit** chip sits in the run-out flow next to "+ 2nd fielder (optional)". It is never a step. Picking it hides the 2nd fielder, because a direct hit is one fielder.
- The WICKET payload (and a run out off a wide or no-ball) carries `direct: true`. The dismissal record gets `direct: true` only for a run out with a named fielder. Older logs have no such key.
- Where it shows:
  - the commentary: "OUT! Run out — direct hit from Jadeja";
  - a "Direct-hit run outs" Compare row, once one was marked;
  - the career key `directHits` on the fielder's line, only for a fielder who made one (no 0 is ever written);
  - the career Fielding row "Direct hits", only once the player has one.
- "Edit a past ball" keeps the flag: edits copy the rest of the original payload.

**The bouncers-per-over warning** (new **bouncers.ts**).

- **The limit** is an organiser option, **Bouncers allowed per over** (`bouncerMax`):
  - Standard (default): 1 an over up to 20 overs, else 2. This is read from the scheduled length, so a rain-cut ODI keeps 2.
  - No limit, or 1, 2 or 3.
  - A non-standard limit counts as a playing rule: it shows in the "Local rules" chip ("2 bouncers/over").
- **The count** is the pitch map's **Bouncer** length on the over's deliveries. The warning therefore works only while the pitch map is tracked.
- **Where it warns:**
  - in the fixed one-line slot above the run pad, after a free hit or an armed penalty, so the pad never moves: "⚠️ 1/1 bouncer this over — the next is a no-ball", or past the limit, "⚠️ 2 bouncers this over — over the limit of 1";
  - in the detail panel, under the length chips, once the ball just tagged reaches or passes the limit.
- It only warns: the umpire calls the no-ball and the scorer records it as usual. Its no-ball reason chip is "Bouncer limit".

### 7. New-era career figures

**The new-era marker** (`isNewEra`, scorecard.ts).

- A match is new-era when its ball log carries the scorer's device time stamps (`BallRec.t`, from `payload.at`).
- Every ball tapped on the app from the deep wave on is stamped. No older match has a stamp.
- Every line of a new-era match carries `newEra: 1`.
- Only new-era matches write the keys below, so every older match's totals stay byte-identical (the frozen replay test still passes).

**The keys** (`eraTotals`):

- **Batters:**
  - `dotsF`: balls faced with no run off the bat;
  - `bndRuns`: runs in 4s and 6s off the bat. This is the same boundary rule as the Stats tab (a no-ball 4 or 6 counts).
- **Bowlers:** `ballsPP runsPP`, `ballsMid runsMid`, `ballsDeath runsDeath`.
  - These are legal balls and runs charged in each phase the match has: the organiser's phases, else the defaults.
  - A bowler who didn't bowl in a phase gets 0.
  - A phase the match doesn't have (None, a Test) gets no key at all.

**The career rows.** Each is hidden on older lines, and shows an "x of y innings" note when only some lines have the figure.

- Batting:
  - **Dot %** = dotsF ÷ balls faced;
  - **Boundary %** = bndRuns ÷ runs (the share of runs in boundaries, as on the Stats tab).
- Bowling:
  - **Dot %** = dots ÷ balls bowled, over new-era lines only. The existing `dots` key is reused, gated by the marker.
  - **Econ (powerplay)**, **Econ (middle)** and **Econ (death)**. Each phase row counts only lines where the bowler bowled in that phase.

## Decisions taken (the recommended option where unsure)

1. **The new-era marker is the ball stamp, not a new action or format key.** The stamp is deterministic on replay, already present on every ball tapped since the deep wave, and absent from every older log. *Alternatives:*
   - a format flag at match creation, which means many creation paths;
   - a date cutoff, which depends on device clocks.

   *Caveat:* balls scored by voice aren't stamped yet, so a match scored **only** by voice reads as old. One stamped ball is enough to make a match new-era.
2. **The phase options are stats settings, separate from the format's powerplay (fielding restrictions).** Changing them never touches the live POWERPLAY strip or any playing rule.
3. **The phase options are lists of choices, not free numbers.** The format editor has no "show this field when that one is Custom". *Alternative:* a number field with a sentinel ("−1 = auto"), which reads badly.
4. **The direct hit is a chip in the run-out flow, not a "Stats to track" toggle.** It appears only on a run out and costs no tap, like "+ 2nd fielder". Its career key exists only when one was marked.
5. **The wide / no-ball reason is a toggle.** It opens the detail panel after every extra, so it must be opt-in.
6. **The bouncer warning only warns.** The no-ball stays the umpire's call and the scorer's tap.
7. **No career key for the reasons.** None was asked for; they show per match.
8. **The share card is text with WhatsApp `*bold*`.** There is no image infrastructure. The preview strips the markers.
9. **The fastest-ball minimum needed a small shared `statSchema.ts` addition** (a qualifier on a `max` stat). The control-% minimum is an ordinary rate qualifier.
10. **The new minimums live in their own `DETAIL_QUALIFIERS`.** A shared test pins `QUALIFIERS` as "unchanged".

## Wiring (done 2026-10-22)

Both pieces are now on screen. The match's tournament, Player of the Match and hand-closed result line reach every tab slot as `LiveExtrasProps.tournamentName / potmName / resultLine`. The share card falls back to the same computed Player of the Match as the Summary (`cricketAutoPotm`).


- **Summary tab:**
  - `CricketShareCard` from `src/sports/cricket/ShareCardView.tsx`;
  - props: `state`, `homeName`, `awayName`, `matchId`, `tournamentName?`, `potmName?`, `resultLine?` (`manualResultLine`);
  - it renders nothing until the 1st innings is over.
- **Commentary tab:**
  - `ShareOverButton` in each over block header;
  - props: `state`, `over={{ inn, side, over }}` (from `ComInnings.inn / .side` and `ComOver.over`; `superOver: true` for a Super Over block), `homeName`, `awayName`, `matchId`, `tournamentName?`.

Everything else is live in the existing views:

- the reason chips and bouncer note in the detail panel;
- the bouncer slot and the direct-hit chip in Scoring;
- the reason / direct-hit Compare rows and the phase chips in Stats;
- the new Match rules fields;
- the commentary words, career rows and leaders.

## Figures that change on matches already played

- **Scores and results:** none change.
- **Phases:** a match with default phases splits exactly as before.
- **Careers:** older matches gain no keys.
  - Deep-wave matches already scored (stamped) gain the new-era keys at their next stat sync (completion or a correction).
  - An optional `resyncSportLines('cricket')` would add them for any of those already finished. No value that is already stored changes.
- **Leaders:** cricket gains two cards, Fastest ball and Best control %. Each appears only once someone meets its minimum.

## Verify (taken from memory)

- ICC fast short-pitched limits: T20I 1 an over; ODI and Test 2. The Hundred's ECB rule, assumed to be 1 an over.
- That the no-ball / wide reason wording matches the Laws (21, 22, 41.6–41.7, 28.4).

## Migration, deploy

- **Migration:** none.
- **Deploy:** none beyond the next OTA (pure app code).
- **Data:** optional `resyncSportLines('cricket')` for stamped matches already finished.

## Tests

- **New:** `tests/cricket-round2.test.mts` (25 tests). It covers:
  - leaders and their minimums;
  - phase options, the plan, a mid-match re-split, and the commentary's powerplay note;
  - the reason vocabulary, record, commentary, Compare and bowler row;
  - direct hits in the engine, totals, Fielding, commentary and career;
  - the bouncer limit, count, warnings and over reset;
  - the new-era marker and keys, careers with coverage, and all 10 frozen logs carrying no new key;
  - the share-card texts.
- **Updated pins (cricket lines only):**
  - the "Stats to track" group (cricket-deep-wave);
  - the cricket leader keys, labels and minimum rows (leaders-awards, stat-schema).
