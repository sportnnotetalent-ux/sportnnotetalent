/**
 * Deep wave (volleyball-kabaddi, "net & raid") — the shapes the commentary
 * feed and the broadcast match-stats card share. PURE (no React Native), so
 * node tests load it.
 *
 *  - FeedGroup / FeedEntry: a live commentary in the sport's natural unit
 *    (volleyball: set, kabaddi: half), each entry a plain sentence with the
 *    running score after it, newest first. Built from the event log by each
 *    sport's commentary.ts, so a correction re-derives it.
 *  - CmpCat / CmpRow: a team-vs-team comparison grouped by category (FIVB VIS
 *    "Attack / Serve / Reception …", PKL match centre "Raids / Tackles …"),
 *    each row knowing which way is better.
 */

export type Side = 'home' | 'away';

export interface FeedEntry {
  /** stable within the feed */
  id: string;
  /** left column: the elapsed minute ("23′") or a marker ("GR", "SO") */
  stamp?: string;
  icon: string;
  /** the sentence: "Point Italy — kill by Michieletto" */
  text: string;
  /** a smaller second line (rally detail, players on the mat …) */
  detail?: string;
  /** the running score after it, home first ("18-14") */
  score?: string;
  /** the side it's about (the scorer's colour) */
  side?: Side;
  /** broadcast tags: "SET POINT", "ALL OUT", "SUPER RAID" … */
  tags?: string[];
  /** a key moment — the "Key moments" filter keeps only these */
  key?: boolean;
}

export interface FeedGroup {
  id: string;
  /** "Set 2", "2nd half" */
  title: string;
  /** "Italy 25-21 · 26 min" */
  sub?: string;
  /** newest first */
  entries: FeedEntry[];
}

/** Only the key moments (groups left empty are dropped). */
export function keyMoments(groups: FeedGroup[]): FeedGroup[] {
  return groups.map((g) => ({ ...g, entries: g.entries.filter((e) => e.key) })).filter((g) => g.entries.length > 0);
}

/** Elapsed minutes from the first stamp: "23′" (null without both stamps). */
export function elapsedStamp(at: number | undefined, t0: number | null | undefined): string | undefined {
  if (typeof at !== 'number' || typeof t0 !== 'number' || at < t0) return undefined;
  return `${Math.floor((at - t0) / 60000)}′`;
}

/** "1 point" / "3 points". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Join names: "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  const xs = names.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/* ---------------------------------------------------------------- compare -- */

export interface CmpRow {
  key: string;
  label: string;
  home: string;
  away: string;
  /** the numbers behind the text (bars, the leader); 0 when none */
  h: number;
  a: number;
  /** which way is better (errors: lower). Default higher. */
  better?: 'higher' | 'lower';
  /** an indented "of which" row under the one before it */
  sub?: boolean;
}

export interface CmpCat {
  id: string;
  title: string;
  rows: CmpRow[];
  /** a footnote under the category ("from 34 of 52 rallies described") */
  note?: string;
}

const DASH = '–';
const pctText = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : DASH);

/** A count row. */
export const countRow = (key: string, label: string, h: number, a: number, opts: { better?: 'higher' | 'lower'; sub?: boolean } = {}): CmpRow =>
  ({ key, label, home: String(h), away: String(a), h, a, ...opts });

/** A made / attempted row with its %: "12/20 (60%)" — the bar is the %. */
export function ratioRow(key: string, label: string, nh: number, dh: number, na: number, da: number, opts: { better?: 'higher' | 'lower'; sub?: boolean } = {}): CmpRow {
  const t = (n: number, d: number) => (d > 0 ? `${n}/${d} (${pctText(n, d)})` : DASH);
  return { key, label, home: t(nh, dh), away: t(na, da), h: dh > 0 ? (100 * nh) / dh : 0, a: da > 0 ? (100 * na) / da : 0, ...opts };
}

/** A plain % row ("45%") from a numerator / denominator per side. */
export function pctRow(key: string, label: string, nh: number, dh: number, na: number, da: number, opts: { better?: 'higher' | 'lower'; sub?: boolean; signed?: boolean } = {}): CmpRow {
  const { signed, ...rest } = opts;
  const t = (n: number, d: number) => (d > 0 ? `${signed && n > 0 ? '+' : ''}${Math.round((100 * n) / d)}%` : DASH);
  return { key, label, home: t(nh, dh), away: t(na, da), h: dh > 0 ? (100 * nh) / dh : 0, a: da > 0 ? (100 * na) / da : 0, ...rest };
}

/** Which side leads a row (its better value), or null when level / empty. */
export function rowLeader(r: Pick<CmpRow, 'h' | 'a' | 'better' | 'home' | 'away'>): Side | null {
  if (r.h === r.a) return null;
  if (r.home === DASH || r.away === DASH) return null;
  const hi = r.h > r.a ? 'home' : 'away';
  return r.better === 'lower' ? (hi === 'home' ? 'away' : 'home') : hi;
}

/** Bar shares (0–1) for a row; 0.5 / 0.5 when both are 0. */
export function rowShares(r: Pick<CmpRow, 'h' | 'a'>): { home: number; away: number } {
  const h = Math.max(0, r.h), a = Math.max(0, r.a);
  return h + a > 0 ? { home: h / (h + a), away: a / (h + a) } : { home: 0.5, away: 0.5 };
}
