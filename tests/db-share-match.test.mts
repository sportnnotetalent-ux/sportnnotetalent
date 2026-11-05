/**
 * The live score link (MVP, founder 2026-10-31): each saved match carries a
 * tiny public summary (score + status, never a player's name), and
 * share_match() returns just what the link preview and the light spectator
 * page need, to anyone, read-only. Migration 20261031140000_share_match.sql.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb(); });
const err = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

let n = 0;
async function setup(o: { tournament?: 'live' | 'deleted' | null; summary?: unknown; status?: string } = {}) {
  const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, color_hex) values ($1, 'PAN', 'football', '#B98AFF') returning id`, [`Panthers ${++n}`]);
  const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ($1, 'CHE', 'football') returning id`, [`Cheetahs ${n}`]);
  let tid: string | null = null;
  if (o.tournament) {
    tid = (await db.sql<{ id: string }>(`insert into tournaments (name, host_name, deleted_at) values ('Inter-School Championship', 'Org', $1) returning id`,
      [o.tournament === 'deleted' ? new Date().toISOString() : null]))[0].id;
  }
  const [m] = await db.sql<{ id: string }>(
    `insert into matches (sport, status, tournament_id, home_team_id, away_team_id, venue_name, summary) values ('football', $1, $2, $3, $4, 'Gachibowli Stadium', $5) returning id`,
    [o.status ?? 'live', tid, h.id, a.id, o.summary === undefined ? null : JSON.stringify(o.summary)]);
  return m.id;
}
// signed out, the app names the match in view (signed-out-scope.md)
const share = (id: string) => db.asAnonWith<{ r: Record<string, any> | null }>({ 'x-share': `m:${id}` }, `select share_match($1) as r`, [id]).then((x) => x[0].r);

describe('the live summary on a match', () => {
  test('an object of a few short strings is kept', async () => {
    const id = await setup({ summary: { h: '2', a: '1', s: '2nd Half', d: 'HT 1–0' } });
    const [r] = await db.sql<{ summary: Record<string, string> }>(`select summary from matches where id = $1`, [id]);
    assert.deepEqual(r.summary, { h: '2', a: '1', s: '2nd Half', d: 'HT 1–0' });
  });
  test('anything else is refused: too big, or not an object', async () => {
    assert.ok(await err(() => setup({ summary: { h: 'x'.repeat(700) } })));
    assert.ok(await err(() => setup({ summary: ['2', '1'] })));
    assert.ok(await err(() => setup({ summary: 'two-one' })));
  });
});

describe('share_match: what the link shows', () => {
  test('anyone, signed out: teams, colours, score, status, venue, tournament, views', async () => {
    const id = await setup({ tournament: 'live', summary: { h: '2', a: '1', s: '2nd Half' } });
    await db.sql(`insert into match_view_counts (match_id, views) values ($1, 340)`, [id]);
    const r = (await share(id))!;
    assert.equal(r.sport, 'football');
    assert.equal(r.status, 'live');
    assert.match(r.home.name, /^Panthers/);
    assert.equal(r.home.short_name, 'PAN');
    assert.equal(r.home.color_hex, '#B98AFF');
    assert.match(r.away.name, /^Cheetahs/);
    assert.deepEqual(r.summary, { h: '2', a: '1', s: '2nd Half' });
    assert.equal(r.tournament.name, 'Inter-School Championship');
    assert.equal(r.venue_name, 'Gachibowli Stadium');
    assert.equal(r.views, 340);
  });
  test('nothing for a match that doesn\'t exist or whose tournament was deleted', async () => {
    assert.equal(await share('00000000-0000-0000-0000-000000000000'), null);
    assert.equal(await share(await setup({ tournament: 'deleted' })), null);
  });
  test('a match closed by hand shows its result score when there\'s no summary', async () => {
    const id = await setup({ status: 'completed' });
    await db.sql(`update matches set result = $2 where id = $1`, [id, JSON.stringify({ kind: 'abandoned', score: { home: 3, away: 0 } })]);
    const r = (await share(id))!;
    assert.deepEqual(r.result_score, { home: 3, away: 0 });
  });
  test('only those fields: no scorers, hosts, state or formats', async () => {
    const r = (await share(await setup({ summary: { h: '0', a: '0', s: '1st Half' } })))!;
    for (const k of ['state', 'scorer_ids', 'host_ids', 'format', 'managers', 'officials']) assert.ok(!(k in r), k);
  });
  test('read-only, so the page can fetch it with a GET', async () => {
    const id = await setup({ summary: { h: '1', a: '1', s: '1st Half' } });
    await db.pg.transaction(async (tx) => {
      await tx.query(`set transaction read only`);
      await tx.query(`select share_match($1)`, [id]);
    });
  });
});

describe('break-it: only the people running a match can change its summary', () => {
  test('a stranger can\'t fake the score the link shows', async () => {
    const id = await setup({ summary: { h: '0', a: '0', s: '1st Half' } });
    const u = await db.signUp({ name: 'Faker', dob: '1990-01-01' });
    await db.as(u, `update matches set summary = '{"h":"9","a":"0","s":"Final"}' where id = $1`, [id]).catch(() => null);
    const [r] = await db.sql<{ summary: Record<string, string> }>(`select summary from matches where id = $1`, [id]);
    assert.equal(r.summary.h, '0');
  });
});
