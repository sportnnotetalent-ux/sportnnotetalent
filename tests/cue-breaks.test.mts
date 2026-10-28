/**
 * The snooker / billiards app break list (docs/security/breaks/
 * snooker-billiards-app.md): one test per point, written to fail before its
 * fix (quality mandate step 5).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snookerScript, billiardsScript, SINGLES_CTX } from './cue-script.mts';
import { toRecords, amendRecord, replay } from './statTotalsHarness.mts';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { snookerMatchRecords } from '../src/sports/snooker/records.ts';
import { frameSheet } from '../src/sports/snooker/matchStats.ts';
import { snookerStatTotals } from '../src/sports/snooker/totals.ts';
import { billiardsStatTotals } from '../src/sports/billiards/totals.ts';
import { logFrames, frameCorrection, mergeOps } from '../src/sports/cue/corrections.ts';
import { hideBanner, followHidden, FEED_MAX_PER_FRAME } from '../src/sports/cue/uiState.ts';
import { snookerBoard } from '../src/sports/snooker/controls.ts';
import { billiardsBoard } from '../src/sports/billiards/controls.ts';

const SN = { createInitialState: S.createInitialState, reducer: S.reducer as never };
const BI = { createInitialState: B.createInitialState, reducer: B.reducer as never };
const sp = (config: Record<string, unknown>) => ({ name: 'snooker', init: S.createInitialState, reducer: S.reducer as never, statTotals: snookerStatTotals, config, derived: () => true });
const src = (sport: string) => readFileSync(new URL(`../src/sports/${sport}/index.tsx`, import.meta.url), 'utf8');

/** best of 3 won 2-0, both frames shot by shot */
function twoNil() {
  const m = snookerScript({ bestOf: 3 });
  m.pot('red', 'black').miss().concede('away'); // frame 1: home 8-0
  m.pot('red', 'pink').miss().pot('red', 'black').concede('away'); // frame 2 (away breaks): home 8-7
  return m;
}

describe('A-01 · corrections work frame by frame (no cascade)', () => {
  test('the log\'s frames and their rows', () => {
    const recs = toRecords(twoNil().actions);
    const fs = logFrames(SN, { bestOf: 3 }, recs);
    assert.deepEqual(fs.map((f) => [f.n, f.end, f.score, f.winner]), [[1, 4, [8, 0], 'home'], [2, 10, [8, 7], 'home']]);
    assert.deepEqual(fs[0].rows, [1, 2, 3, 4]);
  });

  test('a frame replaced by its final score keeps every later frame', () => {
    const recs = toRecords(twoNil().actions);
    const plan = frameCorrection(SN, { bestOf: 3 }, recs, 1, 70, 10)!;
    assert.ok(plan);
    assert.deepEqual(plan.ops, [
      { op: 'void', seq: 1 }, { op: 'void', seq: 2 }, { op: 'void', seq: 3 },
      { op: 'replace', seq: 4, action: { type: 'FRAME_SCORE', payload: { home: 70, away: 10, frame: 1 } } },
    ]);
    assert.match(plan.line, /^Frame 1: 70–10, was 8–0/);
    const after = replay(sp({ bestOf: 3 }) as never, [...recs, amendRecord(recs, plan.ops)]) as S.SnookerState;
    assert.equal(after.ended, true);
    assert.deepEqual(after.frames.map((f) => [f.score, f.how]), [[[70, 10], 'quick'], [[8, 7], 'concede']]);
    // the winner changes: the later frame still replays as played
    const flip = frameCorrection(SN, { bestOf: 3 }, recs, 1, 10, 70)!;
    const f2 = replay(sp({ bestOf: 3 }) as never, [...recs, amendRecord(recs, flip.ops)]) as S.SnookerState;
    assert.deepEqual(f2.frames.map((f) => f.winner), ['away', 'home']);
    assert.equal(f2.ended, false); // 1-1: the decider is still to play
  });

  test('impossible or unknown frames give no plan; two corrections merge', () => {
    const recs = toRecords(twoNil().actions);
    assert.equal(frameCorrection(SN, { bestOf: 3 }, recs, 1, 40, 40), null); // level
    assert.equal(frameCorrection(SN, { bestOf: 3 }, recs, 3, 40, 1), null); // not played
    const one = frameCorrection(SN, { bestOf: 3 }, recs, 1, 70, 10)!;
    const two = frameCorrection(SN, { bestOf: 3 }, recs, 2, 60, 50)!;
    const ops = mergeOps(one.ops, two.ops);
    const after = replay(sp({ bestOf: 3 }) as never, [...recs, amendRecord(recs, ops)]) as S.SnookerState;
    assert.deepEqual(after.frames.map((f) => f.score), [[70, 10], [60, 50]]);
    // billiards: the target rule
    const b = billiardsScript({ target: 50, bestOf: 3 }).stroke({ potRed: true, cannon: true }, 10); // 50: frame 1
    const brecs = toRecords(b.actions);
    assert.equal(frameCorrection(BI, { target: 50, bestOf: 3 }, brecs, 1, 40, 30), null);
    assert.ok(frameCorrection(BI, { target: 50, bestOf: 3 }, brecs, 1, 50, 30));
  });

  test('the plugins use the frame editor, not the row list', () => {
    for (const sport of ['snooker', 'billiards']) assert.match(src(sport), /CorrectionEditor: \w+Corrections,/, sport);
  });
});

describe('A-02 · an impossible break in a snapshot is not shown or recorded', () => {
  test('a 999 break is dropped by the reader (commentary, sheet, records)', () => {
    const fin = snookerScript({ bestOf: 1 }).pot('red', 'black').concede('away').state;
    const crafted = { ...fin, frames: [{ ...fin.frames[0], visits: [{ side: 'home', pts: 999, pots: 3, shots: 3, end: 'miss' }, ...(fin.frames[0].visits ?? [])] }] } as S.SnookerState;
    assert.ok(!JSON.stringify(snookerFeed(crafted, { home: 'A', away: 'B' })).includes('999'));
    assert.deepEqual(frameSheet(crafted)[0].high, { home: 8, away: 0 });
    assert.deepEqual(snookerMatchRecords(crafted)!.items.map((i) => i.value).filter((v) => v === 999), []);
    // a real free-ball break over 147 (155 max) still reads
    const ok = { ...fin, frames: [{ ...fin.frames[0], visits: [{ side: 'home', pts: 155, pots: 37, shots: 36, fb: 1, end: 'frame' }] }] } as S.SnookerState;
    assert.equal(frameSheet(ok)[0].high!.home, 155);
  });
});

describe('A-03 · "Play on" un-hides after an undo', () => {
  test('hidden for the same foul while the state moves on; shown again after an undo', () => {
    const h = hideBanner('1:0', 5);
    assert.deepEqual(followHidden(h, 6), h); // a free ball called: still hidden
    assert.equal(followHidden(h, 4), null); // undo
    assert.equal(followHidden(null, 9), null);
    assert.match(src('snooker'), /followHidden\(/);
  });
});

describe('A-04 · the commentary shows at most a page of lines per frame', () => {
  test('5,000 safeties: the newest lines and a note', () => {
    const j = snookerScript({ bestOf: 1 });
    for (let i = 0; i < 5000; i++) j.safety();
    const g = snookerFeed(j.state, { home: 'A', away: 'B' })[0];
    assert.ok(g.items.length <= FEED_MAX_PER_FRAME + 1, String(g.items.length));
    assert.match(g.items[g.items.length - 1].text, /4,800 earlier lines not shown/);
    const b = billiardsScript({ target: 1000, bestOf: 1 });
    for (let i = 0; i < 1000; i++) b.safety();
    assert.ok(billiardsFeed(b.state, { home: 'A', away: 'B' }, 'game')[0].items.length <= FEED_MAX_PER_FRAME + 1);
  });
});

describe('A-05 · the quick form belongs to one frame', () => {
  test('the form remounts (and clears) when the frame moves on', () => {
    for (const sport of ['snooker', 'billiards']) assert.match(src(sport), /<FrameScoreForm\s+key=\{`frame-\$\{p\.frame\}`\}/, sport);
  });
});

describe('A-07 · the scoreboard text never throws', () => {
  test('hostile getters give a plain board', () => {
    const evil = new Proxy({}, { get() { throw new Error('boom'); } });
    assert.doesNotThrow(() => snookerBoard(evil as never));
    assert.doesNotThrow(() => billiardsBoard(evil as never));
    const sb = snookerBoard(S.createInitialState({ reds: 6, bestOf: 7 }));
    assert.deepEqual([sb.status, sb.bestOf], ['Frame 1', 'best of 7 · 6 reds']);
    const bb = billiardsBoard(B.createInitialState({ format: 'timed' }));
    assert.deepEqual([bb.status, bb.bestOf], ['Timed game', 'timed']);
    for (const sport of ['snooker', 'billiards']) assert.match(src(sport), /Board\(s\)/, sport);
  });
});

describe('A-10 · a crafted ctx id can\'t reach the prototype', () => {
  test('__proto__ is skipped; the totals object stays plain', () => {
    const s = twoNil().state;
    const evil = { players: { home: [{ id: '__proto__' }], away: [{ id: 'a1' }] } };
    const t = snookerStatTotals(s, evil);
    assert.equal(Object.getPrototypeOf(t), Object.prototype);
    assert.deepEqual(Object.keys(t), ['a1']);
    assert.deepEqual(Object.keys(billiardsStatTotals(B.createInitialState(), evil)), ['a1']);
    assert.ok(snookerStatTotals(s, SINGLES_CTX).h1);
  });
});
