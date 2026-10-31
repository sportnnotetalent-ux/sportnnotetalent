/**
 * Quality mandate step 6 for audit round 2 (ordinal suffixes, box-score
 * comparison, line-up sides):
 *  - places 1–2,000 in team lifting and custom ties read like an English
 *    ordinal (checked against an independent rule);
 *  - 1,000 random team comparisons: a lower-is-better row always lights the
 *    side with fewer, every other row the side with more;
 *  - 500 line-up writes on a real Postgres by home captains, away captains and
 *    hosts, inserts and updates: no one ever changes a side they don't manage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placesText } from '../src/data/results/liftingTeam.ts';
import { customSpec } from '../src/data/teamTie.ts';
import { leaderOf, LOWER_BETTER_KEYS } from '../src/sports/boxScore.ts';
import { bootDb } from './helpers/pgdb.mts';

const english = (n: number) => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};
let seed = 3;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)

test('places 1–2,000 read as English ordinals', () => {
  for (let n = 1; n <= 2000; n++) {
    const a = Array(n).fill(0); a[n - 1] = 1;
    assert.equal(placesText(a), `${english(n)} ×1`);
  }
  const names = customSpec('badminton', Array(150).fill('S')).rubbers.map((r) => r.l);
  names.forEach((l, i) => assert.equal(l, `${english(i + 1)} singles`));
});

test('1,000 comparisons: the highlight is always the better side', () => {
  const keys = [...LOWER_BETTER_KEYS, 'shots', 'saves', 'assists', 'rebounds'];
  for (let i = 0; i < 1000; i++) {
    const key = keys[rnd(keys.length)];
    const h = rnd(30), a = rnd(30);
    const lead = leaderOf({ h, a, lowerBetter: LOWER_BETTER_KEYS.has(key) || undefined });
    if (h === a) assert.equal(lead, null);
    else if (LOWER_BETTER_KEYS.has(key)) assert.equal(lead, h < a ? 'home' : 'away', key);
    else assert.equal(lead, h > a ? 'home' : 'away', key);
  }
});

test('500 line-up writes: nobody changes a side they do not manage', async () => {
  const db = await bootDb();
  const person = async (name: string) => {
    const uid = await db.signUp({ name, dob: '1990-01-01' });
    const [p] = await db.as<{ id: string }>(uid, `insert into players (full_name, profile_id) values ($1, $2) returning id`, [name, uid]);
    return { uid, pid: p.id };
  };
  const hc = await person('HC'), ac = await person('AC'), ho = await person('Host');
  const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('H', 'H', 'football', $1) returning id`, [hc.pid]);
  const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport, captain_id) values ('A', 'A', 'football', $1) returning id`, [ac.pid]);
  const who = [{ uid: hc.uid, sides: ['home'] }, { uid: ac.uid, sides: ['away'] }, { uid: ho.uid, sides: ['home', 'away'] }];
  let allowed = 0, refused = 0, leaked = 0;
  const matches: string[] = [];
  for (let m = 0; m < 50; m++) {
    const [row] = await db.sql<{ id: string }>(`insert into matches (sport, status, home_team_id, away_team_id, host_ids) values ('football', 'scheduled', $1, $2, $3) returning id`, [h.id, a.id, [ho.pid]]);
    matches.push(row.id);
  }
  for (let i = 0; i < 500; i++) {
    const mid = matches[rnd(matches.length)];
    const actor = who[rnd(3)];
    const side = rnd(2) ? 'home' : 'away';
    const before = (await db.sql<{ home: unknown; away: unknown }>(`select home, away from match_lineups where match_id = $1`, [mid]))[0];
    const val = JSON.stringify([{ playerId: `p${i}` }]);
    let ok = true;
    try {
      if (!before) await db.as(actor.uid, `insert into match_lineups (match_id, ${side}) values ($1, $2)`, [mid, val]);
      else await db.as(actor.uid, `update match_lineups set ${side} = $2 where match_id = $1`, [mid, val]);
    } catch { ok = false; }
    const may = actor.sides.includes(side);
    if (ok && !may) leaked++;
    if (ok) allowed++; else refused++;
    if (!ok && may) assert.fail(`a ${side} manager was refused`);
  }
  assert.equal(leaked, 0);
  assert.ok(allowed > 100 && refused > 100, `${allowed} allowed, ${refused} refused`);
});
