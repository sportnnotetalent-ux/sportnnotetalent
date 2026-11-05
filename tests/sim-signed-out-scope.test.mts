/** 600 signed-out visitors: random shared pages, forged and junk headers
 *  (docs/security/breaks/signed-out-scope.md). Whatever they send, each
 *  request returns at most one shared item's rows: never two tournaments'
 *  matches, never a match outside the item, never the whole table. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDb } from './helpers/pgdb.mts';

let seed = 1112;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

test('600 visitors', async () => {
  const db = await bootDb({ strict: true });
  const one = async (q: string, p: unknown[] = []) => (await db.sql<{ id: string }>(q, p))[0].id;
  const T: string[] = [], M: string[] = [], P: string[] = [], TM: string[] = [];
  const matchT = new Map<string, string>();
  for (let t = 0; t < 6; t++) {
    const tid = await one(`insert into tournaments (name, host_name, sports) values ($1, 'H', '{football}') returning id`, [`T${t}`]);
    T.push(tid);
    const teams: string[] = [];
    for (let k = 0; k < 4; k++) {
      const pid = await one(`insert into players (full_name) values ($1) returning id`, [`P${t}${k}`]); P.push(pid);
      const team = await one(`insert into teams (name, short_name, sport, roster) values ($1, 'X', 'football', $2::jsonb) returning id`, [`Team${t}${k}`, JSON.stringify([pid])]);
      teams.push(team); TM.push(team);
      await db.sql(`insert into tournament_teams (tournament_id, team_id) values ($1, $2)`, [tid, team]);
    }
    for (let k = 0; k < 3; k++) {
      const mid = await one(`insert into matches (sport, tournament_id, home_team_id, away_team_id, status) values ('football', $1, $2, $3, 'completed') returning id`, [tid, teams[k], teams[k + 1]]);
      M.push(mid); matchT.set(mid, tid);
    }
  }
  const total = M.length;
  for (let u = 0; u < 600; u++) {
    const kind = rnd(5);
    const h = kind === 0 ? `m:${M[rnd(M.length)]}` : kind === 1 ? `t:${T[rnd(T.length)]}` : kind === 2 ? `p:${P[rnd(P.length)]}`
      : kind === 3 ? `team:${TM[rnd(TM.length)]}` : [`m:${randomUUID()}`, 'm:*', `t:${T[0]},t:${T[1]}`, "' or true --", ''][rnd(5)];
    const rows = (await db.asAnonWith({ 'x-share': h }, `select id::text, tournament_id::text t from matches`)) as { id: string; t: string }[];
    assert.ok(rows.length < total, `never the whole table (${h})`);
    assert.ok(new Set(rows.map((r) => r.t)).size <= 1, `one tournament at most (${h})`);
    if (h.startsWith('m:') && M.includes(h.slice(2))) assert.deepEqual(rows.map((r) => r.id), [h.slice(2)]);
    if (h.startsWith('t:') && !h.includes(',')) assert.ok(rows.every((r) => r.t === h.slice(2)) && rows.length === 3);
    if (kind === 4) assert.equal(rows.length, 0, `junk header → nothing (${h})`);
    const pv = (await db.asAnonWith({ 'x-share': h }, `select count(*)::int n from players_view`))[0] as { n: number };
    assert.ok(pv.n < P.length, `players never all (${h})`);
  }
});
