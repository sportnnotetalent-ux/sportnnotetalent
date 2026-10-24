/**
 * IDs-only scoring — basketball's name seam (docs/privacy/ids-only-scoring.md,
 * founder 2026-10-24). PURE (node tests load it).
 *
 * The match state (`matches.state`) and the event log (`match_events`) are
 * public, so basketball stores player IDS only:
 *   - a play credits its player by `pid` (the scorer's action carries it in
 *     `payload.pid` and `attribution.playerId`, never a name);
 *   - a sub names the player going off by `pid` and the one coming on by
 *     `secondId` (the key football's sub uses, so the shared readers — e.g.
 *     appearances — see it);
 *   - a foul's fouled player by `drawnPid`;
 *   - the five set on court by id (`state.court`).
 * Names are put back when something is shown, through the viewer's `NameOf`
 * (players_view: the child's circle sees full names, everyone else initials,
 * an open dispute "X").
 *
 * Older logs (before IDs-only) stored names: `playerName` / `onName` /
 * `drawn` on the events, `onCourt` (names) and the public name → id map
 * `ids` on the state. The reducer still replays them exactly as before;
 * readers use `nameOf(id, storedName)`, so the stored name is only the
 * fallback, and with no lookup (`legacyNameOf`) they read as they always did.
 */
import { legacyNameOf, type NameOf } from '../../core/playerNames.ts';
import type { BBEvent } from './events.ts';

export type { NameOf };
export { legacyNameOf };

/** The part of the state an older log keeps its name → id map in. */
type Ids = { ids?: Record<string, string> };
type Credited = Pick<BBEvent, 'pid' | 'playerName'>;

/**
 * Every key an older basketball log carried a player's name in — for the
 * server safety net and the data clean-up (close-out):
 *   attribution.playerName; payload.offName / onName (SUB), payload.drawn
 *   (FOUL), payload.ids (a name → id map), payload.home / away on a
 *   SET_LINEUP (arrays of names); state.onCourt, state.ids and
 *   events[].playerName / onName / drawn.
 */
export const BB_PAYLOAD_NAME_KEYS = ['offName', 'onName', 'drawn', 'ids'] as const;
export const BB_EVENT_NAME_KEYS = ['playerName', 'onName', 'drawn'] as const;

/** Does a play credit a player (an id, or an older log's name)? */
export const hasPlayer = (e: Credited): boolean => !!(e.pid || e.playerName);

/** The id a play credits: its own `pid` (IDs-only and SD-122 plays), else
 *  an older log's name looked up in that log's `ids` map. */
export const playId = (s: Ids, e: Credited): string | undefined =>
  e.pid || (e.playerName ? s.ids?.[e.playerName] : undefined);

/** A sub's incoming player id (`secondId`, else an older log's name via `ids`). */
export const onId = (s: Ids, e: Pick<BBEvent, 'secondId' | 'onName'>): string | undefined =>
  e.secondId || (e.onName ? s.ids?.[e.onName] : undefined);

/** A foul's fouled player id (`drawnPid`, else an older log's name via `ids`). */
export const drawnId = (s: Ids, e: Pick<BBEvent, 'drawnPid' | 'drawn'>): string | undefined =>
  e.drawnPid || (e.drawn ? s.ids?.[e.drawn] : undefined);

/** Two plays by the same player (or both team plays): older plays by the
 *  name they stored, exactly as they always matched; IDs-only plays by id. */
export const samePlayer = (a: Credited, b: Credited): boolean =>
  (a.playerName || b.playerName ? a.playerName === b.playerName : a.pid === b.pid);

/** The player a play credits, for this viewer (undefined = a team play). */
export function playerOf(s: Ids, e: Credited, nameOf: NameOf = legacyNameOf): string | undefined {
  return hasPlayer(e) ? nameOf(playId(s, e), e.playerName) : undefined;
}

/** A sub's incoming player, for this viewer (undefined = not named). */
export function onPlayerOf(s: Ids, e: Pick<BBEvent, 'secondId' | 'onName'>, nameOf: NameOf = legacyNameOf): string | undefined {
  return e.secondId || e.onName ? nameOf(onId(s, e), e.onName) : undefined;
}

/** Who drew a foul, for this viewer (undefined = not named). */
export function drawnByOf(s: Ids, e: Pick<BBEvent, 'drawnPid' | 'drawn'>, nameOf: NameOf = legacyNameOf): string | undefined {
  return e.drawnPid || e.drawn ? nameOf(drawnId(s, e), e.drawn) : undefined;
}
