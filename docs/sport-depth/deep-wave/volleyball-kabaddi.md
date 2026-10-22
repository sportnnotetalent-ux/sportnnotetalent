# Deep wave: volleyball and kabaddi

Founder ask (2026-10-22): capture ATP "Match Stats"-level depth, let users choose which stats they track, and give a point-by-point commentary, match summary and stats, for every sport. This file covers the net and raid family: volleyball (indoor, beach, 9-a-side) and kabaddi.

Standard sources:
- **Volleyball:** FIVB VIS match statistics as published for VNL and the World Championships: per skill, attack (points, errors, blocked, attempts, efficiency), block points, serve (points, errors, attempts), reception (excellent, positive, errors, efficiency), dig and set, plus opponent errors. The VNL live-centre rally-by-rally feed. FIVB individual awards: Best Scorer, Attacker, Blocker, Server, Setter, Receiver, Digger and Libero. Rules from FIVB Official Volleyball Rules 2025–28, sections 7 and 15–21.
- **Kabaddi:** the Pro Kabaddi League match centre: points split; raids (successful, unsuccessful, empty, super, do-or-die); tackles (attempts, successful, super); all-outs; raid and tackle skills; the raid-by-raid commentary; season stat leaders. Rules from AKFI and IKF (per D6).

Rules followed:
- Defaults stay one tap per event.
- New depth is optional (⚙️ Stats to track, off by default) unless it can be worked out from the existing log.
- Old logs replay identically.
- A stat that wasn't tracked is hidden, never shown as 0.
- Stat lines are absolute statTotals, keyed by player id.

## 1. Gap audit (state before this wave)

Most first-audit and audit-2 items are DONE: SD-04/32/58/71/81/117b/136 for volleyball, and SD-03/33/41/59/72/82/83/117b/136 for kabaddi. The gaps that were still open against the broadcast standard:

| Sport | Standard item | Before | Now |
|---|---|---|---|
| VB | Rally-by-rally commentary with score after each rally, grouped by set | Flat "Point log" (icon + "Attack · 5-3 · Asha") | ✅ Sentences, score, set headers with result and duration, tags, server, rally detail |
| VB | Points by skill vs opponent errors (VIS) | 6 comparison rows | ✅ Scoring category: attack, block and serve points; opponent errors split by serve, attack, block, faults and not described; % from own skill |
| VB | Attack errors, attacks blocked (team) | ❌ | ✅ Free: typed "Attack out" and the opponent's block points |
| VB | Serve attempts, ace %, serve error % (VIS) | Only inside the generic serve panel | ✅ Serve category, plus `serveAttempts` per player, worked out free when the toss and rotation are known |
| VB | Rotation analysis (points won per rotation, side-out / break %) | ❌ | ✅ Each player at position I: W-L, break %, side-out % |
| VB | Reception errors and reception efficiency (FIVB Best Receiver) | Grades only | ✅ "Who was aced?" → `receptionErrors`, `receptionEff` |
| VB | Digs (FIVB Best Digger) | ❌ (P2 in audit-2) | ✅ Optional `digs`, `digsPerSet` |
| VB | Sets / assists (FIVB Best Setter) | ❌ | ✅ Optional `setAssists` ("Set by?" after a kill), `setAssistsPerSet` |
| VB | Elapsed time, set durations | No stamps | ✅ Scorer clock on every new event (`at`) |
| VB | Choose which stats to track | One inline On/Off (attack + reception) | ✅ ⚙️ Stats to track: 4 categories, event mode, plus format defaults |
| KB | Raid-by-raid commentary ("Raid 23 — Pardeep Narwal, 2 touch points + bonus, 18-14") | Flat timeline, separate raid / tackle / all-out lines | ✅ One sentence per raid, numbered, score after it, minute, players on the mat, tags |
| KB | Touch vs bonus split, not-out %, do-or-die points (team) | ❌ (career only) | ✅ Match centre |
| KB | Super-tackle opportunities and conversions | ❌ | ✅ Free from the replay (raid faced with 3 or fewer defenders) |
| KB | Raid skills (PKL) | ❌ | ✅ Optional chip; raid points by skill |
| KB | Tackle skills breakdown | Captured since SD-117b, never shown | ✅ Skills category |
| KB | Per-player raids / successful / empty / out / touch / bonus / super raids / tackles in the box | RAID / TKL / PTS only (audit-2 P2) | ✅ Deep box, by half |
| KB | Named touched defenders (KB-10, parked) | ❌ | ✅ Optional: who is out by name, revival queue, `touchedOut` |
| KB | Leaders: super raids / tackles, successful raids / tackles, raid strike rate (min raids), do-or-die points | ❌ (audit-2 P2) | ✅ |
| KB | Category / period filters, top performers | One comparison list with a half toggle | ✅ Match centre card |

## 2. What was built

### Volleyball (`src/sports/volleyball/`)

- **`detail.ts`, Stats-to-track categories.**
  - The switch (`detail`) now records which categories are on: `cats` is any of `attack`, `reception`, `dig` and `assist`.
  - A toggle without `cats` is SD-81's mode (attack + reception), so old logs keep their exact shape.
  - SET_DETAIL takes the old `{detail}` (the inline chip) or category patches (`vbAttack`, `vbReception`, `vbDig`, `vbAssist`). The inline "On" brings back the categories last chosen.
  - New optional VB_DETAIL kinds:
    - `assist`: anchored to the last Attack point.
    - `aced`: anchored to the last Ace point; it counts as a reception error and as a reception.
    - `dig`: logged on the rally in play.
  - `catCoveredAt` checks coverage per rally.
  - The tally adds `digs`, `setAssists` and `receptionErrors`, and `receptionEfficiency` is computed.
- **`settings.ts`: the ⚙️ Stats to track `liveSettings`.**
  - Event mode with SET_DETAIL: before the first point it patches the match format; after it, the change applies from the next rally.
  - The same toggles are advanced `formatFields`, so an organiser can turn them on for a whole tournament.
- **`DetailRow.tsx`.** The prompts depend on which categories are on: "Set by?" after a kill (the last setter is listed first), "Who was blocked?", "Who was aced?", "Attack in play", "Reception" (grade, then the receiver) and "Dig". Every prompt is skippable.
- **`engine.ts`.**
  - The reducer is wrapped with `withStamps` (conduct.ts), so new events carry `payload.at`.
  - `stampAction` adds the scorer's clock to ATTACK, BLOCK, ACE, OPP_ERROR, SERVE_ERROR, POINT, TIMEOUT and CONDUCT.
  - Old logs have no `at` and replay identically. EDIT_LOG keeps each point's stamp, because `pointRows` already carries `at`.
- **`rotation.ts`.** Each rally in the tracker now carries `atI`: the player at position I for each side whose rotation is known. This is derived only.
- **`totals.ts`.**
  - `digs`, `setAssists` and `receptionErrors` are keyed: they are written only for a match that captured the category, and an unresolved name drops the key.
  - `serveAttempts` is written only when every served rally of the match names its server.
- **`stats.ts`.**
  - New keys: `receptionErrors`, `receptionEff`, `digs`, `digsPerSet`, `setAssists`, `setAssistsPerSet`, `serveAttempts`, `aceRate`.
  - `receptionEff` only counts lines that named the aced receiver (filter `acedNamed`), so older graded lines aren't inflated.
  - Sections: Defence and Setting; Serve and Reception rows added.
  - Leaders: `digsPerSet`, `setAssistsPerSet`, `receptionEff`.
  - Awards: Best receiver, Best digger and Best setter, as tournament slots only.
- **`commentary.ts`: `volleyballCommentary`.**
  - Grouped by set, newest first. Each set header shows the result and the set duration.
  - Each rally: the sentence (`rallySentence`), the score after it, the elapsed minute, the server, and the rally detail (receptions, digs, attacks kept in play).
  - Tags: SET / MATCH POINT, set point saved, "N in a row".
  - Timeouts, sanctions and substitutions appear where they happened. A key-moment flag drives the "Key moments" filter.
- **`matchStats.ts` + `StatsPanel.tsx`.** The FIVB VIS card:
  - Match / Set N filter.
  - Categories: Scoring, Attack & block, Serve, Reception, Defence & setting, Game flow.
  - Rotation analysis and a by-server line.
- **`deepBox.ts`.** The VIS player box, drawn through MatchBoxScore's `schema` view. Each column appears only when the match captured it: SRV, SE, REC, REC+%, RE, DIG, SET, plus the existing ones.
- **`index.tsx`.**
  - The Score tab is now: Sets, then Match stats, then the Player box, then the Commentary.
  - The generic `MatchStatsPanel` and the separate substitution list are no longer rendered for volleyball; both are folded into the new panel and the commentary.
  - Dispatch is stamped, and `liveSettings` is set.

### Kabaddi (`src/sports/kabaddi/`)

- **`rules.ts`.** Each raid's breakdown also gives `defBefore` (defenders faced), `stChance` (3 or fewer defenders with super tackles on) and `matAfter` (players on the mat). These are derived only, and the score code is untouched.
- **`engine.ts`.**
  - New optional raid keys: `sk` (RAID_SKILLS: hand, running hand, toe, kick, dubki, escape) and `touched` (named defenders, capped at the touches).
  - New `track` state, with format keys `trackSkills` / `trackTouched` and a new SET_TRACK action.
  - `outPlayers` now names touched defenders, so live "who is out" chips dim the right players.
  - `raidActions` and `RaidForm` carry `skill` and `touched`.
- **`settings.ts`.** ⚙️ Stats to track `liveSettings`, event mode with SET_TRACK. The same toggles are advanced `formatFields`.
- **`index.tsx`, the raid form.** A "Raid skill" chip row and a "Who was touched?" multi-select (up to the touches) appear only when the matching option is tracked. Edit pre-fills both.
- **`totals.ts`.** `touchedOut` is keyed: written only when touched defenders are tracked, counting only the touches that scored. An unresolved name drops the key.
- **`stats.ts`.**
  - Box abbreviations for the count keys, and the new `touchedOut` ("Times raided out").
  - Raid strike rate now has a minimum of 10 raids (`KABADDI_MIN_RAIDS`).
  - Career rows: successful and empty raids, touch and bonus points, do-or-die points, times raided out.
  - Leaders added: successful raids, super raids, successful tackles, super tackles, do-or-die points, raid strike rate.
- **`commentary.ts`: `kabaddiCommentary` / `raidSentence`.**
  - Grouped by half, extra time, Golden Raid and shootout, newest first.
  - Each raid is numbered and gets one sentence: touch points + bonus with the skill, empty, bonus void, touches void (caught), defenders stepped out, tackled by (with tackle skill), SUPER TACKLE, do-or-die failed, line-out, ALL OUT.
  - Each raid shows the running score and the minute, plus a detail line: touched names, "Super tackle on", players on the mat.
  - Tags: DO-OR-DIE, SUPER RAID, SUPER TACKLE, ALL OUT, GOLDEN RAID, SUPER 10 / HIGH 5 (the moment a player reaches it).
  - Technical points, cards, timeouts, subs, old one-tap points and shootout raids are covered too.
- **`matchStats.ts` + `StatsPanel.tsx`.** The PKL match centre:
  - Categories: Points (touch / bonus / technical / line-out split), Raiding (strike rate, not-out %, do-or-die won and points), Defending (attempts, strike rate, super tackles, super-tackle chances taken, line-outs), All-outs, Discipline, Skills (with a coverage note), Game flow.
  - Half filter, plus the top raider and defender per team (Super 10 / High 5 noted).
- **`deepBox.ts`.** Per-player counts by half (`kabaddiPlayerCounts`), and the PKL box: R, SUC, EMP, OUT, TCH, BNS, SPR, DDP, TKS, SPT, ROUT. An old one-tap match keeps RAID / TKL / PTS.

### Shared by the family (new, `src/sports/netraid/`)

- `feed.ts`: pure FeedGroup / FeedEntry and CmpCat / CmpRow shapes, with row helpers (count, ratio, %, the better side, bar shares).
- `FeedView.tsx`: the grouped commentary feed (newest group open, older ones fold), with the ⭐ Key moments filter.
- `CompareCard.tsx`: the broadcast comparison card, with period chips, category chips, "lower is better" highlighting and sub-rows.

Other sport engineers can reuse these. They live in a family folder to avoid add/add conflicts.

## 3. Decisions taken (recommended option chosen)

1. **Set assists.** Chosen: count the setter named on a kill (NCAA-style "assist", labelled "Set assists"), and rank FIVB Best Setter by set assists per set. Alternative: FIVB's "excellent sets" (sets judged excellent whether or not they become a kill), which needs a grade on every set, too much for one scorer.
2. **Reception error.** Chosen: "who was aced" only, which counts as a reception and an error. Alternative: also grade overpasses or reception errors that don't end the rally. That is folded into "− Poor" today.
3. **Reception efficiency.** Chosen: VIS (perfect − errors) ÷ receptions, only over matches that named aced receivers (min 10 receptions). Alternative: positive % (already shown).
4. **Rotation analysis.** Chosen: by the player at position I (the server of that rotation). This holds up across sets and substitutions without knowing who the setter is. Alternative: P1–P6 by setter position, which needs the setter marked.
5. **Serve attempts.** Chosen: written only when every served rally of the match names its server; otherwise "not tracked". Alternative: a partial count with a coverage note on the career. Rejected because the absolute sync can't express partial coverage.
6. **Volleyball serve panel.** Chosen: volleyball now draws its own Serve / Reception categories from `rotation.ts` instead of the racket-owned `MatchStatsPanel` / `serveStats.ts`, which stays untouched. Its volleyball adapter is now unused by the UI; the racket engineer may drop it.
7. **Kabaddi super-tackle chance.** Chosen: the raid *faced* 3 or fewer defenders (before the touches). Alternative: the engine's own super-tackle test, which runs after the touches. Both are shown: the chance figure, and super tackles as scored.
8. **Kabaddi tackle attempts.** Kept SD-41's proxy: successful tackles + raids that touched and got back. A true per-defender attempt count is out of scope.
9. **Raid skill on empty raids.** Chosen: only "Escape" is kept on a raid that scored nothing. The other skills describe points.
10. **Tackle-type chip.** Left always visible, as since SD-117b, so nothing scorers know disappears. The new Raid skill row is gated by the toggle.
11. **Commentary replaces the flat timeline** on the Score tab for both sports. The substitution list (volleyball) and the box score's comparison rows (kabaddi) are folded into the new panels.

## 4. Open questions for the founder

1. Volleyball **Best Setter / Libero**. Is "set assists per set" acceptable as the Best Setter basis? Should a Best Libero slot be added (FIVB: digs + receptions per set)?
2. Should the three new FIVB award slots (Best receiver / digger / setter) appear only when some match in the tournament tracked that category? Today they behave like the existing Best attacker slot.
3. Kabaddi **raid skills list**. Is hand / running hand / toe / kick / dubki / escape the right school-level set? PKL also uses "scorpion kick", "frog jump" and "bonus".
4. Kabaddi **raid strike rate minimum**: 10 raids, the same scale as volleyball's 10 attempts. Is that right for 2×10-minute school matches?
5. Should **Defenders touched** later also produce a per-defender "unsuccessful tackle" figure? That needs to know who attempted the tackle, not just who was touched.
6. Volleyball **commentary language**. Points are worded "Point {team} — kill by …" (the VNL style). Should Hindi or regional-language commentary come later?

## 5. Follow-ups not built

- A second blocker / block assists (NCAA). Out of FIVB VIS; P2.
- Volleyball and kabaddi **voice** for the new optional entries (dig, set by, aced, raid skill, touched).
- Team-page and season aggregates of the new team figures (side-out %, super-tackle chances) — KB-09 / VB-09 territory.
- A Hindi or regional-language commentary.
- Showing the commentary on the **Summary** tab and in share images (needs a shared-screen change).
- Beach-specific VIS rows (beach has no libero or subs; the same categories already apply).

## 6. Out of scope (tracking tech or extra spotters)

- Attack zones, set distribution by zone, serve speed, and heat maps.
- Every set graded (excellent / running / still) and every dig attempt (not only successful digs).
- Kabaddi raid duration and the 30-second clock per raid, tackle attempts by every defender who tried, and raid zone maps.

## 7. Tests

- `tests/volleyball-deep-wave.test.mts` (21 tests):
  - categories and format keys, SD-81 shape kept, settings plan
  - new entries, tally, keyed totals, serve attempts
  - SD-19 contract harness
  - clock stamps and EDIT_LOG
  - sentences, the commentary feed
  - match stats, rotation analysis, by server
  - deep box, schema, feed helpers
- `tests/kabaddi-deep-wave.test.mts` (14 tests):
  - track keys and SET_TRACK, settings plan
  - skill and touched on raids, named out players
  - replay extras leave the score unchanged
  - `touchedOut` keyed and its unknown-name safeguard, the contract harness
  - raid sentences, the feed (halves, running score, SUPER 10, ALL OUT), old one-tap logs
  - match centre (skills, leaders, per half, super-tackle chances), deep box, schema
- Shared pins updated: `tests/leaders-awards.test.mts` (volleyball and kabaddi leader lists, volleyball award slots) and `tests/kabaddi-depth.test.mts` (two new career rows).
