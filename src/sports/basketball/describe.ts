/**
 * Describe cards in basketball (docs/security/breaks/describe-us.md): the play
 * goes on the board at the tap, and its detail is attached after by its own
 * action, keyed to that play's id — the made basket's assist and ⚡ tag, the
 * block's shooter, who drew a foul. The cards read what was attached from the
 * log, and close once a newer play (a tap or voice) is logged. PURE.
 */
import type { ScoreAction } from '../types';
import type { BasketballState } from './engine.ts';
import type { BBEvent, ReboundType } from './events.ts';
import { reboundAction, teamReboundAction, turnoverAction } from './actions.ts';

type Side = 'home' | 'away';

/** DU1: who drew a foul, attached after the foul is on the board (`id` = the
 *  foul's event id; `null` clears it). The foul event then carries
 *  `drawnPid` exactly as an older one-step foul did. */
export const foulDrawnAction = (side: Side, id: number, drawnBy: { id: string } | null): ScoreAction =>
  ({ type: 'FOUL_DRAWN', side, payload: { id, drawnPid: drawnBy ? drawnBy.id : null } });

/** DU8: the ⚡ fast-break tag on ONE basket, by its id (never "the side's latest"). */
export const tagAction = (side: Side, id: number, fb: boolean): ScoreAction => ({ type: 'TAG', side, payload: { id, fb } });

/** Which newer events belong to a card (its own detail), by the card's play id. */
export type Own = (e: BBEvent) => boolean;

/** DU3 / DU9: the card's play is gone (Undo / Remove), or a newer play that
 *  isn't its own detail is on the board — the card closes. */
export function cardStale(s: Pick<BasketballState, 'events'>, ref: number, own: Own): boolean {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return true;
  return s.events.slice(i + 1).some((e) => !own(e));
}

/** A made basket's own detail: the assists of its side logged right after it
 *  (an assist event keeps no ref, so the run after the basket is its own). */
export const assistOwn = (s: Pick<BasketballState, 'events'>, ref: number): Own => {
  const side = s.events.find((e) => e.id === ref)?.side;
  return (e) => e.type === 'assist' && e.side === side;
};
/** A foul's own detail: its free throws and a forced ejection. */
export const foulOwn = (_s: Pick<BasketballState, 'events'>, _ref: number): Own => (e) => e.type === 'freethrow' || e.type === 'eject';
/** A block's own detail: the shot it named (`ref`). */
export const blockOwn = (_s: Pick<BasketballState, 'events'>, ref: number): Own => (e) => e.type === 'miss' && e.ref === ref;

/** The basket card's detail, from the log: its assist (one) and the ⚡ tag. */
export function assistCard(s: Pick<BasketballState, 'events'>, ref: number): { assist?: BBEvent; fb: boolean } {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return { assist: undefined, fb: false };
  const own = assistOwn(s, ref);
  let assist: BBEvent | undefined;
  for (const e of s.events.slice(i + 1)) { if (!own(e)) break; assist ??= e; }
  return { assist, fb: s.events[i].fb === true };
}

/** The foul card's detail: who drew it (by id; an older log's name). */
export function foulCard(s: Pick<BasketballState, 'events'>, ref: number): { foul?: BBEvent; drawnPid?: string; drawn?: string } {
  const foul = s.events.find((e) => e.id === ref && e.type === 'foul');
  return { foul, drawnPid: foul?.drawnPid, drawn: foul?.drawn };
}

/** The block card's detail: the shot it named. */
export function blockCard(s: Pick<BasketballState, 'events'>, ref: number): { block?: BBEvent; shot?: BBEvent } {
  return { block: s.events.find((e) => e.id === ref), shot: s.events.find((e) => e.type === 'miss' && e.ref === ref) };
}

/** A foul that can take "who was fouled?": a player's foul, not a technical
 *  (as the one-step flow asked). */
export const describesDrawn = (e: Pick<BBEvent, 'type' | 'foulType' | 'bench'> | undefined): boolean =>
  !!e && e.type === 'foul' && e.foulType !== 'technical' && !e.bench;

/* ---- wave 4 polish (docs/security/breaks/polish-basketball.md) ----
 * "Rebound?" and "Steal — who lost it?" as describe cards, keyed by the miss /
 * steal. Neither blocks scoring (the play is on the board at its tap), so they
 * log the same REBOUND / TURNOVER actions the one-step prompts did; the plans
 * make each card single-choice (PB3): a re-tap clears, another pick replaces. */

/** The shot a "Rebound?" card is about: the first miss of `side` (a missed
 *  field goal, or a missed free throw) logged after `fromSeq`. */
export function reboundShot(s: Pick<BasketballState, 'events'>, side: Side, fromSeq: number): BBEvent | undefined {
  return s.events.find((e) => e.id > fromSeq && e.side === side && (e.type === 'miss' || (e.type === 'freethrow' && e.made === false)));
}

/** PB4: a shot's own detail — the rebound logged right after it (one). */
export const reboundOwn = (s: Pick<BasketballState, 'events'>, ref: number): Own => {
  const i = s.events.findIndex((e) => e.id === ref);
  const next = i < 0 ? undefined : s.events[i + 1];
  return (e) => e === next && e.type === 'rebound';
};

/** The rebound card's detail: its shot and the rebound picked for it. */
export function reboundCard(s: Pick<BasketballState, 'events'>, ref: number): { shot?: BBEvent; rebound?: BBEvent } {
  const i = s.events.findIndex((e) => e.id === ref);
  if (i < 0) return {};
  const next = s.events[i + 1];
  return { shot: s.events[i], rebound: next?.type === 'rebound' ? next : undefined };
}

/** A rebound pick: the side, the player (`null` = the team) and off / def. */
export type ReboundPick = { side: Side; pid: string | null; rt: ReboundType };
/** A card plan: the card's own pick to remove first (Undo-safe: its own
 *  credits go with it), then the new pick to log. `{}` = nothing to do. */
export type CardPlan = { remove?: BBEvent; add?: ScoreAction };

const samePick = (e: BBEvent, p: ReboundPick) =>
  e.side === p.side && (e.reboundType ?? null) === (p.rt ?? null) && (p.pid ? e.pid === p.pid : e.team === true && !e.pid);

/** PB3 / PB12: the same pick again clears it; another replaces it. Only the
 *  card's own rebound is ever removed (PB11). */
export function reboundPlan(s: Pick<BasketballState, 'events'>, ref: number, p: ReboundPick): CardPlan {
  const { shot, rebound } = reboundCard(s, ref);
  if (!shot) return {};
  if (rebound && samePick(rebound, p)) return { remove: rebound };
  const add = p.pid ? reboundAction(p.side, { id: p.pid }, p.rt) : teamReboundAction(p.side, p.rt);
  return rebound ? { remove: rebound, add } : { add };
}

/** PB4: a steal's own detail — the turnover naming it (`ref`). */
export const stealOwn = (_s: Pick<BasketballState, 'events'>, ref: number): Own => (e) => e.type === 'turnover' && e.ref === ref;

/** The steal card's detail: the steal and who lost the ball. */
export function stealCard(s: Pick<BasketballState, 'events'>, ref: number): { steal?: BBEvent; lost?: BBEvent } {
  return { steal: s.events.find((e) => e.id === ref && e.type === 'steal'), lost: s.events.find((e) => e.type === 'turnover' && e.ref === ref) };
}

/** PB3: the steal's ball-handler, single-choice (the engine would silently
 *  drop a second one). Only the turnover naming this steal is ever removed. */
export function stealPlan(s: Pick<BasketballState, 'events'>, ref: number, pid: string): CardPlan {
  const { steal, lost } = stealCard(s, ref);
  if (!steal) return {};
  if (lost && lost.pid === pid) return { remove: lost };
  const add = turnoverAction(steal.side === 'home' ? 'away' : 'home', { id: pid }, { ref });
  return lost ? { remove: lost, add } : { add };
}

/** PB2: "Rebound: Ben (def.)", "Rebound: Team (off.)"; '' = nothing picked. */
export function reboundSummary(e: BBEvent | undefined, nameOf: (pid?: string, legacy?: string) => string): string {
  if (!e) return '';
  const who = e.team || (!e.pid && !e.playerName) ? 'Team' : nameOf(e.pid, e.playerName);
  return `Rebound: ${who}${e.reboundType ? ` (${e.reboundType}.)` : ''}`;
}
/** PB2: "Lost it: Ben"; '' = nothing picked. */
export const stealSummary = (e: BBEvent | undefined, nameOf: (pid?: string, legacy?: string) => string): string =>
  (e ? `Lost it: ${nameOf(e.pid, e.playerName)}` : '');
