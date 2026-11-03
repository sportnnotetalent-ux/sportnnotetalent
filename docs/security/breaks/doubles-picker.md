# Doubles picker: real pairs only, a pair from a person, recent pairs, pair type: break it (2026-11-03)

**Founder report (live, Schedule Match, racket sport, Doubles):** typing "Hru" in Pair 1's "Search pairs" offered "Hrudhay", a one-person entry; picking it set Pair 1 to Hrudhay alone and moved on to Pair 2, no partner asked. Cause: `ScheduleMatchScreen` passed one list (`pickTeams`) to every side picker, singles and doubles alike.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix starts with a failing test (`tests/doubles-picker.test.mts`); simulation in `tests/sim-doubles-picker.test.mts` (600 organisers: random entry lists, random and hostile queries, random match histories, divisions).

| # | Failure | Status |
|---|---|---|
| DP1 | **A single is offered as a pair.** Doubles search lists every entry in the sport, so a one-person entry ("Hrudhay") becomes a one-person "pair" and the match starts 1 v 2. | **Fixed:** doubles pickers get `sidesForStructure(pickTeams, 'pair')` (`src/data/doublesPicker.ts`). Test: "Hru" in doubles finds no pair. |
| DP2 | **A pair is offered as a single.** Singles search lists two-person entries ("Asha / Ben"), so a singles match can start with a pair on one side. | **Fixed:** singles pickers get `sidesForStructure(pickTeams, 'single')`; people search unchanged. |
| DP3 | **A three-or-more roster, or a roster with the same id twice, counts as a pair.** Only a roster of exactly two different people is a pair. | **Fixed:** `isPair` = exactly two different ids; `isSingle` = one id, or an old roster-less entry whose name isn't "A / B". |
| DP4 | **No way to start a pair from a person in the search.** Doubles search shows no people; picking a person must start a new pair with them as partner 1 and ask for partner 2. | **Fixed:** doubles search lists people (👤, every non-reported player); picking one opens ＋ New pair with them as partner 1 (`EntrantPicker initial`). The pair is saved through `sideForEntrants`, which reuses an existing same-roster pair. |
| DP5 | **No one-tap "me" in doubles.** | **Fixed:** "👤 Me +" on Pair 1 starts a new pair with me as partner 1 (my own player row, as singles' "Me"). |
| DP6 | **The same pair is rebuilt every time.** | **Fixed:** before typing, up to six "Recent pairs" chips. Re-creating the same two people (any order) reuses their pair (`findEntryFor`, already in `sideForEntrants`); simulated. |
| DP7 | **Recent pairs leak or mislead.** Only pairs this user played in or hosted / scored, this sport, newest first, at most six, never a placeholder, a single, the other side's pick or a duplicate. | **Fixed:** `recentPairs` (from the pickable pairs, so placeholders stay out); signed out = none. Tests + simulation. |
| DP8 | **No pair type.** | **Fixed:** format field `category` (Pair type: Open default / Men's / Women's / Mixed) right after Players in tennis, badminton, table tennis, squash, pickleball and padel (`src/sports/pairType.ts`); hidden in singles (`hideWhen playersPerSide 1`); shows in Info › Rules automatically. 'mixed' is the Mixed career split (`lineContext`, unchanged). |
| DP9 | **Pair type on a singles match.** | **Fixed:** on save `settlePairType` sets a singles match to Open; an unknown value reads Open. |
| DP10 | **Old matches change meaning.** | **Fixed:** no `category` reads Open (field default); singles / doubles splits unchanged (tests). |
| DP11 | **Tournament division ignored.** | **Fixed (narrow):** a tournament doubles match takes the pair type of the picked sides' divisions, else of the tournament's gendered divisions when they all agree (boys → Men's, girls → Women's, mixed → Mixed); otherwise nothing is guessed. The organiser can still change it. |
| DP12 | **Gender checks in friendlies.** | **Fixed by design:** nothing checks genders anywhere. |
| DP13 | **Children's names.** | **Fixed:** chips use the same sources as before: entry names (rebuilt through `players_view`) and `usePlayers` names. |
| DP14 | **Hostile input.** | **Fixed:** plain substring match (no regex), 3+ letters, capped at 25; tests + simulation. |

## Not done
- Gender checks of the actual players against the pair type (no player gender is stored); friendlies never check by design.
- Tournament UI to choose a division per match; a tournament format's own `category` (Edit format) is overridden by the match's pair type, as every other match-level default is today.
- Old pairs saved without a roster (name only "A / B") no longer show in doubles search; they are still on old matches.
- Not checked in the demo preview (no browser in this run).
