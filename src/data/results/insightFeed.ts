/**
 * Deep wave — the results commentary shared by weightlifting, shooting and
 * archery: one item per attempt / series / end / shot, oldest first while it
 * is built, shown newest first. Every item is DERIVED from the stored
 * results (never stored itself), so a correction rewrites the commentary.
 * PURE, no imports.
 */

/** How an item reads: a good lift / a perfect series, a miss / an
 *  elimination, a change of leader, a medal line, or plain information. */
export type FeedTone = 'good' | 'bad' | 'lead' | 'medal' | 'info';

export interface FeedItem {
  /** stable within one build of the feed */
  key: string;
  /** the short tag in front ("Sn 2", "S4", "E7", "Shot 14", "QF") */
  tag?: string;
  text: string;
  /** a second, quieter line (every shooter's shot, the arrows of an end) */
  detail?: string;
  tone?: FeedTone;
}

/** Collects items in the order they happened; `newestFirst()` for the screen. */
export class FeedBuilder {
  private items: FeedItem[] = [];
  push(text: string, opts: Omit<FeedItem, 'key' | 'text'> = {}): void {
    this.items.push({ key: `f${this.items.length}`, text, ...opts });
  }
  get length(): number { return this.items.length; }
  newestFirst(): FeedItem[] { return [...this.items].reverse(); }
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st … */
export const ordinalOf = (n: number): string => {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suf}`;
};

export const MEDAL_ICON: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Shared places for a list already sorted best first: equal keys share the
 * place ("=2"). `same` says whether two neighbours are level.
 */
export function placesOf<T>(sorted: T[], same: (a: T, b: T) => boolean): { place: number; tie: boolean }[] {
  const out: { place: number; tie: boolean }[] = [];
  sorted.forEach((x, i) => {
    const place = i > 0 && same(sorted[i - 1], x) ? out[i - 1].place : i + 1;
    out.push({ place, tie: false });
  });
  for (let i = 0; i < out.length; i++) out[i].tie = out.some((o, j) => j !== i && o.place === out[i].place);
  return out;
}
