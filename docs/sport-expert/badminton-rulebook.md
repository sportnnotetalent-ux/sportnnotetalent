# Badminton: rulebook audit (2026-11-05)

First sport checked against the federation's own documents, read in full with
Firecrawl, rather than from memory. It builds on `racket.md` §1 and
`docs/sport-depth/audit-2/racket.md` (BD-a … BD-e), and does not repeat items
already built.

## Sources (read 2026-11-05)

| Document | Version | Link |
|---|---|---|
| BWF Statutes 4.1, Laws of Badminton | In force 26 Apr 2025, v5.0 (14 pp.) | https://extranet.bwf.sport/docs/document-system/81/1466/1470/Section%204.1%20-%20Laws%20of%20Badminton%20-%2026%20April%202025%20V5.0%20(2)%20.pdf |
| BWF News, "Key Changes Under the 3×15 Scoring System" | 26 Apr 2026 (AGM approval 25 Apr 2026) | https://bwfbadminton.com/news-single/2026/04/26/key-changes-under-the-3x15-scoring-system |
| BWF Statutes 4.1.8, Instant Review System | May 2017 | https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/Section%204.1.8%20-%20Instant%20Review%20System%20-%20052017.pdf |

The amended Laws text for 3×15 isn't published yet. The 3×15 rows below come
from BWF's announcement; recheck them against the new Laws PDF once it's out.

## Headline: the scoring system changes on 4 January 2027

BWF members approved **3×15** as the standard scoring system. It takes effect on
**Monday 4 January 2027**, a week before our launch (11 Jan 2027).

| 3×15 rule (BWF) | Our "Games to 15, best of 3" preset (`g15`) | Match? |
|---|---|---|
| Best of three games, to 15 | `pointsPerGame 15, gamesToWin 2` | ✓ |
| Rally scoring | engine | ✓ |
| At 14-all, two clear | win by 2 | ✓ |
| Cap 21: at 20-all the next point wins | `cap 21, goldenPoint true` | ✓ |
| 60 s interval when the leader reaches 8 | `badmintonCue`: `ceil(15/2) = 8` | ✓ |
| Deciding game: change ends at 8 | `badmintonCue`, deciding game | ✓ |
| 120 s between games | cue | ✓ |
| Game winner serves first in the next game | serve = last rally winner | ✓ |
| 3×21 kept as the alternate system; domestic organisers may choose | preset `bwf21` | ✓ |

So the maths is already right. What's wrong is the **default and the wording**:
new matches still default to 3×21, and the 3×15 preset reads like a minor variant.

## Findings

| # | Priority | Rule | Gap | Fix | Size |
|---|---|---|---|---|---|
| BR-1 | **P1** | 3×15 standard from 4 Jan 2027 | New matches default to `bwf21`. From 4 Jan 2027 the standard is 3×15. | Date-aware default: `g15` for matches created on or after 2027-01-04 (IST), `bwf21` before. Organisers can still pick either. Saved formats and existing matches stay as they are. | S |
| BR-2 | **P1** | same | Labels don't say which is official: "Games to 15, best of 3" / "Games to 21, best of 3". | "3×15 · BWF standard (from 4 Jan 2027)" and "3×21 · BWF alternate (standard until 3 Jan 2027)". "Games to 11, best of 5" becomes "5×11 · not a BWF system". Closes BD-b. | S |
| BR-3 | **P1** | Law 16.7.1: warning / fault go to the **offending side** | Badminton cards escalate **per player** (`conduct.ts:129`, `perPlayer: true`). In doubles: A is warned, partner B then offends → we suggest another warning, but the Law says fault (red card, a point). | Badminton `perPlayer: false`. Keep the player on the card for the record, but escalate by side. Squash stays per player (WSF says player). | S |
| BR-4 | P2 | IRS (Statutes 4.1.8 §3): unlimited challenges until **two fail in a game**; a successful one is kept; umpire may also call a review (§1.2) | Review markers are squash only (`conduct.ts:379`, one per game). Televised and big domestic events (e.g. PBL) use challenges; nothing to record them. | Add badminton to REVIEW with a per-sport allowance (badminton: 2 failed per game, successful ones free). Show "Challenges left: 2". Optional in Quick options, so off unless used. Note: Badminton India's copy says 2 per **match**; that's an older text. Follow BWF unless an organiser picks otherwise. | M |
| BR-5 | P2 | Law 16.2.1: score at the interval | Still not shown (BD-c). | Per-game "At interval" row in match stats (score when the leader reached 11, or 8 in 3×15). | S |
| BR-6 | P3 | Law 6: toss winner chooses serve/receive **or** an end | We record the first server only. | Optional "Started at: near / far end". Low value. | S |
| BR-7 | P3 | Laws 1.1, 9.1.6, 13.3.10, 14.2.3, 16.5.3: Para badminton (wheelchair: shuttle caught in the net after the return is a **fault**, not a let; half-court singles; one extra interval) | No Para option. | Organiser option "Para class: none / wheelchair / standing (SL3 half court)", changing the let → fault rule and the hints. Matters for school and para meets. | M |
| BR-8 | P3 | Law 8.1.3, 16.2.1 (Statutes 4.1.3): handicap matches have no interval or change of ends at 11 | Not supported. | Skip unless an organiser asks. | — |

## Checked and fine (rulebook ↔ app)

- Laws 7.2–7.5: 21 points, two clear at 20-all, golden point at 29-all (cap 30). ✓
- Law 8: change ends after games 1 and 2, and at 11 in the decider (cue). ✓
- Laws 9.1.6, 9.1.8, 13.1: service faults (too high / foot / net / out / balk and miss). ✓
- Laws 10–11: service court from the server's score parity, and the doubles serving order (`doublesOrder.ts`). ✓
- Law 12: a service court error leaves the score standing; we derive the server, so there's nothing to fix. ✓
- Laws 13.2–13.4: receiver's-partner hit, net touch, invasion, obstruction, double hit, sling → "Lost by rule". ✓
- Law 14: lets (Quick options, no score). ✓ Law 16.2: no timeouts, intervals only. ✓
- Law 16.6: shuttle change marker (`SHUTTLE`). ✓ Retire / walkover terms. ✓

## Suggested order

BR-1 + BR-2 + BR-3 first: one small batch, needed before 4 Jan 2027.
Then BR-5, BR-4, and BR-7 if para events come up.
