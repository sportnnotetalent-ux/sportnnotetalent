/**
 * Quality mandate step 6 for guest scoring (docs/security/breaks/guest-scoring.md):
 * 500 guest games of random taps and undos, then claimed over a flaky network
 * (random lost replies at any step, retried until done). Every time: exactly
 * two teams and one match on the server, each tap uploaded once, and the
 * server's board equals the board the guest saw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGuestMatch, appendGuestEvent, popGuestEvent, claimGuestMatch, type GuestMatch, type ClaimDeps } from '../src/core/guestMatch.ts';
import { deriveLog } from '../src/data/eventLog.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 97;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
let u = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++u).padStart(12, '0')}`;
const plugin = { createInitialState: badminton.init, reducer: badminton.reducer as never };

test('500 guest games claimed over a flaky network', async () => {
  for (let i = 0; i < 500; i++) {
    let g: GuestMatch = newGuestMatch({ sport: 'badminton', homeName: 'A', awayName: 'B', homeTeamName: 'Asha', awayTeamName: 'Bina', homeColor: '#f00', awayColor: '#00f', config: {} }, 0, uuid);
    const taps = rnd(80);
    for (let k = 0; k < taps; k++) {
      g = rnd(6) === 0 ? popGuestEvent(g) : appendGuestEvent(g, { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction, uuid, k);
    }
    const seen = deriveLog(plugin, g.config, g.events).state;

    // the server: rows by id; taps by client id; replies lost at random
    const teams = new Set<string>(), matches = new Set<string>();
    const taps2 = new Map<string, MatchEventRecord>();
    const lose = () => rnd(5) === 0;
    let cur: GuestMatch | null = g;
    const store = { get: async () => cur, set: async (x: GuestMatch) => { cur = x; }, clear: async () => { cur = null; } };
    const deps: ClaimDeps = {
      myPlayerId: async () => 'me',
      createTeam: async (t) => { teams.add(t.id); if (lose()) throw new Error('lost'); },
      createMatch: async (m) => { matches.add(m.id); if (lose()) throw new Error('lost'); },
      setScorer: async () => { if (lose()) throw new Error('lost'); },
      uploadOne: async (_id, e) => { taps2.set(e.clientId!, e); if (lose()) throw new Error('lost'); },
      saveBoard: async () => { if (lose()) throw new Error('lost'); },
      endManually: async () => {},
    };
    let tries = 0;
    for (;;) {
      tries++;
      try { if (await claimGuestMatch(store, deps, { home: 'AS', away: 'BI' }, uuid)) break; } catch { /* retry */ }
      assert.ok(tries < 200, 'finishes');
    }
    assert.equal(teams.size, 2, 'two teams, ever');
    assert.equal(matches.size, 1, 'one match, ever');
    assert.equal(taps2.size, g.events.length, 'each tap once');
    const server = [...taps2.values()].sort((a, b) => a.seq - b.seq);
    assert.deepEqual(deriveLog(plugin, g.config, server).state, seen, 'the same board');
    assert.equal(cur, null);
  }
});
