/** Sign-up source against a real Postgres (PGlite): who may record it, what is
 *  kept, and the dashboard's counts (docs/security/breaks/signup-source.md). */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
let support: string, inviter: string, inviterPlayer: string, game: string, cup: string;
const rec = async (uid: string, kind: string, ref: string | null) =>
  (await db.as<{ r: string }>(uid, `select record_signup_source($1, $2) as r`, [kind, ref]))[0].r;
const row = async (uid: string) => (await db.sql<{ kind: string; ref: string | null }>(`select kind, ref from signup_sources where profile_id = $1`, [uid]))[0];
const adult = (name: string) => db.signUp({ name, dob: '1992-02-02' });

before(async () => {
  db = await bootDb({ strict: true });
  support = await db.signUp({ name: 'Sam Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  inviter = await adult('Ira Inviter');
  [{ id: inviterPlayer }] = await db.sql<{ id: string }>(`insert into players (full_name, profile_id) values ('Ira Inviter', $1) returning id`, [inviter]);
  const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Reds', 'R', 'football') returning id`);
  const [b] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('Blues', 'B', 'football') returning id`);
  [{ id: game }] = await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status) values ('football', $1, $2, 'scheduled') returning id`, [a.id, b.id]);
  [{ id: cup }] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, sports) values ('Winter Cup', 'Ira', '{football}') returning id`);
});

describe('SS2/SS3/SS4 who may record, and only once', () => {
  test('a new account records its source once; the first wins', async () => {
    const u = await adult('Nia New');
    assert.equal(await rec(u, 'game', game), 'saved');
    assert.equal(await rec(u, 'invite', inviterPlayer), 'already');
    assert.deepEqual(await row(u), { kind: 'game', ref: game });
  });
  test('SS2: an account older than 48 hours is not a new sign-up', async () => {
    const u = await adult('Olu Old');
    await db.sql(`update profiles set created_at = now() - interval '3 days' where id = $1`, [u]);
    assert.equal(await rec(u, 'game', game), 'too_late');
    assert.equal(await row(u), undefined);
  });
  test('SS4: anon cannot record; nobody reads or writes the table directly', async () => {
    assert.ok(await errOf(() => db.asAnon(`select record_signup_source('game', null)`)));
    const u = await adult('Tess Table');
    assert.ok(await errOf(() => db.as(u, `select * from signup_sources`)));
    assert.ok(await errOf(() => db.as(u, `insert into signup_sources (profile_id, kind) values ($1, 'game')`, [u])));
  });
});

describe('SS5/SS6/SS7 what is kept', () => {
  test('SS5: unknown kinds refused; junk or made-up refs dropped, kind kept', async () => {
    const u = await adult('Jun Junk');
    assert.match(await errOf(() => rec(u, 'hacker', null)) ?? '', /bad_kind/);
    assert.equal(await rec(u, 'game', "x'; drop table matches; --"), 'saved');
    assert.deepEqual(await row(u), { kind: 'game', ref: null });
    const v = await adult('Mo Madeup');
    assert.equal(await rec(v, 'tournament', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'), 'saved');
    assert.deepEqual(await row(v), { kind: 'tournament', ref: null }, 'no such tournament');
    const w = await adult('Tia Tourney');
    assert.equal(await rec(w, 'tournament', cup), 'saved');
    assert.deepEqual(await row(w), { kind: 'tournament', ref: cup });
  });
  test('SS1: refs are never kept for token kinds', async () => {
    const u = await adult('Tok Token');
    await rec(u, 'team', game);
    assert.deepEqual(await row(u), { kind: 'team', ref: null });
  });
  test('SS6: "invited by myself" keeps no ref; a real inviter is kept', async () => {
    const u = await adult('Sel Self');
    const [{ id: mine }] = await db.sql<{ id: string }>(`insert into players (full_name, profile_id) values ('Sel Self', $1) returning id`, [u]);
    await rec(u, 'invite', mine);
    assert.deepEqual(await row(u), { kind: 'invite', ref: null });
    const f = await adult('Fay Friend');
    await rec(f, 'invite', inviterPlayer);
    assert.deepEqual(await row(f), { kind: 'invite', ref: inviterPlayer });
  });
  test('SS7: a minor or someone with no birth date keeps the kind only', async () => {
    const kid = await db.signUp({ name: 'Kai Kid', dob: '2013-03-03' });
    await rec(kid, 'invite', inviterPlayer);
    assert.deepEqual(await row(kid), { kind: 'invite', ref: null });
  });
  test('SS9: deleting the account deletes its source', async () => {
    const u = await adult('Del Gone');
    await rec(u, 'game', game);
    await db.sql(`delete from profiles where id = $1`, [u]);
    assert.equal(await row(u), undefined);
  });
});

describe('SS10 dashboard', () => {
  test('sign-ups from links per week, by source, and each person’s source', async () => {
    const d = (await db.as<{ d: { weeks: Record<string, number>[]; by_source: { kind: string; signups: number }[] } }>(support, `select usage_dashboard(1) as d`))[0].d;
    assert.ok(Number(d.weeks[0].from_links) >= 6);
    const by = Object.fromEntries(d.by_source.map((x) => [x.kind, x.signups]));
    assert.ok(by.invite >= 3 && by.game >= 2);
    assert.ok(by.direct >= 1, 'sign-ups with no source are Direct / unknown');
    assert.doesNotMatch(JSON.stringify(d), /[0-9a-f]{8}-[0-9a-f]{4}-/, 'still counts only');
    const rows = (await db.as<{ r: Record<string, unknown>[] }>(support, `select usage_people('signups') as r`))[0].r;
    const fay = rows.find((r) => r.name === 'Fay Friend')!;
    assert.equal(fay.source, 'invite');
    assert.equal(fay.source_detail, 'Ira Inviter');
    assert.equal(rows.find((r) => r.name === 'Nia New')?.source_detail, 'Reds v Blues');
    assert.equal(rows.find((r) => r.name === 'Tia Tourney')?.source_detail, 'Winter Cup');
    assert.equal(rows.find((r) => r.name === 'Kai Kid')?.source_detail ?? null, null);
    assert.equal(rows.find((r) => r.name === 'Sam Support')?.source ?? null, null);
  });
});
