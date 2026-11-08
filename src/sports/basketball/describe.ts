/**
 * Describe cards in basketball (docs/security/breaks/describe-us.md): the play
 * goes on the board at the tap, and its detail is attached after by its own
 * action, keyed to that play's id — the made basket's assist and ⚡ tag, the
 * block's shooter, who drew a foul. The cards read what was attached from the
 * log, and close once a newer play (a tap or voice) is logged. PURE.
 */
import type { ScoreAction } from '../types';
import type { BasketballState } from './engine.ts';
import type { BBEvent } from './events.ts';

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
