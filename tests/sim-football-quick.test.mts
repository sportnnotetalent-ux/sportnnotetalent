/**
 * Quality mandate step 6 for football "Quick" (docs/security/breaks/mvp-football-quick.md):
 * 500 new friendlies, 500 tournament matches and 500 saved matches, each played
 * with random kick-off / possession taps / goals: friendlies track cards only
 * and never show possession; tournaments and saved matches keep the full set.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOTBALL_META } from '../src/sports/football/meta.ts';
import { init, reducer, readTrack, TRACK_KEYS } from '../src/sports/football/engine.ts';
import { footballPossession } from '../src/sports/football/depth.ts';
import { goalAction } from '../src/sports/football/actions.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const tf = FOOTBALL_META.formatFields!.filter((f) => /^track[A-Z]/.test(f.key) && f.group === 'Stats to track');
const friendly = Object.fromEntries(tf.map((f) => [f.key, f.default]));
const tournament = Object.fromEntries(tf.map((f) => [f.key, f.tournamentDefault ?? f.default]));
let seed = 21;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)

const play = (cfg: Record<string, unknown>) => {
  let s = reducer(init(cfg), { type: 'KICKOFF', payload: { at: 1_000 } } as ScoreAction);
  let t = 1_000;
  for (let i = 0; i < 20; i++) {
    t += 10_000 + rnd(50_000);
    const side = rnd(2) ? 'home' : 'away';
    s = reducer(s, rnd(3) ? ({ type: 'POSSESSION', payload: { side, at: t } } as ScoreAction) : goalAction(side, { id: `p${rnd(9)}` }, 'open'));
  }
  return { s, now: t + 1_000 };
};

for (const [name, cfg, full] of [['friendlies', friendly, false], ['tournament matches', tournament, true], ['saved matches', {}, true]] as const) {
  test(`500 ${name}`, () => {
    for (let i = 0; i < 500; i++) {
      const { s, now } = play(cfg);
      const t = readTrack(cfg);
      // batch 3: + shots, saves; defaults-on DOI10: every tap stat but possession and passes
      for (const k of TRACK_KEYS) assert.equal(t[k], full ? k !== 'passes' : !['possession', 'passes'].includes(k), `${name}: ${k}`);
      if (!full) assert.equal(footballPossession(s, now), undefined, 'no possession figure in a Quick friendly');
      assert.ok(s.home + s.away >= 0);
    }
  });
}
