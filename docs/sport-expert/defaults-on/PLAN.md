# Stats on by default + a clear Done, in every sport: the plan (2026-11-08)

**Founder's ask.** A friendly badminton game showed two things:
- The extra stats should be on by default. Scorers who don't want them just score the point, or switch them off in Info.
- A "describe the last point" card needs a clear **Done** under its summary, a greyed saved state, and a fresh card on the next point.

The founder asked every sport's specialist to apply the same thinking, then product and engineering to build it.

**Racket sports: done** (describe-done.md, committed):
- every tap stat on, except the typed serve speed;
- Done / Saved / Edit;
- the endings grouped as Won it / Errors / Shot;
- "tracked" only once something is tagged, so no false zeros;
- a doubles hint when nobody on the credited side is named.

**Specialist reports** (one per family, file:line throughout): [invasion](invasion.md), [court-team](court-team.md), [us-sports](us-sports.md), [cricket](cricket.md), [cue-board](cue-board.md), [measured](measured.md).

## What every specialist found (the product view)

1. **Switching a stat on today already counts as "tracked", even when nothing was recorded.**
   - With defaults on, a scorer who taps only goals gets "Tackles 0 · Hits 0" on every player, plus false career zeros: digs 0, chip-ins 0, fouls drawn 0, and so on.
   - This comes up in every family. The racket fix (DD11: tracked = at least one tagged) has to come first everywhere.
2. **Some "describe" steps block scoring, and a few lose the score.**
   - Netball: Cancel on the feed / rebound / gain / turnover step drops the goal or turnover. This is **live in International-preset matches**.
   - Hockey, ice hockey and both rugby codes: the goal or try is saved only after the assist step.
   - American football: every follow-up hides the pads until it is answered.
   - Basketball: "Who was fouled?" blocks.
   - The fix is football's model: the score lands on the tap, then a non-blocking describe card with Done / Skip.
3. **The small "Close / Later / Skip" link at the top right is the same problem badminton had.** Cards with only that link:
   - football goal card and hockey penalty-corner card;
   - basketball assist / fast break and block;
   - volleyball set / block / ace rows, and kabaddi "Tackled by?";
   - baseball "Fielders?";
   - both cricket cards;
   - measured splits, relay take-overs and DQ reasons.
4. **Defaults live in two or three places per sport** (meta, engine live-settings `defaults`, presets). If they drift, "Reset to standard" turns options off. Each sport needs one source.
5. **Old matches must not change.** Engines read stored keys with an off fallback, so change only the new-match defaults and never the replay fallbacks.
   - Measured is the exception: `ruleOf` falls back to the default for events that stored nothing. Measured needs the value written at creation, not a changed default.

## Decisions (product)

**Stays OFF by default.** Each is typed, needs equipment, needs constant tapping, or would block scoring:

| Group | Sport | Stat |
|---|---|---|
| Typed / needs equipment | Tennis | Serve speed |
| | Cricket | Ball speed |
| | Golf | Driving distance |
| | Athletics, swimming, cycling, rowing, canoe | All timing extras |
| | Pool | Shot clock |
| | Chess | Moves / clock |
| | Hockey | Video referrals |
| | Baseball | Pitch types |
| Constant tapping | Football (friendlies) | Possession |
| | Hockey, rugby union | Possession |
| | Rugby league | Six-tackle sets |
| | Football | Passes |
| | American football | Tackles |
| | Weightlifting | Referees' lights |
| Blocks scoring | Ice hockey | +/- |
| Misleading | Cricket | Shot control (untagged counts as "in control", so 100%) |
| | Volleyball | Attack efficiency (untapped swings inflate it) |
| Changes the score | Shooting | Penalty button |

**Turns ON** after the false-zero fix (wave 1), and after the non-blocking card (wave 2) where that's needed. The per-sport tables in each report list them.

## Build waves (each: break-it list → failing tests → fix → 600-user sim → full suite + tsc → demo → DEVLOG)

| Wave | What | Why first |
|---|---|---|
| **0** | Live bugs: netball Cancel drops the goal / turnover. Hockey / ice hockey / rugby: Cancel at the assist step loses the score. Verify each, then fix. | Wrong scores today |
| **1** | "Tracked = at least one captured" in every sport. The fix list is in each report (R1, S1, C1, C2, US-DON, golf chip-ins / penalties). | Turning anything on without it creates false zeros |
| **2** | One shared describe card. The generalised `describePanel` takes string keys too (cricket). Apply it to the cards in finding 3. Make the blocking follow-ups (American football, basketball fouled, netball steps, invasion assists) non-blocking. Fix cricket: Done saves a typed speed, and the two cards merge into one per ball. | Defaults on must never slow scoring |
| **3** | Flip the defaults to the specialists' ON lists, for new matches only. Use one defaults source per sport, including presets (netball School / Halves) and live-settings `defaults`. Measured writes the value at creation. | The founder's ask |
| **4** | Info shows the truth: for a match that already exists, a missing key reads OFF, not the new default (`LiveScoringScreen.tsx` ~948). Tennis doubles: "who hit the winner" (tennis has no hitter today). Echo snooker tags and carrom detail on the last line. | Polish |

## Founder decisions needed

1. **Football "Quick" friendly (MVP).** Friendlies were kept minimal on purpose. Turn the deeper stats on there too (the specialist says yes, all tap-optional), or keep Quick minimal and turn them on for tournaments only?
2. **"Goals ruled out" on by default.** It was off because school matches have no VAR. The specialist says on: it's a tap only when a goal is disallowed.
3. **Existing tournaments.** Tournaments created before this change keep their saved settings, so their new matches stay off. Leave them, or offer organisers "Use the new defaults"?
