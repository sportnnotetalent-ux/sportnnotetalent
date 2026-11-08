# Pair names on every scorecard — break it first

2026-11-08. Founder: "when people are playing in pairs, both the people's names [show] on either side of slash … or maybe in next lines … reduced size of text … make sure text size and all formatting is consistent across each match scorecard."

**Rule:** one component, `SideName` (`src/components/SideName.tsx`), with its pure split in `src/core/sideName.ts`.
- **A pair** shows as two lines: "Name A /" over "Name B". It is one size smaller than a single name, from one shared token.
- **A single name or a team** stays one line at the normal size.
- **Two sizes only:** `card` for lists and cards, and `board` for the big score panels.
- **Every scorecard uses it,** and a test keeps the list honest.

| # | Break | Kind | Fix |
|---|---|---|---|
| PN1 | A pair is cut to "Aanya Verma / Div…" on a one-line card, hiding one partner. | UX | Pairs always get two lines, each its own line (cut only if one person's name alone is too long). |
| PN2 | Each scorecard picks its own size and lines, so the same pair looks different on Home, the tournament page and the scorer. | Consistency | The sizes live only in `SIDE_TYPE`. Scorecards pass colour and weight, never a font size. A test checks that each listed scorecard renders names through `SideName`. |
| PN3 | A team whose own name has a slash ("Mumbai / Pune XI") or three players ("A / B / C") is split wrongly. | Correctness | A name splits only into exactly two non-empty parts. A team with a slash in its name splits like a pair, which is harmless: it still reads correctly on two lines. Three or more stay one line, wrapping to two. Tested. |
| PN4 | A child's name, masked in the stored name ("Aanya V."), is rebuilt in full by the split. | Privacy | The split only reads the name it is given (already masked by the existing rules); it never looks people up. Tested. |
| PN5 | A screen reader reads "Aanya Verma slash Divya Nair" twice, or the two lines as two teams. | Accessibility | The lines sit in one group with one label, "Aanya Verma and Divya Nair". |
| PN6 | Two lines push the score out of line on cards. | Layout | The card rows centre vertically, and the score column keeps a fixed width. Checked in the demo on phone width. |
