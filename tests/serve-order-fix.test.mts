/**
 * MVP T3 (docs/security/breaks/mvp-p1-batch6.md) — tennis / padel doubles:
 *  - the receiving pair may pick its serving order until its first service
 *    game (game 2 of the set), not just before game 1;
 *  - a `v:2` "fix serving order" is accepted mid-set: the score never moves,
 *    the rotation follows the fix, and that set's aces / double faults move to
 *    the partner (rally points never do);
 *  - older logs (no v:2) replay as before.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { serveOrderOpenFor } from '../src/sports/serve.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = <S,>(r: (s: S, a: ScoreAction) => S, s: S, ...a: ScoreAction[]) => a.reduce(r, s);
const P = (side: Side): ScoreAction => ({ type: 'POINT', side } as ScoreAction);
const ACE = (side: Side, id: string, sport: string): ScoreAction => sport === 'padel'
  ? ({ type: 'POINT', side, attribution: { playerId: id, stat: 'points' }, payload: { pd: { how: 'ace' } } } as ScoreAction)
  : ({ type: 'ACE', side, attribution: { playerId: id, stat: 'aces' } } as ScoreAction);
const isAce = (x: { kind?: string; pd?: { how?: string } }) => x.kind === 'ace' || x.pd?.how === 'ace';
const DF = (server: Side, id: string): ScoreAction => ({ type: 'POINT', side: server === 'home' ? 'away' : 'home', payload: { df: true }, attribution2: { playerId: id, stat: 'doubleFaults' } } as ScoreAction);
const HIT = (side: Side, id: string): ScoreAction => ({ type: 'POINT', side, attribution: { playerId: id, stat: 'points' } } as ScoreAction);
const game = (side: Side) => [P(side), P(side), P(side), P(side)];
const ORDER = (side: Side, slot: 0 | 1, fix?: { playerId: string; partnerId: string }): ScoreAction =>
  ({ type: 'SET_SERVE_ORDER', payload: { side, slot, ...(fix ? { ...fix, v: 2 } : {}) } } as ScoreAction);

for (const [name, e] of [['tennis', tennis], ['padel', padel]] as const) {
  const r = e.reducer as unknown as (s: unknown, a: ScoreAction) => tennis.TennisState;
  const dbl = () => e.init({ playersPerSide: 2, doubles: true }) as unknown as tennis.TennisState;

  describe(`${name}: T3c — the receiving pair picks until its first service game`, () => {
    test('during game 1 the receivers may still pick; the servers may not', () => {
      const s = run(r, dbl(), P('home'));
      assert.equal(serveOrderOpenFor(s, 'away'), true);
      assert.equal(serveOrderOpenFor(s, 'home'), false);
      const t = run(r, s, ORDER('away', 1), ...game('home').slice(1));
      assert.deepEqual(e.serveInfo(t as never), { side: 'away', slot: 1 });
    });
    test('closed once game 2 starts', () => {
      const s = run(r, dbl(), ...game('home'), P('away'));
      assert.equal(serveOrderOpenFor(s, 'away'), false);
      assert.equal(run(r, s, ORDER('away', 1)).serveOrder?.[0]?.away, undefined);
    });
  });

  describe(`${name}: T3a / T3b — a mid-set fix`, () => {
    // home pair h1 / h2 (roster order), away a1 / a2; nobody picked → h1 serves game 1
    const played = () => run(r, dbl(), ACE('home', 'h1', name), HIT('home', 'h2'), DF('home', 'h1'), P('home'), P('home'), ...game('away'), ...game('home'));
    test('without v:2 a late pick is still ignored (older logs)', () => {
      const s = played();
      assert.deepEqual(run(r, s, ORDER('home', 1)).serveOrder, s.serveOrder);
    });
    test('v:2 moves the rotation, keeps the score, re-credits aces and double faults', () => {
      const s = played();
      const f = run(r, s, ORDER('home', 1, { playerId: 'h2', partnerId: 'h1' }));
      assert.deepEqual([f.games, f.pts, f.sets], [s.games, s.pts, s.sets]);
      // home served games 1 and 3 (h1, h2); its next game (5) now goes to h1's partner order: h2
      assert.deepEqual(e.serveInfo(run(r, s, ...game('away')) as never), { side: 'home', slot: 0 }, 'before the fix: h1');
      assert.deepEqual(e.serveInfo(run(r, f, ...game('away')) as never), { side: 'home', slot: 1 }, 'after the fix: h2');
      const ace = f.events.find(isAce as never)!;
      const df = f.events.find((x) => (x as { df?: unknown }).df) as { df: { playerId: string } };
      const hit = f.events.find((x) => x.kind === 'point' && x.playerId === 'h2' && !(x as { df?: unknown }).df && !isAce(x as never));
      assert.equal(ace.playerId, 'h2');
      assert.equal(df.df.playerId, 'h2');
      assert.ok(hit, 'a rally point stays on its hitter');
    });
    test('fixing to the same order changes nothing', () => {
      const s = played();
      assert.deepEqual(run(r, s, ORDER('home', 0, { playerId: 'h1', partnerId: 'h2' })).events, s.events);
    });
  });
}

test('the picker offers the fix after the set starts', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/sports/ServeOrderPicker.tsx'), 'utf8');
  assert.match(src, /Fix serving order/);
  assert.match(src, /serveOrderAction\(t, slot, p, roster\[1 - slot\]\)/);
});
