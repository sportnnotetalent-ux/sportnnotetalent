# Squad sessions — design (founder answers, 2026-11-04)

A club's regular game day. Example: Fnatic's Thursday football. About 15 of the
club's ~50 members turn up, split into Fnatic 1 / 2 / 3, and play short games
in turn all evening.

## Founder answers

| # | Question | Answer |
|---|----------|--------|
| 1 | Rotation and draws | Round robin by default, whoever wins (1 v 2, 2 v 3, 3 v 1, repeat), so every team plays equally. Flexible: winner-stays is an option. Any of the day's players may set the rules, not only the organiser. |
| 2 | Teams | Captains pick. First the day's captains are chosen (one per team), then they pick their players. |
| 3 | Careers | Session games count in each player's **Friendly** stats. |
| 4 | Sports | Every sport. |

## How it works

1. **Start a session** from a club (or from Organize): sport, date, venue.
2. **Who's here.** Tick the club members present, and add a guest by phone if needed (same person picker; one person = one record).
3. **Rules** (any player in the session can change them, with standard defaults):
   - number of teams (default: players ÷ team size, e.g. 15 ÷ 5 = 3);
   - rotation: **round robin** (default) or winner stays;
   - game length or target (default from the sport: e.g. football 10 min, badminton 1 game to 21);
   - points for the session table: win 3 / draw 1 / loss 0 (default);
   - winner stays only: what a draw does (default: the team that has sat longest comes on) and a cap on wins in a row (default 2).
4. **Captains.** Any player names them, or taps **Random draw**.
5. **Pick teams.** Captains take turns in **snake order** (1, 2, 3, 3, 2, 1 …; straight order is the option). This works on one phone passed around, or each captain picks on their own phone. Leftover players are shared out when picks run out.
6. **Play.** "Next game" shows who's on and who sits out. Each game is an ordinary match, scored with the sport's normal scoring screen and shared scoring.
7. **Session table.** Played, won, drawn, lost, points and goals/points for each team, plus each player's numbers for the day.
8. **End session.** Results stay; the next week's session can copy the players and rules.

## Build shape (to confirm before building)

- **Data:** a `sessions` table: club, sport, date, venue, rules, players present, captains, pick order, status. A nullable `session_id` on `matches`. Teams are short-lived (adhoc) teams named "<Club> 1 / 2 / 3" with their rosters, so every screen that shows teams and matches just works.
- **Friendly stats:** session matches have no tournament, so they already count under Friendly on profiles. No stats change needed.
- **Pure logic, test first:** round-robin and winner-stays queues, snake and straight pick order, random captain draw, session table, guards (a player on two teams, picking out of turn, a captain who isn't present, two phones picking at once).
- **Every sport:** the session works in team counts and sides. Singles sports (e.g. badminton) treat each "team" as a pair or as single players rotating; game length uses each sport's own defaults.
- **Who can change things:** any player present may edit rules and captains; only captains pick, and only on their turn. Server rules enforce this.

## Built (2026-11-05)

- Team page → **Game days** → "+ Start a session" (any team member), plus the team's recent sessions.
- Screen: `src/screens/SquadSessionScreen.tsx`; rules `src/core/squadSession.ts`; data `src/data/squadSessions.ts`;
  server `supabase/migrations/20261105120000_squad_sessions.sql`.
- Differences from the plan above:
  - Players come from the team's members (add a guest to the team first).
  - Each captain picks on their own phone (the server checks it's their turn). On one shared phone, use "Share out the rest".
  - Each game uses the sport's standard settings (change them per game in Info, like any friendly); no session-wide game length yet.
  - Started from the team page only, not from Organize.

## Not in the first version

- Weekly availability poll ("who's in this Thursday?").
- Season tables across many sessions.
- App-suggested balanced teams.
