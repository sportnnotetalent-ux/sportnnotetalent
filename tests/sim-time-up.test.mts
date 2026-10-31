/**
 * Quality mandate step 6 for "Time up" (docs/security/breaks/mvp-time-up.md):
 * 500 padel, tennis and badminton matches each stopped at a random moment.
 * The time-up winner is always the side ahead on sets / games, then on all
 * games / points; level gives no winner; the result line, scoreline mark and
 * profile results agree with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeUpLeader } from '../src/core/timeUp.ts';
import { manualResultLine } from '../src/core/matchResult.ts';
import { resultMark } from '../src/sports/scoreline.ts';
import { sideResults } from '../src/data/appearances.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { LineScore } from '../src/sports/scoreline.ts';

let seed = 29;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k; };
type Engine = { init: (c?: Record<string, unknown>) => unknown; reducer: (s: never, a: ScoreAction) => unknown; lineScore: (s: never) => LineScore | null };
const engines: [string, Engine][] = [['padel', padel as unknown as Engine], ['tennis', tennis as unknown as Engine], ['badminton', badminton as unknown as Engine]];

test('500 matches stopped on time', () => {
  let levels = 0, decided = 0;
  for (let i = 0; i < 500; i++) {
    const [sport, e] = engines[i % engines.length];
    let s = e.init({});
    const stopAt = rnd(sport === 'badminton' ? 90 : 160);
    for (let n = 0; n < stopAt; n++) {
      const next = e.reducer(s as never, { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction) as { ended?: boolean };
      if (next.ended) break;
      s = next;
    }
    const ls = e.lineScore(s as never);
    assert.ok(ls, `${sport}: no line score`);
    const w = timeUpLeader(ls);
    const cells = ls!.current ? [...ls!.done, ls!.current] : ls!.done;
    const g = cells.reduce((t, c) => ({ h: t.h + c.home, a: t.a + c.away }), { h: 0, a: 0 });
    if (ls!.won.home !== ls!.won.away) assert.equal(w, ls!.won.home > ls!.won.away ? 'home' : 'away');
    else if (g.h !== g.a) assert.equal(w, g.h > g.a ? 'home' : 'away');
    else assert.equal(w, null);
    const r = { kind: 'time_up' as const, reason: 'Time up', ...(w ? { winner: w } : {}) };
    const line = manualResultLine(r, 'Asha', 'Bina', { retireTerms: true });
    assert.equal(line, w ? `${w === 'home' ? 'Asha' : 'Bina'} won on time` : 'Level when time ran out — match drawn');
    assert.equal(resultMark({ result: r }), '(time)');
    const sides = sideResults({ sport, status: 'completed', winner: w ?? 'draw', result: r } as never);
    assert.deepEqual(sides, w ? (w === 'home' ? { home: 'W', away: 'L' } : { home: 'L', away: 'W' }) : { home: 'D', away: 'D' });
    if (w) decided++; else levels++;
  }
  assert.ok(decided > 0 && levels > 0, `covers both: ${decided} decided, ${levels} level`);
});
