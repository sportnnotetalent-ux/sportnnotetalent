/** The fixture map — a sport's whole format from day one, slots filled on it
 *  (docs/security/breaks/fixture-map.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFixtureMap, groupLabel, fixtureMapSheet, treeLayout, freeBoxes, type FixtureMap, type MapSide, type MapInput } from '../src/core/fixtureMap.ts';
import type { StructureConfig } from '../src/data/structureConfig.ts';
import type { Match } from '../src/core/types.ts';
import { nextRoundByRule } from '../src/data/drawRules.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const cfg = (o: Partial<StructureConfig>): StructureConfig => ({
  shape: 'knockout', groupCount: 2, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false,
  manualStandings: false, swissRounds: 5, ...o,
});
const team = (id: string) => ({ id, name: id.toUpperCase() });
let n = 0;
function match(h: string, a: string, o: Partial<Match> = {}): Match {
  n++;
  return {
    id: `m${n}`, sport: 'football', status: 'scheduled', startsAt: new Date(1.8e12 + n * 3.6e6).toISOString(),
    homeTeam: { id: h, name: h.toUpperCase() }, awayTeam: { id: a, name: a.toUpperCase() }, ...o,
  } as unknown as Match;
}
const input = (o: Partial<MapInput>): MapInput => ({ cfg: null, matches: [], entries: [], slotIds: new Set(), ...o });
const label = (s: MapSide): string => (s.kind === 'team' ? s.name : s.kind === 'from' || s.kind === 'open' ? s.label : 'bye');
const ties = (m: FixtureMap, i: number) => m.rounds[i].ties.map((t) => `${label(t.home)} v ${label(t.away)}`);

test('FM1: 2 groups, top 2 → crossed semi-finals, then the final, before any team is known', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2 }), entries: ['A1', 'A2', 'B1', 'B2'].map((x) => ({ id: x, name: x })), slotIds: new Set(['A1', 'A2', 'B1', 'B2']) }));
  assert.equal(m.kind, 'groups');
  assert.deepEqual(m.groups.map((g) => g.label), ['Group A', 'Group B']);
  assert.deepEqual(m.groups[0].teams.map(label), ['A1', 'A2'], 'slots named A1… sit in their group');
  assert.equal(m.rounds[0].label, 'Semi-finals');
  assert.deepEqual(ties(m, 0), ['Group A winner v Group B runner-up', 'Group B winner v Group A runner-up']);
  assert.deepEqual(ties(m, 1), ['Winner of Semi-final 1 v Winner of Semi-final 2']);
  assert.equal(m.rounds[1].ties[0].label, 'Final');
  assert.ok(m.rounds.every((r) => r.projected));
  assert.equal(m.openSlots, 4);
});

test('FM1: 4 groups, top 2 → the FIFA/EURO cross-over quarter-finals the app makes', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 4 }) , entries: [team('x'), team('y')] }));
  assert.deepEqual(ties(m, 0), [
    'Group A winner v Group B runner-up', 'Group C winner v Group D runner-up',
    'Group B winner v Group A runner-up', 'Group D winner v Group C runner-up',
  ]);
  assert.deepEqual(m.rounds.map((r) => r.label), ['Quarter-finals', 'Semi-finals', 'Final']);
});

test('FM1: 3 groups top 2 + 2 best thirds → 8 seeded, no group meets itself, every qualifier once', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 3, advanceTopN: 2, advanceBest: 2 }), entries: [team('x'), team('y')] }));
  const sides = m.rounds[0].ties.flatMap((t) => [label(t.home), label(t.away)]);
  assert.equal(sides.length, 8);
  assert.equal(new Set(sides).size, 8);
  for (const t of m.rounds[0].ties) {
    const g = (s: MapSide) => /^Group (\w)/.exec(label(s))?.[1];
    if (g(t.home) && g(t.away)) assert.notEqual(g(t.home), g(t.away), `${label(t.home)} v ${label(t.away)}`);
  }
  assert.ok(sides.filter((s) => /best 3rd/i.test(s)).length === 2);
});

test('FM5: every straight-knockout field 2–64 — each entrant once (tie or bye), halving to one final', () => {
  for (let f = 2; f <= 64; f++) {
    const entries = Array.from({ length: f }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));
    const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries }));
    const r0 = m.rounds[0];
    const named = [...r0.ties.flatMap((t) => [t.home, t.away]), ...r0.byes].filter((s) => s.kind === 'team').map(label);
    assert.equal(named.length, f, `field ${f}`);
    assert.equal(new Set(named).size, f, `field ${f}: no one twice`);
    const last = m.rounds[m.rounds.length - 1];
    assert.equal(last.ties.length, 1, `field ${f} ends in one final`);
    assert.equal(last.ties[0].label, 'Final');
    for (const r of m.rounds.slice(1)) for (const t of r.ties) assert.notEqual(t.home.kind, 'bye');
  }
});

test('FM6: formats with their own view are never drawn as a straight knockout', () => {
  const e = [team('a'), team('b'), team('c'), team('d')];
  for (const c of [cfg({ shape: 'swiss' }), cfg({ shape: 'americano' }), cfg({ manualStandings: true }), cfg({ shape: 'knockout', bracket: 'double' })]) {
    const m = buildFixtureMap(input({ cfg: c, entries: e }));
    assert.equal(m.kind, 'other', JSON.stringify(c));
    assert.equal(m.rounds.length, 0);
    assert.ok(m.otherFormat);
  }
  const dc = buildFixtureMap(input({ cfg: cfg({ shape: 'league' }), entries: e, matches: [match('a', 'b', { stage: 'q1' })] }));
  assert.equal(dc.kind, 'other', 'IPL double-chance playoff');
});

test('FM10: a team with group games but no entry still sits in its group', () => {
  const m = buildFixtureMap(input({
    cfg: cfg({ shape: 'groups', groupCount: 2 }), entries: [team('a')],
    matches: [match('a', 'b', { group: 'A', stage: 'group' }), match('c', 'd', { group: 'B', stage: 'group' })],
  }));
  assert.deepEqual(m.groups.map((g) => g.teams.map(label)), [['A', 'B'], ['C', 'D']]);
  assert.equal(m.unplaced.length, 0);
});

test('FM10: before the groups are drawn, real teams wait in "not in a group yet"', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2 }), entries: [team('a'), { id: 's1', name: 'B1' }], slotIds: new Set(['s1']) }));
  assert.deepEqual(m.groups.map((g) => g.teams.map(label)), [[], ['B1']]);
  assert.deepEqual(m.unplaced.map(label), ['A']);
});

test('FM11: a Super round is shown, and no knockout is invented past it', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2, superPhase: true }), entries: [team('a'), team('b')] }));
  assert.equal(m.rounds.length, 0);
  assert.match(m.note ?? '', /Super round/);
});

test('FM12: a half-played round — winners move on by name, the rest say whose winner', () => {
  const qf = [
    match('a', 'b', { stage: 'qf', status: 'completed', winner: 'home', score: { home: 2, away: 0 } }),
    match('c', 'd', { stage: 'qf', status: 'live', score: { home: 1, away: 1 } }),
    match('e', 'f', { stage: 'qf', status: 'completed', winner: 'away', score: { home: 0, away: 3 } }),
    match('g', 'h', { stage: 'qf' }),
  ];
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), matches: qf, entries: 'abcdefgh'.split('').map(team) }));
  assert.equal(m.rounds[0].projected, false);
  assert.deepEqual(m.rounds[0].ties.map((t) => t.state), ['done', 'live', 'done', 'scheduled']);
  assert.equal(m.rounds[0].ties[0].winner, 'home');
  assert.deepEqual(ties(m, 1), ['A v Winner of Quarter-final 2', 'F v Winner of Quarter-final 4']);
  assert.ok(m.rounds[1].projected);
  assert.deepEqual(ties(m, 2), ['Winner of Semi-final 1 v Winner of Semi-final 2']);
  assert.equal(m.champion, undefined);
});

test('FM12: a decided final crowns the champion; a third-place match shows', () => {
  const ms = [
    match('a', 'b', { stage: 'sf', status: 'completed', winner: 'home' }),
    match('c', 'd', { stage: 'sf', status: 'completed', winner: 'home' }),
    match('a', 'c', { stage: 'final', status: 'completed', winner: 'away', score: { home: 1, away: 2 } }),
    match('b', 'd', { stage: 'third', status: 'completed', winner: 'away' }),
  ];
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), matches: ms, entries: 'abcd'.split('').map(team) }));
  assert.deepEqual(m.rounds.map((r) => r.label), ['Semi-finals', 'Final']);
  assert.equal(m.champion && label(m.champion), 'C');
  assert.equal(m.third && `${label(m.third.home)} v ${label(m.third.away)}`, 'B v D');
  assert.equal(m.third?.winner, 'away');
});

test('FM12: play-in byes carry on by name into the next round', () => {
  const ms = [match('e', 'h', { stage: 'qf', byes: ['a', 'b', 'c', 'd'] }), match('f', 'g', { stage: 'qf', byes: ['a', 'b', 'c', 'd'] })];
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), matches: ms, entries: 'abcdefgh'.split('').map(team) }));
  const next = m.rounds[1].ties.flatMap((t) => [label(t.home), label(t.away)]);
  for (const x of ['A', 'B', 'C', 'D']) assert.ok(next.includes(x), `${x} byes on`);
  assert.equal(next.filter((x) => x.startsWith('Winner of')).length, 2);
});

test('FM4: tree layout — later boxes sit midway between the two they come from', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: Array.from({ length: 8 }, (_, i) => team(`t${i}`)) }));
  const l = treeLayout(m.rounds, 100, 20);
  assert.deepEqual(l.tops[0], [0, 120, 240, 360]);
  assert.deepEqual(l.tops[1], [60, 300]);
  assert.deepEqual(l.tops[2], [180]);
  assert.deepEqual(l.joined, [true, true]);
  assert.equal(l.height, 460);
  const odd = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: Array.from({ length: 6 }, (_, i) => team(`t${i}`)) }));
  const lo = treeLayout(odd.rounds, 100, 20);
  assert.equal(lo.joined[0], false, 'byes: no joining lines');
  for (const col of lo.tops) for (const y of col) assert.ok(y >= 0 && y + 100 <= Math.max(lo.height, 100));
  // a play-in round smaller than the next: no box overlaps another
  const ten = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: Array.from({ length: 10 }, (_, i) => team(`t${i}`)) }));
  const lt = treeLayout(ten.rounds, 100, 20);
  for (const col of lt.tops) for (let k = 1; k < col.length; k++) assert.ok(col[k] - col[k - 1] >= 100, `boxes overlap: ${col.join(', ')}`);
});

test('FM10: a knockout whose teams are only in its fixtures still draws them', () => {
  const m = buildFixtureMap(input({ cfg: null, structure: 'knockout', entries: [], matches: [match('a', 'b'), match('c', 'd')] }));
  assert.equal(m.kind, 'knockout');
  const names = m.rounds[0].ties.flatMap((t) => [label(t.home), label(t.away)]);
  assert.deepEqual([...names].sort(), ['A', 'B', 'C', 'D']);
});

test('FM10: in a groups tournament, teams only in ungrouped fixtures wait in "not in a group yet"', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2 }), entries: [], matches: [match('a', 'b'), match('c', 'd', { stage: 'qf' })] }));
  assert.deepEqual(m.unplaced.map(label), ['A', 'B'], 'knockout teams are not "unplaced"');
});

test('FM13: group labels', () => {
  assert.equal(groupLabel('A'), 'Group A');
  assert.equal(groupLabel('B2'), 'Group B2');
  assert.equal(groupLabel('Pool Red'), 'Pool Red');
  assert.equal(groupLabel('Group C'), 'Group C');
});

test('FM15: only real slots are fillable — a real team is never offered as one', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: [team('a'), { id: 's', name: 'Team 2' }], slotIds: new Set(['s']) }));
  const sides = m.rounds[0].ties.flatMap((t) => [t.home, t.away]).filter((s) => s.kind === 'team');
  assert.deepEqual(sides.map((s) => s.kind === 'team' && s.slot), [false, true]);
  assert.equal(m.openSlots, 1);
});

test('FM16: nothing yet → an empty map, not a crash', () => {
  assert.equal(buildFixtureMap(input({})).kind, 'empty');
  assert.equal(buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: [team('a')] })).rounds.length, 0, 'one team: no tree yet');
});

test('league: one table of everyone, no knockout', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'league' }), entries: [team('a'), team('b'), team('c')] }));
  assert.equal(m.kind, 'league');
  assert.deepEqual(m.groups.map((g) => g.teams.length), [3]);
  assert.equal(m.rounds.length, 0);
});

test('FM7 / FM14: the PDF escapes names and carries no contact details', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries: [{ id: 'x', name: '<script>alert(1)</script>' }, team('b')] }));
  const html = fixtureMapSheet(m, { name: 'Cup <b>2026</b>', sport: 'Football' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<b>2026/);
  assert.doesNotMatch(html, /tel:|mailto:/);
  assert.match(html, /Final/);
});

test('FM2 / FM8 / FM9: the screen fills only for organisers, scopes the division, refetches after a fill', () => {
  const s = read('src/screens/FixtureMapScreen.tsx');
  assert.match(s, /canManageTournament\(/);
  assert.match(s, /canManage && filling/);
  assert.match(s, /matchesInDivision\(/);
  assert.match(s, /onFilled=\{[^}]*setNonce/);
  assert.match(s, /getTournamentSlotIds\(/);
  assert.match(s, /buildFixtureMap\(/);
});

test('one fill panel: Participating teams and the map share SlotFillPanel', () => {
  assert.match(read('src/screens/TournamentTeamsScreen.tsx'), /<SlotFillPanel/);
  assert.match(read('src/screens/FixtureMapScreen.tsx'), /<SlotFillPanel/);
  const p = read('src/components/SlotFillPanel.tsx');
  assert.match(p, /slotCandidates\(/);
  assert.match(p, /newTeamProblem\(/, 'captain details stay compulsory');
});

test('the map is reachable: a route, the tournament page and the bracket link to it', () => {
  assert.match(read('src/navigation/types.ts'), /FixtureMap: \{ tournamentId: string; sport\?: SportId \}/);
  assert.match(read('src/screens/TournamentProfileScreen.tsx'), /navigate\('FixtureMap'/);
  assert.match(read('src/screens/BracketScreen.tsx'), /navigate\('FixtureMap'/);
});

// ---------- Part 2: the organiser's plan ----------

test('FM22/FM23: a planned 12 with 8 entered — 4 open places, drawn for 12', () => {
  const entries = Array.from({ length: 8 }, (_, i) => team(`t${i}`));
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, plannedTeams: 12 }));
  assert.equal(m.planned, 12);
  const r0 = m.rounds[0];
  const all = [...r0.ties.flatMap((t) => [t.home, t.away]), ...r0.byes];
  assert.equal(all.length, 12);
  assert.equal(all.filter((x) => x.kind === 'open').length, 4);
  assert.ok(all.every((x) => x.kind !== 'open' || !('id' in x)), 'an open place is never a team');
  assert.equal(r0.ties.length, 4, '12 → 4 play-in ties, 4 byes');
  // a planned count below the field changes nothing
  assert.equal(buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, plannedTeams: 4 })).rounds[0].ties.length, 4);
});

test('FM22/FM23: groups — open places go to the smallest groups, named A3, B3 …', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2 }), plannedTeams: 6,
    entries: ['A1', 'A2', 'B1'].map((x) => ({ id: x, name: x })), slotIds: new Set(['A1', 'A2', 'B1']) }));
  assert.deepEqual(m.groups.map((g) => g.teams.map(label)), [['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']]);
  const open = m.groups[1].teams.find((x) => x.kind === 'open');
  assert.equal(open && open.kind === 'open' && open.group, 'B');
});

test('FM19: the map draws each odd-team rule the way the app will (6 teams)', () => {
  const entries = Array.from({ length: 6 }, (_, i) => team(`t${i}`));
  const p = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, oddRule: 'playin' }));
  assert.equal(p.rounds[0].ties.length, 2);
  assert.equal(p.rounds[0].byes.length, 2);
  const b = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, oddRule: 'byes' }));
  assert.equal(b.rounds[0].ties.length, 3);
  assert.equal(b.rounds[1].byes.length, 1, '3 winners: the top one goes straight through');
  const l = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, oddRule: 'bestLosers' }));
  assert.equal(l.rounds[0].ties.length, 3);
  const sf = l.rounds[1].ties.flatMap((t) => [label(t.home), label(t.away)]);
  assert.ok(sf.includes('Best loser 1'), sf.join(', '));
  assert.equal(l.rounds[1].ties.length, 2);
  // the map's next round = the rules module's, for the same winners
  const nx = nextRoundByRule({ winners: ['W1', 'W2', 'W3'], byes: [], losers: ['L1', 'L2', 'L3'] }, 'bestLosers');
  assert.equal(nx.pairs.length, l.rounds[1].ties.length);
});

test('FM20: best losers are named by margin once the round is decided', () => {
  const entries = 'abcdef'.split('').map(team);
  const ms = [
    match('a', 'f', { stage: 'qf', status: 'completed', winner: 'home', score: { home: 5, away: 0 } }),
    match('b', 'e', { stage: 'qf', status: 'completed', winner: 'home', score: { home: 2, away: 1 } }),
    match('c', 'd', { stage: 'qf', status: 'completed', winner: 'home', score: { home: 3, away: 0 } }),
  ];
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, matches: ms, oddRule: 'bestLosers' }));
  const sf = m.rounds[1].ties.flatMap((t) => [label(t.home), label(t.away)]);
  assert.ok(sf.includes('E'), 'E lost by one: the best loser');
  assert.ok(!sf.includes('F') && !sf.includes('D'));
});

test('FM25: an edited draw shows; a stale one falls back and says so', () => {
  const entries = 'abcd'.split('').map(team);
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, draw: { order: ['a', 'b', 'c', 'd'] } }));
  assert.deepEqual(ties(m, 0), ['A v B', 'C v D']);
  assert.deepEqual(m.rounds[0].refs, ['a', 'b', 'c', 'd']);
  assert.ok(!m.drawStale);
  const stale = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, draw: { order: ['a', 'b', 'c', 'x'] } }));
  assert.ok(stale.drawStale);
  assert.equal(stale.rounds[0].ties.length, 2, 'the automatic draw still shows');
});

test('FM25 / FM30: groups draw edited by place codes', () => {
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'groups', groupCount: 2 }), entries: [team('x'), team('y')], draw: { order: ['@A#1', '@A#2', '@B#1', '@B#2'] } }));
  assert.deepEqual(ties(m, 0), ['Group A winner v Group A runner-up', 'Group B winner v Group B runner-up']);
});

test('FM27/FM28: a custom match fills its box; free boxes are the rest', () => {
  const entries = 'abcdefgh'.split('').map(team);
  const sf2 = match('c', 'g', { stage: 'sf', format: { __koSlot: 1 } } as Partial<Match>);
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, matches: [sf2] }));
  const sf = m.rounds.find((r) => r.stage === 'sf')!;
  assert.equal(sf.ties[1].matchId, sf2.id, 'box 2');
  assert.equal(label(sf.ties[0].home), 'Winner of Quarter-final 1', 'box 1 still projected');
  const free = freeBoxes(m);
  assert.ok(free.some((f) => f.stage === 'sf' && f.box === 0));
  assert.ok(!free.some((f) => f.stage === 'sf' && f.box === 1), 'a taken box is not offered');
  assert.ok(free.some((f) => f.stage === 'final'));
});

test('FM27: part of the opening round made by hand — the rest re-drawn, no team twice or lost', () => {
  const entries = 'abcdefgh'.split('').map(team);
  const one = match('a', 'h', { stage: 'qf', format: { __koSlot: 2 } } as Partial<Match>);
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, matches: [one] }));
  const r0 = m.rounds[0];
  assert.equal(r0.ties[2].matchId, one.id);
  const names = [...r0.ties.flatMap((t) => [t.home, t.away]), ...r0.byes].map(label);
  assert.equal(names.length, 8);
  assert.equal(new Set(names).size, 8);
});

test('FM29: a custom round the plan doesn\'t have — the real rounds lead, nothing hidden', () => {
  const entries = 'abcd'.split('').map(team);
  const r16 = match('a', 'b', { stage: 'r16' });
  const m = buildFixtureMap(input({ cfg: cfg({ shape: 'knockout' }), entries, matches: [r16] }));
  assert.equal(m.rounds[0].stage, 'r16');
  assert.equal(m.rounds[0].ties[0].matchId, r16.id);
});

test('the screen: plan controls and draw edits only for organisers (FM26)', () => {
  const s = read('src/screens/FixtureMapScreen.tsx');
  assert.match(s, /canManage && <PlanCard/);
  assert.match(s, /canManage && editing/);
  assert.match(s, /patchTournamentFormat\(/);
  assert.match(s, /oddRuleOf\(/);
  assert.match(s, /plannedTeamsOf\(/);
  assert.match(s, /drawOf\(/);
  assert.match(s, /KO_SLOT_KEY/);
});

test('FM27/FM28: Schedule match offers only the round\'s free boxes and saves the box as the bracket place', () => {
  const s = read('src/screens/ScheduleMatchScreen.tsx');
  assert.match(s, /freeBoxes\(map\)\.filter\(\(b\) => b\.stage === phase\)/);
  assert.match(s, /\[KO_SLOT_KEY\]: box/);
  assert.match(s, /freeInRound\.some\(\(b\) => b\.box === box\)/, 'a box taken meanwhile is not saved');
});

test('the organiser\'s structure decides the shape, even after the first knockout match exists', () => {
  const sf = match('a', 'b', { stage: 'sf' });
  const g = buildFixtureMap(input({ cfg: null, structure: 'league_knockout', entries: [team('a'), team('b')], matches: [sf] }));
  assert.equal(g.kind, 'groups');
  const lp = buildFixtureMap(input({ cfg: null, structure: 'league', entries: [team('a'), team('b')], matches: [match('a', 'b', { stage: 'final' })] }));
  assert.equal(lp.kind, 'league');
  assert.equal(lp.rounds[0]?.stage, 'final', 'a league with playoffs still shows its real knockout');
});
