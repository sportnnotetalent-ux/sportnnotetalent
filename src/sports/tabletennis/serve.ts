/**
 * Table-tennis service order (ITTF): in an 11-point game each player serves 2
 * points in turn; from 10-10 (deuce) service alternates every point. The legacy
 * 21-point game (pre-2001 ITTF rules) gives 5 serves each and alternates from
 * 20-20. In general: deuce = (target − 1)-all; 5 serves each in a game to 21 or
 * more, else 2. The player who served first in a game receives first in the next,
 * so the game's opening server alternates.
 * Pure + derived from the score, so undo/replay stay correct.
 *
 * SD-104: before this, the switch was hard-coded at 10-10 with 2 serves each
 * whatever the target. Serve is derived (display + SD-22 serve figures), never
 * part of the score, so the fix is not gated: an old 21-point match shows the
 * right server and re-derives correct serve figures on its next totals sync.
 * 11-point games (the default, and every pinned log) are unchanged.
 */
export type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Serves each player takes in turn before deuce, for a game to `target`. */
export const ttServesEach = (target = 11): number => (target >= 21 ? 5 : 2);

/** Who serves the NEXT point, given the current game score and how many games
 *  are complete. `opening` = who served first in game 1; `target` = points to
 *  win a game (default 11). */
export function ttServer(home: number, away: number, gamesPlayed: number, opening: Side = 'home', target = 11, exp?: TTExpedite | null): Side {
  const first = gamesPlayed % 2 === 0 ? opening : other(opening);
  const total = home + away;
  // racket-batch6 R6-7 — expedite (ITTF 2.15): one serve each from the point
  // it came in, to the end of the match (later games: the normal first server)
  if (exp && gamesPlayed > exp.game) return total % 2 === 0 ? first : other(first);
  if (exp && gamesPlayed === exp.game && total >= exp.at) return (total - exp.at) % 2 === 0 ? exp.start : other(exp.start);
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (home >= deuce && away >= deuce) return total % 2 === 0 ? first : other(first);
  return Math.floor(total / ttServesEach(target)) % 2 === 0 ? first : other(first);
}

/** SD-117c — where the server is in their turn: the n-th serve of `of` (2 each
 *  — 5 in a 21-point game), or `deuce` from 10-10 (20-20) when service
 *  alternates every point. Derived from the score. */
export function ttServeTurn(home: number, away: number, target = 11): { n: number; of: number; deuce: boolean } {
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (home >= deuce && away >= deuce) return { n: 1, of: 1, deuce: true };
  const each = ttServesEach(target);
  return { n: ((home + away) % each) + 1, of: each, deuce: false };
}

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];

/** "2nd serve of 2 · service changes after this point" / "Deuce: service
 *  alternates every point" / under expedite (racket-batch6) its own line. */
export function ttServeHint(home: number, away: number, target = 11, expedite = false): string {
  if (expedite) return 'Expedite: service alternates every point · 13 good returns win the point for the receiver';
  const t = ttServeTurn(home, away, target);
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  if (t.deuce) return home === deuce && away === deuce ? `Deuce at ${deuce}-${deuce}: service now alternates every point` : 'Deuce: service alternates every point';
  return `${ORD[t.n - 1] ?? `${t.n}th`} serve of ${t.of}${t.n === t.of ? ' · service changes after this point' : ''}`;
}

// ------------------------------------------------ racket-batch6 · expedite --

/**
 * racket-batch6 R6-7 — the expedite system (ITTF 2.15), from the timeline's
 * `kind: 'expedite'` marker (EXPEDITE action). It is never stored on the
 * state, so Undo / corrections re-derive it, and a log without the marker —
 * every older match — is served exactly as before.
 *   game   the game it came in (0-based: games already played)
 *   at     points already played in that game
 *   start  who serves point `at` (2.15.2): a rally in progress (`xr`) → the
 *          player who served it; between rallies → the receiver of the last
 *          rally; at 0-0 → the game's normal first server
 *   rally  it came in during a rally (doubles order: the same turn)
 */
export interface TTExpedite { game: number; at: number; start: Side; rally?: true }

/** Expedite may not start once both sides have `target − 2` (ITTF 2.15.1: 9
 *  each in an 11-point game). */
export const ttExpediteAllowed = (home: number, away: number, target = 11): boolean => {
  const lim = Math.max(1, (Number(target) || 11) - 2);
  return !(home >= lim && away >= lim);
};

type Ev = { kind?: string; game?: number; side?: string; wonBy?: string; xr?: boolean };
const POINT_KINDS = new Set(['point', 'ace', 'rally']);

/** The expedite in a log, or null (no marker). */
export function ttExpediteOf(events: readonly Ev[] | null | undefined, opening: Side = 'home', target = 11): TTExpedite | null {
  const c: Record<number, { home: number; away: number; last?: Side }> = {};
  for (const e of events ?? []) {
    if (!e || typeof e !== 'object') continue;
    const g = typeof e.game === 'number' && e.game > 0 ? e.game : 1;
    if (e.kind === 'expedite') {
      const n = c[g] ?? { home: 0, away: 0 };
      const at = n.home + n.away;
      const gp = g - 1;
      let start: Side;
      if (at === 0 || !n.last) start = ttServer(0, 0, gp, opening, target);
      else if (e.xr === true) start = ttServer(n.home, n.away, gp, opening, target);
      else start = other(ttServer(n.home - (n.last === 'home' ? 1 : 0), n.away - (n.last === 'away' ? 1 : 0), gp, opening, target));
      return { game: gp, at, start, ...(e.xr === true && at > 0 ? { rally: true as const } : {}) };
    }
    if (!e.kind || !POINT_KINDS.has(e.kind)) continue;
    const w = e.kind === 'rally' ? e.wonBy : e.side;
    if (w !== 'home' && w !== 'away') continue;
    const n = (c[g] ??= { home: 0, away: 0 });
    n[w] += 1;
    n.last = w;
  }
  return null;
}

type TTLike = { current: { home: number; away: number }; games: unknown[]; opening?: Side; target: number; events?: readonly Ev[]; ttExp?: TTExpedite | null };
/** The state's expedite: `ttExp` when a replay carries it (serve stats and
 *  commentary replay points without markers), else read from `events`. */
export const ttExpOf = (x: TTLike): TTExpedite | null => (x.ttExp !== undefined ? x.ttExp : ttExpediteOf(x.events, x.opening ?? 'home', x.target));

/** Who serves the next point of a table tennis state (expedite included). */
export const ttServerOf = (x: TTLike): Side => ttServer(x.current.home, x.current.away, x.games.length, x.opening ?? 'home', x.target, ttExpOf(x));

/** Is expedite in force for the point about to be played? */
export function ttExpediteOn(x: TTLike): boolean {
  const exp = ttExpOf(x);
  if (!exp) return false;
  return x.games.length > exp.game || (x.games.length === exp.game && x.current.home + x.current.away >= exp.at);
}
