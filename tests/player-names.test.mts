/** IDs-only scoring, Stage 0 (docs/privacy/ids-only-scoring.md): the one name
 *  lookup every surface uses — by id from what the viewer may see, the stored
 *  legacy name only as a fallback, an open dispute as "X". */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_NAME, MASK, legacyNameOf, makeNameOf, nameInitials, peopleMap, publicName } from '../src/core/playerNames.ts';
import { buildTicker } from '../src/sports/ticker.ts';

describe('peopleMap', () => {
  test('id → trimmed name; the first list wins; blanks skipped', () => {
    const m = peopleMap(
      [{ id: 'a', fullName: ' Asha Rao ' }, { id: 'b', fullName: '' }],
      [{ id: 'a', fullName: 'A. R.' }, { id: 'b', fullName: 'Ben Lee' }],
      undefined,
    );
    assert.equal(m.get('a'), 'Asha Rao');
    assert.equal(m.get('b'), 'Ben Lee');
  });
});

describe('makeNameOf', () => {
  const people = new Map([['kid', 'M. R.'], ['adult', 'Ravi Kumar']]);
  test('the viewer\'s name for the id beats the name a log stored', () => {
    const nameOf = makeNameOf(people);
    // a stranger's players_view gives the child's initials — the stored full name never shows
    assert.equal(nameOf('kid', 'Meera Rao'), 'M. R.');
    assert.equal(nameOf('adult', 'Ravi K'), 'Ravi Kumar');
  });
  test('unknown id or no id: the legacy stored name, else "Player"', () => {
    const nameOf = makeNameOf(people);
    assert.equal(nameOf('someone-else', 'Old Name'), 'Old Name');
    assert.equal(nameOf(undefined, 'Typed Name'), 'Typed Name');
    assert.equal(nameOf(null, null), FALLBACK_NAME);
    assert.equal(nameOf('someone-else'), FALLBACK_NAME);
  });
  test('an open dispute masks by id and by the stored name', () => {
    const nameOf = makeNameOf(people, { ids: new Set(['adult']), names: new Set(['Old Name']) });
    assert.equal(nameOf('adult', 'Ravi Kumar'), MASK);
    assert.equal(nameOf(undefined, 'Old Name'), MASK);
    assert.equal(nameOf('kid', 'Meera Rao'), 'M. R.');
  });
  test('no lookup at all behaves as before IDs-only', () => {
    assert.equal(legacyNameOf('x', ' Asha '), 'Asha');
    assert.equal(legacyNameOf('x'), FALLBACK_NAME);
  });
});

describe('initials and public names', () => {
  test('nameInitials matches the database name_initials()', () => {
    assert.equal(nameInitials('Meera Rao'), 'M. R.');
    assert.equal(nameInitials('  Ravi  Kumar Singh '), 'R. K. S.');
    assert.equal(nameInitials('asha'), 'A.');
    assert.equal(nameInitials(''), 'Player');
  });
  test('publicName: adults by name, under-18 or unknown age by initials', () => {
    assert.equal(publicName({ fullName: 'Ravi Kumar', age: 30 }), 'Ravi Kumar');
    assert.equal(publicName({ fullName: 'Meera Rao', age: 12 }), 'M. R.');
    assert.equal(publicName({ fullName: 'Meera Rao' }), 'M. R.');
  });
});

describe('ticker contract', () => {
  test('tickerDetail gets the viewer\'s lookup (or the legacy fallback)', () => {
    let seen: unknown;
    const plugin = {
      summary: () => ({ home: '1', away: '0', statusLine: '' }),
      isComplete: () => false,
      tickerDetail: (_s: unknown, names: { player: (id: string, legacy?: string) => string }) => {
        seen = names.player('kid', 'Meera Rao');
        return {};
      },
    };
    const meta = { home: { name: 'A' }, away: { name: 'B' }, status: 'live' };
    buildTicker(plugin as never, {}, { ...meta, nameOf: makeNameOf(new Map([['kid', 'M. R.']])) } as never, 3);
    assert.equal(seen, 'M. R.');
    buildTicker(plugin as never, {}, meta as never, 3);
    assert.equal(seen, 'Meera Rao');
  });
});
