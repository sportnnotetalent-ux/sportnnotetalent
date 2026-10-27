/**
 * Security Wave 1 — simulating hundreds of users against a real Postgres
 * (quality mandate step 6). 100 coaches each add 3 children and a team with an
 * assistant coach (a legitimate co-manager) and run a team-tie series; 200
 * strangers then try every hole Wave 1 closed, and the assistants push their
 * co-manager rights. Invariants, at the end:
 *  - no child is claimed by anyone (typed-in phone numbers claim nothing);
 *  - no child's guardian contact or date of birth changed except by their coach;
 *  - a phone lookup never returns a child's full name;
 *  - no stranger's match joined any coach's series, and no stranger is a tie host;
 *  - the coaches' own edits all went through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('100 coaches, 100 assistants, 300 children and 200 strangers — no break gets through', async () => {
  const db = await bootDb({ strict: true });
  const r = mulberry32(20261028);
  const t0 = Date.now();
  const FIRST = ['Asha', 'Rahul', 'Priya', 'Vihaan', 'Diya', 'Arjun', 'Meera', 'Kabir', 'Ira', 'Rohan'];
  const LAST = ['Rao', 'Kumar', 'Shah', 'Iyer', 'Das', 'Nair'];
  const me = async (name: string, dob = '1985-01-01') => {
    const uid = await db.signUp({ name, dob });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
    return { uid, player: p.id };
  };
  type Kid = { id: string; phone: string; email: string; dob: string; name: string; coach: string };
  const kids: Kid[] = [];
  const series: string[] = [];
  const coaches: { uid: string; player: string }[] = [];
  const assistants: { uid: string; player: string; kids: string[] }[] = [];

  for (let c = 0; c < 100; c++) {
    const coach = await me(`Coach ${c}`);
    const assistant = await me(`Assistant ${c}`);
    coaches.push(coach);
    const mine: string[] = [];
    for (let k = 0; k < 3; k++) {
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const phone = `+9198${String(c).padStart(3, '0')}${String(k).padStart(2, '0')}777`;
      const email = `parent.${c}.${k}@example.com`;
      const dob = `20${10 + Math.floor(r() * 6)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`;
      const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob, phone, guardian) values ($1, $2, $3, $4) returning id`,
        [name, dob, phone, JSON.stringify({ name: 'Parent', email })]);
      kids.push({ id: p.id, phone, email, dob, name, coach: coach.uid });
      mine.push(p.id);
    }
    await db.as(coach.uid, `insert into teams (name, short_name, sport, roster, admin_ids) values ($1, 'T', 'badminton', $2, $3)`,
      [`Team ${c}`, JSON.stringify(mine), [assistant.player]]);
    assistants.push({ ...assistant, kids: mine });
    const sid = `tie-${c}`;
    series.push(sid);
    await db.as(coach.uid, `insert into matches (sport, host_ids, format) values ('badminton', $1, $2)`, [[coach.player], JSON.stringify({ __tie: true, __seriesId: sid, __seriesLeg: '1' })]);
  }

  let attempts = 0, lookups = 0;
  for (let s = 0; s < 200; s++) {
    const stranger = await me(`Stranger ${s}`, '1990-01-01');
    const kid = kids[Math.floor(r() * kids.length)];
    // 1. claim with a typed-in number
    // (profile numbers are unique — a second stranger typing the same one is refused; DB-17)
    await db.as(stranger.uid, `update profiles set phone = $1 where id = auth.uid()`, [kid.phone]).catch(() => undefined);
    await db.as(stranger.uid, `update players set profile_id = auth.uid() where id = $1`, [kid.id]).catch(() => undefined);
    attempts++;
    // 2. read the name through a lookup
    const rows = await db.as<{ full_name: string }>(stranger.uid, `select full_name from find_player_by_phone($1)`, [kid.phone]).catch(() => []);
    for (const x of rows) assert.notEqual(x.full_name, kid.name, `lookup returned ${kid.name}`);
    lookups++;
    // 3. join a coach's series
    const sid = series[Math.floor(r() * series.length)];
    await db.as(stranger.uid, `insert into matches (sport, host_ids, format) values ('badminton', $1, $2)`,
      [[stranger.player], JSON.stringify({ __tie: true, __seriesId: sid, __seriesLeg: '9' })]).catch(() => undefined);
    const [h] = await db.as<{ ok: boolean }>(stranger.uid, `select is_tie_host($1) as ok`, [sid]);
    assert.equal(h.ok, false, `stranger ${s} became a host of ${sid}`);
    // 4. try to edit a child they don't manage
    await db.as(stranger.uid, `update players set guardian = $2, dob = '2000-01-01' where id = $1`, [kid.id, JSON.stringify({ email: `evil${s}@example.com` })]).catch(() => undefined);
    attempts += 2;
  }
  // 5. every assistant pushes their co-manager rights on their team's children
  for (const a of assistants) {
    for (const kidId of a.kids) {
      await db.as(a.uid, `update players set guardian = $2, dob = '1999-09-09' where id = $1`, [kidId, JSON.stringify({ email: 'assistant.takeover@example.com' })]).catch(() => undefined);
      attempts++;
    }
  }
  // 6. a third of the coaches legitimately fix a parent's email
  const fixed = new Map<string, string>();
  for (const k of kids.filter((_, i) => i % 9 === 0)) {
    const email = `new.${k.id.slice(0, 6)}@example.com`;
    await db.as(k.coach, `update players set guardian = $2 where id = $1`, [k.id, JSON.stringify({ name: 'Parent', email })]);
    fixed.set(k.id, email);
  }

  // ---- invariants -----------------------------------------------------------
  const after = await db.sql<{ id: string; profile_id: string | null; email: string; dob: string }>(
    `select id, profile_id, guardian->>'email' as email, dob::text from players where id = any($1)`, [kids.map((k) => k.id)]);
  const byId = new Map(after.map((x) => [x.id, x]));
  for (const k of kids) {
    const a = byId.get(k.id)!;
    assert.equal(a.profile_id, null, `${k.name} was claimed`);
    assert.equal(a.email, fixed.get(k.id) ?? k.email, `${k.name}'s guardian changed`);
    assert.equal(a.dob, k.dob, `${k.name}'s date of birth changed`);
  }
  const [foreign] = await db.sql<{ n: number }>(
    `select count(*)::int as n from matches m where m.format->>'__seriesId' like 'tie-%' and m.format->>'__seriesLeg' = '9'`);
  assert.equal(foreign.n, 0, 'a stranger joined a series');
  const ms = Date.now() - t0;
  console.log(`simulated ${coaches.length} coaches, ${assistants.length} assistants, ${kids.length} children, 200 strangers: ${attempts} break attempts, ${lookups} lookups, ${fixed.size} legitimate fixes — ${ms} ms`);
  assert.ok(ms < 60_000, `took ${ms} ms`);
});
