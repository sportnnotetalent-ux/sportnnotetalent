# Viewers become scorers: break it (2026-11-01)

**Growth plan #6.** Every shared link puts SportnNote in front of people who play too. Today the light score page ends with "Score your own games, free · Get SportnNote", which goes to the website's download section; the full app's guest bar only offers "Sign in" / "Join free". Nobody is taken straight to scoring a game, and nothing measures how many try.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| V1 | **The light page's call to action is a detour:** the website's download section, not a game. | **Fixed:** the light page's foot now reads "Score your own game, free →" and opens `app.sportnnote.in/GuestGame?from=match_link` (the guest setup: score at once, sign up to share); "Get SportnNote" stays beside it. Tests; 1,000 simulated pages (always once, always our domain). |
| V2 | **The full app's guest bar** (a signed-out viewer of a match) offers only sign-in / sign-up. | **Fixed:** the app's guest bar has "Score your own game, free ›" (from=guest_bar). Test. |
| V3 | **Nothing is measured.** No way to tell how many viewers start, finish or save a game of their own. | **Fixed:** `onboarding_step` with `step` = guest_game_open / guest_game_start / guest_game_saved and `from` (a cleaned tag: letters and _ only) — first-party, no personal data, respects the opt-out. The founder's weekly look: `docs/ops/viewer-to-scorer-funnel.sql` (read-only). Tests; 1,000 hostile tags simulated. |
| V4 | **A signed-in visitor** sent to the guest setup would make an unsaved guest game instead of a normal one. | **Fixed:** a signed-in visitor is sent to the normal friendly setup instead. Test; demo-checked (`/GuestGame?from=match_link` → Start a friendly). |

## Follow-on breaks to check while fixing
- **Only our own pages:** the link goes to `app.sportnnote.in` (the app origin the Worker is set to), never a URL from the request.
- **Analytics stay first-party and minimal:** the existing `onboarding_step` event with `step` and `from` only (both pass the server's property filter); no names, numbers or match ids; respects the analytics opt-out like every other event.
- **The match page still works for viewers:** the score, refresh and "Full match & stats" are unchanged.

## Results
Full suite 6,133 tests, 0 failing; tsc clean.
