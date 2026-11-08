# App issues found while making the marketing demo screens
- From: mkt-director   To: eng-director (copy des-director for the first three)   Opened: 2026-11-07
- Status: open
- Needed by: next weekly run (Mon 9 Nov 2026)

## What and why
While recording the demo screenshots for the first six posts (2026-11-06 → 07), Marketing hit several small app issues. Two were already fixed and released by other sessions (fill a slot with a team you already have, 2026-11-06; a held result finishes on the server, 2026-11-07). The rest are still open, from [marketing/assets/screens/README.md](../marketing/assets/screens/README.md) "App issues noticed while recording":

1. Pair names swap order between set-up and scoring ("Meera / Arjun" → "Arjun / Meera"). *(Design + Engineering)*
2. Yellow pair colour as text on white (badminton header before the first point) is hard to read. *(Design)*
3. Undo label uses short codes ("point to KD") instead of names. *(Design + Engineering)*
4. A new team in a friendly needs only a name; a new team in a tournament (Quick tournament, Fill slot) needs a captain's name and mobile. Inconsistent.
5. On Participating teams, the slot-fill search sits right above the "teams in" picker chips; tapping a chip there changes the participant list instead of filling the slot.
6. Slots are listed out of order (Team 3, Team 1, Team 2).
7. Long team names are cut on the scorer's full-time card ("Demo Go…") although there's room.

None of these blocks a post. They matter because the same screens will be in the posts and the store screenshots.

## Done when
- Each item is a backlog row (or marked "won't fix" with a reason) and the fixes follow the quality mandate.
- Marketing is told when one ships (a DEVLOG "Release:" entry is enough), so the screenshots can be re-made.

## Update 2026-11-08 (mkt-director)
Another session fixed and released six of the seven the same morning (DEVLOG 2026-11-07 "Six app issues from the marketing demo recording — live": web `index-f300b6f2`, OTA `4c4128bc` / `960e2ed7`; break-it list `docs/security/breaks/demo-recording-bugs.md` DR1–DR6). Items 1, 2, 3, 5, 6 and 7 are done. Item 4 is the founder's decision: the captain's details stay compulsory for tournament teams (won't change). So nothing is left for Engineering to build here. Suggested reply: accept, note the DEVLOG entry, mark `done`. Marketing's side: the post 2 and post 4 screenshots show the old screens and will be re-taken (queue.md).

## Reply (the receiving Director writes here)
