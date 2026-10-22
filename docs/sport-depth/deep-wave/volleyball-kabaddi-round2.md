# Deep wave, round 2: volleyball and kabaddi (founder answers)

The founder answered every open question in [volleyball-kabaddi.md](volleyball-kabaddi.md) §4. This round builds those answers.

| # | Question | Founder's answer | Status |
|---|---|---|---|
| 1 | Volleyball Best Setter basis, and a Best Libero slot? | Keep "set assists per set" for Best Setter. Add Best Libero (FIVB: digs + receptions per set, with a minimum). | ✅ Built |
| 2 | Should Best receiver / digger / setter show only when tracked? | Yes, and the new libero slot too: they appear only when some match in the tournament tracked that category. | ✅ Built |
| 3 | Kabaddi raid-skill list | Keep it as it is. | Unchanged |
| 4 | Kabaddi raid strike rate minimum (10 raids) | Keep it as it is. | Unchanged |
| 5 | A per-defender "unsuccessful tackle" figure from "Defenders touched"? | Yes. A defender touched by a raider who got back counts as an unsuccessful tackle attempt. Show it in the panel and careers, only when tracked. | ✅ Built |
| 6 | Hindi / regional commentary | Not part of this round. | Not touched |

Ground rules still hold:
- Scoring stays one tap. Nothing new is captured: every figure comes from entries the deep wave already records.
- Old matches replay identically.
- Untracked figures are hidden, never shown as 0.
- New career keys are written only for matches that tracked them, keyed by player id.
- No migration.

## 1. Volleyball: Best Libero (and Best Setter kept)

- **Best Setter** still ranks by set assists per set. Only the schema comment changed: it now records that this is the founder's choice over FIVB's "excellent sets".
- **Best Libero** is a new tournament slot after Best setter.
  - Slot key: `digsReceptionsPerSet`. Icon: 🎽 (the libero's contrasting shirt).
  - Tournament slot only (`match: false`), like the other optional-category slots.
- **Stat `digsReceptionsPerSet`** ("Digs + perfect receptions per set", abbr D+R/S). It is derived and never written to a line.
  - It sums (digs + perfect receptions) and divides by the sets the player was on court.
  - It counts only lines that tracked **both** digs and reception grades and that say how many sets were played.
  - Minimum: 5 sets on court (`VOLLEYBALL_MIN_SETS`, the same as the other per-set awards). Organisers can change it on the Stats tab minimums (it shows up in `minimumRows` automatically).
  - Ties go to more digs, then more perfect receptions, then name.
  - It is also a row in the career's Defence section.
- **Shared engine change** (`src/sports/statSchema.ts`): the `perSet` aggregation's `key` now accepts several signed keys, the same way `perGame` already did.
  - `inputsOf` reads every key, and the per-set sum is signed.
  - `boxScore.ts` already handled this. `ratings.ts`' "How is this ranked?" prose names every key.
  - Every existing single-key `perSet` reads exactly as before (pinned by tests).

### Decisions

1. **"Receptions" means perfect (#) receptions.** FIVB ranks Best Libero by *excellent* digs plus *excellent* receptions per set.
   - A logged dig is already a successful dig. Our "Perfect" grade is FIVB's excellent reception.
   - *Alternative:* all receptions. Rejected: that total includes "who was aced" (a reception error), so being aced would raise a libero's figure.
   - *Alternative:* positive receptions (perfect + good). This is a possible later switch (a one-key change).
2. **Both categories, on the same match.** A line that tracked digs but not reception grades (or the reverse) is left out of the libero figure. Counting it would treat the missing half as a 0.
3. **Everyone ranks, not only named liberos.** The rotation panel can name up to 2 liberos per side, but no stat line records who played libero. Limiting the slot would need a new career key and a new eligibility kind (today only football's `goalkeeper` exists). The host still picks the winner from the ranked list. See open question 1.
4. **Not a leaderboard.** The founder asked for an award slot. The pinned volleyball leader list is unchanged.

## 2. Volleyball: optional-category slots appear only when tracked

- **New `AwardDef.onlyIfTracked`** (shared schema type, opt-in). It is set on exactly four slots: Best receiver, Best digger, Best setter and Best libero.
- **`awardSlotTracked(sport, slot, lines)`** in `src/data/ratings.ts`. A gated slot is offered when some line of the tournament tracked **every input** of the stat it ranks by (`rankBy`, else `stat`) and passes that stat's `over` filter. Every other slot of every sport is always offered.
  - Best receiver needs a line that named the aced receiver (`receptionErrors`, the `acedNamed` filter).
  - Best digger needs `digs`.
  - Best setter needs `setAssists`.
  - Best libero needs `digs` and `receptionsPerfect` on the same line.
- **`tournamentAwardSlots(lines, sport, opts, keep)`** gives the slot list for a tournament.
  - It is scoped to the tournament's matches and the active format chip, the same way the rankings are.
  - `keep` holds slots that already have an award (a draft or a published one). They stay listed so the host can still see and clear them.
- **`defaultAwards`** iterates the gated list.
- **`TournamentAwardsTab.tsx`** draws the gated list in the host's draft view. The published view lists the published items, as before.

### Decisions

5. **"Tracked" means "could rank".** An SD-81 match that only graded receptions (no aced receiver named) does not open Best receiver, because nobody could rank on it. Showing the slot would bring back "No stats for this yet".
6. **Best attacker is not gated.** The founder named only these four slots, so it behaves as before. See open question 2.
7. **A filter that hides a slot holding an award keeps it listed.** For example, the beach chip on a tournament whose only digs were indoor.

## 3. Kabaddi: unsuccessful tackles per defender

### Definition (`unsuccessfulTacklers`, totals.ts)

A defender is charged **one unsuccessful tackle** on a raid when all of these hold:
- the raider **got back**: not tackled, not stepped out (line-out), not a failed do-or-die (`b.raiderOut` is false);
- his **touch points counted** (`b.touchPts` > 0);
- the scorer **named that defender** under "Who was touched?". Only the first `touchPts` names count: the touches that scored.

What does not count:
- **A raid that named nobody** charges nobody.
- **A raid that named only some of its touches** charges only those named. Nothing is guessed.
- **A raider caught after touching**, under a format where his touches still count (`caughtTouches` not 'void'). The defence tackled successfully, so the touched defenders count as out (`touchedOut`) but are not charged.
- **Line-outs** (defenders who stepped out without a touch).
- **A defender who went for the raider without being touched.** This capture can't see that.

### Where it shows (only when "Defenders touched" is tracked)

- **statTotals**: `unsuccessfulTackles` is keyed, written alongside `touchedOut`.
  - It goes on every line of a match that tracked touched names (0 for the rest) and on no other match.
  - If one charged name can't be resolved to a player, this key is dropped for everyone. The rule is the same as `touchedOut`'s, but each key has its own flag. So an unknown name on a caught raid drops only `touchedOut`.
- **Match centre** (Defending): a row "Unsuccessful tackles (defenders named)", lower is better.
  - The note gives the coverage: "…(N of M such raids named them)".
  - SD-41's team "Tackle attempts" figure is kept unchanged, as decided in the first deep wave.
- **Deep box**: a **UTK** column per defender, by half. It is hidden on untracked matches.
- **Careers** (Defending section):
  - "Unsuccessful tackles", with the usual coverage note when only some matches tracked it.
  - "Tackle success %" = successful tackles ÷ (successful + unsuccessful), over the tracked matches only. A match that didn't name the touched defenders reads neither 0 nor 100%.
  - Neither figure is a leaderboard; the pinned kabaddi leaders are unchanged.

### Decisions

8. **Career key name `unsuccessfulTackles`.** Abbreviation UTK, lower is better.
9. **Tackle success % added to careers.** This is the per-defender rate the stats.ts comment said was impossible until now. Its key `tackleSuccessRate` and its label are distinct from the team-only `tackleStrikeRate` (the SD-41 proxy), so the two are never confused. *Alternative:* the count alone.
10. **Partial naming.** A raid where the scorer skipped "Who was touched?" leaves those defenders uncharged. Their success % can therefore read high. The match centre note shows the coverage. Careers can't, because the absolute line sync can't express partial coverage within a match.

## 4. Open questions

1. **Best Libero eligibility.** Should only players named as libero in the rotation panel rank? This needs a new keyed line key (e.g. sets as libero) and a "libero" eligibility like the Golden Glove's keepers.
2. **Best attacker gating.** Should the SD-81 Best attacker slot also appear only when a match tracked attack attempts? It's a one-flag change (`onlyIfTracked: true`).
3. **Libero receptions.** Should Best Libero count perfect receptions only (built, FIVB "excellent") or perfect + good?
4. **Tackle success % on the leaderboard.** Should it become a leader (with a minimum of attempts, like raid strike rate's 10 raids)?

## 5. Files

- `src/sports/statSchema.ts`: multi-key `perSet`, `AwardDef.onlyIfTracked`.
- `src/data/ratings.ts`: `awardSlotTracked`, `tournamentAwardSlots`, `tournamentLines`; `defaultAwards` gated; per-set prose over several keys.
- `src/components/TournamentAwardsTab.tsx`: the host draft lists the gated slots.
- `src/sports/volleyball/stats.ts`: `digsReceptionsPerSet`, the Best libero slot, `onlyIfTracked` on four slots, the Defence row.
- `src/sports/kabaddi/totals.ts`: `unsuccessfulTacklers`, `KABADDI_UNSUCCESSFUL_TACKLE_KEY`, the keyed totals.
- `src/sports/kabaddi/stats.ts`: `unsuccessfulTackles`, `tackleSuccessRate`, the Defending rows.
- `src/sports/kabaddi/deepBox.ts`: the UTK column and counts.
- `src/sports/kabaddi/matchStats.ts`: the Defending row and its coverage note.

## 6. Tests

- New: `tests/volleyball-kabaddi-round2.test.mts` (18 tests).
  - Libero slot, multi-key per-set aggregation, ranking, minimum and prose.
  - End to end from a scored match to the career.
  - Slot gating per category, the SD-81 receiver case, tournament scope, kept slots, other sports unchanged, defaults.
  - Kabaddi: the definition, keyed totals, partial naming, caught-but-counted touches, unknown names, the contract harness, the match centre row and note, the deep box column by half, and careers (count, coverage, success %).
- Pins updated (these sports' lines only):
  - `tests/leaders-awards.test.mts`: volleyball slots plus Best libero.
  - `tests/kabaddi-deep-wave.test.mts`: the contract's derived keys plus the UTK box column.
