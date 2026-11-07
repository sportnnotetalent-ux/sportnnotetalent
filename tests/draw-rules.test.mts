/** The organiser's plan for a knockout — odd-team rule, planned count, edited
 *  draw — one module shared by the map, the generator and "next round"
 *  (docs/security/breaks/fixture-map.md part 2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  oddRuleOf, plannedTeamsOf, drawOf, drawToFormat, firstRound, nextRoundByRule, applyDraw, rankLosers,
  ODD_RULE_KEY, PLANNED_KEY, DRAW_KEY, type OddRule,
} from '../src/data/drawRules.ts';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const flat = (o: { ties: { homeId: string; awayId: string }[]; byeIds: string[] }) => [...o.ties.flatMap((t) => [t.homeId, t.awayId]), ...o.byeIds];

test('reading the plan: defaults and junk', () => {
  assert.equal(oddRuleOf(undefined), 'playin');
  assert.equal(oddRuleOf({ [ODD_RULE_KEY]: 'bestLosers' }), 'bestLosers');
  assert.equal(oddRuleOf({ [ODD_RULE_KEY]: '<script>' }), 'playin');
  // FM22
  assert.equal(plannedTeamsOf({ [PLANNED_KEY]: 12 }), 12);
  for (const bad of [0, -5, 'abc', null, 1.5, NaN]) assert.equal(plannedTeamsOf({ [PLANNED_KEY]: bad }), undefined, String(bad));
  assert.equal(plannedTeamsOf({ [PLANNED_KEY]: 10000 }), 128);
});

test('FM24: a stored draw is parsed defensively', () => {
  const d = { order: ['t1', 't2', '@A#1', null] };
  assert.deepEqual(drawOf({ [DRAW_KEY]: drawToFormat(d) }), d);
  assert.equal(drawOf({ [DRAW_KEY]: '{not json' }), null);
  assert.equal(drawOf({ [DRAW_KEY]: JSON.stringify({ order: Array(300).fill('x') }) }), null, 'too long');
  assert.equal(drawOf({ [DRAW_KEY]: JSON.stringify({ order: ['<img src=x onerror=1>'] }) }), null, 'not an id or place code');
  assert.equal(drawOf({ [DRAW_KEY]: JSON.stringify({ order: [5] }) }), null);
  assert.equal(drawOf({ [DRAW_KEY]: JSON.stringify({ order: ['t1', 't1'] }) }), null, 'a team twice');
});

test('first round, every rule, fields 2–64: each team once, a clean count onward', () => {
  for (const rule of ['playin', 'byes', 'bestLosers'] as OddRule[]) {
    for (let n = 2; n <= 64; n++) {
      const o = firstRound(ids(n), rule);
      const all = flat(o);
      assert.equal(all.length, n, `${rule} ${n}`);
      assert.equal(new Set(all).size, n);
    }
  }
});

test('the rules differ the way the organiser expects (6 teams)', () => {
  const p = firstRound(ids(6), 'playin');
  assert.equal(p.ties.length, 2, 'play-in: 4 play, the top 2 skip');
  assert.deepEqual(p.byeIds, ['t1', 't2']);
  const b = firstRound(ids(6), 'byes');
  assert.equal(b.ties.length, 3, 'byes: everyone plays');
  assert.deepEqual(b.byeIds, []);
  const o = firstRound(ids(7), 'byes');
  assert.deepEqual(o.byeIds, ['t1'], 'odd: the top seed byes');
  assert.ok(!o.ties.some((t) => t.homeId === 't1' || t.awayId === 't1'));
});

test('next round: byes rule gives an odd round\'s top team a bye', () => {
  const r = nextRoundByRule({ winners: ['a', 'b', 'c'], byes: [], losers: ['x', 'y', 'z'] }, 'byes');
  assert.deepEqual(r.byes, ['a']);
  assert.deepEqual(r.pairs, [['b', 'c']]);
});

test('next round: best losers fill the round up to a clean size (FM20, FM21)', () => {
  const r = nextRoundByRule({ winners: ['a', 'b', 'c'], byes: [], losers: ['x', 'y', 'z'] }, 'bestLosers');
  const all = [...r.pairs.flat(), ...r.byes];
  assert.equal(all.length, 4);
  assert.ok(all.includes('x') && !all.includes('y'), 'only the best loser');
  for (const [h, a] of r.pairs) assert.ok(!(['x', 'y', 'z'].includes(h) && ['x', 'y', 'z'].includes(a)), 'a lucky loser meets a winner');
  const short = nextRoundByRule({ winners: ['a', 'b', 'c'], byes: [], losers: [] }, 'bestLosers');
  assert.deepEqual(short.byes, ['a'], 'no losers to take: a bye instead');
});

test('next round: play-in byes join the winners (the app\'s existing rule)', () => {
  const r = nextRoundByRule({ winners: ['w1', 'w2'], byes: ['a', 'b'], losers: [] }, 'playin');
  const all = r.pairs.flat();
  assert.equal(all.length, 4);
  assert.notDeepEqual(r.pairs.find((p) => p.includes('a')), ['a', 'b'], 'top seeds kept apart');
});

test('FM20: losers rank by closest margin, then most scored, then name — the same every time', () => {
  const ranked = rankLosers([
    { id: 'far', margin: -5, scored: 0, name: 'Far' },
    { id: 'close', margin: -1, scored: 0, name: 'Close' },
    { id: 'closeMore', margin: -1, scored: 3, name: 'Close More' },
    { id: 'wo', margin: -1, scored: 9, name: 'Walkover', walkover: true },
    { id: 'tieB', margin: -2, scored: 1, name: 'B' },
    { id: 'tieA', margin: -2, scored: 1, name: 'A' },
  ]);
  assert.deepEqual(ranked, ['closeMore', 'close', 'tieA', 'tieB', 'far']);
});

test('FM25 / FM30: an edited draw applies only to the exact same field', () => {
  const o = firstRound(['a', 'b', 'c', 'd'], 'playin');
  const d = { order: ['a', 'c', 'b', 'd'] };
  const ok = applyDraw(o, d);
  assert.ok(ok);
  assert.deepEqual(ok!.ties.map((t) => [t.homeId, t.awayId]), [['a', 'c'], ['b', 'd']]);
  assert.deepEqual(ok!.ties.map((t) => t.slot), [0, 1]);
  assert.equal(applyDraw(o, { order: ['a', 'c', 'b', 'e'] }), null, 'a different team: stale');
  assert.equal(applyDraw(o, { order: ['a', 'c', 'b'] }), null, 'a team missing: stale');
  // a bye position: null partner
  const six = firstRound(['a', 'b', 'c', 'd', 'e', 'f'], 'playin');
  const withByes = applyDraw(six, { order: ['a', null, 'c', 'd', 'b', null, 'e', 'f'] });
  assert.ok(withByes);
  assert.deepEqual(withByes!.byeIds.sort(), ['a', 'b']);
  assert.deepEqual(withByes!.ties.map((t) => [t.homeId, t.awayId]), [['c', 'd'], ['e', 'f']]);
  // FM30: place codes resolve when the knockout is made
  const places = firstRound(['@A#1', '@B#2', '@B#1', '@A#2'], 'playin');
  const resolved = applyDraw(places, { order: ['@A#1', '@A#2', '@B#1', '@B#2'] }, (ref) => ({ '@A#1': 'lions', '@A#2': 'tigers', '@B#1': 'bears', '@B#2': 'wolves' } as Record<string, string>)[ref]);
  assert.deepEqual(resolved!.ties.map((t) => [t.homeId, t.awayId]), [['lions', 'tigers'], ['bears', 'wolves']]);
});

import { nextRealRound } from '../src/data/drawRules.ts';
import { knockoutStageRounds, nextRoundPairs } from '../src/data/bracket.ts';
import type { Match } from '../src/core/types.ts';

let mn = 0;
const m = (h: string, a: string, o: Partial<Match> = {}): Match => ({
  id: `x${++mn}`, sport: 'football', status: 'completed', startsAt: new Date(1.8e12 + mn * 3.6e6).toISOString(),
  homeTeam: { id: h, name: h }, awayTeam: { id: a, name: a }, ...o,
} as unknown as Match);

test('FM19: the real next round — play-in matches the existing next round exactly when even', () => {
  const qf = knockoutStageRounds([
    m('a', 'b', { stage: 'qf', winner: 'home' }), m('c', 'd', { stage: 'qf', winner: 'away' }),
    m('e', 'f', { stage: 'qf', winner: 'home' }), m('g', 'h', { stage: 'qf', winner: 'home' }),
  ])[0];
  assert.deepEqual(nextRealRound(qf, 'playin'), nextRoundPairs(qf));
});

test('FM19: an odd real round records its bye (byes rule) or takes the best loser (best losers)', () => {
  const r = knockoutStageRounds([
    m('a', 'b', { stage: 'qf', winner: 'home', score: { home: 4, away: 0 } }),
    m('c', 'd', { stage: 'qf', winner: 'home', score: { home: 2, away: 1 } }),
    m('e', 'f', { stage: 'qf', winner: 'home', score: { home: 3, away: 0 } }),
  ])[0];
  const b = nextRealRound(r, 'byes')!;
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].byes, ['a']);
  assert.equal(b[0].stage, 'sf');
  const l = nextRealRound(r, 'bestLosers')!;
  assert.equal(l.length, 2);
  assert.ok(l.flatMap((p) => [p.homeId, p.awayId]).includes('d'), 'd lost by one');
  assert.ok(!l.some((p) => p.byes));
  const wo = knockoutStageRounds([
    m('a', 'b', { stage: 'qf', winner: 'home', score: { home: 1, away: 0 }, walkover: true }),
    m('c', 'd', { stage: 'qf', winner: 'home', score: { home: 5, away: 0 } }),
    m('e', 'f', { stage: 'qf', winner: 'home', score: { home: 5, away: 0 } }),
  ])[0];
  assert.ok(!nextRealRound(wo, 'bestLosers')!.flatMap((p) => [p.homeId, p.awayId]).includes('b'), 'a walkover loser is never a best loser');
  assert.equal(nextRealRound(knockoutStageRounds([m('a', 'b', { stage: 'final', winner: 'home' })])[0], 'byes'), null, 'nothing after the final');
});

import { groupsKnockoutOpening } from '../src/data/drawRules.ts';
import { seedFromGroups, type Qualifier } from '../src/data/groups.ts';
import { readFileSync } from 'node:fs';

const qual = (groups: string[], top: number): Qualifier[] => {
  const q: Qualifier[] = [];
  for (let r = 1; r <= top; r++) for (const g of groups) q.push({ teamId: `${g}${r}team`, name: `${g}${r}`, group: g, rank: r, via: 'direct' });
  return q;
};

test('FM30: groups → knockout — unchanged without a plan, follows the edited draw with one', () => {
  const q = qual(['A', 'B', 'C', 'D'], 2);
  const auto = groupsKnockoutOpening(q, 'playin', null);
  const old = seedFromGroups(q);
  assert.deepEqual(auto.ties.map((t) => [t.homeId, t.awayId]), old.ties.map((t) => [t.homeId, t.awayId]));
  const edited = groupsKnockoutOpening(q, 'playin', { order: ['@A#1', '@C#2', '@B#1', '@D#2', '@C#1', '@A#2', '@D#1', '@B#2'] });
  assert.deepEqual(edited.ties.map((t) => [t.homeId, t.awayId]), [['A1team', 'C2team'], ['B1team', 'D2team'], ['C1team', 'A2team'], ['D1team', 'B2team']]);
  const stale = groupsKnockoutOpening(q, 'playin', { order: ['@A#1', '@C#2'] });
  assert.deepEqual(stale.ties, auto.ties, 'a draw for another field is ignored');
  const three = groupsKnockoutOpening(qual(['A', 'B', 'C'], 2), 'byes', null);
  assert.equal(three.ties.length, 3, '6 qualifiers, everyone plays');
  assert.ok(three.ties.every((t) => !t.homeId.startsWith('@') && !t.awayId.startsWith('@')), 'codes resolved');
});

test('FM19: the generator and the bracket use the shared rules', () => {
  const gen = readFileSync(new URL('../src/screens/GenerateFixturesScreen.tsx', import.meta.url), 'utf8');
  assert.match(gen, /groupsKnockoutOpening\(/);
  assert.match(gen, /applyDraw\(auto, drawOf\(fmt\)\)/);
  assert.match(gen, /firstRound\(seeds, oddRuleOf\(fmt\)\)/);
  const br = readFileSync(new URL('../src/screens/BracketScreen.tsx', import.meta.url), 'utf8');
  assert.match(br, /nextRealRound\(lastRound, oddRule/);
  assert.match(br, /byes: pairs\[i\]\.byes/);
});
