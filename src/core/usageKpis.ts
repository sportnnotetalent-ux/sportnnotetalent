/** Usage dashboard tiles (founder 2026-11-06, docs/security/breaks/usage-dashboard.md,
 *  usage-filters.md): the server's report (usage_report) → the eight tiles, each
 *  with the period's value, a trend oldest → newest and the change vs the period
 *  before. A rate with no base is "—", never 0% (UD5). Pure. */
import { previousLabel, type Bucket } from './usageFilters.ts';

export type TileKey = 'games' | 'wau' | 'signups' | 'activation' | 'finish' | 'shares' | 'retention' | 'crashfree';
/** `list` = the drill-down this tile opens (usage_people), if any */
export interface Tile { key: TileKey; label: string; value: string; trend: (number | null)[]; delta: string | null; note?: string; list?: 'signups' | 'inactive' | 'games' | 'active' }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
/** A whole-number percent, or null when there's nothing to divide by. */
export const rate = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);
const pct = (r: number | null) => (r === null ? '—' : `${r}%`);

/** usage_report (filters, docs/security/breaks/usage-filters.md): totals for a
 *  period, the period before, and per day / week / month. */
export interface UsageTotals {
  games_scored: number; active_users: number; sign_ups: number; cohort: number; activated: number; started: number; finished: number;
  shares: number; game_views: number; ret_base: number; retained: number; sessions: number; crashed: number; from_links: number; tournaments: number;
}
export interface UsageReportCore {
  from: string; to: string; bucket: Bucket; period: Partial<UsageTotals>; previous: Partial<UsageTotals>;
  buckets: (Partial<UsageTotals> & { start: string })[];
}

/** The eight tiles for a period. `filtered`: a sport or place is chosen — the
 *  tiles that can't be split say so (UF4). */
export function reportTiles(r: UsageReportCore, filtered: boolean): Tile[] {
  const cur = (r.period ?? {}) as UsageTotals, prev = (r.previous ?? {}) as UsageTotals;
  const vs = previousLabel(r.from, r.to);
  const series = (f: (x: UsageTotals) => number | null) => (r.buckets ?? []).map((b) => f(b as UsageTotals));
  const count = (f: (x: UsageTotals) => number) => {
    const d = f(cur) - f(prev);
    return { value: String(f(cur)), trend: series(f), delta: `${d >= 0 ? '+' : ''}${d} ${vs}` };
  };
  const ratio = (f: (x: UsageTotals) => number | null) => {
    const a = f(cur), b = f(prev);
    return { value: pct(a), trend: series(f), delta: a !== null && b !== null ? `${a - b >= 0 ? '+' : ''}${a - b} pts ${vs}` : null };
  };
  const whole = filtered ? 'All sports and places' : undefined;
  return [
    { key: 'games', label: 'Games scored', list: 'games', ...count((x) => num(x.games_scored)) },
    { key: 'wau', label: 'Active users', list: 'active', note: filtered ? 'Signed-in people only (installs have no sport or place)' : 'People and installs that opened the app', ...count((x) => num(x.active_users)) },
    { key: 'signups', label: 'New sign-ups', list: 'signups', ...count((x) => num(x.sign_ups)) },
    { key: 'activation', label: 'Activation', list: 'inactive', note: 'First game within 7 days — of sign-ups who share usage data', ...ratio((x) => rate(num(x.activated), num(x.cohort))) },
    { key: 'finish', label: 'Games finished', note: 'Of games started in the period', ...ratio((x) => rate(num(x.finished), num(x.started))) },
    { key: 'shares', label: 'Links shared → views → sign-ups', value: `${num(cur.shares)} → ${num(cur.game_views)} → ${num(cur.from_links)}`,
      trend: series((x) => num(x.from_links)), delta: null,
      note: [num(cur.sign_ups) > 0 ? `${num(cur.from_links)} of ${num(cur.sign_ups)} sign-ups came from a link` : 'No sign-ups in the period',
        filtered ? 'Links shared: all sports and places' : null].filter(Boolean).join(' · ') },
    { key: 'retention', label: 'Back in week 2', note: 'Sign-ups at least a week old who were active again 7–14 days after joining (who share usage data)', ...ratio((x) => rate(num(x.retained), num(x.ret_base))) },
    { key: 'crashfree', label: 'Crash-free sessions', note: whole, ...ratio((x) => rate(num(x.sessions) - num(x.crashed), num(x.sessions))) },
  ];
}
