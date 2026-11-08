# Stats on by default: invasion family (2026-11-08)

Sports Rules Expert review for football, hockey, ice hockey, rugby union and rugby league, following the founder's racket rule of 2026-11-08 (`docs/security/breaks/describe-done.md`): every "Stats to track" option is ON for a new match unless it is typed or needs equipment, and every "describe this play" card has a clear Done / Skip finish with a visible saved state.

Read-only review. Nothing here changes code. Settled rules are not reopened: defaults apply to new matches only, there are no false zeros, rule details are organiser options, and the chain is Info → Scoring → Stats + Commentary.

**Cost key:** (a) tap-optional: an extra button or chip that never blocks the next play. (b) blocking: a step the scorer must answer before scoring on. (c) continuous, typed or needs equipment: a stopwatch-style bar, a tap on every tackle, or a video umpire.

**The one precondition (R1 below):** in all five sports, a toggle that is ON currently counts as "captured". So every player line reads 0 for it even when nobody tapped. Turning toggles on by default without fixing that turns every un-used option into false zeros. Fix R1 first, then flip the defaults.

---

## Football

Base toggles are in `src/sports/football/meta.ts:31-37`. The friendly default is `FRIENDLY_ON = ['cards','shots','saves']` (`meta.ts:45-49`); tournaments use the `full` column. Deep toggles are in `meta.ts:16-24` and `:53`, all off. The live-settings `defaults` are at `engine.ts:209-213`.

| toggle | key | now (friendly / tournament) | cost | recommend | why |
|---|---|---|---|---|---|
| Shots | `trackShots` | ON / ON | a | ON | already on |
| Saves | `trackSaves` | ON / ON | a | ON | already on |
| Cards | `trackCards` | ON / ON | a | ON | already on; a red stays available even when off (`index.tsx:1255-1258`) |
| Fouls | `trackFouls` | off / ON | a | ON | one button, used only when the scorer sees a foul |
| Offsides | `trackOffsides` | off / ON | a | ON | same |
| Corners | `trackCorners` | off / ON | a | ON | same |
| Tackles | `trackTackles` | off / ON | a | ON | same |
| Interceptions | `trackInterceptions` | off / ON | a | ON | same |
| Attacking play | `trackAttackContribution` | off / ON | a | ON | same |
| Defensive play | `trackDefenceContribution` | off / ON | a | ON | same |
| Crosses | `trackCrosses` | off / ON | a | ON | same |
| Dribbles | `trackDribbles` | off / ON | a | ON | same |
| Handballs | `trackHandball` | off / ON | a | ON | same |
| Possession | `trackPossession` | off / ON | c | **OFF** for friendlies (keep the tournament ON) | the bar needs a tap at every change of possession all game (`index.tsx:1307`, `:1479+`). A half-watched bar shows a confident wrong %: `footballPossession` (`depth.ts:154-164`) hides only 100–0, not 80–20 |
| Passes | `trackPasses` | off / off | c (volume) | **OFF** | 400+ passes a game. A sampled pass accuracy is wrong, and it is already off even for tournaments ("too fast for one scorer", `meta.ts:29`) |
| Shot detail | `trackShotDetail` | off | a | ON | zone, big chance, foot and situation chips sit in the shot and goal panels already open (`index.tsx:1171-1179`, `:936`, `:961-976`), plus a Woodwork button (`:1216`) |
| Key passes | `trackKeyPasses` | off | **b** | ON **only after** it becomes a non-blocking card. OFF until then | after every named, unblocked shot a full panel replaces the controls until Skip or Close (`index.tsx:318`, `:981-990`) |
| Clearances | `trackClearances` | off | a | ON | one button (`index.tsx:1260`) |
| Goal kicks & throw-ins | `trackSetPieces` | off | a | ON | two team-only buttons (`index.tsx:1260`) |
| Card reasons | `trackCardReasons` | off | a | ON | optional chips inside the card panel; the colour tap still finishes it (`index.tsx:1233-1237`) |
| Goals ruled out | `trackRuledOut` | off | a | ON | one button (`index.tsx:1332`); "After a VAR review" is an optional chip. Offside and foul goals happen at school level too. See R8 |

## Hockey

The toggles are in `src/sports/hockey/meta.ts:21-22` and `src/sports/invasion/ruledOut.ts:47-50`. The engine reads them at `engine.ts:199-201`; the live defaults are at `engine.ts:669`.

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Possession | `trackPossession` | off | c | **OFF** | a "Ball:" switch the scorer must keep tapping all game (`index.tsx:592-604`) |
| Video referrals | `trackReferrals` | off | c (equipment) | **OFF** | needs a video umpire, which a school or community game never has. If on, it would show "Referrals 0–0" on every match (`depth.ts:25`, `:75`) |
| Goals ruled out | `trackRuledOut` | off | a | ON | one button (`index.tsx:510`). Goals struck from outside the circle are disallowed at every level |

The always-on circle-entry tally (`index.tsx:573-589`) is not a toggle and is not in scope.

## Ice hockey

The toggles are in `src/sports/ice_hockey/meta.ts:21-25` and `:60` (`plusMinus`), plus `ruledOutField`. The engine reads them at `engine.ts:258` and `:920`; the live defaults are at `engine.ts:939`.

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Faceoffs | `trackFaceoffs` | off | a | ON | one chip per draw (`index.tsx:569-577`). Naming the centres is optional (`:650`) |
| Faceoff zones | `trackFaceoffZones` | off | **b** | ON **only after** the zone becomes inline chips. OFF until then | every faceoff tap opens a zone panel that replaces the controls, and "Skip the zone" is a small link (`index.tsx:525-541`) |
| Hits & blocked shots | `trackPhysical` | off | a | ON | a chip, then "Who? (optional)" with "Team (no name)" (`index.tsx:517-523`) |
| Giveaways & takeaways | `trackPuck` | off | a | ON | same |
| Missed shots | `trackAttempts` | off | a | ON | same |
| +/- | `plusMinus` | off | **b** | **OFF** | the goal is saved only after an on-ice picker of 10 or more taps (`index.tsx:384-437`). A skipped goal makes everyone's +/- quietly wrong, not just 0 |
| Goals ruled out | `trackRuledOut` | off | a | ON | one button (`index.tsx:588`) |

## Rugby union

The toggles are in `src/sports/rugby/meta.ts:24-28`, `:50` (`trackDetail`), plus `ruledOutField` and `restartField` (`invasion/restarts.ts:41`). The engine reads them at `engine.ts:271`; the live defaults are at `engine.ts:823`.

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Penalties by offence & free kicks | `trackPenalties` | ON | a | ON | already on |
| Turnovers conceded | `trackTurnovers` | off | a | ON | a chip, then optional cause and player (`index.tsx:541-560`) |
| 22 entries | `trackEntries` | off | a | ON | one tap (`ONE_TAP`, `index.tsx:81`) |
| Possession & territory | `trackPossession` | off | c | **OFF** | two switches plus "Ball dead", tapped all game (`index.tsx:599-626`) |
| Offloads | `trackOffloads` | off | a | ON | a chip, then an optional player |
| Tackles, carries, set pieces | `trackDetail` | off | a | ON (after R1) | the 📋 Detail button, then the kind, then a player you can skip (`index.tsx:518-539`). It produces the most 0 lines if R1 isn't fixed |
| Tries ruled out | `trackRuledOut` | off | a | ON | one button (`index.tsx:587`) |
| Penalty options & 50:22 | `trackRestarts` | off | a | ON | four one-tap team chips (`index.tsx:589-594`) |

## Rugby league

The toggles are in `src/sports/rugby_league/meta.ts:24-28`, plus `ruledOutField` and `restartField`. The live defaults are at `engine.ts:703`.

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Six-tackle sets | `trackSets` | off | c | **OFF** | a tap on every tackle (300 or more a game) drives the set count and hands the ball over on the 6th (`index.tsx:499-535`). A missed tackle makes the count wrong |
| Tackles & missed tackles | `trackDefence` | off | a | ON (after R1) | the 📋 Detail button, then the kind, then a player you can skip (`index.tsx:446-462`) |
| Runs, line breaks & offloads | `trackAttack` | off | a | ON (after R1) | same |
| Errors & penalties conceded | `trackErrors` | ON | a | ON | already on |
| Tries ruled out | `trackRuledOut` | off | a | ON | one button (`index.tsx:484`) |
| Kicks & restarts | `trackRestarts` | off | a | ON | five one-tap team chips (`index.tsx:489-494`) |

---

## Describe cards

1. **Football goal card** (`football/index.tsx:950-978`). The goal is on the board at the scorer tap. Assist, goal type, zone, big chance and situation are then described on one panel. The only finish is "Close" at the top right, plus "✓ No assist", which also closes the panel. If the scorer taps a chip and doesn't pick an assist, there is no Done. **This is the racket problem exactly. Apply the Done pattern**: summary line ("✓ Goal · Header · Inside the box · Assist: X"), a full-width Done/Skip, then greyed "✓ Saved · …" with Edit, keyed by the goal's event id.
2. **Football key pass** (`index.tsx:981-990`). It has a full-width "✓ Skip — no key pass" but blocks the controls and shows no saved state. **Apply the pattern as a non-blocking card** under the controls, keyed by the shot's id. Then Key passes can default ON.
3. **Football stoppage reason** (`index.tsx:1313-1322`). The chips are inline and non-blocking, but there is no Skip and no saved state; they vanish on the next event. **Apply the pattern** (Skip, then "✓ Saved · Injury").
4. **Hockey penalty-corner outcome** (`hockey/index.tsx:608-632`). It is non-blocking, but the only skip is a small "Later" at the top right, the same flaw as racket's "Choose". **Apply the pattern**: full-width Skip, then a "✓ Saved · PC defended" line with Edit, keyed by the PC uid.
5. **Ice hockey faceoff zone** (`ice_hockey/index.tsx:525-541`). "Skip the zone" is a small text link. Make the zone inline chips on a non-blocking card with Done/Skip. Then zones can default ON.
6. **Goal / try assist steps in hockey, ice hockey, union and league.** The score is fired only after the assist step: hockey `index.tsx:384-389`, ice hockey `:384-421`, union `:386-398`, league `scoreTry` `:189`. Cancel at the assist step loses the score. **Recommend football's SD-114 shape**: the score goes on the board at the scorer tap, then a describe card holds assist, second assist and strength with Done/Skip. This matters more once more options are on, because the post-score steps get longer.
7. **Ice hockey +/-** (`ice_hockey/index.tsx:426-437`). It has a clear finish ("✓ Save goal" / "Skip +/-") but blocks the goal. Fold it into the describe card in item 6 if +/- is ever defaulted on.
8. **Already clear, no change:**
   - Football shot outcome (`:1180-1219`, chips ride on the outcome tap).
   - Football card reasons (`:1233`, the colour tap finishes).
   - Ruled-out panels ("Log it — no reason": hockey `:488`, ice `:474`, league `:442`).
   - Hockey referral (`:468-476`).
   - "Who? (optional)" tally panels with "Team (no name)": ice `:517-523`, union `:541-560`, league `:446-470`.
   - Union penalty-try card ("✓ No card", `rugby/index.tsx:445`).
   - League sanction ("✓ No sanction — to the conversion", `:376`).

   These finish on the tap that records. A brief "✓ Saved" line would help but isn't needed.

## Risks

- **R1 False zeros (blocker).** A toggle that is ON counts as "captured":
  - ice hockey `tallyTracked` (`engine.ts:920-921`)
  - union `tallyTracked` / `detailTracked` (`engine.ts:720-726`)
  - league `trackedDetails`, commented "every line reads 0 for them" (`engine.ts:677-679`)
  - hockey `referralsTracked` / `possessionTracked` (`depth.ts:21-25`)
  - football `footballTrackedKeys` (`index.tsx:270`)

  With every toggle on by default, a scorer who taps only goals gets "Tackles 0 · Turnovers 0 · Hits 0" on every player card. **Fix:** for a default-ON toggle, a stat shows only once at least one event of that kind was recorded in the match. Keep "toggle on" meaning "offered", not "captured". Test it with an all-defaults match that taps only goals.
- **R2 Replay of old matches: safe if only the field `default` changes.**
  - The engines read stored keys with an off fallback: union `:271`, ice `:258`, hockey `:199-201`, football deep `engine.ts:172-176`.
  - Football base `readTrack` falls back to the *full* set for saved matches (`engine.ts:177-187`). Do not touch `BASE_TRACKABLE`'s `full` column. Change only `FRIENDLY_ON` and the deep field default.
- **R3 Live-settings `defaults` must move with the field default.** These are football `engine.ts:209-213` (deep all `false`), hockey `:669`, ice `:939`, union `:823` and league `:703`. If they don't move, Reset turns options off and a fresh match shows "N changed" (the D9 precedent in `docs/security/breaks/defaults-invasion.md`).
- **R4 Misleading values that are not zeros.** A partly tapped possession bar (football, hockey, union), a partly counted six-tackle set, and partial +/- all give a wrong number rather than a missing one. This is why those four stay OFF.
- **R5 Screen clutter.**
  - Football: all 13 base and 4 deep buttons on.
  - Ice hockey: 7 extra chips per side (`index.tsx:569`).
  - Union: 4 tally chips plus 4 restart chips per side.

  Nothing blocks, but the Goal and Try buttons get harder to find. Consider a collapsed "More stats ›" row per team.
- **R6 Founder decisions this reverses.** Confirm before flipping:
  - MVP F8 "Quick" friendly (`football/meta.ts:38-45`). Its pinned tests are `tests/football-quick-default.test.mts`, `tests/sim-football-quick.test.mts` and `tests/defaults-invasion.test.mts`.
  - Football round 2 "school matches have no VAR" for ruled-out goals (`meta.ts:22`).
- **R7 Commentary wording.** Commentary and timeline rows come only from logged events (ruled-out, restarts, tallies), so a default-ON toggle adds no sentence by itself. No wording change is needed. Hockey's "Referrals 0–0" sheet row is the one visible wording risk, which is why it stays OFF.
- **R8 Inconsistent grouping in the Info chain.**
  - Ice hockey `plusMinus` has no group in `meta.ts:60` and is grouped "Stats" in live settings (`engine.ts:934`).
  - Union `trackDetail` has no group in `meta.ts:50` but is "Stats to track" in live settings (`engine.ts:812`).
  - Football deep toggles are "Deeper stats (optional)" (`meta.ts:53`).

  If all go ON, put them all under one "Stats to track" group.
