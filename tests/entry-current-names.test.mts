/**
 * Auto-named singles / doubles entries show their players' CURRENT names (and
 * short codes); a team the user named keeps its name; "Me" never uses the
 * account name. Break list: docs/security/breaks/entry-current-names.md.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoEntryCandidate, autoEntryIds, shortCodeIsAuto, meEntrantName, looksMaskedName, entryNameFromPlayers, entryShortName } from '../src/data/participantEntry.ts';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const names = (m: Record<string, string>) => (id: string) => m[id];

describe('EN-02 the founder\'s case', () => {
  test('"Hrudhay Organizer" (pool, ad hoc, roster = Hrudhay) reads as "Hrudhay"', () => {
    const t = { name: 'Hrudhay Organizer', adhoc: true, roster: [P1], kind: 'both' as const };
    const ids = autoEntryIds(t, names({ [P1]: 'Hrudhay' }));
    assert.deepEqual(ids, [P1]);
    assert.equal(entryNameFromPlayers(ids!, names({ [P1]: 'Hrudhay' })), 'Hrudhay');
    assert.equal(entryShortName(['Hrudhay']), 'HRUD');
  });
  test('a renamed player ("Hrudhay" → "Hrudhay P V") follows', () => {
    assert.deepEqual(autoEntryIds({ name: 'Hrudhay', adhoc: true, roster: [P1], kind: 'individual' }, names({ [P1]: 'Hrudhay P V' })), [P1]);
  });
  test('a pair: each part belongs to its partner', () => {
    assert.deepEqual(autoEntryIds({ name: 'Hrudhay Organizer / Asha Rao', adhoc: true, roster: [P1, P2], kind: 'both' }, names({ [P1]: 'Hrudhay', [P2]: 'Asha Rao' })), [P1, P2]);
  });
});

describe('EN-03 a real team keeps its name', () => {
  const nm = names({ [P1]: 'Hrudhay', [P2]: 'Asha Rao', [P3]: 'Ben Lee' });
  test('a team sport (football)', () => {
    assert.equal(autoEntryIds({ name: 'Hrudhay', adhoc: true, roster: [P1], kind: 'team' }, nm), undefined);
    assert.equal(autoEntryIds({ name: 'Hrudhay', adhoc: true, roster: [P1], kind: undefined }, nm), undefined);
  });
  test('not ad hoc', () => {
    assert.equal(autoEntryIds({ name: 'Hrudhay Organizer', adhoc: false, roster: [P1], kind: 'both' }, nm), undefined);
    assert.equal(autoEntryIds({ name: 'Hrudhay Organizer', roster: [P1], kind: 'both' }, nm), undefined);
  });
  test('3+ players', () => {
    assert.equal(autoEntryIds({ name: 'Hrudhay / Asha / Ben', adhoc: true, roster: [P1, P2, P3], kind: 'both' }, nm), undefined);
  });
  test('a name of its own', () => {
    assert.equal(autoEntryIds({ name: "Hrudhay's 5s", adhoc: true, roster: [P1], kind: 'both' }, nm), undefined);
    assert.equal(autoEntryIds({ name: 'Smash Bros', adhoc: true, roster: [P1, P2], kind: 'both' }, nm), undefined);
    assert.equal(autoEntryIds({ name: 'Cue Kings', adhoc: true, roster: [P1], kind: 'individual' }, nm), undefined);
  });
  test('a pair with one part that isn\'t its partner', () => {
    assert.equal(autoEntryIds({ name: 'Hrudhay / Zoya Khan', adhoc: true, roster: [P1, P2], kind: 'both' }, nm), undefined);
  });
});

describe('EN-04 children stay masked', () => {
  test('a stranger sees initials (players_view), never the stored full name', () => {
    const ids = autoEntryIds({ name: 'Meera Organizer', adhoc: true, roster: [P1], kind: 'both' }, names({ [P1]: 'M. R.' }));
    assert.deepEqual(ids, [P1]);
    assert.equal(entryNameFromPlayers(ids!, names({ [P1]: 'M. R.' })), 'M. R.');
  });
  test('masked shape', () => {
    assert.equal(looksMaskedName('M. R.'), true);
    assert.equal(looksMaskedName('Meera Rao'), false);
  });
});

describe('EN-05 odd rosters', () => {
  test('duplicates, blanks, non-strings, empty, unknown name', () => {
    const nm = names({ [P1]: 'Ravi Kumar' });
    assert.equal(autoEntryCandidate({ name: 'Ravi / Ravi', adhoc: true, roster: [P1, P1], kind: 'both' }), undefined);
    assert.equal(autoEntryCandidate({ name: 'Ravi', adhoc: true, roster: [' '], kind: 'both' }), undefined);
    assert.equal(autoEntryCandidate({ name: 'Ravi', adhoc: true, roster: [42], kind: 'both' }), undefined);
    assert.equal(autoEntryCandidate({ name: 'Ravi', adhoc: true, roster: [], kind: 'both' }), undefined);
    assert.equal(autoEntryCandidate({ name: 'Ravi', adhoc: true, roster: null, kind: 'both' }), undefined);
    assert.equal(autoEntryCandidate({ name: '', adhoc: true, roster: [P1], kind: 'both' }), undefined);
    assert.equal(autoEntryIds({ name: 'Ravi K / Arjun', adhoc: true, roster: [P1, P2], kind: 'both' }, nm), undefined);
  });
});

describe('EN-06 pair order', () => {
  test('a pair stored in the other order is shown in its stored order', () => {
    assert.deepEqual(autoEntryIds({ name: 'Asha / Hrudhay Organizer', adhoc: true, roster: [P1, P2], kind: 'both' }, names({ [P1]: 'Hrudhay', [P2]: 'Asha Rao' })), [P2, P1]);
  });
});

describe('EN-07 short code', () => {
  test('a code made from the name follows; a chosen code stays', () => {
    assert.equal(shortCodeIsAuto('Hrudhay Organizer', 'HO'), true);
    assert.equal(shortCodeIsAuto('Ravi Kumar / Arjun Shah', 'RKAS'), true);
    assert.equal(shortCodeIsAuto('Hrudhay Organizer', 'HRU'), false);
    assert.equal(shortCodeIsAuto('Hrudhay Organizer', ''), true);
  });
});

describe('EN-01 "Me" is my player name', () => {
  test('player name first; account name only when the player has none', () => {
    assert.equal(meEntrantName('Hrudhay', 'Hrudhay Organizer'), 'Hrudhay');
    assert.equal(meEntrantName('  ', 'Hrudhay Organizer'), 'Hrudhay Organizer');
    assert.equal(meEntrantName(null, null), undefined);
  });
  test('both screens read my player name, never profile.fullName first', () => {
    for (const f of ['screens/ScheduleMatchScreen.tsx', 'screens/TournamentTeamsScreen.tsx']) {
      const s = src(f);
      assert.match(s, /getMyEntrant\(/, f);
      assert.doesNotMatch(s, /fullName: allPlayers\.find\(\(p\) => p\.id === myId\)\?\.fullName \?\? profile\.fullName/, f);
      assert.doesNotMatch(s, /fullName: profile\.fullName \?\? 'Me'/, f);
    }
  });
});

describe('EN-02/08/09 wired into every read, no writes', () => {
  const repos = src('data/repos.ts');
  const fn = repos.slice(repos.indexOf('async function revealEntryNames'), repos.indexOf('async function renamePlaceholderSide'));
  test('revealEntryNames uses the auto-named rule and short codes', () => {
    assert.match(fn, /autoEntryCandidate\(/);
    assert.match(fn, /autoEntryIds\(/);
    assert.match(fn, /shortCodeIsAuto\(/);
  });
  test('reads only (no update / insert) and names through players_view', () => {
    assert.doesNotMatch(fn, /\.update\(|\.insert\(|\.upsert\(/);
    assert.match(fn, /PLAYERS_READ/);
  });
});
