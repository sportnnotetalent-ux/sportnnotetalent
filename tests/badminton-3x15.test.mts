/** Badminton 3×15 default from 4 Jan 2027 + cards per side
 *  (docs/security/breaks/badminton-3x15.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { suggestLevel } from '../src/sports/conduct.ts';
import * as bd from '../src/sports/badminton/engine.ts';

const F = BADMINTON_META.formatFields!;

test('B15-1: before 4 Jan 2027 new matches seed 3×21; from that day 3×15', () => {
  const before = formatDefaults(F, undefined, '2027-01-03');
  assert.equal(before.preset, 'bwf21');
  assert.equal(before.pointsPerGame, 21);
  assert.equal(before.cap, 30);
  const after = formatDefaults(F, undefined, '2027-01-04');
  assert.equal(after.preset, 'g15');
  assert.equal(after.pointsPerGame, 15);
  assert.equal(after.cap, 21);
  assert.equal(after.gamesToWin, 2);
  assert.equal(after.goldenPoint, true);
  assert.equal(formatDefaults(F, 'tournament', '2027-02-01').preset, 'g15', 'tournaments too');
});

test('B15-2: the static default (what stored formats fall back to) is unchanged', () => {
  assert.equal(F.find((f) => f.key === 'preset')!.default, 'bwf21');
  const s = bd.init({});
  assert.equal(s.target, 21, 'an old match with no stored points keeps 21');
});

test('B15-5: the labels name the official systems; values unchanged', () => {
  const opts = F.find((f) => f.key === 'preset')!.options!;
  const lab = (v: string) => opts.find((o) => o.value === v)!.label;
  assert.match(lab('g15'), /Games to 15, best of 3 · BWF standard from 4 Jan 2027/);
  assert.match(lab('bwf21'), /Games to 21, best of 3 · BWF alternate/);
  assert.match(lab('g5x11'), /Games to 11, best of 5 · not a BWF system/);
});

test('3×15 plays to the BWF rules: two clear at 14-all, 20-all next point wins', () => {
  let s = bd.reducer(bd.init(formatDefaults(F, undefined, '2027-01-04')), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
  const P = (side: 'home' | 'away') => { s = bd.reducer(s, { type: 'POINT', side }); };
  for (let i = 0; i < 14; i++) { P('home'); P('away'); }
  P('home'); assert.equal(s.games.length, 0, '15-14 is not a game');
  P('away'); for (let i = 0; i < 5; i++) { P('home'); P('away'); }
  assert.deepEqual(s.current, { home: 20, away: 20 });
  P('away');
  assert.deepEqual(s.games[0], [20, 21]);
});

test('B15-6: in doubles a partner\'s warning counts for the side (Law 16.7.1)', () => {
  const ev = [{ id: 1, stamp: 'Game 1', icon: '🟨', label: 'w', side: 'home', pen: { by: 'home', level: 'warning', playerId: 'pA' } }] as never;
  assert.equal(suggestLevel('badminton', ev, 'home', { playerId: 'pB' }), 'point');
  assert.equal(suggestLevel('badminton', ev, 'away', { playerId: 'pC' }), 'warning', 'the other side is clean');
  assert.equal(suggestLevel('squash', ev, 'home', { playerId: 'pB' }), 'warning', 'squash still counts per player');
});
