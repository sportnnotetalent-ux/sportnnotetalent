# Security Wave 2b: break "Requests to confirm", friendlies and link-by-phone

**The change:** migration `20261028160000_security_wave2b`, the `claim` channel of `verify-phone-firebase`, and the app's Home cards (`RequestsCard`, `LinkByPhoneCard`), `data/requests.ts` and `data/requestsStore.ts`. Design: `../wave2-consent-design.md`. This closes W2B-11 and W2B-12 from `security-wave2.md`, and W1B-02 from `security-wave1.md`.

**Process:** quality mandate step 4. The points were listed first, before any fix. Each was then fixed with a failing test first, or accepted with a reason.

## Can someone still get round it?
| # | Attempt | Status |
|---|---|---|
| W2bB-01 | **Answer for someone else's child.** Only the player's side can call `answer_link`: the player, their linked parent, or the person who added an unclaimed player. | Holds (test). |
| W2bB-02 | **Accept a friendly for a team you don't manage.** `answer_friendly` checks `can_manage_team`. A tournament match isn't a friendly. | Holds (tests). |
| W2bB-03 | **Get a friendly accepted, then swap in another team.** Agreements are kept per team. The new opponent must accept, and the old one stops counting. | Holds (test). |
| W2bB-04 | **Write agreements or declines directly.** `member_link_declines` and `match_team_consents` have no client grants. `claim_player_by_phone` is for the service role only. | Holds (test). |
| W2bB-05 | **Flood a parent with requests.** Add the child to many teams, with team names chosen to mislead ("Call 98… to claim a prize"). | Accepted. Names show as plain text, never links. The list stops at 100. "Not us" removes the child, and that group can't ask again. Follow-up: "Report" on a request. |
| W2bB-06 | **Take over a child's profile by proving a number.** A coach typed a parent's number, or a wrong number, onto a child's profile with no date of birth. The parent or stranger signs up by email, proves their own number, and the child's profile, with its teams and teammates, becomes theirs. The birth-year check only works when the coach entered a date of birth. | **Fixed:** the first name must match too (any case or spacing), on top of the birth-year and parent checks. Otherwise support links it by hand. Test: "W2bB-06…"; simulation: 30 parents' numbers → `support`. |
| W2bB-07 | **Lose data when the empty profile is replaced.** "Has history" didn't look at sport profiles, stats, certificates, messages, official roles, join requests, listings, disputes, the scoring log or the consent log. All of these are deleted or unlinked with the row. | **Fixed:** `player_has_history` checks every table that references a player (taken from the schema's foreign keys). Test: "W2bB-07…". |
| W2bB-08 | **Two accounts prove the same number at once.** The coach-made row is locked (`for update`), and the update needs `profile_id is null`. The second account gets "no profile was waiting". | Holds. |
| W2bB-09 | **Run up SMS costs through the claim card.** The channel shares `verify-phone-firebase`'s limit (10 an hour per account), the app's SMS cap (`takeSms`) and Firebase's own quotas. | Holds. |
| W2bB-10 | **Learn whether a number is on SportnNote.** The card appears only for the number typed at your own sign-up. The server isn't asked. One number per account, and the email must be confirmed. | Accepted. |

## Does it break something legitimate?
| # | What could break | Status |
|---|---|---|
| W2bB-11 | **Club admins never see friendly requests.** `my_managed_team_ids` copied `can_manage_club` without its club-admin clause (`club_members.role = 'admin'`). A club's own admin wasn't asked to accept a friendly against a club team. | **Fixed:** club admins are included. Test: "W2bB-11…". |
| W2bB-12 | **A mistaken "Not us" can't be undone in the app.** The child is taken off the group, and that group can't ask again. | Accepted. The sheet asks first, with "No, keep it" as the default. Undo is a support action for now. Follow-up: "Declined requests" in Settings. |
| W2bB-13 | **A parent withdraws a child from a team mid-tournament.** "Not us" (or `answer_link(…, false)` on a link agreed earlier) takes the child off. | Accepted, by design: consent can be withdrawn. Scoring history stays, because events aren't rosters. |
| W2bB-14 | **The host isn't told about a declined friendly.** The opponent's players just stay as initials. | Accepted. Follow-up: "Waiting for X to accept" on the match page. |
| W2bB-15 | **A friendly reveals the opponent's players for good.** That includes players who join that team later, if they agreed to the team. | Accepted. This matches tournaments, where a confirmed entry counts for good. |
| W2bB-16 | **The app holds the old player id after a link.** The id cache is cleared, and Home and every screen that reads on focus pick up the new id. The push "current player" was set only at launch. | **Fixed** for the push id: `confirmPhoneClaim` sets it again (app glue, checked by type-check and review, not an automated test). Accepted for the organisation switcher, which updates on the next launch. |
| W2bB-17 | **Extra reads on every Home visit.** There are two RPCs per Home focus. Both start from the caller's own players and teams. | Accepted. In the simulation, a pending-links list took 5 ms on average and a friendlies list 1.4 ms. Watch in the weekly report. |
| W2bB-18 | **Links made since Wave 2 went live (28 Oct) appear as requests.** Everything older was recorded as agreed. | Accepted, intended. |

**Simulation** (`tests/sim-security-wave2b.test.mts`): 760 accounts.
- **People:** 150 coaches with 2 children each, 100 parents with a child who has their own account, and 150 other coaches who add 2 children each to their team, club, community or event (300 links).
- **Answers:** every child's side answered (213 Confirm, 87 Not us), and every answer was honoured. "Not us" took the child off, and re-adding them asked nothing new and revealed nothing.
- **Strangers:** 100 strangers were all blocked.
- **Friendlies:** 60 hosts set up friendlies (37 accepted), and each opponent was revealed only when accepted.
- **Linking by phone:** of 100 email sign-ups, 40 were linked, 30 parents' numbers went to support, and 30 numbers nobody had added came back as none.
- **Time:** about 8 s, including setup.

## Found on live (2026-10-29)
The founder used "Did a coach add you by phone?" → **Text me a code** on their own account. Afterwards their Profile tab said "Set up your profile".

| # | What broke | Status |
|---|---|---|
| W2bB-19 | **Link by phone lost the account's own profile details.** W2bB-07 made sure the replaced profile had no *history* (teams, stats and so on). But the profile's own fields were still dropped: sports, city, photo, bio, house, jersey, privacy choices and sport details. Only the name, date of birth, guardian and email were copied. Rows that aren't history also went with it: followers (no foreign key), member consents, link declines and held stats (cascade). | **Fixed** (migration `20261029090000_claim_keeps_details`, test `tests/db-claim-merge.test.mts`). The account's own details fill the kept profile: their entries win, a detail they never filled keeps the coach's, and sports are joined. Followers, consents, declines, held stats and log references move across first, and a row both profiles already have isn't duplicated. The founder's own old row is in the nightly backup of 2026-10-29 02:00 IST and can be put back by hand. |
| W2bB-20 | **The Profile tab said "Set up your profile" while loading, and when a read failed.** It had no loading state, and a failed read left it empty. | **Fixed** (test `tests/profile-view-state.test.mts`): "Loading the profile…" while it loads; "Couldn't load the profile" with **Try again** when a read fails (also for your own profile id with nothing back); "Set up" only when the account has no player profile. |
