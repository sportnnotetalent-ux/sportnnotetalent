/**
 * Security Wave 3B — simulating hundreds of users against a real Postgres
 * (quality mandate step 6): results you can trust.
 *  - 50 tournaments, each with an organiser, 2 scorers and 2 teams of 4
 *    children (the organiser's own), play a match and finish it;
 *  - 120 strangers each put a random child on their own team, play a friendly,
 *    write a stat line for that child and try to give them a certificate;
 *  - 60 organisers enter another coach's child in a singles draw; the line is
 *    kept aside; 40 coaches confirm (the line appears), 20 say "Not us";
 *  - every tournament match is then aged past 24 hours: its scorers try to
 *    correct, reopen, delete, move it out and write stat lines (all refused),
 *    its organiser corrects it (allowed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('50 tournaments, 400 children, 120 strangers, 60 late confirmations: results hold', async () => {
  const db = await bootDb({ strict: true });
  const r = mulberry32(20261029);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const t0 = Date.now();
  let accounts = 0;
  const me = async (name: string) => {
    const uid = await db.signUp({ name, dob: '1985-01-01' }); accounts++;
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1985-01-01') returning id`, [name, uid]);
    return { uid, player: p.id };
  };
  const fails = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };
  const count = async (q: string, p: unknown[]) => (await db.sql<{ n: number }>(`select count(*)::int as n from (${q}) x`, p))[0].n;
  const statLine = (uid: string, m: string, p: string) =>
    db.as(uid, `insert into stat_lines (match_id, player_id, sport, stats) values ($1, $2, 'football', '{"goals":1}')`, [m, p]);

  type Tour = { org: { uid: string; player: string }; scorers: { uid: string; player: string }[]; id: string; match: string; kids: string[] };
  const tours: Tour[] = [];
  let syncMs = 0;
  for (let i = 0; i < 50; i++) {
    const org = await me(`Organiser ${i}`);
    const scorers = [await me(`Scorer ${i}a`), await me(`Scorer ${i}b`)];
    const [tr] = await db.as<{ id: string }>(org.uid, `insert into tournaments (name, host_name, organizer_id) values ($1, 'O', auth.uid()) returning id`, [`Cup ${i}`]);
    const teamIds: string[] = [];
    const kids: string[] = [];
    for (const side of ['A', 'B']) {
      const ids: string[] = [];
      for (let k = 0; k < 4; k++) {
        const [p] = await db.as<{ id: string }>(org.uid, `insert into players (full_name, dob) values ($1, '2013-01-01') returning id`, [`Kid ${i}${side}${k}`]);
        ids.push(p.id);
      }
      kids.push(...ids);
      const [t] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ($1, $2, 'football', $3) returning id`, [`T${i}${side}`, side, JSON.stringify(ids)]);
      await db.as(org.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [tr.id, t.id]);
      teamIds.push(t.id);
    }
    const [m] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, tournament_id, home_team_id, away_team_id, status, scorer_ids) values ('football', $1, $2, $3, 'live', $4) returning id`,
      [tr.id, teamIds[0], teamIds[1], scorers.map((s) => s.player)]);
    const sc = pick(scorers);
    await db.as(sc.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 1, 'GOAL', 'home', '{}')`, [m.id]);
    await db.as(sc.uid, `update matches set status = 'completed', winner = 'home' where id = $1`, [m.id]);
    const s0 = Date.now();
    for (const k of kids) await statLine(sc.uid, m.id, k);
    syncMs += Date.now() - s0;
    tours.push({ org, scorers, id: tr.id, match: m.id, kids });
  }
  accounts += 400;
  assert.equal(await count(`select 1 from stat_lines`, []), 400, 'a legitimate line was skipped');

  // 120 strangers: a friendly with a random child, a stat line, a certificate
  let strangerLines = 0, strangerCerts = 0;
  for (let s = 0; s < 120; s++) {
    const st = await me(`Stranger ${s}`);
    const tour = pick(tours);
    const kid = pick(tour.kids);
    const [t] = await db.as<{ id: string }>(st.uid, `insert into teams (name, short_name, sport, roster) values ('S', 'S', 'football', $1) returning id`, [JSON.stringify([kid])]);
    const [m] = await db.as<{ id: string }>(st.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [t.id, [st.player]]);
    await statLine(st.uid, m.id, kid);
    strangerLines += await count(`select 1 from stat_lines where match_id = $1 and player_id = $2`, [m.id, kid]);
    const [own] = await db.as<{ id: string }>(st.uid, `insert into tournaments (name, host_name, organizer_id) values ('Fake', 'S', auth.uid()) returning id`);
    await db.as(st.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [own.id, t.id]);
    strangerCerts += (await db.as(st.uid, `select * from issue_certificates($1, $2)`, [own.id, JSON.stringify([{ playerId: kid, kind: 'champion', title: 'Champion' }])])).length;
  }
  assert.equal(strangerLines, 0, 'a stranger wrote a child\'s stat line');
  assert.equal(strangerCerts, 0, 'a stranger certified a child');

  // 60 organisers enter another coach's child; 40 coaches confirm, 20 say "Not us"
  let released = 0, removed = 0;
  const entered: string[] = [];
  for (let i = 0; i < 60; i++) {
    const coach = await me(`Coach ${i}`);
    const [k] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ($1, '2014-02-02') returning id`, [`Entered ${i}`]);
    entered.push(k.id);
    const org = pick(tours).org;
    const [e] = await db.as<{ id: string }>(org.uid, `insert into teams (name, short_name, sport, roster) values ('E', 'E', 'football', $1) returning id`, [JSON.stringify([k.id])]);
    const [m] = await db.as<{ id: string }>(org.uid, `insert into matches (sport, home_team_id, host_ids, status) values ('football', $1, $2, 'live') returning id`, [e.id, [org.player]]);
    await statLine(org.uid, m.id, k.id);
    await db.as(org.uid, `update matches set status = 'completed' where id = $1`, [m.id]);
    assert.equal(await count(`select 1 from stat_lines where match_id = $1 and player_id = $2`, [m.id, k.id]), 0);
    await db.sql(`update matches set completed_at = now() - interval '3 days' where id = $1`, [m.id]);
    const yes = i < 40;
    await db.as(coach.uid, `select answer_link('team', $1, $2, $3)`, [e.id, k.id, yes]);
    const n = await count(`select 1 from stat_lines where match_id = $1 and player_id = $2`, [m.id, k.id]);
    assert.equal(n, yes ? 1 : 0, yes ? 'a confirmed child\'s line didn\'t come back' : '"Not us" left a line');
    if (yes) released++; else removed++;
  }
  // the 60 answered: nothing left aside; the strangers' 120 wait for the child's side (who'll say "Not us")
  assert.equal(await count(`select 1 from parked_stat_lines where player_id = any($1::uuid[])`, [entered]), 0, 'answered lines left aside');
  const waiting = await count(`select 1 from parked_stat_lines`, []);

  // every tournament match ends more than 24 hours ago
  let refused = 0, attempts = 0, organiserFixes = 0;
  for (const tour of tours) {
    await db.sql(`update matches set completed_at = now() - interval '25 hours' where id = $1`, [tour.match]);
    const sc = pick(tour.scorers);
    const tries = [
      () => db.as(sc.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 9, 'AMEND', null, '{}')`, [tour.match]),
      () => db.as(sc.uid, `delete from match_events where match_id = $1`, [tour.match]),
      () => db.as(sc.uid, `update matches set status = 'live' where id = $1`, [tour.match]),
      () => db.as(sc.uid, `update matches set winner = 'away' where id = $1`, [tour.match]),
      () => db.as(sc.uid, `update matches set tournament_id = null where id = $1`, [tour.match]),
      () => db.as(sc.uid, `update stat_lines set stats = '{"goals":9}' where match_id = $1`, [tour.match]),
    ];
    for (const t of tries) { attempts++; if (await fails(t)) refused++; }
    await db.as(sc.uid, `delete from matches where id = $1`, [tour.match]);
    assert.equal(await count(`select 1 from matches where id = $1 and winner = 'home' and status = 'completed'`, [tour.match]), 1, 'a scorer changed a final result');
    await db.as(tour.org.uid, `insert into match_events (match_id, seq, type, side, payload) values ($1, 9, 'AMEND', null, '{}')`, [tour.match]);
    organiserFixes++;
  }
  assert.equal(refused, attempts, 'a scorer changed a finished match after 24 hours');

  const ms = Date.now() - t0;
  console.log(`simulated ${accounts} people: 400 lines kept (sync avg ${(syncMs / 400).toFixed(1)} ms a line); 120 strangers wrote 0 lines and 0 certificates; `
    + `${released} late confirmations released their lines, ${removed} "Not us" removed them, ${waiting} strangers' lines wait unseen; ${refused}/${attempts} late scorer changes refused, ${organiserFixes} organiser corrections — ${ms} ms`);
  assert.ok(accounts >= 500, `only ${accounts}`);
});
