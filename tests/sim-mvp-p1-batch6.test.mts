/**
 * Quality mandate step 6 for MVP P1 batch 6 (docs/security/breaks/mvp-p1-batch6.md):
 *  - 500 tennis / padel doubles sets with a mid-set serving-order fix at a
 *    random moment: the score never moves, the pair's ace / double-fault total
 *    is kept (only who has them changes), the other pair is untouched, and
 *    fixing back restores every event;
 *  - 500 kabaddi halves of random one-tap raids: the score and every raid are
 *    exactly what the full form gives for the same answers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { setFirstSlot } from '../src/sports/serve.ts';
import { init as kInit, reducer as kReducer, raidActions, quickRaidForm, type QuickRaid, type RaidForm, type KabaddiState } from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
let seed = 41;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const IDS = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
type Ev = { kind?: string; side?: Side; playerId?: string; df?: { playerId?: string }; pd?: { how?: string } };
const serveCredits = (evs: Ev[], side: Side) => evs.filter((e) =>
  ((e.kind === 'ace' || e.pd?.how === 'ace') && e.side === side) || (e.df && e.side === opp(side))).length;

test('500 doubles sets with a random mid-set fix', () => {
  for (let i = 0; i < 500; i++) {
    const sport = i % 2 ? 'padel' : 'tennis';
    const e = (sport === 'padel' ? padel : tennis) as unknown as { init: (c: object) => tennis.TennisState; reducer: (s: tennis.TennisState, a: ScoreAction) => tennis.TennisState; serveInfo: (s: tennis.TennisState) => { side: Side; slot: 0 | 1 } };
    let s = e.reducer(e.init({ playersPerSide: 2, doubles: true }), { type: 'SET_FIRST_SERVER', payload: { side: rnd(2) ? 'home' : 'away' } } as ScoreAction);
    const n = 6 + rnd(40);
    for (let k = 0; k < n && !s.ended; k++) {
      const v = e.serveInfo(s);
      const id = IDS[v.side][v.slot];
      const r = rnd(10);
      const a: ScoreAction = r === 0
        ? (sport === 'padel' ? { type: 'POINT', side: v.side, attribution: { playerId: id, stat: 'points' }, payload: { pd: { how: 'ace' } } } : { type: 'ACE', side: v.side, attribution: { playerId: id, stat: 'aces' } }) as ScoreAction
        : r === 1 ? { type: 'POINT', side: opp(v.side), payload: { df: true }, attribution2: { playerId: id, stat: 'doubleFaults' } } as ScoreAction
        : { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction;
      s = e.reducer(s, a);
    }
    if (s.ended) continue;
    const side: Side = rnd(2) ? 'home' : 'away';
    const cur = setFirstSlot(s, side);
    const to = (1 - cur) as 0 | 1;
    const fix = (slot: 0 | 1) => ({ type: 'SET_SERVE_ORDER', payload: { side, slot, playerId: IDS[side][slot], partnerId: IDS[side][1 - slot], v: 2 } } as ScoreAction);
    const f = e.reducer(s, fix(to));
    assert.deepEqual([f.games, f.pts, f.sets, f.setsWon], [s.games, s.pts, s.sets, s.setsWon], 'score never moves');
    assert.equal(serveCredits(f.events as Ev[], side), serveCredits(s.events as Ev[], side));
    assert.equal(serveCredits(f.events as Ev[], opp(side)), serveCredits(s.events as Ev[], opp(side)));
    assert.equal(setFirstSlot(f, side), to);
    const back = e.reducer(f, fix(cur));
    assert.deepEqual(back.events, s.events, 'fixing back restores every event');
  }
});

test('500 kabaddi halves of one-tap raids match the full form', () => {
  const kinds: QuickRaid[] = ['empty', 'touch', 'bonus', 'out'];
  const full: Record<QuickRaid, Pick<RaidForm, 'touches' | 'bonus' | 'tackled'>> = {
    empty: { touches: 0, bonus: false, tackled: false }, touch: { touches: 1, bonus: false, tackled: false },
    bonus: { touches: 0, bonus: true, tackled: false }, out: { touches: 0, bonus: false, tackled: true },
  };
  const apply = (s: KabaddiState, f: RaidForm, t: number) =>
    raidActions(s, f).reduce((x, a) => kReducer(x, { ...a, payload: { ...a.payload, at: t } } as ScoreAction), s);
  for (let g = 0; g < 500; g++) {
    let q = kReducer(kInit({}), { type: 'KICKOFF', payload: { at: 1_000 } } as ScoreAction);
    let f = q;
    for (let i = 0; i < 12; i++) {
      const side: Side = i % 2 ? 'away' : 'home';
      const k = kinds[rnd(4)];
      const raider = rnd(2) ? { id: `${side}-r${rnd(7)}` } : undefined;
      const t = 1_000 + 30_000 * (i + 1);
      q = apply(q, quickRaidForm(side, k, raider), t);
      f = apply(f, { side, ...(raider ? { raider } : {}), ...full[k] } as RaidForm, t);
    }
    assert.deepEqual(q, f);
  }
});
