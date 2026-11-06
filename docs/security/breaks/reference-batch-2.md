# Break it: reference-video batch 2

2026-11-06. The founder approved "the next suggested batch" from
`docs/design/reference-video/README.md`:
- C3 + B4 who's playing + one list row;
- C5 lighter team creation;
- C7 officials at setup;
- B7 one pop-up panel style;
- B6 loading placeholders;
- B3 calmer type;
- B9 smarter forms.

Points listed before fixing.

| # | Item | Break | Risk |
|---|---|---|---|
| R1 | C3 | A player picked at setup is not allowed to play: unverified (when the testing override is off), under the tournament's age rule, or already picked for the other side. | Eligibility |
| R2 | C3 | A suspended player (football tournament discipline) is picked with no warning, because a match that doesn't exist yet has no suspension check. | Rules |
| R3 | C3 | More starters than players-a-side. "Copy last match" brings back players no longer in the team. | Data |
| R4 | C3 | Saving the squad fails after the match is created: "Start now" breaks, or the match is lost. | Breakage |
| R5 | C3 | Pitch sports save starters but not the positional lineup, so the Lineups tab and clean sheets are wrong. | Data |
| R6 | C3 | Individual and doubles sports get a squad step that makes no sense. | Scope |
| R7 | B4 | Initials or names on a row show an under-18's full name where the data layer masks it. | Privacy |
| R8 | B4 | A row with no name, an emoji name, or a one-letter name crashes the initials or shows "undefined". | Robustness |
| R9 | C5 | An auto short code collides badly ("" for a name of symbols, longer than 4, lower case), or overwrites one the organiser typed. | Data |
| R10 | C5 | The default sport is wrong (still football for a badminton-only user) or not one of the app's sports. | UX |
| R11 | C7 | Officials set at setup write before the match exists, or a failed write blocks the match. | Breakage |
| R12 | C7 | The same person fills two slots; an empty name is saved; another sport's slot titles show. | Data |
| R13 | B7 | A shared sheet breaks the keyboard rule (a field hidden), loses Android back-to-close, or traps screen-reader focus. | a11y / keyboard |
| R14 | B6 | A placeholder stays forever when loading fails or there's no data (an endless spinner in disguise). | Breakage |
| R15 | B6 | Placeholders flash for a few milliseconds on fast loads (flicker). | UX |
| R16 | B3 | The type change shrinks scores, or changes things the founder liked (display italics on Home). | Design |
| R17 | B3 | Hand-typed font sizes keep growing after the change. | Regression |
| R18 | B9 | The city filled from your profile overwrites one the organiser typed or the host org's city. | Data |
| R19 | B9 | A child's details are prefilled anywhere public. | Privacy |

## Fixes and checks

- **R1/R3:** `core/whoPlays`: the cap is players-a-side; only players allowed here (the eligibility check, not picked for the other side). "Same as last match" keeps only players still in the team. Rows that can't be picked are greyed with the reason ("Not verified yet", "Picked for the other side").
- **R2/R6:** "Who's playing" is offered for friendlies with team sides only. Tournament matches (where suspensions apply) and individual or doubles sports keep setting squads from the match, as before.
- **R4/R5:** `data/draftSquad.saveDraftSquads` runs after `createMatch`, inside try/catch, so a failure never blocks "Start now". It saves `match_squads` and, for pitch sports, the positional lineup (`core/lineupPlace.reconcilePositions`, now shared with the matchday-squad screen).
- **R7/R8:** `ListRow` takes the name as the app already shows it (masked names stay masked). `initialsOf` skips symbols and emoji, and an empty name gives "?".
- **R9:** `shortCodeToSave`: a typed code (cleaned, 2–4) wins; otherwise one is made from the name. The result is always 2–4 capitals.
- **R10:** teams use the shared `SportPicker`, defaulting to your own sport (Personalise), then football.
- **R11/R12:** officials go in a draft (raw while typing, so spaces aren't lost — caught before release). `cleanOfficials` trims them, drops blanks and keeps one per slot, and they're saved after the match exists (best effort).
- **R13:** one `Sheet` shell: useKeyboardSheet + KeyboardSheetScope, `onRequestClose` (Android back), `accessibilityViewIsModal`, title as a header. QuickOptionsSheet and FollowAlertsSheet now use it. The other sheets move over as they're touched.
- **R14/R15:** `SkeletonList` shows after 150 ms and only while loading. The tournament page used to show "Loading…" forever on a wrong link; it now shows placeholders, then after 8 s "Couldn't load this tournament…". Checked with `/t/no-such-tournament`.
- **R16/R17:** `theme.type` ramp (title / body / label / meta / button). Buttons, section titles, row text and h3 use it, so buttons go 800 → 700. Scores keep their weights. A test caps hand-typed sizes (173) and 900 weights (219) so they can only go down. Moving the rest of the screens over is follow-up work.
- **R18/R19:** `prefillCity`: typed > host community > your own home city, and an old prefill never sticks when you switch host. Only your own Personalise data is used.

**Tests:**
- `tests/reference-batch-2.test.mts` (21);
- `tests/sim-reference-batch-2.test.mts` (600 organisers);
- `tests/quick-wins-reference.test.mts` still passes.

**Demo check:**
- picked 2 Argentina players in Who's playing and typed "Mr Rao" as referee, then Start now;
- the match's Info tab showed Mr Rao, and its matchday squad showed "Starting 2/5";
- team creation (optional code, shared picker);
- the wrong-link tournament (placeholders → message).

**Not done in this batch:**
- moving every list to `ListRow` (it's used in Who's playing first);
- moving every sheet to `Sheet`;
- placeholders beyond Home and the tournament page;
- type changes beyond the shared components;
- B9's chips inside fields and one lookup screen;
- C5's "I play in this team" and "captain can add players".
