/** 600 people use team join links (adults, teens, parents for children), and
 *  captains accept or decline. Database-level (PGlite). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

let seed = 5;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

test('600 people: only allowed asks succeed; squads never duplicate; accepted = in squad + joined', { timeout: 600_000 }, async () => {
  const db = await bootDb({ strict: true });
  const caps: { uid: string; team: string; token: string }[] = [];
  for (let i = 0; i < 20; i++) {
    const uid = await db.signUp({ name: `Cap ${i}`, dob: '1985-01-01' });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1985-01-01') returning id`, [`Cap ${i}`, uid]);
    const [t] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id, roster) values ($1, 'T', 'football', $2, $3) returning id`, [`Team ${i}`, p.id, JSON.stringify([p.id])]);
    const [{ tok }] = await db.as<{ tok: string }>(uid, `select team_join_link($1) as tok`, [t.id]);
    caps.push({ uid, team: t.id, token: tok });
  }
  type Person = { uid: string; pid: string; kind: 'adult' | 'teen' | 'parent' };
  const people: Person[] = [];
  for (let i = 0; i < 600; i++) {
    const kind = pick(['adult', 'adult', 'teen', 'parent'] as const);
    const dob = kind === 'teen' ? '2011-06-01' : '1992-06-01';
    const uid = await db.signUp({ name: `P ${i}`, dob });
    let pid: string;
    if (kind === 'parent') {
      [{ id: pid }] = await db.sql<{ id: string }>(`insert into players (full_name, dob, guardian_profile_id) values ($1, '2013-01-01', $2) returning id`, [`Child of ${i}`, uid]);
    } else {
      [{ id: pid }] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [`P ${i}`, uid, dob]);
    }
    people.push({ uid, pid, kind });
  }
  const counts: Record<string, number> = {};
  for (const p of people) {
    const c = pick(caps);
    const [{ r }] = await db.as<{ r: string }>(p.uid, `select request_team_join($1, $2) as r`, [c.token, p.pid]);
    counts[r] = (counts[r] ?? 0) + 1;
    if (p.kind === 'teen') assert.equal(r, 'ask_parent', 'a teen never asks alone');
    else assert.ok(['requested', 'team_busy'].includes(r), r);
  }
  for (const c of caps) {
    const reqs = await db.as<{ id: string; player_id: string; adult: boolean; name: string }>(c.uid, `select * from team_join_requests_for($1)`, [c.team]);
    assert.ok(reqs.length <= 100);
    for (const q of reqs) {
      if (!q.adult) { assert.match(q.name, /^(\S\.\s?)+$/, 'a child shows as initials'); assert.ok(!/Child of/.test(q.name), 'never the full name'); }
      await db.as(c.uid, `select decide_team_join($1, $2)`, [q.id, rnd() < 0.6]);
    }
    const [{ roster }] = await db.sql<{ roster: string[] }>(`select roster from teams where id = $1`, [c.team]);
    assert.equal(new Set(roster).size, roster.length, 'no duplicates');
    const accepted = await db.sql<{ player_id: string }>(`select player_id from team_join_requests where team_id = $1 and status = 'accepted'`, [c.team]);
    for (const a of accepted) {
      assert.ok(roster.includes(a.player_id), 'accepted → in the squad');
      const cons = await db.sql(`select 1 from member_consents where kind = 'team' and group_id = $1 and player_id = $2 and method = 'joined'`, [c.team, a.player_id]);
      assert.equal(cons.length, 1);
    }
    const declined = await db.sql<{ player_id: string }>(`select player_id from team_join_requests where team_id = $1 and status = 'declined'`, [c.team]);
    for (const d of declined) assert.ok(!roster.includes(d.player_id), 'declined → not added');
  }
  assert.ok((counts.requested ?? 0) > 300, JSON.stringify(counts));
});
