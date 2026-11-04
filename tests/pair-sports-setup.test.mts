/** Every sport played in pairs gets the whole pairs set-up (founder 2026-11-06):
 *  a Singles / Doubles choice (playersPerSide 1 and 2), Quick tournament's
 *  pair picking, "both sides are pairs → doubles", pair teams. The screens key
 *  all of it on participantKind 'both', so each pair sport must say 'both' and
 *  offer 1 and 2 players a side. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPORTS = join(import.meta.dirname, '..', 'src', 'sports');
const PAIR_SPORTS = ['badminton', 'billiards', 'carrom', 'padel', 'pickleball', 'pool', 'snooker', 'squash', 'tabletennis', 'tennis'];
const meta = (s: string) => readFileSync(join(SPORTS, s, 'meta.ts'), 'utf8');

test('the pair sports are exactly the "both" sports', () => {
  const both = readdirSync(SPORTS, { withFileTypes: true }).filter((d) => d.isDirectory())
    .filter((d) => { try { return /participantKind: 'both'/.test(meta(d.name)); } catch { return false; } }).map((d) => d.name).sort();
  assert.deepEqual(both, PAIR_SPORTS);
});

for (const s of PAIR_SPORTS) {
  test(`${s}: Singles and Doubles (1 and 2 a side)`, () => {
    const m = meta(s);
    const i = m.indexOf("key: 'playersPerSide'");
    assert.ok(i >= 0, 'has a playersPerSide setting');
    const block = m.slice(i, i + 600);
    assert.match(block, /value: 1\b/);
    assert.match(block, /value: 2\b/);
  });
}

test('the shared pieces key on "both" (so each pair sport gets them all)', () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
  assert.match(read('src/screens/QuickTournamentScreen.tsx'), /kind === 'both' && pairs/);
  assert.match(read('src/core/sideSize.ts'), /kind !== 'both'/);
  assert.match(read('src/data/pairSport.ts'), /kind !== 'team'/);
});
