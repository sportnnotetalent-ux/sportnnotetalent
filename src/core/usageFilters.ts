/** Usage dashboard filters (founder 2026-11-04, docs/security/breaks/usage-filters.md):
 *  a period (preset or from–to, IST days, inclusive), sports and places (both
 *  multi-select). Pure. */

export type PeriodPreset = 'today' | '7d' | 'week' | '30d' | 'month' | '3m' | 'custom';
export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 days' }, { key: 'week', label: 'This week' },
  { key: '30d', label: 'Last 30 days' }, { key: 'month', label: 'This month' }, { key: '3m', label: 'Last 3 months' },
  { key: 'custom', label: 'Custom' },
];
export const MAX_DAYS = 400;
export type Bucket = 'day' | 'week' | 'month';

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(toMs(iso) + n * DAY);
const validIso = (s: string) => ISO.test(s) && Number.isFinite(toMs(s)) && toIso(toMs(s)) === s;

/** Today's date in India (UF9). */
export const todayIST = (now: Date = new Date()): string => toIso(now.getTime() + 330 * 60_000);

/** A preset → inclusive from / to. Custom uses the dates given. */
export function periodRange(preset: PeriodPreset, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  switch (preset) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case 'week': return { from: addDays(today, -((new Date(toMs(today)).getUTCDay() + 6) % 7)), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case '3m': return { from: addDays(today, -89), to: today };
    case 'custom': return custom ?? { from: today, to: today };
  }
}

/** Why a range can't be asked for, or null (UF2 — the server checks again). */
export function rangeProblem(from: string, to: string, today: string): string | null {
  if (!validIso(from) || !validIso(to)) return 'Pick a start and an end date.';
  if (from > to) return 'The start date must be before the end date.';
  if (to > today) return 'The end date can’t be in the future.';
  if (daysIn(from, to) > MAX_DAYS) return `Pick a period of up to ${MAX_DAYS} days.`;
  return null;
}

export const daysIn = (from: string, to: string): number => Math.round((toMs(to) - toMs(from)) / DAY) + 1;

/** The trend's step — matches the server (usage_report). */
export const bucketFor = (from: string, to: string): Bucket => {
  const n = daysIn(from, to);
  return n <= 31 ? 'day' : n <= 182 ? 'week' : 'month';
};

/** What the change is measured against (UF7): the same number of days just before. */
export const previousLabel = (from: string, to: string): string => {
  const n = daysIn(from, to);
  return n === 1 ? 'vs yesterday' : `vs previous ${n} days`;
};

export const toggleIn = <T,>(list: readonly T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

const some = (names: readonly string[], all: string) =>
  names.length === 0 ? all : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
/** "Pool, Snooker +2 · Hyderabad" — the chosen filters on one line. */
export const filterSummary = (sports: readonly string[], places: readonly string[]): string =>
  `${some(sports, 'All sports')} · ${some(places, 'All places')}`;
