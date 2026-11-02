/**
 * Athletics batch 1 simulation (quality mandate step 6): 600 random field
 * competitions — 300 horizontal (LJ / SP, 3 + 3 trials) and 300 vertical
 * (HJ / PV) — with random retirements, WDs, fouls, passes and failures, played
 * through the app's own next-up logic. Invariants: a retired athlete is never
 * offered another trial; keeps their best mark and a valid place; the
 * competition always finishes; positions are consistent with the marks; WD is
 * never ranked; and no vertical jumper ever clears after three failures in a row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, attemptNextUp, verticalState, heightTries, addTry, toggleRetired, summarizeAttempts, summarizeHeights,
  type DisciplineDef, type ResultEntry,
} from '../src/data/results/index.ts';

let seed = 20261102;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const D = (k: string): DisciplineDef => disciplineOf(k)!;

function checkRanking(es: ResultEntry[], def: DisciplineDef) {
  const rows = rankEntries(es, def);
  assert.equal(rows.length, es.length);
  let prev: number | null = null;
  for (const r of rows) {
    if (r.status === 'WD') assert.equal(r.position, null);
    if (r.entry.result.retired && r.status === 'ok') {
      assert.ok(r.position != null, 'retired with a mark is ranked');
      assert.ok(r.flags.includes('r'));
    }
    if (r.position != null) {
      if (prev != null) assert.ok(r.position >= prev);
      prev = r.position;
    }
  }
  const placed = rows.filter((r) => r.position != null);
  for (let i = 1; i < placed.length; i++) assert.ok((placed[i - 1].best as number) >= (placed[i].best as number) - 1e-9, 'better mark never below a worse one');
  return rows;
}

test('300 horizontal competitions: retired keep marks, never called again, the final completes', () => {
  for (let n = 0; n < 300; n++) {
    const def = { ...D(n % 2 ? 'ath.sp' : 'ath.lj'), attempts: { count: 3, extra: 3, finalists: 8 } } as DisciplineDef;
    const size = 2 + rnd(14);
    const es: ResultEntry[] = Array.from({ length: size }, (_, i) => ({ id: `e${i}`, athleteId: `p${i}`, name: `A${i}`, heat: 1, result: { order: i + 1, ...(rnd(20) === 0 ? { status: 'WD' as const } : {}) } }));
    const frozen = new Map<string, number>();
    let guard = 0;
    for (; guard < 500; guard++) {
      const up = attemptNextUp(es, def);
      if (!up) break;
      const e = es.find((x) => x.id === up.entry.id)!;
      assert.ok(!e.result.retired, 'a retired athlete is never called');
      const k = rnd(10);
      const a = k < 2 ? { foul: true } : k === 2 ? { pass: true } : { mark: (300 + rnd(400)) / 100 };
      e.result = { ...e.result, attempts: [...(e.result.attempts ?? []), a] };
      if (rnd(12) === 0) { e.result = toggleRetired(e.result, def); frozen.set(e.id, e.result.attempts!.length); }
    }
    assert.ok(guard < 500, 'the competition finishes');
    for (const e of es) if (frozen.has(e.id)) assert.equal(e.result.attempts!.length, frozen.get(e.id));
    const rows = checkRanking(es, def);
    for (const r of rows) if (r.entry.result.retired) assert.equal(r.best, summarizeAttempts(r.entry.result.attempts, def).best);
  }
});

test('300 vertical competitions: no clearance after three failures in a row; retired keep their height', () => {
  for (let n = 0; n < 300; n++) {
    const def = D(n % 2 ? 'ath.pv' : 'ath.hj');
    const bar = Array.from({ length: 10 }, (_, i) => Math.round((1.0 + i * 0.05) * 100) / 100);
    const size = 2 + rnd(10);
    const es: ResultEntry[] = Array.from({ length: size }, (_, i) => ({ id: `e${i}`, athleteId: `p${i}`, name: `A${i}`, heat: 1, result: { order: i + 1, ...(rnd(20) === 0 ? { status: 'WD' as const } : {}) } }));
    let guard = 0;
    for (; guard < 2000; guard++) {
      // adversarial: sometimes an official taps on a random athlete's row at a random bar, as the row allows
      if (rnd(5) === 0) {
        const e = es[rnd(size)], h = bar[rnd(bar.length)];
        const list = e.result.heights ?? [];
        if (e.result.retired || (e.result.status ?? 'ok') !== 'ok' || !heightTries(list, h).open) continue;
        if (list.some((x) => x.height > h + 1e-9 && x.tries)) continue;
        const cur = list.find((x) => x.height === h)?.tries ?? '';
        const next = addTry(cur, (['O', 'X', '-'] as const)[rnd(3)]);
        e.result = { ...e.result, heights: [...list.filter((x) => x.height !== h), { height: h, tries: next }].sort((a, b) => a.height - b.height) };
        continue;
      }
      const s = verticalState(es, bar);
      if (!s.up || s.height == null) break;
      const e = es.find((x) => x.id === s.up!.id)!;
      assert.ok(!e.result.retired, 'a retired jumper is never called');
      assert.ok(heightTries(e.result.heights, s.height).open, 'the card only calls an athlete who may still jump');
      const k = rnd(10);
      const t = k < 4 ? 'O' : k < 9 ? 'X' : '-';
      const list = e.result.heights ?? [];
      const cur = list.find((x) => x.height === s.height)?.tries ?? '';
      e.result = { ...e.result, heights: [...list.filter((x) => x.height !== s.height), { height: s.height, tries: addTry(cur, t) }].sort((a, b) => a.height - b.height) };
      if (rnd(15) === 0) e.result = toggleRetired(e.result, def);
    }
    assert.ok(guard < 2000, 'the competition finishes');
    for (const e of es) {
      // TR 26.5: once three failures in a row are reached, nothing after is a clearance
      let run = 0, out = false;
      for (const h of e.result.heights ?? []) {
        for (const c of h.tries) {
          if (out) assert.notEqual(c, 'O', `${e.id} cleared after elimination: ${JSON.stringify(e.result.heights)}`);
          if (c === 'X') { run++; if (run >= 3) out = true; } else if (c === 'O') run = 0;
        }
      }
    }
    const rows = checkRanking(es, def);
    for (const r of rows) if (r.entry.result.retired) assert.equal(r.best, summarizeHeights(r.entry.result.heights).best);
  }
});
