/** Loading placeholders (reference-video B6) show only after a short delay, so
 *  fast loads never flicker, and only while something is actually loading.
 *  When loading ends (data, empty or an error) they're gone. */
export const SKELETON_DELAY_MS = 150;

export function skeletonVisible(o: { loading: boolean; elapsedMs: number; delayMs?: number }): boolean {
  return o.loading && o.elapsedMs >= (o.delayMs ?? SKELETON_DELAY_MS);
}
