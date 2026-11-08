# Defaults ON — US sports (basketball, American football, baseball & softball)

Sports Rules Expert, 2026-11-08. Read-only review of `src/sports/{basketball,american_football,baseball}`.

**The founder's rule (racket sports, 2026-11-08):** every "Stats to track" option is ON for a new match. A scorer who doesn't want the detail just records the basic play and moves on. Every "describe this play" card gets a full-width **Done** (it reads **Skip** when nothing is picked), then greys to "✓ Saved · summary". See `src/sports/describePanel.ts` (`panelMode`, `doneLabel`).

**What this doc checks:** whether each US toggle can be ON without slowing a community or school scorer. Unlike the racket chips, most American football follow-ups and one basketball step are **blocking**: the play pad is hidden until the scorer picks someone or taps Skip. Those need the non-blocking describe card before they can safely default ON.

Cost key: **a** = tap-optional, never blocks the next play · **b** = blocking, must answer (or Skip) before scoring on · **c** = typed, or needs equipment or expertise.

Unchanged rules: defaults apply to NEW matches only (each `init` reads the stored config; a missing key stays off). Never a false zero. Chain: Info settings → Scoring → Stats + Commentary.

---

## Basketball

Defaults: `BB_TRACK_DEFAULTS` `src/sports/basketball/meta.ts:18` (single source: format editor + live settings `index.tsx:1199-1205`). `init` reads only keys that are present (`engine.ts:150,161-163`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Track missed shots | `trackMisses` | ON (`meta.ts:64`, live `index.tsx:1199`) | a: Miss buttons beside the makes; the "Rebound?" card after a miss is optional (`index.tsx:202-205, 811-835`) | **ON** (keep) | FG% / EFF need it. A miss is one tap, the same as a make. |
| Shot-zone scoring buttons | `trackZones` | ON (`meta.ts:68`, `index.tsx:1200`) | a: a layout, not an extra tap. Paint/Mid/Corner/Top replace +2/+3 (`index.tsx:207-212`) | **ON** (keep) | It costs the same one tap per basket. |
| Fast-break points | `trackFastBreak` | OFF (`meta.ts:69`, `index.tsx:1201`) | a: a ⚡ chip in the "Assist?" card after a make (`index.tsx:777, 795-799`) | **ON** | One optional chip on a card that already opens. Ignoring it costs nothing. **Fix the false zero first (Risk R1).** |
| Fouls drawn | `trackFoulsDrawn` | OFF (`meta.ts:70`, `index.tsx:1202`) | b (light): after the foul type, "who was fouled?" must be picked or skipped before the foul is logged (`index.tsx:434-445, 452`) | **ON** | On a shooting foul it pre-picks the free-throw shooter (`index.tsx:315`), so the net cost is about zero. A non-shooting foul costs +1 tap (Skip). P2: log the foul on the type tap and move "who was fouled?" into an optional card. **Fix the false zero first (R1).** |

## American football

These act only in **play-by-play** mode (`hideWhen mode`). The default preset `flag` is Scores only (`meta.ts:14,32`), so the toggles reach tackle presets only (NFL / NCAA / NFHS → `mode: 'pbp'`, `meta.ts:16-18`). The defaults live in **three** places that must agree: format `meta.ts:24-25,55`, live `defaults` `engine.ts:1165`, live `defaultsFor` `engine.ts:1174`. `init` adds them only when the config says so (`engine.ts:280-282`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Targets | `trackTargets` | OFF (`meta.ts:24`, live via `TRACK_FIELDS` `engine.ts:1159`) | Completion: free, stamps `tgt` (`index.tsx:212`). Incompletion: **b**. The incomplete isn't logged until "intended for" is picked or skipped (`index.tsx:225-228, 415-420`). A one-tap ✗ becomes two taps. | **ON, once the step is non-blocking** | Receivers' targets are standard box-score detail. Log the incomplete at once; "Intended for?" becomes an optional card. Until then, ON is still acceptable (one Skip). |
| Pass breakups & TFL | `trackDefence` | OFF (`meta.ts:25`) | **b**: a full-pad "Pass broken up by" grid after every incomplete (`index.tsx:217, 396-404`) and "Fumble forced by" after every fumble (`index.tsx:219, 579-587`). With Targets on, an incomplete takes 3 taps. | **ON only after the non-blocking card**; OFF until then | Two blocking grids on the most common failed play would slow a school scorer. As an optional card it is (a). |
| Ask who made the tackle / flag pull | `trackTackles` | OFF (`meta.ts:55`, no `group` there; live `engine.ts:1158` group 'Stats to track') | **b**: a full-pad "Tackle by" grid after **every** run and completion (`index.tsx:221, 384-394`), about 60–80 times a game | **OFF** | It blocks every scrimmage play, and one scorer can't see who tackled in a pile. Partly-filled tackle columns mislead (R2). Revisit as an optional card with coverage shown ("tackles noted on 12 of 70 plays"). |

Also: the format editor shows `trackTackles` without `group: 'Stats to track'` (`meta.ts:55`), but live settings group it there (`engine.ts:1158`). The two halves of the chain don't match. P2: add the group.

## Baseball & softball

Format `meta.ts:20-22,67,70`. Live settings `engine.ts:1183-1189` (`defaults` at :1189 hard-codes the track flags `false`). `init`: `askFielders` reads absent as off (`engine.ts:316`); the track flags are `?: true` only when set (`engine.ts:280-283`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Pitch-by-pitch | `pitches` | ON (`meta.ts:67`, `engine.ts:1183`) | a: the base mode (Detail group, not Stats to track) | ON (keep) | Out of scope. Listed only because pitch types depend on it. |
| Ask for fielders (6-3) | `askFielders` | ON (`meta.ts:70`, `engine.ts:1185`, group **Detail**) | a: a 1–9 chip card after an out. The next play closes it (`index.tsx:220-224, 291-305`). | **ON** (keep) | It's already non-blocking. P2: move it to group 'Stats to track' so it sits beside the others in the chain. |
| Where the ball went (spray) | `sprayZones` | OFF (`meta.ts:21`) | a: "Where? (optional)" chips above the outcome buttons (`index.tsx:323-330`, shown at :364, :414, :653). Reset after each play (`index.tsx:144, 200`). | **ON** | One optional tap, and the fielders notation fills it in too. The spray section shows only zones with a ball in play (`sheet.ts:123-128`), so no false zeros. |
| Batted-ball type | `battedBallTypes` | OFF (`meta.ts:22`) | a: "Batted ball? (optional)" chips. Outs fill the type in themselves (`engine.ts:162-191`, `index.tsx:333-340`). | **ON** | Outs cost nothing. Untyped hits are counted honestly as "Balls in play with no type" (`sheet.ts:130-136`). |
| Pitch types | `pitchTypes` | OFF (`meta.ts:20`) | **c** (expertise): a chip row over Ball/Strike on **every** pitch (`index.tsx:342-349, 639`). Telling a slider from a curveball needs a trained eye or the catcher's signs. | **OFF** | The baseball "speed gun": a school or community scorer behind the backstop can't call pitch types reliably. Wrong labels are worse than none. Organisers with a charting scout switch it on. |

---

## Describe cards (follow-up prompts after a play)

Racket pattern = full-width Done/Skip under the summary + greyed "✓ Saved · summary" + Edit (`describePanel.ts:5-14`).

**Basketball** (all are non-blocking cards under the pads; any next play closes them, `index.tsx:178-181`):
1. **Assist? + ⚡ Fast break + 🔗 And-one**, `index.tsx:774-808`. The finish is a small ghost "Skip"/"Done" in the header (:785). After tagging ⚡ Fast break the button **still reads "Skip"**, which looks like it throws the tag away. **Apply Done pattern here first** (it's the card that gets the new fast-break chip): Done when FB is tagged, then "✓ Saved · Fast break".
2. **Rebound?**, `index.tsx:811-835`: header "Skip" (:818). A pick closes it at once (single choice). Low priority; add the saved line for consistency.
3. **Steal, who lost it?**, `index.tsx:838-850` (:842) and **Block, whose shot?**, `index.tsx:852-866` (:856): header Skip. The block card has a "3-pt try" toggle (:860) with no Done for it. Apply the Done pattern to the block card.
4. **Foul → who was fouled?**, `index.tsx:434-445`: a **blocking** step. Its Skip is a chip among the player chips (:443), with no saved state. Convert to: log the foul on the type tap, then an optional card with Done/Skip.

**American football**: every follow-up is a **blocking flow panel** that replaces the pads (`index.tsx:837-839`). Its finish is a "Skip" item in `PlayerGrid` plus a small "Cancel" link in the head (`index.tsx:295-299`). None has a saved state.
5. **Intended for (incomplete)**, `index.tsx:406-420`.
6. **Pass broken up by**, `index.tsx:396-404`.
7. **Fumble forced by**, `index.tsx:579-587`.
8. **Tackle / flag pull by**, `index.tsx:384-394`.
→ Recommend one shared non-blocking "Describe the last play" card for AF: log the play first, show the card under the pads (like basketball's `assistBox`), carry Done/Skip and "✓ Saved". The next play closes it. This is the prerequisite for defaulting `trackDefence` ON (and later `trackTackles`).
→ Leave the scoring flows (TD passer/scorer, FG, try, penalty) blocking. They are the score itself, not description.

**Baseball**
9. **Fielders? (optional)**, `index.tsx:291-305`. It's non-blocking, but the finish is a small text link "Skip"/"Done" in the header (`c.cancel`, :296), the exact problem fixed in racket. **Apply the Done pattern**: a full-width Done/Skip under "6-3", then "✓ Saved · 6-3 (6-3 groundout)".
10. Spray / batted-ball / pitch-type chips (`index.tsx:323-349`) are **pre-play pickers** that ride on the next play, not cards. They need no Done. The chosen value already shows in the row label.
11. Advance sheet (`index.tsx:376-438`) has a full-width "✓ Confirm" (:437). Fine.

## Risks

- **R1, basketball false zeros (blocker for ON).** With `trackFastBreak` on, **every** make is stamped `fbt` (`index.tsx:197`), so `fastBreakOn` is true once any make is logged (`deep.ts:78`). A scorer who ignores ⚡ shows "Fast-break points 0" in the team panel (`panel.ts:67`) and the player key list (`deep.ts:415`). Same for `trackFoulsDrawn`: `fdt` is stamped even on Skip (`index.tsx:310`), so "Fouls drawn 0" shows for everyone (`deep.ts:79, 414`; `panel.ts:112`). Fix before default ON: show only when at least one play was actually tagged (`fb` / `drawnBy`), or show coverage ("tagged on 3 of 22 baskets").
- **R2, AF deep keys read 0 on every line.** `afTracked` returns true from the toggle alone (`engine.ts:1081-1084`) and `tacklesTracked` likewise (`:1087`). `deepKeys` then adds `passDef` / `tfl` / `targets` columns that read 0 (`:1090-1095`; comment "they read 0 on every line"), and box adds `tackles` (`box.ts:32-35`). With default ON and every prompt skipped, PD/TFL/TKL read 0. Gate on recorded events, as baseball does for untyped balls. `targets` is safe (completions stamp it).
- **R3, baseball is clean.** Spray hides empty zones (`sheet.ts:125`). Batted balls show untyped separately (`sheet.ts:135`). Pitch mix needs at least one typed pitch (`sheet.ts:109`). Putouts/assists are labelled "(noted plays)" (`sheet.ts:120-121`).
- **R4, old-match replay is safe in all three.** Basketball `init` sets a key only when present (`engine.ts:150,161-163`). AF `bool(config?.f, false)` (`engine.ts:280-282`). Baseball `?: true` flags and `askFielders` absent = off (`engine.ts:280-283, 316`). Changing defaults touches only the format editor and live-settings defaults. **Do not** change these `init` fallbacks to true, or every old match would replay with prompts and zero columns.
- **R5, defaults are duplicated.** AF has three copies (`meta.ts:24-25,55`; `engine.ts:1165`; `engine.ts:1174` `defaultsFor`). Baseball has two (`meta.ts:20-22`; `engine.ts:1189`). If they drift, the live "Standard" button resets a new match to OFF. Use one `*_TRACK_DEFAULTS` const per sport, like basketball's.
- **R6, tests pin OFF.** `tests/baseball-deep.test.mts:236-241`, `tests/baseball-round2.test.mts:250-254` and `tests/basketball-deep.test.mts:382` assert the current defaults. Update them test-first (quality mandate).
- **R7, commentary.** Baseball wording uses the type only when captured (`commentary.ts:45-105`), so it's safe. AF and basketball commentary of skipped prompts is unchanged (nothing is stamped except `fbt` / `fdt` / `tgt` flags, which don't produce text). No wording risk found, beyond the panel zeros in R1/R2.
- **R8, AF Scores only.** Default ON has no effect on flag friendlies (the default preset). The real effect is on tackle presets, which are `pbp` by default. That's where the blocking prompts would land.

## Proposed backlog rows (for eng-director)

| id | P | item |
|---|---|---|
| US-DON-1 | P1 | Basketball: gate fast-break / fouls-drawn stats on ≥1 tagged play (R1), then default `trackFastBreak` + `trackFoulsDrawn` ON. |
| US-DON-2 | P1 | Baseball: default `sprayZones` + `battedBallTypes` ON (format + live, one const). Keep `pitchTypes` OFF. |
| US-DON-3 | P1 | Done pattern on basketball "Assist? / ⚡" card and baseball "Fielders?" card. |
| US-DON-4 | P1 | AF: one non-blocking "describe the last play" card (target, PD, FF, tackle) with Done/Skip + saved state. Gate deep keys on events (R2). Then `trackTargets` + `trackDefence` ON. |
| US-DON-5 | P2 | Basketball: "who was fouled?" becomes an optional card after the foul is logged. Done pattern on the block card. |
| US-DON-6 | P2 | AF `trackTackles` stays OFF. Revisit with coverage display once US-DON-4 lands. |
| US-DON-7 | P2 | Chain consistency: AF `trackTackles` format field gets `group: 'Stats to track'`. Baseball `askFielders` moves to 'Stats to track'. Single defaults const per sport (R5). |
