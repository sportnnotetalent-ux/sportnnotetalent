# Four confirmed audit bugs: break it (2026-10-31)

**Process:** quality mandate step 4. Each bug was found by comparing copies of the same code (`docs/engineering/duplication-audit/`) and confirmed in the code before any fix. These points were listed first; each fix then gets its own failing test (step 5).

| # | Bug or failure | Who sees it | Status |
|---|---|---|---|
| AB-01 | **Calendar export doesn't escape semicolons.** `icsText` writes `'\;'`, which in JavaScript is just `;`. Commas are escaped correctly. A venue like "Ground 2; Gate B" breaks the field in strict calendar apps. The existing test asserted the same mistake. | Anyone exporting matches to a calendar. | **Fixed:** `'\\;'` (test; the old test corrected; 1,000 hostile strings round-trip). |
| AB-02 | **A class-change request never reaches the admins.** The loop over approvers sends each notice with `playerId: myId` (the student), not the approver's id. So the student gets one banner per admin on their own phone, and no admin is told. | Students and school admins. | **Fixed:** `classRequestNotices` in `core/org.ts` addresses each notice to its admin (tests; 500 schools). |
| AB-03 | **The public score overlay ignores a rain cut in the chase.** It counts balls left from `inn2Overs`, which keeps the original length; a rain cut moves `oversLimit`, which the scorer's strip uses. After a 20-to-15-over cut the overlay could say "Need 40 off 60" while the scorer sees "off 30". The "won with N balls left" record has the same mistake. | Everyone following a rain-hit cricket chase. | **Fixed:** the overlay and the record use `oversLimit`, as the scorer does (tests; 500 rain-hit chases). |
| AB-04 | **Locking a final ignores the meet's own rules.** `completeFinal` and its re-sync rank with the plain event rules (`disciplineOf`); the meet medal table ranks with the meet's rules (`phaseDiscipline`: tie-breaks, shoot-offs, cycling GC). With a non-default rule (e.g. archery "X-count first"), the medals and points on athletes' stat lines, the podium push and records can disagree with the medal table. | Organisers and athletes at meets that change a tie rule. | **Fixed:** `rankFinal` (`data/results/plan.ts`) ranks with `phaseDiscipline`, in `completeFinal` and `resyncFinalLines` (tests; 500 archery finals). |

## Follow-on breaks checked
- **AB-02, the requester is also an admin:** they can't send a request (the button shows only for members who can't set their own class), so no self-notice case.
- **AB-03, Super Over:** the records block skips Super Overs, and the overlay reads the Super Over's own state, so neither changes.
- **AB-03, a chase shortened with no rain** (SET_OVERS between innings): both fields move together, so the answer is the same.
- **AB-04, finals already locked:** their stat lines keep the old ranking until they are reopened and locked again, or re-synced. Only meets that changed a tie rule are affected.
- **AB-04, records:** a record is about the best mark, not the tie order, so records don't change.

Full suite 5,795 tests, 0 failing; tsc clean. These are app-only changes (no migration, no edge function): they go live with the next web + over-the-air publish.
