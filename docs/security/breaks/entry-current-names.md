# Singles / doubles entries keep an old or wrong name: break it (2026-11-03)

**Bug (founder, live app):** pool and pickleball match cards show the founder as "Hrudhay Organizer" though his player profile (players_view) is "Hrudhay". His one-person entries are ad-hoc teams named "Hrudhay Organizer". `ScheduleMatchScreen.resolveMe` named the "Me" entry `allPlayers.find(myId)?.fullName ?? profile.fullName`: while the player list hadn't loaded it used the ACCOUNT name (an early organiser test sign-up), and an entry's stored name never changes afterwards. Because that name isn't the player's name, the server's `teams_entry_names` trigger didn't mark the team as an entry (`entry_ids` null), so the read-time rebuild (`revealEntryNames`) skipped it too. `TournamentTeamsScreen.resolveMe` always used the account name.

**Process:** quality mandate step 4. Points listed first, without fixing; each fix then got a failing test (step 5).

## The auto-named rule (`participantEntry.autoEntryIds`)

An entry is **auto-named** (its name is just its people) when ALL hold:
1. the team is ad hoc (made by the singles / doubles picker or a quick game);
2. its sport is played by individuals (`participantKind` 'individual' or 'both');
3. its roster is exactly 1 or 2 different player ids;
4. its stored name has the `entryName` shape: one "/"-separated part per roster player;
5. each part fits its player (roster order, or reversed for a pair; the better fit wins, roster order on a tie): the part IS the player's current name, or its first word is the player's current first word ("Hrudhay Organizer" fits "Hrudhay"; "Hrudhay's 5s" does not). When this viewer sees the player masked ("M. R.", a child outside their circle), a part with the same initials or first letter fits, so a child's name the server missed is masked, never revealed.

Then the name reads from the players' current names (players_view, as this viewer may see them) and the short code follows when it was made from the stored name. Anything else keeps its stored name. Entries the server already marked (`entry_ids`) were already rebuilt; that path is unchanged except the short code now follows too.

| # | Break | Status |
|---|---|---|
| EN-01 | **"Me" uses the account name.** `resolveMe` (ScheduleMatch, TournamentTeams) names the entry from `profile.fullName` when the player list is empty / slow, or always. | **Fixed:** both call `getMyEntrant` (repos.ts): my player id, then my name from players_view (`getPlayer`); `meEntrantName` uses the account name only when the player has no name. |
| EN-02 | **An entry named from the wrong source is never corrected** on cards: no `entry_ids`, not a placeholder, so `revealEntryNames` leaves "Hrudhay Organizer". | **Fixed:** `revealEntryNames` (every match / team read) applies the auto-named rule above. |
| EN-03 | **A real team must keep its name:** a team in a 'team' sport ("Hrudhay's 5s" in football), a non-ad-hoc team, a team of 3+, a name with a different shape ("Smash Bros" for a pair), or a part that isn't the player's ("Hrudhay's 5s" ≠ "Hrudhay"). | **Fixed:** rules 1–5 (tests + simulation). |
| EN-04 | **Children's names (privacy):** the rebuilt name must come from players_view (initials outside the child's circle), never from a stored or typed name; a stranger must never see more of a child than before. | **Fixed:** names only from players_view; a masked player matches by initials, so the result only ever masks more. Accepted trade-off: a stranger may see a child's initials in place of an ad-hoc individual-sport entry's own name that starts with the same letter. |
| EN-05 | **Partial / odd rosters:** duplicate, blank or non-string ids, a player whose name can't be read — no half names ("Ravi / undefined"), no blank names. | **Fixed:** `autoEntryCandidate` / `autoEntryIds` reject them; the stored name stays. |
| EN-06 | **Pair order:** a pair stored "B / A" (either order) must still be recognised and shown in its stored order, not swapped. | **Fixed:** both orders scored; the better fit wins. |
| EN-07 | **Short code** stays "HO" after the name becomes "Hrudhay"; but a code the user chose must stay. | **Fixed:** `shortCodeIsAuto` — the code follows only when it equals the code made from the stored name. |
| EN-08 | **Cost:** the fallback must not add a read per card — only teams that could be auto-named entries (individual sport, 1–2 name parts, no `entry_ids`) are looked up, in one chunked read, cached a minute. | **Fixed:** pre-filter `couldBeAutoEntry` (no read); one shared roster read with the placeholder fallback; player names share the existing one-minute cache. |
| EN-09 | **Old matches** must read right with no data migration; nothing is written to the database to fix the display. | **Fixed:** read-time only; the test checks `revealEntryNames` has no update / insert / upsert. |
| EN-10 | **Optional refresh on re-use** (rewrite the stored name when an auto-named entry is picked again): a write under someone else's RLS could fail or rename a team the user doesn't own. | **Accepted (not done):** the read-time rule already shows current names everywhere; new entries get the right name from EN-01 so the server marks them (`entry_ids`). No write added. |

Tests: `tests/entry-current-names.test.mts` (17), simulation `tests/sim-entry-current-names.test.mts` (2,000 entries + 600 "Me" names). App-only change: no migration, no edge function.
