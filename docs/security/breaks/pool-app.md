# Breaks: the pool app plugin

**Feature:** the pool plugin around the engine (8-ball, 9-ball, 10-ball): the scorer controls and their pure
logic, the plugin's match state (who shot, the game pin, the shot feed), statTotals, records, the undo label,
the commentary, the stats panel and the box. Files: `src/sports/pool/{match,controls,core,totals,records,undo,feed,compare,box,stats}.ts`
and `index.tsx` (`docs/sports/POOL_DESIGN.md` §9). The engine's own break list is `pool-engine.md`.
**Mandate:** `docs/engineering/quality-mandate.md`, step 4. Written **before any fix**, from an attack run
against the built plugin: a probe script (hostile snapshots through every reader, a 10,000-event replay, the
longest match the options allow, duplicated and stale taps) plus a read of the screen code.

**Reachability.** Hostile JSON reaches the plugin as stored events (`match_events`, replayed by `deriveLog`)
and as stored snapshots (`matches.state`, read by the result surfaces, the tabs and the box). Only the match's
scorers can write events (RLS, unchanged by this plugin).

Status key: **BREAKS** (found broken; to fix), **HOLDS** (attacked, already safe; a test covers it),
**ACCEPTED** (with the reason).

## Taps: double taps, stale taps, the wrong rack

1. **Double tap on a shot** before the screen redraws: two events. **HOLDS** (designed in): `makeTapGuard`
   lets a tap through only if the engine would take it and the state moved since the last tap that went through
   (`tests/pool-app.test.mts`, "the double-tap guard").
2. **Double tap on a tap that asks first** (a rack end): two confirm sheets, two events. **HOLDS**: the screen
   ignores taps while a sheet is open (`busy`, index.tsx), and the guard drops a second dispatch on the same state.
3. **A confirm answered after the match moved** (another phone scored, or an Undo, while the sheet was open):
   the tap is applied to a state the question was not about, e.g. "Rack 4 to Asha?" answered yes after the
   rack-4 shots were undone. **BREAKS → FIXED** in `3a623b2`: the guard sends a tap that asked first only if the
   match is still the very state the question was about.
4. **The guard can block forever** if a tap it let through never redraws the screen (the state object never
   changes, e.g. the live layer ignored it): every later tap on that state is dropped. **BREAKS** (no path found
   today, but nothing bounds it) **→ FIXED** in `3a623b2`: a second tap on an unchanged screen counts as a double
   tap for 2 s only.
5. **A stale tap** (built on an older state: after Undo, from a second phone): the rack number (engine #12) and
   the side at the table (#13) make the engine ignore it, and the guard never sends it. **HOLDS** (tests).
6. **A tap for the wrong rack.** **HOLDS**: every action carries `rack` (stamp test).
7. **Undo storms.** **HOLDS**: the plugin state replays deterministically from any prefix (tests, simulation).
8. **A duplicated LAG** (two phones, or a retry under a new client id) is accepted again: the feed says "breaks
   first" twice and `seq` moves. **BREAKS** (cosmetic) **→ FIXED** in `587033f`: a LAG naming the breaker already
   chosen returns the same state; one naming the other breaker still fixes the lag.
9. **A duplicated out-of-turn foul from two phones** (left over from engine #13). **ACCEPTED**, as for the engine:
   rare, Undo removes it; the guard stops it from one phone.

## Scotch doubles: who shot

10. **A shot credited to a player of the other side.** **HOLDS**: an id stays on the side it was first credited
    to; on the other side the shot counts as unattributed (test).
11. **A name sent as the player id.** A full name (with a space) is never stored; a one-word name ("Asha") looks
    like an id and is kept. **ACCEPTED**: ids can't be told from single words (demo ids are `p-aarav`); only the
    match's scorers write events, and the server safety net (`20261027200000_match_names_safety_net`) strips
    minors' names from stored state and events.
12. **Unbounded distinct ids** in a hostile log (state growth). **HOLDS**: at most 4 ids per side (test).
13. **A shot with no id** (no pair on the roster, an older client). **HOLDS**: the side's shot figures are left
    out ("not tracked"), never split by guess (test).
14. **A wrong shooter can't be fixed after the match.** Live, Undo fixes it; after the match the generic
    correction list re-credits `attribution` only, and pool's id rides in `payload.pid` (nothing is credited
    live, so there is no attribution). **ACCEPTED** here; needs a shared change (report: `EventCorrectionList`
    offers ✎ Player when `payload.pid` is set — `recreditAction` already rewrites `payload.pid`).
15. **The rotation after Undo or on a second phone.** **HOLDS**: derived from the replayed state (test).
16. **A third (substitute) player** can't be picked: the chips offer the first two rostered. **ACCEPTED**:
    scotch doubles is a pair; the matchday pair comes first in the roster.

## Singles: who shot

17. **A singles side whose player id changes mid-match** (a participation dispute replaced the player, and the
    controls send the new id from then on): two ids on one side, so the side's shot figures are dropped for
    everyone. **BREAKS → FIXED** in `07e8a47`: a singles side its players name as one person is that person — every
    shot is theirs whatever id the log carried, and the older id adds no second line (the stat sync would add the
    two lines up on the replacement).
18. **A singles entry with two rostered players and no id in the log**: shots go to nobody (not guessed).
    **HOLDS** (test).

## Format changes mid-match (engine break #26)

19. **The organiser switches the game mid-match** (8-ball → 9-ball): the log would replay as the other game.
    **HOLDS** (designed in): the first event pins the game it was scored under (test).
20. **A race or sets change** re-scores the whole match. **ACCEPTED** with warnings: the live settings say so
    before the change, the controls say so after (`formatNote`), and the replay is exact both ways.
21. **A race lowered below the score reached** ends a set or the match early; later taps are ignored until it is
    raised again. **ACCEPTED**: as 20 (raising it back restores the match exactly).
22. **Players per side changed mid-match.** **HOLDS**: the match format editor hides `playersPerSide` for
    singles / doubles sports and locks the format once the match is live; a replay copes either way.
23. **A hostile first event names another game.** **ACCEPTED**: only the match's scorers write events (RLS),
    the same trust as every other event.

## Hostile and old snapshots

24. **Readers throw on a hostile snapshot**: `poolPanel` (a rack whose `table` is not a list), `poolCompare`
    (a rack record without `how`), `bestOfLine` (no state). **BREAKS → FIXED** in `8afb82e`: one cleaned view of the
    rack in play (`liveRack`) for every screen reader; rack records read defensively.
25. **Readers print garbage**: "race to undefined" / "race to Infinity" (`bestOfLine`), "Rack undefined"
    (`breakLine`), "race to __proto__" (`formatNote` on a hostile `fmt0`), feed balls beyond the game.
    **BREAKS → FIXED** in `8afb82e`: whole counts in range only; feed balls read against the game's own set.
26. **The reducer on a hostile credit, feed or rack times.** **HOLDS**: each is cleaned on read (tests).
27. **A huge stored feed.** Only the last 480 entries are ever read, but — found while writing the test meant to
    show this holds — a stored feed with more than 120 lines for one rack kept them all (the cap dropped one line
    per new event). **BREAKS → FIXED** in `71827f3`: the newest 120 per rack are kept on every event.
28. **An engine-only snapshot** (no plugin parts). **HOLDS**: the parts read as empty (test).

## Cost and availability

29. **Replay cost.** Every event re-reads (cleans) the whole credit and feed: a 10,000-event log takes about
    0.56 s on a laptop (the engine alone: 7 ms for 100,000). Every Undo and reconnect replays the log, so a long
    or hostile log makes the phone slow. **BREAKS → FIXED** in `bfe1587`: states the plugin made are remembered and
    read as they are (stored snapshots are still cleaned once): the same log replays in a fifth of the time, and
    the test checks the fast path against a replay through stored JSON.
30. **State size.** The plugin adds the feed (at most 4 racks × 120 lines) and one time per completed rack. The
    longest match the options allow (race to 99, 9 sets, 3,349 racks if they alternate) is 313 KB.
    **ACCEPTED**, as engine #27: bounded by the option clamps; a race to 9 stays under 10 KB.
31. **Stat-line writes or pushes per shot.** **HOLDS**: nothing is credited live (no `attribution`; test).

## Names, privacy

32. **Names in events or state.** **HOLDS**: ids only (the simulation checks every log and state for the
    roster names).
33. **Names in the commentary and the undo label** are looked up per viewer (`nameOf`, the dispute mask).
    **HOLDS**.

## statTotals

34. **The contract** (clean logs, every undo prefix, AMEND voids, determinism, derived keys ≥ 0). **HOLDS** (tests).
35. **A correction that turns a placed doubles side into an unplaced one** zeroes that side's shot keys (the
    sync zeroes owned keys a player lacks) instead of leaving them "not tracked". **ACCEPTED**: rare (it needs an
    AMEND that removes ids), the values stay ≥ 0 and the record keys stay right.

## Summary before the fixes

35 points: **7 BREAKS** (3, 4, 8, 17, 24, 25, 29), **19 HOLDS**, **9 ACCEPTED** (9, 11, 14, 16, 20, 21, 23, 30, 35;
14 needs a shared change). One HOLDS (#27) turned out to break while its test was written; see below.

## After the fixes (2026-10-28)

**8 BREAKS, all FIXED** (#27 was found while writing the test meant to show it holds), one commit each, each
starting with a failing test (`tests/pool-app.test.mts` and `tests/pool-totals.test.mts`, `describe('breaks …')`,
named `#3` … `#29`). **18 HOLDS**, each with a test. **9 ACCEPTED** with the reasons above (#14 needs a shared change).

| # | Break | Commit |
|---|---|---|
| 24, 25 | readers throw / print garbage on a hostile snapshot | `8afb82e` |
| 29 | replay cost: the whole credit and feed re-cleaned per event | `bfe1587` |
| 3, 4 | a stale confirm; a guard that could block for good | `3a623b2` |
| 8 | a duplicated LAG | `587033f` |
| 17 | a singles player replaced mid-match loses the side's shots | `07e8a47` |
| 27 | a stored feed over the per-rack cap | `71827f3` |

The seeded simulation (`tests/sim-pool-app.test.mts`, step 6) runs 600 scorers through the controls (valid taps,
confirm answers, the guard) with double taps, stale taps, junk and undo storms on top, and checks after every match:
replay determinism (also from JSON), the statTotals contract, the record against the state, scotch-doubles shots
adding up, result = summary, records within limits, the feed bound, reader output, and no name in the state or in
any tap the controls built. A mutation check (the totals' racks won off by one; the guard letting a double tap
through) makes it fail.
