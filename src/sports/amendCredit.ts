/** IDs-only scoring (docs/privacy/ids-only-scoring.md): re-credit a logged
 *  action to another player in a post-match correction (parity #05) — by id
 *  only; any name the record stored is dropped (reducers resolve by id).
 *  Pure (node tests load it). */
import type { ScoreAction } from './types.ts';

export function recreditAction(base: ScoreAction, playerId: string): ScoreAction {
  const payload = { ...(base.payload ?? {}) } as Record<string, unknown>;
  delete payload.playerName;
  // a payload `name` is a player's name — except a chess opening's
  if (typeof payload.name === 'string' && !('opening' in payload) && base.type !== 'OPENING') delete payload.name;
  if ('playerId' in payload) payload.playerId = playerId;
  if ('pid' in payload) payload.pid = playerId; // basketball
  const attr = base.attribution ? { ...base.attribution } : undefined;
  if (attr) delete (attr as { playerName?: string }).playerName;
  return { ...base, payload, ...(attr ? { attribution: { ...attr, playerId } } : {}) };
}
