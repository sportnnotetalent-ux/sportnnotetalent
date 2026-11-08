/** Teams for doubles, phase 3 (docs/security/breaks/team-whos-playing.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sidePlayers, remindTargets, canSavePick } from '../src/core/teamPlay.ts';
import { planStatSync } from '../src/data/statSync.ts';
import { prepRefs, type PrepTeam } from '../supabase/functions/_shared/prepReminders.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const P = (id: string) => ({ id, fullName: id.toUpperCase() });

test('WP1/WP2: who is on the scoring buttons', () => {
  assert.deepEqual(sidePlayers({ teamId: 't', teamName: 'Duo', squad: [P('a'), P('b')], needed: 2 }).players.map((p) => p.id), ['a', 'b']);
  const big = [P('a'), P('b'), P('c'), P('d')];
  assert.deepEqual(sidePlayers({ teamId: 't', teamName: 'Smashers', squad: big, needed: 2, picked: ['c', 'a'] }).players.map((p) => p.id), ['c', 'a']);
  const st = sidePlayers({ teamId: 't', teamName: 'Smashers', squad: big, needed: 2 });
  assert.equal(st.kind, 'standin');
  assert.deepEqual(st.players.map((p) => p.fullName), ['Smashers Player 1', 'Smashers Player 2']);
});

test('WP7: a pick can be saved only at exactly the number playing', () => {
  assert.equal(canSavePick(['a', 'b'], 2), true);
  assert.equal(canSavePick(['a'], 2), false);
  assert.equal(canSavePick(['a', 'a'], 2), false);
  assert.equal(canSavePick(['a', 'b', 'c'], 2), false);
});

test('WP8: the reminder goes to the captain, vice and admins', () => {
  assert.deepEqual(remindTargets({ captainId: 'c', viceCaptainId: 'v', adminIds: ['x', 'c'] }), ['c', 'v', 'x']);
  assert.deepEqual(remindTargets({}), []);
});

test('WP4: stand-ins never reach the career table', () => {
  const writes = planStatSync([], { 'ph:t:1': { side: 'home', stats: { winners: 2 } }, p1: { side: 'home', stats: { winners: 1 } } } as never, (x) => x);
  assert.ok(writes.every((w) => w.kind !== 'insert' || !(w as { playerId: string }).playerId.startsWith('ph:')));
  assert.ok(writes.some((w) => w.kind === 'insert' && (w as { playerId: string }).playerId === 'p1'));
  assert.match(read('src/data/repos.ts'), /export async function recordStatLine[\s\S]{0,400}if \(isStandIn\(args\.playerId\)\) return;/);
});

test('WP3/WP5/WP6: the live screen uses sidePlayers, skips stand-ins in the eligibility filter, shows the team name, and gates the picker', () => {
  const s = read('src/screens/LiveScoringScreen.tsx');
  assert.match(s, /sidePlayers\(/);
  assert.match(s, /isStandIn\(p\.id\) \|\| canFieldPlayer\(p, ageReq\)/);
  assert.match(s, /pickerFor\(/);
  assert.match(s, /<WhoPlaysCard /);
  const card = read('src/components/WhoPlaysCard.tsx');
  assert.match(card, /Ask \$\{[^}]+\} to pick/);
  assert.match(card, /Who’s playing\?/);
  assert.match(card, /mode === 'pick'/);
});

const team = (id: string, squadSize: number): PrepTeam => ({ id, name: id, shortName: id, captainId: `${id}-cap`, viceCaptainId: null, adminIds: [], staffProfileIds: [], squadSize });
const match = (sport: string, playersPerSide?: number) => ({ id: 'm', sport, homeTeamId: 'h', awayTeamId: 'a', tournamentId: null, hostIds: [], scorerIds: ['s'], squadSaved: { home: false, away: false }, ...(playersPerSide ? { playersPerSide } : {}) });

test('WP9: the server nudges a doubles side only when its squad is bigger than the number playing', () => {
  const lk = (h: number, a: number) => ({ teams: new Map([['h', team('h', h)], ['a', team('a', a)]]), tournaments: new Map(), orgMembers: [] });
  assert.deepEqual(prepRefs(match('badminton', 2), lk(2, 2)).squad, [], 'two-person teams: no nudge');
  assert.deepEqual(prepRefs(match('badminton', 2), lk(4, 2)).squad.map((r) => r.teamId), ['h']);
  assert.deepEqual(prepRefs(match('badminton'), lk(3, 1)).squad.map((r) => r.teamId), ['h'], 'unknown size counts as 2');
  assert.deepEqual(prepRefs(match('badminton', 1), lk(3, 3)).squad.map((r) => r.teamId), ['h', 'a'], 'singles from a squad of 3 still needs a pick');
  assert.deepEqual(prepRefs(match('golf', 1), lk(3, 3)).squad, [], 'sports with no squads stay quiet');
  assert.equal(prepRefs(match('football'), lk(15, 15)).squad.length, 2, 'team sports unchanged');
});

test('600 matches: a side always plays exactly the number needed; stand-ins never reach careers', () => {
  let seed = 31;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let u = 0; u < 600; u++) {
    const needed = rnd() < 0.8 ? 2 : 1;
    const squad = Array.from({ length: needed + Math.floor(rnd() * 4) }, (_, i) => P(`u${u}p${i}`));
    const picked = rnd() < 0.4 ? [...squad].sort(() => rnd() - 0.5).slice(0, needed + (rnd() < 0.2 ? 1 : 0)).map((p) => p.id) : undefined;
    const side = sidePlayers({ teamId: `t${u}`, teamName: `Team${u}`, squad, needed, picked });
    assert.equal(side.players.length, needed, `${u}: exactly the number playing`);
    if (squad.length === needed) assert.notEqual(side.kind, 'standin', `${u}: a squad of exactly the number playing never needs stand-ins`);
    if (side.kind === 'standin') assert.ok(side.players.every((p, i) => p.fullName === `Team${u} Player ${i + 1}`));
    else assert.ok(side.players.every((p) => squad.some((q) => q.id === p.id)));
    const totals = Object.fromEntries(side.players.map((p) => [p.id, { side: 'home', stats: { points: 1 + Math.floor(rnd() * 5) } }]));
    const writes = planStatSync([], totals as never, (x) => x);
    assert.ok(writes.every((w) => !('playerId' in w) || !String((w as { playerId: string }).playerId).startsWith('ph:')), `${u}: no stand-in written`);
  }
});
