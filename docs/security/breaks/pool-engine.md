# Breaks: pool scoring engine

**Feature:** the pool engine (8-ball, 9-ball, 10-ball): `src/sports/pool/engine.ts`, `balls.ts`, `stats.ts`
(`docs/sports/POOL_DESIGN.md`). Built in commit `50604ed`.
**Mandate:** `docs/engineering/quality-mandate.md`, step 4. Written **before any fix**, from an attack
run against the built engine (a probe script that ran each point below and printed HOLDS / BREAKS).

**Reachability, read first.** The live layer (`src/data/useLiveMatch.ts`, `deriveLog` in
`src/data/eventLog.ts`) always replays the event log from `createInitialState(config)`, or applies one
new event (a JSON row from the database) to a state the engine itself made. So hostile *JSON* reaches the
reducer; getters, Proxies and corrupted states reach it only from code in the app itself.

Status key: **BREAKS** (found broken; to fix), **HOLDS** (attacked, already safe; a test covers it),
**ACCEPTED** (with the reason).

## Inputs

1. **Ball numbers outside the game** — 0, 16, the 10 at 9-ball, the 11 at 10-ball. **HOLDS**: the whole
   tap is ignored.
2. **The same ball pocketed twice** — twice in one tap, again in a later tap, or both pocketed and driven
   off the table in one tap. **HOLDS**.
3. **Non-numbers as balls** — NaN, Infinity, -0, 1e308, 2^53, "3", a called ball not in the list.
   **HOLDS**.
4. **A 1,000,000-entry `pots` array** (denial of service). **HOLDS**: rejected after at most 16 entries
   (0.01 ms).
5. **Payload and config fields read through the prototype chain.** An inherited `pots` is applied as a
   pot; an inherited `called: false` turns a pot into a wrongful pot; `Object.prototype.illegal = true`
   (a prototype pollution anywhere else in the app) makes every 8-ball break illegal, and
   `Object.prototype.raceTo = 1` shortens every new match. **BREAKS**.
6. **A payload or config whose property access throws** — a getter, a Proxy, a `toString` that throws:
   the reducer / `createInitialState` throws, which would take down the live scoring screen.
   **BREAKS** (in-process only: stored events are JSON).
7. **A stored payload with a JSON `"__proto__"` key.** **HOLDS**: an own key, never read.
8. **Action types and foul kinds named like Object properties** (`__proto__`, `constructor`,
   `toString`, `hasOwnProperty`). **HOLDS**: types fall to the default branch, kinds are checked against a
   Set and recorded as `other`.
9. **Lookup by a state value**: a snapshot whose `game` is `__proto__` makes `GAME_LABEL[game]` return
   `Object.prototype`, so the status line reads "[object Object] · Rack 1". **BREAKS**.
10. **`FOUL {kind: 'illegalBreak'}` during play** is accepted, so the stats show an illegal break that
    never happened. **BREAKS**.
11. **Names smuggled into payloads** — `breaks`, `breaker`, `kind`, `by`, `note`, `shooter`,
    `attribution.playerName`. **HOLDS**: only sides, ball numbers, enums and counters are copied into the
    state; no player id either.

## Timing, replays, retries

12. **A duplicated quick `RACK`** (a double tap, two phones, or a retry under a new client id) awards the
    *next* rack as well. The engine has nothing to tell a duplicate from a second rack. **BREAKS**.
13. **A duplicated side-less `MISS` / `SAFETY` / `FOUL`** (two phones scoring the same shot) passes the
    turn twice, back to the wrong player. With the action's `side` it already holds (the duplicate's side
    is no longer the shooter), but the side is optional. **BREAKS**.
14. **Actions after the match ended.** **HOLDS**: the same state object comes back.
15. **Replaying 10,000 events in one rack** (5 ms; the state stays 1.2 KB) and **100,000 events over the
    longest match allowed** (7 ms). **HOLDS**: each event copies a few fixed-size objects; the rack list
    is replaced only when a rack ends.
16. **Undo across rack boundaries, mixed quick and detailed racks.** **HOLDS**: every prefix of a log
    replays to the same state as its JSON round trip.
17. **Realtime events arriving out of `seq` order on a viewer.** The incremental state can differ from the
    log's until the next rebuild. **ACCEPTED**: shared by every sport; `deriveLog` rebuilds on reconnect,
    DELETE and AMEND; the side guard (13) ignores most misordered shots.
18. **An older app version meets an action type it doesn't know** (a later engine adds one). **ACCEPTED**:
    ignored, the same rule as every sport (new payload keys optional, new types degrade); the state carries
    `v: 1` for a future migration.

## The data itself

19. **Racks won pass the race; a set not closed at the race.** **HOLDS**.
20. **The winner decided more than once.** **HOLDS**.
21. **An 8-ball group assigned twice.** **HOLDS**: set only while the table is open.
22. **Three-foul counting** across innings, across players, across a re-rack or a new rack. **HOLDS**.
23. **`RACK` or `STALEMATE` while a choice is pending.** **HOLDS**: the award / the replay clears it.
24. **The reducer on a corrupted or foreign state** (`tally` missing, `racks` not an array): it throws.
    **BREAKS** (reachable only by a caller that feeds a stored snapshot to the reducer).
25. **The readers on a hostile snapshot** — `summary`, `scoreLine`, `lineScore`, `result`, `poolStats`:
    a score of "NaN" / "Infinity" / "undefined", "1-undefined" as a line, a result with no away score, or a
    throw when `sets` holds a null. Every result surface reads stored snapshots (`matches.state`).
    **BREAKS**.
26. **The organiser edits the format mid-match** (8-ball → 9-ball, a shorter race): the next replay
    re-scores the whole log under the new format, silently. **ACCEPTED for the engine** (it can't know
    which format a stored log was scored under); integration requirement: lock `game` once the match has
    an event, and warn before a race / sets change that the replay will re-score it.
27. **State size.** The longest match the options allow (race to 99, 9 sets to win) keeps one small record
    per rack: about 1,300 racks ≈ 106 KB saved per tap. **ACCEPTED**: bounded by the option clamps; a race
    to 9 is under 3 KB.
28. **The previous state mutated** through shared arrays. **HOLDS**.

## Who can call it, children's data, cost

29. **Who can call it.** The engine applies any event in the log; it has no notion of the caller.
    **ACCEPTED**: permission is the database's job (`match_events` RLS: the match's scorers only) and is
    unchanged by this engine.
30. **Children's data.** **HOLDS**: the state and the summary text hold no names and no player ids.
31. **Cost** (SMS, email, push). **HOLDS**: the engine makes no calls.

## Summary before the fixes

31 points: **8 BREAKS** (5, 6, 9, 10, 12, 13, 24, 25), **18 HOLDS**, **5 ACCEPTED** (17, 18, 26, 27, 29;
26 with an integration requirement).
