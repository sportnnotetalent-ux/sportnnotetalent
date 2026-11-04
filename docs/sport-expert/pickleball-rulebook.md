# Pickleball: rulebook audit (2026-11-05)

Second sport checked against the governing body's own documents (read with Firecrawl). It builds on `racket.md` §5. The earlier gaps there are now built:
- Ace, and the "Serve" shot (RB7, RB8)
- Illegal-serve fault (RB9)
- Receiver faults and the two-bounce rule as "Lost by rule" (RB10)
- Technical fouls

## Sources (read 2026-11-05)

| Document | Version | Link |
|---|---|---|
| USA Pickleball Rulebook Change Document | 2026, published 17 Dec 2025 (28 pp.) | https://usapickleball.org/docs/rules/USAP-Rulebook-Change-Document.pdf |
| USA Pickleball Official Rulebook | 2026 | https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf |
| Rule 15.B.4 tie-breaker order (secondary copy) | 2026 | https://pickleroundrobin.com/guides/pickleball-tiebreakers/ |

The full rulebook PDF sits behind a bot check (a CAPTCHA), which we don't get around. Its search snippet gives the official 15.B.4.d wording ("The third tie-breaker is the best point differential of head-to-head games"), and the secondary copy matches it. **Before building PR-3, check the order against the rulebook in a browser.**

## 2026 changes that touch scoring

| Rule (2026) | What it says | Our app | Match? |
|---|---|---|---|
| 14.A.2, 15.C.2 (#2242) | Rally scoring: a point on every rally. The receiving team can win the game on game point ("no freeze"). Rally scoring is provisional for 2026, and not allowed in double-elimination doubles, Golden Ticket events or Nationals. | Rally: every rally scores, no freeze | ✓ (the provisional limits aren't shown: PR-5) |
| 15.C.2.a–c | Rally formats: 1 game, best of 3 or best of 5, to 11, 15 or 21 | Custom: points 11/15/21, best of 1/3/5 | ✓ (presets only cover 11) |
| 15.C.2.d | Bad weather: games to **7**, ends change at 4, in a single-game match or the deciding game | Points options stop at 11 | ✗ PR-2 |
| 4.B, 22 (#2135) | A technical foul can win the game, even for the receiving team (side-out scoring) | The penalty point goes straight onto the score, and side-out doesn't block it (`rallyEngine.ts:146-158`) | ✓ (closes PB-f) |
| 21.C.9 (#2239) | Doubles: if one player retires, the partner may play on alone. Same positions; the retired player's serve or receive turn is a fault | Retirement ends the match | ✗ PR-4 |
| 15.B.4 (#2073) | Round-robin tie-breakers: (a) head-to-head wins among the tied; (b) point difference, all games; (c) head-to-head point difference; (d) point difference against the next-highest team; (e) total points scored | Default "head-to-head, point difference, then lots" | partial: PR-3 |
| 15.B.4.a (#2071) | A team that withdraws, retires or is forfeited from a round robin: its results don't count in the standings, and it can't go on to playoffs | Its results count | ✗ PR-3 |
| 7.E.1, 10.C.5, 10.D.1–2, 7.B.2 | A serve must land in the correct court. A ball that bounces in then hits the net post wins the rally. A triple hit counts as a double hit. Paddle spin on the serve is legal, hand spin isn't | The fault chips already cover these (out / illegal / lost by rule) | ✓ |
| 22.A (#2093) | Warnings and penalties can be given before the match starts | Quick options only show once scoring starts | P3 |

## Findings

| # | Priority | Gap | Fix | Size |
|---|---|---|---|---|
| PR-1 | **P1** | Preset labels: "Rec (rally…)" makes rally sound casual, but in 2026 it's a sanctioned tournament format (provisional). | Rename to "Rally · 1 game to 11" and similar, and add a rally tournament preset "Rally · best of 3 to 15". Keep the values, so saved formats still read. | S |
| PR-2 | P2 | No 7-point bad-weather game (15.C.2.d). | Add 7 to Points to win. The end-change cue already works it out from half the target, rounded up (4). Add a hint: "bad weather: TD approval". | S |
| PR-3 | **P1** | Round-robin standings don't follow 15.B.4, and they count withdrawn or retired teams. | Pickleball default tie-break: `h2h, pointsDiff, h2hDiff, vsNext, for, lots`. Add a "vs the next-highest team" criterion. Leave a withdrawn / retired / forfeited team's matches out of the pool table, and mark the team "withdrawn". Organisers can still change the order. | M |
| PR-4 | P2 | Doubles: one player retires and the partner plays on (21.C.9). | Retire options: "Retire the match" / "Partner plays on". The engine marks the player out; when it's their turn to serve or receive, it scores an automatic fault. | M |
| PR-5 | P3 | Rally scoring isn't allowed in some sanctioned events (15.C.2). | A hint under Scoring when rally is chosen in a tournament: "Not allowed for double-elimination doubles, Golden Ticket or Nationals (USAP 15.C.2)". | S |
| PR-6 | P3 | Technicals can't be given before the first serve (22.A). | Show Quick options → Technicals before the match starts. | S |

## Checked and fine

- Side-out: only the serving team scores; second server; the "0-0-2" start. ✓
- Timeouts: 2 a game (3 in games to 21). One medical timeout, up to 15 minutes. ✓
- End change at 6 / 8 / 11 in the final game. ✓
- Technical warning → foul (a point, and it can win the game) → forfeit, per side. ✓
- Kitchen and foot faults, the two-bounce rule, and non-volley-zone momentum as "Lost by rule". ✓

## Suggested order

PR-1 and PR-3 first (the 2026 tournament rules), then PR-2 and PR-4.
