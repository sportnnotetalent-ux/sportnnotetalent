/**
 * Athletics batch 1 (expert audit fixes 1 and 2, docs/security/breaks/athletics-batch1.md):
 * A1–A5 a field athlete can retire ("r", World Athletics notation): they keep
 * the marks made and their place from them, take no further trials, and show
 * "r"; WD is unchanged. A6–A8 a vertical jumper out on three failures in a row
 * (carried across a pass, TR 26.5) can't be given another try.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, attemptNextUp, firstRoundsDone, fieldFinalists, verticalState, phaseLines,
  heightTries, toggleRetired, effectiveStatus,
  type DisciplineDef, type ResultEntry, type EntryResult,
} from '../src/data/results/index.ts';
import { eventCommentary } from '../src/data/results/raceCommentary.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const LJ = D('ath.lj'), HJ = D('ath.hj'), SP = D('ath.sp');
const ath = (i: number, result: EntryResult = {}): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat: 1, result: { order: i, ...result } });
const J = (...marks: (number | 'X' | '-')[]) =>
  marks.map((m) => (m === 'X' ? { foul: true } : m === '-' ? { pass: true } : { mark: m, wind: 1.0 }));
const H = (...p: [number, string][]) => p.map(([height, tries]) => ({ height, tries }));

describe('A1 / F2 / F3: retired keeps marks and place; WD unchanged', () => {
  test('a retired long jumper ranks on the marks made', () => {
    const rows = rankEntries([
      ath(1, { attempts: J(5.10, 'X', 5.00) }),
      ath(2, { attempts: J(5.40), retired: { afterRound: 1 } }),
      ath(3, { attempts: J(4.90, 4.95, 'X') }),
    ], LJ);
    assert.deepEqual(rows.map((r) => [r.id, r.position]), [['e2', 1], ['e1', 2], ['e3', 3]]);
    assert.equal(rows[0].status, 'ok');
    assert.equal(rows[0].bestText, '5.40');
  });

  test('WD still drops the athlete from the ranking', () => {
    const rows = rankEntries([ath(1, { attempts: J(5.10) }), ath(2, { attempts: J(5.40), status: 'WD' })], LJ);
    assert.equal(rows.find((r) => r.id === 'e2')!.position, null);
    assert.equal(rows.find((r) => r.id === 'e2')!.status, 'WD');
  });

  test('countback uses the marks made: equal best, the retired athlete has no second mark', () => {
    const rows = rankEntries([
      ath(1, { attempts: J(5.00, 'X'), retired: { afterRound: 2 } }),
      ath(2, { attempts: J(5.00, 4.80, 'X') }),
    ], LJ);
    assert.deepEqual(rows.map((r) => [r.id, r.position]), [['e2', 1], ['e1', 2]]);
  });

  test('a retired high jumper keeps their height and the failures tie-break', () => {
    const rows = rankEntries([
      ath(1, { heights: H([1.30, 'O'], [1.35, 'XO']), retired: { atHeight: 1.35 } }),
      ath(2, { heights: H([1.30, 'O'], [1.35, 'O'], [1.40, 'XXX']) }),
      ath(3, { heights: H([1.30, 'XO'], [1.35, 'XXX']) }),
    ], HJ);
    assert.deepEqual(rows.map((r) => [r.id, r.position]), [['e2', 1], ['e1', 2], ['e3', 3]]);
  });

  test('F1: rows without `retired` rank exactly as before (no r flag)', () => {
    const rows = rankEntries([ath(1, { attempts: J(5.10, 'X', 5.00) }), ath(2, { attempts: J(4.10) })], LJ);
    assert.ok(rows.every((r) => !r.flags.includes('r')));
  });
});

describe('A2 / A3 / F5: no further trials; the final still opens', () => {
  test('next-up skips a retired athlete; rounds 4–6 open although they took 1 trial', () => {
    const def = { ...LJ, attempts: { count: 3, extra: 3, finalists: 8 } } as DisciplineDef;
    const es = [ath(1, { attempts: J(5.4), retired: { afterRound: 1 } }), ath(2, { attempts: J(5.0, 5.1) }), ath(3, { attempts: J(4.9, 4.8, 4.7) })];
    assert.equal(attemptNextUp(es, def)?.entry.id, 'e2');
    es[1].result.attempts = J(5.0, 5.1, 'X');
    assert.equal(firstRoundsDone(es, def), true);
    const up = attemptNextUp(es, def);
    assert.equal(up?.round, 4);
    assert.notEqual(up?.entry.id, 'e1');
  });

  test('a retired athlete in the top 8 holds their place in the cut', () => {
    const def = { ...SP, attempts: { count: 3, extra: 3, finalists: 2 } } as DisciplineDef;
    const es = [ath(1, { attempts: J(9.0), retired: { afterRound: 1 } }), ath(2, { attempts: J(8.0, 'X', 'X') }), ath(3, { attempts: J(7.0, 'X', 'X') })];
    assert.deepEqual([...fieldFinalists(es, def)].sort(), ['e1', 'e2']);
  });

  test('vertical: the bar card no longer calls a retired jumper, and they are not "still in"', () => {
    const es = [ath(1, { heights: H([1.30, 'O']), retired: { atHeight: 1.30 } }), ath(2, { heights: H([1.30, 'O']) })];
    const s = verticalState(es, [1.30, 1.35]);
    assert.deepEqual([s.height, s.up?.id, s.active.map((e) => e.id)], [1.35, 'e2', ['e2']]);
  });
});

describe('A4 / A5 / F4 / F6: NM, display, stats, undo', () => {
  test('retired with no valid mark is NM, not pending', () => {
    assert.equal(effectiveStatus({ attempts: J('X'), retired: { afterRound: 1 } }, LJ), 'NM');
    assert.equal(effectiveStatus({ heights: H([1.30, 'X']), retired: { atHeight: 1.30 } }, HJ), 'NM');
    assert.equal(effectiveStatus({ attempts: J('X') }, LJ), 'ok');
  });

  test('"r" flag on the ranked row', () => {
    const [r] = rankEntries([ath(1, { attempts: J(5.4), retired: { afterRound: 1 } })], LJ);
    assert.ok(r.flags.includes('r'));
  });

  test('career line keeps the mark and the place', () => {
    const rows = rankEntries([ath(1, { attempts: J(5.4), retired: { afterRound: 1 } }), ath(2, { attempts: J(5.0) })], LJ);
    const lines = phaseLines({ discipline: 'ath.lj', phase: 'final', category: { age: 'U14', gender: 'F' } }, rows);
    const me = lines.find((l) => l.playerId === 'p1')!;
    assert.equal(me.stats.place, 1);
    assert.equal(me.stats.mark, 5.4);
  });

  test('commentary says the athlete retired', () => {
    const ev = { eventKey: 'lj', title: 'Long jump', discipline: 'ath.lj', phases: [{ id: 'ph', status: 'live', format: { eventKey: 'lj', discipline: 'ath.lj', phase: 'final', phaseNo: 1, heats: 1 }, entries: [ath(1, { attempts: J(5.4), retired: { afterRound: 1 } })] }] };
    const items = eventCommentary(ev as never);
    assert.ok(items.some((i) => /retire/i.test(i.text)), items.map((i) => i.text).join('\n'));
  });

  test('toggleRetired: records where they stopped; tapping again undoes it', () => {
    const r = toggleRetired({ attempts: J(5.4, 'X') }, LJ);
    assert.deepEqual(r.retired, { afterRound: 2 });
    assert.equal(toggleRetired(r, LJ).retired, undefined);
    assert.deepEqual(toggleRetired({ heights: H([1.30, 'O'], [1.35, 'X']) }, HJ).retired, { atHeight: 1.35 });
    const es = [ath(1, toggleRetired(toggleRetired({ attempts: J(5.4) }, LJ), LJ))];
    assert.equal(attemptNextUp(es, LJ)?.entry.id, 'e1');
  });
});

describe('A6–A8: no try after three failures in a row', () => {
  test('"X–" then "XX": out, no more tries at that height', () => {
    const hs = H([1.30, 'X-'], [1.35, 'XX']);
    assert.deepEqual(heightTries(hs, 1.35), { open: false, left: 0 });
  });
  test('carried failure: 2 tries left at the next height', () => {
    assert.deepEqual(heightTries(H([1.30, 'X-']), 1.35), { open: true, left: 2 });
    assert.deepEqual(heightTries(H([1.30, 'XX-'], [1.35, '']), 1.35), { open: true, left: 1 });
  });
  test('a clearance resets the count; a finished height is closed', () => {
    assert.deepEqual(heightTries(H([1.30, 'XXO']), 1.35), { open: true, left: 3 });
    assert.equal(heightTries(H([1.30, 'XO']), 1.30).open, false);
    assert.equal(heightTries(H([1.30, 'XXX']), 1.35).open, false);
    assert.deepEqual(heightTries([], 1.30), { open: true, left: 3 });
  });
  test('F7: an old row that already breaks TR 26.5 still ranks as stored', () => {
    const [r] = rankEntries([ath(1, { heights: H([1.30, 'O'], [1.35, 'X-'], [1.40, 'XXO']) })], HJ);
    assert.equal(r.best, 1.4);
  });
});
