/**
 * Score first, sign up later (docs/security/breaks/guest-scoring.md): the
 * guest match's tap log and the claim that turns it into a normal match.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { newGuestMatch, appendGuestEvent, popGuestEvent, claimGuestMatch, isGuestId, type GuestMatch, type GuestStore, type ClaimDeps } from '../src/core/guestMatch.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let n = 0;
const uuid = () => `u${++n}`;
const base = () => newGuestMatch({ sport: 'badminton', homeName: 'A', awayName: 'B', homeTeamName: 'Asha', awayTeamName: 'Bina', homeColor: '#f00', awayColor: '#00f', config: { pointsPerGame: 21 } }, 0, uuid);
const P = (side: 'home' | 'away'): ScoreAction => ({ type: 'POINT', side } as ScoreAction);

describe('G2: the tap log', () => {
  test('guest ids are recognisable', () => {
    assert.equal(isGuestId(base().id), true);
    assert.equal(isGuestId('6da23011-61fb-4c24-9a8c-7a29b2924c46'), false);
    assert.equal(isGuestId(undefined), false);
  });
  test('taps get increasing seqs and their own client ids; Undo takes the newest off', () => {
    let g = base();
    g = appendGuestEvent(g, P('home'), uuid, 1);
    g = appendGuestEvent(g, P('away'), uuid, 2);
    assert.deepEqual(g.events.map((e) => [e.seq, e.side]), [[1, 'home'], [2, 'away']]);
    assert.notEqual(g.events[0].clientId, g.events[1].clientId);
    g = popGuestEvent(g);
    assert.deepEqual(g.events.map((e) => e.seq), [1]);
    assert.equal(popGuestEvent(popGuestEvent(g)).events.length, 0);
  });
  test('a second attribution rides in the payload, as the live log keeps it', () => {
    const g = appendGuestEvent(base(), { type: 'POINT', side: 'away', payload: { df: true }, attribution2: { playerId: 'p1', stat: 'doubleFaults' } } as ScoreAction, uuid, 1);
    assert.deepEqual(g.events[0].payload, { df: true, _attr2: { playerId: 'p1', stat: 'doubleFaults' } });
  });
});

function memStore(g: GuestMatch | null): GuestStore & { cur: GuestMatch | null } {
  const s = { cur: g, async get() { return s.cur; }, async set(x: GuestMatch) { s.cur = x; }, async clear() { s.cur = null; } };
  return s;
}
/** A fake server: rows by id (a second create with the same id is a no-op, as
 *  "already exists" is in the real one); `failAfter` loses the reply of the
 *  first call to that step AFTER the server did it. */
function server(failAfter?: string) {
  const rows = new Map<string, string>();
  const log: string[] = [];
  let pending = failAfter;
  const step = (name: string, id?: string) => {
    log.push(name);
    if (id && !rows.has(id)) rows.set(id, name);
    if (pending && name.startsWith(pending)) { pending = undefined; throw new Error('reply lost'); }
  };
  const d: ClaimDeps = {
    myPlayerId: async () => 'me',
    createTeam: async (x) => step(`team:${x.name}`, x.id),
    createMatch: async (x) => step(`match:${x.homeTeamId}-${x.awayTeamId}:${x.hostIds}`, x.id),
    setScorer: async (id, p) => step(`scorer:${id}:${p}`),
    uploadOne: async (id, e) => step(`upload:${id}:${e.clientId}`),
    saveBoard: async (id) => step(`board:${id}`),
    endManually: async (id, r) => step(`end:${id}:${r.kind}`),
  };
  return { d, rows, log };
}

describe('G3 / G6: the claim', () => {
  const played = () => appendGuestEvent(appendGuestEvent(base(), P('home'), uuid, 1), P('home'), uuid, 2);
  test('creates the teams and match as theirs, scorer = them, uploads the taps, saves the board, clears the guest game', async () => {
    const st = memStore(played());
    const sv = server();
    const id = await claimGuestMatch(st, sv.d, { home: 'AS', away: 'BI' }, uuid);
    assert.ok(id);
    assert.deepEqual(sv.log.map((l) => l.split(':')[0]), ['team', 'team', 'match', 'scorer', 'upload', 'upload', 'board']);
    assert.match(sv.log[2], /:me$/);
    assert.equal(st.cur, null);
  });
  test('a hand-ended game uploads its result', async () => {
    const st = memStore({ ...played(), result: { kind: 'time_up', winner: 'home', reason: 'Time up' } });
    const sv = server();
    await claimGuestMatch(st, sv.d, { home: 'AS', away: 'BI' }, uuid);
    assert.match(sv.log.at(-1)!, /^end:.*:time_up$/);
  });
  for (const at of ['team:Asha', 'team:Bina', 'match', 'scorer', 'upload', 'board']) {
    test(`the reply lost at ${at}: the retry finishes, nothing made twice`, async () => {
      const st = memStore(played());
      const sv = server(at);
      await assert.rejects(claimGuestMatch(st, sv.d, { home: 'AS', away: 'BI' }, uuid));
      assert.ok(st.cur, 'kept for the retry');
      const id = await claimGuestMatch(st, sv.d, { home: 'AS', away: 'BI' }, uuid);
      assert.ok(id);
      assert.equal([...sv.rows.values()].filter((v) => v.startsWith('team:')).length, 2, 'two teams, ever');
      assert.equal([...sv.rows.values()].filter((v) => v.startsWith('match:')).length, 1, 'one match, ever');
      assert.equal(st.cur, null);
    });
  }
  test('nothing to claim: null, and nothing created', async () => {
    const sv = server();
    assert.equal(await claimGuestMatch(memStore(null), sv.d, { home: 'A', away: 'B' }, uuid), null);
    assert.deepEqual(sv.log, []);
  });
});
