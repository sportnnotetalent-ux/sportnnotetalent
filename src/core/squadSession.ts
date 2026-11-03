/**
 * Squad sessions (founder 2026-11-04, docs/product/squad-sessions.md): a club's
 * game day. The players present choose captains, the captains pick teams in
 * turn, and the teams play short games in rotation. PURE: the server keeps
 * its own copy of the checks that matter (whose pick, who may change things —
 * supabase/migrations/20261105120000_squad_sessions.sql); this file decides
 * pick order, the next game and the session table.
 * Break-it: docs/security/breaks/squad-sessions.md.
 */

export type Rotation = 'round_robin' | 'winner_stays';
export type PickOrder = 'snake' | 'straight';
/** own: each captain picks on their own phone; shared: one phone passed around */
export type PickOn = 'own' | 'shared';
/** winner stays, on a draw: the team on longer goes off, or both go off */
export type DrawRule = 'longer_on_goes_off' | 'both_off';

export interface SessionRules {
  teams: number;
  rotation: Rotation;
  pickOrder: PickOrder;
  pickOn: PickOn;
  points: { win: number; draw: number; loss: number };
  /** winner stays: wins in a row before the winner goes off too */
  maxWins: number;
  drawRule: DrawRule;
}

export type SessionStatus = 'setup' | 'picking' | 'playing' | 'ended';

/** A session as stored (player ids only; names come from the players list). */
export interface Pick { captain: string; player: string }

export interface SquadSession {
  id: string;
  clubId?: string;
  sport: string;
  /** team names are "<name> 1", "<name> 2", … */
  name: string;
  startsAt: string;
  venueName?: string;
  status: SessionStatus;
  players: string[];
  captains: string[];
  picks: Pick[];
  rules: SessionRules;
  teamIds: string[];
  /** game settings every new game starts with (the sport's own format keys) */
  format: Record<string, unknown>;
  /** bumped on every change; a change must carry the version it saw */
  version: number;
  createdBy?: string;
}

export const MAX_PLAYERS = 100;
export const MAX_TEAMS = 8;

export const DEFAULT_RULES: SessionRules = {
  teams: 3, rotation: 'round_robin', pickOrder: 'snake', pickOn: 'own',
  points: { win: 3, draw: 1, loss: 0 }, maxWins: 2, drawRule: 'longer_on_goes_off',
};

const int = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : dflt;
  return Math.min(hi, Math.max(lo, n));
};

/** Any rules object → safe rules (SS7). */
export function cleanRules(raw: Partial<SessionRules> | null | undefined): SessionRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pts = (r.points && typeof r.points === 'object' ? r.points : {}) as Record<string, unknown>;
  return {
    teams: int(r.teams, 2, MAX_TEAMS, DEFAULT_RULES.teams),
    rotation: r.rotation === 'winner_stays' ? 'winner_stays' : 'round_robin',
    pickOrder: r.pickOrder === 'straight' ? 'straight' : 'snake',
    pickOn: r.pickOn === 'shared' ? 'shared' : 'own',
    points: {
      win: int(pts.win, 0, 10, DEFAULT_RULES.points.win),
      draw: int(pts.draw, 0, 10, DEFAULT_RULES.points.draw),
      loss: int(pts.loss, 0, 10, DEFAULT_RULES.points.loss),
    },
    maxWins: int(r.maxWins, 1, 10, DEFAULT_RULES.maxWins),
    drawRule: r.drawRule === 'both_off' ? 'both_off' : 'longer_on_goes_off',
  };
}


/** Whose pick is the `n`th (0-based): snake 1,2,3,3,2,1 … or straight 1,2,3,1,2,3. */
export function pickTurn(captains: readonly string[], n: number, order: PickOrder): string | null {
  const k = captains.length;
  if (!k || n < 0) return null;
  const round = Math.floor(n / k), i = n % k;
  return captains[order === 'snake' && round % 2 === 1 ? k - 1 - i : i];
}

/** Players still to be picked: present, not a captain, not picked (SS3). */
export function available(players: readonly string[], captains: readonly string[], picks: readonly Pick[]): string[] {
  const taken = new Set([...captains, ...picks.map((p) => p.player)]);
  return [...new Set(players)].filter((p) => !taken.has(p));
}

/** Each team's roster: its captain, then their picks in order. */
export function teamRosters(captains: readonly string[], picks: readonly Pick[]): string[][] {
  return captains.map((c) => [c, ...picks.filter((p) => p.captain === c).map((p) => p.player)]);
}

/** "Share out the rest": the remaining players, in pick order. */
export function shareRest(players: readonly string[], captains: readonly string[], picks: readonly Pick[], order: PickOrder): Pick[] {
  const left = available(players, captains, picks);
  const out: Pick[] = [];
  for (const player of left) {
    const captain = pickTurn(captains, picks.length + out.length, order);
    if (!captain) break;
    out.push({ captain, player });
  }
  return out;
}

/** Random captains from the players present (any player may tap "Random draw"). */
export function captainsDraw(players: readonly string[], teams: number, rnd: () => number = Math.random): string[] {
  const pool = [...new Set(players)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(teams, pool.length)));
}

/** A session game by team index (0-based). */
export interface SessionGame {
  home: number;
  away: number;
  status: 'scheduled' | 'live' | 'completed' | 'postponed' | 'cancelled' | string;
  winner?: 'home' | 'away' | 'draw' | null;
}

const isOpen = (g: SessionGame) => g.status === 'scheduled' || g.status === 'live';
const isPlayed = (g: SessionGame) => g.status === 'completed';

/**
 * The next game, or null while one is still open (SS8).
 * Round robin (SS11): the teams that have played least come on; then the pair
 * that has met least, then the teams that have waited longest, then the team
 * that stayed on from the last game (so 3 teams run 1v2, 2v3, 3v1, …). The
 * team from the last game is "home".
 * Winner stays (SS12): the winner stays until it has won `maxWins` in a row;
 * the longest-waiting team comes on. On a draw, the team on longer goes off
 * (or both, with `both_off`, when enough teams are waiting).
 */
export function nextGame(teams: number, games: readonly SessionGame[], rules: SessionRules): { home: number; away: number } | null {
  if (teams < 2) return null;
  if (games.some(isOpen)) return null;
  const played = games.filter(isPlayed);
  if (!played.length) return { home: 0, away: 1 };
  const last = played[played.length - 1];
  // games since each team last played (never played → very long)
  const wait = Array.from({ length: teams }, (_, t) => {
    for (let i = played.length - 1; i >= 0; i--) if (played[i].home === t || played[i].away === t) return played.length - 1 - i;
    return 1e6;
  });
  const longestWaiting = (exclude: readonly number[]) =>
    Array.from({ length: teams }, (_, t) => t).filter((t) => !exclude.includes(t))
      .sort((a, b) => wait[b] - wait[a] || a - b);
  const orient = (a: number, b: number) =>
    (b === last.home || b === last.away) && !(a === last.home || a === last.away) ? { home: b, away: a } : { home: a, away: b };

  if (rules.rotation === 'winner_stays' && teams > 2) {
    // games in a row a team has been on (counting the last one)
    const onFor = (t: number) => { let n = 0; for (let i = played.length - 1; i >= 0 && (played[i].home === t || played[i].away === t); i--) n++; return n; };
    const winsInRow = (t: number) => {
      let n = 0;
      for (let i = played.length - 1; i >= 0; i--) {
        const g = played[i];
        const w = g.winner === 'home' ? g.home : g.winner === 'away' ? g.away : -1;
        if (w !== t) break;
        n++;
      }
      return n;
    };
    if (last.winner === 'home' || last.winner === 'away') {
      const winner = last.winner === 'home' ? last.home : last.away;
      const loser = winner === last.home ? last.away : last.home;
      if (winsInRow(winner) >= rules.maxWins) {
        const waiting = longestWaiting([last.home, last.away]);
        // both off when two teams are waiting; else the loser stays on
        return waiting.length >= 2 ? { home: waiting[0], away: waiting[1] } : { home: loser, away: waiting[0] };
      }
      return { home: winner, away: longestWaiting([last.home, last.away])[0] };
    }
    // a draw (or no result)
    const waiting = longestWaiting([last.home, last.away]);
    if (rules.drawRule === 'both_off' && waiting.length >= 2) return { home: waiting[0], away: waiting[1] };
    const a = onFor(last.home), b = onFor(last.away);
    const stays = a > b ? last.away : b > a ? last.home : last.away;
    return { home: stays, away: waiting[0] };
  }

  // round robin
  const meetings = (a: number, b: number) => played.filter((g) => (g.home === a && g.away === b) || (g.home === b && g.away === a)).length;
  const count = (t: number) => played.filter((g) => g.home === t || g.away === t).length;
  const slot = (t: number) => (t === last.away ? 0 : t === last.home ? 1 : 2);
  let best: [number, number] | null = null;
  let bestKey: number[] = [];
  for (let a = 0; a < teams; a++) {
    for (let b = a + 1; b < teams; b++) {
      const key = [
        Math.max(count(a), count(b)), count(a) + count(b), meetings(a, b),
        -Math.min(wait[a], wait[b]), -Math.max(wait[a], wait[b]), slot(a) + slot(b), a, b,
      ];
      if (!best || lexLess(key, bestKey)) { best = [a, b]; bestKey = key; }
    }
  }
  return orient(best![0], best![1]);
}

const lexLess = (x: readonly number[], y: readonly number[]): boolean => {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

export interface TableRow { team: number; played: number; won: number; drawn: number; lost: number; points: number }

/** The session table: finished games only, points from the rules. */
export function sessionTable(teams: number, games: readonly SessionGame[], points: SessionRules['points']): TableRow[] {
  const rows: TableRow[] = Array.from({ length: teams }, (_, team) => ({ team, played: 0, won: 0, drawn: 0, lost: 0, points: 0 }));
  for (const g of games) {
    if (!isPlayed(g) || !rows[g.home] || !rows[g.away]) continue;
    const h = rows[g.home], a = rows[g.away];
    h.played++; a.played++;
    if (g.winner === 'home') { h.won++; a.lost++; h.points += points.win; a.points += points.loss; }
    else if (g.winner === 'away') { a.won++; h.lost++; a.points += points.win; h.points += points.loss; }
    else { h.drawn++; a.drawn++; h.points += points.draw; a.points += points.draw; }
  }
  return rows.sort((x, y) => y.points - x.points || y.won - x.won || x.team - y.team);
}

/** A session's matches as games by team index (matches between other teams are skipped). */
export function asSessionGames(
  teamIds: readonly string[],
  matches: readonly ({ homeTeam?: { id?: string } | null; awayTeam?: { id?: string } | null; status: string; winner?: 'home' | 'away' | 'draw' | null } | null | undefined)[],
): SessionGame[] {
  const out: SessionGame[] = [];
  for (const m of matches) {
    if (!m) continue;
    const home = teamIds.indexOf(m.homeTeam?.id ?? ''), away = teamIds.indexOf(m.awayTeam?.id ?? '');
    if (home < 0 || away < 0 || home === away) continue;
    out.push({ home, away, status: m.status, winner: m.winner ?? null });
  }
  return out;
}

/** Teams sitting out a game. */
export const sittingOut = (teams: number, g: { home: number; away: number }): number[] =>
  Array.from({ length: teams }, (_, t) => t).filter((t) => t !== g.home && t !== g.away);
