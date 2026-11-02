/**
 * Cricket batch 5 simulation (docs/security/breaks/cricket-batch5.md): 600
 * random matches (two innings each) scored ball by ball with the new optional
 * taps mixed in at random — shot tags on any ball (some hostile), catch
 * positions, v:2 strike swaps, DRS reviews (some hostile, some with none
 * left), concussion subs. Invariants:
 *  - every new tap is score-neutral: the same log without the shot / detail /
 *    review taps, and with legacy swaps, gives the same scores, cards and ball log;
 *  - reviews left stay within 0…the rules' count; a side never loses more
 *    reviews in an innings than it had;
 *  - shot-type stats only count real balls (runs = the balls' runs, outs ≤
 *    wickets); catches by area add up;
 *  - every v:2 swap after ball 1 is one STRIKE CHANGED in the timeline and in
 *    the commentary; no event text says "undefined".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, reviewsLeft, SHOT_TYPES, type CricketState } from '../src/sports/cricket/engine.ts';
import { recStamp, deliveryOrdinals } from '../src/sports/cricket/detail.ts';
import { cricketCommentary } from '../src/sports/cricket/commentary.ts';
import { shotTypeStats, catchAreas, reviewStats } from '../src/sports/cricket/matchStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 5005;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

const NEW_TAPS = new Set(['SHOT', 'BALL_DETAIL', 'REVIEW']);
const OUTCOMES = ['upheld', 'overturned', 'umpires_call', 'maybe'];

function play() {
  const overs = [1, 2, 3, 5][rnd(4)];
  const cfg: Record<string, unknown> = { overs, playersPerSide: 11, wagonWheel: true, reviews: [0, 1, 2, 3][rnd(4)] };
  const log: ScoreAction[] = [];
  let s: CricketState = init(cfg);
  let swaps = 0;
  const go = (a: ScoreAction) => {
    const prev = s;
    log.push(a);
    s = reducer(s, a);
    if (a.type === 'SWAP_STRIKE' && s.events.length > prev.events.length) swaps += 1;
  };
  let n = 0;
  const fresh = (p: string) => `${p}${++n}`;
  const crease = (p: string) => {
    go({ type: 'SET_STRIKER', payload: { id: fresh(p), v: 2 } });
    go({ type: 'SET_NONSTRIKER', payload: { id: fresh(p), v: 2 } });
  };
  const lastDelivery = () => {
    const l = s.log ?? [];
    const ords = deliveryOrdinals(l);
    for (let i = l.length - 1; i >= 0; i--) if (ords[i]) return { r: l[i], d: ords[i] };
    return null;
  };
  for (const [bat, bowl] of [['h', 'a'], ['a', 'h']] as const) {
    crease(bat);
    let bw = 0;
    for (let guard = 0; guard < 80 && !s.ended && s.battingSide === (bat === 'h' ? 'home' : 'away') && s.innings === (bat === 'h' ? 1 : 2); guard++) {
      if (!s.bowlerId) go({ type: 'SET_BOWLER', payload: { id: `${bowl}bw${bw++ % 5}`, v: 2 } });
      if (!s.bowlerId) break;
      const k = rnd(10);
      const base = { strikerId: s.strikerId, bowlerId: s.bowlerId };
      if (k < 6) go({ type: 'RUNS', side: s.battingSide, payload: { ...base, runs: [0, 0, 1, 2, 4, 6][rnd(6)] } });
      else if (k < 8) go({ type: 'WICKET', side: s.battingSide, payload: { ...base, kind: ['caught', 'bowled', 'lbw', 'caught'][rnd(4)], fielderId: `${bowl}f${rnd(3)}`, newBatId: fresh(bat) } });
      else go({ type: 'EXTRA', side: s.battingSide, payload: { ...base, kind: rnd(2) ? 'Wide' : 'No ball', runs: rnd(2) } });
      // optional taps after the ball
      const last = lastDelivery();
      if (last && rnd(3) === 0) {
        const { r } = last;
        const hostile = rnd(8) === 0;
        go({ type: 'SHOT', side: r.side, payload: {
          v: 2, inn: r.inn, side: r.side, at: hostile ? '99.9' : recStamp(r, s.ballsPerOver), batterId: r.strikerId, runs: hostile ? 6 : r.bat,
          shot: hostile && rnd(2) ? 'Scoop' : SHOT_TYPES[rnd(SHOT_TYPES.length)], ...(r.ext === 'nb' ? { nb: true } : {}),
        } });
      }
      if (last && last.r.out?.kind === 'caught' && rnd(2)) {
        go({ type: 'BALL_DETAIL', payload: { v: 2, inn: last.r.inn, side: last.r.side, d: last.d, at: recStamp(last.r, s.ballsPerOver), batterId: last.r.strikerId, cz: 1 + rnd(9), ...(rnd(2) ? { cdeep: true } : {}) } });
      }
      if (rnd(12) === 0) go({ type: 'SWAP_STRIKE', payload: { v: 2 } });
      if (rnd(15) === 0) go({ type: 'SWAP_STRIKE' });
      if (rnd(6) === 0) {
        const side = ['home', 'away', 'nobody'][rnd(3)];
        go({ type: 'REVIEW', side: side as 'home', payload: { v: rnd(10) ? 2 : 1, side, outcome: OUTCOMES[rnd(4)] } });
      }
      if (rnd(60) === 0) go({ type: 'CONCUSSION_SUB', side: s.battingSide, payload: { side: s.battingSide === 'home' ? 'away' : 'home', inId: fresh('x'), outId: `${bowl}f9`, v: 2 } });
    }
    if (!s.ended && s.innings === 1) go({ type: 'END_INNINGS' });
  }
  return { cfg, log, s, swaps };
}

test('600 random matches with the batch-5 taps', () => {
  let reviews = 0, shots = 0, swapped = 0, catches = 0;
  for (let m = 0; m < 600; m++) {
    const { cfg, log, s, swaps } = play();
    // 1. score-neutral
    const plain = log.filter((a) => !NEW_TAPS.has(a.type)).map((a) => (a.type === 'SWAP_STRIKE' ? { type: 'SWAP_STRIKE' } : a)).reduce(reducer, init(cfg));
    for (const k of ['scores', 'batting', 'bowling', 'log', 'dismissals', 'strikerId', 'nonStrikerId', 'ended', 'innings'] as const) {
      assert.deepEqual(s[k], plain[k], `match ${m}: ${k}`);
    }
    // 2. reviews within bounds
    const max = (s.rules?.reviews ?? 0);
    for (const sd of ['home', 'away'] as const) {
      const left = reviewsLeft(s, sd);
      assert.ok(left >= 0 && left <= max, `match ${m}: ${left} of ${max}`);
      for (const inn of [1, 2]) {
        const lost = (s.reviews ?? []).filter((r) => r.side === sd && r.inn === inn && r.outcome === 'upheld').length;
        assert.ok(lost <= max, `match ${m}: lost ${lost} > ${max}`);
      }
    }
    if (!max) assert.equal(s.reviews, undefined);
    const rs = reviewStats(s);
    assert.equal(rs.home.used + rs.away.used, (s.reviews ?? []).length);
    reviews += (s.reviews ?? []).length;
    // 3. shot / catch stats
    for (const sd of ['home', 'away'] as const) {
      const rows = shotTypeStats(s, sd);
      const recs = (s.log ?? []).filter((r) => r.side === sd && !r.cross);
      const wkts = recs.filter((r) => r.out && r.out.kind !== 'retired').length;
      assert.ok(rows.reduce((a, r) => a + r.outs, 0) <= wkts);
      for (const r of rows) {
        assert.ok((SHOT_TYPES as readonly string[]).includes(r.shot));
        assert.ok(r.dots + r.outs <= r.n);
        assert.ok(r.runs <= r.n * 6 + 0);
      }
      shots += rows.reduce((a, r) => a + r.n, 0);
      const c = catchAreas(s, sd);
      assert.equal(c.ring.off + c.ring.leg + c.deep.off + c.deep.leg, c.tagged);
      assert.ok(c.tagged <= c.catches);
      assert.equal(c.catches, recs.filter((r) => r.out?.kind === 'caught').length);
      catches += c.tagged;
    }
    // 4. swaps logged and in the commentary; no broken text
    const changed = s.events.filter((e) => e.label === 'STRIKE CHANGED').length;
    assert.equal(changed, swaps);
    swapped += changed;
    for (const e of s.events) assert.ok(!/\bundefined\b|\bNaN\b/.test(`${e.label} ${e.detail ?? ''}`), `match ${m}: ${e.label} ${e.detail}`);
    const com = cricketCommentary(s, { home: 'H', away: 'A' });
    const texts = com.innings.flatMap((i) => [...i.pre.map((n) => n.text), ...i.overs.flatMap((o) => o.items.map((x) => x.text))]);
    assert.equal(texts.filter((t) => t.startsWith('STRIKE CHANGED')).length, changed, `match ${m}: commentary swaps`);
    assert.equal(texts.filter((t) => t.startsWith('DRS — ')).length, (s.reviews ?? []).length, `match ${m}: commentary reviews`);
  }
  assert.ok(reviews > 100 && shots > 500 && swapped > 100 && catches > 50, `coverage: ${reviews} reviews, ${shots} shots, ${swapped} swaps, ${catches} catches`);
});
