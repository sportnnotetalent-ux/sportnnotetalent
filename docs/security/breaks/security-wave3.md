# Security Wave 3: break the medium-findings fixes

**The change:** Wave 3A is migration `20261028180000_security_wave3a`. The plan is `../audit-2026-10-27/PLAN.md`; the findings are in `../audit-2026-10-27/{database,edge-functions,client}.md`.

**Process:** quality mandate step 4. The points were listed first, before any fix. Each was then fixed with a failing test first, or accepted with a reason.

## 3A: children's data (DB-08, DB-10, DB-11, DB-15)

### Can someone still get round it?
| # | Attempt | Status |
|---|---|---|
| W3B-01 | **Call an internal function another way.** An older app version might still call one by RPC. | Holds. The history of `src/` has no call to any of the 12 revoked functions. The new test fails for any privileged function that the app, a policy or a view doesn't use and that isn't listed on purpose. |
| W3B-02 | **Read children's memberships through the old FOR ALL write policy.** Postgres combines policies with OR, so `org_members_write … for all using (true)` also allowed every read. | Holds. It's split into insert, update and delete policies (test: the stranger case). |
| W3B-03 | **"Is this player a minor?" through `player_id_is_known_adult`.** Anyone can call it, because the read policy uses it. | Accepted. `players_view` already shows a possible minor as initials, so whether a player is a minor is public anyway. |
| W3B-04 | **Confirm a one-word name.** The initials pattern needs two or more words. A one-word name is still masked only on an exact match. | Accepted (low). It needs a writer who links the child and guesses the whole one-word name. Only the first initial is public. |
| W3B-05 | **Confirm a name through an entry's `entry_ids`.** Before, a right guess made the team an entry and a wrong one didn't. | Holds. The decision is made on the masked names, so a guess with the right initials gives the same entry (test). |
| W3B-06 | **Fail-open masking.** If a regex errors, the text is stored unmasked. | Holds. The pattern uses only escaped literals or letter classes built from the first letters. The simulation runs 600 random names, including punctuation and non-Latin letters, through it. |

### Does it break something legitimate?
| # | What could break | Status |
|---|---|---|
| W3B-07 | **A community's page for visitors.** People outside a school now see only its adult members. Member counts drop for them. | Accepted, by design (DB-10). Members, the child's side and support see everyone. |
| W3B-08 | **Staff with no date of birth.** Without a DOB they count as possible minors and are hidden from visitors. | Accepted. This is the privacy-first default `players_view` uses. A staff member who adds a DOB shows again. |
| W3B-09 | **House events scored by someone outside the school.** House players come from the school's memberships, which an outsider can no longer read. | Accepted. Inter-house events are run by the school's own staff, who are members. |
| W3B-10 | **Innocent words masked.** With a child A. R. linked to the event, any two words starting A and R ("Asha ran") become "A. R.". | Accepted. It only happens in events linked to that child, and it errs on the side of privacy. |
| W3B-11 | **A 1–2 player team that isn't an entry.** For example "Arjun Rangers" with only the child A. R. on it is now treated as an entry and renamed "A. R.". | Accepted. It's rare, and the team can be renamed. |
| W3B-12 | **Speed of the masking on every save.** The old masking skipped any name whose first word wasn't in the text. The pattern can't, so it ran one regex per child on every snapshot save, including large match states. | **Fixed:** one combined pass first; most snapshots (ids-only scoring) have no name and stop there. A 210 KB snapshot with 25 children: 15 ms before Wave 3, 38 ms with the first version, 9 ms now. The simulation asserts under 30 ms (6 ms). |
| W3B-13 | **Speed of the membership read.** `player_id_is_known_adult` runs once per row on the app's load of all memberships. | Accepted. A visitor reading all 480 memberships of 40 schools took 9 ms in the simulation. The caller's own lists are computed once per query. |

**Simulation** (`tests/sim-security-wave3.test.mts`): 761 people.
- **People:** 40 schools with 2 staff and 10 students each; a parent for every third student; 120 strangers.
- **Names:** random names, with apostrophes, hyphens, accents, non-Latin letters and one-word names.
- **Memberships:** every member and parent read was kept. A visitor read only the 80 staff rows.
- **Name guesses:** 105 right/wrong guesses were indistinguishable, and no two-word name was stored in full. 15 one-word names are W3B-04.
- **Speed:** masking 121 KB with 25 children took 6 ms.

## 3B: results you can trust (DB-12, DB-13)
The change: migration `20261028190000_security_wave3b`.

### Can someone still get round it?
| # | Attempt | Status |
|---|---|---|
| W3B-14 | **Keep the 24-hour window open.** The window runs from the last scoring event, so a scorer could add an event every day and never close it. Reopening and finishing again would do the same. | **Fixed:** `matches.completed_at` (and `field_events.completed_at`) is the first time it finished. The app can't set it, and reopening doesn't move it; a full reset clears it. Test: "W3B-14…". |
| W3B-15 | **Date an event in the future.** | Holds. The server clamps the time to now (test). |
| W3B-16 | **Write a stat line for a child added without agreement.** | Holds. It's skipped (test, simulation). |
| W3B-17 | **Issue a certificate to someone who never played.** | Holds. It's skipped (test). Certificates already issued stay. Live (read-only, 2026-10-28): 0 certificates. |
| W3B-18 | **Take a match out of its tournament, then do what you like with it.** | Holds. Only organisers can (test). |
| W3B-19 | **Support's exemption.** Support can change any result. | Accepted. Support is a handful of named staff, added by SQL. |

### Does it break something legitimate?
| # | What could break | Status |
|---|---|---|
| W3B-20 | **A child's stats are lost when their side confirms late.** An organiser enters another coach's child in a singles draw. The child's lines are skipped until the child's side confirms, and the match's stats are synced only once, at the end, so a later confirmation brings nothing back. | **Fixed:** such a line is kept aside (`parked_stat_lines`, no client access) and written when the child's side confirms; "Not us" drops it. Test: "W3B-20…"; simulation: 40 late confirmations brought their lines back. |
| W3B-21 | **A scorer taps Delete on a tournament fixture.** It's refused without an error, and the app may think it worked. | Holds. `deleteMatch` reads the deleted rows and says "you may not have permission". |
| W3B-22 | **Corrections after 24 hours.** A scorer's offline correction uploaded after the window is refused. | Accepted. The app hides "Correct this match" after 24 hours; organisers can still correct. |
| W3B-23 | **"Reset match" after a mistaken start.** For a tournament match it's the scorer's for 30 minutes, then the organisers'. | Accepted. |
| W3B-24 | **Sync speed.** Each stat line now checks who took part. | Accepted: 2.0 ms a line in the simulation. |
| W3B-25 | **Strangers' kept-aside lines.** A stranger's line for a child they added waits unseen until the child's side answers. | Accepted. Nobody can read it, there's one per match and player, and "Not us" deletes it. |

**Simulation** (`tests/sim-security-wave3b.test.mts`): 730 people.
- **Tournaments:** 50, with 400 children. All 400 lines were kept, at 2 ms a line.
- **Strangers:** 120 strangers wrote no stat lines and issued no certificates for children.
- **Late answers:** of 60 children entered by other organisers, 40 had their lines come back when their coach confirmed, and 20 "Not us" removed theirs.
- **Late scorer changes:** all 300, made more than 24 hours after the end, were refused. The 50 organiser corrections went through.
