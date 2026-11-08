# Wave 0: a scored goal or try is never lost by closing its follow-up — break it first

2026-11-08. The specialist review (docs/sport-expert/defaults-on/PLAN.md, wave 0) found that in netball, hockey, ice hockey, rugby union and rugby league the goal or try is sent only when its last follow-up step finishes. Closing a follow-up step with **Cancel** discards the play. This is a wrong score if the scorer meant "skip this question". It is live today in netball International matches, where feeds are on, and in every hockey, ice hockey and rugby goal or try with an assist step.

**Rule.** Football already works this way (SD-114, "Close keeps the goal"). Steps come in two kinds:
- **Defining the play** (goal type, who scored, try zone): **Cancel** backs out. This is how a mis-tapped Goal is undone.
- **Describing a play already decided** (assist, second assist, on-ice players, netball feed, rebound, deflection / turnover outcome): the header reads **Save as is** and logs the play with what is known.

While **editing** an existing play, it always reads **Cancel** and keeps the original (SD-114 holds the removal until the re-entry commits). A wrong play is still one tap on Undo.

| # | Break | Kind | Fix |
|---|---|---|---|
| SC1 | Netball, feeds on: Goal → "Who fed?" → Cancel. The goal is gone. | Wrong score | The feed step's header reads Save as is and logs the goal with no feeder. Tested. |
| SC2 | Netball miss → feed → rebound → close: the miss and the feeder are lost. | Wrong stats | The feed step logs the miss. The rebound step logs the miss with its feeder and no rebound. Tested. |
| SC3 | Netball deflection or turnover → outcome / type → close: the stat is lost. | Wrong stats | Logs the stat with its player and no outcome / type. Tested. |
| SC4 | Hockey: Goal → type → scorer → assist → Cancel. The goal is gone. | Wrong score | The assist step logs the goal (its type, scorer and PC link) with no assist. Tested. |
| SC5 | Ice hockey: the assist, second-assist or on-ice step → Cancel. The goal is gone. | Wrong score | Each logs the goal with what is picked so far: scorer, first assist, and the second assist from the on-ice step; strength and empty net kept. Tested. |
| SC6 | Rugby union / league: Try → scorer → assist → Cancel. The try is gone, and in league its bonus-zone 5 too. | Wrong score | The assist step logs the try (its scorer, and league's bonus zone) with no assist. Tested. |
| SC7 | "Save as is" while editing would overwrite the original with less detail. | Data | While editing, the header stays Cancel and keeps the original. Tested. |
| SC8 | "Save as is" on the first step would turn every mis-tap into a goal. | Wrong score | Defining steps keep Cancel. Tested in the 600-scorer sim. |
