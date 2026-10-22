/**
 * Deep wave (ice hockey, rugby, American football, baseball / softball) — a
 * match's live COMMENTARY as a grouped, newest-first feed (the broadcast
 * "play-by-play" panel). PURE (no React Native), so node tests build the same
 * feed the screen draws.
 *
 * A sport derives its lines from its own event log (so a correction or an undo
 * re-derives the feed — nothing is stored): one GROUP per natural unit (a
 * period, a half, a drive, a half-inning), each LINE a plain sentence with the
 * game time and the running score after it. The sport hands the lines over
 * OLDEST first; `newestFirst` turns the feed round (newest group on top, newest
 * line first inside it) and `filterFeed` applies the viewer's chips.
 */

export type FeedSide = 'home' | 'away';

export interface FeedLine {
  /** stable id (the event id; derived rows add a suffix) */
  id: string;
  /** the game time at the left: "12:34", "63'", "Q3 4:12", "1 out" */
  when?: string;
  icon?: string;
  /** one plain sentence: "Rao scores on the power play, assisted by Meera." */
  text: string;
  /** the team the line is about (its colour on the rail) */
  side?: FeedSide;
  /** the running score after this line ("2–1"), on lines that change it */
  score?: string;
  /** a key moment (a score, a card, a turnover, a period end) — drawn bold and
   *  kept by the "Key moments" filter */
  key?: boolean;
  /** filter tags the sport offers as chips ('score', 'pen', 'shot' …) */
  tags?: string[];
}

export interface FeedGroup {
  key: string;
  /** "2nd period", "Top 3rd", "Q2 · Home drive" */
  title: string;
  /** a summary under the title: "Home 2–1 Away · SOG 12–9", "2 runs, 3 hits" */
  sub?: string;
  /** the period / scope the group belongs to (the scope chips filter by it) */
  scope?: number;
  /** the team the whole group is about (a drive, a half-inning at bat) */
  side?: FeedSide;
  lines: FeedLine[];
}

/** "2–1" (an en dash, as broadcast score lines read). */
export const scoreText = (h: number, a: number): string => `${h}–${a}`;

/** Lines in the order they happened → groups in the order they started. A line
 *  whose group key differs from the previous line's starts a new group (a group
 *  key that comes back later — rare — starts another group). */
export function groupLines<T>(items: T[], keyOf: (x: T) => string, make: (first: T, items: T[]) => FeedGroup | null): FeedGroup[] {
  const out: FeedGroup[] = [];
  let cur: T[] = [];
  let k: string | undefined;
  const flush = () => {
    if (!cur.length) return;
    const g = make(cur[0], cur);
    if (g) out.push(g);
    cur = [];
  };
  for (const x of items) {
    const kx = keyOf(x);
    if (k !== undefined && kx !== k) flush();
    k = kx;
    cur.push(x);
  }
  flush();
  return out;
}

/** The feed turned round: newest group first, newest line first in each. */
export function newestFirst(groups: FeedGroup[]): FeedGroup[] {
  return [...groups].reverse().map((g) => ({ ...g, lines: [...g.lines].reverse() }));
}

export interface FeedFilter {
  /** a period / scope number, or 'all' */
  scope?: number | 'all';
  /** keep only lines carrying this tag ('key' = the key moments) */
  tag?: string;
}

/** The viewer's chips applied; groups left empty drop out. */
export function filterFeed(groups: FeedGroup[], f: FeedFilter = {}): FeedGroup[] {
  const scope = f.scope ?? 'all';
  const tag = f.tag && f.tag !== 'all' ? f.tag : undefined;
  return groups
    .filter((g) => scope === 'all' || g.scope === scope)
    .map((g) => (tag ? { ...g, lines: g.lines.filter((l) => (tag === 'key' ? !!l.key : !!l.tags?.includes(tag))) } : g))
    .filter((g) => g.lines.length > 0);
}

/** The scope chips a feed can offer (each scope once, in game order). */
export function feedScopes(groups: FeedGroup[], label: (scope: number) => string): { value: number; label: string }[] {
  const seen: number[] = [];
  for (const g of groups) if (g.scope != null && !seen.includes(g.scope)) seen.push(g.scope);
  return seen.sort((a, b) => a - b).map((value) => ({ value, label: label(value) }));
}

/** The tag chips worth showing: only tags some line carries. */
export function feedTags(groups: FeedGroup[], all: { key: string; label: string }[]): { key: string; label: string }[] {
  const have = new Set(groups.flatMap((g) => g.lines.flatMap((l) => [...(l.tags ?? []), ...(l.key ? ['key'] : [])])));
  return all.filter((t) => have.has(t.key));
}

/** A count with its noun: "1 run", "3 hits" (plural = noun + "s" unless given). */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export const nth = (n: number): string => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** Join names the way commentary reads: "A", "A and B", "A, B and C". */
export function andList(xs: string[]): string {
  const v = xs.filter(Boolean);
  if (v.length <= 1) return v[0] ?? '';
  return `${v.slice(0, -1).join(', ')} and ${v[v.length - 1]}`;
}
