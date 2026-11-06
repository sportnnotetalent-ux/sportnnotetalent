/** 600 captains set squads and roles, change their minds and drop players:
 *  a role always points at someone in that side's squad, or at nobody. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSquadRoles, pickRole } from '../src/core/matchRoles.ts';
import type { MatchSquad } from '../src/core/types.ts';

let seed = 99;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];

test('600 sides: roles stay inside the squad through every change', () => {
  for (let u = 0; u < 600; u++) {
    const pool = Array.from({ length: 4 + Math.floor(rnd() * 14) }, (_, i) => `p${u}-${i}`);
    let sq: MatchSquad = { starters: pool.slice(0, 3), subs: [] };
    for (let step = 0; step < 30; step++) {
      const act = rnd();
      if (act < 0.3) sq = { ...sq, captainId: pickRole(sq.captainId, pick([...sq.starters, ...sq.subs, 'outsider'])) };
      else if (act < 0.5) sq = { ...sq, keeperId: pickRole(sq.keeperId, pick([...sq.starters, ...sq.subs])) };
      else if (act < 0.75) sq = { ...sq, starters: pool.filter(() => rnd() < 0.5) };
      else sq = { ...sq, subs: pool.filter(() => rnd() < 0.3) };
      sq = cleanSquadRoles(sq);
      const ids = new Set([...sq.starters, ...sq.subs]);
      if (sq.captainId) assert.ok(ids.has(sq.captainId), 'captain in squad');
      if (sq.keeperId) assert.ok(ids.has(sq.keeperId), 'keeper in squad');
    }
  }
});
