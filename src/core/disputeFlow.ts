/**
 * AS-02 — the only ways a dispute's status may move, exactly as the scoring
 * screen offers them. Closed disputes (resolved / dismissed) stay closed. The
 * server enforces the same in guard_dispute (migration 20261031150000).
 */
import type { MatchDispute } from './types';

type DisputeStatus = MatchDispute['status'];

const NEXT: Record<DisputeStatus, readonly DisputeStatus[]> = {
  reported: ['open', 'dismissed'],
  open: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export const canMoveDispute = (from: DisputeStatus, to: DisputeStatus): boolean => NEXT[from]?.includes(to) ?? false;

/** The statuses a dispute may move to `to` from (for a guarded update). */
export const movesInto = (to: DisputeStatus): DisputeStatus[] =>
  (Object.keys(NEXT) as DisputeStatus[]).filter((from) => NEXT[from].includes(to));
