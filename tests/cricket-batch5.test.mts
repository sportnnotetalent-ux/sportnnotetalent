/**
 * Cricket batch 5 (docs/security/breaks/cricket-batch5.md, from the expert
 * audit docs/sport-expert/cricket.md): shot types on a dot ball / dismissal
 * (C2), the catch position in Stats (C3), a logged strike swap (C4), the toss
 * in the commentary (C10), DRS reviews (fix 3) and the Impact / concussion sub
 * marks on the scorecard (C5). Old logs replay byte-identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { init, reducer, reviewsLeft, type CricketState } from '../src/sports/cricket/engine.ts';
import {
  rulesFromConfig, rulesToConfig, patchRules, describeRulesChange, rulesChip, STANDARD_RULES, CRICKET_LIVE_SETTINGS, LOCAL_RULE_FIELDS, LOCAL_RULE_DEFAULTS,
} from '../src/sports/cricket/rules.ts';
import { deliveryOrdinals, recStamp } from '../src/sports/cricket/detail.ts';
import { cricketCommentary, type ComNote } from '../src/sports/cricket/commentary.ts';
import { shotTypeStats, catchAreas, reviewStats } from '../src/sports/cricket/matchStats.ts';
import { subMarks } from '../src/sports/cricket/scorecard.ts';
import { cricketUndoLabel } from '../src/sports/cricket/undo.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { CRICKET_LEGACY_LOGS } from './cricketLegacyLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const UP: NameOf = (id, legacy) => (id ? id.toUpperCase() : legacy ?? 'Player');
const NAMES = { home: 'Home XI', away: 'Away XI' };
const fp = (s: unknown) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 24);

function live(cfg: Record<string, unknown> = {}) {
  let s = [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1' } },
    { type: 'SET_KEEPER', payload: { side: 'home', id: 'h2' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'a2' } },
  ].reduce(reducer, init({ overs: 20, ...cfg }));
  const api = {
    get s() { return s; },
    do(a: ScoreAction) { const prev = s; s = reducer(s, a); return { type: a.type, prev, next: s }; },
    crease(st: string, ns: string, bw: string) {
      api.do({ type: 'SET_STRIKER', payload: { id: st, v: 2 } });
      api.do({ type: 'SET_NONSTRIKER', payload: { id: ns, v: 2 } });
      api.do({ type: 'SET_BOWLER', payload: { id: bw, v: 2 } });
    },
    ball(type: string, payload: Record<string, unknown> = {}) {
      return api.do({ type, side: s.battingSide, payload: { strikerId: s.strikerId, bowlerId: s.bowlerId, ...payload } });
    },
    runs(...rs: number[]) { for (const r of rs) api.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) }); },
    /** tag the last delivery's shot (as the scorer UI does) */
    shot(patch: Record<string, unknown>) {
      const log = s.log ?? [];
      let i = log.length - 1;
      while (i >= 0 && (log[i].sym === undefined || log[i].cross)) i--;
      const r = log[i];
      return api.do({ type: 'SHOT', side: r.side, payload: { v: 2, inn: r.inn, side: r.side, at: recStamp(r, s.ballsPerOver), batterId: r.strikerId, bowlerId: r.bowlerId, runs: r.bat, ...(r.ext === 'nb' ? { nb: true } : {}), ...patch } });
    },
    detail(patch: Record<string, unknown>) {
      const log = s.log ?? [];
      const ords = deliveryOrdinals(log);
      let i = log.length - 1;
      while (i >= 0 && !ords[i]) i--;
      const r = log[i];
      return api.do({ type: 'BALL_DETAIL', payload: { v: 2, inn: r.inn, side: r.side, d: ords[i], at: recStamp(r, s.ballsPerOver), batterId: r.strikerId, bowlerId: r.bowlerId, ...patch } });
    },
  };
  return api;
}
const notes = (s: CricketState): string[] => {
  const c = cricketCommentary(s, NAMES, UP);
  const out: string[] = [];
  for (const inn of c.innings) {
    for (const n of inn.pre) out.push(n.text);
    for (const o of inn.overs) for (const it of o.items) out.push(it.kind === 'note' ? (it as ComNote).text : it.text);
  }
  return out;
};

/* ───────────────────────── C2 — shot types on any ball ───────────────────────── */

describe('C2 — a shot type on a dot ball or a dismissal (B5-1, B5-2, B5-3)', () => {
  test('Defended on a dot ball is stored and reaches the commentary', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(0);
    m.shot({ shot: 'Defended' });
    assert.equal(m.s.shots?.length, 1);
    assert.equal(m.s.shots?.[0].shot, 'Defended');
    assert.equal(m.s.shots?.[0].runs, 0);
    const ball = notes(m.s).find((t) => t.includes('no run'))!;
    assert.match(ball, /no run, defended/);
  });

  test('a shot on a dismissal: "out pulling" in the commentary and dismissals by shot in Stats', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(4); m.shot({ shot: 'Pull', zone: 7 });
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7', newBatId: 'h3' });
    m.shot({ shot: 'Pull' });
    m.runs(0); m.shot({ shot: 'Defended' });
    m.runs(0); m.shot({ shot: 'Defended' });
    m.runs(1); m.shot({ shot: 'Drive', zone: 1 });
    const t = notes(m.s).find((x) => /OUT! Caught/.test(x))!;
    assert.match(t, /pulled/);
    const rows = shotTypeStats(m.s, 'home');
    const pull = rows.find((r) => r.shot === 'Pull')!;
    assert.deepEqual([pull.n, pull.runs, pull.outs, pull.dots], [2, 4, 1, 0]);
    const def = rows.find((r) => r.shot === 'Defended')!;
    assert.deepEqual([def.n, def.runs, def.outs, def.dots], [2, 0, 0, 2]);
    assert.equal(rows.find((r) => r.shot === 'Drive')!.runs, 1);
  });

  test('stats join the tag to its ball: a tag claiming runs the ball never had counts the ball', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(0);
    m.shot({ shot: 'Lofted', runs: 6 });
    const row = shotTypeStats(m.s, 'home').find((r) => r.shot === 'Lofted')!;
    assert.deepEqual([row.runs, row.dots], [0, 1]);
  });

  test('a tag with no matching ball is left out of the shot-type stats', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(2);
    m.do({ type: 'SHOT', side: 'home', payload: { v: 2, inn: 1, side: 'home', at: '7.3', batterId: 'h1', runs: 4, shot: 'Cut' } });
    assert.deepEqual(shotTypeStats(m.s, 'home'), []);
  });

  test('hostile shot values are ignored', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.runs(0);
    const before = m.s;
    m.shot({ shot: 'Scoop' });
    m.shot({ shot: { evil: 1 } });
    m.do({ type: 'SHOT', side: 'home', payload: { inn: 1, side: 'home', at: '0.1', batterId: 'h1', shot: 'Defended' } }); // no v:2
    assert.equal(m.s, before);
  });
});

/* ───────────────────────── C3 — catches by area ───────────────────────── */

describe('C3 — the catch position reaches Stats (B5-4, B5-5)', () => {
  test('catches by area: ring / deep, off / leg; untagged catches counted apart', () => {
    const m = live({ wagonWheel: true });
    m.crease('h1', 'h2', 'a9');
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7', newBatId: 'h3' });
    m.detail({ cz: 8, cdeep: true }); // deep mid-on: leg side
    m.ball('WICKET', { kind: 'caught', fielderId: 'a5', newBatId: 'h4' });
    m.detail({ cz: 3 }); // point, in the ring: off side
    m.ball('WICKET', { kind: 'caught', fielderId: 'a2', newBatId: 'h5' }); // no spot
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h6' });
    m.detail({ cz: 2 }); // a spot on a bowled ball doesn't count
    const c = catchAreas(m.s, 'home');
    assert.deepEqual(c, { catches: 3, tagged: 2, ring: { off: 1, leg: 0 }, deep: { off: 0, leg: 1 } });
    assert.deepEqual(catchAreas(m.s, 'away'), { catches: 0, tagged: 0, ring: { off: 0, leg: 0 }, deep: { off: 0, leg: 0 } });
  });
});

/* ───────────────────────── C4 — strike swap logged ───────────────────────── */

describe('C4 — ⇄ Swap writes an event (B5-6, B5-7, B5-8)', () => {
  test('a v:2 swap after a ball logs "STRIKE CHANGED" and the commentary shows it', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.runs(1);
    const st = m.do({ type: 'SWAP_STRIKE', payload: { v: 2 } });
    assert.equal(m.s.strikerId, 'h1');
    const e = m.s.events[m.s.events.length - 1];
    assert.equal(e.label, 'STRIKE CHANGED');
    assert.equal(e.icon, '⇄');
    m.runs(0);
    assert.ok(notes(m.s).some((t) => /STRIKE CHANGED — H1 on strike/.test(t)), notes(m.s).join('\n'));
    assert.equal(cricketUndoLabel(st, UP), 'STRIKE CHANGED (0.1)');
  });

  test('a legacy swap (no v) stays silent', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.runs(1);
    const n = m.s.events.length;
    m.do({ type: 'SWAP_STRIKE' });
    assert.equal(m.s.events.length, n);
    assert.equal(m.s.strikerId, 'h1');
  });

  test('a v:2 swap during setup (no ball yet) swaps silently; an empty crease does nothing', () => {
    const m = live();
    m.do({ type: 'SET_STRIKER', payload: { id: 'h1', v: 2 } });
    const before = m.s;
    m.do({ type: 'SWAP_STRIKE', payload: { v: 2 } });
    assert.equal(m.s, before, 'one end empty: nothing to swap');
    m.do({ type: 'SET_NONSTRIKER', payload: { id: 'h2', v: 2 } });
    const n = m.s.events.length;
    m.do({ type: 'SWAP_STRIKE', payload: { v: 2 } });
    assert.equal(m.s.strikerId, 'h2');
    assert.equal(m.s.events.length, n);
  });
});

/* ───────────────────────── C10 — toss in commentary ───────────────────────── */

describe('C10 — the toss opens the commentary (B5-9)', () => {
  test('"Away XI won the toss and elected to bowl" before the first ball', () => {
    const m = live();
    m.do({ type: 'SET_TOSS', payload: { winner: 'away', decision: 'bowl' } });
    const before = cricketCommentary(m.s, NAMES, UP);
    assert.ok(before.innings[0]?.pre.some((n) => n.text === 'Away XI won the toss and elected to bowl'));
    m.crease('h1', 'h2', 'a9');
    m.runs(1);
    const c = cricketCommentary(m.s, NAMES, UP);
    const first = c.innings[c.innings.length - 1];
    assert.equal(first.side, 'home');
    assert.equal(first.pre[0].text, 'Away XI won the toss and elected to bowl');
    assert.equal(first.pre[0].icon, '🪙');
  });

  test('no toss, no note; the toss changes no state', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.runs(1);
    assert.ok(!notes(m.s).some((t) => /toss/.test(t)));
    const t = live();
    const ev = t.s.events.length;
    t.do({ type: 'SET_TOSS', payload: { winner: 'home', decision: 'bat' } });
    assert.equal(t.s.events.length, ev);
  });
});

/* ───────────────────────── DRS ───────────────────────── */

describe('DRS — optional reviews (B5-10 … B5-13)', () => {
  test('rules: reviews present only when set; Info lists it; off by default', () => {
    assert.equal(rulesFromConfig({}).reviews, undefined);
    assert.equal(rulesFromConfig({ reviews: 0 }).reviews, undefined);
    assert.equal(rulesFromConfig({ reviews: 2 }).reviews, 2);
    assert.equal(rulesFromConfig({ reviews: 99 }).reviews, 5);
    assert.equal(rulesFromConfig({ reviews: 'x' }).reviews, undefined);
    assert.deepEqual(rulesFromConfig(rulesToConfig(rulesFromConfig({ reviews: 3 }))), rulesFromConfig({ reviews: 3 }));
    // defaults-on DOK2: the new-match defaults are the standard playing rules plus the four captures on
    assert.deepEqual(rulesFromConfig({ ...LOCAL_RULE_DEFAULTS }), { ...STANDARD_RULES, wagonWheel: true, pitchMap: true, bowlerType: true, extraWhy: true });
    assert.equal(describeRulesChange(STANDARD_RULES, patchRules(STANDARD_RULES, { reviews: 2 })), 'DRS: 2 reviews per innings');
    assert.equal(rulesChip(rulesFromConfig({ reviews: 2 })), 'DRS 2');
    const f = LOCAL_RULE_FIELDS.find((x) => x.key === 'reviews');
    assert.ok(f, 'a Match rules field');
    const off = matchCaptures(CRICKET_LIVE_SETTINGS as never, init({ overs: 20 }));
    assert.equal(off.rules.find((r) => r.key === 'reviews')?.value, 'Off');
    const on = matchCaptures(CRICKET_LIVE_SETTINGS as never, init({ overs: 20, reviews: 2 }));
    assert.equal(on.rules.find((r) => r.key === 'reviews')?.value, '2 per innings');
  });

  test('upheld loses a review; overturned and umpire’s call keep it; resets each innings', () => {
    const m = live({ overs: 2, reviews: 2 });
    m.crease('h1', 'h2', 'a9');
    assert.equal(reviewsLeft(m.s, 'home'), 2);
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'upheld' } });
    assert.equal(reviewsLeft(m.s, 'away'), 1);
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'umpires_call' } });
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'home', outcome: 'overturned', batterId: 'h1' } });
    assert.equal(reviewsLeft(m.s, 'away'), 1);
    assert.equal(reviewsLeft(m.s, 'home'), 2);
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'upheld' } });
    assert.equal(reviewsLeft(m.s, 'away'), 0);
    const before = m.s;
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'overturned' } });
    assert.equal(m.s, before, 'none left: refused');
    const e = m.s.events[m.s.events.length - 1];
    assert.equal(e.label, 'DRS REVIEW');
    assert.equal(e.detail, 'Not-out decision stands — review lost · 0 left');
    assert.equal(m.s.reviews?.length, 4);
    // score-neutral
    assert.equal(m.s.scores.home.runs, 0);
    // stats
    const rs = reviewStats(m.s);
    assert.deepEqual(rs.away, { used: 3, lost: 2, overturned: 0, upheld: 2, umpiresCall: 1 });
    assert.deepEqual(rs.home, { used: 1, lost: 0, overturned: 1, upheld: 0, umpiresCall: 0 });
    // commentary
    m.runs(1);
    assert.ok(notes(m.s).some((t) => t === 'DRS — Away XI: Not-out decision stands — review lost · 1 left'), notes(m.s).join('\n'));
    assert.ok(notes(m.s).some((t) => t === 'DRS — Home XI: Out decision overturned — review retained · 2 left'));
    // the next innings: a fresh count
    m.do({ type: 'END_INNINGS' });
    assert.equal(reviewsLeft(m.s, 'away'), 2);
  });

  test('hostile reviews change nothing', () => {
    const off = live();
    off.crease('h1', 'h2', 'a9');
    const b0 = off.s;
    off.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'upheld' } });
    assert.equal(off.s, b0, 'setting off');
    const m = live({ reviews: 2 });
    m.crease('h1', 'h2', 'a9');
    const b = m.s;
    for (const p of [
      { side: 'away', outcome: 'upheld' }, // no v:2
      { v: 2, side: 'nobody', outcome: 'upheld' },
      { v: 2, side: 'away', outcome: 'maybe' },
      { v: 2, side: 'away' },
      { v: 2, side: { x: 1 }, outcome: 'upheld' },
      null,
    ]) m.do({ type: 'REVIEW', payload: p as never });
    assert.equal(m.s, b);
    m.do({ type: 'END' });
    const e = m.s;
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'away', outcome: 'upheld' } });
    assert.equal(m.s, e, 'after the end');
  });

  test('a hostile batterId is kept only as text, capped', () => {
    const m = live({ reviews: 2 });
    m.crease('h1', 'h2', 'a9');
    m.do({ type: 'REVIEW', payload: { v: 2, side: 'home', outcome: 'overturned', batterId: { evil: 1 } } });
    assert.equal(m.s.reviews?.[0].batterId, undefined);
  });
});

/* ───────────────────────── C5 — sub marks ───────────────────────── */

describe('C5 — Impact / concussion subs marked on the scorecard (B5-14, B5-15)', () => {
  test('impact in ⚡; a v:2 concussion sub is recorded and marked', () => {
    const m = live({ impactPlayer: true });
    m.crease('h1', 'h2', 'a9');
    m.do({ type: 'IMPACT_SUB', side: 'home', payload: { side: 'home', inId: 'h12', outId: 'h11', v: 2 } });
    m.do({ type: 'CONCUSSION_SUB', side: 'away', payload: { side: 'away', inId: 'a12', outId: 'a4', v: 2 } });
    assert.deepEqual(m.s.concussionSubs, [{ side: 'away', inId: 'a12', outId: 'a4' }]);
    assert.deepEqual(subMarks(m.s, 'home'), { h12: ' ⚡' });
    assert.deepEqual(subMarks(m.s, 'away'), { a12: ' (concussion sub)' });
  });

  test('a legacy concussion sub (no v) keeps its old shape', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.do({ type: 'CONCUSSION_SUB', side: 'away', payload: { side: 'away', inId: 'a12', outId: 'a4' } });
    assert.equal('concussionSubs' in m.s, false);
    assert.deepEqual(subMarks(m.s, 'away'), {});
  });

  test('a v:2 concussion sub without an incoming id records nothing new', () => {
    const m = live();
    m.crease('h1', 'h2', 'a9');
    m.do({ type: 'CONCUSSION_SUB', side: 'away', payload: { side: 'away', outId: 'a4', v: 2 } });
    assert.equal('concussionSubs' in m.s, false);
  });
});

/* ───────────────────────── Old logs ───────────────────────── */

describe('old logs replay identically', () => {
  for (const L of CRICKET_LEGACY_LOGS) {
    test(L.name, () => {
      const s = L.actions.reduce(reducer, init(L.config));
      assert.equal(fp(s), L.fp);
      assert.equal(s.reviews, undefined);
      assert.equal(s.concussionSubs, undefined);
    });
  }
});
