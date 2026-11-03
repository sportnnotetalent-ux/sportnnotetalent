/**
 * Shared scoring (docs/security/breaks/shared-scoring.md) — several people who
 * may score a match record it at once from their own phones. PURE.
 *
 * Every tap carries its BASE: the key of the newest event the phone had applied
 * (its client id, else "id:" + its server id; "" for an empty log). In shared
 * mode the server (append_match_event / pop_match_event, migration
 * 20261103120000_shared_scoring.sql) refuses a tap or Undo whose base is not the
 * match's newest event with `stale_tap:<player id>` and inserts nothing; an old
 * app (no base) gets `update_app_shared_scoring`. One-at-a-time ignores bases.
 */

type Keyed = { seq: number; clientId?: string; id?: number | string | null };

/** The key a phone and the server both know an event by. */
export const baseKey = (e: Pick<Keyed, 'clientId' | 'id'>): string =>
  e.clientId ? e.clientId : e.id != null && e.id !== '' ? `id:${e.id}` : '';

/** The base of a new tap: the newest event of the log the phone holds (highest
 *  seq; on a tie the later one, as Undo picks it); "" when empty. */
export function baseOf(raw: readonly Keyed[]): string {
  let top: Keyed | undefined;
  for (const e of raw) if (!top || e.seq >= top.seq) top = e;
  return top ? baseKey(top) : '';
}

/** What append_match_event decides (mirrors the SQL; the simulation uses it). */
export function serverDecision(i: { shared: boolean; inPlay: boolean; base: string | null; newestKey: string; isRetry: boolean; undone?: boolean }): 'accept' | 'stale' | 'update_app' {
  if (i.isRetry) return 'accept'; // the same client id already landed: its seq comes back
  if (!i.shared || !i.inPlay) return 'accept'; // one at a time / after the match: bases ignored (lock rules as today)
  if (i.base == null) return 'update_app';
  if (i.undone) return 'stale'; // a late retry of a step someone already undid never comes back
  return i.base === i.newestKey ? 'accept' : 'stale';
}

export type Refusal = { kind: 'stale'; by: string | null } | { kind: 'update_app' } | { kind: 'lock' };

/** A server refusal, from its message. */
export function parseRefusal(message?: string | null): Refusal | null {
  const m = message ?? '';
  const st = /stale_tap:([A-Za-z0-9_-]*)/.exec(m);
  if (st) return { kind: 'stale', by: st[1] || null };
  if (/update_app_shared_scoring/i.test(m)) return { kind: 'update_app' };
  if (/not_active_scorer/i.test(m)) return { kind: 'lock' };
  return null;
}

/** A tap younger than this when refused as stale was made live (online). */
export const STALE_FRESH_MS = 15_000;

/** Refused stale taps: all made just now on a working connection (live) → drop
 *  them, refresh, say who; any that waited (made offline, or a send failed) or is
 *  older or of unknown age → the review list (never silently merged). */
export function staleDisposition(queue: readonly { madeAt?: number; waited?: boolean }[], now: number): 'drop' | 'review' {
  if (!queue.length) return 'drop';
  return queue.every((r) => !r.waited && typeof r.madeAt === 'number' && now - r.madeAt >= 0 && now - r.madeAt < STALE_FRESH_MS) ? 'drop' : 'review';
}

export type OutboxOutcome =
  | { action: 'retry' }
  | { action: 'drop'; by: string | null }
  | { action: 'review'; by: string | null; reason: 'stale' | 'update_app' | 'lock' };

/** What the outbox does with a failed sync of its queue (head first). A stale
 *  head means every later queued tap is stale too (each is based on the one
 *  before it), so the whole queue goes one way. */
export function outboxOnError(message: string | null | undefined, queue: readonly { madeAt?: number; waited?: boolean }[], now: number): OutboxOutcome {
  const r = parseRefusal(message);
  if (!r) return { action: 'retry' };
  if (r.kind === 'stale') return staleDisposition(queue, now) === 'drop' ? { action: 'drop', by: r.by } : { action: 'review', by: r.by, reason: 'stale' };
  return { action: 'review', by: null, reason: r.kind };
}

/** Who may switch shared scoring: a friendly — anyone who may score it (listed
 *  scorer or host); a tournament match — its hosts / organisers only. */
export const canSwitchShared = (i: { tournamentId?: string | null; isListedScorer: boolean; isHost: boolean }): boolean =>
  i.tournamentId ? i.isHost : i.isListedScorer || i.isHost;

export const staleMessage = (byName: string | null | undefined): string =>
  `${byName?.trim() ? byName.trim() : 'Someone else'} just recorded a step — your tap wasn’t added`;

/** " · recorded by Ashok" on the Undo bar in shared mode ("" otherwise). */
export function undoByLabel(i: { shared: boolean; by?: string | null; me?: string | null; nameOf: (id: string) => string | null | undefined }): string {
  if (!i.shared || !i.by) return '';
  if (i.me && i.by === i.me) return ' · recorded by you';
  const n = i.nameOf(i.by);
  return ` · recorded by ${n?.trim() ? n.trim() : 'another scorer'}`;
}

/** Undoing another person's step asks first (shared mode only). */
export const undoNeedsConfirm = (i: { shared: boolean; by?: string | null; me?: string | null }): boolean =>
  i.shared && !!i.by && i.by !== i.me;
