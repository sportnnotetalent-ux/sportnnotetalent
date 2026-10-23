/**
 * SD-51 — Handball's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import type { MatchRecordsBlock } from '../matchRecords.ts';
import { clockMinute, goalRecords, type GoalLike } from '../recordHelpers.ts';
import type { HandballState } from './engine.ts';

/** Handball: a hat-trick is routine, so the record is the most goals by one player. */
export function handballMatchRecords(s: HandballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const goals: GoalLike[] = (s.events ?? []).filter((e) => e.type === 'goal').map((e) => ({
    side: e.side, playerId: e.playerId, playerName: e.playerName, at: Number(e.sec) || 0, atText: clockMinute(Number(e.sec) || 0),
  }));
  return goalRecords(s.home, s.away, goals, false);
}
