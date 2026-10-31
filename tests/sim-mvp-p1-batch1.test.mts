/**
 * Quality mandate step 6 for MVP P1 batch 1 (docs/security/breaks/mvp-p1-batch1.md):
 *  - 500 pickleball friendlies on the new default end after one game to 11;
 *  - 500 football pickup games logged with no players: every team stat lands
 *    in the team's totals, none on a player;
 *  - 500 basketball pickup games: team fouls reach the bonus at the limit;
 *  - 1,000 random format edits (padel / tennis / badminton) never leave a
 *    single set with a match-tiebreak decider, a blank points value, or a cap
 *    at or below the points.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { makeRallyEngine } from '../src/sports/rallyEngine.ts';
import { PICKLEBALL_FORMAT_FIELDS } from '../src/sports/pickleball/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { BADMINTON_META } from '../src/sports/badminton/meta.ts';
import { fieldChanges, clampNumber } from '../src/sports/formatPick.ts';
import { init as fbInit, reducer as fbReducer } from '../src/sports/football/engine.ts';
import { statAction, afterTeamPick } from '../src/sports/football/actions.ts';
import { init as bbInit, reducer as bbReducer, freeThrowsFor, teamFoulsThisQuarter } from '../src/sports/basketball/engine.ts';
import { foulAction } from '../src/sports/basketball/actions.ts';
import type { FormatField } from '../src/sports/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

let seed = 5;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const fld = (fs: FormatField[], k: string) => fs.find((f) => f.key === k)!;

test('500 pickleball friendlies on the default: one game to 11, then the match is over', () => {
  const preset = fld(PICKLEBALL_FORMAT_FIELDS, 'preset');
  const cfg = { ...preset.options!.find((o) => o.value === preset.default)!.set, playersPerSide: 1 };
  const E = makeRallyEngine({ id: 'pickleball', icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
  for (let i = 0; i < 500; i++) {
    const loser = rnd(10);
    const s = (rnd(2) ? L.rGame(11, loser) : L.rGame(loser, 11)).reduce(E.reducer, E.init(cfg));
    assert.equal(s.ended, true, `11-${loser} should end the match`);
  }
});

test('500 football pickup games with no players: team stats only', () => {
  const kinds = ['shot', 'pass', 'tackle', 'interception', 'cross', 'dribble', 'offside', 'handball', 'foul', 'corner'] as const;
  for (let g = 0; g < 500; g++) {
    let s = fbInit({});
    const acts: ScoreAction[] = [{ type: 'KICKOFF', payload: { at: 1 } } as ScoreAction];
    for (let i = 0; i < 20; i++) {
      const kind = kinds[rnd(kinds.length)];
      assert.notEqual(afterTeamPick(kind, false), 'player', kind);
      const side = rnd(2) ? 'home' : 'away';
      const a = statAction(kind, side, undefined, kind === 'shot' ? { onTarget: !!rnd(2) } : kind === 'pass' ? { complete: !!rnd(2) } : {});
      assert.equal(a.attribution, undefined);
      acts.push(a);
    }
    s = acts.reduce(fbReducer, s);
    assert.equal(s.stats.length, 20, 'every team stat is logged');
    assert.ok(s.stats.every((e) => !(e as { playerId?: string }).playerId), 'none on a player');
  }
});

test('500 basketball pickup games: team fouls reach the bonus at the limit', () => {
  for (let g = 0; g < 500; g++) {
    const limit = 4 + rnd(3);
    let s = bbInit({ regPeriods: 4, foulsForBonus: limit });
    const side = rnd(2) ? 'home' : 'away';
    for (let i = 0; i < limit; i++) {
      assert.equal(freeThrowsFor(s, side, 'personal'), 0, `no bonus yet after ${i} fouls (limit ${limit})`);
      s = bbReducer(s, foulAction(side, undefined, 'personal'));
    }
    assert.equal(teamFoulsThisQuarter(s, side), limit);
    assert.equal(freeThrowsFor(s, side, 'personal'), 2, `bonus after ${limit}`);
  }
});

test('1,000 random format edits stay sane', () => {
  const sports = [
    { fields: PADEL_META.formatFields!, len: 'setsToWin', dec: 'decider', bad: 'match10' },
    { fields: TENNIS_META.formatFields!, len: 'setsToWin', dec: 'finalSetTiebreak', bad: 10 },
  ];
  for (let i = 0; i < 1000; i++) {
    const sp = sports[rnd(2)];
    const v: Record<string, number | string | boolean> = { [sp.dec]: sp.bad };
    for (const [k, x] of fieldChanges(fld(sp.fields, sp.len), [1, 2, 3][rnd(3)])) v[k] = x;
    if (v[sp.len] === 1) assert.notEqual(v[sp.dec], sp.bad, 'a single set never keeps the match-tiebreak decider');

    const pts = fld(BADMINTON_META.formatFields!, 'pointsPerGame');
    const typed = [0, rnd(60), 11, 15, 21][rnd(5)];
    const kept = clampNumber(pts, typed);
    assert.ok(kept >= 5 && kept <= 30, `points ${typed} → ${kept}`);
    const c = Object.fromEntries(fieldChanges(pts, kept));
    assert.ok(Number(c.cap) > kept, `cap ${c.cap} above points ${kept}`);
  }
});
