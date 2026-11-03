# Screen sweep: shared fixes (2026-11-03)

Found by the on-screen sweep of the Batch 1–6 controls.

| # | Failure | Status |
|---|---|---|
| SS1 | **A link with an unknown sport id** (`sport=table_tennis`, `americanfootball`) crashed Schedule Match ("Something went wrong", reading formatFields of undefined). | **Fixed:** an unknown id opens the sport picker (`routeSport`, own-property check). Test. |
| SS2 | **Info printed a bare 0** for settings where 0 means something ("Max overs per bowler 0" = auto). | **Fixed:** a 0 whose hint says "0 = …" reads as that meaning (Auto, No limit, None, Timed game …). Tests; simulation unchanged. |
