/**
 * Quality mandate step 6 for MVP P1 batch 2 (docs/security/breaks/mvp-p1-batch2.md):
 *  - 500 football matches of random goals, assists, stats, cards and Undos
 *    (the prompt's assist carries its goal): an assist never lands on any goal
 *    but its own, and every Undo label is clean;
 *  - 500 basketball games the same way: no assist without its basket;
 *  - 1,000 random singles / doubles sides: a clean display name, or the
 *    stored name kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init as fInit, reducer as fReducer, type FootballState } from '../src/sports/football/engine.ts';
import { goalAction, assistAction, statAction as fStat, cardActions } from '../src/sports/football/actions.ts';
import { footballUndoLabel } from '../src/sports/football/undoLabel.ts';
import { init as bInit, reducer as bReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { scoreAction, freeThrowAction, foulAction, statAction as bStat } from '../src/sports/basketball/actions.ts';
import { basketballUndoLabel } from '../src/sports/basketball/undoLabel.ts';
import { entryDisplayName } from '../src/data/participantEntry.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 9;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
const nameOf = (id?: string | null, legacy?: string | null) => (id ? `Player ${id}` : (legacy ?? '').trim() || 'Player');
const clean = (l: string | null) => l === null || !/undefined|null|NaN/.test(l);

test('500 football matches: assists only ever land on their own goal; labels clean', () => {
  for (let m = 0; m < 500; m++) {
    const history: FootballState[] = [fReducer(fInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction)];
    const owed = new Map<number, string>(); // goal id → the assister picked for it
    for (let i = 0; i < 40; i++) {
      const s = history[history.length - 1];
      const r = rnd(10);
      let a: ScoreAction | undefined;
      const side = rnd(2) ? 'home' : 'away';
      if (r < 3) a = goalAction(side, { id: `s${rnd(9)}` }, 'open');
      else if (r < 5) {
        const goals = s.events.filter((e) => e.type === 'goal');
        const target = goals.length ? goals[rnd(goals.length)] : undefined;
        // sometimes the prompt is stale (its goal was undone): a made-up id
        const ref = target && rnd(4) ? target.id : 10_000 + i;
        a = assistAction(target?.side ?? side, { id: `a${i}` }, undefined, ref);
        if (target && ref === target.id) owed.set(ref, `a${i}`);
      } else if (r < 7) a = fStat(['shot', 'foul', 'tackle', 'pass'][rnd(4)] as never, side, rnd(2) ? { id: `p${rnd(9)}` } : undefined, { onTarget: !!rnd(2), complete: !!rnd(2) });
      else if (r < 8) a = cardActions(s.events, side, 'yellow', { id: `c${rnd(5)}` })[0];
      else if (history.length > 1) { history.pop(); continue; } // Undo
      if (!a) continue;
      const next = fReducer(s, a);
      assert.ok(clean(footballUndoLabel({ type: a.type, prev: s, next }, nameOf)));
      history.push(next);
    }
    const final = history[history.length - 1];
    for (const g of final.events.filter((e) => e.type === 'goal' && e.secondId)) {
      assert.ok(owed.has(g.id), `goal ${g.id} got an assist that wasn't picked for it`);
    }
  }
});

test('500 basketball games: no assist without its basket; labels clean', () => {
  for (let m = 0; m < 500; m++) {
    const history: BasketballState[] = [bReducer(bInit({}), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction)];
    for (let i = 0; i < 40; i++) {
      const s = history[history.length - 1];
      const r = rnd(10);
      const side = rnd(2) ? 'home' : 'away';
      let a: ScoreAction | undefined;
      if (r < 3) a = scoreAction(side, 2 + rnd(2), rnd(2) ? { id: `b${rnd(9)}` } : undefined);
      else if (r < 5) {
        const baskets = s.events.filter((e) => e.type === 'score' && e.side === side);
        const ref = baskets.length && rnd(3) ? baskets[baskets.length - 1].id : 10_000 + i;
        a = bStat(side, 'ASSIST', { id: `x${i}` }, ref);
      } else if (r < 6) a = freeThrowAction(side, !!rnd(2), { id: `b${rnd(9)}` });
      else if (r < 8) a = foulAction(side, rnd(2) ? { id: `b${rnd(9)}` } : undefined, 'personal');
      else if (history.length > 1) { history.pop(); continue; }
      if (!a) continue;
      const next = bReducer(s, a);
      assert.ok(clean(basketballUndoLabel({ type: a.type, prev: s, next }, nameOf)));
      if (a.type === 'ASSIST' && next.events.length > s.events.length) {
        const ref = (a.payload as { ref: number }).ref;
        assert.ok(s.events.some((e) => e.id === ref && e.type === 'score'), 'an assist was logged without its basket');
      }
      history.push(next);
    }
  }
});

test('1,000 random sides: a clean display name, or the stored name kept', () => {
  const firsts = ['Ravi', 'Arjun', 'Asha', 'Meera', 'Ravi', 'Li', 'José', ''];
  const lasts = ['Kumar', 'Rao', '', 'Singh', 'Lee'];
  for (let i = 0; i < 1000; i++) {
    const names = Array.from({ length: 1 + rnd(3) }, () => `${firsts[rnd(firsts.length)]} ${lasts[rnd(lasts.length)]}`.trim());
    const d = entryDisplayName(names);
    if (names.length > 2 || names.some((n) => !n)) assert.equal(d, undefined);
    else { assert.ok(d && !/undefined|null/.test(d) && d.length <= 60, String(d)); }
  }
});
