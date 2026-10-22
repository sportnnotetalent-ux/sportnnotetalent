/**
 * Deep wave (ice hockey, rugby, American football, baseball / softball) — the
 * broadcast "Match stats" sheet: team-vs-team rows grouped in categories
 * (Scoring, Power play, Set piece, Passing …), each row two display texts and
 * the numbers behind them for the bar. PURE (no React Native).
 *
 * D8 / the founder's rule: a sport adds a row ONLY for what the match tracked —
 * a stat it didn't capture has no row (never a false 0). Helpers return null
 * for a row with nothing behind it, and `section` / `sheet` drop the empties.
 */

export type SheetSide = 'home' | 'away';

export interface SheetRow {
  key: string;
  label: string;
  home: string;
  away: string;
  /** the numbers that size the bar and pick the leader */
  h: number;
  a: number;
  /** fewer is better (penalties, turnovers, errors) */
  lowerBetter?: boolean;
  /** no leader / bar (a split like "5 on 4 time", or a text-only row) */
  plain?: boolean;
}

export interface SheetSection {
  key: string;
  title: string;
  rows: SheetRow[];
  /** a short line under the section ("Possession from the scorer's taps") */
  note?: string;
}

export interface StatSheet {
  sections: SheetSection[];
}

type Opt = { lowerBetter?: boolean; plain?: boolean };
const opts = (o?: Opt) => ({ ...(o?.lowerBetter ? { lowerBetter: true } : {}), ...(o?.plain ? { plain: true } : {}) });

/** A plain count row: "12 – 9". */
export function countRow(key: string, label: string, h: number, a: number, o?: Opt): SheetRow {
  return { key, label, home: String(h), away: String(a), h, a, ...opts(o) };
}

/** A percentage text ("60%"), '–' when there's nothing to divide. */
export function pctText(n: number, d: number, dp = 0): string {
  return d > 0 ? `${((n / d) * 100).toFixed(dp)}%` : '–';
}

/** Made / attempted with the rate: "3/5 (60%)" — the bar compares the RATE.
 *  null when neither side attempted any (nothing to show). */
export function madeRow(key: string, label: string, hm: number, ha: number, am: number, aa: number, o?: Opt & { dp?: number; noPct?: boolean }): SheetRow | null {
  if (ha <= 0 && aa <= 0) return null;
  const t = (m: number, x: number) => (o?.noPct || x <= 0 ? `${m}/${x}` : `${m}/${x} (${pctText(m, x, o?.dp ?? 0)})`);
  const r = (m: number, x: number) => (x > 0 ? m / x : 0);
  return { key, label, home: t(hm, ha), away: t(am, aa), h: r(hm, ha), a: r(am, aa), ...opts(o) };
}

/** A rate row from two fractions ("45%"); null when neither side has a denominator. */
export function rateRow(key: string, label: string, hn: number, hd: number, an: number, ad: number, o?: Opt & { dp?: number }): SheetRow | null {
  if (hd <= 0 && ad <= 0) return null;
  return { key, label, home: pctText(hn, hd, o?.dp ?? 0), away: pctText(an, ad, o?.dp ?? 0), h: hd > 0 ? hn / hd : 0, a: ad > 0 ? an / ad : 0, ...opts(o) };
}

/** A share row that splits 100 % between the sides (possession, territory):
 *  null when no time was recorded. */
export function shareRow(key: string, label: string, hSec: number, aSec: number): SheetRow | null {
  const t = hSec + aSec;
  if (t <= 0) return null;
  const hp = Math.round((hSec / t) * 100);
  return { key, label, home: `${hp}%`, away: `${100 - hp}%`, h: hp, a: 100 - hp };
}

/** "4:05" — minutes and seconds. */
export const clockText = (sec: number): string => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

/** A time row ("4:05 – 2:10"), null when both are 0 and `keepZero` isn't set. */
export function timeRow(key: string, label: string, hSec: number, aSec: number, o?: Opt & { keepZero?: boolean }): SheetRow | null {
  if (!o?.keepZero && hSec <= 0 && aSec <= 0) return null;
  return { key, label, home: clockText(hSec), away: clockText(aSec), h: hSec, a: aSec, ...opts(o) };
}

/** A decimal row ("5.4 – 3.9"), null when neither side has a value. */
export function decRow(key: string, label: string, h: number | undefined, a: number | undefined, dp = 1, o?: Opt): SheetRow | null {
  if (h === undefined && a === undefined) return null;
  return { key, label, home: h === undefined ? '–' : h.toFixed(dp), away: a === undefined ? '–' : a.toFixed(dp), h: h ?? 0, a: a ?? 0, ...opts(o) };
}

/** A text-only row (no bar): "Own 25 – Own 31". */
export function textRow(key: string, label: string, home: string, away: string): SheetRow {
  return { key, label, home, away, h: 0, a: 0, plain: true };
}

/** A section with its non-empty rows; null when nothing is left. */
export function section(key: string, title: string, rows: (SheetRow | null | undefined | false | 0 | '')[], note?: string): SheetSection | null {
  const r = rows.filter((x): x is SheetRow => !!x);
  return r.length ? { key, title, rows: r, ...(note ? { note } : {}) } : null;
}

/** The sheet with its non-empty sections. */
export function sheet(sections: (SheetSection | null | undefined | false | 0 | '')[]): StatSheet {
  return { sections: sections.filter((x): x is SheetSection => !!x && x.rows.length > 0) };
}

/** Which side leads a row (none for a plain row or a level one). */
export function rowLeader(r: Pick<SheetRow, 'h' | 'a' | 'lowerBetter' | 'plain'>): SheetSide | null {
  if (r.plain || r.h === r.a) return null;
  const homeAhead = r.lowerBetter ? r.h < r.a : r.h > r.a;
  return homeAhead ? 'home' : 'away';
}

/** Each side's share of the bar (0–1); 0.5 / 0.5 when both are 0. */
export function rowShares(r: Pick<SheetRow, 'h' | 'a'>): { home: number; away: number } {
  const h = Math.max(0, r.h), a = Math.max(0, r.a);
  return h + a > 0 ? { home: h / (h + a), away: a / (h + a) } : { home: 0.5, away: 0.5 };
}

/** The category chips: "All" plus each section (only with two or more). */
export function sheetCategories(sh: StatSheet): { key: string; label: string }[] {
  return sh.sections.length >= 2 ? [{ key: 'all', label: 'All' }, ...sh.sections.map((s) => ({ key: s.key, label: s.title }))] : [];
}

/** The sheet narrowed to one category ('all' = every section). */
export function pickCategory(sh: StatSheet, cat: string): StatSheet {
  if (!cat || cat === 'all') return sh;
  const one = sh.sections.filter((s) => s.key === cat);
  return one.length ? { sections: one } : sh;
}

/** One row read aloud (screen readers): "Shots on goal: Home 12, Away 9". */
export const rowSpoken = (r: SheetRow, homeName: string, awayName: string): string => `${r.label}: ${homeName} ${r.home}, ${awayName} ${r.away}`;
