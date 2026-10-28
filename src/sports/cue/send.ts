/**
 * Cue sports — dispatch a tap, asking first when it ends a frame or the match
 * (askConfirm, NO is the default). The question comes from the engine
 * (cue/ending.ts), so it can't disagree with what the tap does. A null tap
 * (the builder said the engine would refuse it) does nothing.
 */
import { askConfirm } from '../../components/ConfirmSheet';
import type { ScoreAction } from '../types';
import { endingCopy, endingOf } from './ending';

export async function sendTap<S>(
  reduce: (s: S, a: never) => S,
  state: S,
  a: ScoreAction | null,
  dispatch: (a: ScoreAction) => void,
  names: { home: string; away: string },
  unit: 'frame' | 'game',
  /** a "check it" line to put before the question (a quick score past the usual maximum) */
  warn?: string,
): Promise<boolean> {
  if (!a) return false;
  const e = endingOf(reduce, state, a);
  if (e) {
    const copy = endingCopy(e, names, unit);
    const ok = await askConfirm(warn ? { ...copy, message: `${warn} ${copy.message}` } : copy);
    if (!ok) return false;
  }
  dispatch(a);
  return true;
}
