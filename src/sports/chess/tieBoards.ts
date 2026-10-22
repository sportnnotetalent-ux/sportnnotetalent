/**
 * Deep wave — a chess team match board by board (Olympiad / school
 * inter-house: 4 or 6 boards): each board's result written White first with
 * the players, how it ended, its length and the opening, plus each team's
 * score with White and with Black. PURE (tests/chess-deep.test.mts); the
 * rubbers' snapshots (`matches.state`) are ChessStates.
 */
import { METHOD_LABEL, openingOf, scoreFor, listMoves, isDoubleForfeit, type ChessState, type Side } from './engine.ts';

export interface TieBoardInput { status: string; state?: unknown }
export interface TieBoardRow { label: string; text: string; sub?: string; done: boolean }
export interface TieColour { white: number; whiteN: number; black: number; blackN: number }

const half = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);

export function chessTieBoards(rubbers: TieBoardInput[], label: (i: number) => string, name: (i: number, side: Side) => string): { rows: TieBoardRow[]; a: TieColour; b: TieColour } {
  const a: TieColour = { white: 0, whiteN: 0, black: 0, blackN: 0 };
  const b: TieColour = { white: 0, whiteN: 0, black: 0, blackN: 0 };
  const rows = rubbers.map((m, i): TieBoardRow => {
    const s = m.state as ChessState | null | undefined;
    const done = m.status === 'completed' && !!s?.ended && !!s.winner;
    if (!done || !s) {
      const what = m.status === 'live' ? 'in play' : m.status === 'cancelled' ? 'not played' : 'to play';
      return { label: label(i), text: `${label(i)}: ${name(i, 'home')} v ${name(i, 'away')} · ${what}`, done: false };
    }
    const white = s.white;
    const black: Side = white === 'home' ? 'away' : 'home';
    const sc = scoreFor(white, s.winner!, s.method);
    // team A is home on every rubber
    const ptsHome = isDoubleForfeit(s.method) ? 0 : s.winner === 'draw' ? 0.5 : s.winner === 'home' ? 1 : 0;
    const ptsAway = isDoubleForfeit(s.method) ? 0 : s.winner === 'draw' ? 0.5 : s.winner === 'away' ? 1 : 0;
    if (white === 'home') { a.white += ptsHome; a.whiteN += 1; b.black += ptsAway; b.blackN += 1; }
    else { a.black += ptsHome; a.blackN += 1; b.white += ptsAway; b.whiteN += 1; }
    const len = s.moves ?? (listMoves(s.game) || undefined);
    const op = openingOf(s);
    const sub = [s.method ? METHOD_LABEL[s.method] : '', len && !isDoubleForfeit(s.method) && s.method !== 'forfeit' ? `${len} moves` : '', op ? `${op.eco} ${op.name}` : ''].filter(Boolean).join(' · ');
    return { label: label(i), text: `${label(i)}: ${name(i, white)} (W) ${sc} ${name(i, black)} (B)`, ...(sub ? { sub } : {}), done: true };
  });
  return { rows, a, b };
}

/** "1½/2 with White · 1/2 with Black" for one team. */
export function colourLine(c: TieColour): string {
  const parts = [c.whiteN ? `${half(c.white)}/${c.whiteN} with White` : '', c.blackN ? `${half(c.black)}/${c.blackN} with Black` : ''].filter(Boolean);
  return parts.join(' · ');
}
