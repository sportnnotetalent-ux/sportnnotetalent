/** Doubles in snooker and billiards (docs/security/breaks/cue-doubles.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as SN from '../src/sports/snooker/engine.ts';
import * as BI from '../src/sports/billiards/engine.ts';
import { withDoubles, atTable, playerBreaks } from '../src/sports/cue/doubles.ts';

const sn = withDoubles(SN.createInitialState, SN.reducer as any);
const bi = withDoubles(BI.createInitialState, BI.reducer as any);
const A1 = 'a1a1a1a1-0000-4000-8000-000000000001', A2 = 'a2a2a2a2-0000-4000-8000-000000000002';
const B1 = 'b1b1b1b1-0000-4000-8000-000000000003', B2 = 'b2b2b2b2-0000-4000-8000-000000000004';
const run = (eng: typeof sn, init: any, acts: any[]) => acts.reduce((s, a) => eng.reduce(s, a), eng.init(init));
const pot = (side: string, ball: string, pid?: string) => ({ type: 'POT', side, payload: { ball, ...(pid ? { pid } : {}) } });
const miss = (side: string, pid?: string) => ({ type: 'MISS', side, payload: pid ? { pid } : {} });

test('CD1/CD6: doubles from the format; singles untouched', () => {
  assert.equal((sn.init({ playersPerSide: 2 }) as any).perSide, 2);
  assert.equal((sn.init({}) as any).perSide, 1);
  const single = run(sn, {}, [pot('home', 'red', A1), miss('home', A1)]);
  assert.equal(single.frame.visits[0].p, undefined);
});

test('CD2: the visit is tagged whether it goes on or ends', () => {
  let s = run(sn, { playersPerSide: 2 }, [pot('home', 'red', A1), pot('home', 'black', A1)]);
  assert.equal(s.frame.visit.p, A1, 'goes on');
  s = sn.reduce(s, miss('home', A1));
  assert.equal(s.frame.visits[0].p, A1, 'ended');
  assert.equal(s.frame.visits[0].pts, 8);
  s = sn.reduce(s, miss('away', B1));
  assert.equal(s.frame.visits[1].p, B1, 'a visit of one missed stroke');
});

test('CD3/CD4/CD5: first player stays; other side / 3rd player / junk refused', () => {
  let s = run(sn, { playersPerSide: 2 }, [pot('home', 'red', A1), pot('home', 'black', A2)]);
  assert.equal(s.frame.visit.p, A1);
  s = run(sn, { playersPerSide: 2 }, [miss('home', A1), miss('away', A1)]);
  assert.equal(s.frame.visits[1].p, undefined, 'A1 is home');
  s = run(sn, { playersPerSide: 2 }, [miss('home', A1), miss('away', B1), miss('home', A2), miss('away', B2), miss('home', 'c3c3c3c3-0000-4000-8000-000000000005')]);
  assert.equal(s.frame.visits[4].p, undefined, 'a third home player');
  for (const junk of [{ x: 1 }, 'x'.repeat(500), '__proto__', 42]) {
    const j = sn.reduce(sn.init({ playersPerSide: 2 }), { type: 'MISS', side: 'home', payload: { pid: junk } } as any);
    assert.equal(j.frame.visits[0].p, undefined);
  }
});

test('CD7: who is at the table next', () => {
  const ids = { home: [A1, A2], away: [B1, B2] };
  let s = sn.init({ playersPerSide: 2 });
  assert.equal(atTable(s, 'home', ids.home).suggested, A1);
  s = run(sn, { playersPerSide: 2 }, [pot('home', 'red', A1)]);
  assert.deepEqual(atTable(s, 'home', ids.home), { ids: ids.home, suggested: A1, keeps: true });
  s = run(sn, { playersPerSide: 2 }, [miss('home', A1), miss('away', B1)]);
  assert.equal(atTable(s, 'home', ids.home).suggested, A2);
  assert.equal(atTable(s, 'away', ids.away).suggested, B2);
});

test('CD8: breaks per player; billiards too', () => {
  const s = run(sn, { playersPerSide: 2 }, [pot('home', 'red', A1), pot('home', 'black', A1), miss('home', A1), miss('away', B1), pot('home', 'red', A2), pot('home', 'pink', A2), miss('home', A2)]);
  const b = playerBreaks(s);
  assert.deepEqual([b[A1].highestBreak, b[A1].potted, b[A1].visits], [8, 8, 1]);
  assert.deepEqual([b[A2].highestBreak, b[A2].potted], [7, 7]);
  assert.equal(b[B1].visits, 1);
  const t = run(bi, { playersPerSide: 2 }, [{ type: 'SCORE', side: 'home', payload: { potRed: 1, pid: A1 } }, { type: 'MISS', side: 'home', payload: { pid: A1 } }]);
  assert.equal(t.frame.visits[0].p, A1);
  assert.equal(playerBreaks(t)[A1].highestBreak, 3);
});

test('CD2: only strokes tag a visit (a break-off pick does not)', () => {
  const s = sn.reduce(sn.init({ playersPerSide: 2 }), { type: 'BREAK_OFF', side: 'away', payload: { pid: B1 } } as any);
  assert.equal(s.frame.visit.p, undefined);
  assert.deepEqual(s.dbl, { home: [], away: [] });
});

test('CD8: totals — singles as before; doubles: the pair\'s record to both, breaks to each', async () => {
  const { doublesStatTotals } = await import('../src/sports/cue/doubles.ts');
  const { snookerStatTotals, snookerSideRecord, SNOOKER_RECORD_KEYS } = await import('../src/sports/snooker/totals.ts');
  const totals = doublesStatTotals(snookerStatTotals as any, snookerSideRecord as any, SNOOKER_RECORD_KEYS, { potted: 'potted', pots: 'pots' });
  const ctx = { players: { home: [{ id: A1 }, { id: A2 }], away: [{ id: B1 }, { id: B2 }] } };
  const single = run(sn, {}, [pot('home', 'red'), miss('home')]);
  assert.deepEqual(totals(single as any, ctx as any), snookerStatTotals(single as any, ctx as any));
  const s = run(sn, { playersPerSide: 2 }, [pot('home', 'red', A1), pot('home', 'black', A1), miss('home', A1), miss('away', B1), pot('home', 'red', A2), miss('home', A2)]);
  const t = totals(s as any, ctx as any);
  assert.deepEqual(Object.keys(t).sort(), [A1, A2, B1, B2].sort());
  assert.equal(t[A1].stats.points, t[A2].stats.points, 'the pair\'s points to both');
  assert.equal(t[A1].stats.highestBreak, 8);
  assert.equal(t[A2].stats.highestBreak, 1);
  assert.equal(t[B2].stats.visits, 0);
});
