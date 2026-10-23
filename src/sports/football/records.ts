/**
 * SD-51 — Football's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import type { MatchRecordsBlock } from '../matchRecords.ts';
import { goalRecords, type GoalLike } from '../recordHelpers.ts';
import { minuteText, type FootballState } from './engine.ts';

/** Football: biggest win, most goals, the match's first goal (own goals don't
 *  count as anyone's), hat-tricks. Shootout kicks are never goals here. */
export function footballMatchRecords(s: FootballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const f = { halfMinutes: s.halfMinutes || 45, etMinutes: s.etMinutes || 15 };
  const goals: GoalLike[] = (s.events ?? []).filter((e) => e.type === 'goal').map((e) => ({
    side: e.side, playerId: e.playerId, playerName: e.playerName, at: Number(e.minute) || 0, atText: minuteText(Number(e.minute) || 0, e.half, f),
  }));
  return goalRecords(s.home, s.away, goals, true);
}
