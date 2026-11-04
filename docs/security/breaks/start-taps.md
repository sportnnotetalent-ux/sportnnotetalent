# Break-it: fewer taps to start (UI audit step 2, 2026-11-05)

Audit #4, #5, #36, #37. "Create & score now" lands with the match already started when the sport's start asks nothing; cricket opens scoring once the toss is in (captain and keeper become optional, settable any time); a serve-first question already answered on the Start button folds to one line with Change.

| # | Break | Fix |
|---|-------|-----|
| ST1 | A viewer, or someone opening an old link, auto-starts a match | Only with the `startNow` flag that "Create & score now" sets, only for a scorer, only before the first event; the flag is cleared after use |
| ST2 | Auto-start skips a question the sport needs (who serves, who breaks) | Only sports whose start step is plain or a clock start; racket sports and pool keep their one-tap start, which asks it |
| ST3 | Auto-start fires before the match has loaded (a match with events looks "not started") | Waits until the match has loaded |
| ST4 | Auto-start fires twice (re-render, reload) | A ref guard plus the cleared param; starting is idempotent anyway (no event is written for a plain start) |
| ST5 | Cricket without a keeper loses stumping / bye attribution | Captain and keeper stay settable at any point from "Set captain & keeper"; the organiser's designated keeper is still pre-filled |
| ST6 | Folding the serve question hides a wrong pick | "X serves first · Change" stays visible until the first point; after it, the existing "Fix who served first" |

Tests: tests/start-taps.test.mts.
