/** 600 badminton matches created either side of 4 Jan 2027, played rally by
 *  rally: the seeded system matches the date, every game ends on a legal score
 *  for its system, and doubles cards escalate per side
 *  (docs/security/breaks/badminton-3x15.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { suggestLevel } from '../src/sports/conduct.ts';
import * as bd from '../src/sports/badminton/engine.ts';

let seed = 2027;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const day = (n: number) => new Date(Date.UTC(2027, 0, 4) + n * 864e5).toISOString().slice(0, 10);
const legal = ([h, a]: [number, number], t: number, cap: number) => {
  const [w, l] = h > a ? [h, a] : [a, h];
  return (w === t && l <= t - 2) || (w > t && w - l === 2 && w <= cap) || (w === cap && l === cap - 1);
};

test('600 matches either side of the date', () => {
  for (let m = 0; m < 600; m++) {
    const d = day(rnd(120) - 60);
    const fmt = formatDefaults(BADMINTON_META.formatFields!, rnd(2) ? 'tournament' : undefined, d);
    const t = d >= '2027-01-04' ? 15 : 21;
    assert.equal(fmt.pointsPerGame, t, d);
    assert.equal(fmt.cap, t === 15 ? 21 : 30);
    let s = bd.reducer(bd.init({ ...fmt, playersPerSide: 2 }), { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } });
    const bias = 30 + rnd(40);
    let guard = 0;
    while (!s.ended && guard++ < 500) s = bd.reducer(s, { type: 'POINT', side: rnd(100) < bias ? 'home' : 'away' });
    assert.ok(s.ended, 'match finishes');
    assert.ok(s.games.length >= 2 && s.games.length <= 3);
    for (const g of s.games) assert.ok(legal(g, t, t === 15 ? 21 : 30), `${d} ${g}`);
    // cards: any earlier card on the side makes the next one a fault
    const warned = rnd(2) === 0;
    const ev = warned ? [{ id: 1, stamp: 'G', icon: '🟨', label: 'w', side: 'home', pen: { by: 'home', level: 'warning', playerId: `p${rnd(2)}` } }] : [];
    assert.equal(suggestLevel('badminton', ev as never, 'home', { playerId: `p${rnd(2)}` }), warned ? 'point' : 'warning');
  }
});
