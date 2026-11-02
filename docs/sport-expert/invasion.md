# Invasion sports: the scorer's tap-by-tap mechanism (2026-11-02)

Football, hockey (field), ice hockey, rugby union and rugby league. The angle is **how the scorer records each moment** and whether the chain holds: **Info (settings) → Scoring (what is offered) → Stats + Commentary (what comes out)**. Earlier depth audits (`docs/sport-depth/football.md`, `deep-wave/invasion-goal*.md`, `deep-wave/north-american-and-rugby*.md`) are not repeated; founder answers there still stand (e.g. hockey possession / referrals stay off by default).

Read-only audit. Nothing was changed in code. Line numbers are as of commit 5fb91a3.

Key: ✓ = captured as the laws / data providers count it · partial = captured, but with a gap · ✗ = cannot be recorded.

---

## 1. Football (IFAB Laws, FIFA / Opta)

### Every way an event happens

| Event | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Goal, open play | +1 | `Goal — {team}` → scorer → assist panel (open play is the default) (`football/index.tsx:1195`, `:836`) | ✓ |
| Header / left foot / right foot | goal detail | Chip on the assist panel: "Header" (`:890`); feet only with Shot detail on (`:892`) | ✓ |
| Penalty goal | +1 | `Award a penalty` → won by → taker → Scored (`:1211`, `:990-1013`); or the "Penalty" chip after a goal | ✓ |
| Direct free-kick goal | +1 | "Free kick" chip (`:893`) | partial: no direct vs indirect split; a goal from a corner or other set piece reads "open play" (Opta "situation": open play / set piece / corner / fast break / penalty) |
| Own goal | +1 to the other side | "🔃 Own goal instead" (`:841`) | ✓ |
| Team goal, no scorer | +1 | "⚽ Team goal — no scorer" (`:840`) | ✓ |
| Assist | credit | Pick on the assist panel, or "✓ No assist" (`:902-903`) | ✓ |
| Shot on / off target / blocked / woodwork | shot | `🎯 Shot` → player → On target (→ Goal / Saved / On target only) · Off target · Blocked (→ blocker) · Woodwork (Shot detail only) (`:1065-1117`) | ✓ |
| Save (from a shot) | keeper save | "🧤 Saved" on an on-target shot: logs the shot and the keeper's save (`:1085`) | ✓ |
| Save (from the grid button) | keeper save | `🧤 Save` → team → keeper by default (`:1022-1026`) | **partial: no shot is logged for the shooting side**, so a match can show more saves than the other side's shots on target |
| Penalty saved / missed | no goal | Penalty → Saved / Missed (`:1011-1012`): `penaltyMissed` + (saved) a keeper save (`finishPenalty`, `:448`) | **partial: no shot is logged.** A scored penalty counts as a shot on target (`actions.ts` `goalAction`), a saved or missed one doesn't: shots, shots on target and conversion are skewed |
| Penalty conceded | foul by defence | — | **✗ The penalty flow never asks who gave it away**, so the foul, the "penalty conceded" figure and the card (DOGSO / handball) all need separate taps the flow never offers |
| Corner | team count | `⛳ Corner` → team (one tap) | ✓ |
| Offside | team / player | `🚩 Offside` → team → player | ✓ |
| Foul (+ fouled player, card) | foul | `🟫 Foul` → team → fouler → fouled (optional) → "Card for X?" (`:957-988`) | ✓ |
| Handball | offence | `🤾 Handball` → team → player | ✓ |
| Yellow / second yellow / red | card, sending off | `🟨 Card` → player → Yellow / Red; a second yellow adds the red itself (`actions.ts` `cardActions`) | ✓ (card reasons behind a toggle) |
| Card to a team official | card | "👔 Team official" (`:1046`) | ✓ |
| Sin-bin (grassroots) | 10 min off | Only when the format sets minutes (`:1141`) | ✓ |
| Goal ruled out (offside / foul / VAR) | none | "❎ Goal ruled out" only with the toggle on (`:1215`) | ✓ (off by default, founder) |
| VAR: penalty given / overturned, red upgraded | varies | — | ✗ (P2; school matches have no VAR) |
| Stoppage: injury / VAR check / cooling break | timeline note | "⏸️ Stoppage / injury" (`:1205`) | **partial: the reason is never asked.** The commentary has texts for injury, VAR check and cooling break (`feed.ts:70-73`) that can never appear: every stoppage reads "Delay in match." It also uses `dispatch`, not `fire`, so a backfilled stoppage gets the live minute |
| Added time | clock | +1…+8 chips (`:1313`) | ✓ |
| Substitution | squad | `Sub — {team}` (`:715`) | partial: no concussion substitute (IFAB permanent concussion subs, outside the normal limit) |
| Extra time / shoot-out | decider | ET button, first-kicker toss, Scored / Saved / Missed with taker and keeper (`:789-798`, `:1556`) | ✓ |
| Futsal time-outs, accumulated fouls | futsal | Clock panel (`:1443`) | ✓ |
| Goal kicks, throw-ins, clearances, key passes | depth | Behind "Deeper stats" toggles | ✓ |

**Speed note:** Shot → On target → ⚽ Goal goes through "How was it won?" and "Struck with?" with no skip (`:849-868`): 4 forced taps, against 2 from the Goal button.

### The chain

| Link | Break |
|---|---|
| Info shows every setting | **Settings card hidden from viewers and after full time:** `showLiveSettings` (`LiveScoringScreen.tsx:2337`) needs a scorer or manager and `!complete`. Nobody can see afterwards which stats the match captured. `formatLine` (`:2911`) gives "5-a-side · 5 subs" only: no half length, periods, decider, sin-bin, futsal rules or tracked stats. |
| Info setting → Scoring | "Cards" can be switched off (`meta.ts BASE_TRACKABLE`). That hides the Card button (`index.tsx:1153`), so **a red card (a player sent off, the side a man down) can't be recorded at all.** Every other toggle shows or hides its own button, as it should. |
| Scoring → Stats | **Likely career break, confirm with a test:** crosses, dribbles, offsides, handballs, penalties won and penalties missed are credited to players but are missing from `trackedKeys()` (`index.tsx:248-262`), and their stats rows have no `opt()` / coverage (`stats.ts:30-39`). `trackedIn()` (`statSchema.ts:428`) reads a key missing from the line's `tracked` list as "not tracked", so these rows may be hidden on careers even when captured. |
| Scoring → Commentary | Stoppage reasons (above). Everything else captured reaches the feed (`feed.ts:51-136`). |
| Defaults hide depth | **Friendlies capture only goals, assists, subs and cards** (`meta.ts:45`, `default: k === 'cards'`). Shots, saves and corners are never offered, so a friendly's Stats tab has no shots or saves at all. This is the tennis TF2 problem: the founder made tennis point detail ON for new matches. Tournaments keep the full set. |

---

## 2. Hockey (FIH Rules of Hockey, FIH match statistics)

### Every way an event happens

| Event | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Field goal | +1 | `🏑 Goal` → Field goal → scorer → assist (`hockey/index.tsx:466`, `:356`) | ✓ |
| Penalty-corner goal | +1, PC converted | `🚩 PC` → PC panel → 🏑 Goal (`:468`, `:584`) | ✓ |
| Penalty-stroke goal | +1 | `⚪ Stroke` → Scored → scorer (`:471`, `:399`) | ✓ |
| Penalty corner awarded, and how it ended | PC count | 🚩 PC, then Goal / Saved / Wide / Defended / Stroke awarded / Re-awarded (`:575-593`) | ✓ |
| Shot on goal (saved) / wide / blocked | shot, keeper save | `🎯 Shot` → On goal — saved / ↗ Wide / 🛡 Blocked → player; a save goes to the keeper by itself (`:380-385`, `index.tsx:181-184`) | ✓ |
| Stroke saved / missed | no goal | Stroke → Saved / Missed (`:400-401`) | **partial: a scored stroke counts as a shot on goal (`engine.ts:249`), a saved one only as `strokesMissed` (`:253`) while the keeper gets a save.** Saves can exceed the other side's shots on goal |
| Circle entry | attacking stat | Always-on tap panel (`:540-547`) | ✓ (not a setting, see the chain) |
| Green 2′ / yellow 5′ or 10′ / red | suspension | `🟨 Card` → colour → player (`:412-419`) | partial: no warning for a player's second green (FIH: the next card is at least a yellow), and no card for a team official (FIH coaches can be carded) |
| Video referral (upheld / lost) | team referral | Only with the toggle on (`:451`, `:474`) | ✓ (off by default, founder) |
| Goal disallowed after a referral | none | Remove the goal by hand | partial (P2) |
| Substitution, keeper change | squad | `🔁 Sub` (`:473`) | ✓ |
| Shoot-out | decider | First pick, Scored / Saved / Missed (`:307-309`) | ✓ |
| Possession | team % | Only with the toggle on (`:564`) | ✓ |
| Fouls / free hits / long corners | — | — | ✗ (P2: not in FIH's published match stats) |

### The chain

- **Info:** live settings show period length, stop clock, possession and referrals (`engine.ts:597-606`). `formatLine` gives "4 × 15 min" only. There is no mention of penalty corners on or off (Hockey5s), the decider, or that circle entries are always captured.
- **Scoring → Stats:** consistent (`eventCredits` feeds both). The only exception is the stroke-shot mismatch above.
- **Defaults:** fine (founder kept possession and referrals off).

---

## 3. Ice hockey (IIHF Rule Book; NHL / NFHS presets)

### Every way an event happens

| Event | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Goal + up to 2 assists | +1 | `🚨 Goal` → scorer → A1 → A2 (`ice_hockey/index.tsx:554`) | ✓ |
| Power-play / short-handed / even-strength, empty-net goal | goal detail | Worked out from the penalties and the net; EV / PP / SH / EN chips to change it (`:372-373`) | ✓ |
| +/- | on-ice | "Track +/-" option: pick who was on the ice (`:426-427`) | ✓ (off by default; right for one scorer) |
| Shot on goal → goalie save | SOG, save | `🎯 Shot` → shooter (optional); the save goes to the other goalie (`:555`, `engine.ts:360-364`) | ✓ |
| Missed / blocked shot, hits, giveaways, takeaways, faceoffs (with zones) | depth | Tally chips behind "Stats to track" (`:540`) | ✓ |
| Penalties: minor, double minor, major, major + GM, misconduct, GM, match, bench minor; infraction | PIM, manpower | `⏱ Penalty` → kind → infraction (or Skip) → player (`:459-469`) | partial: no "served by" (a bench minor or a goalie's penalty is served by a team-mate; NHL / IIHF game sheets record it) |
| Delayed penalty, coincidental penalties, PP ending on a goal | manpower | Engine (`engine.ts` header) | ✓ |
| Penalty shot | goal / save / miss | `⭕ Penalty shot` → Scored / Saved / Missed (`:443-445`, `:557`) | ✓ |
| Pull / return the goalie | empty net | `🥅 Pull goalie` (`:558`) | ✓ |
| Time-out | 1 a team | `⏸ Time-out` (`:560`) | ✓ |
| Overtime / shoot-out | decider | Preset rules; shoot-out shooter optional, ✓ Scored / ✗ Saved or missed (`:318-325`) | partial: the shoot-out goalie is never recorded and "saved" and "missed" are one button, so there are no shoot-out save stats |
| Disallowed goal / coach's challenge | none | Remove the goal by hand | partial (P2) |
| Icing / offside | stoppage | — | ✗ (P2: not in IIHF / NHL box scores) |

### The chain

- **Info:** live settings cover period length, stop clock, +/- and the five Stats-to-track toggles (`engine.ts:861-871`). `formatLine` gives "3 × 20 min" only: no OT, shoot-out, preset (IIHF / NHL) or PIM scale.
- **Scoring → Stats / Commentary:** consistent (`eventCredits`, `commentary.ts:26-64`).
- **Defaults:** shots on goal are core (always on). The optional tallies being off is right for one scorer.

---

## 4. Rugby union (World Rugby Laws)

### Every way an event happens

| Event | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Try (5) + try assist | +5 | `🏉 Try` → scorer → assist (`rugby/index.tsx:551`, `:378`) | ✓ |
| Conversion (2) | +2 / miss | Straight after the try: ✓ Good / ✗ Missed / Not taken → kicker (`:392-395`) | ✓ |
| Penalty goal (3) / drop goal (3) | +3 | `🎯 Kick at goal` → kind → Good / Missed → kicker (`:407-416`) | ✓ |
| Penalty try (7) | +7 | `🏉 Penalty try`: one tap (`:553`) | **partial: no offender and no card prompt.** Law 8 has the offender carded in most penalty tries, so the scorer must remember to open Card separately |
| Yellow (sin-bin) / red / 20-minute red / second yellow = red | suspension | `🟨 Card` → Yellow / Red / 20-min red → player; team official (`:429-444`) | ✓ |
| Replacement, HIA / blood (temporary), rolling | squad | `🔁 Sub` (`:454-459`) | ✓ |
| Penalties conceded by offence, free kicks | discipline | Only with "Penalties by offence" on | ✓ (off by default) |
| What the penalty was used for (kick at goal / touch / scrum / tap) | restart | — | ✗ (P2) |
| Tackles, missed tackles, carries, line breaks, turnovers, lineouts and scrums won / lost | depth | `📋 Detail`, only with "Tackles, carries and set pieces" on (`:556`, `:496-505`) | ✓ (off by default) |
| Turnovers conceded, 22 entries, possession and territory, offloads | depth | Behind the toggles | ✓ |
| TMO: no try / try awarded | none | — | ✗ (P2) |
| Kicking competition | decider | ✓ Over / ✗ Missed (`:325-329`) | ✓ |
| 50:22, kicks in play, mauls, rucks | depth | — | ✗ (P2) |

### The chain

- **Info:** live settings cover half length, sin-bin, detail and the five toggles (`engine.ts:772-786`). `formatLine` gives "Sevens · 2 × 7 min" only: no sin-bin, 20-minute red trial or decider. A viewer can't see whether penalties or set pieces were tracked.
- **Scoring → Stats / Commentary:** consistent. The penalty try carries no player, which is correct.
- **Defaults:** everything beyond points and cards is off. "Penalties conceded" is the stat a rugby audience expects first (World Rugby / Opta team sheet), and it is a one-tap team count with the player optional. **Recommend ON for new matches** (founder call).

---

## 5. Rugby league (IRL / NRL laws)

### Every way an event happens

| Event | Effect | How the scorer records it now | Gap |
|---|---|---|---|
| Try (4), bonus-zone try (5, Nines) + assist | +4 / +5 | `🏉 Try` → (zone) → scorer → assist (`rugby_league/index.tsx:445`, `:290-291`) | ✓ |
| Conversion (2) | +2 | After the try (`:312-315`) | ✓ |
| Penalty goal (2) | +2 | `🎯 Kick at goal` (`:446`) | ✓ |
| Field goal (1, or 2 from 40 m) | +1 / +2 | `🥅 Field goal` → Good → 1 or 2 points (`:447`, `:337-338`) | ✓ |
| Penalty try (4) + conversion | +4 | `🏉 Penalty try` → conversion (`:186`, `:448`) | ✓ (no offender or card prompt, as in union) |
| Sin bin / send off / on report | suspension | `⏱ Sin bin · off` (`:353-356`) | ✓ |
| Interchange, HIA, blood bin | squad | `🔁 Interchange` (`:374-379`) | ✓ |
| Six-tackle set: tackle count, kick, error, penalty against, six again | sets | Set panel (`:474-486`), with "Six-tackle sets" on | **partial: "Penalty against" exists only for the side in possession.** A full penalty against the defending side goes in as "Six again" (`:486`), so the defence's penalties conceded are undercounted when only sets are tracked (NRL "penalties conceded" counts both) |
| Tackles, missed tackles, runs, line breaks, offloads, errors, penalties | depth | `📋 Detail`, behind toggles (`:451`) | ✓ |
| 40/20, 20/40, goal-line drop-out, seven-tackle set | restarts | — | ✗ (P2) |
| Bunker: no try / try | none | — | ✗ (P2) |
| Golden point / golden try | decider | Format (`meta.ts`) | ✓ |

### The chain

- **Info:** `formatLine` gives "13-a-side · 2 × 40 min · golden point". It leaves out the 2-point field goal, the bonus try zone, tackles per set and the toggles.
- **Scoring → Stats:** with "Errors & penalties" on, an Error / Penalty set ending asks for the player (`:480-484`). Consistent.
- **Defaults:** all off. Recommend "Errors & penalties conceded" ON for new matches. It is the same one tap as the set ending.

---

## Ranked fix list

Practicality filter: one scorer, one phone. Every new capture is optional, comes after the main tap, and can be skipped at no cost. Old logs must replay identically. Every fix below adds new payload keys or new actions only, and reducers keep ignoring what an old log lacks.

| # | Pri | Size | Sport | What changes | Event-log impact |
|---|---|---|---|---|---|
| 1 | P0 | S | Football, hockey | **A save or a missed penalty/stroke must be a shot.** A saved or missed penalty also logs the taker's shot (saved = on target; missed = off target). The grid's `🧤 Save` also logs an on-target shot for the other side, with the shooter optional ("Not sure"). A saved hockey stroke credits `shots` and `shotsOnGoal` like a scored one. Then saves can never exceed the other side's shots on target. | New STAT / SHOT actions on new taps only. Old matches keep their figures (note it in the release, as earlier waves did). |
| 2 | P0 | S | Football | **Career keys:** confirm with a test that crosses, dribbles, offsides, handballs and penalties won / missed show on a career. If they don't, add them to `trackedKeys()` when tracked (penalties won / missed always), or give the rows `coverage: 'present'`. | Tracked lists on new attributions only. Older lines may need a statTotals pass (check before changing). |
| 3 | P0 | S | Football | **A red card must always be recordable.** "Cards" off should hide only yellow-card depth (or leave the Card button in place). A sending off changes who is on the pitch. | None. |
| 4 | P1 | M | All five | **Info holds the match's rules and captures for everyone:** a read-only "Captured: shots · saves · cards …" line and a fuller `formatLine` (half / period length, decider, sin-bin, futsal, PCs, OT / shoot-out, 2-point field goal, bonus zone, 20-minute red). Show it to viewers and after full time; the editable card stays scorer / manager-only (`LiveScoringScreen.tsx:2337`, `:2911`). | None (display only). |
| 5 | P1 | S | Football | **Stoppage reason:** after "⏸️ Stoppage / injury", one optional chip row (Injury / VAR check / Cooling break / Other). The reducer and commentary already read `payload.reason`. Use `fire()` so a backfilled stoppage keeps its minute. | `reason` already optional; old stoppages read as now. |
| 6 | P1 | S | Football | **Penalty conceded:** in the penalty flow, an optional "Who gave it away?" step logs the foul (credited) and opens the existing "Card for X?" step. | New foul STAT actions; old logs unchanged. |
| 7 | P1 | S | Football | **Defaults (founder call, tennis TF2 precedent):** friendlies switch Shots and Saves on (both one tap, player optional), so a friendly's Stats tab has its two most-read figures. Corners optional. New matches only. | None; saved matches keep their `track*` keys. |
| 8 | P1 | S | Rugby, league | **Defaults (founder call):** "Penalties conceded" (union) and "Errors & penalties" (league) on for new matches. These are one-tap team counts with the player optional. | None. |
| 9 | P1 | S | Rugby, league | **Penalty try:** an optional "Card for the offender?" step after the tap (Yellow / Red / Skip). | Ordinary CARD actions. |
| 10 | P1 | S | League | **A penalty against the defending side** as its own set ending ("Penalty to {attacking side}"), counted as a penalty conceded by the defence. "Six again" stays for set restarts. | New set-end value; old "restart" ends read as before. |
| 11 | P1 | S | Hockey | Warn on a player's second green card (FIH escalation) and on a second yellow. Add team-official cards, as football and rugby have. | Warn only; an official card is a new payload flag. |
| 12 | P2 | S | Football | Faster Shot → On target → Goal: go straight to the assist panel (type chips are there already), not two forced steps. | None. |
| 13 | P2 | S | Football | Goal situation behind "Shot detail": corner / set piece / fast break, and direct vs indirect free kick. | New optional goal keys. |
| 14 | P2 | S | Ice hockey | Shoot-out: Saved and Missed as separate buttons, plus the goalie (shoot-out save stats). Penalty "served by" (optional). | New optional keys. |
| 15 | P2 | M | Hockey, ice, rugby, league | "Goal / try ruled out" (referral, coach's challenge, TMO, Bunker) behind a toggle, as in football. | New event type; off by default. |
| 16 | P2 | M | Rugby, league | Restart and penalty-use depth: penalty to touch / scrum / tap, 50:22, 40/20, 20/40, goal-line drop-out. | New optional TALLY kinds. |
| 17 | P2 | S | Football | Concussion substitute (outside the limit; IFAB permanent concussion subs). | New SUB flag. |

---

## Shared fixes

1. **One "captured" line in Info for every sport** (fix 4). Build it from the plugin's own `liveSettings.read(state)`, so the five sports and every future sport get it at once. Every viewer sees it, before, during and after the match. This closes the Info link of the chain.
2. **Shots, saves and goals must add up** (fix 1). One rule for every goal sport: every save is a shot on target faced, and every penalty / stroke attempt is a shot. A shared test can assert `saves(A) ≤ shotsOnTarget(B) − goals(B)` over simulated logs for football, hockey, ice hockey (and handball).
3. **Tracked keys and stat coverage in step** (fix 2). A shared test: every key a plugin credits live is either in its `tracked` list when captured, or has `coverage: 'present' | 'keyed'`. This stops a captured stat from vanishing on careers.
4. **Defaults, decided once by the founder:** a short list of what new matches capture with no extra taps. The tennis precedent says depth is on and skippable.
