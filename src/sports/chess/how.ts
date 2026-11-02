/**
 * Cue & board batch 5 (audit row 8) — the result's "How", the arbiter's way.
 * PURE (no React Native), shared by the scoring controls and the tests.
 *
 * One scorer, one phone: the method never adds a tap. A sensible default is
 * pre-selected and shown on the Record button — the board's own result when
 * the entered moves end in mate / stalemate, else resignation for a decisive
 * game (by far the most common way a game ends over the board) and agreement
 * for a draw. The scorer changes it with one tap, or taps "Not recorded" to
 * send none (careers then leave the game out of "by method", never guess).
 * The common methods come first; the rest sit under "More…".
 */
import { DECISIVE, DRAWN, type ChessMethod } from './engine.ts';

type Winner = 'home' | 'away' | 'draw' | null | undefined;

const WIN_COMMON: ChessMethod[] = ['resignation', 'checkmate', 'time'];
const DRAW_COMMON: ChessMethod[] = ['agreement', 'repetition', 'stalemate'];

/** The method chips for a result: the common ones, then the rest. */
export function howChoices(winner: Winner): { common: ChessMethod[]; more: ChessMethod[] } {
  if (winner === 'draw') return { common: DRAW_COMMON, more: DRAWN.filter((m) => !DRAW_COMMON.includes(m)) };
  if (winner === 'home' || winner === 'away') return { common: WIN_COMMON, more: DECISIVE.filter((m) => !WIN_COMMON.includes(m)) };
  return { common: [], more: [] };
}

/** Does the method fit the result (a draw method on a draw, a decisive one on a win)? */
export const methodFits = (winner: Winner, m: unknown): m is ChessMethod =>
  winner === 'draw' ? DRAWN.includes(m as ChessMethod) : winner === 'home' || winner === 'away' ? DECISIVE.includes(m as ChessMethod) : false;

/** The pre-selected method: the board's result when it fits, else the standard one. */
export function defaultMethod(winner: Winner, board?: ChessMethod | null): ChessMethod | null {
  if (board && methodFits(winner, board)) return board;
  if (winner === 'draw') return 'agreement';
  if (winner === 'home' || winner === 'away') return 'resignation';
  return null;
}

/** The method Record sends: the scorer's pick (when it fits), none when "Not
 *  recorded" was tapped, a double forfeit's own, else the default. */
export function sentHow(o: { winner: Winner; picked: ChessMethod | null | undefined; none: boolean; dff: boolean; board?: ChessMethod | null }): ChessMethod | undefined {
  if (o.dff) return 'double-forfeit';
  if (o.winner == null) return undefined;
  if (o.none) return undefined;
  if (o.picked && methodFits(o.winner, o.picked)) return o.picked;
  return defaultMethod(o.winner, o.board) ?? undefined;
}
