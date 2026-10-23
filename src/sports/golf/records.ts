/**
 * SD-51 — Golf match play's `matchRecords(state)` hook: the record candidates of one
 * finished match, from its final state only (set on the plugin; collected for
 * tests in ../matchRecordHooks.ts). Perf F-15: its own module, so the sport's
 * lazily loaded chunk carries only its own hook. PURE (no React Native).
 */
import { block, type MatchRecordItem, type MatchRecordsBlock, type Side } from '../matchRecords.ts';
import { matchState as golfMatchState } from './engine.ts';
import type { GolfMatchState } from './match.ts';
import { matchHole } from './matchStrokes.ts';

/**
 * SD-137a — golf match play: the winning margin ("5&4"; holes up, then holes
 * to spare — a conceded or halved match has none), each side's holes won,
 * and birdies or better when the hole scores were entered (with handicap
 * strokes set up). Stroke play is scored on the round screens and keeps its
 * own records.
 */
export function golfMatchRecords(s: GolfMatchState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.holes)) return null;
  const items: MatchRecordItem[] = [];
  const m = golfMatchState(s.holes, s.regulation, s.extraHoles, s.firstHole ?? 1);
  if (!s.conceded && (m.winner === 'home' || m.winner === 'away') && m.result) {
    items.push({ type: 'biggestMargin', value: Math.abs(m.up) * 100 + m.remaining, text: m.result, side: m.winner });
  }
  const counted = s.holes.slice(0, m.played);
  for (const side of ['home', 'away'] as Side[]) {
    const n = counted.filter((w) => w === side).length;
    if (n > 0) items.push({ type: 'holesWon', value: n, text: `${n} hole${n === 1 ? '' : 's'}`, side });
  }
  const ms = s.strokes;
  if (s.scores && ms?.holes?.length) {
    for (const side of ['home', 'away'] as Side[]) {
      const n = s.scores.slice(0, m.played).filter((sc, i) => sc && sc[side] < matchHole(ms, i).hole.par).length;
      if (n > 0) items.push({ type: 'birdies', value: n, text: `${n} birdie${n === 1 ? '' : 's'} or better`, side });
    }
  }
  return block(items);
}
