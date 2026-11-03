/**
 * Undo labels batch (2026-11-03) — what Undo removes in carrom (it keeps
 * boards, not timeline events): "board to Rahul +4 with the Queen (17-9)",
 * "penalty board · +3 to Priya (3-0)", "board to Rahul +6 · game 1 (25-19)",
 * "game 2 awarded to Priya", "board correction", "break pick". Built from the
 * newest step only (state before / after) in the commentary's words. IDs-only:
 * the board's credited players by id through `nameOf` (an older log's stored
 * name only as the fallback), the side otherwise. Null = nothing to name (the
 * bar says a plain "Undo"). PURE.
 */
import { legacyNameOf, whoName, type NameOf } from '../racketNames.ts';
import { cleanUndoLabel, sideWord, type UndoSides, type UndoStep } from '../undoLabel.ts';
import { creditedPoints, type CarromState } from './engine.ts';

const QUIET: Record<string, string> = {
  FIRST_BREAK: 'break pick', SET_TRACK: 'stats-to-track setting', EDIT_LOG: 'board correction', STAT_ADJUST: 'stat correction',
};

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export function carromUndoLabel(step: UndoStep, nameOf: NameOf = legacyNameOf, sides?: UndoSides): string | null {
  if (!step || typeof step.type !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(QUIET, step.type)) return QUIET[step.type];
  const prev = step.prev as CarromState | null, next = step.next as CarromState | null;
  if (!prev || !next) return null;
  const gameDone = len(next.games) > len(prev.games);
  const lastGame = gameDone ? next.games[next.games.length - 1] : undefined;
  const tail = gameDone && Array.isArray(lastGame)
    ? `${next.ended ? ' · match' : ` · game ${next.games.length}`} (${lastGame[0]}-${lastGame[1]})`
    : next.current ? ` (${next.current.home}-${next.current.away})` : '';
  if (step.type === 'AWARD_GAME') {
    const a = Array.isArray(next.gameAwards) ? next.gameAwards[next.gameAwards.length - 1] : undefined;
    if (!gameDone || !a || len(next.gameAwards) <= len(prev.gameAwards)) return null;
    return cleanUndoLabel(`game ${a.game} awarded to ${sideWord(a.winner, sides)}`);
  }
  if (step.type !== 'BOARD' || len(next.boards) <= len(prev.boards)) return null;
  const b = next.boards[next.boards.length - 1];
  if (!b || (b.winner !== 'home' && b.winner !== 'away')) return null;
  let pts: number | undefined;
  try { pts = creditedPoints(next)[next.boards.length - 1]; } catch { pts = undefined; }
  if (typeof pts !== 'number' || !Number.isFinite(pts)) pts = Number.isFinite(b.points) ? b.points : undefined;
  const by = Array.isArray(next.boardBy) ? next.boardBy[next.boards.length - 1] : undefined;
  const names = (Array.isArray(by) ? by : []).map((c) => whoName(nameOf, c?.id, c?.name)).filter((n): n is string => !!n);
  const who = names.length ? names.join(' & ') : sideWord(b.winner, sides);
  const plus = pts != null ? ` +${pts}` : '';
  const head = b.penalty ? `penalty board · ${pts != null ? `+${pts} ` : ''}to ${sideWord(b.winner, sides)}`
    : `board to ${who}${plus}${b.queen ? ' with the Queen' : ''}${b.slam ? ` · ${b.slam} slam` : ''}`;
  return cleanUndoLabel(`${head}${tail}`);
}
