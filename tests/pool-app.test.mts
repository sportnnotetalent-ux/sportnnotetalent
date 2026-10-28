/**
 * Pool — the app plugin around the engine, written test-first
 * (docs/engineering/quality-mandate.md): the plugin's match state
 * (src/sports/pool/match.ts: who shot, the game pin, the shot feed), the
 * scorer controls' pure logic (src/sports/pool/controls.ts: action builders,
 * what the screen offers in each state, confirmations, the double-tap guard,
 * the scotch-doubles rotation) and, as integration, whole matches driven
 * through the plugin's pure parts (src/sports/pool/core.ts): init → reducer
 * with the builders' actions → summary / result / line score / statTotals /
 * records / undo label / feed / stats panel.
 *
 * The engine's own rules are tested in tests/pool-engine.test.mts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/sports/pool/match.ts';
import * as C from '../src/sports/pool/controls.ts';
import { POOL_CORE } from '../src/sports/pool/core.ts';
import { poolFeed } from '../src/sports/pool/feed.ts';
import { poolCompare, poolRackList } from '../src/sports/pool/compare.ts';
import { poolBox } from '../src/sports/pool/box.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
type S = M.PoolMatch;
const NAMES = { home: 'Home', away: 'Away' };
const nameOf = (id?: string | null, legacy?: string | null) => (id ? id.toUpperCase() : legacy || 'Player');
const name = (side: Side) => NAMES[side];
const ctx = (home: string[], away: string[]) => ({ players: { home: home.map((id) => ({ id })), away: away.map((id) => ({ id })) } });

/** Apply builders one by one (each built from the state it applies to). */
function play(config: Record<string, unknown>, ...steps: Array<(s: S) => ScoreAction>): { s: S; log: ScoreAction[]; states: S[] } {
  let s = POOL_CORE.createInitialState(config);
  const log: ScoreAction[] = [];
  const states: S[] = [s];
  for (const f of steps) {
    const a = f(s);
    const next = POOL_CORE.reducer(s, a);
    assert.notEqual(next, s, `step ${log.length + 1} (${a.type}) was ignored: ${JSON.stringify(a)}`);
    log.push(a);
    states.push(next);
    s = next;
  }
  return { s, log, states };
}
const replay = (config: Record<string, unknown>, log: ScoreAction[]) =>
  log.reduce<S>((s, a) => POOL_CORE.reducer(s, a), POOL_CORE.createInitialState(config));

/* ------------------------------------------------------------------ */
/*  The plugin's match state (match.ts)                               */
/* ------------------------------------------------------------------ */

describe('match state: the engine state plus what the app adds', () => {
  test('init: the engine state, players per side, the raw rule options, an empty credit and feed', () => {
    const s = M.poolInit({ game: 'nine', raceTo: 3, playersPerSide: 2, threeFoul: 'auto', tenEarly: true });
    assert.equal(s.game, 'nine');
    assert.equal(s.raceTo, 3);
    assert.equal(s.perSide, 2);
    assert.deepEqual(s.opt, { tenEarly: true });
    assert.deepEqual(M.creditOf(s).ids, { home: [], away: [] });
    assert.deepEqual(M.feedOf(s), []);
    assert.equal(M.poolInit({ playersPerSide: 7 }).perSide, 2, 'clamped');
    assert.equal(M.poolInit({ playersPerSide: 'x' }).perSide, 1);
    assert.equal(M.poolInit().perSide, 1);
  });

  test('an action the engine ignores returns the very same state (nothing is credited)', () => {
    const s = M.poolInit({ game: 'nine' });
    assert.equal(M.poolReducer(s, { type: 'MISS', side: 'home', payload: { rack: 1 } }), s);
    assert.equal(M.poolReducer(s, { type: 'NOPE' }), s);
    assert.equal(M.poolReducer(s, null as never), s);
    assert.equal(M.poolReducer(null as never, { type: 'LAG', side: 'home' }), null);
  });

  test('singles: every accepted shot is counted for the side that played it, per set', () => {
    const { s } = play({ game: 'nine', raceTo: 2 },
      (x) => C.lagAction(x, 'home'),
      (x) => C.breakAction(x, { pots: [3] }),
      (x) => C.potAction(x, [1]),
      (x) => C.missAction(x),
      (x) => C.foulAction(x, 'scratch'),
      (x) => C.safetyAction(x),
    );
    assert.deepEqual(M.sideCounts(s, 'home'), { breakShots: 1, breakBalls: 1, shotsPlayed: 3, potShots: 1, ballsPotted: 1, missShots: 1, safetyShots: 1 });
    assert.deepEqual(M.sideCounts(s, 'away'), { shotsPlayed: 1, fouls: 1, foulScratch: 1 });
    assert.deepEqual(M.sideCounts(s, 'home', 1), M.sideCounts(s, 'home'));
    assert.deepEqual(M.sideCounts(s, 'home', 2), {});
  });

  test('scotch doubles: each shot is credited to the player id the scorer picked (payload.pid)', () => {
    const { s } = play({ game: 'nine', raceTo: 3, playersPerSide: 2 },
      (x) => C.lagAction(x, 'home'),
      (x) => C.breakAction(x, { pots: [2] }, { pid: 'h1' }),
      (x) => C.potAction(x, [1], {}, { pid: 'h2' }),
      (x) => C.missAction(x, { pid: 'h1' }),
      (x) => C.safetyAction(x, [], { pid: 'a1' }),
      (x) => C.missAction(x, { pid: 'h2' }),
    );
    assert.deepEqual(M.playerCounts(s, 'h1'), { breakShots: 1, breakBalls: 1, shotsPlayed: 1, missShots: 1 });
    assert.deepEqual(M.playerCounts(s, 'h2'), { shotsPlayed: 2, potShots: 1, ballsPotted: 1, missShots: 1 });
    assert.deepEqual(M.playerCounts(s, 'a1'), { shotsPlayed: 1, safetyShots: 1 });
    const cr = M.creditOf(s);
    assert.deepEqual(cr.ids, { home: ['h1', 'h2'], away: ['a1'] });
    assert.deepEqual(cr.last, { home: 'h2', away: 'a1' });
    assert.deepEqual(cr.lastBreak, { home: 'h1', away: null });
    assert.deepEqual(cr.unk, { home: 0, away: 0 });
  });

  test('doubles: a shot with no usable id is counted for the side only (unk), never guessed', () => {
    let s = play({ game: 'nine', raceTo: 3, playersPerSide: 2 }, (x) => C.lagAction(x, 'home'), (x) => C.breakAction(x, { pots: [2] }, { pid: 'h1' })).s;
    // no id; a name (spaces); too long; not text; the other side's player; a prototype key
    for (const pid of [undefined, 'Asha Rao', 'x'.repeat(65), 7, 'a1', '__proto__']) {
      const a = C.potAction(s, [s.rack!.table[0]]);
      const next = M.poolReducer(s, { ...a, payload: { ...a.payload, ...(pid !== undefined ? { pid } : {}) } });
      assert.notEqual(next, s);
      s = next;
    }
    // 'a1' was first seen on the home side here, so it belongs to home now — see break #A3 for the cap
    const cr = M.creditOf(s);
    assert.equal(cr.unk.home, 5);
    assert.ok(!JSON.stringify(s).includes('Asha'), 'a name never reaches the state');
    assert.ok(!JSON.stringify(s).includes('__proto__'));
  });

  test('doubles: a player id stays on the side it was first credited to', () => {
    let s = play({ game: 'nine', raceTo: 3, playersPerSide: 2 }, (x) => C.lagAction(x, 'home'), (x) => C.breakAction(x, { pots: [] }, { pid: 'h1' })).s;
    // away is at the table (dry break); a shot credited to home's h1 is not h1's
    s = M.poolReducer(s, C.missAction(s, { pid: 'h1' }));
    assert.deepEqual(M.playerCounts(s, 'h1'), { breakShots: 1, dryBreaks: 1 });
    assert.equal(M.creditOf(s).unk.away, 1);
  });

  test('the game is pinned by the first event: a later format change never re-plays the log as another game (break #26)', () => {
    // scored as 8-ball …
    const eight = play({ game: 'eight', raceTo: 2 },
      (x) => C.lagAction(x, 'home'),
      (x) => C.breakAction(x, { pots: [3, 11] }),
      (x) => C.potAction(x, [1]),
      (x) => C.missAction(x),
    );
    assert.equal(eight.log[0].payload?.game, 'eight');
    // … the organiser then switches the tournament to 9-ball: the replay keeps 8-ball
    const again = replay({ game: 'nine', raceTo: 2 }, eight.log);
    assert.equal(again.game, 'eight');
    assert.deepEqual(again.rack, eight.s.rack);
    assert.deepEqual(again.tally, eight.s.tally);
    // the rule options follow the pinned game (8-ball: three-foul off by default)
    assert.equal(again.threeFoul, false);
    assert.equal(replay({ game: 'nine', raceTo: 2, threeFoul: true }, eight.log).threeFoul, true, 'an explicit option is kept');
    // only the first accepted event pins; later ones can't switch the game
    const later = M.poolReducer(eight.s, { ...C.missAction(eight.s), payload: { ...C.missAction(eight.s).payload, game: 'ten' } });
    assert.equal(later.game, 'eight');
    // an ignored first event pins nothing
    const s0 = M.poolInit({ game: 'nine' });
    assert.equal(M.poolReducer(s0, { type: 'MISS', side: 'home', payload: { game: 'eight', rack: 1 } }), s0);
  });

  test('the race / sets the match started with are remembered, so a change can be told', () => {
    const { log } = play({ game: 'nine', raceTo: 5 }, (x) => C.lagAction(x, 'home'));
    assert.deepEqual(log[0].payload, { breaks: 'home', rack: 1, game: 'nine', race: 5, sets: 1 });
    const same = replay({ game: 'nine', raceTo: 5 }, log);
    assert.deepEqual(same.fmt0, { raceTo: 5, setsToWin: 1 });
    assert.equal(C.formatNote(same), null);
    const changed = replay({ game: 'nine', raceTo: 7 }, log);
    assert.equal(changed.raceTo, 7);
    assert.match(C.formatNote(changed) ?? '', /race to 7.*race to 5.*re-scored/i);
  });

  test('the feed keeps the shots of the rack in play and the last 3 racks, at most 120 per rack', () => {
    // seven quick racks: entries for racks 5–8 only (8 = in play, no entry yet)
    let s = M.poolInit({ game: 'nine', raceTo: 9 });
    for (let i = 0; i < 7; i++) s = M.poolReducer(s, C.rackAction(s, i % 2 ? 'away' : 'home'));
    assert.deepEqual(M.feedOf(s).map((e) => e.n), [5, 6, 7]);
    assert.equal(M.rackTimes(s).length, 7, 'one time per completed rack');
    // 300 safeties in one rack keep the newest 120
    s = M.poolInit({ game: 'nine', raceTo: 9 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [] }));
    for (let i = 0; i < 300; i++) s = M.poolReducer(s, C.safetyAction(s, [], { at: 1000 + i }));
    const f = M.feedOf(s).filter((e) => e.n === 1);
    assert.equal(f.length, M.FEED_PER_RACK);
    assert.equal(f[f.length - 1].at, 1299);
    assert.ok(JSON.stringify(s).length < 20_000);
  });
});

/* ------------------------------------------------------------------ */
/*  The controls' pure logic (controls.ts)                            */
/* ------------------------------------------------------------------ */

describe('controls: what every tap sends', () => {
  test('every action carries the rack in play; every shot the side at the table (breaks #12, #13)', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'away'));
    const brk = C.breakAction(s, { pots: [] });
    assert.deepEqual(brk, { type: 'BREAK', side: 'away', payload: { pots: [], rack: 1 } });
    s = M.poolReducer(s, brk);
    assert.equal(s.rack!.shooter, 'home');
    assert.deepEqual(C.missAction(s), { type: 'MISS', side: 'home', payload: { rack: 1 } });
    assert.deepEqual(C.potAction(s, [1, 2]), { type: 'POT', side: 'home', payload: { pots: [1, 2], rack: 1 } });
    assert.deepEqual(C.safetyAction(s, [4]), { type: 'SAFETY', side: 'home', payload: { pots: [4], rack: 1 } });
    assert.deepEqual(C.foulAction(s, 'scratch', { pots: [3] }), { type: 'FOUL', side: 'home', payload: { kind: 'scratch', pots: [3], rack: 1 } });
    assert.deepEqual(C.foulAction(s, 'offTable', { balls: [5] }), { type: 'FOUL', side: 'home', payload: { kind: 'offTable', off: [5], rack: 1 } });
    assert.deepEqual(C.foulAction(s, 'outOfTurn', { by: 'away' }), { type: 'FOUL', side: 'away', payload: { kind: 'outOfTurn', rack: 1 } });
    assert.deepEqual(C.pushAction(s, {}), { type: 'PUSH', side: 'home', payload: { rack: 1 } });
    assert.deepEqual(C.rackAction(s, 'home'), { type: 'RACK', side: 'home', payload: { rack: 1 } });
    assert.deepEqual(C.stalemateAction(s), { type: 'STALEMATE', payload: { rack: 1 } });
    assert.deepEqual(C.missAction(s, { pid: 'h1', at: 5 }), { type: 'MISS', side: 'home', payload: { rack: 1, pid: 'h1', at: 5 } });
    assert.deepEqual(C.missAction(s, { pid: 'Asha Rao' }).payload, { rack: 1 }, 'a name is never sent as an id');
    assert.equal(C.missAction(s).attribution, undefined, 'no live stat credit: the totals are derived');
  });

  test('the first event of a match carries the game, race and sets it is scored under', () => {
    const s = M.poolInit({ game: 'ten', raceTo: 4, setsToWin: 2 });
    assert.deepEqual(C.rackAction(s, 'home', { breaker: 'away' }).payload, { breaker: 'away', rack: 1, game: 'ten', race: 4, sets: 2 });
    const s1 = M.poolReducer(s, C.lagAction(s, 'home'));
    assert.deepEqual(C.breakAction(s1, { pots: [1] }).payload, { pots: [1], rack: 1 });
  });

  test('a finished match: the builders still return an action, which the engine ignores', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 1 });
    s = M.poolReducer(s, C.rackAction(s, 'home'));
    assert.equal(s.ended, true);
    assert.equal(M.poolReducer(s, C.rackAction(s, 'away')), s);
    assert.deepEqual(C.poolPanel(s), { kind: 'over', winner: 'home' });
  });
});

describe('controls: what the screen offers in each state', () => {
  test('before the first break: who breaks rack 1 (the lag)', () => {
    assert.deepEqual(C.poolPanel(M.poolInit({ game: 'eight' })), { kind: 'lag', rack: 1 });
  });

  test('the break: the breaker, the balls, the 9-ball short-break rule, whether an illegal break is a foul', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    assert.deepEqual(C.poolPanel(s), { kind: 'break', rack: 1, breaker: 'home', balls: [1, 2, 3, 4, 5, 6, 7, 8, 9], shortRule: true, illegalFoul: true });
    let e = M.poolInit({ game: 'eight' });
    e = M.poolReducer(e, C.lagAction(e, 'away'));
    const p = C.poolPanel(e);
    assert.equal(p.kind, 'break');
    if (p.kind === 'break') { assert.equal(p.shortRule, false); assert.equal(p.illegalFoul, false); assert.equal(p.balls.length, 15); }
  });

  test('a later rack with no known breaker (quick racks, no lag): the scorer names the breaker', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.rackAction(s, 'home'));
    const p = C.poolPanel(s);
    assert.equal(p.kind, 'break');
    if (p.kind === 'break') assert.equal(p.breaker, null);
    const b = C.breakAction(s, { pots: [], side: 'away' });
    assert.equal(b.side, 'away');
    assert.notEqual(M.poolReducer(s, b), s);
  });

  test('at the table: shooter, balls left, ball in hand, call shot, push-out, groups, the on-two-fouls warning', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [] }));
    let p = C.poolPanel(s);
    assert.deepEqual(p, { kind: 'shot', rack: 1, shooter: 'away', table: [1, 2, 3, 4, 5, 6, 7, 8, 9], bih: false, twoFouls: false, push: true, callShot: false, safetyCall: true, solids: null, money: 9, tenCall: false });
    s = M.poolReducer(s, C.foulAction(s, 'scratch'));
    s = M.poolReducer(s, C.missAction(s));
    s = M.poolReducer(s, C.foulAction(s, 'noRail'));
    s = M.poolReducer(s, C.missAction(s));
    p = C.poolPanel(s);
    assert.equal(p.kind === 'shot' && p.twoFouls, true, 'away comes to the table on two fouls');
    assert.equal(p.kind === 'shot' && p.push, false);
    // 8-ball: call shot, no push-out, groups once assigned; 10-ball: call shot, no safety call
    let e = M.poolInit({ game: 'eight' });
    e = M.poolReducer(e, C.lagAction(e, 'home'));
    e = M.poolReducer(e, C.breakAction(e, { pots: [2] }));
    e = M.poolReducer(e, C.potAction(e, [9]));
    p = C.poolPanel(e);
    assert.equal(p.kind === 'shot' && p.callShot, true);
    assert.equal(p.kind === 'shot' && p.push, false);
    assert.equal(p.kind === 'shot' && p.solids, 'away', 'home took stripes');
    let t = M.poolInit({ game: 'ten', tenEarly: true });
    t = M.poolReducer(t, C.lagAction(t, 'home'));
    t = M.poolReducer(t, C.breakAction(t, { pots: [1] }));
    p = C.poolPanel(t);
    assert.equal(p.kind === 'shot' && p.safetyCall, false, 'WPA 6.5: no safety call at 10-ball');
    assert.equal(p.kind === 'shot' && p.tenCall, true, 'tenEarly: the scorer says when the 10 was the called ball');
  });

  test('a pending choice: who decides and the options, in plain words', () => {
    // 9-ball push-out
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }));
    s = M.poolReducer(s, C.pushAction(s, {}));
    const p = C.poolPanel(s);
    assert.deepEqual(p, { kind: 'choice', rack: 1, by: 'away', pending: 'push' });
    assert.deepEqual(C.choiceOptions(s, name).map((o) => [o.choice, o.breaker ?? null, o.label]), [
      ['play', null, 'Away plays from here'],
      ['pass', null, 'Away hands it back to Home'],
    ]);
    // 8-ball illegal break: accept, or re-rack with either breaker
    let e = M.poolInit({ game: 'eight' });
    e = M.poolReducer(e, C.lagAction(e, 'home'));
    e = M.poolReducer(e, C.breakAction(e, { illegal: true }));
    assert.deepEqual(C.choiceOptions(e, name).map((o) => [o.choice, o.breaker ?? null]), [['play', null], ['rerack', 'away'], ['rerack', 'home']]);
    for (const o of C.choiceOptions(e, name)) assert.notEqual(M.poolReducer(e, C.chooseAction(e, o.choice, o.breaker)), e, o.label);
    // 8 on a legal break (the breaker decides) / on a break foul (the opponent)
    let b8 = M.poolInit({ game: 'eight' });
    b8 = M.poolReducer(b8, C.lagAction(b8, 'home'));
    const legal8 = M.poolReducer(b8, C.breakAction(b8, { pots: [8] }));
    assert.deepEqual(C.poolPanel(legal8), { kind: 'choice', rack: 1, by: 'home', pending: 'eightBreak' });
    assert.deepEqual(C.choiceOptions(legal8, name).map((o) => o.choice), ['play', 'rerack']);
    const foul8 = M.poolReducer(b8, C.breakAction(b8, { pots: [8], foul: 'scratch' }));
    assert.deepEqual(C.choiceOptions(foul8, name).map((o) => [o.choice, o.breaker ?? null]), [['play', null], ['rerack', 'away'], ['rerack', 'home']]);
    for (const o of [...C.choiceOptions(legal8, name)]) assert.notEqual(M.poolReducer(legal8, C.chooseAction(legal8, o.choice, o.breaker)), legal8);
  });

  test('who breaks next is said in the break panel line', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 3 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    assert.equal(C.breakLine(s, name), 'Rack 1 · Home to break');
    s = M.poolReducer(s, C.rackAction(s, 'home'));
    assert.equal(C.breakLine(s, name), 'Rack 2 · Away to break (alternate)');
    let w = M.poolInit({ game: 'nine', raceTo: 3, breakFormat: 'winner' });
    w = M.poolReducer(w, C.lagAction(w, 'home'));
    w = M.poolReducer(w, C.rackAction(w, 'away'));
    assert.equal(C.breakLine(w, name), 'Rack 2 · Away to break (winner breaks)');
  });
});

describe('controls: rack-, set- and match-ending taps ask first', () => {
  test('outcomeOf tells what a tap would end; confirmFor words the question', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 2, setsToWin: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }));
    assert.deepEqual(C.outcomeOf(s, C.potAction(s, [2])), { accepted: true, ends: null });
    assert.equal(C.confirmFor(s, C.potAction(s, [2]), name), null);
    assert.deepEqual(C.outcomeOf(s, C.potAction(s, [9])), { accepted: true, ends: { kind: 'rack', rack: 1, winner: 'home', how: 'money' } });
    const q = C.confirmFor(s, C.potAction(s, [9]), name)!;
    assert.match(q.title, /Rack 1 to Home\?/);
    assert.match(q.message, /9/);
    s = M.poolReducer(s, C.potAction(s, [9]));
    // rack 2 closes set 1 (2–0); racks 3 and 4 make set 2 level at 1–1
    s = M.poolReducer(s, C.rackAction(s, 'home'));
    assert.match(C.confirmFor(M.poolReducer(s, C.rackAction(s, 'away')), C.rackAction(M.poolReducer(s, C.rackAction(s, 'away')), 'home'), name)?.title ?? '', /Rack 4 to Home/);
    s = M.poolReducer(s, C.rackAction(s, 'home'));
    assert.equal(s.sets.length, 1);
    s = M.poolReducer(s, C.rackAction(s, 'away'));
    assert.deepEqual(C.outcomeOf(s, C.rackAction(s, 'home'))?.ends, { kind: 'match', rack: 5, winner: 'home', how: 'quick', set: 2 });
    assert.match(C.confirmFor(s, C.rackAction(s, 'home'), name)!.title, /Home wins the match\?/);
    assert.deepEqual(C.outcomeOf(s, C.rackAction(s, 'away'))?.ends, { kind: 'set', rack: 5, winner: 'away', how: 'quick', set: 2 });
    assert.match(C.confirmFor(s, C.rackAction(s, 'away'), name)!.title, /Away wins set 2\?/);
    assert.deepEqual(C.outcomeOf(s, { type: 'MISS', side: 'away', payload: { rack: 1 } }), { accepted: false, ends: null });
  });

  test('a stalemate and an award mid-rack ask too (they replay or end a rack)', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }));
    assert.match(C.confirmFor(s, C.stalemateAction(s), name)!.title, /Stalemate/);
    assert.match(C.confirmFor(s, C.rackAction(s, 'away'), name)!.message, /award/i);
  });
});

describe('controls: the double-tap guard', () => {
  test('a second tap on the same state is dropped; an ignored tap is never sent and never blocks', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }));
    const guard = C.makeTapGuard(M.poolReducer);
    assert.equal(guard(s, C.missAction(s)), true);
    assert.equal(guard(s, C.missAction(s)), false, 'double tap');
    assert.equal(guard(s, C.potAction(s, [2])), false, 'any second tap before the state moved');
    const s2 = M.poolReducer(s, C.missAction(s));
    assert.equal(guard(s2, { type: 'MISS', side: 'home', payload: { rack: 1 } }), false, 'stale side: the engine would ignore it');
    assert.equal(guard(s2, C.missAction(s2)), true, 'the ignored tap did not block the next real one');
    // after an undo the state is a new object (replayed): taps go through again
    const undone = replay({ game: 'nine' }, [C.lagAction(M.poolInit({ game: 'nine' }), 'home')]);
    assert.equal(guard(undone, C.breakAction(undone, { pots: [] })), true);
  });
});

describe('controls: scotch doubles — who shoots', () => {
  test('the suggested shooter alternates within the side; the break alternates between partners', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 3, playersPerSide: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    assert.deepEqual(C.shooterPick(s, 'home', ['h1', 'h2']), { ids: ['h1', 'h2'], suggested: 'h1' });
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }, { pid: 'h1' }));
    assert.equal(C.shooterPick(s, 'home', ['h1', 'h2']).suggested, 'h2');
    s = M.poolReducer(s, C.potAction(s, [2], {}, { pid: 'h2' }));
    assert.equal(C.shooterPick(s, 'home', ['h1', 'h2']).suggested, 'h1');
    s = M.poolReducer(s, C.missAction(s, { pid: 'h1' }));
    assert.equal(C.shooterPick(s, 'away', ['a1', 'a2']).suggested, 'a1');
    // next rack: home's break goes to the partner who did not break last time
    s = M.poolReducer(s, C.rackAction(s, 'away'));
    s = M.poolReducer(s, C.rackAction(s, 'away'));
    assert.equal(s.rack!.breaker, 'home');
    assert.equal(C.shooterPick(s, 'home', ['h1', 'h2']).suggested, 'h2');
    // a roster bigger than two: the first two (the matchday pair) are offered
    assert.deepEqual(C.shooterPick(s, 'away', ['a1', 'a2', 'a3']).ids, ['a1', 'a2']);
    assert.deepEqual(C.shooterPick(s, 'away', []), { ids: [], suggested: null });
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: whole matches through the plugin's pure parts        */
/* ------------------------------------------------------------------ */

/** 9-ball, race to 2, singles (the controls send each side's one player id). */
const NINE2 = { game: 'nine', raceTo: 2 };
const H = { pid: 'h1' }, A = { pid: 'a1' };
const nineMatch = () => play(NINE2,
  // rack 1 — home breaks and runs out
  (x) => C.lagAction(x, 'home'),
  (x) => C.breakAction(x, { pots: [1] }, H),
  (x) => C.potAction(x, [2], {}, H),
  (x) => C.potAction(x, [3, 4], {}, H),
  (x) => C.potAction(x, [5], {}, H),
  (x) => C.potAction(x, [6, 7, 8], {}, H),
  (x) => C.potAction(x, [9], {}, H),
  // rack 2 — away: a golden break
  (x) => C.breakAction(x, { pots: [9] }, A),
  // rack 3 — home: dry break; away pushes out, home hands it back; away fouls three times
  (x) => C.breakAction(x, { pots: [] }, H),
  (x) => C.pushAction(x, {}, A),
  (x) => C.chooseAction(x, 'pass'),
  (x) => C.foulAction(x, 'scratch', {}, A),
  (x) => C.missAction(x, H),
  (x) => C.foulAction(x, 'scratch', {}, A),
  (x) => C.missAction(x, H),
  (x) => C.foulAction(x, 'wrongBall', {}, A),
);

describe('integration: a 9-ball match (break-and-run, golden break, three fouls)', () => {
  const { s, log, states } = nineMatch();
  test('score, result, line score, summary', () => {
    assert.equal(POOL_CORE.isComplete(s), true);
    assert.deepEqual(POOL_CORE.result!(s), { winner: 'home', home: 2, away: 1 });
    assert.equal(POOL_CORE.scoreLine!(s), '2-1');
    assert.equal(POOL_CORE.summary(s).homeScore, '2');
    assert.deepEqual(s.racks.map((r) => [r.winner, r.how, !!r.bnr, !!r.golden]), [['home', 'money', true, false], ['away', 'golden', true, true], ['home', 'threeFoul', false, false]]);
    assert.deepEqual(POOL_CORE.standingsUnits!(s), { games: { home: 2, away: 1 } });
  });
  test('the panel warned before the third foul', () => {
    const before = states[states.length - 2];
    const p = C.poolPanel(before);
    assert.equal(p.kind === 'shot' && p.twoFouls, true);
    assert.match(C.confirmFor(before, log[log.length - 1], name)!.title, /Home wins the match/);
  });
  test('statTotals: the side record + who shot (derived only: nothing was credited live)', () => {
    assert.ok(log.every((a) => !a.attribution && !a.attribution2));
    const t = POOL_CORE.statTotals!(s, ctx(['h1'], ['a1']));
    assert.deepEqual(t.h1, { side: 'home', stats: {
      racksWon: 2, racksLost: 1, racksBroken: 2, racksWonOnBreak: 2, breakAndRuns: 1, runOuts: 0, goldenBreaks: 0, threeFoulLosses: 0,
      detailRacks: 3, innings: 4,
      shotsPlayed: 7, potShots: 5, missShots: 2, safetyShots: 0, pushOuts: 0, ballsPotted: 8,
      fouls: 0, foulScratch: 0, foulWrongBall: 0, foulNoRail: 0, foulOffTable: 0, foulOther: 0,
      breakShots: 2, breakBalls: 1, dryBreaks: 1, breakFouls: 0, illegalBreaks: 0,
    } });
    assert.deepEqual(t.a1, { side: 'away', stats: {
      racksWon: 1, racksLost: 2, racksBroken: 1, racksWonOnBreak: 1, breakAndRuns: 1, runOuts: 0, goldenBreaks: 1, threeFoulLosses: 1,
      detailRacks: 3, innings: 4,
      shotsPlayed: 4, potShots: 0, missShots: 0, safetyShots: 0, pushOuts: 1, ballsPotted: 0,
      fouls: 3, foulScratch: 2, foulWrongBall: 1, foulNoRail: 0, foulOffTable: 0, foulOther: 0,
      breakShots: 1, breakBalls: 1, dryBreaks: 0, breakFouls: 0, illegalBreaks: 0,
    } });
  });
  test('records: biggest win, break-and-runs, the golden break', () => {
    const r = POOL_CORE.matchRecords!(s)!;
    assert.equal(r.v, 1);
    const of = (type: string) => r.items.filter((i) => i.type === type);
    assert.deepEqual(of('biggestWin'), [{ type: 'biggestWin', value: 1002, text: '2–1', side: 'home' }]);
    assert.deepEqual(of('breakAndRuns'), [
      { type: 'breakAndRuns', value: 1, text: '1 break-and-run', side: 'home', playerId: 'h1' },
      { type: 'breakAndRuns', value: 1, text: '1 break-and-run', side: 'away', playerId: 'a1' },
    ]);
    assert.deepEqual(of('goldenBreak'), [{ type: 'goldenBreak', value: 1, text: 'Golden break', side: 'away', note: 'rack 2', playerId: 'a1' }]);
    assert.deepEqual(of('runOuts'), []);
    assert.deepEqual(of('rackRun'), []);
    assert.equal(POOL_CORE.matchRecords!(states[5]), null, 'only a finished match has records');
  });
  test('undo label: the sport\'s own words for what Undo removes', () => {
    const step = (i: number) => ({ type: log[i].type, prev: states[i], next: states[i + 1] });
    const u = (i: number) => POOL_CORE.undoLabel!(step(i), nameOf);
    assert.equal(u(0), 'who breaks first');
    assert.equal(u(1), 'break · 1 ball · H1');
    assert.equal(u(2), 'pot 2 · H1');
    assert.equal(u(6), 'pot 9 · H1 · ends rack 1');
    assert.equal(u(7), 'break · 1 ball · A1 · ends rack 2');
    assert.equal(u(8), 'dry break · H1');
    assert.equal(u(9), 'push-out · A1');
    assert.equal(u(10), 'choice: hand back');
    assert.equal(u(11), 'foul: scratch · A1');
    assert.equal(u(12), 'miss · H1');
    assert.equal(u(15), 'foul: wrong ball first · A1 · ends the match');
    assert.equal(POOL_CORE.undoLabel!(null, nameOf), null);
    assert.equal(POOL_CORE.undoLabel!({ type: 'MISS', prev: states[3], next: states[3] }, nameOf), null);
  });
  test('commentary: rack by rack, newest first, plain sentences, no "undefined"', () => {
    const groups = poolFeed(s, NAMES, nameOf);
    assert.deepEqual(groups.map((g) => g.title), ['Rack 3', 'Rack 2', 'Rack 1']);
    assert.match(groups[0].subtitle ?? '', /Home won/);
    assert.match(groups[0].items[0].text, /three fouls/i);
    assert.match(groups[1].items[0].text, /golden break/i);
    assert.equal(groups[1].items[0].big, true);
    assert.match(groups[2].items[0].text, /break-and-run/i);
    assert.equal(groups[2].items.length, 7);
    const all = JSON.stringify(groups);
    assert.ok(!/undefined|NaN|null/.test(all), all);
  });
  test('stats panel: racks, the break, at the table, fouls — per side', () => {
    const cats = poolCompare(s);
    assert.deepEqual(cats.map((c) => c.id), ['racks', 'break', 'table', 'fouls']);
    const row = (cat: string, key: string) => cats.find((c) => c.id === cat)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('racks', 'racks').home, row('racks', 'racks').away], ['2', '1']);
    assert.deepEqual([row('racks', 'golden').home, row('racks', 'golden').away], ['0', '1']);
    assert.deepEqual([row('table', 'potPct').home, row('table', 'potPct').away], ['5/7 (71%)', '–']);
    assert.deepEqual([row('fouls', 'fouls').home, row('fouls', 'fouls').away], ['0', '3']);
    assert.equal(row('fouls', 'threeFoul').away, '1');
    const list = poolRackList(s, name);
    assert.deepEqual(list.map((r) => r.text), [
      'Rack 1 · Home broke · Home won · break-and-run',
      'Rack 2 · Away broke · Away won · golden break',
      'Rack 3 · Home broke · Home won · three fouls in a row by Away',
    ]);
  });
  test('involvedPlayerIds: the players the log credited (nothing is credited live, so the default would say nobody)', () => {
    assert.deepEqual(POOL_CORE.involvedPlayerIds!(s), ['h1', 'a1']);
    assert.deepEqual(POOL_CORE.involvedPlayerIds!(M.poolInit()), []);
    assert.deepEqual(POOL_CORE.involvedPlayerIds!(null as never), []);
  });
  test('the live settings: race and sets only (the game is locked), with the re-score warning', () => {
    const ls = POOL_CORE.liveSettings!;
    assert.equal(ls.mode, 'config');
    assert.deepEqual(ls.fields.map((f) => f.key), ['raceTo', 'setsToWin']);
    assert.deepEqual(ls.read(s), { raceTo: 2, setsToWin: 1 });
    assert.match(ls.hint ?? '', /re-scores/);
    assert.match(ls.hint ?? '', /game/i);
  });
  test('replay of the stored log (JSON) is identical, and every prefix is what the scorer saw (undo)', () => {
    assert.deepEqual(replay(NINE2, JSON.parse(JSON.stringify(log))), s);
    for (let k = 0; k <= log.length; k++) assert.deepEqual(replay(NINE2, log.slice(0, k)), states[k], `prefix ${k}`);
  });
});

describe('integration: 8-ball scotch doubles (who shot)', () => {
  const P = (pid: string) => ({ pid });
  const { s } = play({ game: 'eight', raceTo: 1, playersPerSide: 2 },
    (x) => C.lagAction(x, 'home'),
    (x) => C.breakAction(x, { pots: [3, 11] }, P('h1')),
    (x) => C.potAction(x, [1], {}, P('h2')),
    (x) => C.potAction(x, [2], {}, P('h1')),
    (x) => C.missAction(x, P('h2')),
    (x) => C.potAction(x, [9], {}, P('a1')),
    (x) => C.safetyAction(x, [], P('a2')),
    (x) => C.foulAction(x, 'scratch', {}, P('h1')),
    (x) => C.potAction(x, [10], {}, P('a1')),
    (x) => C.potAction(x, [12], {}, P('a2')),
    (x) => C.potAction(x, [13], {}, P('a1')),
    (x) => C.potAction(x, [14, 15], {}, P('a2')),
    (x) => C.potAction(x, [8], {}, P('a1')),
  );
  test('the result and each partner\'s own figures; the side record to both', () => {
    assert.deepEqual(POOL_CORE.result!(s), { winner: 'away', home: 0, away: 1 });
    const t = POOL_CORE.statTotals!(s, ctx(['h1', 'h2'], ['a1', 'a2']));
    const rec = { racksBroken: 0, racksWonOnBreak: 0, breakAndRuns: 0, runOuts: 0, eightLosses: 0, detailRacks: 1, innings: 2 };
    const zero = { shotsPlayed: 0, potShots: 0, missShots: 0, safetyShots: 0, ballsPotted: 0, fouls: 0, foulScratch: 0, foulWrongBall: 0, foulNoRail: 0, foulOffTable: 0, foulOther: 0, breakShots: 0, breakBalls: 0, dryBreaks: 0, breakFouls: 0, illegalBreaks: 0, eightBreaks: 0 };
    assert.deepEqual(t.h1, { side: 'home', partnerId: 'h2', stats: { racksWon: 0, racksLost: 1, ...rec, racksBroken: 1, ...zero, breakShots: 1, breakBalls: 2, shotsPlayed: 2, potShots: 1, ballsPotted: 1, fouls: 1, foulScratch: 1 } });
    assert.deepEqual(t.h2, { side: 'home', partnerId: 'h1', stats: { racksWon: 0, racksLost: 1, ...rec, racksBroken: 1, ...zero, shotsPlayed: 2, potShots: 1, ballsPotted: 1, missShots: 1 } });
    assert.deepEqual(t.a1, { side: 'away', partnerId: 'a2', stats: { racksWon: 1, racksLost: 0, ...rec, ...zero, shotsPlayed: 4, potShots: 4, ballsPotted: 4 } });
    assert.deepEqual(t.a2, { side: 'away', partnerId: 'a1', stats: { racksWon: 1, racksLost: 0, ...rec, ...zero, shotsPlayed: 3, potShots: 2, ballsPotted: 3, safetyShots: 1 } });
  });
  test('a doubles side with an unattributed shot: its players get the record, not a guessed split', () => {
    const t = POOL_CORE.statTotals!(s, ctx(['h1', 'h2'], ['a1', 'a2']));
    // the same match with one away shot sent without an id
    const log2 = nineLess();
    const t2 = POOL_CORE.statTotals!(log2, ctx(['h1', 'h2'], ['a1', 'a2']));
    assert.deepEqual(t2.h1, t.h1);
    assert.equal(t2.a1.stats.racksWon, 1);
    assert.equal('shotsPlayed' in t2.a1.stats, false);
    assert.equal('shotsPlayed' in t2.a2.stats, false);
  });
  /** the same 8-ball match, the away safety sent with no player id */
  function nineLess(): S {
    return play({ game: 'eight', raceTo: 1, playersPerSide: 2 },
      (x) => C.lagAction(x, 'home'),
      (x) => C.breakAction(x, { pots: [3, 11] }, P('h1')),
      (x) => C.potAction(x, [1], {}, P('h2')),
      (x) => C.potAction(x, [2], {}, P('h1')),
      (x) => C.missAction(x, P('h2')),
      (x) => C.potAction(x, [9], {}, P('a1')),
      (x) => C.safetyAction(x, []),
      (x) => C.foulAction(x, 'scratch', {}, P('h1')),
      (x) => C.potAction(x, [10], {}, P('a1')),
      (x) => C.potAction(x, [12], {}, P('a2')),
      (x) => C.potAction(x, [13], {}, P('a1')),
      (x) => C.potAction(x, [14, 15], {}, P('a2')),
      (x) => C.potAction(x, [8], {}, P('a1')),
    ).s;
  }
  test('the box: one row per player who shot (doubles)', () => {
    const box = poolBox(s, { homeRoster: [{ id: 'h1', fullName: 'H One' }, { id: 'h2', fullName: 'H Two' }] as never, awayRoster: [{ id: 'a1', fullName: 'A One' }, { id: 'a2', fullName: 'A Two' }] as never, nameOf });
    assert.equal(box.players, true);
    const d = box.data('all');
    assert.deepEqual(d.home.rows.map((r) => [r.playerId, r.stats.ballsPotted]), [['h1', 1], ['h2', 1]]);
    assert.deepEqual(d.away.rows.map((r) => [r.playerId, r.stats.ballsPotted]), [['a1', 4], ['a2', 3]]);
    assert.deepEqual(d.away.teamStats, { racksWon: 1 });
  });
  test('commentary names who shot', () => {
    const items = poolFeed(s, NAMES, nameOf)[0].items;
    assert.match(items[0].text, /A1/);
    const brk = items.find((i) => /break/i.test(i.text) && i.side === 'home')!;
    assert.match(brk.text, /H1/);
  });
});

describe('integration: sets, quick racks and mixed modes', () => {
  test('best of 3 sets, race to 2, quick racks with flags: result = sets, line score per set, set-level panel', () => {
    const { s } = play({ game: 'nine', raceTo: 2, setsToWin: 2 },
      (x) => C.rackAction(x, 'home', { breaker: 'home', bnr: true }),
      // a golden break names its breaker (here home breaks out of turn: the scorer says so)
      (x) => C.rackAction(x, 'home', { golden: true, breaker: 'home' }),
      (x) => C.rackAction(x, 'away'),
      (x) => C.rackAction(x, 'away', { runOut: true, breaker: 'home' }),
      (x) => C.rackAction(x, 'away'),
      (x) => C.rackAction(x, 'home'),
      (x) => C.rackAction(x, 'home'),
    );
    assert.deepEqual(POOL_CORE.result!(s), { winner: 'home', home: 2, away: 1 });
    assert.equal(POOL_CORE.scoreLine!(s), '2-0, 0-2, 2-1');
    const ls = POOL_CORE.lineScore!(s)!;
    assert.equal(ls.unit, 'set');
    assert.deepEqual(POOL_CORE.standingsUnits!(s), { games: { home: 4, away: 3 }, sets: { home: 2, away: 1 } });
    const t = POOL_CORE.statTotals!(s, ctx(['h1'], ['a1']));
    assert.equal(t.h1.stats.setsWon, 2);
    assert.equal(t.a1.stats.setsLost, 2);
    assert.equal(t.h1.stats.breakAndRuns, 2, 'the golden break is a break-and-run too');
    assert.equal(t.h1.stats.goldenBreaks, 1);
    assert.equal('shotsPlayed' in t.h1.stats, false, 'quick racks: no shot figures (not tracked, never 0)');
    assert.equal('innings' in t.h1.stats, false);
    // panel per set
    assert.deepEqual(C.setUnits(s), [{ key: 'all', label: 'Match' }, { key: '1', label: 'Set 1' }, { key: '2', label: 'Set 2' }, { key: '3', label: 'Set 3' }]);
    const set2 = poolCompare(s, 2);
    const racks = set2.find((c) => c.id === 'racks')!.rows.find((r) => r.key === 'racks')!;
    assert.deepEqual([racks.home, racks.away], ['0', '2']);
    assert.equal(set2.some((c) => c.id === 'table'), false, 'no detail in quick racks: the row is left out');
    const r = POOL_CORE.matchRecords!(s)!;
    assert.deepEqual(r.items.filter((i) => i.type === 'biggestWin').map((i) => [i.text, i.note]), [['2–0', 'set 1'], ['2–0', 'set 2'], ['2–1', 'set 3']]);
    assert.deepEqual(r.items.filter((i) => i.type === 'rackRun').map((i) => [i.value, i.side]), [[3, 'away']]);
    assert.deepEqual(r.items.filter((i) => i.type === 'runOuts').map((i) => [i.value, i.side]), [[1, 'away']]);
  });

  test('a 10-ball rack in detail then a quick rack: detail figures cover the detailed rack only', () => {
    const { s } = play({ game: 'ten', raceTo: 2 },
      (x) => C.lagAction(x, 'away'),
      (x) => C.breakAction(x, { pots: [2, 10] }),
      (x) => C.potAction(x, [1]),
      (x) => C.safetyAction(x),
      (x) => C.potAction(x, [3, 4, 5, 6, 7, 8, 9]),
      (x) => C.potAction(x, [10]),
      (x) => C.rackAction(x, 'away'),
    );
    assert.equal(POOL_CORE.result!(s), null, 'not over yet (1–1)');
    const t = POOL_CORE.statTotals!(s, ctx(['h1'], ['a1']));
    assert.equal(t.h1.stats.detailRacks, 1, 'one rack in detail, one quick');
    assert.equal(t.h1.stats.ballsPotted, 8);
    assert.equal(t.h1.stats.runOuts, 1, 'home won rack 1 in its first visit');
    assert.deepEqual([t.a1.stats.breakBalls, t.a1.stats.ballsPotted, t.a1.stats.safetyShots], [2, 1, 1]);
    const set = poolCompare(s);
    assert.match(set.find((c) => c.id === 'table')!.rows[0].note ?? '', /1 of 2 racks/);
  });
});

describe('integration: 10-ball and the on-the-break 10', () => {
  test('the 10 on the break is spotted and the breaker continues; a called last 10 wins', () => {
    const { s } = play({ game: 'ten', raceTo: 1 },
      (x) => C.lagAction(x, 'away'),
      (x) => C.breakAction(x, { pots: [2, 10] }),
      (x) => C.potAction(x, [1]),
      (x) => C.potAction(x, [3, 4, 5, 6, 7, 8, 9]),
      (x) => C.potAction(x, [10]),
    );
    assert.deepEqual(POOL_CORE.result!(s), { winner: 'away', home: 0, away: 1 });
    assert.equal(s.racks[0].bnr, true);
    const t = POOL_CORE.statTotals!(s, ctx(['h1'], ['a1']));
    assert.equal(t.a1.stats.ballsPotted, 9);
    assert.equal(t.a1.stats.breakBalls, 2);
    assert.equal('goldenBreaks' in t.a1.stats, false, 'golden breaks are 9-ball only');
    assert.equal(t.a1.stats.pushOuts, 0, 'push-outs exist at 10-ball');
  });
});

describe('the Scoreboard status and best-of line', () => {
  test('status from the engine summary; the race / sets line', () => {
    const s = M.poolInit({ game: 'nine', raceTo: 7, setsToWin: 2 });
    assert.equal(C.boardStatus(s), '9-Ball · Set 1 · Rack 1');
    assert.equal(C.bestOfLine(s), 'best of 3 sets · race to 7');
    assert.equal(C.bestOfLine(M.poolInit({ game: 'eight', raceTo: 5 })), 'race to 5');
  });
});

/* ------------------------------------------------------------------ */
/*  Breaks (docs/security/breaks/pool-app.md): one test per point     */
/* ------------------------------------------------------------------ */

/** A real match state and hostile / old snapshots of it. */
function hostileSnapshots(): unknown[] {
  let base = M.poolInit({ game: 'nine', raceTo: 2 });
  base = M.poolReducer(base, C.lagAction(base, 'home'));
  base = M.poolReducer(base, C.breakAction(base, { pots: [1] }, { pid: 'h1' }));
  return [
    null, undefined, 0, 'x', [], {}, { rack: 5 }, { rack: { n: 'x', table: 'y', pending: { kind: 'push', by: 'home' } } },
    { ...base, rack: { ...base.rack, pending: { kind: 'nope', by: 'x' } } },
    { ...base, rack: { ...base.rack, table: null, shooter: 'nobody' } },
    { ...base, fmt0: { raceTo: '__proto__', setsToWin: {} } },
    { ...base, feed: [{ n: 1, t: 'POT', b: [14, 15] }, null, { n: 1e300, t: 'MISS' }], rat: 'x' },
    { ...base, racks: [null, { winner: 'home', n: 'x', innings: 5 }, { winner: 'away' }], sets: [[1, 'x']], game: '__proto__' },
    { ...base, raceTo: Infinity, setsToWin: NaN, current: null, setsWon: 'x' },
    { ...base, ended: true, racks: [{ winner: 'home', n: 1, how: 7, bnr: true, golden: 'yes' }], sets: [[2, 1], null, 'x'] },
  ];
}
const READERS: Record<string, (s: never) => unknown> = {
  panel: (s) => C.poolPanel(s), choices: (s) => C.choiceOptions(s, name), question: (s) => C.choiceQuestion(s, name),
  breakLine: (s) => C.breakLine(s, name), note: (s) => C.formatNote(s), units: (s) => C.setUnits(s), bestOf: (s) => C.bestOfLine(s),
  status: (s) => C.boardStatus(s), feed: (s) => poolFeed(s, NAMES, nameOf), compare: (s) => poolCompare(s), compareSet: (s) => poolCompare(s, 1),
  racks: (s) => poolRackList(s, name), box: (s) => poolBox(s, {}).data('all'), records: (s) => POOL_CORE.matchRecords!(s),
  undo: (s) => POOL_CORE.undoLabel!({ type: 'POT', prev: M.poolInit(), next: s }, nameOf), totals: (s) => POOL_CORE.statTotals!(s, ctx(['h1'], ['a1'])),
  units2: (s) => POOL_CORE.standingsUnits!(s), confirm: (s) => C.confirmFor(s, { type: 'RACK', side: 'home', payload: { rack: 1 } }, name),
  shooter: (s) => C.shooterPick(s, 'home', ['h1', 'h2']), stamp: (s) => C.missAction(s), reducer: (s) => M.poolReducer(s, { type: 'MISS', side: 'home', payload: { rack: 1 } }),
  live: (s) => POOL_CORE.liveSettings!.read(s), summary: (s) => POOL_CORE.summary(s), lineScore: (s) => POOL_CORE.lineScore!(s),
};

describe('breaks · hostile and old snapshots (#24, #25, #28)', () => {
  test('#24 — no reader throws on a hostile snapshot', () => {
    for (const [k, f] of Object.entries(READERS)) {
      hostileSnapshots().forEach((h, i) => assert.doesNotThrow(() => f(h as never), `${k} on snapshot ${i}`));
    }
  });
  test('#25 — no reader prints undefined / NaN / Infinity / [object …] / __proto__, or a ball the game doesn\'t have', () => {
    for (const [k, f] of Object.entries(READERS)) {
      if (k === 'reducer') continue; // hands a refused state back as it is
      hostileSnapshots().forEach((h, i) => {
        const out = JSON.stringify(f(h as never)) ?? '';
        assert.ok(!/undefined|NaN|Infinity|\[object|__proto__/.test(out), `${k} on snapshot ${i}: ${out.slice(0, 200)}`);
      });
    }
    const nine = hostileSnapshots()[11] as S;
    assert.ok(!/\b1[45]\b/.test(JSON.stringify(poolFeed(nine, NAMES, nameOf))), 'a 9-ball feed never shows the 14 or 15');
  });
  test('#29 — a 10,000-event log replays fast, and exactly as a replay from stored JSON does', () => {
    const config = { game: 'nine', raceTo: 99, setsToWin: 9, playersPerSide: 2 };
    let s = M.poolInit(config);
    const log: ScoreAction[] = [];
    while (log.length < 10_000 && !s.ended) {
      const p = C.poolPanel(s);
      const pid = { pid: log.length % 2 ? 'h1' : 'h2', at: 1_700_000_000_000 + log.length };
      const a = p.kind === 'lag' ? C.lagAction(s, 'home') : p.kind === 'break' ? C.breakAction(s, { pots: [] }, pid)
        : p.kind === 'choice' ? C.chooseAction(s, 'play') : p.kind === 'shot' ? (log.length % 7 === 0 ? C.potAction(s, [p.table[0]], {}, pid) : C.safetyAction(s, [], pid)) : null;
      if (!a) break;
      log.push(a);
      s = M.poolReducer(s, a);
    }
    const t0 = performance.now();
    const again = log.reduce<S>((x, a) => M.poolReducer(x, a), M.poolInit(config));
    const ms = performance.now() - t0;
    assert.deepEqual(again, s);
    assert.ok(ms < 250, `10,000 events took ${ms.toFixed(0)} ms`); // was ~580 ms before the fix
    // the same steps, each from a JSON copy of the state (a stored snapshot): same result
    let j = M.poolInit(config);
    for (const a of log.slice(0, 600)) j = M.poolReducer(JSON.parse(JSON.stringify(j)), a);
    assert.deepEqual(j, log.slice(0, 600).reduce<S>((x, a) => M.poolReducer(x, a), M.poolInit(config)));
  });
  test('#3 — a confirm answered after the match moved is dropped (the question was about another state)', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [1] }));
    const asked = s; // "Rack 1 to Home?" is on screen …
    const tap = C.potAction(asked, [9]);
    // … meanwhile another phone records a miss, then an undo brings the same position back (a new object)
    const moved = M.poolReducer(s, C.missAction(s));
    const back = replay({ game: 'nine' }, [C.lagAction(M.poolInit({ game: 'nine' }), 'home'), C.breakAction(asked, { pots: [1] })]);
    const guard = C.makeTapGuard(M.poolReducer);
    assert.equal(guard(moved, tap, { asked }), false, 'the shooter changed: dropped');
    assert.equal(guard(back, tap, { asked }), false, 'even an identical-looking state is not the one asked about');
    assert.equal(guard(asked, tap, { asked }), true, 'unchanged: sent');
  });
  test('#4 — the guard never blocks for good: a tap on an unchanged screen goes through again after 2 s', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    const guard = C.makeTapGuard(M.poolReducer);
    const a = C.breakAction(s, { pots: [] });
    assert.equal(guard(s, a, { now: 10_000 }), true);
    assert.equal(guard(s, a, { now: 10_400 }), false, 'a double tap');
    assert.equal(guard(s, a, { now: 12_100 }), true, 'the screen never moved: the scorer can tap again');
  });
  test('#8 — a duplicated LAG (same breaker) changes nothing; a LAG that names the other breaker still fixes it', () => {
    let s = M.poolInit({ game: 'nine' });
    const lag = C.lagAction(s, 'home');
    s = M.poolReducer(s, lag);
    assert.equal(M.poolReducer(s, lag), s, 'the duplicate is ignored');
    assert.equal(M.poolReducer(s, { ...lag, payload: { ...lag.payload, breaks: 'home' } }), s);
    const fixed = M.poolReducer(s, C.lagAction(s, 'away'));
    assert.notEqual(fixed, s);
    assert.equal(fixed.rack!.breaker, 'away');
    assert.deepEqual(M.feedOf(fixed).map((e) => [e.t, e.s]), [['LAG', 'home'], ['LAG', 'away']]);
  });
  test('#12 — at most 4 player ids per side: the rest count as unattributed', () => {
    let s = M.poolInit({ game: 'nine', raceTo: 9, playersPerSide: 2 });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    s = M.poolReducer(s, C.breakAction(s, { pots: [] }, { pid: 'h0' }));
    for (let i = 1; i <= 12; i++) {
      s = M.poolReducer(s, C.safetyAction(s, [], { pid: `${s.rack!.shooter![0]}${i}` }));
    }
    const cr = M.creditOf(s);
    assert.ok(cr.ids.home.length <= M.MAX_IDS_PER_SIDE && cr.ids.away.length <= M.MAX_IDS_PER_SIDE);
    assert.ok(cr.unk.home + cr.unk.away > 0);
    assert.ok(cr.by.length <= 2 * M.MAX_IDS_PER_SIDE);
  });
  test('#20 / #21 — a race lowered then raised back replays to exactly the same match', () => {
    const { s, log } = nineMatch();
    const lowered = replay({ game: 'nine', raceTo: 1 }, log);
    assert.equal(lowered.ended, true, 'race to 1: rack 1 ends it');
    assert.match(C.formatNote(lowered) ?? '', /race to 1.*race to 2/);
    assert.deepEqual(replay(NINE2, log), s, 'raised back: identical');
  });
  test('#22 — players per side changed on a replay: no throw, totals stay valid', () => {
    const { log } = nineMatch();
    const d = replay({ ...NINE2, playersPerSide: 2 }, log);
    const t = POOL_CORE.statTotals!(d, ctx(['h1', 'h2'], ['a1', 'a2']));
    for (const e of Object.values(t)) for (const v of Object.values(e.stats)) assert.ok(Number.isFinite(v) && v >= 0);
    assert.equal(t.h2.stats.shotsPlayed, 0, 'every shot carried h1');
  });
  test('#27 — a huge stored feed is read in part only', () => {
    let s = M.poolInit({ game: 'nine' });
    s = M.poolReducer(s, C.lagAction(s, 'home'));
    const big = { ...s, feed: Array.from({ length: 200_000 }, () => ({ n: 1, t: 'MISS', s: 'home' })) } as S;
    const t0 = performance.now();
    assert.ok(M.feedOf(big).length <= (M.FEED_RACKS + 1) * M.FEED_PER_RACK);
    const next = M.poolReducer(big, C.breakAction(big, { pots: [] }));
    assert.ok(M.feedOf(next).length <= M.FEED_PER_RACK);
    assert.ok(performance.now() - t0 < 200);
  });
  test('#28 — an engine-only snapshot (no plugin parts) reads as an empty credit / feed', async () => {
    const engine = await import('../src/sports/pool/engine.ts');
    let e = engine.createInitialState({ game: 'nine', raceTo: 1 });
    e = engine.reducer(e, { type: 'LAG', side: 'home', payload: {} });
    e = engine.reducer(e, { type: 'BREAK', side: 'home', payload: { pots: [9] } });
    const s = e as S;
    assert.deepEqual(M.creditOf(s).ids, { home: [], away: [] });
    assert.deepEqual(M.feedOf(s), []);
    assert.equal(poolFeed(s, NAMES, nameOf)[0].items[0].text, 'Rack 1 to Home (golden break)');
    assert.deepEqual(POOL_CORE.statTotals!(s, ctx(['h1'], ['a1'])).h1.stats.goldenBreaks, 1);
  });
});
