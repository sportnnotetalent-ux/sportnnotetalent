/**
 * IDs-only scoring (docs/privacy/ids-only-scoring.md) — the actions football's
 * scoring controls dispatch, as pure builders: the controls and the tests
 * build them the same way. Match events are public (logged out too), so each
 * carries player IDS only — the scorer, assister, carded / sin-binned player,
 * fouler and fouled player, the players of a substitution, the XI stamp, a
 * shoot-out taker and keeper — never a name; names are looked up when shown
 * (../invasion/names.ts `withNames`). The controls add the minute / half
 * (`fire`). A team official's card keeps its typed ROLE ("Head coach") — a
 * staff label, not a player. PURE.
 */
import type { ScoreAction } from '../types';
import type { FootballEvent, GoalType, BodyPart, ShotZone, StatEvent, StatKind, CardReason } from './events.ts';
import type { XiStamp } from './engine.ts';
import { GOAL_STAT, STAT_KEY } from './totals.ts';

type Side = 'home' | 'away';
/** A picked player (a roster `Player` fits). */
export type Who = { id: string };
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** A goal by `scorer` (how it was won, the body part; deep wave: zone / big
 *  chance). `tracked` = the stat keys this match tracks (stamped on credits). */
export const goalAction = (side: Side, scorer: Who, goalType: GoalType, o: { bodyPart?: BodyPart; zone?: ShotZone; bigChance?: boolean; tracked?: string[] } = {}): ScoreAction => ({
  type: 'GOAL', side,
  payload: { goalType, bodyPart: o.bodyPart, pid: scorer.id, ...(o.zone ? { zone: o.zone } : {}), ...(o.bigChance ? { bigChance: true } : {}) },
  attribution: { playerId: scorer.id, stat: 'goals', extra: { shots: 1, shotsOnTarget: 1, [GOAL_STAT[goalType]]: 1 }, tracked: o.tracked },
});

/** A goal with no named scorer (the team's). */
export const teamGoalAction = (side: Side): ScoreAction => ({ type: 'GOAL', side, payload: { goalType: 'open' } });

/** The goal just logged taken back (a refined goal type re-logs it): its credits reversed. */
export const undoGoalAction = (side: Side, scorer: Who, goalType: GoalType = 'open'): ScoreAction => ({
  type: 'UNDO_GOAL', side,
  attribution: { playerId: scorer.id, stat: 'goals', by: -1, extra: { shots: -1, shotsOnTarget: -1, [GOAL_STAT[goalType]]: -1 } },
});

/** SD-30: an own goal for `side` by the opponent `p` (credited `ownGoals` at full time). */
export const ownGoalAction = (side: Side, p: Who): ScoreAction => ({ type: 'OWN_GOAL', side, payload: { pid: p.id } });

/** One player credit with the player's id on the payload (an assist). */
export const creditAction = (type: string, side: Side, stat: string, p: Who, o: { extra?: Record<string, number>; tracked?: string[] } = {}): ScoreAction =>
  ({ type, side, payload: { pid: p.id }, attribution: { playerId: p.id, stat, extra: o.extra, tracked: o.tracked } });

/** The assist on the side's latest goal — or, with `ref` (MVP F2), on that
 *  goal only (a goal Undo removed takes no assist). */
export const assistAction = (side: Side, p: Who, tracked?: string[], ref?: number): ScoreAction => {
  const a = creditAction('ASSIST', side, 'assists', p, { tracked });
  return ref == null ? a : { ...a, payload: { ...a.payload, ref } };
};

/** A card for `p`: a red, or a yellow — plus the red when it is the player's
 *  second (`events` = the match so far; an older yellow may carry a name only). */
export function cardActions(events: FootballEvent[], side: Side, color: 'yellow' | 'red', p: Who & { fullName?: string }, o: { reason?: CardReason; tracked?: string[] } = {}): ScoreAction[] {
  const why = o.reason ? { reason: o.reason } : {};
  const red = (second: boolean): ScoreAction => ({ type: 'RED', side, payload: { ...(second ? { secondYellow: true } : {}), pid: p.id, ...why }, attribution: { playerId: p.id, stat: 'redCards', tracked: o.tracked } });
  if (color === 'red') return [red(false)];
  const second = events.some((e) => e.type === 'yellow' && e.side === side && (e.playerId ? e.playerId === p.id : !!p.fullName && e.playerName === p.fullName));
  const yellow: ScoreAction = { type: 'YELLOW', side, payload: { pid: p.id, ...why }, attribution: { playerId: p.id, stat: 'yellowCards', tracked: o.tracked } };
  return second ? [yellow, red(true)] : [yellow];
}

/** SD-117 (F13): a team official's card — no player, no stat line. `role` is
 *  the typed label ("Head coach"), an adult staff role, stored as typed. */
export function officialCardActions(events: FootballEvent[], side: Side, color: 'yellow' | 'red', role: string): ScoreAction[] {
  const nm = role.trim() || 'Team official';
  const payload = { official: true, officialName: nm };
  if (color === 'red') return [{ type: 'RED', side, payload }];
  const second = events.some((e) => e.type === 'yellow' && e.side === side && e.official && e.playerName === nm);
  return second ? [{ type: 'YELLOW', side, payload }, { type: 'RED', side, payload: { ...payload, secondYellow: true } }] : [{ type: 'YELLOW', side, payload }];
}

/** SD-29: a sin-bin of `minutes` (the exact clock second for the live countdown). */
export const sinBinAction = (side: Side, p: Who, minutes: number | undefined, o: { sec?: number; tracked?: string[] } = {}): ScoreAction => ({
  type: 'SUSPEND', side, payload: { minutes, ...(o.sec !== undefined ? { sec: o.sec } : {}) },
  attribution: { playerId: p.id, stat: 'sinBins', tracked: o.tracked },
});

/** Deep wave detail on a stat (shot zone / big chance / woodwork, a key pass's shot). */
export type StatDetail = { onTarget?: boolean; complete?: boolean; blocked?: boolean; zone?: ShotZone; bigChance?: boolean; woodwork?: boolean; ref?: number };

/** A granular stat (shot, tackle, corner…), by `player` when one is named.
 *  `possSide` = who has the ball after it; `at` = the device clock. */
export function statAction(kind: StatKind, side: Side, player: Who | null | undefined, detail: StatDetail = {}, o: { possSide?: Side; at?: number; tracked?: string[] } = {}): ScoreAction {
  const statKey = STAT_KEY[kind];
  // a shot on target also bumps shotsOnTarget; a completed pass bumps passesComplete
  const extra: Record<string, number> | undefined =
    kind === 'shot' && detail.onTarget && !detail.blocked ? { shotsOnTarget: 1 }
    : kind === 'pass' && detail.complete ? { passesComplete: 1 }
    : undefined;
  return {
    type: 'STAT', side,
    // a stat with no stat-line key keeps its player on the payload (`pid`)
    payload: { kind, possSide: o.possSide, at: o.at ?? Date.now(), ...detail, ...(player && !statKey ? { pid: player.id } : {}) },
    attribution: player && statKey ? { playerId: player.id, stat: statKey, extra, tracked: o.tracked } : undefined,
  };
}

/** MVP F5 — after the scorer picks the team for a stat, either ask who ('player'),
 *  go straight to the outcome ('detail': a shot's on/off target, a pass's
 *  completion), or log it at once ('record'). With no players listed the
 *  "who?" step is skipped and the stat is the team's. A card still asks: a
 *  second yellow is per person (the step offers a team official). */
export function afterTeamPick(kind: StatKind | 'card', hasPlayers: boolean): 'player' | 'detail' | 'record' {
  const needsPlayer = kind !== 'corner' && kind !== 'goalKick' && kind !== 'throwIn';
  if (!needsPlayer) return 'record';
  if (hasPlayers || kind === 'card') return 'player';
  return kind === 'shot' || kind === 'pass' ? 'detail' : 'record';
}

/** A foul by `fouler` — and the fouled player (`victim`, optional), by id. */
export const foulAction = (side: Side, fouler: Who, victim: Who | null | undefined, o: { at?: number; tracked?: string[] } = {}): ScoreAction => ({
  type: 'STAT', side,
  payload: { kind: 'foul', possSide: opp(side), at: o.at ?? Date.now(), ...(victim ? { secondId: victim.id } : {}) },
  attribution: { playerId: fouler.id, stat: 'fouls', tracked: o.tracked },
});

/** A substitution: who goes off / comes on, by id. */
export const subAction = (side: Side, off: Who, on: Who): ScoreAction => ({ type: 'SUB', side, payload: { offId: off.id, onId: on.id } });

/** SD-09: a side's XI stamp (ids only — `xiOf`). */
export const xiAction = (team: Side, stamp: XiStamp): ScoreAction => ({ type: 'XI', payload: { team, ...stamp } });

/** The XI stamp from the team sheet: the starters, the keeper (the GK slot,
 *  else a starter listed as a keeper, or with no line-up the squad's keeper)
 *  and every squad keeper — by id. */
export function xiOf(slots: { playerId?: string; position?: string }[], keeperIds: string[]): XiStamp {
  const filled = slots.filter((sl) => sl.playerId);
  const players = filled.map((sl) => ({ id: sl.playerId! }));
  const keepers = keeperIds.map((id) => ({ id }));
  const gkSlot = filled.find((sl) => sl.position === 'GK');
  const gk = gkSlot ? players.find((p) => p.id === gkSlot.playerId)
    : players.length ? players.find((p) => keepers.some((k) => k.id === p.id))
    : keepers[0];
  return { ...(gk ? { gk } : {}), players, keepers };
}

/** SD-80: a shoot-out kick — its outcome, the taker and the keeper facing it, by id. */
export const penKickAction = (side: Side, outcome: 'scored' | 'saved' | 'missed', taker?: Who | null, keeper?: Who | null): ScoreAction => ({
  type: 'PEN', side,
  payload: { scored: outcome === 'scored', outcome, ...(taker ? { takerId: taker.id } : {}), ...(keeper ? { keeperId: keeper.id } : {}) },
});

/** Correcting the timeline: remove one event, its credits reversed by id
 *  (`idOf` resolves an older log's name-only event to a squad id). A goal's
 *  assist goes with it. */
export function eventRemoval(ev: FootballEvent, idOf: (name?: string) => string | undefined = () => undefined): ScoreAction[] {
  const pid = ev.type === 'owngoal' || ev.official ? undefined : ev.playerId ?? idOf(ev.playerName);
  let attribution: ScoreAction['attribution'];
  if (ev.type === 'goal' && pid) attribution = { playerId: pid, stat: 'goals', by: -1, extra: { shots: -1, shotsOnTarget: -1, [GOAL_STAT[ev.goalType ?? 'open']]: -1 } };
  else if (ev.type === 'yellow' && pid) attribution = { playerId: pid, stat: 'yellowCards', by: -1 };
  else if (ev.type === 'red' && pid) attribution = { playerId: pid, stat: 'redCards', by: -1 };
  else if (ev.type === 'sinbin' && pid) attribution = { playerId: pid, stat: 'sinBins', by: -1 };
  const out: ScoreAction[] = [{ type: 'REMOVE_EVENT', payload: { id: ev.id, target: 'event' }, attribution }];
  // A goal's assist is a separate log entry — reverse the assister's tally too
  // so an edit / remove leaves no phantom assist.
  if (ev.type === 'goal' && (ev.secondId || ev.secondName)) {
    const aid = ev.secondId ?? idOf(ev.secondName);
    if (aid) out.push({ type: 'REMOVE_EVENT', payload: { id: -1, target: 'stat' }, attribution: { playerId: aid, stat: 'assists', by: -1 } });
  }
  return out;
}

/** Correcting the timeline: remove one stat, its credit reversed by id. */
export function statRemoval(st: StatEvent): ScoreAction {
  const key = STAT_KEY[st.kind];
  const extra: Record<string, number> | undefined =
    st.kind === 'shot' && st.onTarget && !st.blocked ? { shotsOnTarget: -1 } : st.kind === 'pass' && st.complete ? { passesComplete: -1 } : undefined;
  const attribution = st.playerId && key ? { playerId: st.playerId, stat: key, by: -1, extra } : undefined;
  return { type: 'REMOVE_EVENT', payload: { id: st.id, target: 'stat' }, attribution };
}
