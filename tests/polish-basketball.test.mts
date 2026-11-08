/**
 * Wave 4 polish (docs/security/breaks/polish-basketball.md): basketball's
 * "Rebound?" and "Steal — who lost it?" become shared DescribeCards keyed by
 * the miss / steal: Done / Skip, "✓ Saved · Rebound: X · Edit", single-choice
 * picks (re-tap clears, another replaces). Neither blocks scoring, so no new
 * engine step: the cards log the same REBOUND / TURNOVER actions as before, old
 * logs replay identically, and changed picks end with the old flow's totals.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bkInit, reducer as bkReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, freeThrowAction, lineupAction, missAction, reboundAction, removeAction, scoreAction, stealAction, teamReboundAction, turnoverAction } from '../src/sports/basketball/actions.ts';
import { pointsOf, type BBEvent } from '../src/sports/basketball/events.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { basketballFeed } from '../src/sports/basketball/commentary.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { withRosters } from '../src/sports/racketNames.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// imported lazily so each test fails on its own before the helpers exist
const D = () => import('../src/sports/basketball/describe.ts') as Promise<Record<string, any>>;

type Side = 'home' | 'away';
const P = (id: string): Player => ({ id, fullName: id.toUpperCase(), sports: [] } as unknown as Player);
const H = ['h1', 'h2', 'h3', 'h4', 'h5'].map(P), A = ['a1', 'a2', 'a3', 'a4', 'a5'].map(P);
const SQUADS = withRosters(undefined, H, A);
const BK = { periodMinutes: 10, regPeriods: 4, trackMisses: true, foulsForBonus: 4 };
const st = (a: ScoreAction, sec = 30): ScoreAction => ({ ...a, payload: { ...a.payload, quarter: 1, minute: Math.floor(sec / 60), sec, v: 2 } });
const START: ScoreAction[] = [lineupAction('home', H), lineupAction('away', A), { type: 'KICKOFF', payload: { at: 1 } }];
const bk = (...as: ScoreAction[]) => as.reduce(bkReducer, bkInit(BK));
const lastId = (s: BasketballState) => s.events[s.events.length - 1].id;
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const rm = (e: BBEvent) => removeAction(e, e.pid, { halfCourt: false, tracked: true });
const box = (s: BasketballState) => JSON.stringify(buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: H, awayRoster: A }).data('all')));
const feed = (s: BasketballState) => JSON.stringify(basketballFeed(s, { home: 'H', away: 'A' }, SQUADS));
/** A removed-then-replaced pick leaves an id gap: renumber in order (refs too). */
function renum(s: BasketballState): BasketballState {
  const map = new Map(s.events.map((e, i) => [e.id, i + 1]));
  return { ...s, seq: 0, events: s.events.map((e) => ({ ...e, id: map.get(e.id)!, ...(e.ref != null ? { ref: map.get(e.ref) ?? -1 } : {}) })) };
}
/** Apply a card plan: the removal first, then the new pick. */
const apply = (s: BasketballState, plan: { remove?: BBEvent; add?: ScoreAction }): { s: BasketballState; acts: ScoreAction[] } => {
  const acts = [...(plan.remove ? [rm(plan.remove)] : []), ...(plan.add ? [st(plan.add, 40)] : [])];
  return { s: acts.reduce(bkReducer, s), acts };
};

describe('PB3 / PB12: the rebound card is single-choice', () => {
  test('a pick once is the old one-step tap, exactly', async () => {
    const { reboundPlan } = await D();
    const miss = st(missAction('home', 2, H[0]));
    const s1 = bk(...START, miss);
    const { s } = apply(s1, reboundPlan(s1, lastId(s1), { side: 'away', pid: 'a2', rt: 'def' }));
    assert.deepEqual(s, bk(...START, miss, st(reboundAction('away', A[1], 'def'), 40)));
  });
  test('another player replaces (one rebound, the new one); totals equal picking it straight away', async () => {
    const { reboundPlan, reboundCard } = await D();
    const miss = st(missAction('home', 2, H[0]));
    let s = bk(...START, miss);
    const ref = lastId(s);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: 'a2', rt: 'def' })).s;
    s = apply(s, reboundPlan(s, ref, { side: 'home', pid: 'h3', rt: 'off' })).s;
    assert.equal(s.events.filter((e) => e.type === 'rebound').length, 1);
    assert.equal(reboundCard(s, ref).rebound?.pid, 'h3');
    const old = bk(...START, miss, st(reboundAction('home', H[2], 'off'), 40));
    assert.deepEqual(basketballStatTotals(s), basketballStatTotals(old));
    assert.deepEqual(renum(s), renum(old));
  });
  test('a re-tap clears it (no rebound, no credit)', async () => {
    const { reboundPlan, reboundCard } = await D();
    const miss = st(missAction('home', 2, H[0]));
    let s = bk(...START, miss);
    const ref = lastId(s);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: 'a2', rt: 'def' })).s;
    const plan = reboundPlan(s, ref, { side: 'away', pid: 'a2', rt: 'def' });
    assert.equal(plan.add, undefined);
    s = apply(s, plan).s;
    assert.equal(reboundCard(s, ref).rebound, undefined);
    assert.deepEqual(basketballStatTotals(s), basketballStatTotals(bk(...START, miss)));
  });
  test('Team is an option like a player: re-tap clears, a player replaces it', async () => {
    const { reboundPlan, reboundCard } = await D();
    let s = bk(...START, st(missAction('home', 3, H[0])));
    const ref = lastId(s);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: null, rt: 'def' })).s;
    assert.equal(reboundCard(s, ref).rebound?.team, true);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: 'a1', rt: 'def' })).s;
    assert.equal(s.events.filter((e) => e.type === 'rebound').length, 1);
    assert.equal(reboundCard(s, ref).rebound?.pid, 'a1');
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: 'a1', rt: 'def' })).s;
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: null, rt: 'def' })).s;
    assert.equal(reboundCard(s, ref).rebound?.team, true);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: null, rt: 'def' })).s;
    assert.equal(reboundCard(s, ref).rebound, undefined);
  });
  test('a missed last free throw is a shot the card can key on', async () => {
    const { reboundShot, reboundCard, reboundPlan } = await D();
    let s = bk(...START);
    const from = s.seq;
    s = bkReducer(s, st(freeThrowAction('home', false, H[1])));
    assert.equal(reboundShot(s, 'home', from)?.type, 'freethrow');
    s = apply(s, reboundPlan(s, lastId(s), { side: 'away', pid: 'a4', rt: 'def' })).s;
    assert.equal(reboundCard(s, lastId(s) - 1).rebound?.pid, 'a4');
    // a made free throw is not a shot to rebound
    const s2 = bkReducer(bk(...START), st(freeThrowAction('home', true, H[1])));
    assert.equal(reboundShot(s2, 'home', 0), undefined);
  });
});

describe('PB3: the steal card is single-choice', () => {
  test('a pick once is the old one-step tap, exactly', async () => {
    const { stealPlan } = await D();
    const steal = st(stealAction('home', H[0]));
    const s1 = bk(...START, steal);
    const { s } = apply(s1, stealPlan(s1, lastId(s1), 'a3'));
    assert.deepEqual(s, bk(...START, steal, st(turnoverAction('away', A[2], { ref: lastId(s1) }), 40)));
  });
  test('another player replaces (the old flow silently dropped the second); a re-tap clears', async () => {
    const { stealPlan, stealCard } = await D();
    const steal = st(stealAction('home', H[0]));
    let s = bk(...START, steal);
    const ref = lastId(s);
    s = apply(s, stealPlan(s, ref, 'a3')).s;
    s = apply(s, stealPlan(s, ref, 'a5')).s;
    assert.equal(stealCard(s, ref).lost?.pid, 'a5');
    assert.equal(s.events.filter((e) => e.type === 'turnover').length, 1);
    const old = bk(...START, steal, st(turnoverAction('away', A[4], { ref }), 40));
    assert.deepEqual(basketballStatTotals(s), basketballStatTotals(old));
    assert.deepEqual(renum(s), renum(old));
    s = apply(s, stealPlan(s, ref, 'a5')).s;
    assert.equal(stealCard(s, ref).lost, undefined);
    assert.deepEqual(basketballStatTotals(s), basketballStatTotals(bk(...START, steal)));
  });
  test('PB11: a plan never removes anything but the card\'s own pick', async () => {
    const { stealPlan, reboundPlan } = await D();
    const s = bk(...START, st(stealAction('home', H[0])), st(turnoverAction('away', A[0])));
    // the turnover after the steal names no steal: it is not the card's pick
    assert.equal(stealPlan(s, 4, 'a1').remove, undefined);
    const s2 = bk(...START, st(missAction('home', 2, H[0])), st(scoreAction('away', 2, A[0])));
    assert.equal(reboundPlan(s2, 4, { side: 'away', pid: 'a1', rt: 'def' }).remove, undefined);
    // a gone play gives no plan
    assert.deepEqual(stealPlan(s, 99, 'a1'), {});
    assert.deepEqual(reboundPlan(s2, 99, { side: 'away', pid: 'a1', rt: 'def' }), {});
  });
});

describe('PB4 / PB5 / PB6: when the cards close', () => {
  test('the own pick keeps the card open; a newer play or Undo of the play closes it', async () => {
    const { cardStale, reboundOwn, stealOwn, reboundPlan, stealPlan } = await D();
    let s = bk(...START, st(missAction('home', 2, H[0])));
    const ref = lastId(s);
    assert.equal(cardStale(s, ref, reboundOwn(s, ref)), false);
    s = apply(s, reboundPlan(s, ref, { side: 'away', pid: 'a2', rt: 'def' })).s;
    assert.equal(cardStale(s, ref, reboundOwn(s, ref)), false, 'own pick');
    s = apply(s, reboundPlan(s, ref, { side: 'home', pid: 'h2', rt: 'off' })).s;
    assert.equal(cardStale(s, ref, reboundOwn(s, ref)), false, 'replaced pick');
    const later = bkReducer(s, st(scoreAction('home', 2, H[1])));
    assert.equal(cardStale(later, ref, reboundOwn(later, ref)), true, 'newer play');
    const rb2 = bkReducer(s, st(reboundAction('home', H[3], 'off')));
    assert.equal(cardStale(rb2, ref, reboundOwn(rb2, ref)), true, 'a second rebound is a newer play');
    const gone = bkReducer(s, rm(s.events.find((e) => e.id === ref)!));
    assert.equal(cardStale(gone, ref, reboundOwn(gone, ref)), true, 'miss undone');

    let t = bk(...START, st(stealAction('away', A[0])));
    const sref = lastId(t);
    t = apply(t, stealPlan(t, sref, 'h1')).s;
    assert.equal(cardStale(t, sref, stealOwn(t, sref)), false);
    const t2 = bkReducer(t, st(missAction('away', 2, A[0])));
    assert.equal(cardStale(t2, sref, stealOwn(t2, sref)), true);
  });
  test('PB5: undo of the pick empties the summary', async () => {
    const { reboundPlan, reboundCard, reboundSummary } = await D();
    const s0 = bk(...START, st(missAction('home', 2, H[0])));
    const ref = lastId(s0);
    const { s } = apply(s0, reboundPlan(s0, ref, { side: 'away', pid: 'a2', rt: 'def' }));
    const nm = (pid?: string) => (pid ?? '').toUpperCase();
    assert.equal(reboundSummary(reboundCard(s, ref).rebound, nm), 'Rebound: A2 (def.)');
    assert.equal(reboundSummary(reboundCard(s0, ref).rebound, nm), '');
  });
  test('PB2: summaries read like the other cards', async () => {
    const { reboundSummary, stealSummary } = await D();
    const nm = (pid?: string) => (pid ?? '').toUpperCase();
    assert.equal(reboundSummary({ type: 'rebound', team: true, reboundType: 'off' } as BBEvent, nm), 'Rebound: Team (off.)');
    assert.equal(stealSummary({ type: 'turnover', pid: 'a1' } as BBEvent, nm), 'Lost it: A1');
    assert.equal(stealSummary(undefined, nm), '');
  });
});

describe('PB1 / PB4 / PB10 / PB13: the controls (source)', () => {
  const ui = read('src/sports/basketball/index.tsx');
  test('both prompts are DescribeCards, keyed r… / s…, with no header Skip link', () => {
    assert.doesNotMatch(ui, /onPress=\{\(\) => setReboundFor\(null\)\}/);
    assert.doesNotMatch(ui, /onPress=\{\(\) => setStealFor\(null\)\}/);
    assert.match(ui, /const key = `r\$\{reboundFor\.fromSeq\}`/);
    assert.match(ui, /const key = `s\$\{stealFor\.fromSeq\}`/);
    assert.match(ui, /<DescribeCard title=\{`Last miss/);
    assert.match(ui, /<DescribeCard title=\{`Last steal/);
  });
  test('picks are dispatched, not fired (fire closes every card)', () => {
    assert.doesNotMatch(ui, /fire\(reboundAction\(def/);
    assert.doesNotMatch(ui, /fire\(teamReboundAction\((def|offSide)/);
    assert.doesNotMatch(ui, /fire\(turnoverAction\(opp\(stealFor\.side\)/);
    assert.match(ui, /reboundPlan\(/);
    assert.match(ui, /stealPlan\(/);
    assert.match(ui, /cardStale\(state, reboundFor\.ref, reboundOwn\(state, reboundFor\.ref\)\)/);
    assert.match(ui, /cardStale\(state, stealFor\.ref, stealOwn\(state, stealFor\.ref\)\)/);
  });
  test('PB10: edits never open either card', () => {
    assert.match(ui, /if \(!edit\) setReboundFor\(\{ shotSide: side, fromSeq/);
    assert.match(ui, /if \(!made && !edit\) setReboundFor\(\{ shotSide: flow\.side, fromSeq/);
  });
});

/* --------------------------- 600-scorer simulation --------------------------- */

let seed = 20261108 ^ 0x4b;
const rnd = (n: number) => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];
const SCORERS = 600;

describe(`sim · ${SCORERS} scorers: misses, steals, rebounds — picks later, never, changed, undone`, () => {
  test('state, totals, box and commentary equal the old one-step flow; old logs replay identically', async () => {
    const d = await D();
    let once = 0, never = 0, changed = 0, cleared = 0, undone = 0, playUndone = 0, outSkipped = 0;
    for (let g = 0; g < SCORERS; g++) {
      // per play: its old one-step actions, the new play action(s) and the card's actions
      type Pick = { side: Side; pid: string | null; rt: 'off' | 'def' } | { pid: string };
      // `final(ref)`: the old flow's one-step pick, naming the play by its id IN THE OLD LOG
      // (a replaced pick leaves an id gap in the new log, so ids can differ)
      type Play = { play: ScoreAction[]; card: ScoreAction[]; final: (ref: number) => ScoreAction[]; picks: (Pick | null)[] };
      const plays: Play[] = [];
      const newLog = () => [...START, ...plays.flatMap((p) => [...p.play, ...p.card])];
      const oldState = () => plays.reduce((s, p) => {
        const before = s.seq;
        const after = p.play.reduce(bkReducer, s);
        return after.seq === before ? after : p.final(lastId(after)).reduce(bkReducer, after);
      }, bk(...START));
      let cur = bk(...newLog());
      let gaps = false;
      const isOut = (s: BasketballState, pid: string, sd: Side) =>
        s.events.filter((e) => e.type === 'foul' && e.side === sd && e.pid === pid).length >= 5 || s.events.some((e) => e.type === 'eject' && e.pid === pid);
      for (let i = 0; i < 40; i++) {
        if (cur.ended) break;
        const r = rnd(12);
        const side: Side = rnd(2) ? 'home' : 'away';
        const mine = side === 'home' ? H : A;
        if (r < 2) {
          // a basket or a foul (fouls out players now and then: PB9)
          const a = r === 0 ? st(scoreAction(side, 2, pick(mine), { fga: true }), 10 * i) : st(foulAction(side, pick(mine.slice(0, 2)), 'personal'), 10 * i);
          plays.push({ play: [a], card: [], final: () => [], picks: [] });
          cur = bkReducer(cur, a);
        } else if (r < 10) {
          const isSteal = r >= 8;
          const ft = !isSteal && r === 7;
          const from = cur.seq;
          const a = isSteal ? st(stealAction(side, pick(mine)), 10 * i)
            : ft ? st(freeThrowAction(side, false, pick(mine)), 10 * i) : st(missAction(side, rnd(2) ? 2 : 3, pick(mine)), 10 * i);
          const after = bkReducer(cur, a);
          plays.push({ play: [a], card: [], final: () => [], picks: [] });
          cur = after;
          if (after.seq === from) continue; // a fouled-out player's play: no card
          const ref = lastId(after);
          if (!isSteal) assert.equal(d.reboundShot(after, side, from)?.id, ref);
          const play = plays[plays.length - 1];
          // the card: 0 picks (never), 1 (once), 2–3 (changed / cleared)
          const n = pick([0, 0, 1, 1, 1, 2, 3]);
          let expect: Pick | null = null;
          for (let k = 0; k < n; k++) {
            let pk: Pick;
            if (isSteal) {
              const pool = (side === 'home' ? A : H).filter((p) => !isOut(cur, p.id, opp(side)));
              if (!pool.length) { outSkipped++; break; }
              pk = { pid: (k && expect && rnd(2) ? expect.pid! : pick(pool).id) as string };
            } else {
              const rbSide: Side = rnd(3) ? opp(side) : side;
              const pool = (rbSide === 'home' ? H : A).filter((p) => !isOut(cur, p.id, rbSide));
              const team = rnd(5) === 0 || !pool.length;
              pk = k && expect && rnd(2) ? expect : { side: rbSide, pid: team ? null : pick(pool).id, rt: rbSide === side ? 'off' : 'def' };
            }
            const plan = isSteal ? d.stealPlan(cur, ref, (pk as { pid: string }).pid) : d.reboundPlan(cur, ref, pk);
            const { s, acts } = apply(cur, plan);
            cur = s; play.card.push(...acts);
            if (plan.remove) gaps = true;
            const same = expect && JSON.stringify(expect) === JSON.stringify(pk);
            expect = same ? null : pk;
            assert.equal(d.cardStale(cur, ref, isSteal ? d.stealOwn(cur, ref) : d.reboundOwn(cur, ref)), false, `g${g} own pick keeps the card`);
          }
          if (n === 0) never++; else if (n === 1) once++; else if (expect) changed++; else cleared++;
          // Undo of the card's newest action (sometimes): the pick goes back
          if (play.card.length && rnd(6) === 0) {
            const last = play.card.pop()!;
            undone++;
            cur = bk(...newLog());
            // the remaining card actions decide the pick, as the log does
            const got = isSteal ? d.stealCard(cur, ref).lost : d.reboundCard(cur, ref).rebound;
            expect = !got ? null : isSteal ? { pid: got.pid } : { side: got.side, pid: got.team ? null : got.pid, rt: got.reboundType };
            void last;
          }
          const fin = expect;
          play.final = (oref) => !fin ? [] : isSteal ? [st(turnoverAction(opp(side), { id: (fin as { pid: string }).pid }, { ref: oref }), 40)]
            : (fin as { pid: string | null }).pid ? [st(reboundAction((fin as { side: Side }).side, { id: (fin as { pid: string }).pid }, (fin as { rt: 'off' | 'def' }).rt), 40)]
              : [st(teamReboundAction((fin as { side: Side }).side, (fin as { rt: 'off' | 'def' }).rt), 40)];
          const summary = isSteal ? d.stealSummary(d.stealCard(cur, ref).lost, (x?: string) => x ?? '') : d.reboundSummary(d.reboundCard(cur, ref).rebound, (x?: string) => x ?? '');
          assert.equal(summary === '', fin == null, `g${g} summary read from the log`);
        } else if (plays.length) {
          // Undo the whole newest play (its card actions first, then the play)
          plays.pop(); playUndone++;
          cur = bk(...newLog());
        }
        assert.equal(cur.home, cur.events.filter((e) => e.side === 'home').reduce((t, e) => t + pointsOf(e), 0));
        // one rebound per shot at most, one ball-handler per steal
        for (const e of cur.events) if (e.type === 'steal' && e.pair) assert.ok(cur.events.filter((t) => t.type === 'turnover' && t.ref === e.id).length <= 1);
      }
      const o = oldState(), n = bk(...newLog());
      assert.deepEqual(n, cur, `g${g} replay`);
      if (!gaps) assert.deepEqual(n, o, `g${g} state, ids included`);
      assert.deepEqual(renum(n), renum(o), `g${g} state`);
      assert.deepEqual(basketballStatTotals(n), basketballStatTotals(o), `g${g} totals`);
      if (g % 10 === 0) { assert.equal(box(renum(n)), box(renum(o)), `g${g} box`); assert.equal(feed(renum(n)), feed(renum(o)), `g${g} feed`); }
    }
    assert.ok(once > 1000 && never > 1000 && changed > 300 && cleared > 100 && undone > 300 && playUndone > 500, `coverage ${once}/${never}/${changed}/${cleared}/${undone}/${playUndone}/${outSkipped}`);
  });
});
