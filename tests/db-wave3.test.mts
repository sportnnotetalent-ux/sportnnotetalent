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
      'usage_dashboard',                // v1 usage dashboard: app versions before the filters (support only)
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

/* ------------------------- 3B — results you can trust ------------------------- */

const line = (uid: string, match: string, player: string, sport = 'football') =>
  db.as<{ id: string }>(uid, `insert into stat_lines (match_id, player_id, sport, stats) values ($1, $2, $3, '{"goals":3}') returning id`, [match, player, sport]);
const lines = async (match: string, player: string) =>
  (await db.sql(`select 1 from stat_lines where match_id = $1 and player_id = $2`, [match, player])).length;
/** Make a finished match look as if it ended `hours` ago (its events, its manual result). */
const endedAgo = async (match: string, hours: number) => {
  await db.sql(`update match_events set created_at = now() - make_interval(hours => $2) where match_id = $1`, [match, hours]);
  await db.sql(`update matches set completed_at = now() - make_interval(hours => $2) where id = $1 and completed_at is not null`, [match, hours]).catch(() => undefined);
};

describe('DB-12 — achievements only for players who took part', () => {
  let stranger: Who, kid: string, ownKid: string, match: string, team: string;
  before(async () => {
    const coach = await person('Real Coach');
    const [k] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Real Kid', '2014-01-01') returning id`);
    kid = k.id;
    stranger = await person('Fake Stats');
    const [o] = await db.as<{ id: string }>(stranger.uid, `insert into players (full_name, dob) values ('Own Kid', '2014-01-01') returning id`);
    ownKid = o.id;
    const [t] = await db.as<{ id: string }>(stranger.uid, `insert into teams (name, short_name, sport, roster) values ('Fakers', 'F', 'football', $1) returning id`, [JSON.stringify([kid, ownKid])]);
    team = t.id;
    const [m] = await db.as<{ id: string }>(stranger.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [team, [stranger.player]]);
    match = m.id;
  });
  test('a child someone else added, with no agreement, gets no stat line; the coach\'s own child does', async () => {
    await line(stranger.uid, match, kid);
    await line(stranger.uid, match, ownKid);
    assert.equal(await lines(match, kid), 0);
    assert.equal(await lines(match, ownKid), 1);
  });
  test('a player with no link to the match gets none either', async () => {
    const random = await person('Random Adult');
    await line(stranger.uid, match, random.player);
    assert.equal(await lines(match, random.player), 0);
  });
  test('once the child\'s side confirms, the line is written; "Not us" removes the child\'s lines', async () => {
    const coachUid = (await db.sql<{ created_by: string }>(`select created_by from players where id = $1`, [kid]))[0].created_by;
    await db.as(coachUid, `select answer_link('team', $1, $2, true)`, [team, kid]);
    assert.equal(await lines(match, kid), 1, 'the line kept aside was written (W3B-20)');
    await db.as(coachUid, `select answer_link('team', $1, $2, false)`, [team, kid]);
    assert.equal(await lines(match, kid), 0, '"Not us" took the child\'s lines in that team\'s matches');
  });
  test('W3B-20: a line skipped while unconfirmed is kept aside and written when the child\'s side confirms', async () => {
    const coach = await person('Late Coach');
    const [k] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Late Kid', '2014-01-01') returning id`);
    const host = await person('Late Host');
    const [t] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('Late XI', 'L', 'football', $1) returning id`, [JSON.stringify([k.id])]);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [t.id, [host.player]]);
    await line(host.uid, m.id, k.id);
    await db.as(host.uid, `update matches set status = 'completed' where id = $1`, [m.id]);
    assert.equal(await lines(m.id, k.id), 0);
    await endedAgo(m.id, 48);
    await db.as(coach.uid, `select answer_link('team', $1, $2, true)`, [t.id, k.id]);
    const [l] = await db.sql<{ goals: number }>(`select (stats->>'goals')::int as goals from stat_lines where match_id = $1 and player_id = $2`, [m.id, k.id]);
    assert.equal(l?.goals, 3, 'the line written at the end of the match came back');
    assert.deepEqual(await db.sql(`select 1 from parked_stat_lines where player_id = $1`, [k.id]), []);
  });
  test('certificates go only to the tournament\'s participants', async () => {
    const org = await person('Cert Organiser');
    const [own] = await db.as<{ id: string }>(org.uid, `insert into players (full_name, dob) values ('Cert Kid', '2014-01-01') returning id`);
    const [t] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('Cert Team', 'C', 'football', $1) returning id`, [JSON.stringify([own.id])]);
    const [tr] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ('Cert Cup', 'O', auth.uid()) returning id`);
    await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tr.id, t.id]);
    const got = await db.as<{ player_id: string }>(org.uid, `select player_id from issue_certificates($1, $2)`,
      [tr.id, JSON.stringify([{ playerId: own.id, kind: 'champion', title: 'Champions' }, { playerId: kid, kind: 'award', title: 'Best player' }])]);
    assert.deepEqual(got.map((x) => x.player_id), [own.id]);
  });
});

describe('DB-13 — finished results are final', () => {
  let org: Who, scorer: Who, tour: string, match: string, kidA: string;
  before(async () => {
    org = await person('Final Organiser');
    scorer = await person('Final Scorer');
    const [tr] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ('Final Cup', 'O', auth.uid()) returning id`);
    tour = tr.id;
    const [k] = await db.as<{ id: string }>(org.uid, `insert into players (full_name, dob) values ('Final Kid', '2014-01-01') returning id`);
    kidA = k.id;
    const [t] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('Final A', 'A', 'football', $1) returning id`, [JSON.stringify([kidA])]);
    await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tour, t.id]);
    const [m] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, home_team_id, status, scorer_ids) values ('football', $1, $2, 'live', $3) returning id`, [tour, t.id, [scorer.player]]);
    match = m.id;
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [match]);
    await db.as(scorer.uid, `update matches set status = 'completed', winner = 'home' where id = $1`, [match]);
  });
  test('within 24 hours the scorer can still correct; after that, only the organisers', async () => {
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 2, 'AMEND', null, '{}')`, [match]);
    await endedAgo(match, 25);
    assert.match(await errOf(() => db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 3, 'AMEND', null, '{}')`, [match])) ?? '', /finished/i);
    assert.match(await errOf(() => db.as(scorer.uid, `delete from match_events where match_id = $1 and seq = 1`, [match])) ?? '', /finished/i);
    assert.match(await errOf(() => db.as(scorer.uid, `update matches set status = 'live' where id = $1`, [match])) ?? '', /finished/i);
    assert.match(await errOf(() => line(scorer.uid, match, kidA)) ?? '', /finished/i);
    await db.as(org.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 3, 'AMEND', null, '{}')`, [match]);
    await line(org.uid, match, kidA);
    assert.equal(await lines(match, kidA), 1);
  });
  test('a scorer can\'t take a match out of its tournament, wind a tournament match back, or delete it', async () => {
    const [m2] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, status, scorer_ids) values ('football', $1, 'live', $2) returning id`, [tour, [scorer.player]]);
    assert.match(await errOf(() => db.as(scorer.uid, `update matches set tournament_id = null where id = $1`, [m2.id])) ?? '', /organisers/i);
    // "Reset match" right after a mistaken start is still the scorer's; an hour in, it's the organisers'
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m2.id]);
    await db.as(scorer.uid, `update matches set status = 'scheduled' where id = $1`, [m2.id]);
    await db.as(scorer.uid, `update matches set status = 'live' where id = $1`, [m2.id]);
    await endedAgo(m2.id, 1);
    assert.match(await errOf(() => db.as(scorer.uid, `update matches set status = 'scheduled' where id = $1`, [m2.id])) ?? '', /organisers/i);
    const [m3] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, status, scorer_ids) values ('football', $1, 'scheduled', $2) returning id`, [tour, [scorer.player]]);
    await db.as(scorer.uid, `delete from matches where id = $1`, [m3.id]);
    assert.equal((await db.sql(`select 1 from matches where id = $1`, [m3.id])).length, 1, 'the scorer deleted a tournament fixture');
    await db.as(org.uid, `delete from matches where id = $1`, [m3.id]);
    assert.equal((await db.sql(`select 1 from matches where id = $1`, [m3.id])).length, 0);
  });
  test('W3B-14: the window runs from the first time it finished — new events or finishing again don\'t extend it', async () => {
    const [m5] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, status, scorer_ids) values ('football', $1, 'live', $2) returning id`, [tour, [scorer.player]]);
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m5.id]);
    await db.as(scorer.uid, `update matches set status = 'completed', completed_at = now() + interval '5 days' where id = $1`, [m5.id]);
    const [c] = await db.sql<{ ok: boolean }>(`select completed_at <= now() + interval '1 minute' as ok from matches where id = $1`, [m5.id]);
    assert.equal(c.ok, true, 'the app can\'t set the time');
    await db.as(scorer.uid, `update matches set status = 'live' where id = $1`, [m5.id]);
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 2, 'GOAL', 'home', '{}')`, [m5.id]);
    await db.as(scorer.uid, `update matches set status = 'completed' where id = $1`, [m5.id]);
    await db.sql(`update matches set completed_at = now() - interval '25 hours' where id = $1`, [m5.id]);   // events stay recent
    assert.match(await errOf(() => db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 3, 'AMEND', null, '{}')`, [m5.id])) ?? '', /finished/i);
  });
  test('an event time can\'t be set in the future (it would keep the window open)', async () => {
    const [m4] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, status, scorer_ids) values ('football', $1, 'live', $2) returning id`, [tour, [scorer.player]]);
    const [e] = await db.as<{ late: boolean }>(scorer.uid, `insert into match_events (match_id, seq, type, side, payload, created_at) values ($1, 1, 'GOAL', 'home', '{}', now() + interval '10 years') returning created_at <= now() + interval '1 minute' as late`, [m4.id]);
    assert.equal(e.late, true);
  });
  test('a finished round of a tournament: its host can\'t change it after 24 hours or move it out', async () => {
    const host = await person('Round Host');
    const [e] = await db.as<{ id: string }>(org.uid, `insert into field_events (sport, title, tournament_id, host_ids, status) values ('athletics', '100m', $1, $2, 'live') returning id`, [tour, [host.player]]);
    const [fe] = await db.as<{ id: string }>(host.uid, `insert into field_entries (event_id, player_id) values ($1, $2) returning id`, [e.id, kidA]);
    await db.as(host.uid, `update field_events set status = 'completed' where id = $1`, [e.id]);
    await db.sql(`update field_events set completed_at = now() - interval '25 hours' where id = $1`, [e.id]);
    assert.match(await errOf(() => db.as(host.uid, `update field_entries set result = '{"time": 9.5}' where id = $1`, [fe.id])) ?? '', /finished/i);
    assert.match(await errOf(() => db.as(host.uid, `update field_events set status = 'live' where id = $1`, [e.id])) ?? '', /finished/i);
    assert.match(await errOf(() => db.as(host.uid, `update field_events set tournament_id = null where id = $1`, [e.id])) ?? '', /organisers|finished/i);
    await db.as(org.uid, `update field_entries set result = '{"time": 11.2}' where id = $1`, [fe.id]);
  });
  test('a friendly\'s host keeps the 30-minute delete and the 24-hour corrections', async () => {
    const host = await person('Friendly Host');
    const [t] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('FH', 'F', 'football', '[]') returning id`);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [t.id, [host.player]]);
    await db.as(host.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m.id]);
    await db.as(host.uid, `update matches set status = 'completed' where id = $1`, [m.id]);
    await db.as(host.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 2, 'AMEND', null, '{}')`, [m.id]);
    await db.as(host.uid, `delete from matches where id = $1`, [m.id]);
    assert.equal((await db.sql(`select 1 from matches where id = $1`, [m.id])).length, 0);
  });
});

/* ------------------------- 3C — consent and abuse limits ------------------------- */

/** A logged-out call from an address (the request headers PostgREST passes). */
const anonFrom = (ip: string, q: string, params: unknown[] = []) => db.pg.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })]);
  await tx.query('set local role anon');
  return (await tx.query<Record<string, unknown>>(q, params)).rows;
});

describe('DB-16 — logged-out callers can\'t get round the analytics and crash-report limits', () => {
  test('a new device id on every call from one address is still limited by the address', async () => {
    const ev = JSON.stringify([{ name: 'app_open' }]);
    let accepted = 0;
    for (let i = 0; i < 310; i++) {
      const [r] = await anonFrom('203.0.113.7', `select track_events($1::jsonb, gen_random_uuid(), gen_random_uuid(), 'web', '1') as n`, [ev]);
      accepted += Number(r.n);
    }
    assert.equal(accepted, 300);
    const [other] = await anonFrom('198.51.100.9', `select track_events($1::jsonb, gen_random_uuid(), null, 'web', '1') as n`, [ev]);
    assert.equal(Number(other.n), 1, 'another address is unaffected');
    let errs = 0;
    for (let i = 0; i < 70; i++) {
      const [r] = await anonFrom('203.0.113.8', `select report_client_error('boom', null, false, 'Home', gen_random_uuid(), gen_random_uuid(), 'web', '1') as ok`);
      if (r.ok) errs++;
    }
    assert.equal(errs, 60);
  });
  test('the rate-limit ledger is cleaned on a schedule', async () => {
    const [j] = await db.sql<{ n: number }>(`select count(*)::int as n from cron.job where jobname = 'rate-limit-cleanup' and command ilike '%delete from rate_limit_hits%'`);
    assert.equal(j.n, 1);
  });
});

describe('DB-07 — a child can\'t lift the under-18 limits themselves', () => {
  let kid: Who;
  before(async () => {
    kid = await person('Teen Ager', '2012-05-05');
    await db.sql(`update profiles set dob = '2012-05-05', guardian_consent = 'confirmed', guardian = '{"email":"mum@x.in"}' where id = $1`, [kid.uid]);
  });
  test('the date of birth can\'t be moved to an adult one, or cleared — a younger or same-age one is fine', async () => {
    assert.match(await errOf(() => db.as(kid.uid, `update profiles set dob = '2000-01-01' where id = auth.uid()`)) ?? '', /support/i);
    assert.match(await errOf(() => db.as(kid.uid, `update profiles set dob = null where id = auth.uid()`)) ?? '', /support/i);
    assert.match(await errOf(() => db.as(kid.uid, `update players set dob = '2000-01-01' where id = $1`, [kid.player])) ?? '', /support/i);
    await db.as(kid.uid, `update profiles set dob = '2012-06-06' where id = auth.uid()`);
    const coach = await person('Typo Coach');
    const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Typo Kid', '2014-01-01') returning id`);
    await db.as(coach.uid, `update players set dob = '2004-01-01' where id = $1`, [p.id]);
  });
  test('changing the guardian\'s contact asks the new guardian again; the linked parent can change it', async () => {
    await db.as(kid.uid, `update profiles set guardian = '{"email":"me-again@x.in"}' where id = auth.uid()`);
    const [a] = await db.sql<{ c: string }>(`select guardian_consent as c from profiles where id = $1`, [kid.uid]);
    assert.equal(a.c, 'pending');
    await db.sql(`update profiles set guardian_consent = 'confirmed' where id = $1`, [kid.uid]);
    await db.as(kid.uid, `update players set guardian = '{"email":"other@x.in"}' where id = $1`, [kid.player]);
    const [b] = await db.sql<{ c: string }>(`select guardian_consent as c from profiles where id = $1`, [kid.uid]);
    assert.equal(b.c, 'pending', 'through their own player too');
    const parent = await db.signUp({ name: 'Real Mum', dob: '1980-01-01' });
    await db.sql(`update profiles set guardian_consent = 'confirmed' where id = $1`, [kid.uid]);
    await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [parent, kid.player]);
    await db.as(parent, `update players set guardian = '{"email":"mum-new@x.in"}' where id = $1`, [kid.player]).catch(() => undefined);
    const [c] = await db.sql<{ c: string }>(`select guardian_consent as c from profiles where id = $1`, [kid.uid]);
    assert.equal(c.c, 'confirmed');
  });
});

/* ------------------------- 3E — the app's findings, enforced on the server ------------------------- */

describe('CL-14 — the guardian\'s "verified" flags are the server\'s', () => {
  test('the app can\'t set them; a changed contact loses them; the server can set them', async () => {
    const kid = await person('Flag Kid', '2012-01-01');
    await db.as(kid.uid, `update players set guardian = '{"email":"g@x.in","phone":"+919800000001","emailVerified":true,"phoneVerified":true}' where id = $1`, [kid.player]);
    const flags = async () => (await db.sql<{ g: Record<string, unknown> }>(`select guardian as g from players where id = $1`, [kid.player]))[0].g;
    assert.equal((await flags()).phoneVerified ?? false, false);
    assert.equal((await flags()).emailVerified ?? false, false);
    await db.sql(`update players set guardian = guardian || '{"phoneVerified":true}' where id = $1`, [kid.player]);   // the verification function (server)
    assert.equal((await flags()).phoneVerified, true);
    // the app writes the whole object (the column is private: no reading it back)
    await db.as(kid.uid, `update players set guardian = '{"email":"g@x.in","phone":"+919800000001","name":"Mum","phoneVerified":true}' where id = $1`, [kid.player]);
    assert.equal((await flags()).phoneVerified, true, 'kept while the number is the same');
    await db.as(kid.uid, `update players set guardian = '{"email":"g@x.in","phone":"+919800000002","name":"Mum","phoneVerified":true}' where id = $1`, [kid.player]);
    assert.equal((await flags()).phoneVerified ?? false, false, 'a new number isn\'t verified');
  });
});

describe('CL-15 — verification documents: images and PDFs, 10 MB at most', () => {
  test('the bucket says so', async () => {
    const [b] = await db.sql<{ l: number; t: string[] }>(`select file_size_limit as l, allowed_mime_types as t from storage.buckets where id = 'verification-docs'`);
    assert.equal(Number(b.l), 10 * 1024 * 1024);
    assert.ok(b.t.includes('application/pdf') && b.t.includes('image/jpeg') && !b.t.some((x) => /html|svg|xml/.test(x)));
  });
});

describe('CL-17 — reset is one step, with the same rules; Player of the Match changes once', () => {
  test('reset_match wipes everything at once, and only within the rules', async () => {
    const org = await person('Reset Organiser');
    const scorer = await person('Reset Scorer');
    const [tr] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ('Reset Cup', 'O', auth.uid()) returning id`);
    const [k] = await db.as<{ id: string }>(org.uid, `insert into players (full_name, dob) values ('Reset Kid', '2014-01-01') returning id`);
    const [t] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('R', 'R', 'football', $1) returning id`, [JSON.stringify([k.id])]);
    const [m] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, home_team_id, status, scorer_ids) values ('football', $1, $2, 'live', $3) returning id`, [tr.id, t.id, [scorer.player]]);
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m.id]);
    await db.as(scorer.uid, `insert into stat_lines (match_id, player_id, sport, stats) values ($1, $2, 'football', '{"goals":1}')`, [m.id, k.id]);
    await db.as(scorer.uid, `select reset_match($1)`, [m.id]);
    const [row] = await db.sql<{ status: string; n: number; s: Record<string, unknown> }>(`select status, (select count(*)::int from match_events where match_id = $1) as n,
      (select stats from stat_lines where match_id = $1) as s from matches where id = $1`, [m.id]);
    assert.deepEqual([row.status, row.n, row.s], ['scheduled', 0, {}]);
    await db.as(scorer.uid, `update matches set status = 'live' where id = $1`, [m.id]);
    await db.as(scorer.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m.id]);
    await endedAgo(m.id, 2);
    assert.match(await errOf(() => db.as(scorer.uid, `select reset_match($1)`, [m.id])) ?? '', /organisers/i);
    const stranger = await person('Reset Stranger');
    assert.match(await errOf(() => db.as(stranger.uid, `select reset_match($1)`, [m.id])) ?? '', /not allowed|permission/i);
    await db.as(org.uid, `select reset_match($1)`, [m.id]);
  });
  test('a changed Player of the Match can\'t be changed again, except by the organisers', async () => {
    const host = await person('Potm Host');
    const [t] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ('P', 'P', 'football', '[]') returning id`);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'completed') returning id`, [t.id, [host.player]]);
    await db.as(host.uid, `update matches set potm = $2 where id = $1`, [m.id, JSON.stringify({ playerId: host.player, name: 'Potm Host', by: host.player })]);
    assert.match(await errOf(() => db.as(host.uid, `update matches set potm = $2 where id = $1`, [m.id, JSON.stringify({ playerId: host.player, name: 'X', by: host.player })])) ?? '', /once/i);
  });
});

/* ------------------------- 3F — Wave 2b follow-ups ------------------------- */

describe('3F — waiting to confirm, declined requests, reporting a request', () => {
  let coach: Who, other: Who, kid: string, team: string;
  before(async () => {
    coach = await person('Follow Coach');
    other = await person('Follow Other');
    const [k] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ('Follow Kid', '2014-01-01') returning id`);
    kid = k.id;
    const [t] = await db.as<{ id: string }>(other.uid, `insert into teams (name, short_name, sport, roster) values ('Other XI', 'O', 'football', $1) returning id`, [JSON.stringify([kid, other.player])]);
    team = t.id;
  });
  test('the team\'s managers see who is waiting to confirm; others don\'t', async () => {
    const [w] = await db.as<{ ids: string[] }>(other.uid, `select team_waiting_player_ids($1) as ids`, [team]);
    assert.deepEqual(w.ids, [kid]);
    const stranger = await person('Follow Stranger');
    assert.match(await errOf(() => db.as(stranger.uid, `select team_waiting_player_ids($1)`, [team])) ?? '', /manager/i);
  });
  test('"Not us" is listed under declined requests and can be undone; re-adding then asks again', async () => {
    await db.as(coach.uid, `select answer_link('team', $1, $2, false)`, [team, kid]);
    const d = await db.as<{ group_name: string; player_name: string }>(coach.uid, `select * from my_declined_links()`);
    assert.deepEqual(d.map((x) => [x.group_name, x.player_name]), [['Other XI', 'Follow Kid']]);
    assert.match(await errOf(() => db.as(other.uid, `select undo_decline('team', $1, $2)`, [team, kid])) ?? '', /only/i);
    await db.as(coach.uid, `select undo_decline('team', $1, $2)`, [team, kid]);
    assert.deepEqual(await db.as(coach.uid, `select * from my_declined_links()`), []);
    await db.as(other.uid, `update teams set roster = $2 where id = $1`, [team, JSON.stringify([kid, other.player])]);
    assert.equal((await db.as(coach.uid, `select * from my_pending_links()`)).length, 1);
  });
  test('reporting a request says "Not us" and tells support; only the player\'s side can report; only support reads reports', async () => {
    const stranger = await person('Report Stranger');
    assert.match(await errOf(() => db.as(stranger.uid, `select report_link('team', $1, $2, 'spam')`, [team, kid])) ?? '', /only/i);
    await db.as(coach.uid, `select report_link('team', $1, $2, 'A stranger keeps adding my player')`, [team, kid]);
    assert.equal((await db.as(coach.uid, `select * from my_pending_links()`)).length, 0);
    assert.equal((await db.as(coach.uid, `select * from my_declined_links()`)).length, 1);
    assert.match(await errOf(() => db.as(coach.uid, `select * from support_link_reports()`)) ?? '', /support/i);
    assert.ok(await errOf(() => db.as(coach.uid, `select * from link_reports`)), 'the table is closed');
    const sup = await db.signUp({ name: 'Support Person', dob: '1980-01-01' });
    await db.sql(`update profiles set role = 'support' where id = $1`, [sup]);
    const rows = await db.as<{ id: string; group_name: string; reason: string; creator_reports: number }>(sup, `select * from support_link_reports()`);
    assert.deepEqual(rows.map((r) => [r.group_name, r.reason, r.creator_reports]), [['Other XI', 'A stranger keeps adding my player', 1]]);
    await db.as(sup, `select support_handle_link_report($1)`, [rows[0].id]);
    assert.equal((await db.as(sup, `select * from support_link_reports()`)).length, 0);
  });
});
