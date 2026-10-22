/**
 * Deep wave — chess `statTotals` (PARTIAL: only the figures below; the result
 * credit — games, wins, draws, losses, wins by method, forfeits — keeps moving
 * by the live RESULT attribution exactly as before). PURE, derived from the
 * state (+ ctx for the players' ids, since the state holds sides only), so an
 * old log replays to the same totals.
 *
 * Keys ('keyed': written only for a game that has them — never credited live):
 *   lenGames / lenMoves — the game's length in moves (typed with the result,
 *     else read from the move list); a played game only (no forfeit);
 *   mvGames / checksGiven / captures / matWon / castled / promotions — from the
 *     move list (the player's own moves);
 *   clkMoves / thinkSecs — the thinking time per move, from the clocks
 *     recorded with the moves.
 * A knockout mini-match (several games in one fixture): round 2 — the games
 * kept with their own move list, summed (an older knockout match: none).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { isDoubleForfeit, isForfeit, listMoves, type ChessState, type Side } from './engine.ts';
import { sideMoveFigures } from './gameStats.ts';

export const CHESS_DEEP_KEYS = ['lenGames', 'lenMoves', 'mvGames', 'checksGiven', 'captures', 'matWon', 'castled', 'promotions', 'clkMoves', 'thinkSecs'] as const;

/** One side's figures for the game ({} when it has none). */
export function chessSideFigures(s: ChessState, side: Side): Record<string, number> {
  const out: Record<string, number> = {};
  if (!s?.ended || s.ko || !s.winner || isForfeit(s.method) || isDoubleForfeit(s.method)) return out;
  const len = s.moves ?? listMoves(s.game);
  if (len > 0) { out.lenGames = 1; out.lenMoves = len; }
  const f = sideMoveFigures(s, side);
  if (f) {
    out.mvGames = 1;
    out.checksGiven = f.checks;
    out.captures = f.captures;
    out.matWon = f.matWon;
    out.castled = f.castled;
    out.promotions = f.promotions;
    if (s.game?.clk?.some((x) => x != null)) { out.clkMoves = f.thinkN; out.thinkSecs = Math.round(f.think); }
  }
  return out;
}

/** Round 2 — a knockout match: each game kept with its own move list counts
 *  as a game (summed per side); games without a list write nothing, so every
 *  older knockout match still writes none. */
export function chessKoFigures(s: ChessState, side: Side): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of s?.ko?.games ?? []) {
    if (!g.game?.san.length) continue;
    const one: ChessState = { white: g.white, timeControl: s.timeControl, ...(s.tcExact ? { tcExact: s.tcExact } : {}), winner: g.winner, ...(g.method ? { method: g.method } : {}),
      ...(g.moves ? { moves: g.moves } : {}), ended: true, seq: 0, game: g.game };
    for (const [k, v] of Object.entries(chessSideFigures(one, side))) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** The plugin's `statTotals`: each side's player (ctx) gets their figures. */
export function chessStatTotals(s: ChessState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!s) return out;
  for (const side of ['home', 'away'] as Side[]) {
    const id = ctx?.players?.[side]?.[0]?.id;
    if (!id) continue;
    const figs = s.ko ? chessKoFigures(s, side) : chessSideFigures(s, side);
    if (Object.keys(figs).length) out[id] = { side, stats: figs };
  }
  return out;
}
