# Basketball, American football, baseball & softball: the scorer's tap-by-tap mechanism (2026-11-02)

Read-only audit, modelled on `docs/security/breaks/tennis-serve-and-endings.md` and `tennis-endings-depth.md`. Angle: what a scorer can tap for every way a possession, play or plate appearance ends, and whether the chain **Info → Scoring → Stats / Commentary** holds. Items already settled in `docs/sport-depth/basketball.md`, `deep-wave/court-team*.md` and `deep-wave/north-american-and-rugby*.md` are not repeated. Where an older audit already listed a gap as a follow-up and it is still open, it is marked "known, still open".

Sources (from memory, verify before building): FIBA Official Basketball Rules 2024 and the FIBA box score / LiveStats; NBA play-by-play; NFL gamebook and NCAA stat manual; MLB Official Baseball Rules section 9 (official scorer); WBSC baseball and softball playing rules.

Legend: ✓ = a scorer can record it and it is counted right · partial = possible, but loses detail or needs a workaround · ✗ = no way to record it.

---

## 1. Basketball (`src/sports/basketball/`)

### 1.1 Every way a possession ends, and what goes around it

| Ending / event | Effect (FIBA / NBA) | How the scorer records it now | Gap |
|---|---|---|---|
| Made 2 / made 3 | 2 / 3 pts, FGM (+FGA) | Zone layout (default): `+2 Paint · +2 Mid · +3 Corner · +3 Top`, player chip first (`index.tsx:631-643`); plain layout `+2 / +3` (`index.tsx:656-662`) | ✓ |
| Missed 2 / missed 3 | FGA, no points | `⭕ Paint/Mid/Corner/Top` or `⭕ Miss 2/3`, **only when "Track missed shots" is on** (`index.tsx:645-651`, `:665-670`); default **off** (`meta.ts:17`) | partial: off by default, so FGA, FG%, 3P%, EFF and the shot chart's misses are never captured |
| And-one (2+1, 3+1) | basket + 1 FT | Plain layout: `🔗 And-one +2/+3` (`index.tsx:674-679`); zone layout: `🔗 And-one` chip in the box after the basket (`index.tsx:741-746`) | ✓ |
| Free throws 1 / 2 / 3 | FTM / FTA | Foul flow opens the FT panel with the count filled in; `Shots: 1 2 3` chips before the first shot; `✅ Made +1 / ❌ Miss` (`index.tsx:343-355`); `🎯 Free throws — team` any time (`index.tsx:752-755`) | ✓ (a shooting foul on a 3-point try is prefilled 2; the scorer must tap 3) |
| Technical free throw | 1 FT, any shooter | Foul type Technical → 1 shot (`engine.ts:395`) | ✓ |
| U / D / flagrant: 2 FTs **and the ball** | possession to the fouled team | FTs ✓ (`engine.ts:405`); the "and the ball" is not shown or logged (only 3×3 10+ fouls, `possessionAfterFoul`) | partial |
| Assist | AST | "Assist?" box after every make, on-court team-mates or Skip (`index.tsx:714-735`); or player row → `🅰️ Assist` (`index.tsx:430`) | ✓ |
| Defensive / offensive rebound (player) | DREB / OREB | Player row → `⏬ Def. rebound / ⏫ Off. rebound` (`index.tsx:425-428`) | ✓ (no prompt after a miss: two taps hunting for the row) |
| **Team rebound** (out of bounds after a miss, missed last FT that is not live) | team REB in the FIBA box | Rebound needs a player (`index.tsx:763-767`) | ✗ (known, still open: court-team.md:70) |
| Steal | STL **and** a turnover for the other side | `✋ Steal` (`index.tsx:431`); a separate event; no opponent turnover is added (`engine.ts:560`) | partial: the other side's TO stays 0 unless the scorer also finds the ball-handler and taps Turnover (known, still open) |
| Block | BLK **and** a missed FGA for the shooter | `🛡️ Block` (`index.tsx:434`); no linked miss (`engine.ts:562`) | partial: with misses off, FGA never sees the blocked shot (known, still open) |
| Turnover (bad pass, lost ball, travel, double dribble, 3 s, 5 s, 8 s, backcourt, out of bounds, offensive goaltending) | TO, by type in NBA PbP | `🔄 Turnover`, player only, no type (`index.tsx:435`) | partial: no type; ✗ for a **team** turnover (24-second / shot-clock violation, 5 s inbound, 8 s), which has no player |
| **Offensive foul** | PF **and a turnover** (FIBA and NBA box scores) | Foul type Offensive (`index.tsx:51`); counted as a foul only; `credits.ts:52` gives no turnover. `deep.ts:202` already treats it as a change of possession | ✗ wrong figure: TO is under-counted on every offensive foul |
| Personal / shooting foul | PF, team foul, bonus FTs | Player row → `🟨 Foul…` → type → (optional "who was fouled") (`index.tsx:361-412`); team foul without a player (`index.tsx:757-760`) | ✓ |
| Unsportsmanlike / disqualifying / flagrant; DQ by 2T, 2U, T+U | PF, FTs, ejection | Types in `FOUL_TYPES` (`index.tsx:51`); DQ asked and logged (`index.tsx:252-256`) | ✓ |
| Coach (C) / bench (B) technical; coach DQ after 2 C or 3 B/C | FIBA scoresheet | Team foul → Technical (`index.tsx:53`) counts it for the team; no coach, no coach DQ count | partial (known, still open) |
| Team fouls / bonus | FIBA 4 per quarter, OT carries | Banner + count (`index.tsx:690-699`); `isTeamFoul` `engine.ts:237` | ✓ FIBA; **NBA wrong**: NBA does not count offensive fouls as team fouls, and has the last-2-minutes rule; the NBA preset counts every non-technical foul (`engine.ts:237`) |
| Defensive goaltending / basket interference | basket awarded, FGM to the shooter | Tap the basket | ✓ |
| Jump ball / held ball / alternating-possession arrow | arrow flips; possession | Nothing | ✗ (known, still open; the official scorer runs the arrow in FIBA) |
| Shot clock | 24 / 14 s | Shown for reference only (`meta.ts:74`) | partial (deliberate) |
| Time-outs | FIBA 2 + 3 + 1 per OT, last-2-min limit | `⏸ TO` buttons with what is left (`index.tsx:768-780`) | ✓ |
| Substitutions, starting five | MIN, +/- | `🔀 Substitute`, `Set five` (`index.tsx:784-808`) | ✓ |

### 1.2 The chain

| Link | Break |
|---|---|
| Info shows the settings | `formatLine` (`LiveScoringScreen.tsx:2925`) shows only "5-a-side · 5 subs · 5 fouls out": no preset (FIBA / NBA / 3×3), no periods × minutes, no bonus number, no first-to-N, and nothing about which stats are tracked. The ⚙️ Scoring settings card (config mode) is shown only to the scorer and manager and only until the match ends (`LiveScoringScreen.tsx:2337`), so a spectator, or anyone after the final, cannot see that misses were not tracked. |
| Info setting → Scoring | All four toggles act (`index.tsx:159`, `:610`, `:736`, `:401`). ✓. Minor: an older match without `trackZones` reads plain, while `defaults` say zones on, so the pill shows "1 custom" on an untouched old match (`index.tsx:1052-1053`). |
| Scoring → Stats | Offensive foul never reaches TO (above). Steal never reaches the other side's TO. The FT after a U / D foul has no "and the ball", so points-off-turnovers can be wrong after one. |
| Stats row with no capture | Team rebounds (the FIBA box line) has no capture. `fgAtt`, `fgPct`, `threePct`, `eff` rows exist but are empty by default (misses off); the panel says so (`panel.ts:50`), so this is honest but hides depth. |
| Commentary | Every event type has a line (`commentary.ts:55-82`). Turnovers can't say what kind; no jump-ball line. |
| Default that hides depth | **Track missed shots is off** (`meta.ts:17`): the tennis "point detail off" case. Zones are on, so the shot chart shows makes only. Recommend: on for every new match (at least `tournamentDefault: true`), as the founder did for tennis. It is one tap per miss, the same as a make. |

---

## 2. American football (`src/sports/american_football/`)

Two modes (`meta.ts:30-37`): **Scores only** (default, onCreate) and **Play by play**. The table is for play-by-play; in Scores only, just TD / FG / safety / try / timeouts exist (`index.tsx:649-655`).

### 2.1 Every way a play ends

| Ending | Effect (NFL / NCAA / IFAF flag) | How the scorer records it now | Gap |
|---|---|---|---|
| Run (gain / loss / no gain) | down & distance; rush att / yds | `🏃 Run` → carrier → yards pad (`index.tsx:398-408`) | ✓ |
| Run or catch into the end zone | TD 6, rush / rec TD | Yards past the goal line become a TD automatically (`engine.ts:493-498`) | ✓ |
| Complete pass | comp / att / yds; rec / yds | `🎯 Pass ✓` → (passer remembered) receiver → yards (`index.tsx:631-634`, `:410-430`) | ✓ |
| Incomplete (also a spike) | att | `✗ Incomplete` (`index.tsx:635`); target and breakup optional | ✓ |
| Sack (flag: pull behind the line) | sack, yards lost | `💥 Sack` → defender → yards lost (`index.tsx:432-441`) | ✓ |
| Safety (tackled in own end zone) | 2 to the defence, free kick | Automatic from a run / sack below the goal line (`engine.ts:500-501`); `🛡️ Safety (2)` button | ✓ (verify the free-kick restart in play-by-play) |
| Interception | INT, possession | `🔄 Interception` → defender → where the new offence starts (`index.tsx:445-460`); `Returned for a touchdown` | partial: **return yards** and the returner's yards are not credited; only the spot |
| Fumble lost | fumble lost, recovery | `🏈 Fumble lost` → fumbler → recoverer → spot (`index.tsx:463-482`) | partial: no **fumble recovered by the offence** (FUM without a loss), no **forced fumble**, and the run / catch yards before the fumble are lost |
| Punt | punt yds, return yds, touchback, fair catch | `🦶 Punt` → punter → gross yards → return yards or touchback (`index.tsx:486-505`) | partial: no returner credited (PR / PR yds), no **blocked punt**, no fair catch or downed (return 0 stands in) |
| Kickoff | touchback, return, onside | Touchback button or "Returned — set where" spot (`index.tsx:590-597`, `:545-555`) | partial: no kicker, no returner, no **kick-return yards**, no **onside kick** (known, still open: "return yards") |
| Field goal good / no good | 3 pts; FGM / FGA, distance | `🥅 Field goal` with distance prefilled from the spot (`index.tsx:640`, `:328-340`) | ✓; no **blocked** FG |
| Extra-point kick / 2-pt try / flag 1-pt (5) and 2-pt (12) | 1 / 2 | Try panel (`index.tsx:563-581`) | ✓ |
| Defence returns a try | 2 to the defence | `↩ return it (2)` (`index.tsx:579`) | ✓ |
| Penalty before the snap (false start, offside, delay) | yards, replay down | `🚩 Penalty` → foul list per ruleset (`engine.ts:526-560`) → accept / other yards (`index.tsx:508-527`) | ✓ |
| Penalty **during a play** (holding on a 15-yd run, DPI spot foul, roughing after a completion) | play result + enforcement | Only as a separate dead-ball play; the play's own yards and the penalty can't be one event | partial |
| Declined / offsetting penalties; the penalised player | gamebook lists them | "A declined penalty: just don't record it" (`index.tsx:516`); no player | partial (team penalties and yards ✓, `sheet.ts`) |
| Turnover on downs | possession | Automatic from the down count, plus `⛔ Turnover on downs` (`index.tsx:642`) | ✓ |
| Kneel-down | rush −1, clock | Engine supports `kneel` (`engine.ts:59`, `:417`); **no button** | partial (log as a −1 run) |
| Tackle / flag pull, tackle for loss, pass breakup | defensive stats | Optional prompts when tracked (`index.tsx:206`, `:359-380`) | ✓ |
| Timeouts, two-minute warning | 3 per half (flag 2) | `⏸ TO · n left` (`index.tsx:715-722`) | ✓ |
| Ejection | | `🚫 Ejection` (`index.tsx:731`) | ✓ |
| Down & distance, ball spot | | Shown on the play panel, `📍 Set` to correct (`index.tsx:621-626`) | ✓ (known, still open: removing a play doesn't move the ball back) |

### 2.2 The chain

| Link | Break |
|---|---|
| Info shows the settings | `formatLine` (`LiveScoringScreen.tsx:2939`) shows "Tackle · 4 × 15 min" only: **not the scoring mode** (Scores only / Play by play), so a viewer can't tell why there are no yards; not the ruleset (NFL / NCAA / NFHS), OT rule or stats tracked. |
| Info setting → Scoring | **Targets, Pass breakups / TFL and tackles do nothing in Scores-only mode** (they act only in play-by-play, `index.tsx:202-206`), yet they can be switched on there. **The Game settings "Standard" defaults are NFL** (`engine.ts:1032`: 15 min, 3 timeouts), so a standard flag game (20 min, 2 timeouts, `meta.ts:10`) shows "2 custom" in the card (`LiveSettingsCard.tsx:40`, `:80`). |
| Scoring → Stats | Tackles and pass breakups are captured but `commentary.ts:99-101` returns nothing for them, so the play-by-play never says "tackle by X". |
| Stats row with no capture | Box has no KR / PR / INT-return rows, which matches the missing capture; the gamebook expects them. |
| Default that hides depth | Mode defaults to **Scores only** for every preset (`meta.ts:32`), including NFL / NCAA / NFHS tackle. It is asked at create (`onCreate`), which is better than tennis was. Recommend: keep Scores only for flag friendlies; make the three tackle presets carry `mode: 'pbp'` (the organiser can still pick Scores only); and show the mode on Info. |

---

## 3. Baseball & softball (`src/sports/baseball/`; softball, slow pitch and youth are presets, `meta.ts:9-15`)

### 3.1 Every way a plate appearance ends, and the baserunning

| Ending | Effect (MLB OBR 9 / WBSC) | How the scorer records it now | Gap |
|---|---|---|---|
| Ball / called strike / swinging strike / foul / in play / HBP | count, pitch count | Pitch pad `Ball · Strike · Swinging · Foul · In play · HBP` (`index.tsx:582-593`); pitch-by-pitch **on** by default (`meta.ts:66`) | ✓ |
| Walk (ball 4) | BB | Automatic on ball 4; quick pad `Walk` (`index.tsx:601`) | ✓ |
| Intentional walk | IBB (in BB) | More → `Intentional walk` (`index.tsx:518`) | partial: counted in BB, no IBB figure (`engine.ts:669-673`) |
| Hit by pitch | HBP | `HBP` (`index.tsx:592`) | ✓ |
| Strikeout looking / swinging | K, KL vs K | Pitch mode: the third `Strike` or `Swinging` (`engine.ts:987`) ✓. **Quick mode: `Strikeout` always logs swinging** (`index.tsx:602` → `engine.ts:965`), so the commentary says "strikes out swinging" for a called third strike (`commentary.ts:90`) | ✗ wrong text in quick mode; no KL count anywhere |
| Two-strike foul out (slow pitch) | K | `foulOut` option | ✓ |
| Dropped third strike, batter reaches (K + WP / PB / E) | K for the pitcher, batter on 1st | `K` never opens the runner sheet (`index.tsx:218`) | ✗ (known, still open) |
| Single / double / triple / home run (incl. ground-rule double, inside-the-park HR) | H, TB, RBI | `Single · Double · Triple · Home run` (`index.tsx:71`, `:322`, `:600`); runner sheet when needed; RBI ± (`index.tsx:377-379`) | ✓ (no bunt-hit flag) |
| Groundout / fly out / pop out / lineout / foul out | out, batted-ball type | `Groundout · Fly / pop out · Lineout` (`index.tsx:72`); popup vs fly only via the fielder notation (`engine.ts:150-180`) | ✓ / partial (pop-up needs fielders) |
| Infield fly | out | Fielder notation "IF" only | partial |
| Double play / GIDP | 2 outs | `Double play` (`index.tsx:324`) | ✓ |
| Triple play | 3 outs | No button; DP + `Runner out` | partial |
| Sacrifice fly / sacrifice bunt | SF / SH, no AB | `Sac fly · Sac bunt` | ✓ |
| Fielder's choice | FC, AB | `Fielder's choice` (`index.tsx:73`) | ✓ |
| Reached on error | E, AB, no H | `Error` → fielder chip `E6` (`index.tsx:340`) | ✓ (team E; the fielder only if tapped) |
| Catcher's interference / obstruction | batter to 1st, E2, no AB | Nothing | ✗ |
| Stolen base / caught stealing / pick-off | SB / CS / PO | Runners → `Stolen base · Caught stealing · Picked off` (`index.tsx:388-396`) | ✓ capture; **pick-offs not credited to the pitcher** |
| Wild pitch / passed ball / balk | WP (pitcher), PB (catcher), BK (pitcher) | Runners → `Wild pitch · Passed ball · Balk` | partial: runners move ✓, commentary ✓; **no WP / PB / BK figure for the pitcher or catcher** (`eventCredits`, `engine.ts:709-717`) |
| Defensive indifference, advance on a throw, appeal out | | `Runner advance`, `Runner out` | ✓ |
| Earned / unearned runs | ER, ERA | Auto, with an ER / UER switch on the timeline (`index.tsx:641`) | ✓ |
| Substitutions: PH, PR, pitching change, defensive change | | Subs (`index.tsx:409-415`) | ✓ |
| Softball DP / FLEX; starter re-entry once (WBSC softball) | | Nothing; DH toggle only | ✗ (known, still open) |

### 3.2 The chain

| Link | Break |
|---|---|
| Info shows the settings | `formatLine` (`LiveScoringScreen.tsx:2937`) shows "9 innings" only. Not shown: preset (baseball / softball / slow pitch), run rule, extra-inning tie-break, DH, pitch-by-pitch, fielders asked, stats tracked. |
| Info setting → Scoring | **Pitch types does nothing with pitch-by-pitch off** (the chip row lives in the pitch pad, `index.tsx:583`); the hint says so, but nothing stops it. The baseball "Stats to track" keys (`pitchTypes`, `sprayZones`, `battedBallTypes`) and `pitches` / `askFielders` don't start with `track`, so the Edit-format form (`LiveScoringScreen.tsx:2755-2758`) shows them as well as the Scoring settings card: two places for the same switch. |
| Scoring → Stats | WP, PB, BK, pick-offs and IBB are captured in the log but reach no stat line. Strikeouts looking are captured in pitch mode but never counted. |
| Stats row with no capture | `putouts`, `fieldAssists`, `fieldErrors` (`stats.ts`) need "Ask for fielders", which is **off** by default (`meta.ts:67`): empty for almost every game. |
| Commentary | ✓ for every outcome and runner play; wrong "swinging" in quick mode (above). |
| Default that hides depth | Pitch-by-pitch is on (good). **Ask for fielders is off**, so fielding stats, pop-up vs fly and infield-fly detail never get asked. Recommend the tennis pattern: after an out or an error, one optional fielder chip row (P C 1B … RF, then Skip), on for new matches; a second tap for the assist only when the scorer wants it. |

---

## 4. Ranked fix list

| # | Pri | Size | Sport | What changes | Event-log impact (old logs replay identically?) | Practicality |
|---|---|---|---|---|---|---|
| 1 | P0 | S | Basketball | **An offensive foul is also a turnover** for the fouler (FIBA / NBA). | Stamp `tov: true` on new offensive fouls and count only those, so old matches keep their totals; or accept it as a stats correction (score unchanged either way). | No new tap. |
| 2 | P0 | S | Shared | **Info shows the whole format and "Stats tracked: …"** for every viewer, during and after the match (extend `formatLine`, read from `liveSettings.read`). Add AF mode, baseball preset / DH / pitches, basketball preset / periods. | Read-only. | No tap. |
| 3 | P0 | M | Basketball | **Team rebound and team turnover** (a "Team" chip in the rebound / turnover rows; the 24-second violation). Pair **steal → opponent turnover** (the ball-handler optional) and **block → opponent missed shot** (the shooter optional). | New payload keys (`team: true`, `ref` to the paired event); old logs unchanged. | One optional tap each; the pairing saves a tap. |
| 4 | P0 | S | Baseball | **Quick-mode strikeout: `K looking` / `K swinging`** (two buttons), and a `kLooking` key. | New K events carry `pitch: 'called'`; old ones keep 'swinging' (as now). | Same one tap. |
| 5 | P1 | S | Basketball | **Track missed shots on for new matches** (format default and `BB_TRACK_DEFAULTS`); old matches keep theirs. | None: `init` already treats a missing key as off. | One tap per miss. |
| 6 | P1 | S | Baseball | **Credit WP / BK / pick-offs to the pitcher, PB to the catcher, IBB as its own figure**, derived from the log (`statTotals` derived keys, keyed coverage). | Derived: old logs gain the keys, score unchanged. | No tap. |
| 7 | P1 | M | Baseball | **Dropped third strike** (K then "batter reaches on WP / PB / E" opens the runner sheet), **catcher's interference** (More), **triple play** button. | New outcome / flag; old logs unchanged. | Rare, one extra tap when it happens. |
| 8 | P1 | M | Am. football | **Return yards and returner** for kickoffs, punts and interceptions; **fumble recovered by the offence**; optional forced fumble; blocked punt / FG; onside kick. | New payload keys; old logs unchanged. | Returner and yards optional (Skip). |
| 9 | P1 | M | Am. football | **Penalty on a play**: the play's result plus the enforcement in one event; declined / offsetting; the penalised player (optional). | New `penalty` field on a play; old separate penalties unchanged. | Optional after the play. |
| 10 | P1 | S | Am. football | Tackle presets default to **Play by play**; Scores-only hides or greys the "Stats to track" toggles; Game-settings defaults follow the preset (no "2 custom" on a standard flag game). | Config only. | Organiser can still pick Scores only. |
| 11 | P1 | S | Basketball | **Turnover type chip** (bad pass, lost ball, travel, 3 s / 5 s / 8 s / 24 s, backcourt, out of bounds, offensive goaltending), optional, like netball. | New `toType`; old logs unchanged. | Optional chip after the player. |
| 12 | P1 | S | Basketball | **NBA preset**: offensive fouls not team fouls; last-2-minutes bonus. | A format flag; old FIBA matches unchanged, old NBA matches replay under the old rule unless the flag is set. | No tap. |
| 13 | P1 | M | Baseball | **Optional fielder chip after outs / errors**, on for new matches (fills PO / A / E). | New matches only; `askFielders` missing = off. | One optional tap, Skip. |
| 14 | P1 | S | Basketball | "Rebound?" box after a miss and a missed last free throw (the same shape as "Assist?"). | None (same REBOUND action). | Saves a tap. |
| 15 | P1 | M | Softball | DP / FLEX and the once-only starter re-entry. | New sub kinds. | Organiser option. |
| 16 | P2 | M | Basketball | Jump ball / alternating-possession arrow; coach and bench technicals with the coach DQ count; "and the ball" after U / D. | New event types. | One tap at a held ball. |
| 17 | P2 | S | Am. football | Tackles and breakups in the commentary; a Kneel button. | Read-only / existing play type. | No extra tap. |
| 18 | P2 | S | Baseball | Pitch types disabled (with a note) while pitch-by-pitch is off; hide the baseball "Stats to track" keys from Edit format (one place to switch). | Config / UI only. | No tap. |

## 5. Shared fixes
- **Info must state what the match captures**, for everyone and after the final: a "Stats tracked" line from `liveSettings.read`, and a complete `formatLine` per sport (fix 2). This is the one break in all three sports.
- **A toggle must act in the mode it is shown in**: grey it out with the reason when its mode is off (AF in Scores only, baseball pitch types without pitch-by-pitch).
- **`liveSettings.defaults` should follow the preset**, not one ruleset, so "Standard" means standard for this game (AF now; check other multi-preset sports).
- **Linked events** (steal → turnover, block → miss, offensive foul → turnover, interception → return) should be one action with an optional second player, not two hunts across the screen. The same pattern as tennis's Fault: one tap, optional detail after.
- **Every new figure keyed** ("not tracked" for an older match, never 0), as tennis did in `tennis-endings-depth.md` ST1.
- **Defaults on for new matches only**, never applied by `init` to a stored config without the key, so old logs replay identically (the tennis TF6 rule).
