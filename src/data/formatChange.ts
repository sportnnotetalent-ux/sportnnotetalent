/**
 * MVP B6 / T9 — changing the format of a live friendly. Pure.
 * The board is the format plus the event log, replayed; a new format replays
 * the same taps. A change is refused when, under the new format, the match
 * would already be over — the taps after that point would be lost (or the
 * match would end on the spot: end it instead).
 */
import type { MatchEventRecord } from '../core/types';
import { effectiveLog } from '../sports/amend.ts';
import { logAction } from './eventLog.ts';
import type { ScoreAction } from '../sports/types';

type Replayer = {
  createInitialState: (config?: Record<string, unknown>) => unknown;
  reducer: (s: never, a: ScoreAction) => unknown;
  isComplete: (s: never) => boolean;
};

export interface FormatPreview {
  /** the board under the new format */
  state: unknown;
  /** taps that would come after the match is over (lost) */
  dropped: number;
  /** allowed: the match is still going under the new format */
  ok: boolean;
}

export function formatChangePreview(plugin: Replayer, config: Record<string, unknown> | undefined, raw: MatchEventRecord[]): FormatPreview {
  let s = plugin.createInitialState(config);
  let dropped = 0;
  for (const e of effectiveLog(raw)) {
    if (plugin.isComplete(s as never)) { dropped++; continue; }
    s = plugin.reducer(s as never, logAction(e));
  }
  return { state: s, dropped, ok: dropped === 0 && !plugin.isComplete(s as never) };
}

/** Who may change a live match's format: its hosts / managers, friendlies only
 *  (a tournament's format is the organiser's), not cricket (an overs change
 *  there is a rain rule, not a fix), while it is live and not finished. */
export function canChangeLiveFormat(o: { canManage: boolean; tournamentId?: string; sport: string; live: boolean; complete: boolean }): boolean {
  return o.canManage && !o.tournamentId && o.sport !== 'cricket' && o.live && !o.complete;
}
