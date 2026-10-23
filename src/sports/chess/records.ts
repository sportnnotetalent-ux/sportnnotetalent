/**
 * SD-51 — Chess's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, type MatchRecordsBlock } from '../matchRecords.ts';
import { METHOD_LABEL, isForfeit, isDoubleForfeit, type ChessState } from './engine.ts';

/** Chess: the winner's move count, when the scorer entered one (a forfeit has none). */
export function chessMatchRecords(s: ChessState): MatchRecordsBlock | null {
  if (!s || !s.ended || (s.winner !== 'home' && s.winner !== 'away')) return null;
  if (!s.moves || s.moves <= 0 || isForfeit(s.method) || isDoubleForfeit(s.method)) return null;
  const how = s.method ? METHOD_LABEL[s.method] : undefined;
  return block([{ type: 'fastestWin', value: s.moves, text: `${s.moves} moves`, side: s.winner, ...(how ? { note: how } : {}) }]);
}
