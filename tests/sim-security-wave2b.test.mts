/**
 * Security Wave 2b — simulating hundreds of users against a real Postgres
 * (quality mandate step 6). 150 coaches each add 2 children and a team; 100
 * parents each have a child with their own account; 150 other coaches add those
 * children to their own teams, clubs, communities and events; every child's
 * side answers Confirm or Not us; 60 hosts set up friendlies that the other
 * team's manager accepts or declines; 100 strangers try to answer for anyone;
 * 100 email sign-ups try to link a coach-made profile by proving a number.
 * Invariants: a link reveals the child exactly when its side confirmed; "Not
 * us" takes the child off and never asks again; the pending lists are exactly
 * the unanswered links; a friendly reveals the opponents exactly when they
 * accepted; strangers can neither answer nor see; a number links only the
 * right person's profile.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('750 people: requests to confirm, friendlies and link-by-phone hold', async () => {
  const db = await bootDb({ strict: true });
  const r = mulberry32(20261028);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const t0 = Date.now();
  let accounts = 0;
  const me = async (name: string, dob = '1985-01-01') => {
    const uid = await db.signUp({ name, dob });
    accounts++;
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, $3) returning id`, [name, uid, dob]);
    return { uid, player: p.id };
  };
  const sees = async (viewer: string, player: string) =>
    (await db.sql<{ v: boolean }>(`select player_full_visible_to($1, $2) as v`, [viewer, player]))[0].v;
  const fails = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch { return true; } };

  // The children and who speaks for each.
  type Kid = { id: string; side: string; name: string };
  const kids: Kid[] = [];
  const coachTeams: { uid: string; team: string; kids: string[] }[] = [];
  for (let c = 0; c < 150; c++) {
    const coach = await me(`Coach ${c}`);
    const ids: string[] = [];
    for (let k = 0; k < 2; k++) {
      const name = `Kid ${c}.${k}`;
      const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob) values ($1, '2014-05-05') returning id`, [name]);
      ids.push(p.id);
      kids.push({ id: p.id, side: coach.uid, name });
    }
    const [t] = await db.as<{ id: string }>(coach.uid, `insert into teams (name, short_name, sport, roster) values ($1, 'T', 'football', $2) returning id`, [`Team ${c}`, JSON.stringify(ids)]);
    coachTeams.push({ uid: coach.uid, team: t.id, kids: ids });
  }
  for (let f = 0; f < 100; f++) {
    const parent = await db.signUp({ name: `Parent ${f}`, dob: '1980-01-01' }); accounts++;
    const child = await db.signUp({ name: `Child ${f}`, dob: '2013-03-03' }); accounts++;
    const [p] = await db.as<{ id: string }>(child, `insert into players (full_name, profile_id, dob) values ($1, $2, '2013-03-03') returning id`, [`Child ${f}`, child]);
    await db.sql(`update players set guardian_profile_id = $1 where id = $2`, [parent, p.id]);
    kids.push({ id: p.id, side: f % 2 ? parent : child, name: `Child ${f}` });
  }

  // 150 other coaches each link 2 children to a group of their own.
  type Link = { kind: 'team' | 'club' | 'org' | 'field_event'; group: string; kid: Kid; viewer: string };
  const links: Link[] = [];
  const kinds = ['team', 'team', 'club', 'org', 'field_event'] as const;
  for (let a = 0; a < 150; a++) {
    const adder = await me(`Adder ${a}`);
    const kind = kinds[a % kinds.length];
    const chosen = new Set<Kid>();
    while (chosen.size < 2) chosen.add(pick(kids));
    const two = [...chosen];
    if (kind === 'team') {
      const [t] = await db.as<{ id: string }>(adder.uid, `insert into teams (name, short_name, sport, roster) values ($1, 'A', 'football', $2) returning id`, [`Adder XI ${a}`, JSON.stringify(two.map((k) => k.id))]);
      for (const k of two) links.push({ kind, group: t.id, kid: k, viewer: adder.uid });
    } else if (kind === 'club') {
      const [c] = await db.as<{ id: string }>(adder.uid, `insert into clubs (name, short_name) values ($1, 'C') returning id`, [`Club ${a}`]);
      await db.as(adder.uid, `insert into club_members (club_id, player_id, role) values ($1, $2, 'admin')`, [c.id, adder.player]);
      for (const k of two) { await db.as(adder.uid, `insert into club_members (club_id, player_id) values ($1, $2)`, [c.id, k.id]); links.push({ kind, group: c.id, kid: k, viewer: adder.uid }); }
    } else if (kind === 'org') {
      const [o] = await db.as<{ id: string }>(adder.uid, `insert into organizations (name, type, created_by) values ($1, 'Sports academy', auth.uid()) returning id`, [`Academy ${a}`]);
      await db.as(adder.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, adder.player]);
      for (const k of two) { await db.as(adder.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, k.id]); links.push({ kind, group: o.id, kid: k, viewer: adder.uid }); }
    } else {
      const [e] = await db.as<{ id: string }>(adder.uid, `insert into field_events (sport, title, host_ids) values ('athletics', $1, $2) returning id`, [`Race ${a}`, [adder.player]]);
      for (const k of two) { await db.as(adder.uid, `insert into field_entries (event_id, player_id) values ($1, $2)`, [e.id, k.id]); links.push({ kind, group: e.id, kid: k, viewer: adder.uid }); }
    }
  }
  for (const l of links) assert.equal(await sees(l.viewer, l.kid.id), false, `${l.kind} revealed a child before anyone answered`);

  // Every side's pending list is exactly its unanswered links.
  const key = (k: string, g: string, p: string) => `${k}:${g}:${p}`;
  const sides = [...new Set(links.map((l) => l.kid.side))];
  let listMs = 0;
  for (const side of sides) {
    const s = Date.now();
    const got = await db.as<{ kind: string; group_id: string; player_id: string }>(side, `select kind, group_id, player_id from my_pending_links()`);
    listMs += Date.now() - s;
    const want = links.filter((l) => l.kid.side === side).map((l) => key(l.kind, l.group, l.kid.id));
    assert.deepEqual(got.map((x) => key(x.kind, x.group_id, x.player_id)).sort(), [...new Set(want)].sort(), 'a pending list is wrong');
  }

  // 100 strangers try to answer for others and to read their lists.
  let blocked = 0;
  for (let s = 0; s < 100; s++) {
    const st = await me(`Stranger ${s}`);
    const l = pick(links);
    if (await fails(() => db.as(st.uid, `select answer_link($1, $2, $3, $4)`, [l.kind, l.group, l.kid.id, r() < 0.5]))) blocked++;
    assert.deepEqual(await db.as(st.uid, `select * from my_pending_links()`), []);
    assert.equal(await sees(st.uid, l.kid.id), false);
  }
  assert.equal(blocked, 100, 'a stranger answered for a child');

  // Each side answers: 70% Confirm, 30% Not us.
  const answered = new Map<string, boolean>();
  for (const l of links) {
    const k = key(l.kind, l.group, l.kid.id);
    if (answered.has(k)) continue;
    const yes = r() < 0.7;
    answered.set(k, yes);
    await db.as(l.kid.side, `select answer_link($1, $2, $3, $4)`, [l.kind, l.group, l.kid.id, yes]);
  }
  let confirmed = 0, declined = 0;
  for (const l of links) {
    const yes = answered.get(key(l.kind, l.group, l.kid.id))!;
    assert.equal(await sees(l.viewer, l.kid.id), yes, `${l.kind}: the answer (${yes}) wasn't honoured`);
    if (!yes && l.kind !== 'field_event') {
      const [{ n }] = await db.sql<{ n: number }>(`select member_link_exists($1, $2, $3)::int as n`, [l.kind, l.group, l.kid.id]);
      assert.equal(n, 0, `${l.kind}: "Not us" left the child in`);
    }
    if (yes) confirmed++; else declined++;
  }
  for (const side of sides) assert.deepEqual(await db.as(side, `select * from my_pending_links()`), [], 'answered requests came back');
  // The adders re-add every declined child: nothing new is asked, nothing revealed.
  for (const l of links.filter((x) => x.kind === 'team' && !answered.get(key(x.kind, x.group, x.kid.id)))) {
    await db.as(l.viewer, `update teams set roster = roster || $2::jsonb where id = $1`, [l.group, JSON.stringify([l.kid.id])]);
    assert.equal(await sees(l.viewer, l.kid.id), false);
  }
  for (const side of sides) assert.deepEqual(await db.as(side, `select * from my_pending_links()`), [], 'a re-add asked again');

  // 60 hosts set up friendlies against coaches' teams; 60% accept.
  let friendMs = 0, accepted = 0;
  for (let h = 0; h < 60; h++) {
    const host = await me(`Host ${h}`);
    const opp = coachTeams[h];
    const [ht] = await db.as<{ id: string }>(host.uid, `insert into teams (name, short_name, sport, roster) values ($1, 'H', 'football', '[]') returning id`, [`Host XI ${h}`]);
    const [m] = await db.as<{ id: string }>(host.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'scheduled') returning id`, [ht.id, opp.team, [host.player]]);
    assert.ok(await fails(() => db.as(host.uid, `select answer_friendly($1, $2, true)`, [m.id, opp.team])), 'a host accepted for the opponent');
    const s = Date.now();
    const pend = await db.as<{ match_id: string }>(opp.uid, `select * from my_pending_friendlies()`);
    friendMs += Date.now() - s;
    assert.deepEqual(pend.map((x) => x.match_id), [m.id]);
    const yes = r() < 0.6;
    if (yes) accepted++;
    await db.as(opp.uid, `select answer_friendly($1, $2, $3)`, [m.id, opp.team, yes]);
    for (const k of opp.kids) assert.equal(await sees(host.uid, k), yes, 'a friendly answer wasn\'t honoured');
    assert.deepEqual(await db.as(opp.uid, `select * from my_pending_friendlies()`), []);
  }

  // 100 email sign-ups prove a number: 40 the right person, 30 a parent's
  // number on a child's profile, 30 a number nobody added.
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < 100; i++) {
    const coach = coachTeams[i % coachTeams.length];
    const phone = `+9198200${String(i).padStart(5, '0')}`;
    const kind = i < 40 ? 'right' : i < 70 ? 'parent' : 'nobody';
    const childName = `Ravi${i} Kumar`;
    let target: string | null = null;
    if (kind !== 'nobody') {
      const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, phone) values ($1, $2) returning id`, [childName, phone]);
      target = p.id;
    }
    const uid = await db.signUp({ name: kind === 'parent' ? `Sunita${i} Kumar` : childName, dob: kind === 'parent' ? '1981-01-01' : '2012-01-01' }); accounts++;
    if (i % 2) await db.as(uid, `insert into players (full_name, profile_id) values ($1, $2)`, [kind === 'parent' ? `Sunita${i} Kumar` : childName, uid]);
    const [{ o }] = await db.asService<{ o: string }>(`select claim_player_by_phone($1, $2) as o`, [uid, phone]);
    outcomes[o] = (outcomes[o] ?? 0) + 1;
    assert.equal(o, kind === 'right' ? 'linked' : kind === 'parent' ? 'support' : 'none', `${kind} → ${o}`);
    if (target) {
      const [row] = await db.sql<{ profile_id: string | null }>(`select profile_id from players where id = $1`, [target]);
      assert.equal(row.profile_id, kind === 'right' ? uid : null);
      const [{ n }] = await db.sql<{ n: number }>(`select count(*)::int as n from players where profile_id = $1`, [uid]);
      assert.equal(n, kind === 'right' ? 1 : i % 2, 'an account ended with the wrong number of profiles');
    }
  }

  const ms = Date.now() - t0;
  console.log(`simulated ${accounts} accounts: ${links.length} links (${confirmed} confirmed, ${declined} not us), ${sides.length} sides — lists avg ${(listMs / sides.length).toFixed(1)} ms; `
    + `100 strangers blocked; 60 friendlies (${accepted} accepted) — list avg ${(friendMs / 60).toFixed(1)} ms; phone claims ${JSON.stringify(outcomes)} — ${ms} ms`);
  assert.ok(accounts >= 500, `only ${accounts} accounts`);
  assert.ok(ms < 120_000, `took ${ms} ms`);
});
