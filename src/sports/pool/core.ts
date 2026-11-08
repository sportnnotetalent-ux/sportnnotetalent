/**
 * Pool — every PURE part of the plugin in one object: index.tsx spreads it
 * (adding the screens), and the node tests drive whole matches through the
 * very same functions. No React Native here.
 *
 * No live RULE settings (founder 2026-10-28): the game, the race and the sets
 * are pinned by the match's first event (match.ts, the pin; break #26), so a
 * later format change can't re-score a match in play. The only live card is
 * Stats to track (defaults-on DOK5): it never changes a score.
 */
import type { SportPlugin } from '../types';
import { cnt, isComplete, lineScore, result, scoreLine, summary } from './engine.ts';
import { creditOf, poolInit, poolReducer, POOL_LIVE_SETTINGS, type PoolMatch } from './match.ts';
import { poolStatTotals } from './totals.ts';
import { poolMatchRecords } from './records.ts';
import { poolUndoLabel } from './undo.ts';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** SD-17 — what the standings' tie-breakers read: racks won over the whole
 *  match ("games"), and sets won in a sets match. */
export function poolUnits(s: PoolMatch): { games: { home: number; away: number }; sets?: { home: number; away: number } } | null {
  if (!isObj(s) || !Array.isArray(s.racks)) return null;
  const games = { home: 0, away: 0 };
  for (const r of s.racks) if (isObj(r) && (r.winner === 'home' || r.winner === 'away')) games[r.winner] += 1;
  return cnt(s.setsToWin) > 1 ? { games, sets: { home: cnt(s.setsWon?.home), away: cnt(s.setsWon?.away) } } : { games };
}

/** Parity #13 — the players who have played (they can't be dropped from the
 *  matchday squad): the ids the log credited. Pool credits no stat live, so
 *  the default (a non-zero stat line) would say nobody until the match ends. */
export function poolInvolved(s: PoolMatch): string[] {
  const ids = creditOf(s).ids;
  return [...ids.home, ...ids.away];
}

export const POOL_CORE = {
  createInitialState: poolInit,
  reducer: poolReducer as SportPlugin<PoolMatch>['reducer'],
  isComplete: (s: PoolMatch) => isComplete(s),
  result: (s: PoolMatch) => result(s),
  summary: (s: PoolMatch) => summary(s),
  scoreLine: (s: PoolMatch, perspective?: 'home' | 'away') => scoreLine(s, perspective),
  // a race counts racks (RACKS on the scoreboard); a sets match counts sets
  lineScore: (s: PoolMatch) => { const ls = lineScore(s); return ls && ls.unit === 'game' ? { ...ls, unit: 'rack' as const } : ls; },
  standingsUnits: poolUnits,
  statTotals: poolStatTotals,
  statTotalsNeedsPlayers: true,
  involvedPlayerIds: poolInvolved,
  matchRecords: poolMatchRecords,
  undoLabel: poolUndoLabel,
  // founder 2026-10-28: the race and sets lock once the match starts (like the
  // game), so there's no rule to change during play; only what is tracked
  liveSettings: POOL_LIVE_SETTINGS,
} satisfies Partial<SportPlugin<PoolMatch>>;
