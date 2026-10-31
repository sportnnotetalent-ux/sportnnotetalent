/**
 * Quality mandate step 6 for the four audit bugs
 * (docs/security/breaks/audit-bugs-2026-10-31.md):
 *  - 1,000 venue / title strings with ; , \ and line breaks: every exported
 *    calendar field unescapes back to the original and never splits a line;
 *  - 500 schools (1–6 admins each): every class request reaches exactly the
 *    admins, never the student;
 *  - 500 rain-hit chases (cut to 5–19 overs at random points): the overlay's
 *    balls left always matches the scorer's;
 *  - 500 archery finals with random ties under both tie rules: locking gives
 *    the medal table's order every time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText } from '../src/core/exportCells.ts';
import { classRequestNotices } from '../src/core/org.ts';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { cricketTickerDetail } from '../src/sports/cricket/ticker.ts';
import { disciplineOf, phaseDiscipline, type ResultEntry } from '../src/data/results/model.ts';
import { rankEntries } from '../src/data/results/rank.ts';
import { rankFinal } from '../src/data/results/plan.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 11;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };

test('AB-01: 1,000 hostile calendar fields round-trip and never break a line', () => {
  const parts = ['Ground 2', ';', ',', '\\', '\n', '\r\n', 'Gate B', ' ', 'ATTENDEE:x', 'é'];
  const unescape = (s: string) => s.replace(/\\(n|;|,|\\)/g, (_, c) => (c === 'n' ? '\n' : c));
  for (let i = 0; i < 1000; i++) {
    const raw = Array.from({ length: 1 + rnd(8) }, () => parts[rnd(parts.length)]).join('');
    const out = icsText(raw);
    assert.ok(!/[\r\n]/.test(out), 'no raw line break');
    assert.ok(!/(^|[^\\])(\\\\)*[;,]/.test(out), `unescaped ; or , in ${JSON.stringify(out)}`);
    assert.equal(unescape(out), raw.replace(/\r\n?/g, '\n'));
  }
});

test('AB-02: 500 schools — every request reaches exactly its admins', () => {
  for (let i = 0; i < 500; i++) {
    const admins = Array.from({ length: 1 + rnd(6) }, (_, k) => `s${i}-a${k}`);
    const n = classRequestNotices({ orgName: `School ${i}`, myName: `Student ${i}`, requested: `Class ${1 + rnd(12)}`, approverIds: admins });
    assert.deepEqual(n.map((x) => x.playerId), admins);
    assert.ok(n.every((x) => x.playerId !== `student-${i}`));
  }
});

test('AB-03: 500 rain-hit chases — the overlay matches the scorer', () => {
  const inn = (runs: number, wickets: number, balls: number) => ({ runs, wickets, balls, extras: 0 });
  let checked = 0;
  for (let i = 0; i < 500; i++) {
    let s: CricketState = init({ overs: 20, dls: true });
    s = { ...s, scores: { ...s.scores, [s.battingSide]: inn(100 + rnd(120), rnd(10), 120) }, ballsInOver: 6 };
    s = reducer(s, { type: 'END_INNINGS' });
    const done = rnd(60);
    s = { ...s, scores: { ...s.scores, [s.battingSide]: inn(rnd(90), rnd(6), done) }, ballsInOver: done % 6, strikerId: 'b1' };
    const cut = Math.max(Math.ceil(done / 6) + 1, 5 + rnd(15));
    s = reducer(s, { type: 'RAIN', payload: { overs: cut, v: 2 } } as ScoreAction);
    if (s.ended || s.target === undefined) continue;
    const scorerLeft = Math.max(0, s.oversLimit * s.ballsPerOver - s.scores[s.battingSide].balls);
    const banner = cricketTickerDetail(s, { home: 'A', away: 'B' }).banner ?? '';
    assert.match(banner, new RegExp(`off ${scorerLeft}\\b`), `cut to ${cut}: ${banner}`);
    checked++;
  }
  assert.ok(checked >= 400, `only ${checked} chases were still on after the cut`);
});

test('AB-04: 500 archery finals — locking ranks as the medal table does', () => {
  const R70 = disciplineOf('arch.r70')!;
  let differed = 0;
  for (let i = 0; i < 500; i++) {
    const rows = Array.from({ length: 4 + rnd(5) }, (_, k) => ({ id: `e${k}`, name: `A${k}`, result: { mark: 640 + rnd(4), tens: 15 + rnd(6), xs: 5 + rnd(6) } } as ResultEntry));
    for (const rules of [{}, { archTie: 'xs' }]) {
      const f = { rules } as never;
      const table = rankEntries(rows, phaseDiscipline(R70, f)).map((r) => r.id);
      assert.deepEqual(rankFinal(f, R70, rows).rows.map((r) => r.id), table);
      if (Object.keys(rules).length && table.join() !== rankEntries(rows, R70).map((r) => r.id).join()) differed++;
    }
  }
  assert.ok(differed > 50, `the X-first rule changed the order in ${differed} finals (proves the case is exercised)`);
});
