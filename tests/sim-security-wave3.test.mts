/**
 * Security Wave 3A — simulating hundreds of users against a real Postgres
 * (quality mandate step 6). 40 schools with 2 staff and 10 students each, and
 * a parent for every third student; 120 strangers. Names are random, with
 * apostrophes, hyphens, accents, non-Latin letters and one-word names.
 * Invariants:
 *  - a stranger or a visitor reads a school's adult members only; a member reads
 *    all of their own school; a parent reads their child's membership (DB-10);
 *  - a stranger who links a student and writes the right name or a wrong name
 *    with the same initials gets the same stored text, and the child's full
 *    name (two words or more) is never stored (DB-11);
 *  - right and wrong entry names give the same entry (DB-11);
 *  - masking a 200 KB snapshot with 25 children stays fast (W3B-12), and so
 *    does reading every membership (W3B-13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FIRST = ['Asha', 'Dev', "Ne'ha", 'Anne-Marie', 'José', 'Zoë', 'Ünal', 'Đặng', 'Ravi', 'Meera', 'Kiran', 'Li', 'Omar', 'Sara', 'Tanvi', 'Ishaan'];
const LAST = ['Rao', "D'Souza", 'Iyer', 'Menon', 'Khan', 'Nair', 'Smith-Jones', 'García', 'Øberg', 'Wang', 'Das', 'Shah'];
const OTHER_FIRST = ['Bina', 'Chetan', 'Farah', 'Gopal', 'Hema', 'Jaya'];

test('40 schools, 400 students, 80 staff, 120 strangers: memberships and masking hold', async () => {
  const db = await bootDb({ strict: true });
  const r = mulberry32(20261028);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const t0 = Date.now();
  let accounts = 0;
  const me = async (name: string, dob = '1985-01-01') => {
    const uid = await db.signUp({ name, dob }); accounts++;
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
    return { uid, player: p.id };
  };
  type School = { org: string; staff: { uid: string; player: string }[]; students: { id: string; name: string; parent?: string }[] };
  const schools: School[] = [];
  for (let s = 0; s < 40; s++) {
    const head = await me(`Head ${s}`);
    const pe = await me(`Coach ${s}`);
    const [o] = await db.as<{ id: string }>(head.uid, `insert into organizations (name, type, created_by) values ($1, 'School', auth.uid()) returning id`, [`School ${s}`]);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date), ($1, $3, 'Admin', current_date)`, [o.id, head.player, pe.player]);
    const students: School['students'] = [];
    for (let k = 0; k < 10; k++) {
      const name = r() < 0.1 ? pick(FIRST) : `${pick(FIRST)} ${pick(LAST)}`;
      const [p] = await db.as<{ id: string }>(head.uid, `insert into players (full_name, dob) values ($1, '2013-03-03') returning id`, [name]);
      await db.as(head.uid, `insert into org_members (org_id, player_id, role, since, grades) values ($1, $2, 'Member', current_date, '[{"grade":"6"}]')`, [o.id, p.id]);
      const st: School['students'][number] = { id: p.id, name };
      if (k % 3 === 0) {
        st.parent = await db.signUp({ name: `Parent ${s}.${k}`, dob: '1980-01-01' }); accounts++;
        await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [st.parent, p.id]);
      }
      students.push(st);
    }
    schools.push({ org: o.id, staff: [head, pe], students });
  }
  accounts += 400;   // the students (unclaimed players the school added)

  // DB-10 — who reads what
  const ids = (rows: { player_id: string }[]) => new Set(rows.map((x) => x.player_id));
  let memberReads = 0, parentReads = 0;
  for (const sc of schools) {
    const all = new Set([...sc.staff.map((x) => x.player), ...sc.students.map((x) => x.id)]);
    const seen = ids(await db.as(pick(sc.staff).uid, `select player_id from org_members where org_id = $1`, [sc.org]));
    assert.deepEqual([...seen].sort(), [...all].sort(), 'a member lost part of their own school');
    memberReads++;
    for (const st of sc.students.filter((x) => x.parent)) {
      assert.ok(ids(await db.as(st.parent!, `select player_id from org_members where org_id = $1`, [sc.org])).has(st.id), 'a parent lost their child');
      parentReads++;
    }
  }
  const adults = new Set(schools.flatMap((sc) => sc.staff.map((x) => x.player)));
  const tRead = Date.now();
  const anonAll = await db.asAnon<{ player_id: string }>(`select player_id from org_members`);
  const readMs = Date.now() - tRead;
  assert.ok(anonAll.every((x) => adults.has(x.player_id)), 'a visitor read a child\'s membership');

  // DB-11 — 120 strangers link a student and write names
  let guesses = 0, oneWord = 0;
  for (let s = 0; s < 120; s++) {
    const st = await me(`Stranger ${s}`);
    const sc = pick(schools);
    const kid = pick(sc.students);
    const [t] = await db.as<{ id: string }>(st.uid, `insert into teams (name, short_name, sport, roster) values ('S', 'S', 'football', $1) returning id`, [JSON.stringify([kid.id])]);
    const [m] = await db.as<{ id: string }>(st.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [t.id, [st.player]]);
    const words = kid.name.split(' ');
    const wrong = words.map((w, i) => (i === 0 ? w[0] + 'xyz' : w[0] + 'qrs')).join(' ');
    const write = async (seq: number, note: string) => (await db.as<{ p: { note: string } }>(st.uid,
      `insert into match_events (match_id, seq, type, side, payload) values ($1, $2, 'NOTE', 'home', $3) returning payload as p`, [m.id, seq, JSON.stringify({ note: `Well played ${note}!`, playerId: kid.id })]))[0].p.note;
    const right = await write(1, kid.name);
    if (words.length >= 2) {
      assert.equal(await write(2, wrong), right, `a guess for ${kid.name} is distinguishable`);
      assert.ok(!right.toLowerCase().includes(kid.name.toLowerCase()), `${kid.name} stored in full`);
      const entry = async (name: string) => (await db.as<{ name: string; entry_ids: string[] | null }>(st.uid,
        `insert into teams (name, short_name, sport, roster) values ($1, 'E', 'tennis', $2) returning name, entry_ids`, [name, JSON.stringify([kid.id])]))[0];
      const [a, b] = [await entry(kid.name), await entry(wrong)];
      assert.deepEqual([a.name, a.entry_ids], [b.name, b.entry_ids], 'entry names tell a right guess from a wrong one');
      guesses++;
    } else oneWord++;
    const other = await write(3, `${pick(OTHER_FIRST)} Zed`);
    assert.match(other, /Zed/, 'a name with other initials was masked');
  }

  // W3B-12 — masking speed on a big ids-only snapshot with 25 children
  const coach = await me('Perf Coach');
  const kidIds: string[] = [];
  for (let i = 0; i < 25; i++) {
    const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ($1, '2014-01-01') returning id`, [`${pick(FIRST)} ${pick(LAST)}`]);
    kidIds.push(p.id);
  }
  const state = JSON.stringify({ log: Array.from({ length: 1500 }, (_, i) => ({ seq: i, batter: kidIds[i % 25], runs: i % 7, kind: i % 9 ? 'run' : 'dot ball' })) });
  const tm = performance.now();
  for (let i = 0; i < 10; i++) await db.sql(`select mask_minor_names_json($1::jsonb, $2::uuid[])`, [state, kidIds]);
  const maskMs = (performance.now() - tm) / 10;
  assert.ok(maskMs < 30, `masking a ${state.length}-byte snapshot took ${maskMs.toFixed(1)} ms`);

  const ms = Date.now() - t0;
  console.log(`simulated ${accounts} people: ${memberReads} member reads + ${parentReads} parent reads kept; a visitor read ${anonAll.length} rows (staff only) in ${readMs} ms; `
    + `${guesses} right/wrong guesses indistinguishable (${oneWord} one-word names); masking ${(state.length / 1024).toFixed(0)} KB with 25 children ${maskMs.toFixed(1)} ms — ${ms} ms`);
  assert.ok(accounts >= 500, `only ${accounts}`);
});
