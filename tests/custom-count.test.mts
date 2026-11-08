/** "N custom" counts rules, not stats choices (docs/security/breaks/custom-count.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customCount, standardOf } from '../src/sports/liveSettings.ts';

const ls = {
  title: 't', mode: 'event', actionType: 'X', fields: [
    { key: 'rallyDetail', label: 'Rally', type: 'toggle', default: true, group: 'Stats to track' },
    { key: 'trackPossession', label: 'Possession', type: 'toggle', default: false, group: 'Stats to track' },
    { key: 'rallyBuckets', label: 'Buckets', type: 'choice', default: 'std' },
    { key: 'pointsPerGame', label: 'To', type: 'number', default: 21 },
  ],
  read: () => ({}), defaults: { rallyDetail: true, trackPossession: false, rallyBuckets: 'std', pointsPerGame: 21 },
} as never;

test('CC1/CC2: stats choices are not "custom"', () => {
  assert.equal(customCount(ls, { rallyDetail: false, trackPossession: true, rallyBuckets: 'std', pointsPerGame: 21 }), 0);
});

test('CC4: rule changes still count', () => {
  assert.equal(customCount(ls, { rallyDetail: false, trackPossession: false, rallyBuckets: 'finer', pointsPerGame: 15 }), 2);
});

test('CC3: the standard still includes the stats (Reset sets them)', () => {
  assert.deepEqual(standardOf(ls), { rallyDetail: true, trackPossession: false, rallyBuckets: 'std', pointsPerGame: 21 });
});
