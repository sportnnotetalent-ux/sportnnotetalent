/**
 * Simulation (quality mandate step 6) for the doubles picker
 * (docs/security/breaks/doubles-picker.md): 600 organisers, each with a random
 * entry list, random and hostile queries, and a random match history.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPair, isSingle, sidesForStructure, searchSides, searchPeople, recentPairs } from '../src/data/doublesPicker.ts';
import { findEntryFor } from '../src/data/participantEntry.ts';
import { pairTypeOf, settlePairType, pairTypeFromDivisions, PAIR_TYPES } from '../src/sports/pairType.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(a: readonly T[]): T => a[rnd(a.length)];

const NAMES = ['Hrudhay', 'Asha Rao', 'Ben Lee', 'Ravi K', 'Ravi S', 'Kiran', 'M. R.', 'Zoë', 'Ölaf', '李雷', 'A / B', '.*', '(x', '🏸 Ace'];
const HOSTILE = ['', ' ', 'hr', 'Hru', 'HRU', '.*', '(x', '[', '\\', '🏸', 'a'.repeat(5000), ' ravi ', '/ ', 'null', 'undefined'];
const SPORTS = ['badminton', 'tennis', 'padel', 'squash'];

test('600 simulated organisers: picker invariants hold', () => {
  let searches = 0, recents = 0;
  for (let u = 0; u < 600; u++) {
    const people = Array.from({ length: 2 + rnd(30) }, (_, i) => ({ id: `p${u}-${i}`, name: pick(NAMES) + (rnd(2) ? ` ${i}` : '') }));
    const teams = Array.from({ length: rnd(40) }, (_, i) => {
      const size = pick([0, 1, 1, 2, 2, 2, 3]);
      const roster = size === 0 && rnd(2) ? undefined : Array.from({ length: size }, () => pick(people).id);
      return { id: `t${u}-${i}`, name: roster?.length ? roster.map((id) => people.find((p) => p.id === id)!.name).join(' / ') : pick(NAMES), roster };
    });
    const pairs = sidesForStructure(teams, 'pair');
    const singles = sidesForStructure(teams, 'single');
    // DP1–DP3: never both; a pair is two different people; a single is one
    for (const t of pairs) { assert.equal(t.roster!.length, 2); assert.notEqual(t.roster![0], t.roster![1]); assert.ok(!isSingle(t)); }
    for (const t of singles) { assert.ok((t.roster?.length ?? 0) <= 1); assert.ok(!isPair(t)); }
    // DP14: any query is safe, capped, and a subset of the list
    for (let k = 0; k < 4; k++) {
      const q = rnd(3) ? pick(HOSTILE) : pick(people).name.slice(rnd(3), 3 + rnd(6));
      const r = searchSides(pairs, q);
      const pr = searchPeople(people, q, 25 - r.length);
      searches++;
      assert.ok(r.length + pr.length <= 25);
      assert.ok(r.every((t) => pairs.includes(t)));
      if (q.trim().length < 3) { assert.equal(r.length, 0); assert.equal(pr.length, 0); }
      for (const t of r) assert.ok(t.name.toLowerCase().includes(q.trim().toLowerCase()));
    }
    // DP6/DP7: recent pairs
    const me = rnd(5) ? pick(people).id : undefined;
    const sport = pick(SPORTS);
    const matches = Array.from({ length: rnd(25) }, (_, i) => ({
      sport: pick(SPORTS), startsAt: rnd(10) ? new Date(Date.UTC(2026, rnd(12), 1 + rnd(28))).toISOString() : 'garbage',
      homeTeam: { id: rnd(5) ? pick(teams.length ? teams : [{ id: 'x' }]).id : `gone-${i}` },
      awayTeam: { id: pick(teams.length ? teams : [{ id: 'y' }]).id },
      hostIds: rnd(3) ? [] : me ? [me] : [],
    }));
    const exclude = rnd(2) && pairs.length ? pick(pairs).id : null;
    const rec = recentPairs({ matches, pairs, sport, me, exclude });
    recents++;
    assert.ok(rec.length <= 6);
    assert.equal(new Set(rec.map((t) => t.id)).size, rec.length);
    if (!me) assert.equal(rec.length, 0);
    for (const t of rec) {
      assert.ok(isPair(t) && pairs.includes(t));
      assert.notEqual(t.id, exclude);
      const hosted = matches.some((m) => m.sport === sport && (m.homeTeam.id === t.id || m.awayTeam.id === t.id) && m.hostIds.includes(me!));
      assert.ok(t.roster!.includes(me!) || hosted, 'only my pairs or pairs from matches I hosted');
    }
    // DP6: re-creating a pair with the same two people (any order) finds it
    for (const t of pairs.slice(0, 3)) {
      const found = findEntryFor(teams, [...t.roster!].reverse());
      assert.ok(found && new Set(found.roster).size === 2 && found.roster!.every((id) => t.roster!.includes(id)));
    }
    // DP8–DP11: pair type
    const fmt: Record<string, unknown> = { playersPerSide: pick([1, 2, undefined]), ...(rnd(3) ? { category: pick(['open', 'men', 'women', 'mixed', 'junk', 7, null]) } : {}) };
    assert.ok(PAIR_TYPES.includes(pairTypeOf(fmt)));
    const doubles = rnd(2) === 1;
    const settled = settlePairType(fmt, doubles);
    if ('category' in fmt) {
      assert.ok(PAIR_TYPES.includes(settled.category as never));
      if (!doubles) assert.equal(settled.category, 'open');
    } else assert.deepEqual(settled, fmt);
    const cats = Array.from({ length: rnd(4) }, (_, i) => ({ id: `c${i}`, gender: pick(['boys', 'girls', 'mixed', undefined, null]) }));
    const entries = teams.slice(0, 6).map((t) => ({ team: { id: t.id }, categoryId: cats.length && rnd(2) ? pick(cats).id : undefined }));
    const pt = pairTypeFromDivisions(cats, entries, [teams[0]?.id, teams[1]?.id]);
    assert.ok(pt === undefined || ['men', 'women', 'mixed'].includes(pt));
    if (!cats.some((c) => c.gender)) assert.equal(pt, undefined);
  }
  assert.ok(searches >= 2400 && recents === 600);
});
