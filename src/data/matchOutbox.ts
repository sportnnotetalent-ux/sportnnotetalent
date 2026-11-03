/**
 * Durable outbox for live-scoring events. Every tap the scorer makes is written
 * here FIRST (persisted to AsyncStorage), then synced to the backend (demo store
 * or Supabase). If the sync fails or the device is offline, the event stays
 * queued and re-flushes automatically — on reconnect, on an interval, and on the
 * next app launch — so a scorer's work is never lost to a dropped connection or a
 * closed tab.
 *
 * The event log stays the source of truth: queued (unsynced) events are merged
 * into replay on load, so the scoreboard/timeline are complete even after a crash
 * mid-match. Once an event is confirmed by the backend it's dropped from the queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendMatchEvent } from './repos';
import type { MatchEventRecord } from '../core/types';
import { outboxOnError } from '../core/sharedScoring';
import { ownsQueue, queueAccount } from '../core/queueAccount';
import { exposeGlobal } from '../core/devGlobals';

const keyFor = (matchId: string) => `sportfolio.outbox.${matchId}`;
// Security W3 (CL-07): the account whose taps these are (sent and shown only to it)
const ownerKeyFor = (matchId: string) => `sportfolio.outbox.owner.${matchId}`;
const owners = new Map<string, string>();
const mine = (matchId: string) => ownsQueue(owners.get(matchId), queueAccount());

// Per-match queues of events not yet confirmed by the backend, kept in memory
// (mirrored to AsyncStorage) so the UI can read counts synchronously.
const queues = new Map<string, MatchEventRecord[]>();
const hydrated = new Set<string>();
const flushing = new Set<string>();

// Consecutive failed sync attempts per match, and the last error seen. A dropped
// connection and a backend that keeps REJECTING an event look identical at the
// call site, but they need opposite messages: the first resolves itself, the
// second never will. After this many failures while the device still reports a
// working network, we stop calling it "offline" and say sync is stuck.
const failures = new Map<string, number>();
const lastError = new Map<string, string>();
const STUCK_AFTER = 3;
// Matches whose queued taps the server REFUSED (another device holds the scoring
// lock). Never retried — the scorer discards them (see useLiveMatch).
const rejected = new Set<string>();
// Shared scoring: taps refused as stale while made live are dropped at once;
// the live-match hook reverses their stats, refreshes and says who scored first.
type StaleListener = (dropped: MatchEventRecord[], by: string | null) => void;
const staleListeners = new Map<string, Set<StaleListener>>();

// On the web we get real online/offline events; on native we probe instead.
const hasOnlineEvents =
  typeof window !== 'undefined' && typeof window.addEventListener === 'function' && 'ononline' in window;
let online = hasOnlineEvents && typeof navigator !== 'undefined' ? navigator.onLine : true;

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}

async function persist(matchId: string) {
  const q = queues.get(matchId) ?? [];
  if (!q.length) owners.delete(matchId);
  const owner = owners.get(matchId);
  try {
    if (q.length) await AsyncStorage.setItem(keyFor(matchId), JSON.stringify(q));
    else await AsyncStorage.removeItem(keyFor(matchId));
    if (owner) await AsyncStorage.setItem(ownerKeyFor(matchId), owner);
    else await AsyncStorage.removeItem(ownerKeyFor(matchId));
  } catch {
    // storage unavailable — in-memory queue still protects the current session
  }
}

/** What the platform itself reports, independent of our own sync outcomes. */
const deviceOnline = () => (hasOnlineEvents && typeof navigator !== 'undefined' ? navigator.onLine : true);

export const matchOutbox = {
  isOnline: () => online,
  /** True when syncing keeps failing even though the device has a network — the
   *  queue is safe on this device but will NOT drain on its own. */
  isStuck: (matchId: string) => (failures.get(matchId) ?? 0) >= STUCK_AFTER && deviceOnline(),
  /** The last sync error for a match, for display/support. */
  syncError: (matchId: string) => lastError.get(matchId) ?? null,
  pendingCount: (matchId: string) => (mine(matchId) ? queues.get(matchId)?.length ?? 0 : 0),
  /** The server refused this match's queued taps (scoring moved to another device). */
  isRejected: (matchId: string) => rejected.has(matchId),
  getPending: (matchId: string) => (mine(matchId) ? queues.get(matchId) ?? [] : []),

  /** Load a match's persisted queue into memory (once). Returns the pending events. */
  async hydrate(matchId: string): Promise<MatchEventRecord[]> {
    if (!hydrated.has(matchId)) {
      hydrated.add(matchId);
      try {
        const raw = await AsyncStorage.getItem(keyFor(matchId));
        if (raw) queues.set(matchId, JSON.parse(raw) as MatchEventRecord[]);
        const owner = await AsyncStorage.getItem(ownerKeyFor(matchId));
        if (owner) owners.set(matchId, owner);
      } catch {
        // ignore — start with an empty queue
      }
      emit();
    }
    return this.getPending(matchId);
  },

  /** Durably record an event, then try to sync it. */
  enqueue(matchId: string, rec: MatchEventRecord) {
    const q = queues.get(matchId) ?? [];
    // a queue left by another account is parked, not added to (CL-07)
    if (q.length && !mine(matchId)) return;
    const me = queueAccount();
    if (!q.length && me) owners.set(matchId, me);
    // shared scoring: a tap made offline is never dropped silently if refused later
    q.push(online ? rec : { ...rec, waited: true });
    queues.set(matchId, q);
    void persist(matchId);
    emit();
    void this.flush(matchId);
  },

  /** Remove and return the last queued event — used to undo an unsynced tap. */
  popLast(matchId: string): MatchEventRecord | null {
    const q = queues.get(matchId);
    if (!q?.length || !mine(matchId)) return null;
    const removed = q.pop()!;
    void persist(matchId);
    emit();
    return removed;
  },

  /** Drop all queued (unsynced) events for a match — used when resetting a match
   *  that was started by mistake, so nothing pending re-appears on rebuild. */
  clear(matchId: string) {
    queues.set(matchId, []);
    rejected.delete(matchId);
    void persist(matchId);
    emit();
  },

  /** Throw away refused taps and return them (so their stats can be reversed). */
  discard(matchId: string): MatchEventRecord[] {
    const removed = queues.get(matchId) ?? [];
    queues.set(matchId, []);
    rejected.delete(matchId);
    failures.delete(matchId);
    lastError.delete(matchId);
    void persist(matchId);
    emit();
    return removed;
  },

  /** Try to sync a match's queue to the backend, oldest first. */
  async flush(matchId: string, force = false): Promise<void> {
    if (flushing.has(matchId)) return;
    if (rejected.has(matchId)) return; // the server will never take these — awaiting Discard
    if (force) failures.delete(matchId); // a manual retry gets a clean slate
    if (!online && !force) return; // known offline — wait for reconnect
    // Security W3 (CL-07): another account's taps wait for that account
    if (!mine(matchId)) return;
    const q = queues.get(matchId);
    if (!q?.length) return;
    flushing.add(matchId);
    try {
      // Copy so undo/enqueue during the await can't corrupt our cursor.
      while (q.length) {
        const rec = q[0];
        try {
          await appendMatchEvent(matchId, rec);
        } catch (e) {
          const outcome = outboxOnError(e instanceof Error ? e.message : String(e), q, Date.now());
          if (outcome.action === 'drop') {
            // Shared scoring: a live tap on a board that had moved on (and any
            // tap queued behind it, based on it). Never retried, never merged.
            const dropped = q.splice(0, q.length);
            failures.delete(matchId);
            lastError.delete(matchId);
            await persist(matchId);
            emit();
            for (const l of staleListeners.get(matchId) ?? []) { try { l(dropped, outcome.by); } catch { /* a listener never breaks sync */ } }
            return;
          }
          if (outcome.action === 'review') {
            // Never retried — the scorer reviews and discards them.
            rejected.add(matchId);
            lastError.set(matchId, outcome.reason === 'lock' ? 'Scoring moved to another device'
              : outcome.reason === 'update_app' ? 'Update SportnNote to score this match (shared scoring)'
              : 'Another scorer recorded steps while these taps waited');
            emit();
            return;
          }
          // shared scoring: these taps now wait — a later refusal goes to review
          for (const r of q) r.waited = true;
          const n = (failures.get(matchId) ?? 0) + 1;
          failures.set(matchId, n);
          lastError.set(matchId, e instanceof Error ? e.message : 'Sync failed');
          // Only claim we're offline while the device agrees. If the network is
          // up and the backend keeps refusing, keep everything queued but let
          // the UI say so instead of promising an automatic recovery.
          if (!deviceOnline()) online = false;
          emit();
          return;
        }
        if (q[0] === rec) q.shift(); // still the head (not undone mid-flush) → confirmed
        online = true;
        failures.delete(matchId);
        lastError.delete(matchId);
        await persist(matchId);
        emit();
      }
    } finally {
      flushing.delete(matchId);
    }
  },

  /** Flush every match with a pending queue (reconnect / interval / manual retry). */
  async flushAll(force = false): Promise<void> {
    await Promise.all([...queues.keys()].map((id) => this.flush(id, force)));
  },

  /** Shared scoring: called with taps dropped as stale (and who recorded the newer step). */
  onStale(matchId: string, fn: StaleListener) {
    const set = staleListeners.get(matchId) ?? new Set<StaleListener>();
    set.add(fn);
    staleListeners.set(matchId, set);
    return () => { set.delete(fn); };
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => version,
};

// React to connectivity + retry periodically. On the web we trust online/offline
// events; on native (no such events) the interval force-probes to detect recovery.
if (hasOnlineEvents) {
  window.addEventListener('online', () => { online = true; emit(); void matchOutbox.flushAll(); });
  window.addEventListener('offline', () => { online = false; emit(); });
}
if (typeof setInterval === 'function') {
  setInterval(() => { void matchOutbox.flushAll(!hasOnlineEvents); }, 20_000);
}

// Test/inspection hook (parity with __sportfolioReminders): drive the offline
// simulation and read queue state deterministically from the web preview.
exposeGlobal('__sportfolioOutbox', {
  pendingCount: (id: string) => matchOutbox.pendingCount(id),
  isOnline: () => matchOutbox.isOnline(),
  getPending: (id: string) => matchOutbox.getPending(id),
  flushAll: (force?: boolean) => matchOutbox.flushAll(!!force),
  setOnline: (v: boolean) => { online = !!v; emit(); if (v) void matchOutbox.flushAll(); },
});
