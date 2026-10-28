/**
 * Pool — every PURE part of the plugin in one object: index.tsx spreads it
 * (adding the screens), and the node tests drive whole matches through the
 * very same functions. No React Native here.
 *
 * Live settings (parity #14, config mode): the race and the sets only. The
 * game is not offered once the match exists — and a log keeps the game it
 * was scored under anyway (match.ts, the pin; break #26). A race or sets
 * change patches the match format and the log is replayed with it: the hint
 * says so before the tap, and the controls say so after (`formatNote`).
 */
import type { LiveSettings, SportPlugin } from '../types';
import { cnt, isComplete, lineScore, result, scoreLine, summary } from './engine.ts';
import { creditOf, poolInit, poolReducer, type PoolMatch } from './match.ts';
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

export const POOL_LIVE_SETTINGS: LiveSettings<PoolMatch> = {
  title: '🎱 Race and sets',
  hint: 'The game (8-, 9- or 10-ball) is fixed once the match has started. Changing the race or the sets re-scores the whole match from rack 1: a set or the match can end, or open again.',
  mode: 'config',
  fields: [
    { key: 'raceTo', label: 'Race to (racks)', type: 'number', default: 5, min: 1, max: 99, step: 1 },
    {
      key: 'setsToWin', label: 'Sets', type: 'choice', default: 1,
      options: [{ value: 1, label: 'One race' }, { value: 2, label: 'Best of 3 sets' }, { value: 3, label: 'Best of 5 sets' }],
    },
  ],
  read: (s) => ({ raceTo: cnt(s?.raceTo) || 5, setsToWin: cnt(s?.setsToWin) || 1 }),
};

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
  liveSettings: POOL_LIVE_SETTINGS,
} satisfies Partial<SportPlugin<PoolMatch>>;
