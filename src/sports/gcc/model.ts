/**
 * Deep wave (golf · chess · carrom) — PURE data shapes for the commentary feed
 * (CommentaryFeed.tsx) and the broadcast stats panel (CompareTable.tsx).
 *
 * Commentary: groups in the sport's natural unit (a hole, a move, a game of
 * boards), newest first; each item a plain sentence, the running score after
 * it and the time it was stamped. Derived from the event log / card by the
 * sport builders, so a correction re-derives the feed.
 *
 * Stats panel: the data shape of a broadcast stats
 * panel (ATP "Match Stats" style): categories of rows, each row a figure for
 * the home side and the away side (or one player and a comparison column).
 * PURE: the sport builders (carrom/matchStats.ts, chess/gameStats.ts,
 * golf/roundSheet.ts) fill it; CompareTable.tsx draws it. A row that wasn't
 * tracked is left out by the builder — never shown as a false 0.
 */
export interface FeedItem {
  id: string;
  /** the sentence */
  text: string;
  /** a second line of detail ("Fairway hit · 1 putt") */
  sub?: string;
  /** the running score after this event ("Asha 2 UP", "Rahul leads 17–9") */
  score?: string;
  /** when it was stamped (ms); absent on older events */
  at?: number;
  /** colours the left rule */
  side?: 'home' | 'away';
  icon?: string;
  /** a highlight (an ace, a slam, a mate) */
  big?: boolean;
}

export interface FeedGroup {
  key: string;
  title: string;
  subtitle?: string;
  items: FeedItem[];
}

export interface CompareRow {
  key: string;
  label: string;
  home: string;
  away: string;
  /** numeric values for the bars (absent = no bar) */
  hv?: number;
  av?: number;
  /** which way is better (bars highlight the better side); default higher */
  better?: 'higher' | 'lower';
  /** a small note under the label ("over 6 boards", "tracked from board 4") */
  note?: string;
}

export interface CompareCategory {
  id: string;
  title: string;
  rows: CompareRow[];
}

/** "3/5 (60%)" — made of attempts with a percentage; "–" with no attempts. */
export function ofPct(made: number, att: number): string {
  return att ? `${made}/${att} (${Math.round((made / att) * 100)}%)` : '–';
}

/** A percentage, "–" over nothing. */
export function pct(num: number, den: number): string {
  return den ? `${Math.round((num / den) * 100)}%` : '–';
}

/** Only categories with rows. */
export const nonEmpty = (cats: CompareCategory[]): CompareCategory[] => cats.filter((c) => c.rows.length);

/** A counting row: label + both values (bars on). */
export const countRow = (key: string, label: string, h: number, a: number, better: 'higher' | 'lower' = 'higher', note?: string): CompareRow =>
  ({ key, label, home: String(h), away: String(a), hv: h, av: a, better, ...(note ? { note } : {}) });
