/**
 * Screen sweep, court sports — seeded simulation (quality mandate step 6;
 * docs/security/breaks/screen-sweep-court.md). 800 random cases (200 per
 * sport) model what each fixed control does on screen, plus old-log
 * fingerprints: chess pinned on 35a2cb8 (before this fix), volleyball /
 * netball / handball reusing batch 6's 180-log fingerprint.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ScoreAction } from '../src/sports/types.ts';
import * as ch from '../src/sports/chess/engine.ts';
import * as hb from '../src/sports/handball/engine.ts';
import { afterPosition, FIELD_TYPES, type ShotPick } from '../src/sports/handball/shotPick.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import * as nb from '../src/sports/netball/engine.ts';
import { oldFingerprint } from './courtTeamBatch6Gen.mts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
let seed = 4242;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];
const N = 200;
/** recorded with the chess engine of 35a2cb8 (before this fix) */
const CHESS_FP = '6e9baa3d385b5371b81322c2ddf566f2a0f84c4ca34f8eb74491e5b740ebb9b4';

/** Old-style chess logs (arbiter events, hostile values, results). */
function chessOldLog(): ScoreAction[] {
  const acts: ScoreAction[] = [];
  const n = 1 + rnd(8);
  for (let i = 0; i < n; i++) {
    const r = rnd(10);
    if (r < 5) acts.push({ type: 'ARBITER', payload: { kind: pick(['illegal', 'draw-offer', 'zzz']), side: pick(['home', 'away', 'x']), ...(rnd(2) ? { at: rnd(4000) } : {}) } });
    else if (r < 7) acts.push({ type: 'RESULT', payload: { winner: pick(['home', 'away', 'draw']), method: pick(['resignation', 'checkmate', 'illegal-move', 'agreement', undefined]) } } as ScoreAction);
    else acts.push({ type: pick(['ARBITER', 'RESULT', 'UNDO_X']), payload: {} } as ScoreAction);
  }
  return acts;
}

describe('sim · old logs replay identically (R1)', () => {
  test('chess: 200 old-style logs give the fingerprint recorded before the fix', () => {
    seed = 777;
    const out: unknown[] = [];
    for (let i = 0; i < N; i++) {
      const s = chessOldLog().reduce((st, a) => ch.reducer(st, a), ch.init({}));
      out.push([s, ch.points(s), ch.arbiterPreset(s)]);
    }
    assert.equal(sha(out), CHESS_FP);
  });
  test('volleyball / netball / handball: batch 6’s 180 old logs are unchanged', () => {
    assert.deepEqual(oldFingerprint(), {
      vb: 'a581606437b8f12fb027f6c2e540014a9ab923ff1c410fa0697e7800a26d9b50',
      nb: '0f432372fb1223f7455289e2af2b2ccd7e000742d1bb97f9540dceb05d7e2726',
      // no-false-zeros NZC9 / NZC10: 6 of these 60 handball logs had a "Stats to
      // track" switch on with no fault kind / no 7 m winner captured — their
      // tf* zeros and sevenMDrawn 0 are gone (verified old-vs-new log by log:
      // nothing else changed). Was 'fcc56601a15d15339d2bc111d527dae0e5cf0af855fdfaec0b4b59ef8e8039e3'.
      hb: 'de98f6910e24c2b30abe6fcd8756ac30aa0316555a1f38c52a5248d2fc740107',
    });
  });
});

describe('sim · chess pre-select (C1–C3)', () => {
  test('200 games: the second illegal move always pre-selects the loss, over any earlier pick', () => {
    seed = 1001;
    let overridden = 0;
    for (let g = 0; g < N; g++) {
      let s = ch.init({});
      let white: Side = pick(SIDES);
      let pk: 'white' | 'black' | 'draw' | 'dff' | null = null;
      let lastKey = '';
      for (let i = 0; i < 12; i++) {
        const r = rnd(4);
        if (r === 0) pk = pick(['white', 'black', 'draw', 'dff', null] as const); // the scorer picks
        else if (r === 1) white = pick(SIDES); // the colour draft
        else s = ch.reducer(s, ch.arbiterAction(s, pick(['illegal', 'illegal', 'draw-offer'] as const), pick(SIDES)) as ScoreAction);
        // the effect, keyed as on screen
        const preset = ch.arbiterPreset(s);
        const key = preset ? `${preset.winner}:${ch.illegalCount(s, 'home')}:${ch.illegalCount(s, 'away')}` : '';
        if (key !== lastKey) {
          lastKey = key;
          if (preset) {
            if (pk != null && pk !== ch.presetPick(preset, white)) overridden++;
            pk = ch.presetPick(preset, white);
            const winner = pk === 'white' ? white : white === 'home' ? 'away' : 'home';
            assert.equal(winner, preset.winner);
            assert.ok(ch.illegalCount(s, preset.winner === 'home' ? 'away' : 'home') >= 2);
          }
        }
      }
    }
    assert.ok(overridden > 0, 'some games had an earlier pick overridden');
  });
});

describe('sim · handball "Not sure" (H1, H2)', () => {
  test('200 attempts: "Not sure" and a position take the same step; only "Not sure" stores no position', () => {
    seed = 2002;
    let s = hb.init({});
    let unsure = 0;
    for (let i = 0; i < N; i++) {
      const mode = pick(['goal', 'shot'] as const);
      const sd = pick(SIDES);
      const t: ShotPick = rnd(3) === 0 ? hb.UNSURE_SHOT : pick(FIELD_TYPES);
      const f = afterPosition({ mode, side: sd, step: 'type' as string }, t);
      assert.equal(f.step, mode === 'goal' ? 'scorer' : 'result');
      assert.equal(f.shotType, t);
      const before = s.events.length;
      s = hb.reducer(s, mode === 'goal'
        ? { type: 'GOAL', side: sd, payload: { shotType: t, uid: `g${i}` } }
        : { type: 'MISS', side: sd, payload: { shotType: t, result: pick(['missed', 'saved', 'blocked']), uid: `m${i}` } });
      const e = s.events[before];
      if (t === hb.UNSURE_SHOT) { unsure++; assert.equal(e.unsure, true); assert.equal(e.shotType, undefined); }
      else { assert.equal(e.unsure, undefined); assert.equal(e.shotType, t); }
    }
    assert.ok(unsure > 20);
  });
});

describe('sim · volleyball fault types without a roster (V1–V3)', () => {
  test('200 matches: a type goes only on the next Opp. fault; the score is the same with or without types', () => {
    seed = 3003;
    for (let m = 0; m < N; m++) {
      let s = vb.init({});
      let plain = vb.init({});
      let err: string | undefined;
      for (let i = 0; i < 30; i++) {
        if (rnd(3) === 0) { const k = pick(vb.VB_ERROR_TYPES).key; err = err === k ? undefined : k; continue; }
        const kind = pick(['attack', 'ace', 'opperror', 'serveerror', 'opperror'] as const);
        const sd = pick(SIDES);
        const a = vb.outcomeAction(kind, sd, undefined, kind === 'opperror' ? { err } : undefined);
        if (kind === 'opperror') assert.deepEqual(a.payload, err ? { err } : undefined);
        else assert.equal(a.payload?.err, undefined);
        s = vb.reducer(s, a);
        plain = vb.reducer(plain, vb.outcomeAction(kind, sd));
        err = undefined; // reset() after every point
      }
      assert.deepEqual([s.sets, s.home, s.away, s.ended], [plain.sets, plain.home, plain.away, plain.ended]);
    }
  });
});

describe('sim · netball toss-up before play (N1, N2)', () => {
  test('200 matches: before play a tap gives a reason and logs nothing; in play it logs one toss-up', () => {
    seed = 4004;
    for (let m = 0; m < N; m++) {
      let s = nb.init({});
      let taps = 0;
      for (let i = 0; i < 12; i++) {
        const r = rnd(5);
        if (r === 0) s = nb.reducer(s, { type: 'FIRST_CENTRE', side: pick(SIDES) });
        else if (r === 1) s = nb.reducer(s, { type: 'CLOCK', payload: { run: !!rnd(2), at: 1000 * (i + 1) } });
        else {
          const before = s.events.filter((e) => e.type === 'tossup').length;
          const why = nb.tossUpBlocked(s);
          if (nb.periodStarted(s)) { assert.equal(why, null); s = nb.reducer(s, { type: 'TOSS_UP', side: pick(SIDES) }); taps++; }
          else assert.equal(why, s.firstCentre ? 'Start play first (start the clock)' : 'Start play first (pick the first centre pass)');
          assert.equal(s.events.filter((e) => e.type === 'tossup').length, before + (nb.periodStarted(s) ? 1 : 0));
        }
      }
      assert.equal(s.events.filter((e) => e.type === 'tossup').length, taps);
    }
  });
});
