# Court-team scoring mechanism: volleyball, kabaddi, netball, handball (2026-11-02)

The angle here is the scorer's tap-by-tap mechanism: every way a rally, raid or possession ends, how the scorer records it now, and whether the chain **Info → Scoring → Stats / Commentary** holds. It follows the tennis model (`docs/security/breaks/tennis-serve-and-endings.md`, `tennis-endings-depth.md`). I don't repeat items the deep waves already solved (`docs/sport-depth/deep-wave/volleyball-kabaddi*.md`, `court-team*.md`).

This audit is **read-only**. Nothing is fixed yet. Every fix follows the quality mandate: a failing test first, old logs replay identically, then a 500-user simulation.

Status key: ✓ captured · partial · ✗ not capturable.

---

## 1. Volleyball (FIVB rules 2025–28, VIS statistics)

### Every way a rally ends

| How it ends | Who scores | How the scorer records it now | Gap |
|---|---|---|---|
| Attack kill (incl. tip, tool off the block, ball off the antenna side of the block) | attacker's side | ⚡ Attack (default mode) → tap the attacker (`index.tsx:95-117`, `engine.ts:162`). One tap. | ✓ (but see "Block out" below) |
| Attack error: out, net, antenna | opponent | 🚩 Opp. fault › "Attack out" › who erred, on the **winner's** panel (`index.tsx:98-108`, `engine.ts:178`). Three taps. | ✓ (no split between out, net and antenna; FIVB VIS doesn't split them either) |
| Attack blocked (stuff) | blocking side | 🧱 Block → blocker. Who was blocked is asked only with "Attack attempts" on (`DetailRow.tsx:105`) | partial (the blocked attacker is lost by default) |
| Block fault: net touch while blocking, reaching over, blocking a serve, back-row player blocking | opponent | 🚩 Opp. fault › "Block out" or "Net touch" | partial: **"Block out" is mislabelled** (below) |
| Serve ace | server | 🎯 Ace · server (one tap when the rotation is known, `index.tsx:126`) | ✓ |
| Who was aced (reception error) | n/a | "📥 Who was aced?", only inside the "Reception quality" category (`DetailRow.tsx:106`), which also grades every reception. Off by default. | partial (hidden behind a heavy category) |
| Serve error: net, out, foot fault, 8-second, screening | receiver | 🥅 Opp. missed serve (one tap, server pre-filled, `index.tsx:127`) | ✓ (no type; VIS doesn't split it) |
| Net touch | opponent | Opp. fault › Net touch | ✓ |
| Centre-line penetration | opponent | Opp. fault › "Foot fault" | partial: the label reads like a serve foot fault, which is a serve error |
| Rotation / positional fault | opponent | Opp. fault › Rotation | ✓ |
| Double contact, four hits | opponent | Opp. fault › "Double / 4 hits" | ✓ |
| Catch / lift (ball handling) | opponent | no chip; falls into "not described" | ✗ |
| Back-row attack, libero attack or libero overhead set fault | opponent | no chip | ✗ |
| Penalty (red card), delay penalty | opponent | Quick options › 🟨 Sanction / ⏱️ Delay (`SanctionOptions.tsx:104-105`, `sanctions.ts:52-59`) | ✓ |
| Warning, expulsion, disqualification | none | same tiles | ✓ (commentary yes; Stats shows only penalty points, `matchStats.ts:129`) |
| Video challenge, upheld or rejected | changes or keeps the point | nothing; the scorer uses Undo and re-enters the point | ✗ (P2: elite only) |
| Replayed rally (double fault by both sides, referee replay) | none | nothing (correct: no score effect) | ✓ |

**The "Block out" bug.** In FIVB VIS, an attack that goes off the block and out is the **attacker's kill**, not a blocking error. The chip "Block out" (`engine.ts:179`) is counted as "of which block errors", an opponent error (`matchStats.ts:122,125`). So a scorer who taps it takes a kill away from the attacker and moves the point into "opponent errors". This gives wrong stats.

### The chain

- **Info → Scoring.**
  - `formatLine` for volleyball shows sets and "to 25" only (`LiveScoringScreen.tsx:2929-2930`). The deciding-set target, "first to target (win by 1)", Beach or 9-a-side, and timeouts per set are never shown in Info, yet all of them change scoring.
  - The four Stats-to-track keys are `vbAttack`, `vbReception`, `vbDig` and `vbAssist`. They are not named `track*`, so the Info "Edit format" editor still offers them (`LiveScoringScreen.tsx:2757` omits only `/^track[A-Z]/`).
  - Editing them there on a live match replays the log with `initDetail(config)` (`detail.ts:159`). That switches the category on **from rally 1**, although nothing was captured for those rallies. The result is attack efficiency over-stated and reception % under a false denominator. The event-mode card says "from the next rally", so the two places disagree.
- **Scoring → Stats / Commentary.** Every capture reaches both: outcomes, fault types, sanctions, subs, detail entries (`commentary.ts:70-99,133-190`; `deepBox.ts:28-33`). Warnings, expulsions and disqualifications reach Commentary but not Stats (a Discipline row is missing).
- **Stats rows with no capture.** None. Attack, reception, dig and assist rows hide unless tracked (correct).
- **Defaults that hide depth.**
  - All four categories are off (`settings.ts:26,31`). So "Set by?" (FIVB Best Setter) and "Who was aced?" (reception errors) are never asked, although each is a single **non-blocking** chip row anchored to the point just scored. They need no Skip.
  - This is the tennis TF2 case. **Recommendation:** for new matches, turn on Set assists and a new, light "Who was aced?" category (split out of Reception). Keep attack attempts, reception grades and digs off, because they are a tap every rally.

---

## 2. Kabaddi (AKFI / IKF rules, PKL match centre)

### Every way a raid ends

| How it ends | Who scores | How the scorer records it now | Gap |
|---|---|---|---|
| Empty raid | none | Raiding → "Empty" (quick, `index.tsx:340`) | ✓ |
| Do-or-die empty raid: raider out | defence +1 | the same Empty; the engine applies DoD (banner `index.tsx:331-333`) | ✓ |
| Touch point(s), raider returns | raider +n | "+1 touch" quick; 2 or more touches: the touches chips in the form (`index.tsx:373-380`) | ✓ |
| Bonus (6 or more defenders) | raider +1 | "Bonus" quick (shown only when it counts, `index.tsx:342`) or the Bonus chip | ✓ |
| Touch + bonus | raider +n+1 | the form (touches + Bonus: Yes) | ✓ |
| Super raid (3 or more points) | raider | derived | ✓ |
| Raider tackled (successful tackle) | defence +1 | "Raider out" quick (**no tackler asked**) or the form → "Who made the tackle?" (`index.tsx:435-451`) | partial: the quick path loses the tackler |
| Super tackle (3 or fewer defenders) | defence +2 | derived from the mat count | ✓ |
| Raider caught after touching (touches void) | defence | the form; the `caughtTouches` rule | ✓ |
| Raider steps out (line-out) | defence +1 | "Raider stepped out: Yes" (`index.tsx:420`) | ✓ |
| Defender(s) step out with no struggle | raider's side +1 each | the line-out chips (`index.tsx:406-411`) | ✓ |
| Raider out with no tackle: baulk line not crossed, 30-second raid time, cant lost | defence +1, raider out, a defender revived | no option. The scorer either picks "Technical point › Cant late" (`engine.ts:95`), which scores +1 but **doesn't put the raider out or revive a defender**, so the mat count goes wrong, or picks "Raider stepped out", which miscounts it as a line-out | ✗ |
| All out (lona) | +2 | derived | ✓ |
| Technical point: coaching, delay, two raiders, entry | +1 | ⚖️ Technical point (`index.tsx:508-545`, `engine.ts:94-100`) | ✓ |
| Green / yellow / red card (± a technical point) | +1 optional | 🟨 Card (`index.tsx:577-620`) | ✓ |
| Golden raid, 5-raid shootout | n/a | dedicated panels (`index.tsx:270-303`) | ✓ |
| Raid skill / tackle type | n/a | raid skill (gated by `trackSkills`); tackle type (always shown) | ✓ |

**The quick-path trap (P0).** The one-tap row (Empty, +1 touch, Bonus, Raider out) sits **above** the "Raider (optional)" chips (`index.tsx:336-360`). A scorer who taps a quick button first records the raid with no raider, and "Raider out" records the tackle with no tackler. The fast path is the default path, so raid points, tackle points, Super 10 and High 5 by player stay empty. Nothing in Stats says why. Tennis had the same pattern (TF2): the depth was there, but the default flow never asked for it.

### The chain

- **Info → Scoring.**
  - `formatLine` for kabaddi shows only "N-min halves" (`LiveScoringScreen.tsx:2935`). The rule set, Sanjeevani / Amar / Gaminee, the decider (extra time or golden raid), super tackle, do-or-die and "caught after touching" all change the score but are invisible in Info.
  - Stats-to-track keys are `track*`, so they are handled correctly.
- **Scoring → Stats / Commentary.** All captured items reach both (`commentary.ts`, `matchStats.ts` Points / Raiding / Defending / All-outs / Discipline / Skills).
- **Stats rows with no capture.** `unsuccessfulTackles` exists only with "Defenders touched" on. It is hidden otherwise (correct).
- **Defaults.** Raid skill and named touched defenders are off (`settings.ts:17-18`). That is right for one phone, because both add a chip row every raid. The real hidden depth is raider and tackler naming (above). That is a UI-order problem, not a switch.

---

## 3. Netball (World Netball rules, Champion Data)

### Every way a possession ends

| How it ends | Who scores | How the scorer records it now | Gap |
|---|---|---|---|
| Goal by GS / GA | 1 (2 for a super shot) | 🥅 GS · name / 🥅 GA · name: one tap with positions set (`index.tsx:534-551`) | ✓ |
| Missed shot (+ offensive / defensive rebound) | n/a | ↗ Miss GS/GA; the rebound step only with "Feeds & rebounds" on (`index.tsx:399-410`) | partial: rebounds by default only via More › Rebound, not linked to the miss |
| Goal assist / feed | n/a | asked only with "Feeds & rebounds" on (`index.tsx:384-390`) | partial (off by default) |
| Super shot / 2-pointer | 2 | ⭐ arm, then goal (`index.tsx:556-558`) | ✓ |
| Centre pass, centre-pass receive | n/a | CPR strip (`index.tsx:640-646`), on with the International preset | ✓ |
| Intercept, deflection (± gain), pick-up | n/a | More › ✂️ / ☝️ / 🤲 (`index.tsx:62-69`) | ✓ |
| Turnover: bad pass, footwork, held ball, offside, over a third, breaking, out of court | n/a | More › ⚠️ Turnover › type chip (gated, `engine.ts:63-66`) | ✓ |
| Penalty: contact, obstruction, other | n/a | More › ✋ Penalty (`index.tsx:444-454`) | ✓ |
| Toss-up (simultaneous offence) | n/a | nothing | ✗ (P2) |
| Warning, 2-minute suspension, ordered off | n/a | More › 🟨 Sanction (`index.tsx:459-465`) | ✓ |
| Time held (injury, blood) | n/a | ⏸ Hold | ✓ |

### The chain

- **Info → Scoring.**
  - `formatLine` shows "4 × 15 min" only (`LiveScoringScreen.tsx:2938`). The super-shot rule, decider / extra time / play-on, suspension length and team time-outs change scoring but aren't in Info.
  - The CPR default disagrees with itself. `trackCpr` defaults to **false** in `meta.ts:70` but to **true** in `NETBALL_LIVE_SETTINGS.defaults` (`engine.ts:689`). A match made without the International preset (quick friendly, School, Halves) reads false, and the card shows it as "customised".
  - `detail` (Feeds & rebounds) is not a `track*` key, so it shows both in Edit format and in ⚙️ Match settings. That is harmless here (config mode, same key) but inconsistent.
- **Scoring → Stats / Commentary.** All captured items reach both (`commentary.ts:47-95`, `panel.ts`).
- **Defaults that hide depth.** "Feeds & rebounds" is off (`meta.ts:68`). Goal assists and feeds, Champion Data's core attacking stats, are never asked, and a miss is never linked to its rebound. Each is a skippable step.
  - **Recommendation:** on by default for new International 4 × 15 matches (as CPR already is). Off for School / Halves. Keep the Skip.

---

## 4. Handball (IHF rules, IHF match statistics)

### Every way a possession ends

| How it ends | Who scores | How the scorer records it now | Gap |
|---|---|---|---|
| Goal by position: 6 m, 9 m, wing, breakthrough, fast break | 1 | 🥅 Goal → From where? → scorer → assist / No assist (`index.tsx:366-385`). Four taps; the position is **compulsory** with no "not sure" option | ✓ (partial: a forced guess skews the shot map) |
| 7-metre goal / save / miss | 1 / – | 🎯 7 m → result → thrower (`index.tsx:416-438`) | ✓ |
| 7 m won by | n/a | an extra step, only with `trackSevenMDrawn` (`index.tsx:417-423`) | partial (off; it costs a whole step) |
| 7 m caused by (defender) | n/a | nothing | ✗ (P2) |
| Saved shot (by position) | keeper save | 🎯 Shot → position → 🧤 Saved → shooter; the save goes to the set keeper (`index.tsx:173-179`) | partial: **no keeper set means no save credit** and no save % |
| Missed (wide, over, post) | n/a | ✗ Missed | ✓ (no post split; IHF doesn't split either) |
| Blocked by a defender | n/a | 🛡 Blocked → shooter → blocker | ✓ |
| Technical fault: steps, double dribble, area, offensive foul, passive play, bad pass | n/a | ⚠️ Turnover › Technical fault; the type chip only with `trackFaultTypes` (`index.tsx:451-456`) | partial (off by default, though the chip costs **no extra tap**) |
| Ball stolen | steal to the defender | ⚠️ Turnover › Ball stolen → loser → stealer | ✓ |
| Warning, 2 minutes (3rd = disqualification), disqualification, + blue card | n/a | 🟨 Card (`index.tsx:467-498`) | ✓ |
| Empty-goal (7th court player) goals | n/a | 🥅 Empty goal toggle; derived | ✓ |
| Passive-play warning (forewarning signal) | n/a | nothing | ✗ (P2) |
| Team time-out, throw-off, half ends, extra time, 7 m shoot-out | n/a | dedicated buttons | ✓ |

### The chain

- **Info → Scoring.** `formatLine` shows "2 × 30 min" only (`LiveScoringScreen.tsx:2936`). The decider (extra time, a second extra time, 7 m), "stop the clock for suspensions" and players per side (the last only when not 7) are missing. The Stats-to-track keys are `track*` (correct).
- **Scoring → Stats / Commentary.** All captured items reach both (`feed.ts:38-83`, `depth.ts`, `stats.ts`). The one exception is a save with no keeper set: it reaches Commentary as a save but no keeper's stat line or save % gets it.
- **Defaults that hide depth.**
  - `trackFaultTypes` is off, but the chip sits on the same screen as the player pick, so turning it on by default costs nothing. **Recommend on.**
  - `trackSevenMDrawn` adds a step. Make it a chip row on the 7 m result screen (no extra tap), then on by default.

---

## 5. Ranked fix list

Practicality filter: one scorer, one phone. Extra capture stays optional and non-blocking, and the default tap count must not grow (or grows only with a Skip).

| # | Pri | Size | Sport | Fix | What changes | Event-log impact |
|---|---|---|---|---|---|---|
| 1 | P0 | S | Kabaddi | Put the **Raider** chips above the quick buttons. After "Raider out" (quick), show an optional **"Tackled by?"** row (non-blocking, like volleyball's "Set by?"), applied as an in-place edit of that raid | UI order. The tackler goes through the existing raid edit (✎) path | None: the same RAID payloads; old logs untouched |
| 2 | P0 | S | Volleyball | **"Block out" is wrong.** Relabel the chip "Block fault (net / over / blocked a serve)", add a hint ("ball off the block and out = ⚡ Attack point"), and keep the stored key `blockout` | UI label + hint; the commentary text "block fault" | None (same key; old logs keep their meaning) |
| 3 | P0 | M | Kabaddi | **Raider out without a tackle:** turn "Raider stepped out" into "Raider out — no tackle" with a reason: stepped out / baulk line / raid time (30 s) / cant. It puts the raider out and revives a defender; it is not a tackle | New optional payload `rout` on the raid (absent = line-out, as now); Stats "Raider self-outs by reason"; commentary wording. Hide the "Cant late" technical reason for new events | Additive: old raids lack `rout` and replay as line-outs; old "cant" technical points still replay |
| 4 | P1 | S | All four | **Info `formatLine`** names every scoring setting: VB decider points, win-by-1, Beach / 9-a-side, timeouts; KB rule set, style, decider, super tackle, DoD, caught touches; NB super-shot rule, decider, suspension minutes, time-outs; HB decider, stop clock, players per side | `LiveScoringScreen.tsx` `formatLine` (pure, testable); better, move it into each sport's meta as `formatSummary(fmt)` | None |
| 5 | P1 | S | Volleyball (+ the shared rule) | Hide **every event-mode liveSettings key** from Info › Edit format (not only `track*`), so `vbAttack` and the rest can't be switched on retroactively from rally 1 | `omitKeys` uses the `ls.mode === 'event'` field keys | None (stops a bad replay; existing logs unchanged) |
| 6 | P1 | M | Volleyball | **Defaults ON for new matches:** "Set by?" (assist) and a new light category **"Who was aced?"** split out of Reception. Both are non-blocking rows anchored to the point just scored | New cat `aced` (key `vbAced`) in `detail.ts`, `settings.ts`, `DetailRow.tsx`. The new-match forms write the defaults (tennis TF2 pattern) | Additive: a format without the keys keeps both off; old `cats` lists replay as before |
| 7 | P1 | S | Netball | **"Feeds & rebounds" on by default** for the International 4 × 15 preset (in its `set`, like `trackCpr`). Fix the `trackCpr` default mismatch (meta false vs live true) | `meta.ts` presets + defaults | Formats without the key keep it off; old matches unchanged |
| 8 | P1 | S | Handball | **Fault types on by default** (zero extra taps). Make "7 m won by" a chip row on the 7 m result screen, then on by default | `meta.ts` defaults; the 7 m flow UI | Additive: the existing `drawn` event, unchanged shape |
| 9 | P1 | S | Handball | **No keeper set:** before the first shot or 7 m, prompt "Who's in goal?" once per side (Skip allowed), so saves and save % get credited | UI cue only | None |
| 10 | P1 | S | Volleyball | More Opp. fault chips: **Catch / lift**, **Back-row / libero fault**; rename "Foot fault" to **"Centre line"** (a serve foot fault is a missed serve) | New `err` keys `handling`, `backrow` (stored `foot` keeps its meaning); matchStats "faults" bucket + `FAULT_TEXT` | Additive |
| 11 | P2 | S | Handball | "Not sure" on the goal / shot position grid (no forced 9 m guess) | Optional `shotType` absent → counted as "unknown" | Additive (`shotType` stays on every old event) |
| 12 | P2 | S | Volleyball | A Discipline row in Stats (warnings, expulsions, DQs, delays) | `matchStats.ts` | None |
| 13 | P2 | M | Volleyball | Video challenge marker (upheld / rejected, by team, no score effect) for elite events | New `CHALLENGE` record, kept by EDIT_LOG like conduct | Additive |
| 14 | P2 | S | Netball / Handball | Netball toss-up; handball passive-play warning and "7 m caused by" | New optional event kinds | Additive |

---

## Shared fixes

- **One summary source for Info.** Each sport's meta should export `formatSummary(fmt)` so Info shows every setting that changes scoring. Today `formatLine` in the screen knows one field per sport (fix 4). A contract test, "every formatField that the engine reads appears in the summary or is a Stats-to-track toggle", would stop this drifting again.
- **One rule for "Stats to track" in Edit format.** Event-mode settings belong only to the ⚙️ card, never to the format editor on a live match (fix 5). Name the keys `track*` going forward, and keep `vb*` working for old formats.
- **Default-on rule** (the founder's tennis decision applied here). A capture that is a **non-blocking chip on a screen the scorer already sees** (volleyball "Set by?" / "Who was aced?", handball fault type, handball 7 m won-by as a chip) defaults ON for new matches. A capture that adds a **blocking step on every rally or raid** (volleyball attack attempts, reception grades, digs; kabaddi skills and named touches) stays off. Netball feeds & rebounds sits in between: on for International, with Skip.
- **Fast path = full credit.** Any one-tap shortcut (kabaddi quick raids) must sit **after** the player pick, or be followed by an optional "who?" row. Otherwise the default path silently writes team-only stats.
