/** Fill a slot with a team you already have (docs/security/breaks/slot-fill-existing.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotCandidates } from '../src/core/slots.ts';

const T = (id: string, name: string, adhoc = false) => ({ id, name, adhoc });
const teams = [T('g', 'Demo Greens', true), T('o', 'Demo Golds', true), T('p', 'Demo Panthers', true), T('a', 'Team A', true), T('s1', 'Team 1'), T('l', 'Lions')];

test('a named team made from a friendly is found (was hidden as ad-hoc)', () => {
  assert.deepEqual(slotCandidates(teams, 'demo', { slotIds: new Set(['s1']), inFixtures: new Set() }).map((t) => t.id), ['g', 'o', 'p']);
});

test('SL4: untouched quick sides stay hidden; slots never offered', () => {
  assert.deepEqual(slotCandidates(teams, 'team', { slotIds: new Set(['s1']), inFixtures: new Set() }), []);
});

test('a team already entered but with no game yet is offered; SL1: one with a game is not', () => {
  assert.deepEqual(slotCandidates(teams, 'demo g', { slotIds: new Set(['s1']), inFixtures: new Set(['o']) }).map((t) => t.id), ['g']);
});

test('needs 2+ letters; at most 12', () => {
  assert.deepEqual(slotCandidates(teams, 'd', { slotIds: new Set(), inFixtures: new Set() }), []);
  const many = Array.from({ length: 30 }, (_, i) => T(`x${i}`, `Club ${i}`));
  assert.equal(slotCandidates(many, 'club', { slotIds: new Set(), inFixtures: new Set() }).length, 12);
});

test('600 random searches never offer a slot, a quick side or a team with a game', () => {
  let seed = 1306;
  const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
  const names = ['Team A', 'Team B', 'Player A', 'Lions', 'Demo Greens', 'Falcons', 'Team 1', 'Pair B'];
  for (let i = 0; i < 600; i++) {
    const list = Array.from({ length: 1 + rnd(12) }, (_, j) => T(`t${j}`, names[rnd(names.length)], rnd(2) === 0));
    const slotIds = new Set(list.filter(() => rnd(4) === 0).map((t) => t.id));
    const inFixtures = new Set(list.filter(() => rnd(4) === 0).map((t) => t.id));
    for (const t of slotCandidates(list, ['te', 'li', 'de', 'pl', 'fa'][rnd(5)], { slotIds, inFixtures })) {
      assert.ok(!slotIds.has(t.id) && !inFixtures.has(t.id));
      assert.ok(!(t.adhoc && /^(Team|Player|Pair) [AB]$/.test(t.name)));
    }
  }
});
