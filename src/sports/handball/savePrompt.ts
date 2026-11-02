/**
 * Court-team batch 5 (docs/sport-expert/court-team.md fix 9) — a save with no
 * keeper set. The team always keeps the save (the SAVE event is on the
 * keeper's side, so team saves and save % count it); this adds an optional
 * "Who's in goal?" row on the save screen. Picking a player logs the keeper
 * change (GK, the existing action) before the shot, so this save and every
 * later goal conceded go to him. Not picking anyone logs exactly what it did
 * before. PURE.
 */
import type { ScoreAction } from '../types';
import { keeperAction } from '../invasion/actions.ts';
import { currentKeeper, goalEmpty, type HandballState } from './engine.ts';

type Side = 'home' | 'away';

/** A keeper change from this app (the shared GK action + `spell`): the
 *  keeper's line gets goals conceded and save % even with no line-up keeper.
 *  Used by "Who's in goal?" and the 🧤 Set keeper button. */
export const namedKeeperAction = (side: Side, p: { id: string }): ScoreAction => {
  const a = keeperAction(side, p);
  return { ...a, payload: { ...a.payload, spell: true } };
};

/** Offer "Who's in goal?" for `keeperSide`: no keeper set, the goal isn't
 *  empty (a 7th court player), and not while correcting a logged event. */
export const askKeeper = (s: HandballState, keeperSide: Side, editing: boolean): boolean =>
  !editing && !currentKeeper(s, keeperSide)?.id && !goalEmpty(s, keeperSide);

/** The actions to log before the shot (`pre`: the keeper change, if one was
 *  picked and none is set) and the keeper the save goes to. A keeper already
 *  set wins over a pick. */
export function savedByActions(s: HandballState, keeperSide: Side, picked: { id: string } | undefined): { pre: ScoreAction[]; keeperId?: string } {
  const cur = currentKeeper(s, keeperSide);
  if (cur?.id) return { pre: [], keeperId: cur.id };
  if (!picked?.id || goalEmpty(s, keeperSide)) return { pre: [] };
  return { pre: [namedKeeperAction(keeperSide, picked)], keeperId: picked.id };
}
