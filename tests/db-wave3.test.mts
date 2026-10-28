/**
 * Security Wave 3 (medium findings, docs/security/audit-2026-10-27/PLAN.md),
 * against a real Postgres (PGlite, every migration applied).
 * 3A — children's data: DB-08 internal functions, DB-10 who can read community
 * memberships, DB-11 the name-masking oracle, DB-15 names in public tables.
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bootDb, type TestDb } from './helpers/pgdb.mts';

let db: TestDb;
before(async () => { db = await bootDb({ strict: true }); });

type Who = { uid: string; player: string };
async function person(name: string, dob = '1985-01-01'): Promise<Who> {
  const uid = await db.signUp({ name, dob });
  const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
  return { uid, player: p.id };
}
const errOf = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return (e as Error).message; } };

describe('DB-08 — internal functions are not callable by the app', () => {
  test('ages, the messaging check and a sealed tie lineup are refused', async () => {
    const me = await person('Caller');
    const kid = await person('Kid Eight', '2014-01-01');
    for (const q of [`select player_age('${kid.player}')`, `select profile_age('${kid.uid}')`, `select assert_can_message()`, `select tie_side_lineup('s1', 'home')`]) {
      assert.match(await errOf(() => db.as(me.uid, q)) ?? '', /permission denied/, q);
    }
    for (const q of [`select player_full_visible('${kid.player}')`, `select can_contact_provisional('${kid.player}')`]) {
      assert.match(await errOf(() => db.asAnon(q)) ?? '', /permission denied/, q);
    }
  });
  test('every privileged function the app can call is used by the app, a policy or a view — or listed here on purpose', async () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs)$/.test(f)) files.push(p); } };
    walk('src'); walk('supabase/functions'); walk('scripts');
    const rpc = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*['"]([a-z_0-9]+)['"]/g)) rpc.add(m[1]);
    const ON_PURPOSE = new Set([
      'api_gate',                       // PostgREST pre-request gate (runs as the caller)
      'api_whoami',                     // the caller's own address (anti-scraping)
      'grant_verification_reviewer',    // support console (checks is_support itself)
      'revoke_verification_reviewer',
      'is_tie_host',                    // the caller's own host status
    ]);
    const used = (await db.sql<{ t: string }>(`
      select coalesce(qual, '') || ' ' || coalesce(with_check, '') as t from pg_policies
      union all select pg_get_viewdef(c.oid) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v'
      union all select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d`)).map((r) => r.t).join('\n');
    const fns = await db.sql<{ name: string }>(`
      select distinct p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and p.prorettype <> 'trigger'::regtype
         and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`);
    const stray = fns.map((f) => f.name).filter((n) => !rpc.has(n) && !ON_PURPOSE.has(n) && !new RegExp(`\\b${n}\\(`).test(used));
    assert.deepEqual(stray.sort(), [], 'revoke these from anon / authenticated, or list them here with a reason');
  });
});

describe('DB-10 — community memberships of children are not public', () => {
  let head: Who, student: Who, classmate: Who, org: string, parent: string;
  before(async () => {
    head = await person('Head Teacher');
    const [o] = await db.as<{ id: string }>(head.uid, `insert into organizations (name, type, created_by) values ('DPS', 'School', auth.uid()) returning id`);
    org = o.id;
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [org, head.player]);
    student = await person('Sara Khan', '2013-04-04');
    classmate = await person('Dev Menon', '2013-05-05');
    parent = await db.signUp({ name: 'Rehana Khan', dob: '1980-01-01' });
    await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [parent, student.player]);
    for (const p of [student, classmate]) {
      await db.as(head.uid, `insert into org_members (org_id, player_id, role, since, grades) values ($1, $2, 'Member', current_date, '[{"grade":"7","section":"B"}]')`, [org, p.player]);
    }
  });
  const rows = (rs: { player_id: string }[]) => rs.map((r) => r.player_id).sort();
  test('a stranger and a visitor see the staff, not the children', async () => {
    const stranger = await person('Stranger');
    const q = `select player_id from org_members where org_id = '${0}'`;
    assert.deepEqual(rows(await db.as(stranger.uid, `select player_id from org_members where org_id = $1`, [org])), [head.player]);
    assert.deepEqual(rows(await db.asAnon(`select player_id from org_members where org_id = $1`, [org])), [head.player]);
    void q;
  });
  test('the school\'s own members, the child\'s parent and support still see them', async () => {
    assert.deepEqual(rows(await db.as(classmate.uid, `select player_id from org_members where org_id = $1`, [org])), [head.player, student.player, classmate.player].sort());
    assert.deepEqual(rows(await db.as(head.uid, `select player_id from org_members where org_id = $1`, [org])), [head.player, student.player, classmate.player].sort());
    assert.ok(rows(await db.as(parent, `select player_id from org_members where org_id = $1`, [org])).includes(student.player));
  });
  test('a coach still sees the unclaimed child they added to another club', async () => {
    const coach = await person('Coach Q');
    const [kid] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Tia Q', '2015-01-01') returning id`);
    const [o] = await db.as<{ id: string }>(coach.uid, `insert into organizations (name, type, created_by) values ('Q Academy', 'Sports academy', auth.uid()) returning id`);
    await db.as(coach.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date), ($1, $3, 'Member', current_date)`, [o.id, coach.player, kid.id]);
    assert.ok(rows(await db.as(coach.uid, `select player_id from org_members where org_id = $1`, [o.id])).includes(kid.id));
  });
});

describe('DB-11 — masking no longer confirms a guessed name', () => {
  let coach: Who, kid: string, team: string, match: string;
  before(async () => {
    coach = await person('Coach Guess');
    // a child someone else created: the coach only knows the initials A. R.
    const other = await person('Other Coach');
    const [k] = await db.as<{ id: string }>(other.uid, `insert into players (full_name, dob) values ('Asha Rao', '2014-02-02') returning id`);
    kid = k.id;
    const [t] = await db.as<{ id: string }>(coach.uid, `insert into teams (name, short_name, sport, roster) values ('Guessers', 'G', 'football', $1) returning id`, [JSON.stringify([kid])]);
    team = t.id;
    const [m] = await db.as<{ id: string }>(coach.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [team, [coach.player]]);
    match = m.id;
  });
  const stored = async (note: string) => {
    const [e] = await db.as<{ payload: { note: string } }>(coach.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, (select coalesce(max(seq), 0) + 1 from match_events where match_id = $1), 'NOTE', 'home', $2) returning payload`, [match, JSON.stringify({ note, playerId: kid })]);
    return e.payload.note;
  };
  test('a right guess and a wrong guess with the same initials look the same', async () => {
    assert.equal(await stored('Great save by Asha Rao'), 'Great save by A. R.');
    assert.equal(await stored('Great save by Anita Roy'), 'Great save by A. R.');
    assert.equal(await stored('Great save by asha rao!'), 'Great save by A. R.!');
    assert.equal(await stored('Great save by Bina Shah'), 'Great save by Bina Shah', 'other initials are left alone');
  });
  test('an entry named after the child: right and wrong guesses store the same name and the same entry', async () => {
    const mk = async (name: string) => (await db.as<{ name: string; entry_ids: string[] | null }>(coach.uid,
      `insert into teams (name, short_name, sport, roster) values ($1, 'E', 'tennis', $2) returning name, entry_ids`, [name, JSON.stringify([kid])]))[0];
    const right = await mk('Asha Rao');
    const wrong = await mk('Anita Roy');
    assert.deepEqual([right.name, right.entry_ids], ['A. R.', [kid]]);
    assert.deepEqual([wrong.name, wrong.entry_ids], ['A. R.', [kid]]);
  });
  test('adults are untouched', async () => {
    const adult = await person('Ravi Kumar');
    await db.as(coach.uid, `update teams set roster = roster || $2::jsonb where id = $1`, [team, JSON.stringify([adult.player])]);
    assert.equal(await stored('Ravi Kumar scored'), 'Ravi Kumar scored');
  });
});

describe('DB-15 — names written by the server into public tables are masked', () => {
  test('a scoring handover and a tournament transfer by a child keep only initials', async () => {
    const kidOrg = await person('Kiran Shah', '2010-03-03');
    const adult = await person('Meena Iyer');
    const [t] = await db.as<{ id: string }>(kidOrg.uid, `insert into tournaments (name, host_name, organizer_id) values ('School Cup', 'Kiran Shah', auth.uid()) returning id`);
    const [m] = await db.as<{ id: string }>(kidOrg.uid, `insert into matches (sport, tournament_id, status, scorer_ids) values ('football', $1, 'live', $2) returning id`, [t.id, [kidOrg.player]]);
    await db.sql(`update matches set active_scorer_id = $2 where id = $1`, [m.id, kidOrg.player]);
    await db.as(kidOrg.uid, `select handover_scoring($1, $2)`, [m.id, adult.player]);
    const [log] = await db.sql<{ detail: string; by_name: string }>(`select detail, by_name from activity_log where action = 'scoring.handover' and ref_id = $1`, [t.id]);
    assert.doesNotMatch(log.detail + log.by_name, /Kiran Shah/);
    assert.match(log.detail, /K\. S\./);
    await db.as(kidOrg.uid, `select transfer_tournament_ownership($1, null, $2, 'Meena Iyer', 'individual', 'Kiran Shah')`, [t.id, [adult.player]]);
    const [ev] = await db.sql<{ by_name: string; from_name: string }>(`select by_name, from_name from tournament_ownership_events where tournament_id = $1`, [t.id]);
    assert.deepEqual([ev.by_name, ev.from_name], ['K. S.', 'K. S.']);
  });
  test('match officials and managers keep a child\'s initials only', async () => {
    const host = await person('Host Fifteen');
    const kidRef = await person('Lena Das', '2011-06-06');
    const [t] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('H15', 'H', 'football', $1) returning id`, [JSON.stringify([kidRef.player])]);
    const [m] = await db.as<{ officials: { name: string }[]; managers: { home: string } }>(host.uid,
      `insert into matches (sport, home_team_id, host_ids, status, officials, managers) values ('football', $1, $2, 'scheduled', $3, $4) returning officials, managers`,
      [t.id, [host.player], JSON.stringify([{ slot: 'referee', playerId: kidRef.player, name: 'Lena Das' }]), JSON.stringify({ home: 'Lena Das' })]);
    assert.deepEqual([m.officials[0].name, m.managers.home], ['L. D.', 'L. D.']);
  });
});
