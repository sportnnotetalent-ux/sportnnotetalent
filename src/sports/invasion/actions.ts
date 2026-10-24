/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the line-up actions
 * the invasion scorer UIs share (hockey, handball, ice hockey, netball, rugby
 * union, rugby league, American football; football has its own
 * ./football/actions.ts): substitutions, a new keeper / goalie, the XI stamp.
 * Pure builders, so the controls and the tests build them the same way. Match
 * events are public, so each carries player IDS only — never a name (names
 * are looked up when shown: ./names.ts). The credits (goals, cards…) come from
 * each sport's own `eventCredits` → `creditAttribution`, ids only as well.
 * PURE.
 */
import type { LineupSlot, Player } from '../../core/types';
import type { ScoreAction } from '../types';

type Side = 'home' | 'away';
/** A picked player (a roster `Player` fits). */
export type Who = { id: string };

/** A player as a stamp / payload stores it: the id only. */
export const idOnly = (p: Who): { id: string } => ({ id: p.id });

/** SUB: who goes off (optional — a first player on) / who comes on, by id.
 *  `extra` = the sport's own keys (rugby `temp` / `back`, netball `pos`). */
export const subAction = (side: Side, off: Who | null | undefined, on: Who, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'SUB', side, payload: { ...(off ? { offId: off.id } : {}), onId: on.id, ...extra } });

/** GK: a new keeper / goalie for the side, by id. */
export const keeperAction = (side: Side, p: Who): ScoreAction => ({ type: 'GK', side, payload: { id: p.id } });

/**
 * The XI stamp from the team sheet: the starters (lineup slots with a player)
 * and — when the sport has keepers — the keeper: the keeper slot's player,
 * else a squad keeper among the starters (or the first squad keeper with no
 * line-up). Ids only.
 */
export function xiStamp(
  slots: LineupSlot[],
  roster: Player[],
  keeper?: { slot: (sl: LineupSlot) => boolean; player: (p: Player) => boolean },
): { players?: { id: string }[]; gk?: { id: string } } {
  const filled = slots.filter((sl) => sl.playerId);
  const players = filled.map((sl) => ({ id: sl.playerId! }));
  let gk: { id: string } | undefined;
  if (keeper) {
    const gkSlot = filled.find(keeper.slot);
    gk = gkSlot ? players.find((p) => p.id === gkSlot.playerId)
      : roster.filter(keeper.player).map(idOnly).find((k) => !players.length || players.some((x) => x.id === k.id));
  }
  return { ...(players.length ? { players } : {}), ...(gk ? { gk } : {}) };
}
