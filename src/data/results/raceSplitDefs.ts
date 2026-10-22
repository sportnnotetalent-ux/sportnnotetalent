/**
 * Deep wave (timed races) — where intermediate times are read in athletics
 * and cycling, for the optional "Stats to track" captures (lap times, relay
 * leg times, cycling intermediate times). No imports, so swimming.ts'
 * `splitDistances` can dispatch here without a cycle (swimming and crews keep
 * their own tables — SD-94 / SD-99 / SD-100).
 *
 * Athletics (a school timekeeper standing at the finish line with a split
 * watch — World Athletics results publish the same points where a
 * transponder / video system reads them):
 *  - 400 m / 400 m hurdles: the 200 m point;
 *  - 800 m: the bell (400 m);
 *  - 1000 m / 1500 m / 3000 m: every time the field passes the finish line
 *    (the races start 200 m / 300 m / 200 m before it);
 *  - relays: each changeover (the end of each leg) — the leg times follow.
 *  Sprints (60 m – 200 m, sprint hurdles) have none.
 *
 * Cycling (UCI track / road practice; a school velodrome reads them by hand):
 *  - individual / team pursuit: every 1000 m;
 *  - kilo / 500 m time trial: every 250 m lap;
 *  - team sprint: each rider's lap (250 m, 500 m) — the riders' lap times;
 *  - road individual time trial of 10 km or more: one time check at halfway.
 *  The flying 200 m (sprint qualifying) is the mark itself.
 */

const ATH_SPLITS: Record<string, number[]> = {
  'ath.400m': [200],
  'ath.400mh': [200],
  'ath.800m': [400],
  'ath.1000m': [200, 600],
  'ath.1500m': [300, 700, 1100],
  'ath.3000m': [200, 600, 1000, 1400, 1800, 2200, 2600],
  'ath.4x100': [100, 200, 300],
  'ath.4x200': [200, 400, 600],
  'ath.4x400': [400, 800, 1200],
};

/** Athletics: where lap / changeover times are read ([] = none). */
export const athSplitDistances = (key: string): number[] => [...(ATH_SPLITS[key] ?? [])];

/** Cycling: where intermediate times are read ([] = none). */
export function cycSplitDistances(key: string): number[] {
  const m = /^cyc\.(ip|tp|tt|ts|itt)\.(\d+)$/.exec(key);
  if (!m) return [];
  const n = Number(m[2]);
  const every = (step: number, total: number) => { const out: number[] = []; for (let d = step; d < total; d += step) out.push(d); return out; };
  if (m[1] === 'ip' || m[1] === 'tp') return every(1000, n);
  if (m[1] === 'tt' || m[1] === 'ts') return every(250, n);
  // road ITT ('cyc.itt.<km>'): one halfway time check from 10 km
  return n >= 10 ? [Math.round(n / 2) * 1000] : [];
}

/** Athletics / cycling split points for a discipline (crew and swim tables live in their own modules). */
export const raceSplitDistances = (key: string): number[] => (key.startsWith('ath.') ? athSplitDistances(key) : key.startsWith('cyc.') ? cycSplitDistances(key) : []);

/** The race distance in metres for a timed race, or undefined (field events, order events, combined totals). */
export function raceMetres(key: string): number | undefined {
  let m = /^ath\.(\d+)m(h)?$/.exec(key);
  if (m) return Number(m[1]);
  m = /^ath\.4x(\d+)$/.exec(key);
  if (m) return 4 * Number(m[1]);
  m = /^swim\.(4x)?(\d+)[a-z]+$/.exec(key);
  if (m) return (m[1] ? 4 : 1) * Number(m[2]);
  m = /^(row|cs)\.[0-9a-z]+\.(\d+)$/.exec(key);
  if (m) return Number(m[2]);
  m = /^cyc\.(ip|tp|tt|ts)\.(\d+)$/.exec(key);
  if (m) return Number(m[2]);
  m = /^cyc\.itt\.(\d+)$/.exec(key);
  if (m) return Number(m[1]) * 1000;
  return undefined;
}

/** "200 m", "5 km" (whole kilometres from 2 km — a road time check). */
export const distanceLabel = (m: number): string => (m >= 2000 && m % 1000 === 0 ? `${m / 1000} km` : `${m} m`);
