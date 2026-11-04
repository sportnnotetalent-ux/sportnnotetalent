/** Usage dashboard v1 (founder 2026-11-06, docs/security/breaks/usage-dashboard.md):
 *  the server's weekly rows (usage_dashboard) → the eight tiles, each with this
 *  week's value, a trend oldest → newest and the change vs last week. A rate
 *  with no base is "—", never 0% (UD5). Pure. */
export interface UsageWeek {
  week: string; games_scored: number; active_users: number; sign_ups: number; cohort: number; activated: number;
  started: number; finished: number; shares: number; game_views: number; prev_signups: number; retained: number;
  sessions: number; crashed: number;
  /** sign-ups that came from a shared link (record_signup_source) */
  from_links?: number;
}

export type TileKey = 'games' | 'wau' | 'signups' | 'activation' | 'finish' | 'shares' | 'retention' | 'crashfree';
/** `list` = the drill-down this tile opens (usage_people), if any */
export interface Tile { key: TileKey; label: string; value: string; trend: (number | null)[]; delta: string | null; note?: string; list?: 'signups' | 'inactive' | 'games' | 'active' }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
/** A whole-number percent, or null when there's nothing to divide by. */
export const rate = (part: number, whole: number): number | null => (whole > 0 ? Math.round((100 * part) / whole) : null);
const pct = (r: number | null) => (r === null ? '—' : `${r}%`);

export function usageTiles(weeks: readonly Partial<UsageWeek>[]): Tile[] {
  const w = weeks.map((x) => ({ ...x }) as UsageWeek);
  const [cur, prev] = [w[0] ?? ({} as UsageWeek), w[1]];
  const series = (f: (x: UsageWeek) => number | null) => [...w].reverse().map(f);
  const count = (f: (x: UsageWeek) => number) => {
    const d = prev ? f(cur) - f(prev) : null;
    return { value: String(f(cur)), trend: series(f), delta: d === null ? null : `${d >= 0 ? '+' : ''}${d} vs last week` };
  };
  const ratio = (f: (x: UsageWeek) => number | null) => {
    const a = f(cur), b = prev ? f(prev) : null;
    return { value: pct(a), trend: series(f), delta: a !== null && b !== null ? `${a - b >= 0 ? '+' : ''}${a - b} pts vs last week` : null };
  };
  return [
    { key: 'games', label: 'Games scored', list: 'games', ...count((x) => num(x.games_scored)) },
    { key: 'wau', label: 'Weekly active users', list: 'active', note: 'People and installs that opened the app', ...count((x) => num(x.active_users)) },
    { key: 'signups', label: 'New sign-ups', list: 'signups', ...count((x) => num(x.sign_ups)) },
    { key: 'activation', label: 'Activation', list: 'inactive', note: 'First game within 7 days — of sign-ups who share usage data', ...ratio((x) => rate(num(x.activated), num(x.cohort))) },
    { key: 'finish', label: 'Games finished', note: 'Of games started this week', ...ratio((x) => rate(num(x.finished), num(x.started))) },
    { key: 'shares', label: 'Links shared → views → sign-ups', value: `${num(cur.shares)} → ${num(cur.game_views)} → ${num(cur.from_links)}`,
      trend: series((x) => num(x.from_links)), delta: null,
      note: num(cur.sign_ups) > 0 ? `${num(cur.from_links)} of ${num(cur.sign_ups)} sign-ups came from a link` : 'No sign-ups this week' },
    { key: 'retention', label: '1-week retention', note: 'Last week’s sign-ups active this week (who share usage data)', ...ratio((x) => rate(num(x.retained), num(x.prev_signups))) },
    { key: 'crashfree', label: 'Crash-free sessions', ...ratio((x) => { const r = rate(num(x.sessions) - num(x.crashed), num(x.sessions)); return r; }) },
  ];
}
