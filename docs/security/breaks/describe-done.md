# Stats on by default + a Done button for "Last point" — break it first

2026-11-08, founder, scoring a friendly badminton game:
- **On by default:** the extra stats (Point detail, Rally length …) should be on for every game. A scorer who doesn't want them just taps who won and moves on, or switches them off under Info.
- **Done button:** the "Choose" link at the top right is very hard to notice. A Done button should sit under the summary line ("✓ Jump smash winner · 7–9 shots"). Tapping it greys the card out so the scorer can see it was saved, and the next point brings a fresh card to describe.

Where this applies:
- **Sports:** every racket sport: badminton, table tennis, squash, padel and pickleball (`PointDetailRow`), and tennis (`tennis/PointCapture`).
- **Defaults:** new matches only. A match already started keeps the settings it was played under (`beforeStart`).

| # | Break | Kind | Fix |
|---|---|---|---|
| DD1 | Only Point detail is on by default, so Rally length, net points, kitchen line and 3rd shot are never captured unless someone finds the settings. | Default | Every "Stats to track" toggle is on for a new match in all six racket sports. Tested. |
| DD2 | With everything on, tennis asks the scorer to type a serve speed every point, which they can't know without a speed gun. | Burden | Serve speed stays off. It is the one typed (not tapped) stat. Tested. |
| DD3 | Turning the defaults on makes scoring slower. | Speed | The point buttons stay one tap. The card only describes the point already scored, and every row is optional. Nothing blocks the next point. Tested (the next point needs no Done). |
| DD4 | There is no clear "I'm finished" action: tags save on tap, but nothing says so, and the only button is "Choose" at the top right. | Clarity | A full-width button under the summary: **Done** when something is picked, **Skip** when nothing is. Tested. |
| DD5 | After Done the card looks the same, so the scorer can't tell it was saved. | Feedback | The card turns into a greyed "✓ Saved · Jump smash winner · 7–9 shots" line with an **Edit** link that reopens it. Tested. |
| DD6 | Done on one point hides the card for the next point too. | State | Done and Skip are remembered by that point's event id. A new point has a new id, so its card opens fresh. Tested in the 600-scorer sim. |
| DD7 | Undo after Done brings back the earlier point's card still greyed, or the wrong point's card. | State | The state is keyed by event id. After an undo the last point is the earlier one, which was Done, so it shows as saved, and Edit reopens it. Tested. |
| DD8 | Edit after Done loses the tags. | Data | Done and Edit change only what is shown. The tags are already saved by POINT_DETAIL on every tap. Tested. |
| DD9 | Racket sports and tennis drift apart. | Consistency | Both use the same `panelMode` function and the same button wording. Tested. |
