/**
 * Shared scoring against a real Postgres (PGlite, every migration applied):
 * append_match_event / pop_match_event / set_shared_scoring and the guards
 * (docs/security/breaks/shared-scoring.md).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;

type Who = { uid: string; player: string };
async function person(name: string): Promise<Who> {
  const uid = await db.signUp({ name, dob: '1985-01-01' });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1985-01-01') returning id`, [name, uid]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
async function friendly(scorers: Who[], host: Who, status = 'live'): Promise<string> {
  const [m] = await db.sql<{ id: string }>(`insert into matches (sport, host_ids, scorer_ids, status) values ('pool', $1, $2, $3) returning id`,
    [[host.player], scorers.map((s) => s.player), status]);
  return m.id;
}
/** A new-app tap (with its base). */
const tap = (w: Who, match: string, device: string, base: string | null, cid = randomUUID()) =>
  db.as<{ s: number }>(w.uid, `select append_match_event($1, $2, $3, 'pot', 'home', '{}'::jsonb, null, $4) as s`, [match, device, cid, base]).then((r) => ({ seq: r[0].s, cid }));
/** An old-app tap (the 7-argument call, no base). */
const oldTap = (w: Who, match: string, device: string, cid = randomUUID()) =>
  db.as<{ s: number }>(w.uid, `select append_match_event(p_match => $1, p_device => $2, p_client_id => $3, p_type => 'pot', p_side => 'home', p_payload => '{}'::jsonb, p_attribution => null) as s`, [match, device, cid]).then((r) => r[0].s);
const pop = (w: Who, match: string, device: string, base: string | null) =>
  db.as<{ r: unknown }>(w.uid, `select pop_match_event($1, $2, $3) as r`, [match, device, base]).then((r) => r[0].r as { seq: number; client_id: string } | null);
const oldPop = (w: Who, match: string, device: string) =>
  db.as<{ r: unknown }>(w.uid, `select pop_match_event(p_match => $1, p_device => $2) as r`, [match, device]).then((r) => r[0].r);
const share = (w: Who, match: string, on = true) => db.as(w.uid, `select set_shared_scoring($1, $2)`, [match, on]);
const count = async (match: string) => Number((await db.sql<{ n: string }>(`select count(*) as n from match_events where match_id = $1`, [match]))[0].n);

let ashok: Who, bina: Who, host: Who, stranger: Who, organiser: Who;
before(async () => {
  db = await bootDb({ strict: true });
  ashok = await person('Ashok Rao'); bina = await person('Bina Shah'); host = await person('Hari Host');
  stranger = await person('Sam Stranger'); organiser = await person('Olga Organiser');
});

describe('S17 — one at a time is exactly as today', () => {
  test('the first tapper takes the lock; the other is refused; bases are ignored', async () => {
    const m = await friendly([ashok, bina], host);
    assert.equal((await tap(ashok, m, 'dA', 'nonsense')).seq, 1);
    assert.equal(await oldTap(ashok, m, 'dA'), 2);
    assert.match(await errOf(() => tap(bina, m, 'dB', '')) ?? '', /not_active_scorer/);
    assert.match(await errOf(() => oldTap(bina, m, 'dB')) ?? '', /not_active_scorer/);
    assert.ok(await oldPop(ashok, m, 'dA'));
    assert.ok(await pop(ashok, m, 'dA', 'whatever'));
    assert.equal(await count(m), 0);
  });
  test('the old 7- and 2-argument signatures are gone (no ambiguous overloads)', async () => {
    const rows = await db.sql<{ n: string }>(`select count(*) as n from pg_proc where proname in ('append_match_event', 'pop_match_event')`);
    assert.equal(Number(rows[0].n), 2);
  });
});

describe('S8 — the switch', () => {
  test('friendly: a listed scorer may switch it; a stranger may not; a direct update is refused', async () => {
    const m = await friendly([ashok, bina], host);
    assert.match(await errOf(() => share(stranger, m)) ?? '', /not_allowed/);
    await share(bina, m);
    assert.equal((await db.sql<{ s: boolean }>(`select shared_scoring as s from matches where id = $1`, [m]))[0].s, true);
    assert.match(await errOf(() => db.as(ashok.uid, `update matches set shared_scoring = false where id = $1`, [m])) ?? '', /set_shared_scoring/);
    await share(ashok, m, false);
    assert.equal((await db.sql<{ s: boolean }>(`select shared_scoring as s from matches where id = $1`, [m]))[0].s, false);
  });
  test('tournament match: listed scorers may not; hosts / organisers may', async () => {
    const [t] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, organizer_id) values ('Cue Cup', 'Olga', $1) returning id`, [organiser.uid]);
    const [m] = await db.sql<{ id: string }>(`insert into matches (sport, tournament_id, scorer_ids, host_ids, status) values ('pool', $1, $2, $3, 'live') returning id`,
      [t.id, [ashok.player, bina.player], [host.player]]);
    assert.match(await errOf(() => share(ashok, m.id)) ?? '', /not_allowed/);
    await share(organiser, m.id);
    await share(host, m.id, false);
  });
  test('a client can\'t create a match already shared', async () => {
    const [m] = await db.as<{ s: boolean }>(ashok.uid, `insert into matches (sport, host_ids, shared_scoring) values ('pool', $1, true) returning shared_scoring as s`, [[ashok.player]]);
    assert.equal(m.s, false);
  });
  test('S13: switching on clears an old lock holder; claim_scoring no longer takes it; Hand over is refused', async () => {
    const m = await friendly([ashok, bina], host);
    await tap(ashok, m, 'dA', '');
    assert.ok((await db.sql<{ a: string }>(`select active_scorer_id as a from matches where id = $1`, [m]))[0].a);
    await share(ashok, m);
    assert.equal((await db.sql<{ a: string | null }>(`select active_scorer_id as a from matches where id = $1`, [m]))[0].a, null);
    const [c] = await db.as<{ r: { ok: boolean; shared?: boolean } }>(bina.uid, `select claim_scoring($1, 'dB') as r`, [m]);
    assert.deepEqual(c.r.ok, true); assert.equal(c.r.shared, true);
    assert.equal((await db.sql<{ a: string | null }>(`select active_scorer_id as a from matches where id = $1`, [m]))[0].a, null);
    assert.match(await errOf(() => db.as(ashok.uid, `select handover_scoring($1, $2)`, [m, bina.player])) ?? '', /shared_scoring_on/);
  });
});

describe('shared mode — optimistic concurrency', () => {
  let m: string;
  before(async () => { m = await friendly([ashok, bina], host); await share(ashok, m); });
  test('S1/S2: both phones score in turn; a tap on an old base is refused (no insert) naming who recorded the newer step', async () => {
    const a1 = await tap(ashok, m, 'dA', '');
    const b1 = await tap(bina, m, 'dB', a1.cid);
    assert.deepEqual([a1.seq, b1.seq], [1, 2]);
    const err = await errOf(() => tap(ashok, m, 'dA', a1.cid));
    assert.equal(err, `stale_tap:${bina.player}`);
    assert.equal(await count(m), 2);
    assert.match(await errOf(() => tap(ashok, m, 'dA', '')) ?? '', /^stale_tap:/);
    assert.equal((await tap(ashok, m, 'dA', b1.cid)).seq, 3);
  });
  test('S12: a retried tap that already landed returns its seq, even on its old base', async () => {
    const before_ = await count(m);
    const [last] = await db.sql<{ client_id: string; seq: number }>(`select client_id, seq from match_events where match_id = $1 order by seq desc limit 1`, [m]);
    assert.equal((await tap(ashok, m, 'dA', 'old-base', last.client_id)).seq, last.seq);
    assert.equal(await count(m), before_);
  });
  test('S6: an old app (no base) is refused with "update the app"', async () => {
    assert.match(await errOf(() => oldTap(bina, m, 'dB')) ?? '', /update_app_shared_scoring/);
    assert.match(await errOf(() => oldPop(bina, m, 'dB')) ?? '', /update_app_shared_scoring/);
  });
  test('S5: a stranger can never write or undo', async () => {
    const [last] = await db.sql<{ client_id: string }>(`select client_id from match_events where match_id = $1 order by seq desc limit 1`, [m]);
    assert.match(await errOf(() => tap(stranger, m, 'dS', last.client_id)) ?? '', /not_active_scorer/);
    assert.match(await errOf(() => pop(stranger, m, 'dS', last.client_id)) ?? '', /not_active_scorer/);
  });
  test('S3/S4: Undo is base-checked; after an undo the old base is stale (no ABA)', async () => {
    const top = await tap(bina, m, 'dB', (await db.sql<{ k: string }>(`select coalesce(client_id::text, 'id:' || id) as k from match_events where match_id = $1 order by seq desc limit 1`, [m]))[0].k);
    // Ashok still sees the step before Bina's: his undo is refused, nothing removed
    const n = await count(m);
    assert.match(await errOf(() => pop(ashok, m, 'dA', 'some-older-key')) ?? '', new RegExp(`^stale_tap:${bina.player}$`));
    assert.equal(await count(m), n);
    // Bina undoes her own step, then records another at the same seq
    const r = await pop(bina, m, 'dB', top.cid);
    assert.equal(r?.client_id, top.cid);
    const prevKey = (await db.sql<{ k: string }>(`select coalesce(client_id::text, 'id:' || id) as k from match_events where match_id = $1 order by seq desc limit 1`, [m]))[0].k;
    const again = await tap(bina, m, 'dB', prevKey);
    assert.equal(again.seq, top.seq);
    // A tap based on the undone step is stale even though the seq is back
    assert.match(await errOf(() => tap(ashok, m, 'dA', top.cid)) ?? '', /^stale_tap:/);
  });
  test('S21: a late retry of a step someone already undid doesn\'t bring it back', async () => {
    const k = (await db.sql<{ k: string }>(`select coalesce(client_id::text, 'id:' || id) as k from match_events where match_id = $1 order by seq desc limit 1`, [m]))[0].k;
    const x = await tap(ashok, m, 'dA', k);
    await pop(bina, m, 'dB', x.cid);           // Bina undoes Ashok's step
    // Ashok's phone never heard back, and retries the same tap on its old base
    assert.match(await errOf(() => tap(ashok, m, 'dA', k, x.cid)) ?? '', /^stale_tap:/);
    assert.equal((await db.sql(`select 1 from match_events where client_id = $1`, [x.cid])).length, 0);
  });
  test('S15: recorded_by is the caller\'s player, set by the server', async () => {
    const rows = await db.sql<{ r: string }>(`select recorded_by as r from match_events where match_id = $1 order by seq`, [m]);
    assert.ok(rows.every((x) => x.r === ashok.player || x.r === bina.player));
  });
  test('S7: direct inserts / deletes are refused in shared mode', async () => {
    assert.match(await errOf(() => db.as(ashok.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 999, 'pot', 'home', '{}')`, [m])) ?? '', /update_app_shared_scoring/);
    assert.match(await errOf(() => db.as(ashok.uid, `delete from match_events where match_id = $1`, [m])) ?? '', /update_app_shared_scoring/);
  });
  test('S15: a direct insert (one at a time) can\'t claim someone else recorded it', async () => {
    const m2 = await friendly([ashok], ashok);
    await db.as(ashok.uid, `insert into match_events (match_id, seq, type, side, payload, recorded_by) values ($1, 1, 'pot', 'home', '{}', $2)`, [m2, bina.player]);
    const [r] = await db.sql<{ r: string | null }>(`select recorded_by as r from match_events where match_id = $1`, [m2]);
    assert.notEqual(r.r, bina.player);
  });
  test('a writer outside the live screen (corrections, chess results, guest upload) using the newest key is accepted — also on a row with no client id', async () => {
    const m4 = await friendly([ashok, bina], host);
    await db.sql(`insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'pot', 'home', '{}')`, [m4]); // a legacy row
    await share(ashok, m4);
    const [r] = await db.sql<{ id: number; seq: number; client_id: string | null }>(`select id, seq, client_id from match_events where match_id = $1 order by seq desc, id desc limit 1`, [m4]);
    const key = r.client_id ?? `id:${r.id}`; // what newestEventKey sends
    assert.equal((await tap(bina, m4, 'dB', key)).seq, 2);
  });
  test('after the match: base not required (post-match corrections as today)', async () => {
    const m3 = await friendly([ashok, bina], host);
    await share(ashok, m3);
    await tap(ashok, m3, 'dA', '');
    await db.sql(`update matches set status = 'completed' where id = $1`, [m3]);
    assert.equal((await tap(ashok, m3, 'dA', 'stale')).seq, 2);
  });
});

describe('concurrency — two phones racing on 40 matches', () => {
  test('every accepted tap is on its newest base, none twice, refusals reported', async () => {
    let seed = 7;
    const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
    for (let g = 0; g < 40; g++) {
      const m = await friendly([ashok, bina], host);
      await share(bina, m);
      const phones = [{ w: ashok, d: 'dA', known: '' }, { w: bina, d: 'dB', known: '' }];
      const accepted: string[] = [];
      let refused = 0;
      for (let i = 0; i < 12; i++) {
        const ph = phones[rnd(2)];
        if (rnd(3) === 0) { // the phone catches up (realtime arrived)
          const top = await db.sql<{ k: string }>(`select coalesce(client_id::text, 'id:' || id) as k from match_events where match_id = $1 order by seq desc limit 1`, [m]);
          ph.known = top[0]?.k ?? '';
        }
        const cid = randomUUID();
        const e = await errOf(async () => { await tap(ph.w, m, ph.d, ph.known, cid); });
        if (e) { assert.match(e, /^stale_tap:/); refused++; } else { accepted.push(cid); ph.known = cid; }
      }
      const rows = await db.sql<{ client_id: string; seq: number }>(`select client_id, seq from match_events where match_id = $1 order by seq`, [m]);
      assert.deepEqual(rows.map((r) => r.client_id), accepted);
      assert.deepEqual(rows.map((r) => r.seq), accepted.map((_, i) => i + 1));
      assert.equal(accepted.length + refused, 12);
    }
  });
});
