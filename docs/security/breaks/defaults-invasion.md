# Richer stats on by default for new football and rugby matches: break it (2026-11-03)

**Decision:** founder, 2026-11-02 — "only what is captured in scoring is seen in stats"; the chain Info settings → Scoring → Stats + Commentary must hold in every sport. Batch 3 of the expert audit (docs/sport-expert/invasion.md, "Defaults hide depth" and fix #8), the same move as tennis TF2 / TF6:

- **Football:** a friendly captured only goals, assists, subs and cards (`TRACK_FIELDS` default `k === 'cards'`, MVP F8 "Quick"). Shots and Saves are now on for a new friendly. Tournaments already had the full set.
- **Rugby union:** "Penalties by offence & free kicks" (`trackPenalties`, the penalties-conceded count) on for a new match.
- **Rugby league:** "Errors & penalties conceded" (`trackErrors`) on for a new match.

Only the format-field `default` changes, so only the new-match forms (`defaultsFor`: Schedule match, Guest game, tournament fixtures) stamp the new value. A saved match reads its own stored format.

**Process:** quality mandate step 4: listed before the change; each point then gets a failing test first (tests/defaults-invasion.test.mts) and a 500+ match simulation (tests/sim-defaults-invasion.test.mts).

**Status:** Fixed / Holds (2026-11-03).

| # | What could go wrong | Status |
|---|---|---|
| D1 | **Old football friendlies change.** A friendly created since 2026-10-31 stored the Quick keys (`trackShots: false`, `trackSaves: false`…). If a reader took the new field default over the stored value, its Shot / Save buttons and stat lines would appear on replay. | **Holds:** `readTrack` reads the stored key first; the field default is read only by the new-match forms. Test; 500 simulated old friendlies replay to the same state, and `trackedKeys` never gains shots or saves. |
| D2 | **Saved football matches (no `track*` keys) change.** Their fallback is the full set (`BASE_TRACKABLE`); touching it would hide buttons on old matches. | **Holds:** the fallback is unchanged (the field default is not the fallback). Test; 500 simulated. |
| D3 | **Old rugby / league matches gain a toggle.** A match without `trackPenalties` / `trackErrors` must stay off. | **Holds:** `init` reads `bool(config[flag], false)`, never the field default. Test; 500 simulated old matches of each, with the key absent or `false`, replay deep-equal to the pre-change state. |
| D4 | **False zeros on old matches.** If an old match counted the toggle as tracked, every player line would read "Penalties conceded 0" for a match that never captured it. | **Holds:** `trackedTallyKeys` (union) and `trackedDetailKeys` (league) stay without the key on an old match unless a penalty / error was actually recorded. Test; simulated. |
| D5 | **Edit format fills an old match's missing keys from the new defaults.** Match info › Edit builds the editor from `defaultsFor` plus the stored format. | **Holds:** the stat toggles are live-owned keys, left out of Edit format (info-chain IC3), and Save writes only the keys the user changed. Test (source check). |
| D6 | **A blocking step is added (scoring must stay one tap).** | **Holds:** football Shot / Save are extra buttons; the Goal flow does not read `shots` / `saves`. Union: ⚖ Penalty and Free kick are extra chips, offence and player optional. League (six-tackle sets off by default): errors and penalties come from an extra 📋 Detail button with "Team (no name)". **Note:** if the scorer also turns on Six-tackle sets, the set's ✋ Error / ⚖ Penalty against now asks "Who? (optional)" with a Team (no name) skip, as it already did whenever both were on. One extra tap there, not a new blocking step. Test (source check). |
| D7 | **Info › "Rules & stats captured" disagrees with scoring.** A new match must list the new captures as on; an old match must list them as it scores. | **Fixed:** `matchCaptures` on a new match shows Shots, Saves / Penalties / Errors on; an old match shows them off (union, league, Quick friendly) or as before (saved football). Test. |
| D8 | **Tournaments change by accident.** | **Holds:** football's `tournamentDefault` (full set) is untouched. Union and league have no tournament default, so new tournament matches get the toggle on too: intended ("on for new matches"). Old tournament matches keep their stored format (D3). Test. |
| D9 | **Live settings "Reset" / "N changed" count.** `RUGBY_LIVE_SETTINGS.defaults` and `LEAGUE_LIVE_SETTINGS.defaults` stay `false` (the old standard), so a new match shows the toggle as one change and Reset turns it off. | **Holds (by design):** same precedent as football Quick (`defaults` = the saved-match standard). The scorer can still switch either way. Test pins the stored-format read. |
| D10 | **A scorer can't switch the new captures off.** | **Holds:** each stays a toggle in ⚙️ Scoring / Match settings (config mode, replay applies). Test. |

Targeted run (football*, rugby*, info-chain, new files) 325 tests, 0 failing; full suite 6,409 tests, 0 failing (2 todo); tsc clean. Pinned tests updated for the new friendly default: tests/football-quick-default.test.mts (Q5/Q6), tests/sim-football-quick.test.mts.
