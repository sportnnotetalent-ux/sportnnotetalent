/** Teams for doubles, phase 4 (docs/security/breaks/team-who-played.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { standInAmendOps, sidePlayers, isStandIn } from '../src/core/teamPlay.ts';
import { effectiveLog } from '../src/sports/amend.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ev = (seq: number, type: string, side: string | null, payload: unknown, attribution: unknown = null) => ({ id: `e${seq}`, matchId: 'm', seq, type, side, payload, attribution, createdAt: '' });

test('WH1/WH2/WH4: only plays naming a stand-in are replaced, credits at any depth', () => {
  const log = [
    ev(1, 'POINT', 'home', { playerId: 'ph:t:1', pd: { how: 'winner', by: 'ph:t:2' } }),
    ev(2, 'POINT', 'away', { playerId: 'a1' }),
    ev(3, 'POINT', 'home', { _attr2: { playerId: 'ph:t:2', stat: 'assists' } }, { playerId: 'ph:t:1', stat: 'points' }),
  ];
  const ops = standInAmendOps(log as never, { 'ph:t:1': 'p1', 'ph:t:2': 'p2' });
  assert.deepEqual(ops.map((o) => o.seq), [1, 3]);
  const one = ops[0] as { action: { type: string; side: string; payload: { playerId: string; pd: { by: string } } } };
  assert.equal(one.action.type, 'POINT');
  assert.equal(one.action.side, 'home');
  assert.equal(one.action.payload.playerId, 'p1');
  assert.equal(one.action.payload.pd.by, 'p2');
  const three = ops[1] as { action: { payload: { _attr2: { playerId: string } }; attribution: { playerId: string } } };
  assert.equal(three.action.payload._attr2.playerId, 'p2');
  assert.equal(three.action.attribution.playerId, 'p1');
});

test('WH3: built from the effective log (earlier corrections applied)', () => {
  const raw = [
    ev(1, 'POINT', 'home', { playerId: 'ph:t:1' }),
    ev(2, 'AMEND', null, { ops: [{ op: 'replace', seq: 1, action: { type: 'POINT', side: 'away', payload: { playerId: 'ph:t:1' } } }], lines: [], byName: 'x', deltas: [] }),
  ];
  const ops = standInAmendOps(effectiveLog(raw as never) as never, { 'ph:t:1': 'p1' });
  assert.equal(ops.length, 1);
  assert.equal((ops[0] as { action: { side: string } }).action.side, 'away', 'keeps the earlier correction');
});

test('WH6: after mapping, the side plays as the real players', () => {
  const squad = [{ id: 'p1', fullName: 'Kabir' }, { id: 'p2', fullName: 'Rohan' }, { id: 'p3', fullName: 'Aarav' }];
  const after = sidePlayers({ teamId: 't', teamName: 'Smashers', squad, needed: 2, picked: ['p1', 'p2'] });
  assert.equal(after.kind, 'picked');
  assert.ok(after.players.every((p) => !isStandIn(p.id)));
});

test('WH5/WH8/WH9: the screen checks the mapping, gates by amend rights and uses one AMEND', () => {
  const s = read('src/screens/LiveScoringScreen.tsx');
  assert.match(s, /standInAmendOps\(/);
  assert.match(s, /checkMapping\(/);
  assert.match(s, /<WhoPlayedCard /);
  assert.match(s, /amend\(ops( as AmendOp\[\])?, \[/);
  const card = read('src/components/WhoPlayedCard.tsx');
  assert.match(card, /Who played\?/);
});

test('600 matches: mapping never changes score, side or order; no stand-in survives', () => {
  let seed = 41;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const ids = ['ph:t:1', 'ph:t:2', 'a1', 'a2'];
    const log = Array.from({ length: 20 + Math.floor(rnd() * 40) }, (_, i) => ev(i + 1, 'POINT', rnd() < 0.5 ? 'home' : 'away', { playerId: ids[Math.floor(rnd() * 4)], pd: rnd() < 0.3 ? { how: 'winner', by: ids[Math.floor(rnd() * 2)] } : undefined }));
    const map = { 'ph:t:1': `p${u}a`, 'ph:t:2': `p${u}b` };
    const ops = standInAmendOps(log as never, map);
    const amended = effectiveLog([...log, ev(log.length + 1, 'AMEND', null, { ops, lines: [], byName: 'x', deltas: [] })] as never);
    assert.deepEqual(amended.map((e) => [e.seq, e.type, e.side]), log.map((e) => [e.seq, e.type, e.side]), `${u}: score / order unchanged`);
    assert.ok(!JSON.stringify(amended).includes('ph:t:'), `${u}: no stand-in left`);
  }
});
