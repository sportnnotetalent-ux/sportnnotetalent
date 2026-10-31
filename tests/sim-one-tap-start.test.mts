/**
 * Quality mandate step 6 for one-tap start (docs/security/breaks/one-tap-start.md):
 * 500 badminton / tennis / padel matches started with one tap for a random
 * server, then played to the end at random: the first point is served by the
 * picked side, and every match finishes. 500 kabaddi halves started with one
 * tap run their clock from that moment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startActions } from '../src/core/startStep.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as kabaddi from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 101;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
type E = { init: (c?: object) => any; reducer: (s: any, a: ScoreAction) => any; serveInfo?: (s: any) => { side: string } };

test('500 racket matches started with one tap', () => {
  const engines: [string, E][] = [['badminton', badminton as unknown as E], ['tennis', tennis as unknown as E], ['padel', padel as unknown as E]];
  for (let i = 0; i < 500; i++) {
    const [name, e] = engines[i % 3];
    const side = rnd(2) ? 'home' : 'away';
    let s = startActions('serve', { side, now: 0 }).reduce((x, a) => e.reducer(x, a), e.init({}));
    assert.equal(s.serverPicked, true, name);
    if (e.serveInfo) assert.equal(e.serveInfo(s).side, side, `${name}: the picked side serves first`);
    else assert.equal(s.firstServer, side);
    let n = 0;
    while (!s.ended && n++ < 3000) s = e.reducer(s, { type: 'POINT', side: rnd(2) ? 'home' : 'away' } as ScoreAction);
    assert.equal(s.ended, true, `${name} finishes`);
  }
});

test('500 kabaddi halves started with one tap', () => {
  for (let i = 0; i < 500; i++) {
    const at = 1_000 + rnd(1_000_000);
    const s = startActions('clock', { now: at }).reduce((x, a) => kabaddi.reducer(x, a), kabaddi.init({}));
    assert.equal(s.startedAt, at);
  }
});
