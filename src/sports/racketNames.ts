/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md, founder 2026-10-24) —
 * the name helpers the racket sports (badminton, tennis, padel, pickleball,
 * squash, table tennis) and volleyball share. PURE (node tests load it).
 *
 * Their scoring data (match state, events, payloads) keeps player ids only;
 * these put the viewer's name back when something is shown. An older log that
 * stored a name (`playerName`, a name inside `detail`) still reads exactly as
 * before: the stored name is only the fallback, and with no lookup
 * (`legacyNameOf`) the text is unchanged.
 */
import { FALLBACK_NAME, legacyNameOf, type NameOf } from '../core/playerNames.ts';
import type { LiveEvent } from './liveEvents';

export type { NameOf };
export { legacyNameOf };

/** A roster entry a lookup can learn names from (`Player` or a `{id, name}`). */
export type RosterLike = { id: string; name?: string; fullName?: string };

const clean = (s?: string | null) => (s ?? '').trim();

/**
 * A lookup that also knows the match's own rosters. With the viewer's lookup
 * (`nameOf`, from players_view + the dispute mask) the order is: dispute
 * mask → the viewer's name for the id → the stored legacy name → the roster
 * name → "Player". Without one (a pure caller / a test): the stored legacy
 * name (as before IDs-only) → the roster name by id → "Player".
 */
export function withRosters(nameOf: NameOf | undefined, ...lists: ReadonlyArray<ReadonlyArray<RosterLike> | null | undefined>): NameOf {
  const byId = new Map<string, string>();
  for (const list of lists) {
    for (const p of list ?? []) {
      const n = clean(p.fullName ?? p.name);
      if (p?.id && n && !byId.has(p.id)) byId.set(p.id, n);
    }
  }
  return (id, legacy) => {
    const r = id ? byId.get(id) : undefined;
    const old = clean(legacy);
    if (nameOf) return nameOf(id, old || r);
    return old || r || FALLBACK_NAME;
  };
}

/** Is a player credited (an id, or an older log's stored name)? */
export const isCredited = (id?: string | null, legacy?: string | null): boolean => !!(id || clean(legacy));

/** The credited player's name for this viewer — undefined when nobody is
 *  credited, or when only an id is known and nothing resolves it (the caller
 *  then falls back to its side-level label, never a bare "Player"). */
export function whoName(nameOf: NameOf, id?: string | null, legacy?: string | null): string | undefined {
  if (!isCredited(id, legacy)) return undefined;
  const n = nameOf(id ?? undefined, legacy ?? undefined);
  return n === FALLBACK_NAME && !clean(legacy) ? undefined : n;
}

/** Replace the first ` · `-separated part equal to `old` with `next`. */
function swapPart(detail: string, old: string, next: string): string {
  const parts = detail.split(' · ');
  const i = parts.indexOf(old);
  if (i < 0) return detail;
  parts[i] = next;
  return parts.join(' · ');
}

/** Insert `name` as the `at`-th ` · `-separated part of `detail`. */
function insertPart(detail: string | undefined, at: number, name: string): string {
  const parts = detail ? detail.split(' · ') : [];
  parts.splice(Math.min(at, parts.length), 0, name);
  return parts.join(' · ');
}

/**
 * The detail line of a racket conduct record, penalty point or timeout, with
 * the player's name for this viewer (conduct.ts):
 *   conduct record "<reason> · <name>", penalty point "<reason> · <name> · <score>",
 *   timeout "<name>".
 * New records store the reason / score only (the id rides on `pen` / the
 * event); an older record already carries the name in `detail` — it is
 * swapped for the viewer's name (identical with no lookup).
 */
export function markDetail(e: LiveEvent, nameOf: NameOf = legacyNameOf): string | undefined {
  if (e.kind === 'timeout') {
    // legacy: the name WAS the detail; new: only the id
    return isCredited(e.playerId, e.detail) ? whoName(nameOf, e.playerId, e.detail) ?? e.detail : e.detail;
  }
  const pen = e.pen;
  if (!pen || pen.part) return e.detail;
  const legacy = clean(pen.playerName);
  if (legacy) return e.detail ? swapPart(e.detail, legacy, nameOf(pen.playerId, legacy)) : e.detail;
  const who = pen.playerId ? whoName(nameOf, pen.playerId) : undefined;
  return who ? insertPart(e.detail, pen.reason ? 1 : 0, who) : e.detail;
}

/** The player credited on a point / ace event (its id, or an older log's name). */
export const eventWho = (e: Pick<LiveEvent, 'playerId' | 'playerName'>, nameOf: NameOf = legacyNameOf): string | undefined =>
  whoName(nameOf, e.playerId, e.playerName);
