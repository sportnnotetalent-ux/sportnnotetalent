/** 600 random squads, colours, slot lists and scoreboards
 *  (docs/security/breaks/demo-recording-bugs.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inRosterOrder } from '../src/core/teamPage.ts';
import { slotsInOrder } from '../src/core/slots.ts';
import { ensureContrast, contrastRatio } from '../src/core/contrast.ts';
import { nameColumnWidth, NAME_MIN, NAME_MAX, CELL } from '../src/components/lineScoreLayout.ts';

let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const hex = () => '#' + Array.from({ length: 3 }, () => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');

test('600 cases: nobody lost or duplicated, order kept, colours readable, scores never squeezed', () => {
  for (let i = 0; i < 600; i++) {
    const n = 1 + Math.floor(rnd() * 14);
    const players = Array.from({ length: n }, (_, k) => ({ id: `p${k}`, fullName: `P${k}` })).sort(() => rnd() - 0.5);
    const ids = players.map((p) => p.id).sort(() => rnd() - 0.5).filter(() => rnd() < 0.9).concat(rnd() < 0.3 ? ['missing'] : []);
    const out = inRosterOrder(players, ids);
    assert.equal(out.length, players.length);
    assert.equal(new Set(out.map((p) => p.id)).size, players.length);
    const listed = out.filter((p) => ids.includes(p.id)).map((p) => p.id);
    assert.deepEqual(listed, ids.filter((id) => players.some((p) => p.id === id)), 'roster order kept');

    const entries = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, k) => (rnd() < 0.5
      ? { team: { name: `Team ${1 + Math.floor(rnd() * 20)}` }, slot: true } : { team: { name: `Real ${k}` }, slot: false }));
    const ordered = slotsInOrder(entries, (e) => e.slot);
    assert.equal(ordered.length, entries.length);
    entries.forEach((e, k) => { if (!e.slot) assert.equal(ordered[k], e, 'real teams keep their place'); });
    const nums = ordered.filter((e) => e.slot).map((e) => Number(e.team.name.split(' ')[1]));
    for (let k = 1; k < nums.length; k++) assert.ok(nums[k] >= nums[k - 1], 'slots in number order');

    const c = hex();
    for (const bg of ['#FFFFFF', '#F3F0E8']) assert.ok(contrastRatio(ensureContrast(c, bg), bg) >= 4.5, `${c} on ${bg}`);

    const w = Math.floor(rnd() * 900);
    const periods = Math.floor(rnd() * 8);
    const wide = rnd() < 0.3;
    const nw = nameColumnWidth(w, periods, wide);
    assert.ok(nw >= NAME_MIN && nw <= NAME_MAX);
    if (w && nw > NAME_MIN) assert.ok(nw + (wide ? 64 : 52) + periods * CELL <= w, 'a wider name never pushes the scores off the card');
  }
});
