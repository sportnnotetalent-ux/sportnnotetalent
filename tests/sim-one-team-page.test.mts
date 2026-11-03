/** 600 simulated communities: clubs with several sports, plain teams and
 *  one-off sides; followers tapping Follow. Discover never shows a one-off,
 *  shows each club once with all its sports; every club row routes to its
 *  club (never from inside it); a Follow tap always lands on all-or-nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamRoute, discoverTeams, clubFollow, squadIds } from '../src/core/teamPage.ts';

let seed = 1105;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const SPORTS = ['football', 'cricket', 'tennis', 'badminton'] as const;

test('600 communities', () => {
  for (let c = 0; c < 600; c++) {
    const rows: { id: string; clubId?: string; adhoc?: boolean; sport: (typeof SPORTS)[number] }[] = [];
    const clubs = rnd(4);
    for (let k = 0; k < clubs; k++) for (const sp of SPORTS) if (rnd(2)) rows.push({ id: `c${c}k${k}${sp}`, clubId: `c${c}k${k}`, sport: sp });
    for (let i = 0; i < rnd(5); i++) rows.push({ id: `c${c}t${i}`, sport: SPORTS[rnd(4)] });
    for (let i = 0; i < rnd(5); i++) rows.push({ id: `c${c}a${i}`, adhoc: true, sport: SPORTS[rnd(4)] });
    const order = [...rows].sort(() => (rnd(2) ? 1 : -1));
    const sums = order.map((r) => ({ id: r.id, name: r.clubId ?? r.id, sports: [r.sport] }));
    const out = discoverTeams(sums, rows);
    assert.ok(out.every((t) => t.teamIds.every((id) => !rows.find((r) => r.id === id)?.adhoc)), 'a one-off in Discover');
    const clubIds = out.map((t) => t.clubId).filter(Boolean);
    assert.equal(new Set(clubIds).size, clubIds.length, 'a club twice');
    for (const t of out.filter((x) => x.clubId)) {
      const mine = rows.filter((r) => r.clubId === t.clubId);
      assert.deepEqual([...t.sports].sort(), [...new Set(mine.map((r) => r.sport))].sort());
      assert.deepEqual([...t.teamIds].sort(), mine.map((r) => r.id).sort());
    }
    assert.equal(out.reduce((n, t) => n + t.teamIds.length, 0), rows.filter((r) => !r.adhoc).length, 'a team lost');
    for (const r of rows) {
      const to = teamRoute(r);
      assert.equal(to.route, r.clubId ? 'ClubHome' : 'Team');
      assert.equal(teamRoute(r, { inClub: true }).route, 'Team');
    }
    // follow taps: start from a random partial state, one tap → all or nothing
    for (const t of out) {
      const followed = new Set(t.teamIds.filter(() => rnd(2)));
      const before = clubFollow(t.teamIds, (id) => followed.has(id));
      for (const id of before.toFollow) followed.add(id);
      for (const id of before.toUnfollow) followed.delete(id);
      const after = clubFollow(t.teamIds, (id) => followed.has(id));
      assert.equal(followed.size, before.following ? 0 : t.teamIds.length);
      assert.equal(after.following, !before.following);
    }
    const sq = squadIds(rnd(3) ? [] : ['a'], rnd(2) ? [] : ['b'], rnd(2) ? ['m1', 'm2', 'm1'] : []);
    assert.equal(new Set(sq).size, sq.length);
  }
});
