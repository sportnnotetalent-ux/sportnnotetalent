# One SportnNote wordmark — break it first

2026-11-08. Founder: "the same SportnNote should look the way it is visible during the app launch time." The launch screen shows lime "Sport", white "n" and lime "Note" in the italic display face. Now one `Wordmark` component draws it everywhere:
- **dark backgrounds** (launch, the Home banner): lime "Sport" / "Note" with a white "n", exactly as on the launch screen;
- **light backgrounds** (sign-in, the website header): the same pattern in deep green "Sport" / "Note" with a near-black "n" (lime can't be read on cream).

The S:N mark stays as it is (lime S and colon, white N).

| # | Break | Kind | Fix |
|---|---|---|---|
| WM1 | Each screen keeps its own wordmark colours, so the brand looks different on every screen. | Consistency | One component, `Wordmark`, with two tones. The launch screen, Home and sign-in use it, and the website header uses the same pattern. Tested. |
| WM2 | Lime "Sport"/"Note" on a cream screen can't be read. | Legibility | The light tone uses deep green (≥ 4.5:1 on cream) and near-black. Tested. |
| WM3 | The launch animation's measured width changes, so the slide-in starts off-centre. | Regression | Same font, size and letters; only the colour source moves. The launch tests still pass. |
| WM4 | A screen reader reads the wordmark as "Sport n Note" (three words). | A11y | The wrapper is labelled "SportnNote". |
