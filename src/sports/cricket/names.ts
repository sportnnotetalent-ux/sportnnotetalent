/**
 * IDs-only scoring — cricket's name seam (docs/privacy/ids-only-scoring.md,
 * founder 2026-10-24).
 *
 * The match state (`matches.state`) and the event log (`match_events`) are
 * public, so cricket stores player IDS only. What used to be stored as a name
 * is now:
 *   - a bare id (crease, bowler, captain, keeper, cards — keyed by id already,
 *     dismissal fielders, field notes, Impact / concussion subs, POTM);
 *   - an id TOKEN inside text the reducer composes — "c {@p7} b {@p2}" on a
 *     batting card, "FOUR! {@p3} finds the boundary" on a timeline event — so
 *     the wording is still decided in one place (the reducer) and only the
 *     names are put in when shown.
 *
 * `withNames(state, nameOf)` is the display copy: every name field filled and
 * every token resolved through the viewer's `NameOf` (players_view: the
 * child's circle sees full names, everyone else initials, an open dispute
 * "X"). Readers keep reading `card.name`, `strikerName`, `r.out.name`,
 * `e.detail`… on that copy. It is NEVER dispatched or persisted.
 *
 * Legacy (pre IDs-only) logs carry names in their payloads; the reducer
 * replays them exactly as before (names copied into the state), and
 * `withNames` falls back to those stored names (`nameOf(id, legacyName)`).
 *
 * Pure and JSX-free (node tests load it — note the `.ts` imports).
 */
import { FALLBACK_NAME, legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import type { ScoreAction } from '../types';
import type { BallRec, CricketState } from './engine.ts';

export type { NameOf };

/** A player inside stored text, by id: "c {@p7} b {@p2}". */
export const pidTok = (id: string): string => `{@${id}}`;
const TOKEN = /\{@([^{}]+)\}/g;

/** Put the names into stored text ("c {@p7} b {@p2}" → "c Veer b Ishaan").
 *  Text without a token (every legacy string) is returned as it is. */
export function fillNames(text: string, nameOf: NameOf = legacyNameOf): string {
  return text.includes('{@') ? text.replace(TOKEN, (_m, id: string) => nameOf(id)) : text;
}

/** The ids a stored text names (its tokens), in order. */
export function tokenIds(text: string | undefined): string[] {
  const out: string[] = [];
  (text ?? '').replace(TOKEN, (_m, id: string) => { out.push(id); return ''; });
  return out;
}

/** Every payload key that carried a player's name before IDs-only. */
export const NAME_KEYS = ['strikerName', 'bowlerName', 'name', 'fielderName', 'fielder2Name', 'newBatName', 'inName', 'outName'] as const;

/** Was this action recorded before IDs-only (its payload carries a name)? The
 *  reducer replays such an action exactly as it always did; an action without
 *  one is IDs-only: no name is read from it or copied from the state. */
export const carriesNames = (p: Record<string, unknown> | null | undefined): boolean =>
  !!p && NAME_KEYS.some((k) => typeof p[k] === 'string');

/** The same action with every player name removed (payload name keys, and the
 *  `playerName` of its credits) — for actions the app rewrites (the #06 ball
 *  editor), so a correction never writes a name into the public log. */
export function stripNames(a: ScoreAction): ScoreAction {
  const out: ScoreAction = { ...a };
  const noName = <T extends { playerName?: string }>(x: T): T => {
    const { playerName: _n, ...rest } = x;
    return rest as T;
  };
  if (a.payload) {
    const p: Record<string, unknown> = { ...a.payload };
    for (const k of NAME_KEYS) delete p[k];
    if (p._attr2 && typeof p._attr2 === 'object') p._attr2 = noName(p._attr2 as { playerName?: string });
    out.payload = p;
  }
  if (a.attribution) out.attribution = noName(a.attribution);
  if (a.attribution2) out.attribution2 = noName(a.attribution2);
  return out;
}

const NAMED = Symbol('cricket.withNames');
const cache = new WeakMap<object, { nameOf: NameOf; out: object }>();

/** Has this state already been through `withNames`? */
export const isNamed = (s: unknown): boolean => !!s && typeof s === 'object' && (s as Record<symbol, unknown>)[NAMED] === true;

/**
 * The display copy of a cricket state: names filled in by id for this viewer,
 * tokens resolved. A legacy stored name is the fallback for an id the viewer
 * can't resolve (as `nameOf` does); a legacy blank name stays blank (so the
 * readers' own "Batter" / "the batter" fallbacks still apply). Cached per
 * (state, nameOf); a state that is already named is returned as it is.
 */
export function withNames<T extends Partial<CricketState>>(s: T, nameOf: NameOf = legacyNameOf): T {
  if (!s || typeof s !== 'object' || isNamed(s)) return s;
  const hit = cache.get(s);
  if (hit && hit.nameOf === nameOf) return hit.out as T;

  const nm = (id: string | undefined, legacy: string | undefined): string | undefined => {
    if (!id) return legacy;
    if (legacy === undefined) return nameOf(id); // IDs-only data
    const n = nameOf(id, legacy);
    return n === FALLBACK_NAME && !legacy.trim() ? legacy : n;
  };
  const txt = (t: string | undefined) => (t && t.includes('{@') ? fillNames(t, nameOf) : t);

  const out: Partial<CricketState> = { ...s };
  if (s.strikerId) out.strikerName = nm(s.strikerId, s.strikerName);
  if (s.nonStrikerId) out.nonStrikerName = nm(s.nonStrikerId, s.nonStrikerName);
  if (s.bowlerId) out.bowlerName = nm(s.bowlerId, s.bowlerName);
  if (s.batting) {
    out.batting = Object.fromEntries(Object.entries(s.batting).map(([id, c]) => [id, {
      ...c, name: nm(id, c.name) ?? '', ...(c.dismissal ? { dismissal: txt(c.dismissal) } : {}),
    }]));
  }
  if (s.bowling) out.bowling = Object.fromEntries(Object.entries(s.bowling).map(([id, c]) => [id, { ...c, name: nm(id, c.name) ?? '' }]));
  const role = (r: CricketState['captains'] | undefined) => (r
    ? Object.fromEntries(Object.entries(r).map(([sd, p]) => [sd, p ? { ...p, name: nm(p.id, p.name) ?? '' } : p]))
    : r);
  if (s.captains) out.captains = role(s.captains);
  if (s.keepers) out.keepers = role(s.keepers);
  if (s.impactUsed) {
    out.impactUsed = Object.fromEntries(Object.entries(s.impactUsed).map(([sd, u]) => [sd, u
      ? { ...u, inName: nm(u.inId, u.inName) ?? '', outName: nm(u.outId, u.outName) ?? '' } : u]));
  }
  if (s.dismissals) {
    out.dismissals = s.dismissals.map((d) => ({
      ...d,
      ...(d.fielderId ? { fielderName: nm(d.fielderId, d.fielderName) } : {}),
      ...(d.fielder2Id ? { fielder2Name: nm(d.fielder2Id, d.fielder2Name) } : {}),
    }));
  }
  if (s.fieldNotes) out.fieldNotes = s.fieldNotes.map((n) => ({ ...n, fielderName: nm(n.fielderId, n.fielderName) }));
  if (s.events) {
    out.events = s.events.map((e) => {
      const label = txt(e.label) ?? e.label;
      const detail = txt(e.detail);
      const playerName = e.playerId ? nm(e.playerId, e.playerName) : e.playerName;
      return label === e.label && detail === e.detail && playerName === e.playerName ? e : { ...e, label, detail, playerName };
    });
  }
  if (s.log) {
    out.log = s.log.map((r): BallRec => {
      const bowlerName = r.bowlerId ? nm(r.bowlerId, r.bowlerName) : r.bowlerName;
      const outName = r.out ? nm(r.out.id, r.out.name) ?? '' : undefined;
      if (bowlerName === r.bowlerName && (!r.out || outName === r.out.name)) return r;
      return { ...r, bowlerName, ...(r.out ? { out: { ...r.out, name: outName ?? '' } } : {}) };
    });
  }
  if (s.potmId) out.potm = nm(s.potmId, s.potm);
  if (s.superOver?.state) out.superOver = { ...s.superOver, state: withNames(s.superOver.state, nameOf) };

  Object.defineProperty(out, NAMED, { value: true, enumerable: false });
  cache.set(s, { nameOf, out });
  return out as T;
}
