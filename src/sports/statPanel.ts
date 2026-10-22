/**
 * Deep wave — the broadcast "Team stats" panel model (FIBA LiveStats / NBA
 * team stats, Champion Data netball, the ATP match-stats panel): rows of a
 * home-vs-away comparison in CATEGORIES (Shooting, Scoring, …) for a period
 * scope. A sport builds the rows from its log (rows it can't know are left
 * out, never shown as 0); <CategoryStatsPanel> draws them with period and
 * category chips. PURE (no React Native).
 */

export interface PanelRow {
  key: string;
  label: string;
  home: string;
  away: string;
  /** the numbers behind the text (bars, the better side) */
  h: number;
  a: number;
  /** a small line under the values ("O 4 · D 12") */
  sub?: { home?: string; away?: string };
  /** fewer is better (turnovers, fouls) — the better side is highlighted */
  lowerBetter?: boolean;
  /** draw no bar (a time, a ratio of different things) */
  noBar?: boolean;
}

export interface PanelCategory {
  key: string;
  title: string;
  rows: PanelRow[];
}

export interface StatPanelData {
  categories: PanelCategory[];
  /** coverage notes ("Shot zones charted on 30 of 42 field goals") */
  notes: string[];
}

/** Percent, rounded; null when nothing was attempted. */
export const pctOf = (made: number, att: number): number | null => (att > 0 ? Math.round((made / att) * 100) : null);
/** "12-25 (48%)" — made-attempted with the percent ("0-0" → "–"). */
export const maText = (made: number, att: number): string => (att > 0 ? `${made}-${att} (${pctOf(made, att)}%)` : '–');
/** "24 (31%)" — a count with its share of a total. */
export const shareText = (n: number, of: number): string => (of > 0 ? `${n} (${Math.round((n / of) * 100)}%)` : String(n));

/** A plain count row. */
export const countRow = (key: string, label: string, h: number, a: number, extra: Partial<PanelRow> = {}): PanelRow =>
  ({ key, label, home: String(h), away: String(a), h, a, ...extra });
/** A made-attempted row: the bar compares the percentages. */
export const maRow = (key: string, label: string, hm: number, ha: number, am: number, aa: number): PanelRow =>
  ({ key, label, home: maText(hm, ha), away: maText(am, aa), h: pctOf(hm, ha) ?? 0, a: pctOf(am, aa) ?? 0 });

/** The better side of a row (null = level / no numbers). */
export function betterSide(r: Pick<PanelRow, 'h' | 'a' | 'lowerBetter'>): 'home' | 'away' | null {
  if (r.h === r.a) return null;
  const homeAhead = r.lowerBetter ? r.h < r.a : r.h > r.a;
  return homeAhead ? 'home' : 'away';
}

/** Drop empty categories (every row removed). */
export const compactPanel = (d: StatPanelData): StatPanelData => ({ ...d, categories: d.categories.filter((c) => c.rows.length > 0) });
