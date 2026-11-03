/**
 * Simulation — Undo labels batch (docs/security/breaks/undo-labels-quick-sheet.md).
 * 600+ random steps per sport (hockey, handball, kabaddi, carrom, chess),
 * hostile payloads mixed in: every label is null or clean text — never
 * undefined / null / NaN / a raw key / [object …] / an unresolved id — and a
 * label never changes the states it reads. Through `resolveUndoLabel` (the
 * screen's path) the bar text is clean too.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../src/sports/hockey/engine.ts';
import * as HB from '../src/sports/handball/engine.ts';
import * as K from '../src/sports/kabaddi/engine.ts';
import * as C from '../src/sports/carrom/engine.ts';
import * as CH from '../src/sports/chess/engine.ts';
import { hockeyUndoLabel } from '../src/sports/hockey/undoLabel.ts';
import { handballUndoLabel } from '../src/sports/handball/undoLabel.ts';
import { kabaddiUndoLabel } from '../src/sports/kabaddi/undoLabel.ts';
import { carromUndoLabel } from '../src/sports/carrom/undoLabel.ts';
import { chessUndoLabel } from '../src/sports/chess/undoLabel.ts';
import { cleanUndoLabel, resolveUndoLabel, undoLabel } from '../src/sports/undoLabel.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];

const N: Record<string, string> = { p1: 'Asha', p2: 'Meera', p3: 'Ravi', p4: 'Kiran', p5: 'Dev', p6: 'Isha' };
const nameOf = (id?: string | null, legacy?: string | null) => (id && N[id]) || (legacy ?? '').trim() || 'Player';
const sides = { home: 'India', away: 'Spain' };
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'unknown9'];
const SIDE = ['home', 'away', 'home', 'away', 'middle', undefined] as const;
const JUNK = /\bundefined\b|\bnull\b|\bNaN\b|\[object|\b(twoMin|sevenM|nineM|sixM|wingL|drawOffer|illegal-move|home|away|unknown9)\b|[{}]/;

type Fn = (step: { type: string; prev: unknown; next: unknown }, n: typeof nameOf, s: typeof sides) => string | null;
function check(sport: string, fn: Fn, prev: unknown, next: unknown, type: string, tally: { named: number; steps: number }) {
  const before = JSON.stringify([prev, next]);
  const l = fn({ type, prev, next }, nameOf, sides);
  assert.equal(JSON.stringify([prev, next]), before, `${sport}: a label changed a state`);
  tally.steps += 1;
  if (l == null) return;
  assert.equal(typeof l, 'string');
  assert.equal(cleanUndoLabel(l), l, `${sport} ${type}: "${l}"`);
  assert.doesNotMatch(l, JUNK, `${sport} ${type}: "${l}"`);
  tally.named += 1;
  // the screen's path: the sport's label, else the shared one — clean or null
  const bar = resolveUndoLabel(() => l, () => undoLabel({ type, prev, next }, { home: 'India', away: 'Spain', player: nameOf }));
  assert.equal(bar, l);
}
const attr = () => (rnd(4) ? { attribution: { playerId: pick(IDS) } } : rnd(2) ? { attribution: { playerName: 'Old Name' } } : {});

function simulate<S>(sport: string, init: () => S, reducer: (s: S, a: never) => S, fn: Fn, action: (s: S) => unknown[], steps = 600) {
  const tally = { named: 0, steps: 0 };
  let s = init();
  while (tally.steps < steps) {
    for (const a of action(s)) {
      const next = reducer(s, a as never);
      check(sport, fn, s, next, String((a as { type?: unknown })?.type), tally);
      s = next;
    }
    if (rnd(60) === 0) s = init(); // a new match now and then
  }
  return tally;
}

describe('Undo labels — 600+ random steps per sport', () => {
  test('hockey', () => {
    const T = ['GOAL', 'PC', 'STROKE', 'SHOT', 'SAVE', 'CARD', 'SUB', 'GK', 'REFERRAL', 'RULED_OUT', 'CLOCK', 'SET_CLOCK', 'POSS', 'CIRCLE', 'END_PERIOD', 'REMOVE_EVENT', 'START_SHOOTOUT', 'SO', 'SO_ORDER', 'XI', 'BOGUS'];
    const t = simulate('hockey', () => H.init({ trackPossession: true }), H.reducer, hockeyUndoLabel, (s) => [{
      type: pick(T), side: pick(SIDE), ...attr(),
      payload: { goalType: pick(['field', 'pc', 'stroke', 'weird']), card: pick(['green', 'yellow', 'red', 'blue']), outcome: pick(['saved', 'missed', 'scored']), onGoal: !!rnd(2), miss: pick(['wide', 'blocked', 'x']),
        official: rnd(5) ? undefined : pick(['Coach', '']), offId: pick(IDS), onId: pick(IDS), id: rnd(3) ? s.events.at(-1)?.id : pick(IDS), upheld: !!rnd(2), run: !!rnd(2), at: rnd(1000) + 1, undo: !rnd(4), first: pick(SIDE), scored: !!rnd(2) },
    }]);
    assert.ok(t.named > t.steps / 3, `${t.named}/${t.steps} named`);
  });
  test('handball', () => {
    const T = ['GOAL', 'MISS', 'SAVE', 'BLOCK', 'TURNOVER', 'EMPTY_GOAL', 'DRAWN', 'PASSIVE', 'CAUSED', 'STEAL', 'CARD', 'TIMEOUT', 'SUB', 'GK', 'REMOVE_EVENT', 'CLOCK', 'END_PERIOD', 'START_SHOOTOUT', 'SO', 'BOGUS'];
    const t = simulate('handball', () => HB.init({}), HB.reducer, handballUndoLabel, (s) => [{
      type: pick(T), side: pick(SIDE), ...attr(),
      payload: { shotType: pick(['nineM', 'sixM', 'wingL', 'sevenM', 'fastBreak', 'zzz', undefined]), result: pick(['saved', 'blocked', 'missed', 'odd']), card: pick(['yellow', 'twoMin', 'red', 'green']), third: !!rnd(3), blue: !!rnd(3),
        official: rnd(5) ? undefined : pick(['Coach', '', true]), fault: pick(['steps', 'double', 'nope']), on: !!rnd(2), offId: pick(IDS), onId: pick(IDS), id: rnd(3) ? s.events.at(-1)?.id : 'x', run: !!rnd(2), at: rnd(1000) + 1, outcome: pick(['scored', 'saved', 'missed']), scored: !!rnd(2) },
    }]);
    assert.ok(t.named > t.steps / 3, `${t.named}/${t.steps} named`);
  });
  test('kabaddi', () => {
    const t = simulate('kabaddi', () => K.reducer(K.init({ substitutes: 5 }), { type: 'KICKOFF', payload: { at: 1 } } as never), K.reducer, kabaddiUndoLabel, (s) => {
      const side = pick(['home', 'away'] as const);
      const r = rnd(12);
      if (r < 5) {
        const form = { ...K.quickRaidForm(side, pick(['empty', 'touch', 'bonus', 'out'] as const), rnd(4) ? { id: pick(IDS) } as never : undefined), ...(rnd(2) ? { tackler: { id: pick(IDS) } } : {}) };
        try { return K.raidActions(s, form as never); } catch { return []; }
      }
      if (r === 5 && s.raids.length) return [{ type: 'RAID_OUTCOME', side, payload: { touches: rnd(4), replaces: s.raids.at(-1)!.eid, v: 2 } }];
      return [{
        type: pick(['TIMEOUT', 'CARD', 'TECH_POINT', 'SUB', 'RAID', 'TACKLE', 'PAUSE', 'RESUME', 'NEXT_HALF', 'START_SHOOTOUT', 'SHOOTOUT_RAID', 'REMOVE_EVENT', 'SET_TRACK', 'BOGUS']),
        // (a non-side `side` is the reducer's own business: not this batch)
        side: pick(['home', 'away', undefined] as const), ...attr(),
        payload: { card: pick(['green', 'yellow', 'red', 'pink']), official: !rnd(4), playerId: pick(IDS), tp: rnd(2), reason: pick(['coaching', 'lobby', undefined, 'zz']), offId: pick(IDS), onId: pick(IDS), points: rnd(4), at: rnd(5000) + 2, id: s.events.at(-1)?.id ?? -1, v: 2 },
      }];
    });
    assert.ok(t.named > t.steps / 3, `${t.named}/${t.steps} named`);
  });
  test('carrom', () => {
    const t = simulate('carrom', () => C.init({}), C.reducer, carromUndoLabel, (s) => {
      const side = pick(['home', 'away'] as const);
      const r = rnd(10);
      if (r < 7) return [C.boardAction({ side, coins: rnd(10), queen: !!rnd(2), penalty: !rnd(6), slam: rnd(8) ? undefined : pick(['white', 'black'] as const), by: rnd(3) ? [{ side, id: pick(IDS) }] : undefined })];
      if (r === 7) return [{ type: 'AWARD_GAME', side: pick(SIDE), payload: { game: rnd(2) ? s.games.length + 1 : 9, reason: pick(['conduct', 'time', 'zz']) } }];
      if (r === 8) return [{ type: pick(['FIRST_BREAK', 'SET_TRACK', 'STAT_ADJUST', 'BOGUS']), side: pick(SIDE), payload: { side: pick(SIDE), fouls: !!rnd(2) } }];
      return [{ type: 'EDIT_LOG', payload: { boards: C.boardInputs(s).slice(0, -1) } }];
    });
    assert.ok(t.named > t.steps / 3, `${t.named}/${t.steps} named`);
  });
  test('chess', () => {
    const SAN = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Qh5', 'zz'];
    const t = simulate('chess', () => CH.init(rnd(4) ? {} : { koGames: 2 }), CH.reducer, chessUndoLabel as Fn, (s) => {
      const r = rnd(10);
      if (r < 3) return [{ type: 'MOVES', payload: rnd(5) ? { add: [pick(SAN)], clk: rnd(2) ? [rnd(300)] : undefined } : { drop: 1 } }];
      if (r < 5) return [{ type: 'ARBITER', payload: { kind: pick(['illegal', 'drawOffer', 'other']), side: pick(SIDE), at: rnd(9) } }];
      if (r < 7) return [{ type: 'RESULT', payload: { winner: pick(['home', 'away', 'draw', 'nobody']), method: pick([...Object.keys(CH.METHOD_LABEL), 'bogus', undefined]), ...(rnd(3) ? {} : { ko: { games: 2 } }), clock: rnd(2) ? { white: rnd(600), black: NaN } : undefined } }];
      return [{ type: pick(['SET_WHITE', 'OPENING', 'SET_TRACK', 'BOGUS']), payload: { side: pick(SIDE), eco: 'C60', trackMoves: !!rnd(2) } }];
    });
    assert.ok(t.named > t.steps / 3, `${t.named}/${t.steps} named`);
  });
});
