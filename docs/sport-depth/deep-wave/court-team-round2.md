# Court-team round 2: the founder's answers (basketball, netball)

The founder answered the open questions in [court-team.md](court-team.md) on 2026-10-22. This round builds those answers. The deep wave's rules still hold: one tap per play, old matches replay identically, no false zeros, career keys only when tracked, organiser options with standard defaults, and player ids. No migration.

| # | Founder's answer | Built |
|---|---|---|
| B-Q1 | "Track missed shots" stays **off** by default | Unchanged |
| B-Q2 | Fast-break points **include the and-one** free throw (NBA) | Yes. Derived, so tagged matches recompute |
| B-Q3 | The zone buttons become the **default** layout for new matches | Yes. Format and settings can switch back to plain +2 / +3 |
| N-Q1 | Super shots: "look at the standard options and keep them here" | League presets plus a custom window, **off** by default |
| N-Q2 | Gains keep including the opponent's turnovers | Unchanged |
| N-Q3 | CPR **on** by default for the 4 × 15 international preset | Yes. Still switchable off |

---

## 1. Basketball: fast-break points include the and-one free throw

**Rule.** A basket tagged ⚡ Fast break counts its own points, plus its **and-one free throw if that free throw goes in**. The NBA counts every point of the fast-break possession this way. A missed and-one adds nothing.

**How the and-one is found** (`andOneFreeThrows`, `src/sports/basketball/deep.ts`). It is worked out from the order of the plays, with no new payload key, so an old log pairs up the same way a new one does. A basket's and-one is the first free throw that meets all of these:
- It is by the **same side**, and by the **same shooter** when both plays name one. A team-credited play matches anyone.
- It is in the **same possession**. Only the foul that gave it, the assist, a time-out or a sub may come between the basket and the free throw. Any other play ends the possession. This "same possession" rule (`sameBasketPossession`) is now shared with the second-chance and points-off-turnovers windows, which still give the same results (tested).
- It is in the **same period**.
- It is **one shot**. A free throw that starts a trip of two or more belongs to a different foul.

**Figures.** `fastBreakPlays` gives the points per play: the tagged basket's points, plus 1 for its made and-one. It feeds the following:
- the team panel's "Fast-break points" row (`bbTeamFigures`)
- the box rows
- `statTotals` (`fastBreakPoints`)

The free-throw point goes to **the free throw's own shooter**, the same way the box score credits PTS. A free throw logged with no player goes to the team row and is never moved onto someone else's line.

**Recompute.** Everything is derived. A match whose fast breaks were tagged before this change shows the new figure the next time it is shown. Its career `fastBreakPoints` updates at the next completion or correction, because `statTotals` sets absolute values. Tagging a basket after its free throw was logged also counts the free throw. The commentary text is unchanged.

**Not counted.** A full-court legacy "+1" logged as a SCORE (from before SD-05) is not treated as a free throw. Those logs come from before fast-break tags existed.

## 2. Basketball: zone buttons are the default layout

- `BB_TRACK_DEFAULTS` (`engine.ts`) is the single source for "Stats to track":
  - `trackZones: true`
  - `trackMisses: false`
  - `trackFastBreak: false`
  - `trackFoulsDrawn: false`
  - Both the format fields and the live settings use it. In the live settings, "Standard" now means zones on.
- **New matches.** The format seeds `trackZones: true` for every preset, which then scores with **+2 Paint · +2 Mid · +3 Corner · +3 Top**. In 3×3, 2v2 and 1v1 the values are +1 / +2. No preset sets the key, so the organiser's choice survives a preset switch.
- **Switching back.** "Shot-zone scoring buttons" is no longer behind Customize in the match and tournament format: one tap gives plain +2 / +3. The scorer can also switch it in ⚙️ Scoring settings → Stats to track → Shot zones. That change applies from the next play, because each shot stamps its own `zone`.
- **Existing matches keep what they used.** `init` never applies the default. A stored format without `trackZones` (every match made before) gets no flag on its state, so `scoringLayout(s)` returns `'plain'`.
- **Existing tournaments.** New fixtures copy the tournament's stored format as is (`matchFormatFor`), so they keep plain buttons until the organiser switches zones on in the tournament format. New tournaments get zones on by default.
- Voice-logged baskets carry no zone. They show up as "Shot zones charted on X of Y field goals", never as a false figure.

## 3. Netball: 2-point super shots as organiser presets (default off)

**The choice** (format key `superShotRule`, under Customize → "2-point super shots"):

| Option | Window | Extra time | From | Source |
|---|---|---|---|---|
| **Off (World Netball)**, the default | none: every goal scores 1 | none | none | World Netball rules (World Cup, Commonwealth Games, most leagues) |
| Super Netball (AUS) | last 5 min of each quarter ("Power 5") | the whole of extra time | the super-shot zone (the outer 1.9 m of the circle) | Suncorp Super Netball, since 2020 |
| Super League (UK) | last 5 min of each quarter | the whole of extra time (and the play-on) | the outer circle | Netball Super League, since 2025 |
| ANZ Premiership (NZ) | last 5 min of each quarter | not stated, so none | 3.5 m or further from the post (the FAST5 line) | ANZ Premiership, since 2025 (also the Synergy Hair Netball League) |
| Custom window | `ssMinutes` (0 = the whole quarter) | `ssExtraTime` toggle | not applicable | e.g. the Netball Super Cup (last 3 min of each half), Singapore's Deloitte NSL 2026 (last 5 min) |

- **Engine** (`netball/engine.ts`):
  - `SUPER_SHOT_PRESETS`, `SUPER_SHOT_RULE_OPTIONS` and `superShotConfig(config)` put `superShot`, `ssMinutes` and, new this round, `ssEt` and `ssRule` on the state.
  - `superShotLive` also opens the window for the whole of extra time and the play-on when `ssEt` is set.
  - The GOAL reducer still accepts 2 points whenever super shots are on, so corrections still work.
- **Compatibility.** A format without `superShotRule` (the deep wave's plain `superShot` toggle) replays to exactly the state it had: regular quarters only. When a rule is chosen, the rule decides, and 'off' turns super shots off. An unknown value falls back to the toggle. The plain toggle is no longer offered.
- **Scorer chip.** It reads "⭐ Super shot", or "⭐ 2-point shot" for ANZ, and its accessibility label names the zone. Stats, ticker and commentary are unchanged ("super shot").
- **Not found.** I found no Indian or Gulf competition that uses 2-point shots. They use the World Netball rules, so "Off" applies. Verify each league's rule every season; the presets are comments in the engine.

## 4. Netball: CPR on by default for International 4 × 15

- `NETBALL_PRESETS.international.set.trackCpr = true`. The School 4 × 10 and Halves 2 × 20 presets set it to `false`, so switching presets never carries it over. International is the default preset, so a new match tracks centre pass receives. The scorer can turn it off in ⚙️ Match settings, and the organiser in the format.
- The live settings' "Standard" is the international set-up (`trackCpr: true`), in the same way that "Standard" is already 15-minute quarters. An existing match without the key still shows CPR off. It does not start tracking by itself.

---

## Known edge (not changed: it's in LiveScoringScreen.tsx, owned by the tabs restructure)

**"Edit match info" on a live match** seeds its format editor with `defaultsFor(fields)` and then overlays the stored format, and **Save** writes the whole map back. If a host re-saves an **older** match, every key that match lacked gets the current default. For these features that means:
- basketball shot zones on
- netball CPR on, from the default International preset's `set`, even for an old School match
- netball `superShotRule: 'off'`, which is harmless

No past play changes, because each play stamps its own detail. The controls then follow what the editor showed. The fix is for the owner of that screen: save only the keys the host changed. The same is true of every default that has changed before.

## Files
- `src/sports/basketball/deep.ts`: `andOneFreeThrows`, `fastBreakPlays`, the shared `sameBasketPossession`. Fast-break points come from `fastBreakPlays` in `bbTeamFigures` and `deepCredits`.
- `src/sports/basketball/panel.ts`: computes `fastBreakPlays` once per panel.
- `src/sports/basketball/engine.ts`: `BB_TRACK_DEFAULTS`, `scoringLayout`.
- `src/sports/basketball/index.tsx`: format and live-settings defaults from `BB_TRACK_DEFAULTS`. Shot zones are shown without Customize, and the hints mention the and-one.
- `src/sports/basketball/stats.ts`: comment only.
- `src/sports/netball/engine.ts`: super-shot presets, `superShotConfig`, `superShotText`, `ssEt` / `ssRule`, the CPR preset default, and the live-settings standard.
- `src/sports/netball/index.tsx`: the `superShotRule` choice plus the custom window fields, and the chip label.
- Tests:
  - `tests/court-team-round2.test.mts` (new, 21 tests)
  - pinned guard lines updated in `tests/basketball-deep.test.mts` (the defaults come from `BB_TRACK_DEFAULTS`)
  - pinned guard lines updated in `tests/netball-deep.test.mts` (CPR's standard is on; the `superShotRule` choice)

## Sources
- Super Netball Super Shot (2020) and extra time (2021): [netball.com.au](https://netball.com.au/news/super-netball-announces-two-goal-super-shot), [supernetball.com.au](https://supernetball.com.au/news/extra-time-2021-season)
- Netball Super League Super Shot (Dec 2024): [netballsl.com](https://netballsl.com/2024/12/06/the-netball-super-league-introduces-the-two-goal-super-shot), [Leeds Rhinos](https://netball.therhinos.co.uk/article/702/netball-super-league-introduces-the-two-goal-super-shot)
- ANZ Premiership two-point shot (2025): [anzpremiership.co.nz](https://anzpremiership.co.nz/premiership/news/latest/anz-premiership-to-introduce-rule-innovations-for-2025.html), [pulse.org.nz](https://www.pulse.org.nz/news/news-article/anz-premiership-introduces-exciting-rule-innovations-for-2025-season)
- Singapore Deloitte Netball Super League 2026: [netball.org.sg](https://www.netball.org.sg/press/new-two-point-super-shot-set-to-shake-up-2026-deloitte-netball-super-league/)
