/**
 * Shared scoring — simulation (quality mandate step 6;
 * docs/security/breaks/shared-scoring.md). 600 pool matches, each scored by two
 * phones tapping concurrently with random latency, lost replies (retries),
 * offline stretches, Undo from either phone, and some old-app phones.
 *
 * The server follows serverDecision (the mirror of append_match_event, proven
 * against Postgres in db-shared-scoring.test.mts); the phones use the app's own
 * code: baseOf for every tap's base, mergeLog for the board, outboxOnError for
 * refusals.
 *
 * Invariants: the final state equals the serial replay of the accepted taps; no
 * step is ever applied twice (nor comes back after an Undo); the server log is a
 * chain (each step based on the one before it); every tap made is accounted for
 * — on the server, undone, or reported refused (dropped with a notice, or in the
 * review list); a tap that waited offline is never dropped silently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseOf, baseKey, serverDecision, outboxOnError } from '../src/core/sharedScoring.ts';
import { mergeLog } from '../src/data/eventLog.ts';
import type { MatchEventRecord } from '../src/core/types.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

type Ev = MatchEventRecord & { base: string; by: string };
type Board = { score: [number, number]; turn: 0 | 1 };
const reduce = (s: Board, e: Pick<MatchEventRecord, 'type'>): Board =>
  e.type === 'pot' ? { ...s, score: (s.turn === 0 ? [s.score[0] + 1, s.score[1]] : [s.score[0], s.score[1] + 1]) as [number, number] }
    : e.type === 'miss' ? { ...s, turn: (1 - s.turn) as 0 | 1 } : s;
const replay = (log: readonly Pick<MatchEventRecord, 'type'>[]) => log.reduce(reduce, { score: [0, 0], turn: 0 } as Board);

interface Server { log: Ev[]; nextId: number; undone: Set<string> }
interface Phone {
  name: string; old: boolean; online: boolean;
  known: Ev[];                 // the server log as this phone last saw it
  queue: Ev[];                 // the outbox
  review: boolean;             // refused taps waiting for Discard
  inFlight: { rec: Ev; at: number; lose: boolean } | null;
}

function serverAppend(sv: Server, rec: Ev): { ok: true } | { ok: false; msg: string } {
  const isRetry = sv.log.some((e) => e.clientId === rec.clientId);
  const top = sv.log[sv.log.length - 1];
  const d = serverDecision({ shared: true, inPlay: true, base: rec.base === undefined || rec.base === null ? null : rec.base, newestKey: top ? baseKey(top) : '', isRetry, undone: sv.undone.has(rec.clientId!) });
  if (d === 'accept') {
    if (!isRetry) sv.log.push({ ...rec, id: sv.nextId++, seq: (top?.seq ?? 0) + 1 });
    return { ok: true };
  }
  return { ok: false, msg: d === 'stale' ? `stale_tap:${top?.by ?? ''}` : 'update_app_shared_scoring' };
}
function serverPop(sv: Server, base: string): { ok: boolean; msg?: string; removed?: Ev } {
  const top = sv.log[sv.log.length - 1];
  if ((top ? baseKey(top) : '') !== base) return { ok: false, msg: `stale_tap:${top?.by ?? ''}` };
  if (!top) return { ok: true };
  sv.log.pop();
  if (top.clientId) sv.undone.add(top.clientId);
  return { ok: true, removed: top };
}

test('600 shared-scoring matches: two phones, latency, lost replies, offline, undo, old apps', () => {
  let cid = 0;
  const totals = { matches: 0, taps: 0, accepted: 0, dropped: 0, reviewed: 0, undone: 0, staleUndos: 0, oldAppRefused: 0, retries: 0 };
  for (let g = 0; g < 600; g++) {
    totals.matches++;
    const sv: Server = { log: [], nextId: 1, undone: new Set() };
    const oldApp = rnd(10) === 0; // one in ten matches has an old-app phone
    const phones: Phone[] = [
      { name: 'p-ashok', old: false, online: true, known: [], queue: [], review: false, inFlight: null },
      { name: 'p-bina', old: oldApp, online: true, known: [], queue: [], review: false, inFlight: null },
    ];
    const made = new Set<string>(); const undoneByMe = new Set<string>(); const refused = new Set<string>();
    const droppedFresh: string[] = [];
    const madeOfflineAt = new Map<string, boolean>();
    const sync = (p: Phone) => { p.known = sv.log.map((e) => ({ ...e })); };
    const raw = (p: Phone) => mergeLog(p.known, p.queue) as Ev[];
    let now = 0;
    const refuse = (p: Phone, msg: string) => {
      const o = outboxOnError(msg, p.queue, now);
      assert.notEqual(o.action, 'retry');
      if (o.action === 'drop') {
        for (const r of p.queue) { refused.add(r.clientId!); droppedFresh.push(r.clientId!); assert.ok(!madeOfflineAt.get(r.clientId!), 'a tap made offline is never dropped silently'); }
        totals.dropped += p.queue.length; p.queue = []; sync(p);
      } else {
        if (msg.startsWith('update_app')) totals.oldAppRefused++;
        p.review = true;
      }
    };
    const steps = 30 + rnd(50);
    for (let i = 0; i < steps; i++) {
      now += 200 + rnd(3000); // ms between moments
      const p = phones[rnd(2)];
      const r = rnd(20);
      if (r < 8) { // tap
        const rec: Ev = { seq: 0, type: rnd(3) === 0 ? 'miss' : 'pot', clientId: `c${++cid}`, base: p.old ? (undefined as unknown as string) : baseOf(raw(p)), madeAt: now, by: p.name, payload: {} };
        if (p.old) delete (rec as Partial<Ev>).base;
        if (!p.online) rec.waited = true;
        p.queue.push(rec); made.add(rec.clientId!); totals.taps++;
        madeOfflineAt.set(rec.clientId!, !p.online);
      } else if (r < 12) { // the outbox sends its head (if online, not already sending, not in review)
        if (!p.online || p.review || p.inFlight || !p.queue.length) continue;
        p.inFlight = { rec: p.queue[0], at: now, lose: rnd(8) === 0 };
        const res = serverAppend(sv, p.inFlight.rec);
        const f = p.inFlight; p.inFlight = null;
        if (res.ok) {
          if (f.lose) { totals.retries++; p.queue.forEach((x) => { x.waited = true; }); continue; } // the reply is lost: retried later (same client id)
          p.queue.shift();
        } else if (!f.lose) refuse(p, res.msg);
        else p.queue.forEach((x) => { x.waited = true; });
      } else if (r < 15) { // realtime / refresh reaches the phone
        if (p.online) sync(p);
      } else if (r < 17) { // Undo
        if (p.review) continue;
        if (p.queue.length) { const x = p.queue.pop()!; undoneByMe.add(x.clientId!); continue; } // own unsynced tap: off the outbox
        if (!p.online || p.old) continue;
        const res = serverPop(sv, baseOf(p.known));
        if (res.ok) { if (res.removed) { undoneByMe.add(res.removed.clientId!); totals.undone++; } sync(p); }
        else { totals.staleUndos++; sync(p); } // refused: nothing removed, the board refreshes
      } else if (r < 19) { // connectivity flips
        p.online = !p.online;
      } else if (p.review) { // the scorer reviews and discards refused taps
        for (const x of p.queue) refused.add(x.clientId!);
        totals.reviewed += p.queue.length; p.queue = []; p.review = false; sync(p);
      }
    }
    // Wrap-up: both phones come online and drain (review lists get discarded).
    for (let round = 0; round < 200 && phones.some((p) => p.queue.length); round++) {
      now += 1000;
      for (const p of phones) {
        p.online = true;
        if (p.review) { for (const x of p.queue) refused.add(x.clientId!); totals.reviewed += p.queue.length; p.queue = []; p.review = false; sync(p); continue; }
        if (!p.queue.length) continue;
        const res = serverAppend(sv, p.queue[0]);
        if (res.ok) p.queue.shift(); else refuse(p, res.msg);
      }
    }
    for (const p of phones) { assert.equal(p.queue.length, 0); sync(p); }

    // No step applied twice, and none back after an Undo.
    const ids = sv.log.map((e) => e.clientId!);
    assert.equal(new Set(ids).size, ids.length, 'a step applied twice');
    for (const id of ids) assert.ok(!sv.undone.has(id), 'an undone step came back');
    // The log is a chain: each step was made on the one before it.
    sv.log.forEach((e, k) => assert.equal(e.base, k === 0 ? '' : baseKey(sv.log[k - 1]), 'a step applied to a moment that had moved on'));
    // Every phone's board = the serial replay of the accepted taps.
    const truth = replay(sv.log);
    for (const p of phones) assert.deepEqual(replay(raw(p)), truth);
    // Every tap is accounted for: on the server, undone, or reported refused.
    for (const c of made) assert.ok(ids.includes(c) || undoneByMe.has(c) || sv.undone.has(c) || refused.has(c), `tap ${c} lost silently`);
    for (const c of refused) assert.ok(!ids.includes(c), 'a refused tap was applied');
    // Old apps never write in shared mode.
    if (oldApp) assert.ok(sv.log.every((e) => e.by !== 'p-bina'));
    totals.accepted += sv.log.length;
  }
  assert.ok(totals.matches >= 500);
  assert.ok(totals.dropped > 0 && totals.reviewed > 0 && totals.staleUndos > 0 && totals.oldAppRefused > 0 && totals.retries > 0, JSON.stringify(totals));
  console.log('shared-scoring sim', JSON.stringify(totals));
});
