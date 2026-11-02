# Pool scotch doubles: who shoots, who breaks, a wrong ball first: break it (2026-11-02)

Found by the founder scoring a scotch doubles 8-ball friendly (Likhi / Hrudhay vs Ashok / Kartheek).

**Founder's decision (2026-11-02):** who shoots after a pot is the organiser's choice. The default is world rules: partners alternate every shot, including the shot after the break. The other choice: each player plays a full turn at the table, and the partner plays the team's next turn.

**Process:** quality mandate step 4. Listed after reading the code and **before** any fix. Each fix then gets its own failing test first (step 5).

| # | Failure | Status |
|---|---|---|
| SR1 | **Only one rule.** The app always alternates partners shot by shot. Many groups play "each player plays a full turn" (Hrudhay pots on the break, so Hrudhay keeps shooting), and the organiser can't choose that. | **Fixed:** a scotch-doubles setting "Partners take turns": *Every other shot (world rules)*, the default, or *Each player plays a full turn* (shown only for scotch doubles). Full turn: the same player while the team stays at the table on their shot; a miss, safety, foul or push starts the team's next turn with the partner. Old matches play as before. Tests; 1,000 simulated matches; demo-checked (setup). |
| SR2 | **It looks like a question every shot.** The suggested shooter is pre-picked, but two equal chips under "Shooting:" read as "who is shooting?" every time, even though the order is known. | **Fixed:** a line, not a question: "Rohan Nair shoots next (partners alternate shots) · Change" / "Hrudhay keeps shooting (a ball went in)" / "Kartheek breaks (partners take turns to break)"; Change shows both partners. Tests; demo-checked. |
| SR3 | **A team's first break goes to the roster's first name**, not the player who has been playing first for that team (Kartheek played first for his team, so he breaks first; then Ashok; Hrudhay, then Likhi). | **Fixed:** a team's first break goes to whoever played first for it, then partners alternate breaks (Hrudhay, Kartheek, Likhi, Ashok). Tests (both rules); simulation. |
| SR4 | **A ball of the other group, hit first, is easy to score as a plain pot.** Likhi (stripes) pots the 6 by hitting it first: a foul (wrong ball first, ball in hand). Tapping 6 → Pot passes the turn with no foul, and nothing asks what the cue ball hit first. The foul exists (Foul ▸ Wrong ball hit first), but nothing leads to it. | **Fixed:** 8-ball, groups decided, only the other group's balls tapped: the Pot button gives way to "What did the cue ball hit first?" with *own group · turn passes* or *their ball · foul, ball in hand* (a wrong-ball foul, the balls stay down). Tests; simulation (asked only then); demo-checked. |

## Follow-on breaks to check while fixing
- **Old matches** (no setting) play exactly as before (every other shot).
- **The full-turn rule** keeps the same player only while the team stays at the table on that player's shot. A foul, a miss, a safety, a push-out or a pass back starts the team's next turn with the partner.
- **The break counts as a shot** for the rotation in both rules (world rules: the partner shoots next; full turn: the breaker keeps shooting if a ball went in).
- **"Change" is always one tap away**: the scorer can always credit the other partner, and the rotation follows whoever was credited.
- **Singles** never show any of this.
- **Only an opponent's balls in, 8-ball, groups decided:** the scorer is asked what the cue ball hit first. Own group first: the turn passes, no foul. Their ball first: a wrong-ball foul (ball in hand), and the balls stay down. Open table, the 8, or a mix including one of their own: unchanged.
