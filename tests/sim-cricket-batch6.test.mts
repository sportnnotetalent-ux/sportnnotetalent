/**
 * Cricket batch 6 simulation (docs/security/breaks/cricket-batch6.md): 600
 * random matches (two innings each, 1 200 innings) scored ball by ball with
 * the new rules and taps mixed in at random — last man stands on / off,
 * substitutes, v:2 wickets of every kind (some on a free hit), v:2 sub flags
 * (some hostile), one-short runs, lone bouncer tags, rain cuts. Invariants:
 *  - R6: no v:2 bowled / caught / lbw / stumped / hit wicket is ever recorded
 *    on a free hit; legacy (no v) wickets are never refused for it;
 *  - R8: an innings never has more wickets than allOutAt; under last man
 *    stands the lone batter is always on strike with the other end empty, and
 *    the innings only ends at the true all out (or the overs / target);
 *    without the rule nothing changes (the same log with the rule key stripped
 *    from a no-rule match gives the same state);
 *  - C6: a dismissal reads "sub (" exactly when its record says sub, and only
 *    in a match with substitutes;
 *  - C11 / R7: the powerplay is never longer than the innings nor the format's,
 *    its bands are contiguous from ball 0 and never overlap;
 *  - C9: a lone bouncer tag never makes a pitch map in Stats;
 *  - no timeline text says "undefined" / "NaN".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, allOutAt, lastManAlone, canFallOnFreeHit, type CricketState, type DismissalKind } from '../src/sports/cricket/engine.ts';
import { recStamp, deliveryOrdinals } from '../src/sports/cricket/detail.ts';
import { powerplayBalls, powerplayBands } from '../src/sports/cricket/phases.ts';
import { teamBatting } from '../src/sports/cricket/matchStats.ts';
import { cricketCommentary } from '../src/sports/cricket/commentary.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 6006;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };

const KINDS: DismissalKind[] = ['bowled', 'caught', 'lbw', 'stumped', 'hitwicket', 'runout', 'hittwice', 'obstruct', 'mankad', 'retiredout'];

function play() {
  const players = [2, 3, 4, 6, 11][rnd(5)];
  const cfg: Record<string, unknown> = {
    overs: [1, 2, 3, 5, 20][rnd(5)], playersPerSide: players, dls: true,
    powerplayOvers: [0, 1, 2, 6][rnd(4)],
    ...(rnd(2) ? { lastManStands: true } : {}),
    ...(rnd(2) ? { substitutes: 1 + rnd(3) } : {}),
    ...(rnd(3) === 0 ? { bouncerMax: 1 + rnd(2) } : {}),
  };
  const log: ScoreAction[] = [];
  let s: CricketState = init(cfg);
  const stats = { fhRefused: 0, fhLegacyKept: 0, alone: 0, subs: 0, shorts: 0, cuts: 0 };
  const go = (a: ScoreAction) => {
    const prev = s;
    log.push(a);
    s = reducer(s, a);
    const live = prev.superOver && !prev.superOver.state.ended ? prev.superOver.state : prev;
    const isWkt = a.type === 'WICKET' || (a.type === 'EXTRA' && !!a.payload?.wicket);
    if (isWkt && live.freeHit && !live.ended) {
      const kind = String(a.type === 'EXTRA' ? a.payload?.wicket : a.payload?.kind) as DismissalKind;
      if (a.payload?.v === 2 && !canFallOnFreeHit(kind)) {
        assert.equal(s, prev, `a v:2 ${kind} on a free hit must be refused`);
        stats.fhRefused += 1;
      } else if (a.payload?.v !== 2 && !canFallOnFreeHit(kind) && s !== prev && s.dismissals.length > prev.dismissals.length) {
        stats.fhLegacyKept += 1;
      }
    }
  };
  for (const [bat, bowl] of [['h', 'a'], ['a', 'h']] as const) {
    const side = bat === 'h' ? 'home' : 'away';
    let used = 0;
    // the next batter in (taken only once an action actually sent them in)
    const fresh = () => (used < players ? `${bat}${used + 1}` : undefined);
    const settleUsed = () => { while (used < players && s.batting[`${bat}${used + 1}`]) used += 1; };
    const st = `${bat}1`; const ns = players > 1 ? `${bat}2` : undefined;
    if (st) go({ type: 'SET_STRIKER', payload: { id: st, v: 2 } });
    if (ns) go({ type: 'SET_NONSTRIKER', payload: { id: ns, v: 2 } });
    settleUsed();
    let bw = 0;
    for (let guard = 0; guard < 200 && !s.ended && s.battingSide === side && s.innings === (bat === 'h' ? 1 : 2); guard++) {
      if (!s.bowlerId) go({ type: 'SET_BOWLER', payload: { id: `${bowl}bw${bw++ % 5}`, v: 2 } });
      if (!s.bowlerId) break;
      if (!s.strikerId && !s.nonStrikerId) break;
      const base = { strikerId: s.strikerId, bowlerId: s.bowlerId };
      const k = rnd(14);
      const v = rnd(4) ? { v: 2 } : {};
      const sub = rnd(3) === 0 ? { sub: rnd(5) ? true : 'yes' } : {};
      if (k < 6) {
        const short = rnd(8) === 0;
        go({ type: 'RUNS', side: s.battingSide, payload: { ...base, runs: [0, 0, 1, 2, 3, 4, 6][rnd(7)], ...(short ? { short: true, v: 2 } : {}) } });
      } else if (k < 9) {
        const kind = KINDS[rnd(KINDS.length)];
        go({ type: 'WICKET', side: s.battingSide, payload: { ...base, ...v, ...sub, kind, fielderId: `${bowl}f${rnd(4)}`, batterOut: rnd(3) ? 'striker' : 'nonstriker', runs: rnd(2), end: rnd(2) ? 'striker' : 'bowler', newBatId: fresh() } });
      } else if (k < 12) {
        const wide = rnd(2) === 0;
        const wk = rnd(4) === 0 ? { wicket: (wide ? ['stumped', 'runout', 'hitwicket'] : ['runout', 'hittwice'])[rnd(wide ? 3 : 2)], fielderId: `${bowl}f1`, newBatId: fresh(), ...v } : {};
        go({ type: 'EXTRA', side: s.battingSide, payload: { ...base, kind: wide ? 'Wide' : 'No ball', runs: rnd(2), ...wk } });
      } else if (k === 12) {
        if (rnd(3) === 0) { go({ type: 'RAIN', payload: { v: 2, overs: 1 + rnd(Math.max(1, s.oversLimit)) } }); stats.cuts += 1; }
        else go({ type: 'SWAP_STRIKE', payload: rnd(2) ? { v: 2 } : {} });
      } else {
        // an optional lone bouncer tag on the last delivery
        const l = s.log ?? [];
        const ords = deliveryOrdinals(l);
        let i = l.length - 1;
        while (i >= 0 && !ords[i]) i--;
        if (i >= 0) go({ type: 'BALL_DETAIL', payload: { v: 2, inn: l[i].inn, side: l[i].side, d: ords[i], at: recStamp(l[i], s.ballsPerOver), len: 'bouncer' } });
      }
      settleUsed();
      // R8 invariants after every action
      const cur = s.scores[side];
      assert.ok(cur.wickets <= allOutAt(s), `wickets ${cur.wickets} > ${allOutAt(s)}`);
      if (!s.ended && s.battingSide === side && lastManAlone(s)) {
        stats.alone += 1;
        assert.equal(s.nonStrikerId, undefined, 'the other end is empty');
        assert.ok(s.strikerId, 'the lone batter is on strike');
        assert.ok(!s.batting[s.strikerId!]?.out, 'and not out');
      }
      if (!s.rules?.lastManStands && s.battingSide === side && s.innings === (bat === 'h' ? 1 : 2) && !s.ended && !s.pendingTie && !s.superOver) {
        assert.ok(cur.wickets < s.wicketsLimit, 'without the rule players − 1 wickets end it');
      }
    }
    if (!s.ended && s.innings === 1) go({ type: 'END_INNINGS' });
  }
  return { cfg, log, s, stats };
}

test('600 random matches (1 200 innings) with the batch-6 rules and taps', () => {
  const tot = { fhRefused: 0, fhLegacyKept: 0, alone: 0, subs: 0, shorts: 0, cuts: 0, lms: 0 };
  for (let m = 0; m < 600; m++) {
    const { cfg, log, s, stats } = play();
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) tot[k] += stats[k];
    if (cfg.lastManStands) tot.lms += 1;
    // R8 — without the rule, an explicit "off" changes nothing
    if (!cfg.lastManStands) {
      const off = log.reduce(reducer, init({ ...cfg, lastManStands: false }));
      assert.deepEqual(off, s, `match ${m}: lastManStands:false is the same as absent`);
    }
    // C6 — sub marks
    for (const d of s.dismissals) {
      const text = d.outId ? s.batting[d.outId]?.dismissal ?? '' : '';
      if (d.sub) { tot.subs += 1; assert.ok(cfg.substitutes, `match ${m}: a sub mark without substitutes`); }
      assert.equal(/sub \(/.test(text), !!d.sub, `match ${m}: "${text}" vs sub=${d.sub}`);
    }
    // fix 13 — one short
    tot.shorts += (s.log ?? []).filter((r) => r.short).length;
    for (const r of s.log ?? []) if (r.short) assert.ok(r.bat !== 4 && r.bat !== 6, `match ${m}: a boundary is never one short`);
    // C11 / R7 — the powerplay
    for (const inn of [1, 2] as const) {
      const pp = powerplayBalls(s, inn);
      const full = s.hundred ? 25 : s.powerplayOvers * s.ballsPerOver;
      assert.ok(pp >= 0 && pp <= full, `match ${m}: pp ${pp} vs ${full}`);
      const bands = powerplayBands(s, inn);
      let at = 0;
      for (const b of bands) { assert.equal(b.from, at, `match ${m}: bands contiguous`); assert.ok(b.to > b.from); at = b.to; }
      if (bands.length) assert.equal(bands[0].to, pp);
    }
    // C9 — a lone bouncer tag (no pitch map) is never a pitch map
    for (const sd of ['home', 'away'] as const) assert.equal(teamBatting(s, sd).pitch, null, `match ${m}: pitch map from bouncer tags`);
    // text
    for (const e of s.events) assert.ok(!/\bundefined\b|\bNaN\b/.test(`${e.label} ${e.detail ?? ''}`), `match ${m}: ${e.label} ${e.detail}`);
    const com = cricketCommentary(s, { home: 'H', away: 'A' });
    const texts = com.innings.flatMap((i) => [...i.pre.map((n) => n.text), ...i.overs.flatMap((o) => o.items.map((x) => x.text))]);
    for (const t of texts) assert.ok(!/\bundefined\b|\bNaN\b/.test(t), `match ${m}: ${t}`);
    assert.equal(texts.filter((t) => /one short/.test(t)).length, (s.log ?? []).filter((r) => r.short).length, `match ${m}: one short in the commentary`);
  }
  // the simulation reached every path
  assert.ok(tot.fhRefused > 0, 'free-hit refusals exercised');
  assert.ok(tot.fhLegacyKept > 0, 'legacy free-hit wickets kept');
  assert.ok(tot.alone > 0, 'last man batted alone');
  assert.ok(tot.subs > 0, 'sub catches marked');
  assert.ok(tot.shorts > 0, 'one-short runs');
  assert.ok(tot.cuts > 0, 'rain cuts');
  assert.ok(tot.lms > 200, 'last man stands in many matches');
});
