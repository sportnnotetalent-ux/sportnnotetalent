/**
 * Security Wave 2 — simulating hundreds of users against a real Postgres
 * (quality mandate step 6). 100 coaches each add 3 children and a team with an
 * assistant; 40 schools each add 4 students with 2 staff; 200 strangers each
 * make one of the ten self-made links (their own roster, team members, roles,
 * captain slot, club, community, tournament entry, friendly, field entry,
 * House team) to a random child. Invariants: a stranger never sees that child's
 * full card and can never push to them; every coach, assistant and school staff
 * member still sees their own children.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb } from './helpers/pgdb.mts';

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('100 coaches, 100 assistants, 40 schools, 300 + 160 children and 200 strangers — consent holds', async () => {
  const db = await bootDb({ strict: true });
  const r = mulberry32(20261029);
  const t0 = Date.now();
  const me = async (name: string) => {
    const uid = await db.signUp({ name, dob: '1985-01-01' });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id, dob) values ($1, $2, '1985-01-01') returning id`, [name, uid]);
    return { uid, player: p.id };
  };
  const sees = async (viewer: string, player: string) =>
    (await db.sql<{ v: boolean }>(`select player_full_visible_to($1, $2) as v`, [viewer, player]))[0].v;
  type Kid = { id: string; team: string; viewers: string[] };
  const kids: Kid[] = [];

  for (let c = 0; c < 100; c++) {
    const coach = await me(`Coach ${c}`);
    const assistant = await me(`Assistant ${c}`);
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) {
      const [p] = await db.as<{ id: string }>(coach.uid, `insert into players (full_name, dob, house_name, sports) values ($1, '2014-05-05', 'Red', '{football}') returning id`, [`Kid ${c}.${k}`]);
      ids.push(p.id);
    }
    const [t] = await db.as<{ id: string }>(coach.uid, `insert into teams (name, short_name, sport, roster, admin_ids) values ($1, 'T', 'football', $2, $3) returning id`,
      [`Team ${c}`, JSON.stringify(ids), [assistant.player]]);
    for (const id of ids) kids.push({ id, team: t.id, viewers: [coach.uid, assistant.uid] });
  }
  for (let s = 0; s < 40; s++) {
    const head = await me(`Head ${s}`);
    const pe = await me(`PE ${s}`);
    const [o] = await db.as<{ id: string }>(head.uid, `insert into organizations (name, type, created_by) values ($1, 'School', auth.uid()) returning id`, [`School ${s}`]);
    await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date), ($1, $3, 'Admin', current_date)`, [o.id, head.player, pe.player]);
    for (let k = 0; k < 4; k++) {
      const [p] = await db.as<{ id: string }>(head.uid, `insert into players (full_name, dob) values ($1, '2013-02-02') returning id`, [`Student ${s}.${k}`]);
      await db.as(head.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, p.id]);
      kids.push({ id: p.id, team: '', viewers: [head.uid, pe.uid] });
    }
  }

  const kinds = ['roster', 'member', 'role', 'captain', 'club', 'org', 'tournament', 'friendly', 'field', 'house'] as const;
  const tally: Record<string, number> = {};
  for (let s = 0; s < 200; s++) {
    const st = await me(`Stranger ${s}`);
    const kid = kids.filter((k) => k.team)[Math.floor(r() * 300)];
    const kind = kinds[s % kinds.length];
    tally[kind] = (tally[kind] ?? 0) + 1;
    const myTeam = async (extra = '', vals: unknown[] = []) =>
      (await db.as<{ id: string }>(st.uid, `insert into teams (name, short_name, sport, roster${extra ? ', ' + extra : ''}) values ('S${s}', 'S', 'football', '[]'${vals.map((_, i) => `, $${i + 1}`).join('')}) returning id`, vals))[0].id;
    const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
    switch (kind) {
      case 'roster': await db.as(st.uid, `insert into teams (name, short_name, sport, roster) values ('S', 'S', 'football', $1)`, [JSON.stringify([kid.id])]); break;
      case 'member': { const t = await myTeam(); await quiet(db.as(st.uid, `insert into team_members (team_id, player_id) values ($1, $2)`, [t, kid.id])); break; }
      case 'role': { const t = await myTeam(); await quiet(db.as(st.uid, `insert into team_player_roles (team_id, player_id, roles) values ($1, $2, '{}')`, [t, kid.id])); break; }
      case 'captain': await myTeam('captain_id', [kid.id]); break;
      case 'club': { const [c] = await db.as<{ id: string }>(st.uid, `insert into clubs (name, short_name) values ('SC', 'SC') returning id`); await quiet(db.as(st.uid, `insert into club_members (club_id, player_id) values ($1, $2)`, [c.id, kid.id])); break; }
      case 'org': {
        const [o] = await db.as<{ id: string }>(st.uid, `insert into organizations (name, type, created_by) values ('SO', 'Sports club', auth.uid()) returning id`);
        await db.as(st.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Owner', current_date)`, [o.id, st.player]);
        await quiet(db.as(st.uid, `insert into org_members (org_id, player_id, role, since) values ($1, $2, 'Member', current_date)`, [o.id, kid.id]));
        break;
      }
      case 'tournament': {
        const [t] = await db.as<{ id: string }>(st.uid, `insert into tournaments (name, host_name, organizer_id) values ('SC', 'S', auth.uid()) returning id`);
        await quiet(db.as(st.uid, `insert into tournament_teams (tournament_id, team_id, status) values ($1, $2, 'confirmed')`, [t.id, kid.team]));
        break;
      }
      case 'friendly': { const t = await myTeam(); await quiet(db.as(st.uid, `insert into matches (sport, home_team_id, away_team_id, host_ids, status) values ('football', $1, $2, $3, 'live')`, [t, kid.team, [st.player]])); break; }
      case 'field': {
        const [e] = await db.as<{ id: string }>(st.uid, `insert into field_events (sport, title, host_ids) values ('golf', 'S', $1) returning id`, [[st.player]]);
        await quiet(db.as(st.uid, `insert into field_entries (event_id, player_id) values ($1, $2)`, [e.id, kid.id]));
        break;
      }
      case 'house': await db.as(st.uid, `insert into teams (name, short_name, sport, roster) values ('Red', 'R', 'football', '[]')`); break;
    }
    assert.equal(await sees(st.uid, kid.id), false, `stranger ${s} (${kind}) sees a child`);
    const [pt] = await db.as<{ t: string[] }>(st.uid, `select push_allowed_targets($1) as t`, [[kid.id]]);
    assert.deepEqual(pt.t, [], `stranger ${s} (${kind}) can push to a child`);
  }
  // everyone legitimate still sees their own children
  let checks = 0;
  for (const k of kids) for (const v of k.viewers) { assert.equal(await sees(v, k.id), true, 'a legitimate viewer lost a child'); checks++; }
  const ms = Date.now() - t0;
  console.log(`simulated 200 strangers (${Object.entries(tally).map(([k, n]) => `${k} ${n}`).join(', ')}) — all blocked; ${checks} legitimate views kept — ${ms} ms`);
  assert.ok(ms < 90_000, `took ${ms} ms`);
});
