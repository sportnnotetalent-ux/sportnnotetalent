/** Cricket: one per-ball describe card with Done; typed speed kept
 *  (docs/security/breaks/describe-cricket.md, DK1…DK13). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { statTotals, deepTotals } from '../src/sports/cricket/scorecard.ts';
import { deliveryOrdinals, recStamp } from '../src/sports/cricket/detail.ts';
import {
  ballKey, pendingKph, ballSummary, detailAction, doneAction, flushOnMove, detailTarget, type KphDraft,
} from '../src/sports/cricket/describeBall.ts';
import { panelMode, type PanelMark } from '../src/sports/describePanel.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const T0 = Date.UTC(2026, 10, 8, 9, 0, 0);
const SETUP: ScoreAction[] = [
  { type: 'SET_STRIKER', payload: { id: 'h1', v: 2 } },
  { type: 'SET_NONSTRIKER', payload: { id: 'h2', v: 2 } },
  { type: 'SET_BOWLER', payload: { id: 'a1', v: 2 } },
];
const CFG = { overs: 20, pitchMap: true, ballSpeed: true, wagonWheel: true, extraWhy: true };
const play = (acts: ScoreAction[]) => acts.reduce(reducer, init(CFG));
const keyOf = (s: CricketState) => { const t = detailTarget(s); return t ? ballKey(t.rec, t.d) : ''; };
let clock = T0;
const ballAct = (s: CricketState, type: string, payload: Record<string, unknown> = {}): ScoreAction => {
  clock += 30_000;
  return { type, side: s.battingSide, payload: { strikerId: s.strikerId, bowlerId: s.bowlerId, at: clock, ...payload } };
};

describe('pure parts', () => {
  test('DK5/DK7/DK9/DK12: the key is per delivery, stamped, innings-aware', () => {
    const r = { inn: 1 as const, side: 'home' as const, t: 111 };
    assert.equal(ballKey(r, 3), '1:home:3@111');
    assert.notEqual(ballKey(r, 3), ballKey({ ...r, t: 222 }, 3)); // DK5: re-scored after undo
    assert.notEqual(ballKey(r, 3), ballKey(r, 4)); // DK7: a re-bowled wide / no-ball
    assert.notEqual(ballKey(r, 1), ballKey({ ...r, inn: 2, side: 'away' }, 1)); // DK9
    assert.equal(ballKey({ inn: 1, side: 'home' }, 3), '1:home:3'); // DK12: no stamp
  });

  test('DK2: a valid, changed typed speed is pending; invalid or same is not', () => {
    assert.equal(pendingKph('132', undefined), 132);
    assert.equal(pendingKph('132', 132), null);
    assert.equal(pendingKph('12', undefined), null);
    assert.equal(pendingKph('', 120), null);
    assert.equal(pendingKph('181', undefined), null);
  });

  test('DK2/DK13: the summary includes the shot, the detail and a pending speed', () => {
    assert.equal(ballSummary({}), '');
    const s = ballSummary({ shot: { zone: 2, deep: true, shot: 'Drive' }, detail: { inn: 1, side: 'home', d: 1, at: '0.1', len: 'good', line: 'off' }, kph: 132 });
    assert.match(s, /Drive/);
    assert.match(s, /Good/i);
    assert.match(s, /132 km\/h/);
    assert.match(s, /deep/);
    // a wide's reason shows; a stale no-ball reason on a wide does not
    assert.match(ballSummary({ ext: 'wd', detail: { inn: 1, side: 'home', d: 1, at: '0.1', why: 'leg' } }), /Down leg/);
    assert.equal(ballSummary({ ext: 'wd', detail: { inn: 1, side: 'home', d: 1, at: '0.1', why: 'foot' } }), '');
  });

  test('DK2: Done saves a valid typed speed for THIS ball only', () => {
    let s = play(SETUP);
    s = reducer(s, ballAct(s, 'RUNS', { runs: 1 }));
    const t = detailTarget(s)!;
    const key = ballKey(t.rec, t.d);
    const a = doneAction({ key, text: '138' }, t, undefined)!;
    assert.equal(a.type, 'BALL_DETAIL');
    s = reducer(s, a);
    assert.equal(s.detail?.[0]?.kph, 138);
    assert.equal(s.detail?.[0]?.d, t.d);
    assert.equal(doneAction({ key, text: '138' }, t, 138), null); // already saved
    assert.equal(doneAction({ key: 'other', text: '138' }, t, undefined), null); // another ball's draft
    assert.equal(doneAction(null, t, undefined), null);
  });

  test('DK11: detailAction sends the same payload the panel sent', () => {
    let s = play(SETUP);
    s = reducer(s, ballAct(s, 'RUNS', { runs: 4, boundary: true }));
    const t = detailTarget(s)!;
    assert.deepEqual(detailAction(t, { len: 'full' }), {
      type: 'BALL_DETAIL', side: t.rec.side,
      payload: { v: 2, inn: t.rec.inn, side: t.rec.side, d: t.d, at: t.at, batterId: 'h1', bowlerId: 'a1', len: 'full' },
    });
  });

  test('DK3/DK5: moving on saves the typed speed to its ball; an undone ball drops it', () => {
    let acts = [...SETUP];
    let s = play(acts);
    const add = (a: ScoreAction) => { acts.push(a); s = reducer(s, a); };
    add(ballAct(s, 'RUNS', { runs: 0 }));
    const draft: KphDraft = { key: keyOf(s), text: '141' };
    const first = detailTarget(s)!;
    add(ballAct(s, 'RUNS', { runs: 2 }));
    const a = flushOnMove(draft, s.log ?? [], s.detail, s.ballsPerOver)!;
    assert.ok(a);
    add(a);
    assert.equal(s.detail?.find((x) => x.d === first.d)?.kph, 141);
    // undo the ball the draft belonged to → nothing is saved to the re-scored ball
    acts = [...SETUP];
    s = play(acts);
    add(ballAct(s, 'RUNS', { runs: 0 }));
    const d2: KphDraft = { key: keyOf(s), text: '141' };
    acts.pop(); s = play(acts); // undo
    add(ballAct(s, 'RUNS', { runs: 3 })); // same over.ball, same d, new stamp
    assert.equal(flushOnMove(d2, s.log ?? [], s.detail, s.ballsPerOver), null);
  });

  test('DK6/DK8: over boundary and free hit each get a fresh key', () => {
    let s = play(SETUP);
    const keys: string[] = [];
    for (let i = 0; i < 6; i++) { s = reducer(s, ballAct(s, 'RUNS', { runs: 0 })); keys.push(keyOf(s)); }
    const lastOfOver = keyOf(s);
    assert.equal(s.bowlerId, undefined); // over done, picking the next bowler
    assert.ok(detailTarget(s)); // the last ball is still describable
    s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'a2', v: 2 } });
    assert.equal(keyOf(s), lastOfOver); // a new bowler is not a new ball
    s = reducer(s, ballAct(s, 'EXTRA', { kind: 'No ball' })); keys.push(keyOf(s));
    s = reducer(s, ballAct(s, 'EXTRA', { kind: 'No ball' })); keys.push(keyOf(s)); // re-bowled, same "1.1"
    assert.equal(s.freeHit, true);
    s = reducer(s, ballAct(s, 'RUNS', { runs: 1 })); keys.push(keyOf(s)); // the free hit
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe('source: one card, Done saves the speed', () => {
  const ix = read('src/sports/cricket/index.tsx');
  const bp = read('src/sports/cricket/BallDetailPanel.tsx');
  test('DK1: one DescribeCard per ball; no stacked cards', () => {
    assert.match(ix, /<DescribeCard\b/);
    assert.match(ix, /useDescribeMarks<string>\(\)/);
    assert.doesNotMatch(ix, /shotSkip|detailSkip|setShotSkip|setDetailSkip/);
    assert.doesNotMatch(ix, /\{shotPanel\}\s*\{detailPanel\}/);
    assert.match(ix, /\{describeCard\}/);
    assert.doesNotMatch(bp, /onDone/);
    assert.doesNotMatch(bp, /label=\{any \? 'Done' : 'Skip'\}/);
  });
  test('DK2/DK3: Done and moving on save a typed speed', () => {
    assert.match(ix, /doneAction\(/);
    assert.match(ix, /flushOnMove\(/);
    assert.match(bp, /detailAction\(/);
  });
  test('DK10: the run pad does not wait on the card', () => {
    const pad = ix.indexOf('{describeCard}');
    assert.ok(pad > ix.indexOf('ctrl.padKey'), 'the card sits below the pad');
  });
});

/* ─────────────────────── 600 scorers ─────────────────────── */

function rng(seed: number) { let x = seed >>> 0 || 1; return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296; }
const SCORE_ONLY = (a: ScoreAction) => a.type !== 'BALL_DETAIL' && a.type !== 'SHOT';

test('600 scorers: marks follow the right ball, no typed speed lost, stats unchanged', () => {
  const seen = { flushed: 0, doneSaved: 0, undoBall: 0, saved: 0, skipped: 0 };
  for (let u = 0; u < 600; u++) {
    const r = rng(u + 7);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    let acts: ScoreAction[] = [...SETUP];
    let s = play(acts);
    const marks = new Map<string, PanelMark>();
    let draft: KphDraft | null = null;
    // the reference model: by the ball's own stamp (independent of ballKey)
    const refMark = new Map<number, PanelMark>();
    const refKph = new Map<number, number>();
    let key = keyOf(s);
    const moveOn = () => {
      const k = keyOf(s);
      if (draft && draft.key !== k) {
        const a = flushOnMove(draft, s.log ?? [], s.detail, s.ballsPerOver);
        if (a) { acts.push(a); s = reducer(s, a); seen.flushed++; }
        draft = null;
      }
      key = k;
    };
    for (let step = 0; step < 40 && !s.ended; step++) {
      const op = r();
      const tgt = detailTarget(s);
      const tStamp = tgt?.rec.t;
      if (!s.bowlerId) { const a = { type: 'SET_BOWLER', payload: { id: pick(['a1', 'a2', 'a3'].filter((b) => b !== s.lastOverBowlerIds?.at(-1))), v: 2 } } as ScoreAction; acts.push(a); s = reducer(s, a); }
      if (op < 0.4 || !tgt) {
        const kind = r();
        const a = kind < 0.1 ? ballAct(s, 'EXTRA', { kind: 'Wide' }) : kind < 0.2 ? ballAct(s, 'EXTRA', { kind: 'No ball' }) : ballAct(s, 'RUNS', { runs: pick([0, 1, 2, 4]) });
        // a typed speed for the ball we are leaving is kept
        const leaving = draft && tgt && pendingKph(draft.text, s.detail?.find((x) => x.inn === tgt.rec.inn && x.side === tgt.rec.side && x.d === tgt.d)?.kph);
        if (leaving && tStamp) refKph.set(tStamp, leaving);
        acts.push(a); s = reducer(s, a);
        moveOn();
      } else if (op < 0.55) {
        const a = detailAction(tgt, { len: pick(['good', 'full', 'short']) });
        acts.push(a); s = reducer(s, a);
      } else if (op < 0.68) {
        draft = { key, text: pick(['132', '95', '12', '200', '141']) };
      } else if (op < 0.8) {
        const saved = s.detail?.find((x) => x.inn === tgt.rec.inn && x.side === tgt.rec.side && x.d === tgt.d);
        const pk = draft && draft.key === key ? pendingKph(draft.text, saved?.kph) : null;
        const summary = ballSummary({ detail: saved, ext: tgt.rec.ext, kph: pk });
        if (summary) {
          const a = doneAction(draft, tgt, saved?.kph);
          if (a) { acts.push(a); s = reducer(s, a); seen.doneSaved++; if (tStamp) refKph.set(tStamp, pk!); }
          seen.saved++;
          draft = null;
          marks.set(key, 'done'); if (tStamp) refMark.set(tStamp, 'done');
        } else { seen.skipped++; marks.set(key, 'skipped'); if (tStamp) refMark.set(tStamp, 'skipped'); }
      } else if (op < 0.88) {
        marks.delete(key); if (tStamp) refMark.delete(tStamp); // Edit
      } else {
        // undo the last action (as the store does), dropping its ball's reference
        const last = acts[acts.length - 1];
        if (acts.length > SETUP.length) {
          acts.pop(); s = play(acts);
          const st = Number(last.payload?.at);
          if (last.type === 'RUNS' || last.type === 'EXTRA') { refMark.delete(st); refKph.delete(st); seen.undoBall++; }
          if (last.type === 'BALL_DETAIL' && 'kph' in (last.payload ?? {})) {
            // the speed goes back to what the ball had before
            const p = last.payload!; const log = s.log ?? []; const ords = deliveryOrdinals(log);
            const i = log.findIndex((x, j) => x.inn === p.inn && x.side === p.side && ords[j] === p.d);
            const t = log[i]?.t;
            const was = s.detail?.find((x) => x.inn === p.inn && x.side === p.side && x.d === p.d)?.kph;
            if (t) { if (was) refKph.set(t, was); else refKph.delete(t); }
          }
          moveOn();
        }
      }
      // the card's state follows the right ball
      const now = detailTarget(s);
      if (now?.rec.t) assert.equal(panelMode(key, marks), panelMode(now.rec.t, refMark), `scorer ${u} step ${step}`);
    }
    // no typed speed lost: every kept speed is on its own ball
    const log = s.log ?? []; const ords = deliveryOrdinals(log);
    for (const [t, kph] of refKph) {
      const i = log.findIndex((x) => x.t === t);
      if (i < 0) continue;
      const det = s.detail?.find((x) => x.inn === log[i].inn && x.side === log[i].side && x.d === ords[i]);
      assert.equal(det?.kph, kph, `scorer ${u}: speed for ${recStamp(log[i], s.ballsPerOver)}`);
    }
    // stats unchanged: the score is the score-only replay; the deep totals are a
    // "Save-button scorer" who saved the same tags (order does not matter)
    const scoreOnly = play(acts.filter(SCORE_ONLY));
    assert.deepEqual(s.scores, scoreOnly.scores);
    assert.deepEqual(statTotals(s), statTotals(play([...acts.filter(SCORE_ONLY), ...acts.filter((a) => !SCORE_ONLY(a))])));
    assert.deepEqual(deepTotals(s), deepTotals(play([...acts.filter(SCORE_ONLY), ...acts.filter((a) => !SCORE_ONLY(a))])));
  }
  // the sim really exercised every path
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 50, `${k}: ${n}`);
});
