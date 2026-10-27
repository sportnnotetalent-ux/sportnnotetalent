/**
 * Security Wave 1 (docs/security/audit-2026-10-27/PLAN.md) — integration tests
 * against a real Postgres (PGlite, every migration applied): each one first
 * reproduces the hole (red), then guards the fix.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

/** A signed-in person with their own player row. */
async function person(name: string, extra: { dob?: string; phone?: string; phoneConfirmed?: boolean } = {}) {
  const uid = await db.signUp({ name, dob: extra.dob ?? '1985-01-01', phone: extra.phone, phoneConfirmed: extra.phoneConfirmed });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, extra.dob ?? '1985-01-01']);
  return { uid, player: p.id };
}
/** A child a coach typed in (unclaimed, no account). */
async function child(coachUid: string, extra: { phone?: string; guardianEmail?: string; dob?: string; name?: string } = {}) {
  const [p] = await db.as<{ id: string }>(coachUid,
    `insert into players (full_name, dob, phone, guardian) values ($1, $2, $3, $4) returning id`,
    [extra.name ?? 'Asha Rao', extra.dob ?? '2014-03-05', extra.phone ?? null,
      JSON.stringify({ name: 'Meera Rao', email: extra.guardianEmail ?? 'meera.parent@example.com' })]);
  return p.id;
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

describe('W1-1 (EF-01 / DB-04) a co-manager can\'t change a child\'s guardian or date of birth', () => {
  test('the coach who added the child can; an assistant on the team can\'t', async () => {
    const coach = await person('Coach Kumar');
    const assistant = await person('Assistant Das');
    const kid = await child(coach.uid);
    // the coach's team, the assistant made a team admin (a real, legitimate co-manager)
    await db.as(coach.uid, `insert into teams (name, short_name, sport, roster, admin_ids) values ('U12 A', 'U12', 'football', $1, $2)`,
      [JSON.stringify([kid]), [assistant.player]]);
    // the assistant may still fix a name…
    await db.as(assistant.uid, `update players set full_name = 'Asha R. Rao' where id = $1`, [kid]);
    // …but not the guardian contact or the date of birth
    await db.as(assistant.uid, `update players set guardian = $2, dob = '2000-01-01' where id = $1`,
      [kid, JSON.stringify({ name: 'Someone', email: 'someone.else@example.com' })]);
    const [after] = await db.sql<{ full_name: string; email: string; dob: string }>(
      `select full_name, guardian->>'email' as email, dob::text from players where id = $1`, [kid]);
    assert.equal(after.full_name, 'Asha R. Rao');
    assert.equal(after.email, 'meera.parent@example.com', 'guardian contact locked for a non-creator');
    assert.equal(after.dob, '2014-03-05', 'date of birth locked for a non-creator');
    // the coach who added her still can
    await db.as(coach.uid, `update players set guardian = $2 where id = $1`, [kid, JSON.stringify({ name: 'Meera Rao', email: 'meera.new@example.com' })]);
    const [mine] = await db.sql<{ email: string }>(`select guardian->>'email' as email from players where id = $1`, [kid]);
    assert.equal(mine.email, 'meera.new@example.com');
  });
});

describe('W1-2 (DB-02) a profile is claimed only with a verified number (or confirmed email)', () => {
  test('a typed-in profile phone no longer claims a child', async () => {
    const coach = await person('Coach Iyer');
    const kid = await child(coach.uid, { phone: '+919845000001' });
    const stranger = await db.signUp({ name: 'Stranger', dob: '1990-01-01' });
    await db.as(stranger, `update profiles set phone = '+919845000001' where id = auth.uid()`);
    const [found] = await db.as<{ id: string | null }>(stranger, `select my_claimable_player() as id`);
    assert.equal(found.id, null, 'not offered as claimable');
    // refused: either an error, or (now that it isn't claimable) the row isn't even visible to them
    await errOf(() => db.as(stranger, `update players set profile_id = auth.uid() where id = $1`, [kid]));
    const [after] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [kid]);
    assert.equal(after.profile_id, null, 'the child is still unclaimed');
  });
  test('the real holder of the number (signed in by phone) can claim', async () => {
    const coach = await person('Coach Menon');
    const kid = await child(coach.uid, { phone: '+919845000002', name: 'Ravi Kumar', dob: '2005-01-01' });
    const ravi = await db.signUp({ name: 'Ravi Kumar', dob: '2005-01-01', phone: '919845000002', phoneConfirmed: true });
    const [found] = await db.as<{ id: string | null }>(ravi, `select my_claimable_player() as id`);
    assert.equal(found.id, kid);
    await db.as(ravi, `update players set profile_id = auth.uid() where id = $1`, [kid]);
    const [p] = await db.sql<{ profile_id: string }>(`select profile_id from players where id = $1`, [kid]);
    assert.equal(p.profile_id, ravi);
  });
  test('…and a confirmed sign-in email still claims a profile added with that email', async () => {
    const coach = await person('Coach Pai');
    const [kid] = await db.as<{ id: string }>(coach.uid,
      `insert into players (full_name, dob, email) values ('Tara Pai', '2004-01-01', 'tara.pai@example.com') returning id`);
    const tara = await db.signUp({ name: 'Tara Pai', dob: '2004-01-01', email: 'tara.pai@example.com' });
    const [found] = await db.as<{ id: string | null }>(tara, `select my_claimable_player() as id`);
    assert.equal(found.id, kid.id);
    await db.as(tara, `update players set profile_id = auth.uid() where id = $1`, [kid.id]);
    const [p] = await db.sql<{ profile_id: string }>(`select profile_id from players where id = $1`, [kid.id]);
    assert.equal(p.profile_id, tara);
  });
});

describe('W1-3 (DB-03) meet ages only for the meet\'s own entrants, and not as a date-of-birth oracle', () => {
  test('a child who isn\'t entered gets no age back', async () => {
    const coach = await person('Coach Shah');
    const kid = await child(coach.uid, { dob: '2014-03-05' });
    const org = await person('Meet Organiser');
    const [t] = await db.as<{ id: string }>(org.uid,
      `insert into tournaments (name, host_name, sports, start_date, end_date, organizer_id, formats)
       values ('Spring Meet', 'Org', '{athletics}', '2026-05-17', '2026-05-17', auth.uid(), '{"athletics":{"ageOn":"meet"}}') returning id`);
    const rows = await db.as(org.uid, `select * from meet_ages($1, 'athletics', $2)`, [t.id, [kid]]);
    assert.deepEqual(rows, []);
  });
  test('an entrant does', async () => {
    const org = await person('Meet Organiser 2');
    const kid = await child(org.uid, { dob: '2014-03-05', name: 'Diya Joshi' });
    const [t] = await db.as<{ id: string }>(org.uid,
      `insert into tournaments (name, host_name, sports, start_date, end_date, organizer_id) values ('Autumn Meet', 'Org', '{athletics}', '2026-10-17', '2026-10-17', auth.uid()) returning id`);
    const [team] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('Red House', 'RED', 'athletics', $1) returning id`, [JSON.stringify([kid])]);
    await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id) values ($1, $2)`, [t.id, team.id]);
    const rows = await db.as<{ id: string; age: number }>(org.uid, `select * from meet_ages($1, 'athletics', $2)`, [t.id, [kid]]);
    assert.deepEqual(rows.map((r) => r.id), [kid]);
  });
  test('the cut-off dates a person can read are limited (a binary search needs ~9)', async () => {
    const org = await person('Curious Organiser');
    const kid = await child(org.uid, { dob: '2014-03-05', name: 'Kian Das' });
    const [team] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('Blue', 'BLU', 'athletics', $1) returning id`, [JSON.stringify([kid])]);
    const [t] = await db.as<{ id: string }>(org.uid,
      `insert into tournaments (name, host_name, sports, start_date, end_date, organizer_id, formats) values ('M', 'O', '{athletics}', '2026-01-10', '2026-01-10', auth.uid(), '{"athletics":{"ageOn":"meet"}}') returning id`);
    await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id) values ($1, $2)`, [t.id, team.id]);
    let refused = 0;
    for (let d = 1; d <= 9; d++) {
      await db.as(org.uid, `update tournaments set start_date = $2 where id = $1`, [t.id, `2026-0${Math.min(d, 9)}-15`]);
      const e = await errOf(() => db.as(org.uid, `select * from meet_ages($1, 'athletics', $2)`, [t.id, [kid]]));
      if (e) refused += 1;
    }
    assert.ok(refused >= 3, `${9 - refused} different cut-offs were read in a day (at most 6)`);
  });
});

describe('W1-4 (DB-06) nobody can join someone else\'s team-tie series', () => {
  test('a match can\'t claim another host\'s series id; the real host still can add rubbers', async () => {
    const host = await person('Tie Host');
    const intruder = await person('Intruder');
    const fmt = JSON.stringify({ __tie: true, __seriesId: 'series-abc', __seriesLeg: '1' });
    await db.as(host.uid, `insert into matches (sport, host_ids, format) values ('badminton', $1, $2)`, [[host.player], fmt]);
    await db.as(host.uid, `insert into matches (sport, host_ids, format) values ('badminton', $1, $2)`, [[host.player], fmt.replace('"1"', '"2"')]);
    const err = await errOf(() => db.as(intruder.uid, `insert into matches (sport, host_ids, format) values ('badminton', $1, $2)`, [[intruder.player], fmt]));
    assert.match(err ?? '', /series/i);
    const [h] = await db.as<{ ok: boolean }>(intruder.uid, `select is_tie_host('series-abc') as ok`);
    assert.equal(h.ok, false);
    // moving an existing match into the series is refused too
    const [own] = await db.as<{ id: string }>(intruder.uid, `insert into matches (sport, host_ids) values ('badminton', $1) returning id`, [[intruder.player]]);
    const err2 = await errOf(() => db.as(intruder.uid, `update matches set format = $2 where id = $1`, [own.id, fmt]));
    assert.match(err2 ?? '', /series/i);
  });
});

describe('W1-7 (DB-09 / CL-02) phone and email lookups don\'t return a child\'s full name', () => {
  test('a child comes back as initials; an adult by name', async () => {
    const coach = await person('Coach Nair');
    await child(coach.uid, { phone: '+919845000077', name: 'Myra Joshi' });
    const adultCoach = await person('Coach Adult', { dob: '1980-01-01' });
    await db.asService(`update players set phone = '+919845000088' where id = $1`, [adultCoach.player]);
    const looker = await person('Looker');
    const [kidRow] = await db.as<{ full_name: string }>(looker.uid, `select * from find_player_by_phone('+919845000077')`);
    assert.equal(kidRow.full_name, 'M. J.');
    const [adultRow] = await db.as<{ full_name: string }>(looker.uid, `select * from find_player_by_phone('+919845000088')`);
    assert.equal(adultRow.full_name, 'Coach Adult');
  });
});
