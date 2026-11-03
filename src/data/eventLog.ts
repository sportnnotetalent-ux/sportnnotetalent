/**
 * Live-scoring event log helpers (pure — node tests load this).
 *
 * The server numbers events (`seq`); a device's taps carry a `clientId` until
 * the server has them. Replay = the server log in seq order, then this device's
 * still-unsynced taps in the order they were made.
 */
import type { MatchEventRecord } from '../core/types';
import type { ScoreAction } from '../sports/types';
import { AMEND_TYPE, effectiveLog } from '../sports/amend.ts';

/** Merge the server log with unsynced taps: server events by seq, then pending
 *  ones the server doesn't have yet (by clientId), numbered after the server's. */
export function mergeLog(server: MatchEventRecord[], pending: MatchEventRecord[]): MatchEventRecord[] {
  const sorted = [...server].sort((a, b) => a.seq - b.seq);
  const onServer = new Set(sorted.map((e) => e.clientId).filter(Boolean) as string[]);
  const serverSeqs = new Set(sorted.map((e) => e.seq));
  const maxServer = sorted.reduce((m, e) => Math.max(m, e.seq), 0);
  let i = 0;
  const rest: MatchEventRecord[] = [];
  for (const p of pending) {
    // Legacy taps (no clientId) de-dupe by seq, as before.
    if (p.clientId ? onServer.has(p.clientId) : serverSeqs.has(p.seq)) continue;
    i += 1;
    rest.push({ ...p, seq: maxServer + i });
  }
  return [...sorted, ...rest];
}

/** The key an event is known by on this device (clientId, else its seq). */
export const eventKey = (e: Pick<MatchEventRecord, 'clientId' | 'seq'>) => e.clientId ?? `seq:${e.seq}`;

type Attr = { playerId: string; stat: string; by?: number; extra?: Record<string, number> };

/** The stat-line changes that cancel what an event credited (its attribution,
 *  extras, and a second attribution stashed in the payload as `_attr2`) — used by
 *  undo and when discarding taps the server refused. */
export function statReversals(e: Pick<MatchEventRecord, 'attribution' | 'payload'>): { playerId: string; stat: string; by: number }[] {
  const out: { playerId: string; stat: string; by: number }[] = [];
  const add = (a?: Attr | null) => {
    if (!a) return;
    out.push({ playerId: a.playerId, stat: a.stat, by: -(a.by ?? 1) });
    for (const [k, v] of Object.entries(a.extra ?? {})) out.push({ playerId: a.playerId, stat: k, by: -v });
  };
  add(e.attribution as Attr | null | undefined);
  add((e.payload as { _attr2?: Attr } | null | undefined)?._attr2);
  return out;
}

/** A sync error the server will never accept (another device holds the scoring
 *  lock; shared scoring: a stale tap or an old app) vs. one worth retrying
 *  (network, timeout). */
export const isRejection = (message?: string | null) => /not_active_scorer|stale_tap:|update_app_shared_scoring/i.test(message ?? '');

/** Who a player's stats belong to now: follows RESOLVED participation disputes
 *  (the disputed player → their confirmed replacement, possibly chained), the
 *  same move resolution makes on stat_lines. Pure; used by corrections (#05) and
 *  the stat sync (#19) so a correction never recreates the wrong person's line. */
export function followDisputes(
  disputes: { playerId: string; status: string; replacementId?: string }[],
  playerId: string,
): string {
  let id = playerId;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(id)) return id; // a loop can't happen, but never spin
    seen.add(id);
    const d = disputes.find((x) => x.status === 'resolved' && x.playerId === id && x.replacementId);
    if (!d?.replacementId) return id;
    id = d.replacementId;
  }
}

/* ------------------------ replay (live match + undo) ------------------------ */

/** A stored event as the reducer takes it. */
export const logAction = (e: MatchEventRecord): ScoreAction => ({
  type: e.type,
  side: e.side ?? undefined,
  payload: e.payload ?? undefined,
  attribution: e.attribution ?? undefined,
});

/** The newest event of a raw log — what Undo removes (highest seq; on a tie,
 *  the later one). */
export function newestEvent(raw: MatchEventRecord[]): MatchEventRecord | undefined {
  return raw.reduce<MatchEventRecord | undefined>((m, e) => (!m || e.seq >= m.seq ? e : m), undefined);
}

/** What replaying a raw log gives the live-match hook. */
export interface DerivedLog {
  state: unknown;
  /** every event this device has applied, by eventKey */
  applied: Set<string>;
  maxSeq: number;
  /** what Undo would remove, with the state before / after it (SD-115), and
   *  who recorded it (shared scoring; a player id when the server knows) */
  lastStep: { type: string; prev: unknown; next: unknown; by?: string | null } | null;
}

/** Re-derive a live match from its raw log (backend + unsynced taps): the
 *  published corrections applied (AMEND rows, parity #05), each event through
 *  the plugin's pure reducer. Shared by the full rebuild from the server and
 *  (perf F-21) Undo, which steps the board back from the log it already holds
 *  before the server confirms. */
export function deriveLog(
  plugin: { createInitialState: (config?: Record<string, unknown>) => unknown; reducer: (s: never, a: ScoreAction) => unknown },
  config: Record<string, unknown> | undefined,
  raw: MatchEventRecord[],
): DerivedLog {
  const events = effectiveLog(raw);
  let s = plugin.createInitialState(config);
  const applied = new Set<string>();
  let maxSeq = 0;
  let before: unknown = s;
  for (const e of events) {
    before = s;
    s = plugin.reducer(s as never, logAction(e));
    applied.add(eventKey(e));
    maxSeq = Math.max(maxSeq, e.seq);
  }
  for (const e of raw) { applied.add(eventKey(e)); maxSeq = Math.max(maxSeq, e.seq); }
  // The newest raw row is what Undo pops; an AMEND row isn't in `events` itself.
  const tail = newestEvent(raw);
  const by = tail?.recordedBy ? { by: tail.recordedBy } : {};
  const lastStep = !tail ? null : tail.type === AMEND_TYPE || events[events.length - 1] !== tail
    ? { type: tail.type, prev: s, next: s, ...by }
    : { type: tail.type, prev: before, next: s, ...by };
  return { state: s, applied, maxSeq, lastStep };
}
