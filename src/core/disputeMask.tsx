/** Player names on the live match screen.
 *
 *  1. Dispute masking: when a participation dispute is open, the disputed
 *     player's identity is hidden as "X" wherever it shows for that match —
 *     timeline, summary/scorecard, etc.
 *  2. IDs-only scoring (docs/privacy/ids-only-scoring.md): `people` maps player
 *     ids to the names THIS viewer may see (loaded through players_view: full
 *     names for the child's circle, initials for everyone else), so a surface
 *     shows a player by id, never by a name copied into public match data.
 *
 *  Surfaces opt in by calling `useMask()`; with no provider everything falls
 *  back to the stored name (as before).
 *
 *  Cross-match aggregates (profiles, leaderboards) don't use this — they instead
 *  hold disputed stat lines OUT entirely until resolved (see getAllStatLines). */
import React, { createContext, useContext, useMemo } from 'react';
import { makeNameOf, MASK, type NameOf } from './playerNames';

export { MASK };

export interface MaskValue {
  /** player ids with an open dispute on the current match (id-keyed surfaces) */
  ids: Set<string>;
  /** disputed player names (for masking names embedded in free-text/event strings) */
  names: Set<string>;
  /** id → the name this viewer may see (IDs-only scoring); optional */
  people?: ReadonlyMap<string, string>;
}

const EMPTY_PEOPLE: ReadonlyMap<string, string> = new Map();
const MaskContext = createContext<MaskValue>({ ids: new Set(), names: new Set() });
export const DisputeMaskProvider = MaskContext.Provider;
/** The same provider under the name IDs-only surfaces use. */
export const PlayerNamesProvider = MaskContext.Provider;

export function useMask() {
  const v = useContext(MaskContext);
  const nameOf: NameOf = useMemo(() => makeNameOf(v.people ?? EMPTY_PEOPLE, v), [v]);
  return {
    active: v.ids.size > 0 || v.names.size > 0,
    /** a player's name for this viewer by id (stored `name` only as the fallback) */
    nameOf,
    /** mask a name resolved from a player id (now also resolves it, see nameOf) */
    byId: (id: string | undefined, name: string) => nameOf(id, name),
    /** mask a bare player name */
    name: (name?: string) => (name && v.names.has(name) ? MASK : name ?? ''),
    /** mask any disputed name occurring inside a free-text string (e.g. "3-2 · Aarav") */
    text: (s?: string) => {
      if (!s || v.names.size === 0) return s ?? '';
      let out = s;
      v.names.forEach((n) => { if (n) out = out.split(n).join(MASK); });
      return out;
    },
  };
}

/** Convenience for surfaces that only need the lookup. */
export function usePlayerNames(): NameOf {
  return useMask().nameOf;
}
