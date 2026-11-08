# One describe card for every sport (wave 2 foundation) — break it first

2026-11-08. Wave 2 of docs/sport-expert/defaults-on/PLAN.md brings the badminton pattern to every sport: a card that describes the last play, with a full-width **Done** (or **Skip** when nothing is picked), a greyed "✓ Saved · …" line with **Edit**, and a fresh card for the next play. Every family uses one component, `src/components/DescribeCard.tsx` with `useDescribeMarks`, so the cards look and behave the same.

| # | Break | Kind | Fix |
|---|---|---|---|
| CD1 | Each sport builds its own card, and they drift: different buttons, wording, saved state. | Consistency | One `DescribeCard`: a title, the sport's chips (its children), the "✓ summary" line, then the button. The button reads Done once something is picked, else Skip. Tested. |
| CD2 | Cricket keys a ball by string ("2.3") while the racket card used numeric event ids. | Data | `panelMode` / `useDescribeMarks` take a string or number key. Tested. |
| CD3 | The card unmounts between plays (the parent hides it), so Done is forgotten and the saved line never shows. | State | The marks live in the parent (`useDescribeMarks`), keyed per play, not in the card. Tested. |
| CD4 | Done after nothing was picked looks like it saved something. | Clarity | With nothing picked, the button reads Skip and the card hides. Only Done shows "✓ Saved". Tested. |
| CD5 | Edit loses what was tapped. | Data | Done / Edit only change what is shown. Each sport saves its taps as they happen, as before. Tested. |
| CD6 | Screen readers can't tell the state. | A11y | The card is labelled "Describe the last play". The button says "Done describing" / "Skip describing", and the saved line has "Edit the description". Tested. |
