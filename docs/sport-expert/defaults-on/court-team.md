# Stats on by default + a Done finish: court-team family (2026-11-08)

Volleyball, kabaddi, netball, handball. Read-only review against the founder's racket change of 2026-11-08 (`docs/security/breaks/describe-done.md`): every "Stats to track" option on for a NEW match, and a clear **Done / Skip** finish with a greyed "✓ Saved · …" state on any "describe the last play" card.

Rules not re-opened: defaults apply to new matches only; never a false zero; rule details are organiser options; the chain is Info → Scoring → Stats + Commentary.

Cost key: **(a)** tap-optional, never blocks the next play · **(b)** blocking, the play is not logged until the scorer answers or skips · **(c)** typed or needs equipment.

No toggle in this family is (c). The main problem is not tap cost. Most of these stats decide "was this tracked?" from the **switch**, not from what was captured (Risk R1). With the switch on by default, the switch stops meaning "the scorer meant to record this". A scorer who skips every prompt then gets career zeros or inflated percentages. Fix R1 first, then turn things on.

---

## Volleyball

Fields: `src/sports/volleyball/settings.ts:19-26`, which are copied into the format at `meta.ts:52`. Live defaults are at `settings.ts:39`. A match only gets the state when the format carries the key (`detail.ts:173-178`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Attack attempts (efficiency) | `vbAttack` | OFF (`settings.ts:20`) | a: "⚡ Attack in play" chips every rally plus "Who was blocked?" after a Block (`DetailRow.tsx:106,112`) | **OFF** | Kills count as attempts automatically, so an untapped "in play" makes attack efficiency look better than it was (Risk R2). That is a wrong number, not a missing one. |
| Reception quality | `vbReception` | OFF (`:21`) | a, but two taps (grade, then receiver) every rally (`DetailRow.tsx:114,121-128`) | **ON after R1** | The figures say "of receptions graded" (`matchStats.ts:192-198`), so a partial sample is honest. The career zeros need R1. |
| Digs | `vbDig` | OFF (`:22`) | a: "🛡️ Dig" chip plus the player, during the rally (`DetailRow.tsx:116`) | **ON after R1** | Skipping is harmless only once an untapped match stops writing "Digs 0" for every player (`totals.ts:117-131`). |
| Set assists ("Set by?") | `vbAssist` | ON (`:23`) | a: a row after a kill, with the last setter first (`DetailRow.tsx:105`) | **ON** (keep) | One tap on a point already scored. It needs R1 for skipped matches. |
| Who was aced? | `vbAced` | ON (`:25`) | a: a row after an ace (`DetailRow.tsx:108`) | **ON** (keep) | Same as above. |

## Kabaddi

Fields: `src/sports/kabaddi/settings.ts:17-22`, copied into the format at `meta.ts:64`. The state is set only when the key is true (`engine.ts:250-253`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Raid skill | `trackSkills` | OFF (`settings.ts:18,22`) | a: a chip row inside the raid form, before "✓ Record raid" (`index.tsx:438-449`). The one-tap quick raids skip it (`index.tsx:358-363`). | **ON** | No zero risk: Skills shows only the raids described, "X of Y" (`matchStats.ts:165-180`), and it is not in career totals. |
| Defenders touched (named) | `trackTouched` | OFF (`:19,22`) | a: a "Who was touched?" chip row in the form (`index.tsx:391-409`). Quick "+1 touch" skips it. | **ON after R1 + K1** | With the switch alone, every defender gets `touchedOut` 0 and `unsuccessfulTackles` 0 (`deepBox.ts:51-52`, `totals.ts:72`). Career tackle success then rises toward 100% (`stats.ts:63-66`), which is the exact case that code comment warns against. |

K1: after a quick "+1 touch", offer a non-blocking "Who was touched?" row, the same shape as "Tackled by?" (`index.tsx:496-517`).

## Netball

There are three places to change. The format fields are at `meta.ts:80-85`. The live card is at `engine.ts:693-703`. The **presets** are at `meta.ts:17-19`: School 4 × 10 and Halves 2 × 20 set `trackCpr: false, detail: false`, and a preset's `set` overrides the field defaults. Init only adds a key when the format carries it (`engine.ts:227-231`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Feeds & rebounds | `detail` | ON in International, OFF in School/Halves (`meta.ts:17-19,80`; `engine.ts:695`) | **b**: a goal is not logged until "who fed?" is picked or skipped. A miss asks two steps, feed then rebound (`index.tsx:221-223,385-408`). | **ON in every preset, after N1** | Goal assists are the core netball stat. Today the step blocks, and Cancel drops the goal (Risk R3), which is too costly for a school scorer. |
| Centre pass receives | `trackCpr` | ON in International, OFF in School/Halves (`meta.ts:17-19,83`; `engine.ts:697`) | a: one chip row; it disappears once tapped or when a flow opens (`index.tsx:640-651`) | **ON in every preset, after R1** | One optional tap. Today the switch alone writes `centrePassReceives` 0 (`deep.ts:116,208`). |
| Gains & pick-ups | `trackGains` | OFF (`meta.ts:84`, `engine.ts:698`) | a: an extra "Pick-up" button (`index.tsx:562`). **b**: a Gain / No gain step after a deflection, with Skip (`index.tsx:233,414-424`). | **ON after R1** (N1 preferred) | Deflections are rare and one extra step has Skip, so this is acceptable. The switch alone writes pickups and gains as 0 (`deep.ts:113,209`). |
| Turnover types | `trackTurnovers` | OFF (`meta.ts:85`, `engine.ts:699`) | **b**: a type step after the player, with Skip (`index.tsx:426-433`) | **ON** (N1 preferred) | Only team figures use it, with "typed of all" coverage (`deep.ts:109`), and it is not in career totals, so there is no false zero. |

N1: log the play first, then describe it in a non-blocking "Last goal" card (feeder, rebound, gain, turnover type) that edits that event in place, the way kabaddi's "Tackled by?" does.

## Handball

Fields: `src/sports/handball/meta.ts:21-25`. Live defaults: `engine.ts:698`. The state is set only when the key is true (`engine.ts:207-208`).

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Technical fault types | `trackFaultTypes` | ON (`meta.ts:22`) | a: chips above the player grid, and the player pick commits (`index.tsx:502-509`) | **ON** (keep) | No extra tap. It needs R1: the switch alone zero-fills every fault kind (`depth.ts:40-41,187`). |
| 7 m won / caused by | `trackSevenMDrawn` | ON (`meta.ts:24`) | a: two chip rows on the 7 m result screen, and Scored/Saved/Missed commits (`index.tsx:460-476`) | **ON** (keep) | Same. The switch alone writes `sevenMDrawn` 0 on every line (`depth.ts:43-44`, `totals.ts:182-188`). The box hides it with `hideZero` (`stats.ts:141`), but career totals keep it. |

---

## Describe cards

- **Volleyball, the "Set by?", "Who was blocked?" and "Who was aced?" rows** (`DetailRow.tsx:72-97`, rendered at `:105-108`). This is the same problem the racket card had. The only finish is a small "Skip" text link at the top right (`:87`), and it disappears once someone is named. A pick shows a muted toast line (`:53,142`), but there is no greyed saved state and no Done. Skips are kept in component state by `set:at` (`:43,75`) and are lost on remount. **Apply the Done pattern:** merge the three rows into one "Last point" card and use `panelMode` keyed by the point's event id. Use a full-width Done/Skip button and "✓ Saved · Set by Priya · Edit".
- **Volleyball rally chips** (Attack in play, Reception, Dig; `DetailRow.tsx:109-141`). These are entries during the rally, not a description of the last play. Picking a player commits and closes the picker. No Done is needed. Minor: an open picker closes only when its chip is tapped again.
- **Kabaddi "Tackled by?" after a quick "Raider out"** (`index.tsx:496-517`). It has a Skip chip, and a pick commits and hides the row with no confirmation. **Apply a light version:** a full-width Skip, and after a pick a greyed "✓ Saved · Tackled by X · Edit" keyed by the raid's event id (`askTackler` already holds it, `:363`). The same card is the home for K1.
- **Kabaddi raid form** (skill, touched, tackler, tackle type; `index.tsx:336-492`). Its finish is clear: "✓ Record raid" (`:492`). No change.
- **Netball feed, rebound, deflection-outcome and turnover-type steps** (`index.tsx:383-433`). These are modal steps, finished by a pick or Skip, with Cancel in the header (`:356`). They are not describe cards, because they block (Risk R3). **Convert them to N1** with the Done pattern: log the play first, then show a "Last goal / Last play" card.
- **Netball centre-pass-receive row** (`index.tsx:640-651`). A single tap, after which the row disappears. Optional: a "✓ CPR · Name" line until the next centre pass.
- **Handball fault-kind chips, 7 m won/caused chips and "Who's in goal?"** (`index.tsx:217-224,460-476,502-509`). These are chips on a step that a required button commits, so the finish is clear. No change.

## Risks

- **R1: false zeros, because "tracked" comes from the switch (all four sports).** Volleyball uses `catTracked` (`detail.ts:130-131`), which leads to keyed zeros in `totals.ts:117-131`. Kabaddi uses `kabaddiTouchedTracked` (`totals.ts:72`). Netball uses `cprOn` and `gains` (`deep.ts:113,116`). Handball uses `faultTypesTracked` and `sevenMDrawnTracked` (`depth.ts:40-44`). Each checks the switch **or** a logged entry. With default ON, change these to "at least one entry captured", so a match where the scorer skipped everything reads "not tracked". This already affects live defaults: `vbAssist`, `vbAced`, `trackCpr` (International), and both handball switches. Old matches are not affected, because none of them stored a switch with zero entries under the new rule.
- **R2: volleyball attack efficiency.** Attempts are kills + errors + blocked + in-play (`detail.ts:10-21`), and kills count automatically. Untapped in-play swings therefore make efficiency look better (`matchStats.ts:157-166`). R1 does not fix this. Keep `vbAttack` OFF.
- **R3: netball Cancel drops the play.** With `detail`, Gains or Turnover types on, the goal, miss, deflection or turnover is only sent on the final pick (`index.tsx:204-213,221-237`). Cancel (`:356`) closes the flow and loses it, a wrong score for a goal. This is already live in International matches. Fix it through N1, or make Cancel log the play without detail.
- **R4: netball presets override the field defaults** (`meta.ts:17-19`). Changing `default:` alone leaves School and Halves (the common school formats) OFF. Picking a preset also switches them off. The preset `set` values have to change too.
- **R5: replay is safe.** Each init adds tracking only when the stored format carries the key (`detail.ts:173-178`; kabaddi `engine.ts:250-253`; netball `engine.ts:227-231`; handball `engine.ts:207-208`). Tests that pin today's defaults will need updating: `tests/defaults-court.test.mts:94-96,130-132,150`, `tests/volleyball-deep-wave.test.mts`, `tests/kabaddi-deep-wave.test.mts`, `tests/netball-deep.test.mts`, `tests/sim-defaults-court.test.mts`.
- **R6: wording to update.** Kabaddi says "Both off by default" (`settings.ts:5`, `index.tsx:867`). Volleyball's row header says "Off by default" (`DetailRow.tsx:3`) and lists every category in its "🔎 Detailed stats: …" line (`:58`), which gets long with four on. The netball hints say "on with International 4 × 15" (`meta.ts:80,83`). Commentary is safe: kabaddi names the touched defenders only when they were named (`commentary.ts:157-160`).
- **R7: quick paths skip the detail.** The kabaddi quick raids (`index.tsx:358-363`) never ask for skill or touched defenders. Skill is honest about it ("X of Y described"). Touched is not (see K1 and R1).
