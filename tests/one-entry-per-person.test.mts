/**
 * The picker lists each person (or pair) once (founder 2026-11-04: Abhra showed
 * three times — one player, several one-person entries pointing at him).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { onePerEntrant } from '../src/data/doublesPicker.ts';

const t = (id: string, roster: string[], name = 'X') => ({ id, name, colorHex: '#000', roster });

describe('onePerEntrant', () => {
  test('one chip per person: the first of the duplicates stays', () => {
    const list = [t('e1', ['abhra']), t('e2', ['abhra']), t('e3', ['vivek']), t('e4', ['abhra'])];
    assert.deepEqual(onePerEntrant(list).map((x) => x.id), ['e1', 'e3']);
  });
  test('pairs are the same pair in any order', () => {
    const list = [t('p1', ['a', 'b']), t('p2', ['b', 'a']), t('p3', ['a', 'c'])];
    assert.deepEqual(onePerEntrant(list).map((x) => x.id), ['p1', 'p3']);
  });
  test('a side already picked for this match always stays visible', () => {
    const list = [t('e1', ['abhra']), t('e2', ['abhra'])];
    assert.deepEqual(onePerEntrant(list, ['e2']).map((x) => x.id), ['e2']);
  });
  test('entries without a roster are kept as they are (nothing to match on)', () => {
    const list = [{ id: 'x', name: 'Team', colorHex: '#000' }, { id: 'y', name: 'Team', colorHex: '#000' }];
    assert.equal(onePerEntrant(list as never).length, 2);
  });
});

describe('the screen', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/ScheduleMatchScreen.tsx'), 'utf8');
  test('singles and pairs lists go through onePerEntrant', () => {
    assert.match(src, /onePerEntrant\(sidesForStructure\(pickTeams, 'single'\)/);
    assert.match(src, /onePerEntrant\(sidesForStructure\(pickTeams, 'pair'\)/);
  });
  test('a second tap while an entry is being made does nothing', () => assert.match(src, /entrantBusy\.current/));
});
