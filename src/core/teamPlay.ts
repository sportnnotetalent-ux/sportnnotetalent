/**
 * Teams for doubles, phase 1 (docs/product/teams-for-doubles.md,
 * docs/security/breaks/team-play.md). Every side with more than one person is a
 * team with a squad; before scoring, its playing N are picked — automatically
 * when the squad is exactly N, else by a team manager, else "{Team} Player 1…N"
 * stand-ins so scoring is never blocked. A stand-in is later mapped to the real
 * player and every credit / stat moves to them. PURE.
 */
import { canManageTeamLocal } from './teamPermissions.ts';
import type { Role, TeamLeadership } from './types';

/** TP4: a stand-in's id — no real (uuid) id starts with "ph:" */
export const standInId = (teamId: string, slot: number) => `ph:${teamId}:${slot}`;
export const isStandIn = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith('ph:');
export const standInName = (teamName: string, slot: number) => `${teamName} Player ${slot}`;

export type Playing = { kind: 'picked' | 'auto' | 'standin'; ids: string[] };

/** TP1–TP3: who plays for a side */
export function playingFor({ teamId, squad, needed, picked }: { teamId: string; squad: readonly string[]; needed: number; picked?: readonly string[] | null }): Playing {
  const inSquad = new Set(squad);
  if (picked && picked.length === needed && new Set(picked).size === needed && picked.every((p) => inSquad.has(p))) {
    return { kind: 'picked', ids: [...picked] };
  }
  if (squad.length === needed && new Set(squad).size === needed) return { kind: 'auto', ids: [...squad] };
  return { kind: 'standin', ids: Array.from({ length: needed }, (_, i) => standInId(teamId, i + 1)) };
}

/** TP5: may this scorer pick the team's players, or should they ask the team? */
export function pickerFor(ctx: { myPlayerId?: string | null; leaders?: TeamLeadership; role?: Role; isClubAdmin?: boolean; isHost?: boolean }): 'pick' | 'ask' {
  if (ctx.isHost) return 'pick';
  return canManageTeamLocal({ role: ctx.role, myPlayerId: ctx.myPlayerId, leaders: ctx.leaders, isClubAdmin: ctx.isClubAdmin }) ? 'pick' : 'ask';
}

/** TP7: why a stand-in → player mapping can't be saved (null = fine) */
export function checkMapping(map: Record<string, string>, ctx: { squad: readonly string[]; alreadyPlaying: readonly string[] }): string | null {
  const targets = Object.values(map);
  if (Object.keys(map).some((k) => !isStandIn(k))) return 'Only a stand-in player can be replaced.';
  if (new Set(targets).size !== targets.length) return 'Two stand-ins can’t be the same person.';
  if (targets.some((t) => !ctx.squad.includes(t))) return 'That player is not in the squad.';
  if (targets.some((t) => ctx.alreadyPlaying.includes(t))) return 'That player is already playing for this side.';
  return null;
}

/** TP6 / TP9: every exact occurrence of a mapped id, at any depth, becomes the
 *  real player; everything else (side, order, score) is untouched. */
export function remapEvents<T>(value: T, map: Record<string, string>): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return Object.hasOwn(map, v) ? map[v] : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** TP8: a stand-in's stat line moves to the real player, merged (numbers added)
 *  with any line they already have for that match. */
export function remapStatLines<L extends { matchId: string; playerId: string; stats: Record<string, unknown> }>(lines: readonly L[], map: Record<string, string>): L[] {
  const out = new Map<string, L>();
  for (const l of lines) {
    const playerId = Object.hasOwn(map, l.playerId) ? map[l.playerId] : l.playerId;
    const key = `${l.matchId}|${playerId}`;
    const prev = out.get(key);
    if (!prev) { out.set(key, { ...l, playerId, stats: { ...l.stats } }); continue; }
    const stats: Record<string, unknown> = { ...prev.stats };
    for (const [k, v] of Object.entries(l.stats)) stats[k] = typeof v === 'number' && typeof stats[k] === 'number' ? (stats[k] as number) + v : stats[k] ?? v;
    out.set(key, { ...prev, stats });
  }
  return [...out.values()];
}

/** Phase 3 (team-whos-playing.md WP1 / WP2): the players on a side's scoring
 *  buttons — the pick, else the whole squad when it is exactly the number
 *  playing, else "{Team} Player n" stand-ins. Never the whole bigger squad. */
export function sidePlayers<P extends { id: string; fullName: string }>(o: { teamId: string; teamName: string; squad: readonly P[]; needed: number; picked?: readonly string[] | null }): { kind: Playing['kind']; players: (P | { id: string; fullName: string })[] } {
  const play = playingFor({ teamId: o.teamId, squad: o.squad.map((p) => p.id), needed: o.needed, picked: o.picked });
  if (play.kind === 'standin') return { kind: 'standin', players: play.ids.map((id, i) => ({ id, fullName: standInName(o.teamName, i + 1) })) };
  const byId = new Map(o.squad.map((p) => [p.id, p] as const));
  return { kind: play.kind, players: play.ids.map((id) => byId.get(id)!) };
}

/** WP7: a pick can be saved only with exactly the number playing, all distinct */
export const canSavePick = (ids: readonly string[], needed: number): boolean => ids.length === needed && new Set(ids).size === needed;

/** WP8: who "Ask {Team} to pick" reminds — captain, vice-captain, admins (once each) */
export function remindTargets(l: TeamLeadership): string[] {
  return [...new Set([l.captainId, l.viceCaptainId, ...(l.adminIds ?? [])].filter((x): x is string => !!x))];
}
