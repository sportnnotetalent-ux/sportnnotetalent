# Live scoring, Stitch picks 1–5 — break it first

2026-11-08. The founder picked these from the Stitch designs (docs/design/stitch-picks/2-live-scoring.png):
1. a green score panel;
2. a boxed undo bar;
3. a big main action per team;
4. detail tags in the feed;
5. a Pause / End-period bar.

| # | Break | Kind | Fix |
|---|---|---|---|
| LS1 | Text on the new green panel is hard to read in sunlight (cream on green, lime on green, a team's dark kit dot). | A11y | Names use `heroText`, the status uses `lime`, scores are white, all ≥ 4.5:1 on `primaryDark` (tested). Kit dots get a light ring. |
| LS2 | A sport's own clock (dark text, made for a white bar) disappears on the green panel. | A11y | The clock sits in a light pill (`surface`), so every sport's clock keeps its colours. |
| LS3 | The side in play (lime band) is unreadable on green. | A11y | The band keeps `lime` with `onLime` ink (tested ≥ 4.5:1). |
| LS4 | The boxed undo bar shows "Undo" with nothing to say what it removes, or someone taps it by accident. | Safety | The box says what was last recorded ("Last: Goal — Rohan Nair 61′"). Undo is its own pill button on the right (≥ 44 pt). One tap still undoes one step, as before (no new behaviour). |
| LS5 | Restyling the bar breaks the screen-reader summary or the score flash. | Regression | The same `accessibilityLabel` summary and the same flash. The existing score-bar tests still pass. |
| LS6 | Pair names on the green panel are cut. | UX | The panel uses `SideName` (pair-names.md). |
