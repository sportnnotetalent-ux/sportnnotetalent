# Defaults on: cue and board sports (2026-11-08)

Sports: pool, snooker, English billiards, carrom, chess.

**Founder rule being applied (racket, 2026-11-08):** every "Stats to track" option is ON for a new match unless it is typed or needs equipment. A "describe this play" card gets a clear finish (Done / Skip, then "✓ Saved · …" with Edit). See `src/sports/pointDetailSettings.ts:61-80`, `src/sports/describePanel.ts`, `docs/security/breaks/describe-done.md`.

**Fixed rules, not re-opened here:** new matches only; never a false zero; rule details are organiser options; Info → Scoring → Stats + Commentary.

**How a new default reaches a match:** a new format gets each meta field's `default` (`defaultsFor`). An old match or an old tournament format has no key or `false`, so it keeps tracking off (see `docs/security/breaks/defaults-carrom-baseball.md` DC1/DC6). Flipping a meta default is safe for replay.

**Cost legend:** (a) tap-optional, never blocks the next play · (b) blocking prompt · (c) typed, or needs equipment.

**Main finding:** this family has **no after-the-play describe card**. Every optional detail is a **pre-tag** (snooker, pool) or a **row on the commit form** (carrom board, chess move). So the Done pattern does not port as is. What does port is the principle behind it: the scorer must see what was saved. The second finding: two toggles cannot be switched ON safely until a false-zero gap is closed (snooker long / rest, carrom fouls).

---

## Pool

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Shot-clock extensions | `trackShotClock` (`src/sports/pool/meta.ts:70-71`; read `match.ts:277`; chip `index.tsx:322-327`; gate `controls.ts:141-146`) | off | (c): only means something with a 30 s shot clock and a timekeeper | **OFF** | Community and school pool has no shot clock. Without one, a "⏱ Extension" chip on every shot is noise and invites stray taps. An organiser of a WPA-style event switches it on. |

Not toggles, already one-tap and part of the commit (no change): Called / Not called (`index.tsx:292-293`), Break-and-run / Golden break / Run-out on the rack-won row (`index.tsx:165-167`).

## Snooker

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Long pots and rest shots | `trackLongRest` → state `trackLR` (`src/sports/snooker/meta.ts:54-55`; init `engine.ts:213`; chips `index.tsx:155-160`; tags sent `index.tsx:71-75`; counted `engine.ts:492-502`) | off | (a): two chips above the ball pad, tapped *before* the pot or miss, cleared after | **ON, after fixes S1 and S2** | It is a one-tap pre-tag that never blocks a pot, and broadcast-style long-pot % is wanted. But today, turning it on makes every shot-by-shot match write `longPots 0 / longAttempts 0 / restShots 0` to careers (`totals.ts:66`) and show "Shots with the rest 0" (`matchStats.ts:56-60`) even when the scorer never tagged anything. That is a false zero. |

- **S1 (blocker):** show the rows and write the keys only when the match has at least one long or rest tag. Same rule as racket: a stat appears only when captured.
- **S2 (blocker):** snooker has no `liveSettings` card, so a scorer cannot switch it off mid-match. Add an event-mode `SET_TRACK` card (applies from the next frame), as carrom (`carrom/engine.ts:206-218`) and chess (`chess/index.tsx:359-370`) have.
- Quick ("Frame scores only") mode has no shots, so the chips never show. No cost there.

## English billiards

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| (none) | `src/sports/billiards/meta.ts:20-63` has no "Stats to track" field | n/a | n/a | n/a | Shot-by-shot is already the default (`scoringMode: 'shot'`, `meta.ts:56-61`), so breaks, hazards, cannons and fouls are captured by scoring itself. Nothing to switch. A long-pot / rest pair like snooker's would be a P2 depth item, not part of this change. |

## Carrom

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Coins on the break | `trackBreak` (`src/sports/carrom/meta.ts:51`; card `engine.ts:213`; row `index.tsx:302-311`) | **on** (batch 3, DC1) | (a): 0–5+ chips on the board form, null = not recorded | **ON (keep)** | It is one tap at most, and skipping it writes nothing (`index.tsx:132`: only when `brk != null`). No false zero. |
| Missed Queen covers | `trackQueenMiss` (`meta.ts:52`; card `engine.ts:214`; row `index.tsx:344-354`) | **on** (DC1) | (a): a tap per miss, per side | **ON (keep), with fix C2** | It is cheap to record. But every non-penalty board saves `qMiss {0,0}` (`index.tsx:133`), so a scorer who ignores the row produces "Queen pocketed, cover missed 0 · 0" (`matchStats.ts:102`) and `queenMisses 0` in careers. That is a soft false zero that is already live. |
| Fouls & dues | `trackFouls` (`meta.ts:50`; card `engine.ts:212`; row `index.tsx:312-342`) | off (DC3, kept off for false zeros) | (a): foul-type chips × 2 sides + Due (+ doubles "who"). Optional, but the longest row on the form. | **ON, after fixes C1 and C3** | Fouls by type are the most useful carrom detail for coaches. But the row label says "none = no fouls" (`index.tsx:314`), and every board writes zeros (`index.tsx:130`), so a casual board reads as "0 fouls". This is the exact DC3 problem. |

- **C1 (blocker for fouls ON):** a board counts as foul-tracked only once the scorer taps a foul or due chip in that match. From that tap on, untapped boards are a real "0". Before it, nothing is written and nothing is shown. The existing coverage note "tracked on k of n boards" (`matchStats.ts:81`) then tells the truth. Change the label to "tap each foul" (drop "none = no fouls").
- **C2:** apply the same first-tap rule to missed Queen covers.
- **C3:** with all three on, the board form is long. Fold the fouls row behind a "Fouls this board ▸" link (it opens itself once a foul has been tapped in the match), like the existing "Board ended on …'s foul?" link (`index.tsx:364`).

## Chess

| toggle | key | now | cost | recommend | why |
|---|---|---|---|---|---|
| Move list (SAN / PGN) | `trackMoves` (`src/sports/chess/meta.ts:48`; card `index.tsx:365`; panel `index.tsx:208-209`, `MovesPanel.tsx`) | off | (c): every move is typed (checked for legality) | **OFF** | Typing 40+ moves a game is the job of a dedicated notation keeper, not a school arbiter on one phone. A PGN can still be pasted after the game (`index.tsx:412`), so nothing is lost. |
| Clock after each move | `trackClock` (`meta.ts:49`; card `index.tsx:366`; input `MovesPanel.tsx:92-95`) | off | (c): typed time, needs a chess clock, only with the move list | **OFF** | It is typed and needs equipment, the same as tennis serve speed. |

- **H1 (P2, drift):** the chess card hard-codes `defaults: { trackMoves: false, trackClock: false }` (`index.tsx:369`) instead of reading meta.ts. That is the same two-source drift carrom fixed in DC4. Read the defaults from meta.ts so a future flip cannot disagree with Info.

---

## Describe cards

There is no "last play" describe card in this family. The places where a scorer adds optional detail:

1. **Snooker long / rest chips** (`snooker/index.tsx:155-160`): pre-tag, then the tags clear on send (`index.tsx:71-75`). **No visible saved state.** Nothing in the commentary echoes a tag (`snooker/feed.ts` has no long / rest wording), so a scorer cannot tell whether the tag landed. **Recommend:** show it in the feed line ("Long pot · red, 1") and in the last-shot line. No Done button is needed, because the tag rides on the pot itself.
2. **Pool rack-won flags and Called / Not called** (`pool/index.tsx:165-177`, `292-310`): part of the commit button. The feed states the result. **Fine, no Done needed.**
3. **Pool extension chip** (`pool/index.tsx:322-327`): one tap is the event, and the feed says "takes the shot-clock extension" (`pool/feed.ts:165`). **Fine.**
4. **Carrom board form rows** (break, fouls, Queen misses: `carrom/index.tsx:301-354`): the finish is "✓ Record board" (`index.tsx:370`), and the rows clear for the next board. **Clear finish already.** The saved state is visible only in the Stats tab. **Recommend:** add the tracked detail to the score-sheet / last-board line (for example "· 2 fouls · 3 on the break") so the scorer sees it was kept.
5. **Carrom "Correct a board"** (`carrom/index.tsx:452-456`): Edit / Done toggle. **Fine.**
6. **Chess move entry** (`chess/MovesPanel.tsx:85-97`): "Add move" plus a "✓ n moves: …" read-back line. **Clear finish and saved state.** The arbiter chips (`chess/index.tsx:213-227`) have a "Hide" link: fine, each chip is the event.

The Done / Skip + "✓ Saved · …" pattern belongs only where detail is added **after** a play that is already recorded. No sport in this family does that today. If S1 ever moves long / rest tagging to after the pot, use `describePanel.ts` as is.

## Risks

- **Old-match replay:** safe. Snooker `trackLR` and pool `opt.shotClock` are read only when `=== true` at init (`snooker/engine.ts:213`, `pool/match.ts:277`). Carrom and chess `readTrack` ignore missing keys. An old match keeps tracking off.
- **Old tournament formats:** a tournament created before the flip has the key saved as `false`, so its new matches stay off. That is expected (organiser's choice), but say so in the release note.
- **False zeros:** snooker long / rest (S1) and carrom fouls (C1) must be fixed before flipping. Carrom missed Queen covers (C2) is already a live soft false zero.
- **Info vs state (verify):** pool and snooker have no live card, so Info › "Rules & stats captured" reads the format (`matchRules.ts:75-77`), while the engine froze the flag at init. If "Edit format" can change `trackLongRest` / `trackShotClock` after the match starts, Info would say On while the chips stay hidden. Adding the S2 card (and the same for pool) closes this.
- **Commentary wording:** carrom's card is titled "⚙️ Stats to track" (`carrom/engine.ts:207`, `chess/index.tsx:360`), while racket's is "⚙️ Scoring settings" (`pointDetailSettings.ts:89`). Pick one title for the chain. The carrom Stats footnote "switch it on under ⚙️ Stats to track" (`carrom/index.tsx:538`) must keep matching it.
- **Doubles carrom:** with fouls ON, an untapped "who" leaves fouls on the pair (`index.tsx:340`). That is acceptable, but careers per player only fill on fully attributed boards (`totals.ts` header). That is not a false zero, only thinner data.
