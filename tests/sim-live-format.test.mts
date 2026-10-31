/**
 * Quality mandate step 6 for B6 / T9 (docs/security/breaks/mvp-live-format.md):
 * 500 live badminton / tennis matches, each with a random format change at a
 * random moment. An allowed change keeps every tap (every point counted, the
 * match still going) and the marker row never changes the board; a refused
 * change is one that would end the match or lose taps; undoing (old format,
 * marker gone) gives back exactly the board from before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveLog } from '../src/data/eventLog.ts';
import { formatChangePreview } from '../src/data/formatChange.ts';
import { FORMAT_TYPE } from '../src/sports/amend.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import type { MatchEventRecord } from '../src/core/types.ts';

let seed = 53;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
type P = { createInitialState: (c?: Record<string, unknown>) => unknown; reducer: never; isComplete: (s: never) => boolean };
const sports: { name: string; plugin: P; configs: Record<string, unknown>[]; points: (s: never) => number }[] = [
  {
    name: 'badminton',
    plugin: { createInitialState: badminton.init, reducer: badminton.reducer as never, isComplete: (s: badminton.BadmintonState) => s.ended } as unknown as P,
    configs: [{ pointsPerGame: 21 }, { pointsPerGame: 15 }, { pointsPerGame: 11 }, { pointsPerGame: 21, gamesToWin: 3 }],
    points: ((s: badminton.BadmintonState) => s.games.reduce((n, g) => n + g[0] + g[1], 0) + s.current.home + s.current.away) as never,
  },
  {
    name: 'tennis',
    plugin: { createInitialState: tennis.init, reducer: tennis.reducer as never, isComplete: (s: tennis.TennisState) => s.ended } as unknown as P,
    configs: [{}, { setsToWin: 1 }, { setsToWin: 3 }],
    points: ((s: tennis.TennisState) => s.events.filter((e) => e.kind === 'point' || e.kind === 'ace').length) as never,
  },
];

test('500 live matches with a random format change', () => {
  let allowed = 0, refused = 0;
  for (let i = 0; i < 500; i++) {
    const sp = sports[i % sports.length];
    const from = sp.configs[rnd(sp.configs.length)];
    const to = sp.configs[rnd(sp.configs.length)];
    const log: MatchEventRecord[] = [];
    let s = sp.plugin.createInitialState(from);
    const n = 1 + rnd(sp.name === 'tennis' ? 120 : 60);
    for (let k = 0; k < n && !sp.plugin.isComplete(s as never); k++) {
      const e: MatchEventRecord = { seq: k + 1, type: 'POINT', side: rnd(2) ? 'home' : 'away', payload: {}, attribution: null };
      log.push(e);
      s = (sp.plugin.reducer as (s: unknown, a: unknown) => unknown)(s, { type: 'POINT', side: e.side });
    }
    if (sp.plugin.isComplete(s as never)) continue;
    const p = formatChangePreview(sp.plugin as never, to, log);
    if (p.ok) {
      allowed++;
      assert.equal(p.dropped, 0);
      assert.equal(sp.points(p.state as never), log.length, `${sp.name}: every tap counts`);
      const marked = [...log, { seq: log.length + 1, type: FORMAT_TYPE, side: null, payload: { patch: to, prev: from }, attribution: null } as MatchEventRecord];
      assert.deepEqual(deriveLog(sp.plugin as never, to, marked).state, p.state, 'the marker never changes the board');
    } else {
      refused++;
      assert.ok(p.dropped > 0 || sp.plugin.isComplete(p.state as never));
    }
    assert.deepEqual(deriveLog(sp.plugin as never, from, log).state, s, 'undo gives back the board from before');
  }
  assert.ok(allowed > 0 && refused > 0, `covers both: ${allowed} allowed, ${refused} refused`);
});
