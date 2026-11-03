/**
 * Home › "Your sports" lists the sports you play, not only the ones picked
 * at first launch (founder 2026-11-04: a pool game played should move pool out
 * of "Try a new sport").
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { yourSports } from '../src/core/playedSports.ts';

const m = (sport: string, home: string[], away: string[], extra: Record<string, unknown> = {}) =>
  ({ sport, homeTeam: { roster: home }, awayTeam: { roster: away }, ...extra }) as never;

describe('Your sports', () => {
  test('declared sports first, then sports played (newest first), no repeats', () => {
    const feed = [m('pool', ['me'], ['x']), m('tennis', ['y'], ['me']), m('pool', ['me', 'z'], ['x'])];
    assert.deepEqual(yourSports(['football', 'tennis'], feed, 'me'), ['football', 'tennis', 'pool']);
  });
  test('scoring or hosting a match counts as taking part', () => {
    assert.deepEqual(yourSports([], [m('carrom', ['a'], ['b'], { scorerIds: ['me'] }), m('chess', ['a'], ['b'], { hostIds: ['me'] })], 'me'), ['carrom', 'chess']);
  });
  test('matches you only follow never add a sport', () => {
    assert.deepEqual(yourSports(['football'], [m('cricket', ['a'], ['b'])], 'me'), ['football']);
  });
  test('no player yet / junk is safe', () => {
    assert.deepEqual(yourSports(['football'], [m('pool', ['me'], [])], null), ['football']);
    assert.deepEqual(yourSports(undefined, [null as never, m('pool', undefined as never, null as never)], 'me'), []);
  });
  test('Home uses it for Your sports and Try a new sport', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/HomeScreen.tsx'), 'utf8');
    assert.match(src, /yourSports\(/);
  });
});
