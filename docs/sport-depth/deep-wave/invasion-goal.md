# Deep wave — invasion-goal family (football, field hockey, handball)

Founder ask (2026-10-22): capture broadcast-depth stats the way an ATP "Match Stats" page does, let the scorer **choose what to track**, and give every sport a live **commentary** and a **match-centre** stats page. Default scoring stays one tap per event; all new depth is optional, and a stat that wasn't tracked reads "not tracked", never 0. Old logs replay identically.

Built in one worktree, uncommitted. Shared code for the family lives in `src/sports/invasion/` (new).

## Standards used

- **Football:** IFAB Laws of the Game 2025/26 (Law 12 cautions / sending-off offences, Law 10); Opta event definitions (shots on / off / blocked, hit woodwork, big chance, key pass, chances created = key passes + assists, inside / outside the box); Premier League match centre (Top stats · Attack · Possession · Defence · Discipline); FIFA match centre / post-match stats (attempts, corners, offsides, goal kicks, throw-ins, possession); BBC Sport / ESPN live-text wording.
- **Hockey:** FIH Rules of Hockey; FIH match statistics as published for the Pro League / Olympics (goals by FG / PC / PS, shots, circle entries, PCs and conversion, strokes, possession, cards, video referrals — **verify** the exact published set); FIH tournament regulations (video umpire referrals).
- **Handball:** IHF Rules of the Game (4:1 extra court player / empty goal, 14 seven-metre throws, 16 sanctions, 2:2 decider); IHF / EHF official match statistics (goals / attempts by position 6 m · wing · 9 m · 7 m · fast break · breakthrough · empty goal "EG" (**verify** the EG column name), goalkeeper saves by position, AS, TF, ST, BS, YC, 2', D/RC, BC); EHF live-ticker wording.

## Shared foundation (all three sports)

| Piece | File | What it does |
|---|---|---|
| Commentary model | `src/sports/invasion/feed.ts` | `FeedItem` (stamp, sentence, side, running score after it, key-event flag, tone, player id); `feedSections` groups by the sport's unit (half / quarter / period, shoot-out last), newest unit and newest item first, score at the end of each unit and goals in it; "Key events" filter; `MatchFacts` (scorers / sendings-off / notes) + `groupByScorer`. Pure; rebuilt from the log every render, so undo / edit / removal re-write sentences and every later running score. |
| Commentary view | `src/sports/invasion/Commentary.tsx` | Match summary card, All / Key events chips, sections with headers + score, rows (stamp, icon, sentence with player link, running score), page of 60 + "Show all". |
| Match-centre model | `src/sports/invasion/centre.ts` | `CentreCategory` = ordered `CompareDef` rows; `centreComparison` reuses SD-23 `comparisonRows` (team figure → derived rate → row sum; untracked → "not tracked"), drops "– v –" rows; `visibleCategories` hides empty ones. |
| Match-centre view | `src/sports/invasion/MatchCentre.tsx` | One period selector (Overall / 1st half / Q2 …) drives both the categorised team comparison (category chips) and the player box tables (shared `MatchBoxScore`, show = box). |

## Football

### Gap audit (vs Opta / PL / FIFA match centre)

| Standard item | Before | Now |
|---|---|---|
| Shots on / off / blocked, saves, corners, offsides, fouls, cards, possession (timer), passes, crosses, dribbles, tackles, interceptions, goal type + body part, assists, pens won / scored / saved / missed, own goals, shootout takers | ✅ (SD-08…SD-139) | unchanged |
| Shots inside / outside the box, goals from outside the box | ❌ | ✅ optional (Shot detail) |
| Big chances / big chances missed | ❌ | ✅ optional (Shot detail) |
| Hit woodwork | ❌ | ✅ optional (Shot detail) |
| Key passes, chances created | ❌ | ✅ optional (Key passes) |
| Clearances | ❌ (catch-all "defensive play") | ✅ optional |
| Goal kicks, throw-ins (FIFA team stats) | ❌ | ✅ optional (Goal kicks & throw-ins) |
| Card reason (Law 12) | ❌ (audit F9) | ✅ optional (Card reasons) |
| Goal ruled out / VAR marker | ❌ (audit P2) | ✅ always available, score never moves |
| Shots off target as a row, penalties taken / scored, team save % | derivable, not shown | ✅ free rows |
| Left / right foot on the fast goal panel | voice path only | ✅ with Shot detail |
| Crosses / dribbles / handballs live toggles (FB-17) | missing | ✅ |
| Minute-by-minute commentary | icon timeline | ✅ BBC-style live text |
| Categorised match centre | flat compare | ✅ 7 categories × period |
| xG, distance, heat maps, pass maps, touches, duels | — | out of scope (tracking tech) |

### Built
- `deep` on the state (`DeepTrack`: shotDetail, keyPasses, clearances, setPieces, cardReasons) from format keys `trackShotDetail` … — only present when switched on. Live settings group **"Deeper stats (optional)"** + organiser advanced format toggles.
- Reducer: `STAT` carries `zone` / `bigChance` / `woodwork` / `ref` (key pass → shot id); `GOAL` carries `zone` / `bigChance`; `GOAL_DETAIL` patches the side's latest goal (null clears); `NO_GOAL` (reason offside / foul / handball / other, `review` = VAR); cards carry `reason`. New stat kinds `keyPass`, `clearance`, `goalKick`, `throwIn`.
- Controls: zone + big-chance chips pre-selected on the shot panel (zero extra taps) and on the goal panel (patches the goal), 🥅 Woodwork; key-pass step after a non-goal shot (Skip = 1 tap); Clearance chip; 🔁 Restarts group; card-reason chips (foul flow → "foul" automatically); 🚫 Goal ruled out.
- statTotals: shot-detail keys (`shotsInBox`, `shotsOutBox`, `goalsInBox`, `goalsOutBox`, `bigChances`, `bigChancesMissed`, `woodwork`) **derived only** (never live) for a match that tracked them; key passes / clearances live taps, zero-filled only when tracked. Contract holds (harness).
- Match centre: Top stats · Attack · Passing · Defence · Goalkeeping · Set pieces · Discipline (`footballCentre`), source `football/centre.ts` (SD-23 football source + `football/depth.ts` team figures).
- Commentary: "Goal! India 1, Japan 0. Rahul (India) right-footed shot from inside the box. Assisted by Dev." — saves, blocks and key passes fold into their shot's line; FIFA minutes (45+2'); halves → ET → penalty shoot-out (kick by kick with tally). Replaces the Timeline tab (renamed **Commentary**); `football/Timeline.tsx` removed.
- Career / leaders: Attack (in-box / outside-box shots, big chances, woodwork, goals from outside the box), Passing (key passes, chances created), Defence (clearances); leaders append chances created, key passes, clearances (keyed coverage: only lines that tracked them rank).

### Decisions
- Recommended option chosen: depth toggles live in a new optional `state.deep`, **alternative:** extending `TrackConfig` — rejected because legacy-replay tests deep-compare the state and the shared `boxSources.ts` types a map on `TrackConfig`.
- Recommended option chosen: two shot zones (inside / outside the box) + big-chance flag as pre-selected chips, **alternative:** a tap-the-pitch shot map / 6 zones (feeds xG) — too slow for one phone.
- Recommended option chosen: key pass asked *after* the shot (skippable), **alternative:** pick the passer before the shot.
- Recommended option chosen: "Goal ruled out" always available (an occasional button, no cost to the default path), **alternative:** behind a toggle.
- Recommended option chosen: possession shown in the summary / match centre only once the ball changed hands (kick-off alone gives one side 100%), **alternative:** show whenever the timer toggle is on (today's flat compare on the Summary tab still does — see follow-ups).
- Recommended option chosen: team save % = saves ÷ (saves + opponent's goals), own goals excluded (Opta), **alternative:** include own goals.
- Recommended option chosen: no MVP weights for the new keys (football's weights are golden-pinned), **alternative:** weight key passes / clearances like other defensive plays.

## Field hockey (FIH)

### Gap audit

| Standard item | Before | Now |
|---|---|---|
| Goals FG / PC / PS, PCs won + converted + outcome, strokes, shots, shots on goal, circle entries, cards with timed suspensions, quarter splits, keeper GA / CS / save % | ✅ (SD-101, SD-117) | unchanged |
| Shots wide vs blocked | lumped ("off target / blocked") | ✅ split (same tap count) |
| Shoot-out keeper credit, saved vs missed | missing (audit H8) | ✅ one tap either way + keeper auto → `soSaves` |
| Goal "From PC" linked to the open corner | only via the PC panel | ✅ auto-linked |
| Possession % | ❌ | ✅ optional, on the game clock, per quarter |
| Video referrals (upheld / lost) | ❌ (audit H12) | ✅ optional |
| Team save %, minutes suspended per team | derivable | ✅ free rows |
| Commentary | flat timeline | ✅ by quarter with running score + facts |
| Categorised match centre | flat compare | ✅ 5 categories × quarter |
| 23 m entries, card reasons, repeat-card escalation, Hockey5s / indoor rule branches | ❌ | follow-ups |

### Built
- State `track` (`trackPossession`, `trackReferrals`) and `poss` marks (only when used); `SHOT.miss` wide / blocked; `POSS`; `REFERRAL` (event type `referral`); `SO` outcome + keeper.
- `hockey/depth.ts`: possession on the game clock (stops when the clock stops; when the clock wasn't run, up to the last logged moment), team figures, untracked list, shoot-out keepers. `hockey/feed.ts`: sentences ("Goal! India 1, Japan 0. Asha (India) converts the penalty corner. Assisted by Meera."), saves folded into their shot, shoot-out section; facts (scorers with minute + PC / PS, reds, possession).
- Live view: 📝 Commentary / 📊 Match stats switch; categories Top stats · Attack · Corners & strokes · Goalkeeping · Discipline.
- `soSaves` (derived, keyed) in the Goalkeeping career section.

### Decisions
- Recommended option chosen: split "Off target / blocked" into Wide / Blocked (still one tap), **alternative:** keep one button and add an optional chip.
- Recommended option chosen: split the shoot-out "Missed / saved" into Saved / Missed with the keeper filled in, **alternative:** a separate keeper step.
- Recommended option chosen: possession and referrals off by default, also for the FIH preset, **alternative:** on by default for "FIH 4 × 15".

## Handball (IHF)

### Gap audit

| Standard item | Before | Now |
|---|---|---|
| Goals / attempts by position (6 m, 9 m, wing, breakthrough, fast break, 7 m), assists, saves, 7 m saves, TF, ST, BS, sanctions, time-outs, half splits | ✅ (SD-102) | unchanged |
| Goalkeeper saves by position (IHF keeper line) | 7 m only (audit P2) | ✅ free — derived from every save's shot type |
| Empty goal / 7th court player | ❌ — the court player was charged GA (audit P1) | ✅ per-side toggle; keeper not charged; EG goals counted |
| 7 m won by | ❌ | ✅ optional |
| Technical faults by kind | ❌ | ✅ optional chips |
| Shoot-out keeper credit, saved vs missed | ❌ | ✅ |
| Team save % overall and by position | ❌ | ✅ free rows |
| Commentary | flat timeline | ✅ by half with match clock, running score, top-scorer facts |
| Categorised match centre | flat compare | ✅ 5 categories × half |
| Goal-placement zones (3 × 3), passive-play warning, attack efficiency, 2' drawn | ❌ | follow-ups |

### Built
- Engine: `EMPTY_GOAL` (event `empty`, `on`), `keeperAt` parks / restores the keeper, `goalEmpty`; `DRAWN` (event `drawn` → `sevenMDrawn` via `eventCredits`); `TURNOVER.fault` (7 kinds); `SO` outcome + keeper; `track` (`trackFaultTypes`, `trackSevenMDrawn`).
- statTotals: per keeper `sixMSaves` / `sixMConceded` … for the five field positions (derived, keyed, 0-filled for every keeper with a spell), `emptyGoalGoals` (derived), `soSaves` (derived), `sevenMDrawn` zero-filled only when tracked. Contract holds.
- Career: "Saves by position" section (save % from each position), EG goals, 7 m won; leaders append 7 m won.
- Live view: 📝 Commentary / 📊 Match stats; categories Top stats · Shooting · Goalkeeping · Ball & defence · Discipline.

### Decisions
- Recommended option chosen: empty goal as a per-side link under the keeper (always available), goals while empty tagged EG automatically, **alternative:** an "Empty goal" shot type the scorer picks — rejected, the toggle is needed anyway so the keeper isn't charged.
- Recommended option chosen: keeper-by-position keys derived from the existing log (older matches gain them at their next sync), **alternative:** only for new matches. Note: a save logged without a shot type is read as 9 m (the engine's existing default).
- Recommended option chosen: top three scorers per side as "goals / attempts" in the match summary (handball has too many goals for a minute list), **alternative:** every scorer.
- Recommended option chosen: fault kinds stay off the "not tracked" note (seven labels would be noise); only "7 m won" is listed.

## Open questions for the founder

1. Football **big chance** is Opta's (subjective) definition — keep it, or drop it to stay objective?
2. A simple **location-based xG** from the two zones + big chance + penalty — recommended **no** (looks precise, isn't); OK?
3. Should **Goal ruled out** sit behind a toggle for school matches without VAR?
4. The **Summary** tab's flat comparison still shows possession (100 – 0) when the bar was never used; fix it in the shared `boxSources.ts` (another owner) the way the match centre does?
5. Hockey: switch **possession / referrals on by default** for the FIH 4 × 15 preset in tournaments?
6. Handball: is "**EG** / empty-goal goals" the wording you want on profiles? Should the 7th-court-player time be shown (minutes with an empty goal)?
7. Should the new keys get **MVP weights** (key passes, clearances, keeper saves by position)? Football's weights are golden-pinned, so this is a deliberate change.

## Follow-ups not built

- Football: chances created / big chances columns in the per-player box score; removing a shot doesn't remove its key pass (the key pass then reads on its own line); set-piece taker stats; card reasons per player; MVP weights.
- Hockey: 23 m entries (one-tap counter like circle entries); card reasons; 2nd green → yellow prompt; Hockey5s / indoor rule branches; keeper shots faced by type.
- Handball: goal-placement 3 × 3 grid (optional), passive-play warning marker, "2' drawn", attack efficiency (possessions), beach handball.
- Shared: the Summary tab could use the categorised `MatchCentre` too (today it keeps the flat SD-23 panel).

## Out of scope (tracking tech)

xG models, distance covered, sprints, heat maps, average positions, full pass maps, ball speed, Hawk-Eye-style line calls, GPS load — for all three sports.

## Shared-file edits

- `tests/leaders-awards.test.mts`, `tests/stat-schema.test.mts`: the pinned list of football's appended leader categories now ends with chances created / key passes / clearances (one assertion each).
- No edits to `src/sports/` shared files, `src/components/*`, `src/data/*` or screens: the family's shared code is new (`src/sports/invasion/`), and football's match-centre source wraps `boxSources.footballBox` from `football/centre.ts`.
