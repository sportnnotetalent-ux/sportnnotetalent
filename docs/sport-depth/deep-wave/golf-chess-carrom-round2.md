# Deep wave, round 2: golf, chess and carrom

**Founder answers (2026-10-22).** The founder answered every open question in [golf-chess-carrom.md](golf-chess-carrom.md). This round builds those answers.

**Rules followed (unchanged from the deep wave):**
- Entry stays one tap; every new capture is optional.
- Old matches and rounds replay identically. The one exception is a score rule the founder chose (carrom), and it is gated on a new format flag.
- Nothing untracked reads 0. Career keys are written only when the stat was tracked.
- Rule details are organiser options with standard defaults.
- Credits go to player ids.

**Constraints kept:**
- `src/screens/LiveScoringScreen.tsx` is untouched.
- No plugin's `LiveExtras` / `liveViews` composition changed. Chess's `ChessLiveExtras` and carrom's `LiveExtras` are as they were.
- No migration.
- `DEVLOG.md` and `BACKLOG.md` are untouched.
- In the shared pinned tests, only the golf, chess and carrom lines changed.

---

## 1. Golf

### 1a. Metres option

**What it does:**
- A new format option: **Distances: Yards (default) / Metres** (`distUnit: 'm'`). It is in the golf format's advanced fields, so it applies to a tournament or a round.
- On a live round, the organiser can switch it in **⚙️ Stats to track** (chips: Yards · Metres), shown once drives or first-putt lengths are tracked. A marker sees "Distances are in metres (set by the organiser)".

**What changes in a metres round:**
- The drive is typed and shown in metres ("Drive m"; "245-m drive" in the commentary).
- The stats panel shows "245 m" and "Longest drive (m)".
- The first-putt buckets show their metric equivalents:
  - < 1 m
  - 1–3 m
  - 3–6 m
  - 6 m+
  - (These match 3 ft ≈ 0.91 m, 10 ft ≈ 3.05 m and 20 ft ≈ 6.1 m.)

**How it is stored:**
- Cards always store yards, and the buckets keep their index and career keys. So careers add up across rounds in either unit.
- 1 yd = 0.9144 m, so every whole metre maps to its own whole yard and back. The round trip is exact, and a test checks every value from 46 to 411 m.
- On the profile, Driving distance and Longest drive also show the metric figure: "268.5 (245.5 m)".

### 1b. Tournament leaders

**New leaders:**
- putts per GIR
- driving distance
- par-3, par-4 and par-5 scoring averages

**Minimums** (the organiser can change each one through the existing `leaderMins`):

| Leader | Default minimum | Why |
|---|---|---|
| Putts per GIR ("Fewest putts per GIR", the PGA TOUR's Putting Average) | **9 greens hit** | Juniors hit few greens, so 18 would leave most 2-round fields empty |
| Driving distance | 4 drives measured | Unchanged |
| Par-3 / 4 / 5 scoring averages | 8 / 20 / 8 holes | Two rounds on a par 72 |

Putts per round was already a leader.

**Order:**
- In stroke play, the new leaders follow GIR %.
- In a metres tournament, driving distance shows in metres: "Driving distance (m)". The lines stay in yards.
- `GOLF_STROKE_LEADERS` lists the new keys.

### 1c. Up and downs, apart from scrambling

**Definition, following the PGA TOUR.** The PGA TOUR's Sand Save % says "up and down" means "it took the player 2 shots or less to put the ball in the hole from that point".
- An up and down is: from the first shot played off the green, holed in two strokes or fewer, whatever the score. A chip and one putt counts, and so does a chip-in.
- A chance is a hole with at least one shot from off the green and the putts entered.
- Scrambling keeps its PGA definition: missed green, par or better. A chip and one putt for bogey is an up and down but not a scramble.

**Capture.** A new optional stat in Stats to track: **Up and downs**. It brings putts with it.
- On any hole not hit in regulation, a row "Off green 1 · 2 · 3+" appears. 3+ is stored as 3.
- Each value is the number of shots played from off the green around it (chips, pitches, greenside bunker shots).
- After the putts are entered, the row shows "Up & down ✓ / ✗".

**Keys** (written only on a card kept with it):
- `udChances`, `upDowns` and the derived `upDownPct`.
- They appear on the profile under a new **Around the green** section.
- The round stats panel shows "Up and downs" beside "Scrambling". Older cards keep the label "Scrambling (up & down)".
- The commentary reads "up and down to save par", "up and down for birdie", or "1 shot from off the green, no up and down".

---

## 2. Chess

### 2a. Mate / stalemate pre-selects the result

`boardResult` reads the position after the entered moves:
- **Checkmate:** the side to move is mated, so the other colour wins, by checkmate.
- **Stalemate:** a draw, by stalemate.

**What the Scoring tab does:**
- It pre-selects the 1-0 / 0-1 / ½-½ tile and the method, with a line such as "#️⃣ Checkmate on the board — 0-1 is pre-selected. Check it, then record."
- The arbiter still taps Record and confirms.
- If the scorer takes the move back, the pre-selection clears, unless the scorer had changed it.
- A pick the scorer made by hand is never overwritten.

### 2b. Opening repertoire on the profile

**What the profile shows:**
- A new card, **Opening repertoire**, with tabs "As White" and "As Black".
- Each row is an opening family with its ECO range, games, W-D-L and score %.
- Tapping a family lists its openings by ECO.
- The card follows the profile's split chips.

**How it is built:**
- It is read from the games themselves (each match's state), so no line key or migration is needed. An older game that has moves or a typed ECO counts at once.
- **Family** is the name before the variation ("Sicilian Defense: Najdorf Variation" → "Sicilian Defense"). A typed code that the table doesn't name falls back to its ECO volume.
- A game with no opening is left out (never guessed). Forfeits are left out.
- A knockout match gives one entry per game, with that game's colours.

### 2c. Performance-rating (TPR) leader

**What it is:** a `tpr` leader, "Performance rating (TPR, unofficial)", with a minimum of **5 rated games**. The organiser can change the minimum.
- Five games is FIDE's minimum number of games against rated opponents for a first rating.
- The leader appears only where ratings exist.

**Where the data comes from:**
- The ratings layer already existed (SD-85: `sportDetails.chess.ratings`), so no migration.
- `withChessPerformance` adds three keys to the tournament's chess lines when the page loads. They are not stored. The keys are computed from:
  - games played over the board (forfeits are not games);
  - the opponent's rating on the event's list (rapid / blitz / standard by time control);
  - the points scored.
- The `tpr` stat is a `formula` (ARO, rounded half up, + dp(p), FIDE B.02 8.1a). So it is the same figure as the crosstable's TPR.

**Where it shows:** the tournament page only. The cross-tournament sport hub has no TPR, because time controls mix there.

### 2d. One move list per knockout game

**How the lists work:**
- In a knockout match, `state.game` is now the list of the game **in play**.
- Recording that game's result moves the list (and its opening) into its `KoGame`, and the next game starts empty.
- The Scoring tab shows the move box for the game in play. Under it, "Moves of a game already played: Game 1 · Game 2" lets a scorer paste a recorded game's PGN (`MOVES` / `OPENING` with `koGame`).

**Where the lists are used:**
- **Commentary:** each game's moves appear under its result line, and the game in play's moves sit on top.
- **Careers:** each game with a list counts, summed per side. Games without a list write nothing.
- **Repertoire:** reads each game's own list.

**Replay:** no older log has a `MOVES` action on a knockout match (they were ignored and the box was hidden). A test checks that an older knockout log replays with no new key and its feed reads exactly as before.

---

## 3. Carrom

### 3a. Foul types in ICF / AICF terms

"Line / hand" splits into three types:

| Type | ICF Laws |
|---|---|
| Base line | The Striker must touch both base lines (r.130) |
| Arrow line | No part of the body but the hand beyond the arrow lines (r.32); the Striker on the arrow from a base circle (r.130) |
| Elbow crossing | The playing elbow within the playing surface (r.37) |

**How older data is kept:**
- The foul chips are now: striker pocketed · touching · base line · arrow line · elbow crossing · thumbing · other.
- Boards recorded before the split keep their `line` count.
- A new board carries `det.split`.

**Career keys:**
- New keys: `foulBase`, `foulArrow` and `foulElbow`.
- A line gets these split keys only when a board was split.
- A line gets `foulLine` only when a board wasn't split.
- So an older line keeps exactly its keys, and no type reads a false 0.

### 3b. ICF foul penalties in the score: the exact rule implemented

**The option:**
- A new organiser option: **ICF foul penalties in the score** (`foulScore`).
- Its default is **on**, so new tournaments and matches get it through the format defaults.
- A match or tournament format saved before this change has no key. Its boards replay to exactly their old scores, and a test pins that. A tournament already set up keeps its rules unless the organiser switches the option on.

**What the ICF Laws say (as published by the UK Carrom Federation and AICF):**
- A foul or a Due (the Striker pocketed) costs the offender one pocketed coin. The opponent places it back on the board (r.63, r.64, r.72–77).
- With no pocketed coin, the Due is owed and placed as soon as one is pocketed (r.72, r.83).
- A Due or penalty coin still owed when the board ends is **written off** (r.55).
- The board winner scores the opponent's coins **on the board** (r.53), at most 12 a board (r.55).

**What follows for the app:**
- The returned coin is already in the coins left that the scorer counts.
- A due that is still owed scores nothing.
- So **the app never adds a point per foul.** That would count the coin twice and break r.55.

**What ICF does turn into points, and what `foulScore` therefore enforces** (`boardValue`):
1. **Penalty board** (a board lost "by 3", the Queen's value; r.102–109): **3 points, or 1 once the awarded side has 22 or more.** Before this change it was always 3.
2. **The board-ending stroke's foul by the loser** (r.102–112, "if demanded"): **+1 for the Striker pocketed** (a Due) and **+1 for an improper (foul) stroke**, to the board winner. The scorer taps what was claimed under "Board ended on {loser}'s foul?":
   - r.108–112: +1 proper, +2 improper;
   - r.102–107: +1 improper.
3. **12 points a board at most** (r.55).

**Where the rule shows:**
- **Form hint:** under the coins chips, the form says: "Count the penalty coins put back on the board. A due still owed when the board ends is written off (ICF)."
- **Penalty chip:** shows its live value (+3 or +1).
- **Board-ending foul:** if fouls are tracked, tapping "Striker pocketed · +1" also logs one striker foul for the loser.
- **Record button, commentary and match stats:** the Record button and the live credit use `boardValue` (the voice parser too). The commentary says "Ended on Priya's foul — striker pocketed +1", and the match panel shows "Points from the opponent's board-ending fouls".
- **Corrections:** a board correction (`EDIT_LOG`) keeps the board-ending foul.

### 3c. Doubles "who" chip

**Capture:**
- In doubles with fouls tracked, each side's foul row starts with "Who: {A} · {B}".
- The chosen partner stays selected, and every foul or due tapped also goes on their record (`det.who`).
- Each partner's chip shows their own count.

**How partners are credited (`whoFouls`):**
- On boards where **every** foul and due of the side has a who, each partner gets their own counts.
- A partner who didn't foul on such a board gets a true 0 for it.
- A board with an unattributed foul credits neither partner. It still counts for the pair in the match panel.
- Older doubles matches (no `who`) still give no foul keys, as before.

---

## 4. Event-log and data impact

**New optional payload and state keys** (no older log has any of them):

| Sport | Keys |
|---|---|
| Golf | Card `offGreen`, round format `distUnit` |
| Chess | `MOVES` / `OPENING` payload `koGame`; `KoGame.game` / `KoGame.opening` |
| Carrom | `BOARD` payload `endFoul`; `det.split` / `det.who`; format `foulScore` |

**Unchanged:** no migration and no new action type.

## 5. Tests

**New test files:**
- `tests/golf-round2.test.mts` (16)
- `tests/chess-round2.test.mts` (17)
- `tests/carrom-round2.test.mts` (13)

**Pinned lines updated (golf, chess and carrom only):**
- `tests/stat-schema.test.mts`: golf categories
- `tests/leaders-awards.test.mts`: golf minimums, chess categories
- `tests/sd49-golf-field-leaders.test.mts`: the stroke-play order now includes the par averages
- `tests/chess-deep.test.mts`: a knockout game now keeps its list
- `tests/one-tap-deciders.test.mts`: `boardCloses` takes the board-ending foul

## 6. Follow-ups not built

- ~~**Chess:** pasting a knockout game's moves after the whole match is over.~~ Wired 2026-10-22: the Scoring tab's after-match slot (`matchTabs.AfterMatch`) shows the same "Moves of a game already played" chips once the match ends. A forfeited game offers no paste.
- ~~**Chess:** a performance-rating award slot. Only the leader was asked for.~~ Built 2026-10-23: a **Best performance rating** tournament slot (`tpr`, 📊, after Best score %).
  - It ranks the leader's figure with the leader's minimum: 5 rated games, and an organiser's `leaderMins.tpr` changes both.
  - It is offered only where ratings exist (`onlyIfTracked`). The tournament page now gives the Awards tab the same rated lines as the leader (`perfLines`).
  - Ties: more games against rated opponents, then by name.
  - The candidate line reads "1909 TPR · 5 rated games · 7 m". The `tpr` stat gained `short: 'TPR'`.
- ~~**Golf:** "chip-ins" and scrambling-by-distance splits. Both are free from `offGreen`.~~ Chip-ins built 2026-10-23. Scrambling by distance was **not** built, because it isn't free.
  - **Chip-ins** (`chipIn`): at least one shot from off the green and no putt. 3+ shots and then in still counts.
  - The `chipIns` key is written only on a card kept with up and downs, so there it is a true 0. No other card gets the key.
  - The round panel shows a "Chip-ins" row once someone on the card or in the field has one.
  - The profile's "Around the green" section lists chip-ins.
  - A **Most chip-ins** leader comes after the par averages. It is a count, like birdies, so it has no minimum, and only players with one rank.
  - **Why no scrambling by distance:** the PGA TOUR's splits (< 10, 10–20, 20–30, > 30 yd) need the distance of the shot played from off the green. No card records that. `offGreen` counts shots, and `firstPutt` is the putt's length after the chip. It would need a new optional per-hole capture.
- **Golf:** a metres view of the whole career (it shows yards plus metres for drives).
- **Feature guides on sportnnote.in:** cover the metres option, up and downs, the repertoire, TPR, knockout move lists and the carrom foul-penalty option.
