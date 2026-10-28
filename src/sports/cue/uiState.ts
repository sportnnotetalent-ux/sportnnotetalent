/**
 * Cue sports — small PURE helpers for the screen's local state.
 *
 * A-03 (break list): "Play on" hides the after-foul banner for that foul. The
 * hide remembers the state's `seq`; an undo replays fewer actions, so `seq`
 * drops below it and the hide is forgotten — a new foul recorded at the same
 * place shows its banner again.
 *
 * A-04: the commentary shows at most a page of lines per frame (the newest),
 * with a note for the rest: a junk-filled frame (5,000 rows, the engine's
 * cap) can't freeze a viewer's phone.
 */
import type { FeedItem } from '../gcc/model.ts';

export interface Hidden { key: string; seq: number }
export const hideBanner = (key: string, seq: number): Hidden => ({ key, seq });
/** The hide while the state moves on; null once an undo went below it. */
export const followHidden = (h: Hidden | null, seq: number): Hidden | null => (h && seq >= h.seq ? h : null);

export const FEED_MAX_PER_FRAME = 200;
const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Newest-first items, cut to a page with a note for the older ones. */
export function capFeed(newestFirst: FeedItem[], key: string): FeedItem[] {
  if (newestFirst.length <= FEED_MAX_PER_FRAME) return newestFirst;
  const rest = newestFirst.length - FEED_MAX_PER_FRAME;
  return [
    ...newestFirst.slice(0, FEED_MAX_PER_FRAME),
    { id: `${key}-more`, text: `… ${thousands(rest)} earlier lines not shown (the Stats tab counts them all).` },
  ];
}
