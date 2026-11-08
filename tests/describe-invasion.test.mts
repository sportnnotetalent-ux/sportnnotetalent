/**
 * Wave 2, invasion family (docs/security/breaks/describe-invasion.md): the
 * goal / try is on the board at the scorer's tap; the assist, second assist,
 * strength, empty net and on-ice players are attached after (GOAL_DETAIL /
 * TRY_DETAIL with the goal's ref; football: ASSIST with ref) and described on a
 * DescribeCard. An assist attached after must equal the old in-flow assist:
 * state, statTotals and the live stat lines.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ScoreAction } from '../src/sports/types.ts';
import { creditDiff } from '../src/sports/invasion/goalDetail.ts';
import * as H from '../src/sports/hockey/engine.ts';
import { hockeyTotals, DERIVED_KEYS as H_DERIVED } from '../src/sports/hockey/totals.ts';
import { hockeyUndoLabel } from '../src/sports/hockey/undoLabel.ts';
import * as I from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyTotals, DERIVED_KEYS as I_DERIVED } from '../src/sports/ice_hockey/totals.ts';
import * as R from '../src/sports/rugby/engine.ts';
import { rugbyTotals, DERIVED_KEYS as R_DERIVED } from '../src/sports/rugby/totals.ts';
import { rugbyUndoLabel } from '../src/sports/rugby/timeline.ts';
import * as L from '../src/sports/rugby_league/engine.ts';
import { leagueTotals, DERIVED_KEYS as L_DERIVED } from '../src/sports/rugby_league/totals.ts';
import { leagueUndoLabel } from '../src/sports/rugby_league/timeline.ts';
import * as F from '../src/sports/football/engine.ts';
import { goalAction, assistAction, undoGoalAction } from '../src/sports/football/actions.ts';
import { footballGoalSummary } from '../src/sports/invasion/goalDetail.ts';
import { toRecords, liveSums, contractErrors, replay, type TotalsSport } from './statTotalsHarness.mts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, acts: ScoreAction[]) => acts.reduce(r, s);
const nameOf = (id?: string, legacy?: string) => legacy ?? (id ? id.toUpperCase() : 'Player');

/* ------------------------------ the engines ------------------------------ */

type Draft = { side: 'home' | 'away'; uid: string; scorer?: string; a1?: string; a2?: string; strength?: 'ev' | 'pp' | 'sh'; en?: boolean; onIce?: { home: string[]; away: string[] }; bonus?: boolean };

/** One sport, as the controls drive it: the old one-shot GOAL / TRY, the new
 *  score-on-tap action and the detail builder. */
interface Sp<S> {
  name: string;
  init: () => S;
  reducer: (s: S, a: ScoreAction) => S;
  totals: (s: S) => Record<string, { side: 'home' | 'away'; stats: Record<string, number> }>;
  derived: readonly string[];
  /** the old flow: everything in the GOAL / TRY (and ice hockey's ASSIST2) */
  old: (d: Draft, i: number) => ScoreAction[];
  /** the new flow: the goal / try alone (the scorer tap) */
  score: (d: Draft, i: number) => ScoreAction;
  /** the details, attached later, one step each */
  details: (s: S, d: Draft) => (ScoreAction | null)[];
  detail: (s: S, ref: string, patch: Record<string, unknown>) => ScoreAction | null;
  undoLabel?: (step: { type: string; prev: unknown; next: unknown }) => string | null;
  multi?: boolean;
}

const stamp = (d: Draft, i: number) => ({ uid: d.uid, sec: 60 * (i + 1), psec: 60 * (i + 1), period: 1, at: 0 });

const hockey: Sp<H.HockeyState> = {
  name: 'hockey', init: () => H.init({}), reducer: H.reducer, totals: hockeyTotals, derived: H_DERIVED,
  old: (d, i) => {
    const cr = H.eventCredits({ type: 'goal', goalType: 'field', playerId: d.scorer, secondId: d.a1 });
    return [{ type: 'GOAL', side: d.side, payload: { goalType: 'field', ...stamp(d, i) }, attribution: H.creditAttribution(cr.first, 1), attribution2: H.creditAttribution(cr.second, 1) }];
  },
  score: (d, i) => {
    const cr = H.eventCredits({ type: 'goal', goalType: 'field', playerId: d.scorer });
    return { type: 'GOAL', side: d.side, payload: { goalType: 'field', ...stamp(d, i) }, attribution: H.creditAttribution(cr.first, 1) };
  },
  details: (s, d) => (d.a1 ? [H.goalDetailAction(s, d.uid, { a1: d.a1 })] : []),
  detail: (s, ref, p) => H.goalDetailAction(s, ref, p),
  undoLabel: (st) => hockeyUndoLabel(st, nameOf),
};

const ice: Sp<I.IceHockeyState> = {
  name: 'ice hockey', init: () => I.init({ plusMinus: true }), reducer: I.reducer, totals: iceHockeyTotals, derived: I_DERIVED, multi: true,
  old: (d, i) => {
    const strength = d.strength ?? 'ev';
    const cr = I.eventCredits({ type: 'goal', side: d.side, playerId: d.scorer, secondId: d.a1, strength, en: d.en });
    const out: ScoreAction[] = [{ type: 'GOAL', side: d.side, payload: { ...stamp(d, i), strength, ...(d.en ? { en: true } : {}), ...(d.onIce ? { onIce: d.onIce } : {}) }, attribution: I.creditAttribution(cr.first, 1), attribution2: I.creditAttribution(cr.second, 1) }];
    if (d.a1 && d.a2) out.push({ type: 'ASSIST2', side: d.side, payload: { ref: d.uid }, attribution: I.creditAttribution(I.eventCredits({ type: 'goal', side: d.side, thirdId: d.a2 }).third, 1) });
    return out;
  },
  // the scorer tap: strength / EN picked before it (defining), the rest after
  score: (d, i) => {
    const cr = I.eventCredits({ type: 'goal', side: d.side, playerId: d.scorer, strength: 'ev' });
    return { type: 'GOAL', side: d.side, payload: { ...stamp(d, i), strength: 'ev' }, attribution: I.creditAttribution(cr.first, 1) };
  },
  details: (s0, d) => {
    const out: (ScoreAction | null)[] = [];
    let s = s0;
    const step = (p: Record<string, unknown>) => { const a = I.goalDetailAction(s, d.uid, p); out.push(a); if (a) s = I.reducer(s, a); };
    if (d.strength && d.strength !== 'ev') step({ strength: d.strength });
    if (d.en) step({ en: true });
    if (d.a1) step({ a1: d.a1 });
    if (d.a1 && d.a2) step({ a2: d.a2 });
    if (d.onIce) step({ onIce: d.onIce });
    return out;
  },
  detail: (s, ref, p) => I.goalDetailAction(s, ref, p),
};

const union: Sp<R.RugbyState> = {
  name: 'rugby union', init: () => R.init({}), reducer: R.reducer, totals: rugbyTotals, derived: R_DERIVED,
  old: (d, i) => {
    const cr = R.eventCredits({ type: 'try', playerId: d.scorer, secondId: d.a1 });
    return [{ type: 'TRY', side: d.side, payload: stamp(d, i), attribution: R.creditAttribution(cr.first, 1), attribution2: R.creditAttribution(cr.second, 1) }];
  },
  score: (d, i) => {
    const cr = R.eventCredits({ type: 'try', playerId: d.scorer });
    return { type: 'TRY', side: d.side, payload: stamp(d, i), attribution: R.creditAttribution(cr.first, 1) };
  },
  details: (s, d) => (d.a1 ? [R.tryDetailAction(s, d.uid, { a1: d.a1 })] : []),
  detail: (s, ref, p) => R.tryDetailAction(s, ref, p),
  undoLabel: (st) => rugbyUndoLabel(st, nameOf),
};

const league: Sp<L.LeagueState> = {
  name: 'rugby league', init: () => L.init({ bonusTry: true }), reducer: L.reducer, totals: leagueTotals, derived: L_DERIVED,
  old: (d, i) => {
    const cr = L.eventCredits({ type: 'try', bonus: d.bonus, playerId: d.scorer, secondId: d.a1 });
    return [{ type: 'TRY', side: d.side, payload: { ...stamp(d, i), ...(d.bonus ? { bonus: true } : {}) }, attribution: L.creditAttribution(cr.first, 1), attribution2: L.creditAttribution(cr.second, 1) }];
  },
  score: (d, i) => {
    const cr = L.eventCredits({ type: 'try', bonus: d.bonus, playerId: d.scorer });
    return { type: 'TRY', side: d.side, payload: { ...stamp(d, i), ...(d.bonus ? { bonus: true } : {}) }, attribution: L.creditAttribution(cr.first, 1) };
  },
  details: (s, d) => (d.a1 ? [L.tryDetailAction(s, d.uid, { a1: d.a1 })] : []),
  detail: (s, ref, p) => L.tryDetailAction(s, ref, p),
  undoLabel: (st) => leagueUndoLabel(st, nameOf),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SPORTS: Sp<any>[] = [hockey, ice, union, league];
const harness = <S,>(sp: Sp<S>): TotalsSport<S> => ({ name: sp.name, init: sp.init, reducer: sp.reducer, statTotals: sp.totals, derived: sp.derived, signed: ['plusMinus'] });

const scoreOf = (s: { home: number; away: number }) => `${s.home}-${s.away}`;

test('creditDiff: per-player difference, nothing for no change', () => {
  const a = { playerId: 'a', stats: { assists: 1, points: 1 } };
  const b = { playerId: 'b', stats: { assists: 1, points: 1 } };
  assert.deepEqual(creditDiff([a], [a]), []);
  assert.deepEqual(creditDiff([undefined], [b], ['assists']), [{ playerId: 'b', stat: 'assists', by: 1, extra: { points: 1 }, tracked: ['assists'] }]);
  assert.deepEqual(creditDiff([a], [b]), [{ playerId: 'a', stat: 'assists', by: -1, extra: { points: -1 } }, { playerId: 'b', stat: 'assists', by: 1, extra: { points: 1 } }]);
});

for (const sp of SPORTS) {
  describe(sp.name, () => {
    test('DI1/DI2/DI8: score at the tap + the assist after = the old one-shot goal (state, totals, live lines)', () => {
      const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9', a1: 'h7', ...(sp.multi ? { a2: 'h5', strength: 'pp', onIce: { home: ['h9', 'h7', 'h5'], away: ['a1'] } } : {}) };
      const oldActs = sp.old(d, 0);
      const s1 = sp.reducer(sp.init(), sp.score(d, 0));
      assert.equal(scoreOf(s1), sp.name.startsWith('rugby') ? (sp === league ? '4-0' : '5-0') : '1-0', 'on the board at the tap');
      const det = sp.details(s1, d);
      assert.ok(det.every(Boolean), 'every detail builds');
      const newActs = [sp.score(d, 0), ...(det as ScoreAction[])];
      const sOld = run(sp.reducer, sp.init(), oldActs);
      const sNew = run(sp.reducer, sp.init(), newActs);
      assert.deepEqual(sNew, sOld);
      assert.deepEqual(sp.totals(sNew), sp.totals(sOld));
      assert.deepEqual(liveSums(toRecords(newActs)), liveSums(toRecords(oldActs)));
      assert.deepEqual(contractErrors(harness(sp), sp.totals(sNew), liveSums(toRecords(newActs))), []);
    });

    test('DI3: change the assister (A → B), then clear it — one step each, the lines follow', () => {
      const d: Draft = { side: 'away', uid: 'g1', scorer: 'a9' };
      const acts: ScoreAction[] = [sp.score(d, 0)];
      let s = sp.reducer(sp.init(), acts[0]);
      for (const p of [{ a1: 'a7' }, { a1: 'a6' }, { a1: null }, { a1: 'a6' }]) {
        const a = sp.detail(s, 'g1', p);
        assert.ok(a, JSON.stringify(p));
        acts.push(a!); s = sp.reducer(s, a!);
        assert.deepEqual(contractErrors(harness(sp), sp.totals(s), liveSums(toRecords(acts))), [], JSON.stringify(p));
      }
      const live = liveSums(toRecords(acts));
      assert.equal(live.a7?.assists ?? live.a7?.tryAssists ?? 0, 0);
      assert.equal(live.a6?.assists ?? live.a6?.tryAssists, 1);
      assert.equal(sp.detail(s, 'g1', { a1: 'a6' }), null, 'no change = no step');
    });

    test('DI5/DI6: two quick goals — the detail goes to the goal it names, not the latest', () => {
      const g1: Draft = { side: 'home', uid: 'g1', scorer: 'h9' }, g2: Draft = { side: 'home', uid: 'g2', scorer: 'h8' };
      let s = run(sp.reducer, sp.init(), [sp.score(g1, 0), sp.score(g2, 1)]);
      s = sp.reducer(s, sp.detail(s, 'g1', { a1: 'h7' })!);
      const ev = (id: string) => s.events.find((e: { id: string }) => e.id === id);
      assert.equal(ev('g1').secondId, 'h7');
      assert.equal(ev('g2').secondId, undefined);
    });

    test('DI4: undo of a goal with its later assist — every prefix is consistent; a stale ref does nothing', () => {
      const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9' };
      const s1 = sp.reducer(sp.init(), sp.score(d, 0));
      const det = sp.detail(s1, 'g1', { a1: 'h7' })!;
      const acts = [sp.score(d, 0), det];
      for (let n = acts.length; n >= 0; n--) {
        const pre = acts.slice(0, n);
        const st = run(sp.reducer, sp.init(), pre);
        assert.deepEqual(contractErrors(harness(sp), sp.totals(st), liveSums(toRecords(pre))), [], `prefix ${n}`);
      }
      // the goal undone, then a stale card's tap: nothing moves
      const empty = sp.init();
      assert.deepEqual(sp.reducer(empty, det), empty);
      assert.equal(sp.detail(empty, 'g1', { a1: 'h7' }), null);
    });

    test('DI12: a hostile detail is ignored (scorer as assister, other side, junk)', () => {
      const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9' };
      const s = sp.reducer(sp.init(), sp.score(d, 0));
      assert.equal(sp.detail(s, 'g1', { a1: 'h9' }), null, 'the scorer');
      assert.equal(sp.detail(s, 'g1', { a1: 42 }), null, 'not an id');
      const forged: ScoreAction = { type: sp === union || sp === league ? 'TRY_DETAIL' : 'GOAL_DETAIL', side: 'away', payload: { ref: 'g1', a1: 'a7' } };
      assert.deepEqual(sp.reducer(s, forged), s, 'other side');
      assert.deepEqual(sp.reducer(s, { ...forged, side: 'home', payload: { ref: 'g1', a1: 'h9' } }), s, 'the scorer, forged');
    });

    test('DI11: the detail is still taken after full time (a sudden-death winner ends the match)', () => {
      const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9' };
      let s = run(sp.reducer, sp.init(), [sp.score(d, 0), { type: 'END', payload: { at: 0 } }]);
      assert.equal(s.ended, true);
      s = sp.reducer(s, sp.detail(s, 'g1', { a1: 'h7' })!);
      assert.equal(s.events.find((e: { id: string }) => e.id === 'g1').secondId, 'h7');
    });

    if (sp.undoLabel) {
      test('DI4: Undo names the assist step', () => {
        const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9' };
        const prev = sp.reducer(sp.init(), sp.score(d, 0));
        const a = sp.detail(prev, 'g1', { a1: 'h7' })!;
        const label = sp.undoLabel!({ type: a.type, prev, next: sp.reducer(prev, a) });
        assert.match(label ?? '', /^assist · H7$/);
      });
    }
  });
}

describe('ice hockey extras', () => {
  test('DI12: a penalty-shot goal takes no assist; a junk strength is ignored', () => {
    const s = I.reducer(I.init({}), { type: 'GOAL', side: 'home', payload: { uid: 'p1', ps: true, sec: 10, period: 1 }, attribution: { playerId: 'h9', stat: 'goals' } });
    assert.equal(I.goalDetailAction(s, 'p1', { a1: 'h7' }), null);
    const s2 = I.reducer(I.init({}), ice.score({ side: 'home', uid: 'g1', scorer: 'h9' }, 0));
    assert.equal(I.goalDetailAction(s2, 'g1', { strength: 'xx' }), null);
    assert.equal(I.goalDetailAction(s2, 'g1', { a2: 'h7' }), null, 'a second assist needs a first');
  });
  test('DI2: strength / empty net after the tap re-credit the scorer exactly', () => {
    const s = I.reducer(I.init({}), ice.score({ side: 'home', uid: 'g1', scorer: 'h9' }, 0));
    const a = I.goalDetailAction(s, 'g1', { strength: 'sh' })!;
    assert.deepEqual(a.attribution, { playerId: 'h9', stat: 'shGoals', by: 1 });
    const b = I.goalDetailAction(I.reducer(s, a), 'g1', { strength: 'pp' })!;
    assert.deepEqual(b.attribution, { playerId: 'h9', stat: 'shGoals', by: -1, extra: { ppGoals: 1 } });
  });
  test('DI8: an old log with ASSIST2 still replays', () => {
    const d: Draft = { side: 'home', uid: 'g1', scorer: 'h9', a1: 'h7', a2: 'h5' };
    const s = run(I.reducer, I.init({}), ice.old(d, 0));
    const g = s.events[0];
    assert.equal(g.secondId, 'h7'); assert.equal(g.thirdId, 'h5');
  });
});

describe('football', () => {
  const live = F.reducer(F.init({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
  test('DI3: changing the assister reverses the first one (attribution2)', () => {
    const s = run(F.reducer, live, [goalAction('home', { id: 'p1' }, 'open')]);
    const gid = s.events.at(-1)!.id;
    const a1 = assistAction('home', { id: 'p2' }, undefined, gid);
    const a2 = assistAction('home', { id: 'p3' }, undefined, gid, 'p2');
    assert.deepEqual(a2.attribution2, { playerId: 'p2', stat: 'assists', by: -1 });
    const recs = toRecords([goalAction('home', { id: 'p1' }, 'open'), a1, a2]);
    const sums = liveSums(recs);
    assert.equal(sums.p2?.assists ?? 0, 0); assert.equal(sums.p3.assists, 1);
    assert.equal(run(F.reducer, s, [a1, a2]).events.at(-1)!.secondId, 'p3');
    assert.equal(assistAction('home', { id: 'p3' }, undefined, gid).attribution2, undefined, 'no reversal without a previous assister');
  });
  test('DI10: re-typing a goal reverses its assist with it', () => {
    const u = undoGoalAction('home', { id: 'p1' }, 'open', 'p2');
    assert.deepEqual(u.attribution2, { playerId: 'p2', stat: 'assists', by: -1 });
    assert.equal(undoGoalAction('home', { id: 'p1' }, 'open').attribution2, undefined);
  });
  test('DI15: the goal card summary reads from the goal on the board', () => {
    assert.equal(footballGoalSummary({ type: 'goal', side: 'home', minute: 3, goalType: 'open', bodyPart: 'head', zone: 'box', secondId: 'p2' } as never, nameOf), 'Header · Inside the box · Assist: P2');
    assert.equal(footballGoalSummary({ type: 'goal', side: 'home', minute: 3, goalType: 'open' } as never, nameOf), '');
    assert.equal(footballGoalSummary({ type: 'goal', side: 'home', minute: 3, goalType: 'penalty', bigChance: true } as never, nameOf), 'Penalty · Big chance');
  });
});

/* ------------------------------ the controls ------------------------------ */

describe('controls (source)', () => {
  test('DI1: hockey / ice / union / league fire the score on the scorer tap — no assist step before it', () => {
    const h = read('src/sports/hockey/index.tsx');
    assert.doesNotMatch(h, /step: 'type' \| 'scorer' \| 'assist'/);
    assert.match(h, /onPick=\{\(p\) => goal\(sd, flow\.goalType \?\? 'field', p, /);
    const i = read('src/sports/ice_hockey/index.tsx');
    assert.doesNotMatch(i, /'scorer' \| 'a1' \| 'a2' \| 'onice'/);
    for (const f of ['src/sports/rugby/index.tsx', 'src/sports/rugby_league/index.tsx']) {
      const s = read(f);
      assert.doesNotMatch(s, /'scorer' \| 'assist'/, f);
    }
  });
  test('DI6/DI15: every family uses the shared DescribeCard keyed by the goal id', () => {
    for (const f of ['football', 'hockey', 'ice_hockey', 'rugby', 'rugby_league']) {
      const s = read(`src/sports/${f}/index.tsx`);
      assert.match(s, /import \{ DescribeCard, useDescribeMarks \} from '\.\.\/\.\.\/components\/DescribeCard'/, f);
      assert.match(s, /<DescribeCard\b/, f);
      assert.match(s, /modeOf\(/, f);
    }
  });
  test('DI9: a re-entered goal / try keeps its assist', () => {
    for (const f of ['hockey', 'ice_hockey', 'rugby', 'rugby_league']) assert.match(read(`src/sports/${f}/index.tsx`), /carry/, f);
  });
  test('DI13: hockey PC card — no "Later"', () => {
    const h = read('src/sports/hockey/index.tsx');
    assert.doesNotMatch(h, /label="Later"/);
    assert.match(h, /pcMarks\.modeOf\(/);
  });
  test('DI14/DI15: football stoppage + goal cards; no top-right "Close" finish on the goal', () => {
    const f = read('src/sports/football/index.tsx');
    assert.match(f, /stopMarks\.modeOf\(/);
    assert.match(f, /goalMarks\.modeOf\(/);
    assert.doesNotMatch(f, /flow\.logged \? 'Close' : 'Cancel'/);
  });
});

/* -------------------------- 600 scorers, at random -------------------------- */

test('600 scorers: score always right; stats = the old flow; old logs replay identically', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const HOME = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], AWAY = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  for (let u = 0; u < 600; u++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sp: Sp<any> = SPORTS[u % SPORTS.length];
    const H = harness(sp);
    let log: ScoreAction[] = [];
    let s = sp.init();
    const drafts: Draft[] = [];
    let n = 0;
    for (let k = 0; k < 14; k++) {
      const r = rnd();
      if (r < 0.45) {
        // a goal / try at the tap (a team one sometimes)
        const side = rnd() < 0.5 ? 'home' : 'away';
        const roster = side === 'home' ? HOME : AWAY;
        const d: Draft = { side, uid: `u${u}g${n}`, ...(rnd() < 0.85 ? { scorer: pick(roster) } : {}), ...(sp === league && rnd() < 0.2 ? { bonus: true } : {}) };
        const a = sp.score(d, n++);
        const before = scoreOf(s);
        s = sp.reducer(s, a); log.push(a); drafts.push(d);
        assert.notEqual(scoreOf(s), before, `${u}: the score moved at the tap`);
      } else if (r < 0.8 && drafts.length) {
        // a detail on a goal still on the board (often not the latest)
        const d = pick(drafts);
        const roster = (d.side === 'home' ? HOME : AWAY).filter((p) => p !== d.scorer);
        const opts: Record<string, unknown>[] = [{ a1: pick(roster) }, { a1: null }];
        if (sp.multi) opts.push({ a2: pick(roster) }, { strength: pick(['ev', 'pp', 'sh']) }, { en: rnd() < 0.5 }, { onIce: { home: [pick(HOME)], away: [pick(AWAY)] } });
        const a = sp.detail(s, d.uid, pick(opts));
        if (a) {
          const before = scoreOf(s);
          s = sp.reducer(s, a); log.push(a);
          assert.equal(scoreOf(s), before, `${u}: a detail never moves the score`);
        }
      } else if (log.length) {
        // Undo: the newest step
        log = log.slice(0, -1);
        s = run(sp.reducer, sp.init(), log);
      }
      // every step: the live lines = statTotals (careers sync to the same)
      const errs = contractErrors(H, sp.totals(s), liveSums(toRecords(log)));
      assert.deepEqual(errs, [], `${u} ${sp.name} step ${k}: ${errs.slice(0, 3).join('; ')}`);
    }
    // the old flow for the same match: each goal as one GOAL / TRY with what it ended up with
    const oldLog: ScoreAction[] = [];
    log.forEach((a) => {
      if (a.type !== 'GOAL' && a.type !== 'TRY') return;
      const e = s.events.find((x: { id: string }) => x.id === a.payload?.uid);
      const i = drafts.findIndex((d) => d.uid === e.id);
      const d: Draft = {
        side: e.side, uid: e.id, ...(e.playerId ? { scorer: e.playerId } : {}), ...(e.secondId ? { a1: e.secondId } : {}),
        ...(e.thirdId ? { a2: e.thirdId } : {}), ...(e.strength ? { strength: e.strength } : {}), ...(e.en ? { en: true } : {}),
        ...(e.onIce ? { onIce: e.onIce } : {}), ...(e.bonus ? { bonus: true } : {}),
      };
      oldLog.push(...sp.old(d, i));
    });
    const sOld = replay(H, toRecords(oldLog));
    const sNew = replay(H, toRecords(log));
    assert.equal(scoreOf(sNew), scoreOf(sOld), `${u}: score`);
    assert.deepEqual(sp.totals(sNew), sp.totals(sOld), `${u} ${sp.name}: totals = the old flow`);
    const norm = (x: Record<string, Record<string, number>>) => Object.fromEntries(Object.entries(x).map(([id, st]) => [id, Object.fromEntries(Object.entries(st).filter(([, v]) => v !== 0))]).filter(([, st]) => Object.keys(st as object).length));
    assert.deepEqual(norm(liveSums(toRecords(log))), norm(liveSums(toRecords(oldLog))), `${u} ${sp.name}: careers = the old flow`);
    // an old log replays to exactly the state the new flow reaches
    assert.deepEqual(sNew.events, sOld.events, `${u} ${sp.name}: events`);
  }
});
