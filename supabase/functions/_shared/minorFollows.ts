/**
 * Legal L15 (migration protect_minors) — follower alerts about a player under 18
 * (or with no date of birth) go only to followers still in that player's circle:
 * teammates, coaches, tournament / org people and their guardian. A follow made
 * before the migration, or by someone who has since left the team, is kept but
 * gets no match-time / venue / result pushes.
 *
 * Pure apart from the one RPC call (no Deno / Node APIs), so the app's node tests
 * can load it too.
 */
import { fetchAllPages } from './paging.ts';

export interface FollowPair { follower_id: string; target_id: string }

type RpcError = { code?: string; message?: string };
/** The rpc call's builder: ordered and ranged, so the pairs are read page by page. */
type RpcQuery = {
  order: (col: string) => RpcQuery;
  range: (from: number, to: number) => PromiseLike<{ data: FollowPair[] | null; error: RpcError | null }>;
};
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => RpcQuery };

/** Before the migration the function doesn't exist → keep every follow (as before). */
const isMissingFunction = (e: { code?: string; message?: string }) =>
  ['PGRST202', '42883'].includes(e.code ?? '') || /allowed_player_follows/i.test(e.message ?? '') && /not find|does not exist/i.test(e.message ?? '');

/** The (follower, player) follows of these players that may get alerts; null =
 *  no filter available (pre-migration). Any other error → none (fail closed). */
export async function allowedPlayerFollows(client: RpcClient, playerIds: string[]): Promise<FollowPair[] | null> {
  if (!playerIds.length) return [];
  // Paged: a well-followed player's pairs pass PostgREST's 1,000-row cap, and a
  // missing page would silently drop followers' alerts.
  const { data, error } = await fetchAllPages((from, to) => client.rpc('allowed_player_follows', { p_player_ids: playerIds })
    .order('target_id').order('follower_id').range(from, to));
  if (error) return isMissingFunction(error) ? null : [];
  return data ?? [];
}

/** Keep only allowed follows (all of them when `allowed` is null). */
export function keepAllowedFollows<T extends { follower_id: string; target_id?: string }>(rows: T[], allowed: FollowPair[] | null): T[] {
  if (!allowed) return rows;
  const ok = new Set(allowed.map((a) => `${a.follower_id}:${a.target_id}`));
  return rows.filter((r) => ok.has(`${r.follower_id}:${r.target_id}`));
}
