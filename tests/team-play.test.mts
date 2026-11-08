/** Teams for doubles, phase 1 (docs/security/breaks/team-play.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playingFor, standInId, standInName, isStandIn, pickerFor, remapEvents, remapStatLines, checkMapping } from '../src/core/teamPlay.ts';

const SQ = ['p1', 'p2', 'p3', 'p4'];

test('TP1: a squad of exactly the number needed plays automatically', () => {
  assert.deepEqual(playingFor({ teamId: 't1', squad: ['p1', 'p2'], needed: 2 }), { kind: 'auto', ids: ['p1', 'p2'] });
});

test('TP2: only a valid pick is used', () => {
  assert.deepEqual(playingFor({ teamId: 't1', squad: SQ, needed: 2, picked: ['p3', 'p1'] }), { kind: 'picked', ids: ['p3', 'p1'] });
  for (const bad of [['p1'], ['p1', 'p1'], ['p1', 'x9'], ['p1', 'p2', 'p3']]) {
    assert.equal(playingFor({ teamId: 't1', squad: SQ, needed: 2, picked: bad }).kind, 'standin', JSON.stringify(bad));
  }
});

test('TP3/TP4: nobody picked → stand-ins named after the team', () => {
  const r = playingFor({ teamId: 't1', squad: SQ, needed: 2 });
  assert.deepEqual(r, { kind: 'standin', ids: [standInId('t1', 1), standInId('t1', 2)] });
  assert.equal(standInName('Smashers', 2), 'Smashers Player 2');
  assert.equal(standInId('t1', 1), 'ph:t1:1');
  assert.ok(isStandIn('ph:t1:1') && !isStandIn('p1') && !isStandIn('3f2c-…'));
  assert.notEqual(standInId('t1', 1), standInId('t2', 1));
});

test('TP5: managers and the host pick; everyone else asks', () => {
  const leaders = { captainId: 'p1', adminIds: ['p2'] };
  assert.equal(pickerFor({ myPlayerId: 'p1', leaders }), 'pick');
  assert.equal(pickerFor({ myPlayerId: 'p2', leaders }), 'pick');
  assert.equal(pickerFor({ myPlayerId: 'zz', leaders, isHost: true }), 'pick');
  assert.equal(pickerFor({ myPlayerId: 'zz', leaders }), 'ask');
  assert.equal(pickerFor({ myPlayerId: null, leaders }), 'ask');
});

test('TP6/TP9: every occurrence of the stand-in id moves; nothing else changes', () => {
  const events = [
    { id: 1, kind: 'point', side: 'home', playerId: 'ph:t1:1', pd: { how: 'winner', by: 'ph:t1:2', err: { playerId: 'ph:t2:1' } } },
    { id: 2, kind: 'goal', side: 'home', secondId: 'ph:t1:2', note: 'ph:t1:1 is a word here too?' },
  ];
  const out = remapEvents(events, { 'ph:t1:1': 'p3', 'ph:t1:2': 'p1' }) as typeof events;
  assert.equal(out[0].playerId, 'p3');
  assert.equal(out[0].pd.by, 'p1');
  assert.equal(out[0].pd.err.playerId, 'ph:t2:1', 'the other team’s stand-in is untouched');
  assert.equal(out[1].secondId, 'p1');
  assert.equal(out[1].note, 'ph:t1:1 is a word here too?', 'only exact values are replaced');
  assert.equal(events[0].playerId, 'ph:t1:1', 'the input is not mutated');
  assert.deepEqual(out.map((e) => [e.id, e.kind, e.side]), events.map((e) => [e.id, e.kind, e.side]));
});

test('TP7: mappings are checked', () => {
  const ctx = { squad: SQ, alreadyPlaying: ['p4'] };
  assert.equal(checkMapping({ 'ph:t1:1': 'p1', 'ph:t1:2': 'p2' }, ctx), null);
  assert.match(checkMapping({ 'ph:t1:1': 'p1', 'ph:t1:2': 'p1' }, ctx)!, /same person/);
  assert.match(checkMapping({ 'ph:t1:1': 'x9' }, ctx)!, /not in the squad/);
  assert.match(checkMapping({ 'ph:t1:1': 'p4' }, ctx)!, /already playing/);
  assert.match(checkMapping({ p1: 'p2' }, ctx)!, /stand-in/);
});

test('TP8/TP10: a stand-in line merges into the real player’s line', () => {
  const lines = [
    { matchId: 'm', playerId: 'ph:t1:1', stats: { winners: 2, points: 5 } },
    { matchId: 'm', playerId: 'p3', stats: { winners: 1, aces: 1 } },
    { matchId: 'm', playerId: 'ph:t1:2', stats: { winners: 4 } },
  ];
  const out = remapStatLines(lines, { 'ph:t1:1': 'p3', 'ph:t1:2': 'p1' });
  assert.deepEqual(out.find((l) => l.playerId === 'p3')!.stats, { winners: 3, points: 5, aces: 1 });
  assert.deepEqual(out.find((l) => l.playerId === 'p1')!.stats, { winners: 4 });
  assert.ok(!out.some((l) => isStandIn(l.playerId)));
  assert.equal(out.length, 2);
});

test('600 users: mapping never changes the score; stand-ins vanish after full mapping', () => {
  let seed = 12;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const needed = 1 + Math.floor(rnd() * 3);
    const squad = Array.from({ length: needed + Math.floor(rnd() * 4) }, (_, i) => `p${u}_${i}`);
    const side = playingFor({ teamId: `t${u}`, squad, needed });
    const events = Array.from({ length: 30 }, (_, i) => ({ id: i, kind: 'point', side: rnd() < 0.5 ? 'home' : 'away', playerId: side.ids[Math.floor(rnd() * side.ids.length)] }));
    if (side.kind !== 'standin') { assert.equal(squad.length === needed, side.kind === 'auto'); continue; }
    const targets = [...squad].sort(() => rnd() - 0.5).slice(0, needed);
    const map = Object.fromEntries(side.ids.map((id, i) => [id, targets[i]]));
    assert.equal(checkMapping(map, { squad, alreadyPlaying: [] }), null);
    const out = remapEvents(events, map) as typeof events;
    assert.deepEqual(out.map((e) => e.side), events.map((e) => e.side), `${u}: score unchanged`);
    assert.ok(out.every((e) => !isStandIn(e.playerId)), `${u}: no stand-in left`);
  }
});
