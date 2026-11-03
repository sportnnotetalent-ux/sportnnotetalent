# Sport-expert scoring audit: the plan (2026-11-02)

**Founder ask (2026-11-02):** go sport by sport, as a sport expert, the way tennis was done (every way a play ends → how the scorer records it → the gap), and improve the scoring mechanism. **The chain rule:** a match's **Info** holds every setting and every kind of stat the match (or its tournament) captures → those settings are exactly what **Scoring** offers → what scoring captures is what **Stats** and **Commentary** show. Same chain in every sport.

Seven expert audits (code read only, file:line cited), 109 ranked fixes in all:

| File | Sports | Fixes |
|---|---|---|
| [racket.md](racket.md) | badminton, table tennis, squash, padel, pickleball | 14 |
| [court-team.md](court-team.md) | volleyball, kabaddi, netball, handball | 14 |
| [invasion.md](invasion.md) | football, hockey, ice hockey, rugby union, rugby league | 17 |
| [us-sports.md](us-sports.md) | basketball, American football, baseball | 18 |
| [cricket.md](cricket.md) | cricket | 10 |
| [cue-board.md](cue-board.md) | pool, snooker, billiards, carrom, chess | 19 |
| [measured.md](measured.md) | golf, athletics, swimming, cycling, rowing, canoe, archery, shooting, weightlifting | 17 |

## What every audit found (the shared breaks)

1. **Info doesn't show the match's rules or what it captures.** `formatLine` (`LiveScoringScreen.tsx` ~2911) has a branch for a few sports only; most show "1-a-side" or "—". The Scoring settings card is hidden from viewers and after full time. So nobody can see what a match is tracking. (All seven audits.)
2. **Stats-to-track toggles in two places.** They appear in "Edit format" as well as the Scoring settings card, and can disagree; the filter meant to hide them (`/^track[A-Z]/`) misses most keys. Switching one on in Edit format mid-match replays it as on from the start (volleyball attack efficiency inflated). (Racket, court team, US sports.)
3. **Defaults hide depth** (the tennis TF2 pattern): racket point detail off in all five sports; football friendlies have no shots / saves; basketball missed shots off (no FG%); volleyball "Set by?" off; netball feeds / rebounds; carrom break / Queen-cover stats; rugby penalties. Tennis's fix (on for new matches only; never a false zero) applies.
4. **Captured but never shown:** pool / snooker foul types, cricket catch position, baseball WP / PB / balks / pick-offs, volleyball warnings, golf WD / DQ reasons, crew false starts, kabaddi technical reasons.

## Batches (in order)

**Status (2026-11-03):** Batches 1–5 live; Batch 6 built (see DEVLOG). Left: the L items each batch doc lists as not done (cricket multi-innings / declaration / follow-on, softball DP / FLEX, golf par / bogey), small live-screen items (cricket strike swap prompt, Format line), and the rule details marked "verify".

Every batch follows the quality mandate (break-it list → failing tests → fix → simulation → full suite + tsc → demo check → DEVLOG → founder's "commit, publish, push").

**Batch 1: wrong results and wrong stats (P0 correctness, small each).**
- Cricket: "End match" with the chase unfinished gives "Won by N runs"; no draw in a multi-day game; a draw labelled "Tie" → ask No result / Draw / Award.
- Basketball: an offensive foul is also a turnover.
- Baseball: quick-mode strikeout always "swinging" → K looking / K swinging.
- Volleyball: "Block out" credits the wrong side's stat → relabel "Block fault" (same key).
- Carrom: the board winner can lose the Queen's points if "covered by" is skipped → required.
- Snooker: a foul's value ignores the ball involved (wrong ball on the pink = 6, not 4).
- Football / hockey: a saved or missed penalty logs no shot (saves can exceed shots on target); a red card can't be recorded with "Cards" off.
- Kabaddi: quick "Raider out" never asks who tackled; no "raider out without a tackle" (baulk, 30 s, cant).
- Athletics: no "r" (retired, keeps marks); the high-jump row allows O after three failures.

**Batch 2: the chain, once for every sport (shared).**
- Info shows "Rules" (every format setting, per sport) and "Captures" (every stats-to-track option on / off) to every viewer, live and after full time.
- Stats toggles live in one place (Scoring settings); Edit format no longer offers them.
- Settings card words per sport (no "next ball" outside cricket).

**Batch 3: defaults that show depth (new matches only).** Racket point detail (all five) and padel 1st / 2nd serve; football shots + saves; basketball missed shots; volleyball "Set by?"; netball feeds / rebounds (International); handball fault types; carrom coins on the break + missed Queen covers; rugby penalties conceded; baseball "ask for fielders" (to check). Each one optional and after the play, so a casual scorer never records a false zero.

**Batch 4: shared racket mechanism.** Tennis's Fault button and fault types into shared code (padel first: "hit the mesh" type); forced-error types and "Lost by rule" for all five; doubles winners "By:" chips (side-out doubles credits every serving-side winner to the server today; re-syncing old careers needs the founder's yes).

**Batch 5: captured-but-hidden → Stats / Commentary** (item 4 above), and the per-sport P1 depth items in each audit (cricket DRS / shot on dismissals / declaration; football stoppage reason and penalty conceded; basketball team rebound / turnover, steal ↔ turnover pairing; pool full-match commentary; snooker / pool foul-type rows; volleyball "who was aced"; measured-sport WD-keeps-results, penalties, draw of lots, false-start warnings).

**Batch 6: P2s** from each audit.

## Founder decisions this plan assumes
- **Defaults on for new matches** (Batch 3) follow the founder's tennis rule ("only what is captured in scoring is seen in stats"). Old matches keep their settings.
- **Asked when its batch comes:** re-syncing old careers when doubles winners move to the right player (Batch 4).
