/** IDs-only scoring close-out (docs/privacy/ids-only-scoring.md): the shared
 *  surfaces outside the sport engines. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recreditAction } from '../src/sports/amendCredit.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('post-match corrections re-credit by id only', () => {
  test('a legacy named record → the new player\'s id, no name anywhere', () => {
    const a = recreditAction({
      type: 'GOAL', side: 'home',
      payload: { playerName: 'Zebedee Quartermaine', name: 'Zebedee Quartermaine', playerId: 'old', pid: 'old', minute: 12 },
      attribution: { playerId: 'old', stat: 'goals', playerName: 'Zebedee Quartermaine' },
    } as never, 'new');
    assert.doesNotMatch(JSON.stringify(a), /Zebedee/);
    const p = a.payload as Record<string, unknown>;
    assert.equal(p.playerId, 'new');
    assert.equal(p.pid, 'new');
    assert.equal(p.minute, 12);
    assert.equal(a.attribution?.playerId, 'new');
  });
  test('a chess opening\'s name is not a player\'s', () => {
    const a = recreditAction({ type: 'OPENING', payload: { name: 'Sicilian Defence', opening: 'B20' }, attribution: { playerId: 'x', stat: 's' } } as never, 'y');
    assert.equal((a.payload as Record<string, unknown>).name, 'Sicilian Defence');
  });
  test('the change lines (public) use publicName; the corrector\'s name too', () => {
    const list = read('src/components/EventCorrectionList.tsx');
    assert.match(list, /publicName\(\{ fullName: p\.fullName, age: ageOf\(p\) \}\)/);
    assert.doesNotMatch(list, /attribution\?\.playerName \?\? 'someone else'/);
    assert.match(read('src/screens/CorrectMatchScreen.tsx'), /const byName = publicName\(/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /amend\(liveOps\.ops, liveOps\.lines, publicName\(/);
  });
});

describe('tournament records resolve players by id', () => {
  test('TournamentRecords looks names up for record ids', () => {
    const src = read('src/components/TournamentRecords.tsx');
    assert.match(src, /usePlayerNameOf\(recordIds\)/);
    assert.match(src, /nameOf\(it\.playerId, it\.playerName\)/);
  });
});
