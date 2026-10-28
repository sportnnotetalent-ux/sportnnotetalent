/**
 * Security Wave 2b — the app side of the consent model: "Requests to confirm"
 * (a link someone else made to my child / my player) and friendly acceptance,
 * against a real Postgres (PGlite, every migration applied).
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

type Who = { uid: string; player: string };
async function person(name: string, dob = '1985-01-01'): Promise<Who> {
  const uid = await db.signUp({ name, dob });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
  return { uid, player: p.id };
}
const sees = async (viewer: string, player: string) =>
  (await db.sql<{ v: boolean }>(`select player_full_visible_to($1, $2) as v`, [viewer, player]))[0].v;
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };
type Pending = { kind: string; group_id: string; group_name: string; player_id: string; player_name: string; added_by: string };

describe('requests to confirm', () => {
  let coachA: Who, coachB: Who, kid: string, teamB: string;
  before(async () => {
    coachA = await person('Coach Kumar');
    coachB = await person('Coach Shah');
    const [p] = await db.as<{ id: string }>(coachA.uid, `insert into players (full_name, dob) values ('Asha Rao', '2014-03-05') returning id`);
    kid = p.id;
    const [t] = await db.as<{ id: string }>(coachB.uid, `insert into teams (name, short_name, sport, roster) values ('Shah U12', 'S', 'football', $1) returning id`, [JSON.stringify([kid])]);
    teamB = t.id;
  });
  test('the child\'s side sees the link someone else made; nobody else does', async () => {
    const mine = await db.as<Pending>(coachA.uid, `select * from my_pending_links()`);
    assert.deepEqual(mine.map((x) => [x.kind, x.group_name, x.player_name, x.added_by]), [['team', 'Shah U12', 'Asha Rao', 'Coach Shah']]);
    assert.deepEqual(await db.as(coachB.uid, `select * from my_pending_links()`), [], 'the coach who added her has nothing to confirm');
    const stranger = await person('Stranger');
    assert.deepEqual(await db.as(stranger.uid, `select * from my_pending_links()`), []);
  });
  test('only the child\'s side can answer', async () => {
    const err = await errOf(() => db.as(coachB.uid, `select answer_link('team', $1, $2, true)`, [teamB, kid]));
    assert.match(err ?? '', /only .* can confirm/i);
    assert.equal(await sees(coachB.uid, kid), false);
  });
  test('confirming: the team\'s coach now sees her, and the request is gone', async () => {
    await db.as(coachA.uid, `select answer_link('team', $1, $2, true)`, [teamB, kid]);
    assert.equal(await sees(coachB.uid, kid), true);
    assert.deepEqual(await db.as(coachA.uid, `select * from my_pending_links()`), []);
  });
  test('"Not us": she leaves the team and the request doesn\'t come back', async () => {
    const coachC = await person('Coach Das');
    const [t] = await db.as<{ id: string }>(coachC.uid, `insert into teams (name, short_name, sport, roster, captain_id) values ('Das XI', 'D', 'cricket', $1, $2) returning id`, [JSON.stringify([kid]), kid]);
    assert.equal((await db.as<Pending>(coachA.uid, `select * from my_pending_links()`)).length, 1);
    await db.as(coachA.uid, `select answer_link('team', $1, $2, false)`, [t.id, kid]);
    const [after] = await db.sql<{ roster: string[]; captain_id: string | null }>(`select roster, captain_id from teams where id = $1`, [t.id]);
    assert.deepEqual([after.roster, after.captain_id], [[], null]);
    assert.deepEqual(await db.as(coachA.uid, `select * from my_pending_links()`), []);
    assert.equal(await sees(coachC.uid, kid), false);
  });
  test('a parent with a linked account answers for their child; a club and a community too', async () => {
    const parent = await db.signUp({ name: 'Meera Rao', dob: '1980-01-01' });
    const childUid = await db.signUp({ name: 'Ira Rao', dob: '2013-06-06' });
    const [c] = await db.as<{ id: string }>(childUid, `insert into players (full_name, profile_id, dob) values ('Ira Rao', $1, '2013-06-06') returning id`, [childUid]);
    await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [parent, c.id]);
    const owner = await person('Club Owner');
    const [club] = await db.as<{ id: string }>(owner.uid, `insert into clubs (name, short_name) values ('Rao FC', 'RFC') returning id`);
    await db.as(owner.uid, `insert into club_members (club_id, player_id) values ($1, $2)`, [club.id, owner.player]);   // the app adds the creator first
    await db.as(owner.uid, `insert into club_members (club_id, player_id) values ($1, $2)`, [club.id, c.id]);
    const [o] = await db.as<{ id: string }>(owner.uid, `insert into organizations (name, type, created_by) values ('Academy', 'Sports academy', auth.uid()) returning id`);
    await db.as(owner.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, owner.player]);
    await db.as(owner.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, c.id]);
    const pend = await db.as<Pending>(parent, `select * from my_pending_links() order by kind`);
    assert.deepEqual(pend.map((x) => x.kind), ['club', 'org']);
    await db.as(parent, `select answer_link('club', $1, $2, true)`, [club.id, c.id]);
    await db.as(parent, `select answer_link('org', $1, $2, false)`, [o.id, c.id]);
    assert.deepEqual(await db.sql(`select 1 from org_members where org_id = $1 and player_id = $2`, [o.id, c.id]), [], '"Not us": never a member');
    assert.equal(await sees(owner.uid, c.id), true, 'via the confirmed club');
    assert.deepEqual(await db.as(childUid, `select * from my_pending_links()`), [], 'the child sees the same list, now empty');
  });
  test('re-adding after "Not us": no new request, and still nothing revealed', async () => {
    const coachE = await person('Coach Eapen');
    const [t] = await db.as<{ id: string }>(coachE.uid, `insert into teams (name, short_name, sport, roster) values ('E XI', 'E', 'cricket', $1) returning id`, [JSON.stringify([kid])]);
    await db.as(coachA.uid, `select answer_link('team', $1, $2, false)`, [t.id, kid]);
    await db.as(coachE.uid, `update teams set roster = $2 where id = $1`, [t.id, JSON.stringify([kid])]);
    assert.deepEqual(await db.as(coachA.uid, `select * from my_pending_links()`), []);
    assert.equal(await sees(coachE.uid, kid), false);
    await db.as(coachA.uid, `select answer_link('team', $1, $2, true)`, [t.id, kid]);
    assert.equal(await sees(coachE.uid, kid), true, 'the side can still change its mind');
  });
  test('a field-event entry stays for its results when declined', async () => {
    const host = await person('Meet Host');
    const [e] = await db.as<{ id: string }>(host.uid, `insert into field_events (sport, title, host_ids) values ('athletics', '100m', $1) returning id`, [[host.player]]);
    await db.as(host.uid, `insert into field_entries (event_id, player_id) values ($1, $2)`, [e.id, kid]);
    assert.deepEqual((await db.as<Pending>(coachA.uid, `select * from my_pending_links()`)).map((x) => [x.kind, x.group_name]), [['field_event', '100m']]);
    await db.as(coachA.uid, `select answer_link('field_event', $1, $2, false)`, [e.id, kid]);
    assert.equal((await db.sql(`select 1 from field_entries where event_id = $1 and player_id = $2`, [e.id, kid])).length, 1);
    assert.equal(await sees(host.uid, kid), false);
  });
  test('nothing to answer for a link that doesn\'t exist; bad kinds refused', async () => {
    const coachF = await person('Coach F');
    const [t] = await db.as<{ id: string }>(coachF.uid, `insert into teams (name, short_name, sport, roster) values ('F', 'F', 'football', '[]') returning id`);
    assert.match(await errOf(() => db.as(coachA.uid, `select answer_link('team', $1, $2, true)`, [t.id, kid])) ?? '', /nothing to confirm/i);
    assert.match(await errOf(() => db.as(coachA.uid, `select answer_link('tournament', $1, $2, true)`, [t.id, kid])) ?? '', /unknown/i);
    assert.equal(await sees(coachF.uid, kid), false);
  });
  test('the tables are closed to clients; anonymous callers get nothing', async () => {
    for (const tbl of ['member_link_declines', 'match_team_consents']) {
      assert.ok(await errOf(() => db.as(coachA.uid, `select * from ${tbl}`)), `${tbl} readable`);
      assert.ok(await errOf(() => db.as(coachA.uid, `insert into ${tbl} (kind, group_id, player_id) values ('team', gen_random_uuid(), $1)`, [kid])), `${tbl} writable`);
    }
    assert.ok(await errOf(() => db.asAnon(`select * from my_pending_links()`)));
    assert.ok(await errOf(() => db.asAnon(`select * from my_pending_friendlies()`)));
    assert.ok(await errOf(() => db.as(coachA.uid, `select claim_player_by_phone($1, '+919800000000')`, [coachA.uid])), 'clients can\'t link by phone');
  });
});

describe('friendlies', () => {
  test('the opponent\'s manager accepts; then the host sees their players; nobody else can accept', async () => {
    const home = await person('Home Coach');
    const away = await person('Away Coach');
    const [k] = await db.as<{ id: string }>(away.uid, `insert into players (full_name, dob) values ('Away Kid', '2014-01-01') returning id`);
    const [ht] = await db.as<{ id: string }>(home.uid, `insert into teams (name, short_name, sport, roster) values ('Home', 'H', 'football', '[]') returning id`);
    const [at] = await db.as<{ id: string }>(away.uid, `insert into teams (name, short_name, sport, roster) values ('Away', 'A', 'football', $1) returning id`, [JSON.stringify([k.id])]);
    const [m] = await db.as<{ id: string }>(home.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status, starts_at) values ('football', $1, $2, $3, 'scheduled', now() + interval '2 days') returning id`, [ht.id, at.id, [home.player]]);
    assert.equal(await sees(home.uid, k.id), false);
    const pend = await db.as<{ match_id: string; team_id: string; other_team: string }>(away.uid, `select * from my_pending_friendlies()`);
    assert.deepEqual(pend.map((x) => [x.match_id, x.team_id, x.other_team]), [[m.id, at.id, 'Home']]);
    assert.deepEqual(await db.as(home.uid, `select * from my_pending_friendlies()`), [], 'the host has nothing to accept');
    const err = await errOf(() => db.as(home.uid, `select answer_friendly($1, $2, true)`, [m.id, at.id]));
    assert.match(err ?? '', /manager/i);
    await db.as(away.uid, `select answer_friendly($1, $2, true)`, [m.id, at.id]);
    assert.equal(await sees(home.uid, k.id), true);
    assert.deepEqual(await db.as(away.uid, `select * from my_pending_friendlies()`), []);
  });
  test('declining keeps the players private and the request goes away', async () => {
    const home = await person('Home Coach 2');
    const away = await person('Away Coach 2');
    const [k] = await db.as<{ id: string }>(away.uid, `insert into players (full_name, dob) values ('Away Kid 2', '2014-01-01') returning id`);
    const [ht] = await db.as<{ id: string }>(home.uid, `insert into teams (name, short_name, sport, roster) values ('H2', 'H', 'football', '[]') returning id`);
    const [at] = await db.as<{ id: string }>(away.uid, `insert into teams (name, short_name, sport, roster) values ('A2', 'A', 'football', $1) returning id`, [JSON.stringify([k.id])]);
    const [m] = await db.as<{ id: string }>(home.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled') returning id`, [ht.id, at.id, [home.player]]);
    await db.as(away.uid, `select answer_friendly($1, $2, false)`, [m.id, at.id]);
    assert.equal(await sees(home.uid, k.id), false);
    assert.deepEqual(await db.as(away.uid, `select * from my_pending_friendlies()`), []);
  });
  test('an outside scorer sees both sides once both agreed; swapping the opponent afterwards reveals nobody', async () => {
    const home = await person('Home Coach 3');
    const away = await person('Away Coach 3');
    const other = await person('Other Coach 3');
    const scorer = await person('Scorer 3');
    const [hk] = await db.as<{ id: string }>(home.uid, `insert into players (full_name, dob) values ('Home Kid 3', '2014-01-01') returning id`);
    const [ak] = await db.as<{ id: string }>(away.uid, `insert into players (full_name, dob) values ('Away Kid 3', '2014-01-01') returning id`);
    const [ok] = await db.as<{ id: string }>(other.uid, `insert into players (full_name, dob) values ('Other Kid 3', '2014-01-01') returning id`);
    const [ht] = await db.as<{ id: string }>(home.uid, `insert into teams (name, short_name, sport, roster) values ('H3', 'H', 'football', $1) returning id`, [JSON.stringify([hk.id])]);
    const [at] = await db.as<{ id: string }>(away.uid, `insert into teams (name, short_name, sport, roster) values ('A3', 'A', 'football', $1) returning id`, [JSON.stringify([ak.id])]);
    const [ot] = await db.as<{ id: string }>(other.uid, `insert into teams (name, short_name, sport, roster) values ('O3', 'O', 'football', $1) returning id`, [JSON.stringify([ok.id])]);
    const [m] = await db.as<{ id: string }>(home.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, scorer_ids, status) values ('football', $1, $2, $3, $4, 'scheduled') returning id`, [ht.id, at.id, [home.player], [scorer.player]]);
    assert.equal(await sees(scorer.uid, hk.id), true, 'the host agreed for their own team');
    assert.equal(await sees(scorer.uid, ak.id), false);
    await db.as(away.uid, `select answer_friendly($1, $2, true)`, [m.id, at.id]);
    assert.equal(await sees(scorer.uid, ak.id), true);
    assert.equal(await sees(away.uid, hk.id), false, 'the opponent\'s manager isn\'t a host or scorer');
    await db.as(home.uid, `update matches set away_team_id = $2 where id = $1`, [m.id, ot.id]);
    assert.equal(await sees(home.uid, ok.id), false, 'a new opponent must accept too');
    assert.equal(await sees(home.uid, ak.id), false, 'the old opponent no longer counts');
    assert.deepEqual((await db.as<{ team_id: string }>(other.uid, `select * from my_pending_friendlies()`)).map((x) => x.team_id), [ot.id]);
  });
  test('a tournament match isn\'t a friendly; a stranger can\'t answer for a team', async () => {
    const org = await person('Organiser 4');
    const stranger = await person('Stranger 4');
    const [tr] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ('Cup', 'O', auth.uid()) returning id`);
    const [ht] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('T4a', 'A', 'football', '[]') returning id`);
    const [m] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, home_team_id, status) values ('football', $1, $2, 'scheduled') returning id`, [tr.id, ht.id]);
    assert.match(await errOf(() => db.as(org.uid, `select answer_friendly($1, $2, true)`, [m.id, ht.id])) ?? '', /isn't playing this friendly/);
    const [st] = await db.as<{ id: string }>(stranger.uid, `insert into teams (name, short_name, sport, roster) values ('S4', 'S', 'football', '[]') returning id`);
    const [f] = await db.as<{ id: string }>(stranger.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled') returning id`, [st.id, ht.id, [stranger.player]]);
    assert.match(await errOf(() => db.as(stranger.uid, `select answer_friendly($1, $2, true)`, [f.id, ht.id])) ?? '', /manager/);
    assert.deepEqual((await db.as<{ team_id: string }>(org.uid, `select * from my_pending_friendlies()`)).map((x) => x.team_id), [ht.id]);
  });
  test('W2bB-11: a club\'s admin is asked about a friendly against a club team', async () => {
    const founder = await person('Club Founder');
    const admin = await person('Club Admin');
    const host = await person('Host 5');
    const [club] = await db.as<{ id: string }>(founder.uid, `insert into clubs (name, short_name) values ('Blue FC', 'BFC') returning id`);
    await db.as(founder.uid, `insert into club_members (club_id, player_id, role) values ($1, $2, 'admin'), ($1, $3, 'admin')`, [club.id, founder.player, admin.player]);
    const [ct] = await db.as<{ id: string }>(founder.uid, `insert into teams (name, short_name, sport, roster, club_id) values ('Blue U14', 'B', 'football', '[]', $1) returning id`, [club.id]);
    const [ht] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('H5', 'H', 'football', '[]') returning id`);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled') returning id`, [ht.id, ct.id, [host.player]]);
    assert.deepEqual((await db.as<{ match_id: string }>(admin.uid, `select * from my_pending_friendlies()`)).map((x) => x.match_id), [m.id]);
    await db.as(admin.uid, `select answer_friendly($1, $2, true)`, [m.id, ct.id]);
  });
});

describe('verify your number to link the profile a coach made (W1-2b)', () => {
  const claim = async (uid: string, phone: string) =>
    (await db.asService<{ r: string }>(`select claim_player_by_phone($1, $2) as r`, [uid, phone]))[0].r;
  test('no own profile yet: linked, number verified', async () => {
    const coach = await person('Coach G');
    const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, phone, dob) values ('Ravi G', '+919811100001', '2010-04-04') returning id`);
    const uid = await db.signUp({ email: 'ravi@x.in', name: 'Ravi G', dob: '2010-04-04' });
    assert.equal(await claim(uid, '+91 98111 00001'), 'linked');
    const [row] = await db.sql<{ profile_id: string; phone_verified: boolean }>(`select profile_id, phone_verified from players where id = $1`, [p.id]);
    assert.deepEqual([row.profile_id, row.phone_verified], [uid, true]);
  });
  test('an empty own profile is replaced; its details carry over', async () => {
    const coach = await person('Coach H');
    const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, phone, dob) values ('Sana H', '+919811100002', '2011-01-01') returning id`);
    const uid = await db.signUp({ email: 'sana@x.in', name: 'Sana Hussain', dob: '2011-07-07' });
    const [own] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ('Sana Hussain', $1, '2011-07-07') returning id`, [uid]);
    assert.equal(await claim(uid, '+919811100002'), 'linked');
    assert.deepEqual(await db.sql(`select 1 from players where id = $1`, [own.id]), []);
    const [row] = await db.sql<{ profile_id: string; full_name: string; dob: string }>(`select profile_id, full_name, dob::text from players where id = $1`, [p.id]);
    assert.deepEqual([row.profile_id, row.full_name, row.dob], [uid, 'Sana Hussain', '2011-07-07']);
  });
  test('both profiles have history, a parent\'s birth year, or no match: support / none', async () => {
    const coach = await person('Coach I');
    await db.as(coach.uid, `insert into players (full_name, phone, dob) values ('Kid I', '+919811100003', '2013-03-03')`);
    const parent = await db.signUp({ email: 'parent@x.in', name: 'Parent I', dob: '1982-02-02' });
    assert.equal(await claim(parent, '+919811100003'), 'support', 'a parent verifying their own number doesn\'t take the child\'s profile');
    await db.as(coach.uid, `insert into players (full_name, phone) values ('Teen J', '+919811100004')`);
    const teen = await db.signUp({ email: 'teen@x.in', name: 'Teen J', dob: '2009-09-09' });
    const [own] = await db.as<{ id: string }>(teen, `insert into players (full_name, profile_id) values ('Teen J', $1) returning id`, [teen]);
    await db.as(teen, `insert into teams (name, short_name, sport, roster) values ('Mine', 'M', 'football', $1)`, [JSON.stringify([own.id])]);
    assert.equal(await claim(teen, '+919811100004'), 'support');
    assert.equal(await claim(teen, '+919811199999'), 'none');
    assert.equal(await claim(teen, 'not a number'), 'none');
  });
  test('W2bB-06: the name must match too — a parent or stranger can\'t take a child\'s profile with no birth date', async () => {
    const coach = await person('Coach K');
    const [kid] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, phone) values ('Asha Kapoor', '+919811100005') returning id`);
    const parent = await db.signUp({ email: 'mum@x.in', name: 'Meera Kapoor', dob: '1984-04-04' });
    assert.equal(await claim(parent, '+919811100005'), 'support', 'same surname, different person');
    const stranger = await db.signUp({ email: 'str@x.in', name: 'Vikram Shah', dob: '1990-01-01' });
    assert.equal(await claim(stranger, '+919811100005'), 'support');
    const [still] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [kid.id]);
    assert.equal(still.profile_id, null);
    const asha = await db.signUp({ email: 'asha@x.in', name: '  asha  KAPOOR ', dob: '2012-12-12' });
    assert.equal(await claim(asha, '+919811100005'), 'linked', 'the same first name, any case or spacing');
  });
  test('W2bB-07: an own profile with a sport profile, stats or messages counts as history', async () => {
    const coach = await person('Coach L');
    for (const [i, extra] of [
      [6, `insert into player_sport_profiles (player_id, sport, data) values ($1, 'football', '{}')`],
      [7, `insert into certificates (code, player_id, kind, title) values (md5(random()::text), $1, 'award', 'Best bowler')`],
      [8, `insert into tournament_officials (tournament_id, player_id, role) select t.id, $1, 'referee' from tournaments t limit 1`],
    ] as const) {
      await db.as(coach.uid, `insert into players (full_name, phone) values ('Kiran L${i}', $1)`, [`+91981110000${i}`]);
      const uid = await db.signUp({ email: `kiran${i}@x.in`, name: `Kiran L${i}`, dob: '2000-01-01' });
      const [own] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ($1, $2) returning id`, [`Kiran L${i}`, uid]);
      await db.asService(extra, [own.id]);
      assert.equal(await claim(uid, `+91981110000${i}`), 'support', extra);
    }
  });
});
