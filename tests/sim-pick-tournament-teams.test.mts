/** 600 simulated searches over random team lists: results are only real teams
 *  of the sport, never picked ones, name-starts first, at most 20; a typed
 *  name that matches an existing team is always caught. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPickTeams, sameNameTeam } from '../src/core/teamPick.ts';

let seed = 1106;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const WORDS = ['Lions', 'Tigers', 'Falcons', 'Rovers', 'United', 'City', 'Sea', 'Royal', 'Strikers', 'Kings'];
const SPORTS = ['football', 'cricket', 'kabaddi'];

test('600 searches', () => {
  for (let u = 0; u < 600; u++) {
    const teams = Array.from({ length: 5 + rnd(60) }, (_, i) => ({
      id: `u${u}t${i}`, name: `${WORDS[rnd(10)]}${rnd(2) ? ` ${WORDS[rnd(10)]}` : ''}`, shortName: 'X', sport: SPORTS[rnd(3)],
      adhoc: rnd(5) === 0, slotTournamentId: rnd(8) === 0 ? 't' : undefined,
    }));
    const sport = SPORTS[rnd(3)];
    const picked = teams.filter(() => rnd(6) === 0).map((t) => t.id);
    const q = WORDS[rnd(10)].slice(0, 2 + rnd(3)).toLowerCase();
    const hits = searchPickTeams(teams, q, sport, picked);
    assert.ok(hits.length <= 20);
    let sawContains = false;
    for (const h of hits) {
      assert.equal(h.sport, sport);
      assert.ok(!h.adhoc && !h.slotTournamentId && !picked.includes(h.id));
      assert.ok(h.name.toLowerCase().includes(q));
      const starts = h.name.toLowerCase().startsWith(q);
      if (!starts) sawContains = true; else assert.ok(!sawContains, 'a name-start after a contains');
    }
    const real = teams.filter((t) => t.sport === sport && !t.adhoc && !t.slotTournamentId);
    if (real.length) {
      const t = real[rnd(real.length)];
      assert.equal(sameNameTeam(teams, `  ${t.name.toUpperCase()} `, sport)?.name.toLowerCase(), t.name.toLowerCase());
    }
  }
});
