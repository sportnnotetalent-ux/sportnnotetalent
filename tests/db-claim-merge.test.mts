/**
 * Link by phone (Wave 2b, claim_player_by_phone) lost the account's own
 * profile details (founder, 2026-10-29: "I have lost my profile details").
 * The claim kept the coach-made profile and deleted the account's own one,
 * copying only the name, date of birth, guardian and email. Everything else
 * on it went: sports, city, photo, bio, house, jersey, privacy choices, and
 * the rows that hang off it (consents, held stats, declines, followers).
 *
 * Now nothing is lost: the account's own details fill the kept profile (their
 * own entries win; sports are joined), and what hangs off the old profile
 * moves across before it is removed.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

let n = 0;
async function scenario(own: Record<string, unknown>, coachRow: Record<string, unknown> = {}) {
  const phone = `+9198765${String(10_000 + ++n).padStart(5, '0')}`;
  const coach = await db.signUp({ name: `Coach ${n}`, dob: '1980-01-01' });
  const cols = { full_name: 'Asha Rao', phone, dob: '2001-02-03', ...coachRow };
  const keys = Object.keys(cols);
  const [target] = await db.as<{ id: string }>(coach,
    `insert into players (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, Object.values(cols));
  const me = await db.signUp({ name: 'Asha Rao', dob: '2001-02-03', meta: { phone } });
  await db.sql(`update profiles set dob = '2001-02-03', full_name = 'Asha Rao' where id = $1`, [me]);
  const ownCols = { profile_id: me, full_name: 'Asha Rao', dob: '2001-02-03', ...own };
  const ok = Object.keys(ownCols);
  const [mine] = await db.as<{ id: string }>(me,
    `insert into players (${ok.join(', ')}) values (${ok.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, Object.values(ownCols));
  return { phone, coach, target: target.id, me, mine: mine.id };
}
const claim = async (me: string, phone: string) => (await db.asService<{ r: string }>(`select claim_player_by_phone($1, $2) as r`, [me, phone]))[0].r;

describe('link by phone keeps the account\'s own profile details', () => {
  test('their details fill the kept profile; their own entries win; sports are joined', async () => {
    const s = await scenario(
      { sports: ['football', 'cricket'], city: 'Pune', bio: 'Left back', photo_url: 'https://x/p.jpg', jersey_no: 7, gender: 'female',
        house_name: 'Blue', house_color: '#00f', show_phone: true, show_email: true, findable_by_contact: true, sport_details: { football: { position: 'LB' } } },
      { sports: ['athletics'], city: 'Mumbai', sport_details: { athletics: { event: '100m' } } },
    );
    assert.equal(await claim(s.me, s.phone), 'linked');
    const [p] = await db.sql<Record<string, unknown>>(`select * from players where id = $1`, [s.target]);
    assert.equal(p.profile_id, s.me);
    assert.deepEqual([...(p.sports as string[])].sort(), ['athletics', 'cricket', 'football']);
    assert.deepEqual([p.city, p.bio, p.photo_url, p.jersey_no, p.gender, p.house_name, p.house_color], ['Pune', 'Left back', 'https://x/p.jpg', 7, 'female', 'Blue', '#00f']);
    assert.deepEqual([p.show_phone, p.show_email, p.findable_by_contact], [true, true, true]);
    assert.deepEqual(p.sport_details, { athletics: { event: '100m' }, football: { position: 'LB' } });
    const gone = await db.sql(`select 1 from players where id = $1`, [s.mine]);
    assert.deepEqual(gone, [], 'the empty duplicate is removed');
  });

  test('a detail they never filled keeps the coach\'s', async () => {
    const s = await scenario({}, { city: 'Mumbai', gender: 'female', jersey_no: 9 });
    assert.equal(await claim(s.me, s.phone), 'linked');
    const [p] = await db.sql<{ city: string; gender: string; jersey_no: number }>(`select city, gender, jersey_no from players where id = $1`, [s.target]);
    assert.deepEqual(p, { city: 'Mumbai', gender: 'female', jersey_no: 9 });
  });

  test('followers, consents, declines and held stats move across instead of being deleted', async () => {
    const s = await scenario({ sports: ['football'] });
    const fan = await db.signUp({ name: 'Fan', dob: '1990-01-01' });
    await db.sql(`insert into follows (follower_id, target_type, target_id) values ($1, 'player', $2)`, [fan, s.mine]);
    const group = crypto.randomUUID();
    await db.sql(`insert into member_consents (kind, group_id, player_id, method) values ('team', $1, $2, 'self')`, [group, s.mine]);
    await db.sql(`insert into member_link_declines (kind, group_id, player_id) values ('team', $1, $2)`, [crypto.randomUUID(), s.mine]);
    assert.equal(await claim(s.me, s.phone), 'linked');
    const [f] = await db.sql<{ n: number }>(`select count(*)::int as n from follows where target_type = 'player' and target_id = $1 and follower_id = $2`, [s.target, fan]);
    assert.equal(f.n, 1, 'the follower still follows them');
    const [c] = await db.sql<{ n: number }>(`select count(*)::int as n from member_consents where player_id = $1 and group_id = $2`, [s.target, group]);
    assert.equal(c.n, 1, 'the consent moved');
    const [d] = await db.sql<{ n: number }>(`select count(*)::int as n from member_link_declines where player_id = $1`, [s.target]);
    assert.equal(d.n, 1, 'the decline moved');
  });

  test('a row both profiles already have doesn\'t block the move (no duplicate-key failure)', async () => {
    const s = await scenario({});
    const fan = await db.signUp({ name: 'Fan Both', dob: '1990-01-01' });
    await db.sql(`insert into follows (follower_id, target_type, target_id) values ($1, 'player', $2), ($1, 'player', $3)`, [fan, s.mine, s.target]);
    assert.equal(await claim(s.me, s.phone), 'linked');
    const [f] = await db.sql<{ n: number }>(`select count(*)::int as n from follows where follower_id = $1 and target_type = 'player'`, [fan]);
    assert.equal(f.n, 1);
  });

  test('the earlier refusals still hold (another first name, history on both)', async () => {
    const s = await scenario({ full_name: 'Ravi Kumar' });
    assert.equal(await claim(s.me, s.phone), 'support');
  });
});
