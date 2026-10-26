/**
 * On-demand screens (web performance). Only the tabs, sign-in and legal pages
 * are in the first download; every other screen is its own chunk, fetched when
 * opened — and prefetched in the background shortly after start-up, so
 * navigation stays instant. On native everything is in one bundle anyway.
 * Perf F-15: the sports' plugins are on-demand chunks too; they warm after
 * the screens, one at a time.
 */
import React from 'react';
import { Platform } from 'react-native';
import { isStaleVersionError, reloadForNewVersion } from '../core/staleVersion';
import { prefetchSports } from '../sports/registry';

const loaders: Array<() => Promise<unknown>> = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>): React.LazyExoticComponent<T> {
  loaders.push(load);
  return React.lazy(() => Promise.resolve(load()).catch((e: unknown) => {
    // Opened on an older version whose files are gone → fetch the newest app.
    if (isStaleVersionError(e) && reloadForNewVersion()) return new Promise<never>(() => undefined);
    throw e;
  }));
}

let prefetched = false;
/** Warm every lazy screen's chunk (idempotent; failures are retried on open).
 *  Web only: on native every screen is already in the single bundle, so a
 *  "prefetch" would just evaluate ~80 screen modules at once on the JS thread
 *  right as the user starts tapping (perf audit F-11). On the web it waits for
 *  an idle moment so the chunks don't compete with the first data reads. */
export function prefetchScreens(): void {
  if (prefetched || Platform.OS !== 'web') return;
  prefetched = true;
  if (lowData()) return; // data saver / 2G: fetch each screen only when it's opened
  const ric = typeof globalThis !== 'undefined'
    ? (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => unknown }).requestIdleCallback
    : undefined;
  if (typeof ric === 'function') ric.call(globalThis, warmAll, { timeout: 5000 });
  else warmAll();
}

/** Screens warmed at the same time, with a pause after each. EAS Hosting
 *  answers 429 Too Many Requests after roughly 100 files in a few seconds
 *  (measured 2026-10-26: all at once, and even 4 at a time, hit it). Two at a
 *  time with a pause is about 7 files a second, so ~90 screens take ~15 s in
 *  the background. */
export const WARM_AT_ONCE = 2;
export const WARM_GAP_MS = 250;
/** The host refused a file: stop warming — everything else loads when opened. */
let backedOff = false;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The browser says the person is saving data or on a 2G-class connection. */
function lowData(): boolean {
  const c = (globalThis as { navigator?: { connection?: { saveData?: boolean; effectiveType?: string } } }).navigator?.connection;
  return !!c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType ?? ''));
}

function warmAll(): void {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (!backedOff && next < loaders.length) {
      const load = loaders[next++];
      // Metro's dev loader may hand back a bare thenable — normalise to a Promise.
      try { await Promise.resolve(load()); } catch { backedOff = true; /* retried on open */ }
      await pause(WARM_GAP_MS);
    }
  };
  const workers = Array.from({ length: Math.min(WARM_AT_ONCE, loaders.length) }, () => worker());
  // then the sports (perf F-15), so a match of any sport opens at once later
  void Promise.all(workers).then(() => { if (!backedOff) void prefetchSports(WARM_GAP_MS); });
}
