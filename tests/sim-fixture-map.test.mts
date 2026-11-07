/** 600 organisers open the fixture map: random formats, fields 2–128, slots,
 *  half-played rounds and fills (docs/security/breaks/fixture-map.md). The map
 *  never loses or doubles a team, always ends in one final, agrees with the
 *  app's next round, and stays fast. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFixtureMap, treeLayout, fixtureMapSheet, type MapSide } from '../src/core/fixtureMap.ts';
import { knockoutStageRounds, nextRoundPairs } from '../src/data/bracket.ts';
import type { StructureConfig } from '../src/data/structureConfig.ts';
import type { Match } from '../src/core/types.ts';

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const cfg = (o: Partial<StructureConfig>): StructureConfig => ({
  shape: 'knockout', groupCount: 2, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false, manualStandings: false, swissRounds: 5, ...o,
});
const label = (s: MapSide) => (s.kind === 'team' ? s.id : s.kind === 'from' ? s.label : 'bye');

test('600 organisers: every team once, one final, real next rounds agree, fast', () => {
  const t0 = performance.now();
  let teamsSeen = 0;
  for (let u = 0; u < 600; u++) {
    const shape = rnd() < 0.5 ? 'knockout' : 'groups';
    const field = shape === 'knockout' ? int(2, 128) : int(4, 64);
    const entries = Array.from({ length: field }, (_, i) => ({ id: `u${u}t${i}`, name: `Team ${i + 1}` }));
    const slotIds = new Set(entries.filter(() => rnd() < 0.4).map((e) => e.id));
    const groupCount = Math.max(2, Math.min(Math.floor(field / 2), int(2, 8)));
    const c = shape === 'knockout' ? cfg({}) : cfg({ shape: 'groups', groupCount, advanceTopN: int(1, 2), advanceBest: rnd() < 0.3 ? int(1, 2) : 0 });

    // half of the knockouts have a real first round, partly played
    let matches: Match[] = [];
    if (shape === 'knockout' && field >= 4 && (field & (field - 1)) === 0 && rnd() < 0.5) {
      const stage = field === 4 ? 'sf' : field === 8 ? 'qf' : field === 16 ? 'r16' : field === 32 ? 'r32' : field === 64 ? 'r64' : 'r128';
      matches = Array.from({ length: field / 2 }, (_, i) => {
        const done = rnd() < 0.6;
        return {
          id: `u${u}m${i}`, sport: 'football', stage, status: done ? 'completed' : 'scheduled', ...(done ? { winner: rnd() < 0.5 ? 'home' : 'away' } : {}),
          startsAt: new Date(1.8e12 + i * 3.6e6).toISOString(),
          homeTeam: { id: entries[2 * i].id, name: entries[2 * i].name }, awayTeam: { id: entries[2 * i + 1].id, name: entries[2 * i + 1].name },
        } as unknown as Match;
      });
    }
    const m = buildFixtureMap({ cfg: c, matches, entries, slotIds });
    assert.equal(m.kind, shape);
    assert.equal(m.openSlots, slotIds.size);
    if (!m.rounds.length) continue;
    const last = m.rounds[m.rounds.length - 1];
    assert.equal(last.ties.length, 1, `user ${u}: one final`);
    assert.equal(last.ties[0].label, 'Final');

    if (shape === 'knockout' && !matches.length) {
      const r0 = m.rounds[0];
      const ids = [...r0.ties.flatMap((t) => [t.home, t.away]), ...r0.byes].map(label);
      assert.equal(ids.length, field, `user ${u}: field ${field}`);
      assert.equal(new Set(ids).size, field);
      teamsSeen += field;
      // a slot is fillable only if it is a slot
      for (const s of [...r0.ties.flatMap((t) => [t.home, t.away]), ...r0.byes]) if (s.kind === 'team') assert.equal(s.slot, slotIds.has(s.id));
    }
    if (matches.length) {
      // when the real round is fully decided, the map's next round = the app's
      const real = knockoutStageRounds(matches);
      const next = nextRoundPairs(real[0]);
      if (next) assert.deepEqual(m.rounds[1].ties.map((t) => [label(t.home), label(t.away)]), next.map((p) => [p.homeId, p.awayId]), `user ${u}`);
      else assert.ok(m.rounds[1].ties.some((t) => t.home.kind === 'from' || t.away.kind === 'from'));
    }
    if (shape === 'groups') {
      const q = m.rounds[0].ties.flatMap((t) => [t.home, t.away]).concat(m.rounds[0].byes).map(label);
      assert.equal(new Set(q).size, q.length, `user ${u}: no qualifier twice`);
      assert.equal(q.length, groupCount * c.advanceTopN + c.advanceBest);
    }
    const l = treeLayout(m.rounds, 124, 16);
    for (const col of l.tops) for (const y of col) assert.ok(Number.isFinite(y) && y >= 0);
    if (u % 50 === 0) assert.match(fixtureMapSheet(m, { name: 'Cup', sport: 'Football' }), /Final/);
  }
  assert.ok(teamsSeen > 0);
  assert.ok(performance.now() - t0 < 15000, 'fast for 600 organisers');
});
