/**
 * IDs-only scoring — the invasion sports' name seam (docs/privacy/
 * ids-only-scoring.md, founder 2026-10-24): football, hockey, handball, ice
 * hockey, netball, rugby union, rugby league and American football.
 *
 * `matches.state` (saved after every tap) and `match_events` (payload,
 * attribution) are public, logged out included, so these sports store player
 * IDS only — on events (`playerId`, `secondId`, `thirdId`, `gkId`), shoot-out
 * kicks (`playerId` / `takerId`, `keeperId`), the XI / GK / position stamps
 * (`{ id }`) — never a name, nor text with a name in it.
 *
 * `withNames(state, nameOf)` is the DISPLAY copy: every name field next to an
 * id filled in through the viewer's `NameOf` (players_view: the child's circle
 * sees full names, everyone else initials, an open dispute "X"). Readers keep
 * reading `e.playerName`, `kick.keeperName`, `xi.gk.name`… on that copy. It is
 * NEVER dispatched or persisted, and nothing that writes an action may copy a
 * name out of it (write ids).
 *
 * Legacy (pre IDs-only) logs carry names beside (or instead of) the ids; the
 * reducers replay them exactly as before (names copied into the state), and
 * `withNames` uses the stored name only as the fallback for an id the viewer
 * can't resolve (`nameOf(id, legacyName)`), or as is when there is no id.
 *
 * Pure and JSX-free (node tests load it — note the `.ts` imports).
 */
import { FALLBACK_NAME, legacyNameOf, type NameOf } from '../../core/playerNames.ts';

export type { NameOf };
export { legacyNameOf };

/** The [id key, name key] pairs a stored row (an event, a stat, a kick) can
 *  carry. The name key is legacy only: new logs write the id alone. */
export const ID_NAME_PAIRS = [
  ['playerId', 'playerName'], ['secondId', 'secondName'], ['thirdId', 'thirdName'],
  ['gkId', 'gkName'], ['takerId', 'takerName'], ['keeperId', 'keeperName'],
] as const;

/**
 * Every key that carried a player's name in these sports' actions before
 * IDs-only — the server safety net (`append_match_event`) can drop them from
 * `attribution` / `payload`:
 *   - attribution / attribution2 / payload._attr2: `playerName`;
 *   - payload: `playerName`, `secondName` (football foul victim), `scorerName`
 *     (own goal), `offName` / `onName` (SUB), `takerName` / `keeperName`
 *     (shoot-outs), `p1Name` (American football), and `name` on the XI / GK /
 *     netball position stamps (`players[].name`, `keepers[].name`, `gk.name`,
 *     `pos.<P>.name`, a GK / POS action's `payload.name`).
 * NOT a player's name (kept): football `officialName` / handball, netball,
 * rugby `official` — a team official's typed role label ("Head coach").
 */
export const NAME_KEYS = ['playerName', 'secondName', 'thirdName', 'gkName', 'scorerName', 'offName', 'onName', 'takerName', 'keeperName', 'p1Name'] as const;

const clean = (s: unknown): string => (typeof s === 'string' ? s.trim() : '');

/**
 * The viewer's name for a player stored by id (`legacy` = the name an older
 * log stored beside it). Undefined when nobody is named, or when only an id is
 * known and the viewer's lookup can't resolve it — the reader then falls back
 * to its own team-level wording, never a bare "Player".
 */
export function nameFor(nameOf: NameOf, id: string | null | undefined, legacy?: string | null): string | undefined {
  const old = clean(legacy);
  if (!id) return old || undefined;
  const n = nameOf(id, old || undefined);
  return n === FALLBACK_NAME && !old ? undefined : n;
}

/** A stored row (event / stat / kick) with each name filled in by its id. */
export function nameRow<T extends object>(row: T, nameOf: NameOf = legacyNameOf): T {
  if (!row || typeof row !== 'object') return row;
  const r = row as Record<string, unknown>;
  let out: Record<string, unknown> | undefined;
  for (const [idKey, nameKey] of ID_NAME_PAIRS) {
    const id = r[idKey];
    if (typeof id !== 'string' || !id) continue;
    const n = nameFor(nameOf, id, r[nameKey] as string | undefined);
    if (n === undefined || n === r[nameKey]) continue;
    out = out ?? { ...r };
    out[nameKey] = n;
  }
  return (out ?? row) as T;
}

/** A stamp entry `{ id, name? }` (XI / keepers / netball positions) with its name. */
export function nameWho<T extends { id?: string; name?: string }>(w: T, nameOf: NameOf = legacyNameOf): T {
  if (!w || typeof w !== 'object' || !w.id) return w;
  const n = nameFor(nameOf, w.id, w.name) ?? '';
  return n === w.name ? w : { ...w, name: n };
}

type Stamp = { gk?: { id: string; name?: string }; players?: { id: string; name?: string }[]; keepers?: { id: string; name?: string }[]; pos?: Record<string, { id: string; name?: string } | undefined> };
const nameStamp = (st: Stamp | undefined, nameOf: NameOf): Stamp | undefined => {
  if (!st || typeof st !== 'object') return st;
  const out: Stamp = { ...st };
  if (st.gk) out.gk = nameWho(st.gk, nameOf);
  if (Array.isArray(st.players)) out.players = st.players.map((p) => nameWho(p, nameOf));
  if (Array.isArray(st.keepers)) out.keepers = st.keepers.map((p) => nameWho(p, nameOf));
  if (st.pos && typeof st.pos === 'object') out.pos = Object.fromEntries(Object.entries(st.pos).map(([k, w]) => [k, w ? nameWho(w, nameOf) : w]));
  return out;
};

const NAMED = Symbol('invasion.withNames');
const cache = new WeakMap<object, { nameOf: NameOf; out: object }>();

/** Has this state already been through `withNames`? */
export const isNamed = (s: unknown): boolean => !!s && typeof s === 'object' && (s as Record<symbol, unknown>)[NAMED] === true;

/**
 * The display copy of an invasion-sport state: the names on its events,
 * stats, shoot-out kicks and XI stamps filled in by id for this viewer.
 * Cached per (state, nameOf); a state already named is returned as it is.
 * Without a lookup (`legacyNameOf`) a legacy state reads exactly as stored.
 */
export function withNames<S>(s: S, nameOf: NameOf = legacyNameOf): S {
  if (!s || typeof s !== 'object' || isNamed(s)) return s;
  const hit = cache.get(s as object);
  if (hit && hit.nameOf === nameOf) return hit.out as S;
  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  const rows = (xs: unknown) => (Array.isArray(xs) ? xs.map((x) => (x && typeof x === 'object' ? nameRow(x as object, nameOf) : x)) : xs);
  if (Array.isArray(src.events)) out.events = rows(src.events);
  if (Array.isArray(src.stats)) out.stats = rows(src.stats);
  const so = src.shootout as Record<string, unknown> | null | undefined;
  if (so && typeof so === 'object') {
    out.shootout = { ...so, home: rows(so.home), away: rows(so.away), ...(Array.isArray(so.kicks) ? { kicks: rows(so.kicks) } : {}) };
  }
  const xi = src.xi as { home?: Stamp; away?: Stamp } | undefined;
  if (xi && typeof xi === 'object') {
    out.xi = { ...xi, ...(xi.home ? { home: nameStamp(xi.home, nameOf) } : {}), ...(xi.away ? { away: nameStamp(xi.away, nameOf) } : {}) };
  }
  Object.defineProperty(out, NAMED, { value: true, enumerable: false });
  cache.set(s as object, { nameOf, out });
  return out as S;
}

/** Does this action carry a player's name anywhere a legacy writer put one
 *  (a NAME_KEYS key, or a `{ id, name }` stamp entry) — in the payload (incl.
 *  `_attr2`), attribution or attribution2? For guards and tests. */
export function carriesNames(a: { payload?: Record<string, unknown>; attribution?: object; attribution2?: object }): boolean {
  const has = (o: unknown): boolean => {
    if (!o || typeof o !== 'object') return false;
    if (Array.isArray(o)) return o.some(has);
    const r = o as Record<string, unknown>;
    if (NAME_KEYS.some((k) => typeof r[k] === 'string' && r[k])) return true;
    if (typeof r.id === 'string' && typeof r.name === 'string' && r.name) return true;
    return Object.values(r).some((v) => v && typeof v === 'object' && has(v));
  };
  return has(a.payload) || has(a.attribution) || has(a.attribution2);
}
