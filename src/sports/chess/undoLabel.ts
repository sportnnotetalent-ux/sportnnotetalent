/**
 * Undo labels batch (2026-11-03) — what Undo removes in chess: "move Nf3",
 * "moves e4 e5", "result 1-0 · Anand wins (checkmate)", "result ½-½ (draw
 * agreed)", "game 2 · Carlsen wins (on time)" (a knockout game), "illegal move ·
 * Anand", "draw offer · Carlsen", "clock times", "colour pick", "opening".
 * Built from the newest step only (state before / after). The players are the
 * sides (a chess side is one player, named as the screen names it). Null =
 * nothing to name (the bar says a plain "Undo"). PURE.
 */
import { cleanUndoLabel, sideWord, type UndoSides, type UndoStep } from '../undoLabel.ts';
import { METHOD_LABEL, resultString, type ChessMethod, type ChessState } from './engine.ts';

const QUIET: Record<string, string> = {
  OPENING: 'opening', SET_TRACK: 'stats-to-track setting', SET_WHITE: 'colour pick', STAT_ADJUST: 'stat correction',
};

const methodWords = (m: unknown): string =>
  typeof m === 'string' && Object.prototype.hasOwnProperty.call(METHOD_LABEL, m) ? ` (${METHOD_LABEL[m as ChessMethod].toLowerCase()})` : '';
const outcome = (winner: unknown, sides?: UndoSides): string | null =>
  winner === 'draw' ? 'draw' : winner === 'home' || winner === 'away' ? `${sideWord(winner, sides)} wins` : null;
const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export function chessUndoLabel(step: UndoStep, _nameOf?: unknown, sides?: UndoSides): string | null {
  if (!step || typeof step.type !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(QUIET, step.type)) return QUIET[step.type];
  const prev = step.prev as ChessState | null, next = step.next as ChessState | null;
  if (!prev || !next) return null;
  if (step.type === 'MOVES') {
    const a = prev.game?.san ?? [], b = next.game?.san ?? [];
    if (!Array.isArray(a) || !Array.isArray(b)) return 'move list';
    if (b.length > a.length && a.every((m, i) => b[i] === m)) return cleanUndoLabel(`move${b.length - a.length > 1 ? 's' : ''} ${b.slice(a.length).join(' ')}`) ?? 'move list';
    // the same moves, only the clock times changed
    if (b.length === a.length && a.every((m, i) => b[i] === m) && JSON.stringify(prev.game?.clk ?? null) !== JSON.stringify(next.game?.clk ?? null)) return 'clock times';
    return 'move list';
  }
  if (step.type === 'ARBITER') {
    if (len(next.events) <= len(prev.events)) return null;
    const ev = next.events![next.events!.length - 1];
    const what = ev?.k === 'illegal' ? 'illegal move' : ev?.k === 'drawOffer' ? 'draw offer' : null;
    return what ? cleanUndoLabel(`${what} · ${sideWord(ev.s, sides)}`) : null;
  }
  if (step.type === 'RESULT') {
    // a knockout match: this result is one game of it
    if (next.ko && len(next.ko.games) > len(prev.ko?.games)) {
      const g = next.ko.games[next.ko.games.length - 1];
      const o = outcome(g?.winner, sides);
      return o ? cleanUndoLabel(`game ${next.ko.games.length} · ${o}${methodWords(g?.method)}${next.ended ? ' · match' : ''}`) : null;
    }
    if (!next.ended || prev.ended) return null;
    const o = outcome(next.winner, sides);
    if (!o) return null;
    let score = '';
    try { score = resultString(next); } catch { score = ''; }
    const sc = score && score !== '–' ? ` ${score}` : '';
    return cleanUndoLabel(next.winner === 'draw' ? `result${sc}${methodWords(next.method) || ' (draw)'}` : `result${sc} · ${o}${methodWords(next.method)}`);
  }
  return null;
}
