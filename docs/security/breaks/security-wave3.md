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
