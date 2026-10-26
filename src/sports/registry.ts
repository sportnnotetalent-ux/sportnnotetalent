/**
 * Sport registry — the ONLY place the core couples to concrete sports.
 * To add a sport: implement a SportPlugin, give it a `<sport>/meta.ts`, and add
 * it to sportMeta.ts and both sportLoaders files. Done.
 *
 * Perf F-15: the plugins load ON DEMAND. Lists, pickers and forms read the
 * light meta (sportMeta.ts: name, icon, format options) and never need this.
 * A sport's full plugin (engine, scorer controls, match tabs) is loaded the
 * first time it is used:
 *  - phone app: `getSport` requires it synchronously on first use
 *    (sportLoaders.native.ts) — exactly as before, minus evaluating all of
 *    them at start-up;
 *  - web: each sport is its own chunk. The data layer loads the sports of the
 *    matches it returns before handing them over (`loadSports`), so screens
 *    find them ready; a screen that renders a sport nothing loaded yet
 *    suspends (the screen's spinner, like a lazy screen's chunk) until it is.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';
import { setStandingsPointsProvider, setStandingsRateProvider, setStandingsScoreProvider, setStandingsUnitsProvider } from '../data/standings';
import { STAT_SCHEMAS } from './statSchemas';
import { isStaleVersionError, reloadForNewVersion } from '../core/staleVersion';
import { SPORT_META, MARKET_NAMED_SPORTS, withMarketName } from './sportMeta';
import { importSport, requireSport, LOADS_SYNC } from './sportLoaders';

// The light side, re-exported for code that already imports it from here.
export { SPORT_LIST, getSportMeta, participantMode, type ParticipantMode } from './sportMeta';

const loaded = new Map<SportId, SportPlugin<any>>();
const pending = new Map<SportId, Promise<SportPlugin<any>>>();
const failed = new Map<SportId, unknown>();

const known = (id: string): id is SportId => Object.prototype.hasOwnProperty.call(SPORT_META, id);

/** A freshly loaded plugin joins the registry: its stat schema (SD-15, from
 *  statSchemas.ts) and — football, hockey, rugby, ice hockey, American
 *  football — its name read through the viewer's market (SD-153). */
function adopt(id: SportId, plugin: SportPlugin<any>): SportPlugin<any> {
  const had = loaded.get(id);
  if (had) return had;
  plugin.statSchema = STAT_SCHEMAS[id] as SportPlugin<any>['statSchema'];
  if (MARKET_NAMED_SPORTS.includes(id)) withMarketName(id, plugin, plugin.name);
  loaded.set(id, plugin);
  return plugin;
}

// Let the (RN-free) standings engine compute NRR without importing this registry
// — it can't, or the pure test runner would pull in React Native. We inject the
// rate lookup lazily on first use (not at module load, which is fragile under
// circular imports / hot-reload) — by the time a table is ranked, every module
// is fully initialised.
let rateWired = false;
function wireStandings(): void {
  if (rateWired) return;
  rateWired = true;
  // A match closed by hand (parity #04) is charged its full overs when the
  // sport says so (cricket "count in NRR, all overs").
  setStandingsRateProvider((sport, state, manual) => {
    if (state == null) return null;
    const p = getSport(sport);
    return (manual && p.manualRate ? p.manualRate(state) : p.standingsRate?.(state)) ?? null;
  });
  setStandingsPointsProvider((sport, state) => (state == null ? null : getSport(sport).standingsPoints?.(state) ?? null));
  setStandingsScoreProvider((sport, state) => (state == null ? null : getSport(sport).standingsScore?.(state) ?? null));
  // SD-17: sets / games / rally points / fair play for the standings rule kit.
  setStandingsUnitsProvider((sport, state) => (state == null ? null : getSport(sport)?.standingsUnits?.(state) ?? null));
}

/** Load a sport's full plugin (resolves at once when it is already loaded, and
 *  for an id the app doesn't know — with undefined, as `getSport` returns). */
export function loadSport(id: SportId): Promise<SportPlugin<any>> {
  wireStandings();
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);
  if (!known(id)) return Promise.resolve(undefined as never);
  const sync = requireSport(id);
  if (sync) return Promise.resolve(adopt(id, sync));
  let p = pending.get(id);
  if (!p) {
    p = importSport(id).then(
      (plugin) => { pending.delete(id); failed.delete(id); return adopt(id, plugin); },
      (e: unknown) => {
        pending.delete(id);
        // Opened on an older version whose files are gone → fetch the newest app.
        if (isStaleVersionError(e) && reloadForNewVersion()) return new Promise<never>(() => undefined);
        failed.set(id, e);
        throw e;
      },
    );
    pending.set(id, p);
  }
  return p;
}

/** Load every sport in `ids` (unknown / empty ids skipped). Never rejects: a
 *  sport that fails to load is retried by the screen that renders it. */
export function loadSports(ids: Iterable<string | null | undefined>): Promise<void> {
  const want = new Set<SportId>();
  for (const id of ids) if (id && known(id) && !loaded.has(id)) want.add(id);
  if (!want.size) return Promise.resolve();
  return Promise.all([...want].map((id) => loadSport(id).catch(() => undefined))).then(() => undefined);
}

/** The sport's full plugin. Phone app: loaded on first use. Web: when it isn't
 *  loaded yet, this SUSPENDS the rendering screen (throws the load promise to
 *  the nearest <Suspense>, the screen spinner) — so outside rendering, `await
 *  loadSport(id)` first (the data layer does for the matches it returns). An
 *  unknown id gives undefined, as before. */
export function getSport(id: SportId): SportPlugin<any> {
  wireStandings();
  const hit = loaded.get(id);
  if (hit) return hit;
  if (!known(id)) return undefined as never;
  const sync = requireSport(id);
  if (sync) return adopt(id, sync);
  const err = failed.get(id);
  if (err !== undefined) {
    // surface the failure once (the error screen); the next render retries
    failed.delete(id);
    throw err;
  }
  throw loadSport(id);
}

/** In a `try` around code that reads a plugin during rendering: let a
 *  suspension (a sport still loading) through instead of swallowing it. */
export function rethrowIfLoading(e: unknown): void {
  if (e && typeof (e as PromiseLike<unknown>).then === 'function') throw e;
}

let prefetched = false;
/** Web: warm every sport's chunk in the background (after the screens — see
 *  lazyScreens.ts), one at a time with `gapMs` between them, so opening a
 *  match of any sport later is instant. Stops at the first failure (e.g. the
 *  host saying "too many requests"); those sports load when opened. The phone
 *  app has them in its bundle already. */
export async function prefetchSports(gapMs = 0): Promise<void> {
  if (prefetched || LOADS_SYNC) return;
  prefetched = true;
  for (const id of Object.keys(SPORT_META) as SportId[]) {
    try { await loadSport(id); } catch { return; }
    if (gapMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, gapMs));
  }
}
