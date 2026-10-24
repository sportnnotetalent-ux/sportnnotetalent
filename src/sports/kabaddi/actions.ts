/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the kabaddi actions
 * the scoring controls (and voice) dispatch besides the guided raid
 * (`raidActions`, engine.ts): substitutions, technical points, cards, the
 * re-entry of an old one-tap point and the timeline's ✕ remove. Pure
 * builders, so the controls and the tests build them the same way. Match
 * state and events are public, so each carries player IDS only — never a
 * name (names are looked up when shown, names.ts). PURE.
 */
import type { ScoreAction } from '../types';
import { raidReversals, type CardColour, type KabaddiEvent, type KabaddiState } from './engine.ts';

type Side = 'home' | 'away';
/** A picked player (a roster `Player` fits) — only the id is logged. */
export type Who = { id: string };

/** Old one-tap lines: the stat a raid / tackle point credits. */
export const KB_STAT_KEY: Record<string, string> = { raid: 'raidPoints', tackle: 'tacklePoints' };

/** A substitution: `off` leaves, `on` comes on (format: substitutes). */
export const subAction = (side: Side, off: Who, on: Who): ScoreAction =>
  ({ type: 'SUB', side, payload: { offId: off.id, onId: on.id } });

/** SD-59 — a technical point to `side`; `by` = the player at fault (the other side). */
export const techPointAction = (side: Side, o: { reason?: string; by?: Who | null } = {}): ScoreAction =>
  ({ type: 'TECH_POINT', side, payload: { ...(o.reason ? { reason: o.reason } : {}), ...(o.by ? { playerId: o.by.id } : {}) } });

/** SD-72 — a card to `side`: a named player (by id), an unnamed player
 *  (`'player'`) or a coach / team official (`'official'`). */
export const cardAction = (side: Side, card: CardColour, who: Who | 'player' | 'official', o: { wasOut?: boolean; tp?: number } = {}): ScoreAction => ({
  type: 'CARD', side,
  payload: {
    card,
    ...(who === 'official' ? { official: true } : who === 'player' ? { player: true } : { playerId: who.id }),
    ...(o.wasOut ? { wasOut: true } : {}),
    ...(o.tp ? { tp: o.tp } : {}),
  },
});

/** A one-tap RAID / TACKLE point (the re-entry of an old log's point), credited by id. */
export const pointAction = (kind: 'raid' | 'tackle', side: Side, p: Who | null | undefined, points = 1): ScoreAction => ({
  type: kind.toUpperCase(), side, payload: { points },
  attribution: p ? { playerId: p.id, stat: KB_STAT_KEY[kind], by: points } : undefined,
});

/** The timeline's ✕: a guided raid (any of its lines) goes as a whole —
 *  raid, tackle, all-out — with its credits reversed; a technical point /
 *  card / substitution / old one-tap point goes on its own. `idOf` maps an
 *  older log's name-only credit to an id (the squads). */
export function removeEventAction(s: KabaddiState, e: KabaddiEvent, idOf: (name?: string) => string | undefined = () => undefined): ScoreAction {
  if (e.group != null) return { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.group, v: 2 }, ...raidReversals(s, e, idOf) };
  const pid = e.playerId ?? idOf(e.playerName);
  const stat = e.kind ? KB_STAT_KEY[e.kind] : undefined;
  return {
    type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id, v: 2 },
    attribution: pid && stat ? { playerId: pid, stat, by: -(e.points ?? 1) } : undefined,
  };
}
