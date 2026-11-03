/**
 * A quick game's placeholder side ("Player B", "Pair A") takes the real
 * player's / pair's name once they're added — and matches already played read
 * the roster's name (through players_view, so a child's name stays masked).
 * Break list: docs/security/breaks/placeholder-side-names.md.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeholderRename, placeholderEntryIds, looksQuickPlaceholder, isQuickPlaceholder, placeholderParamsPatch } from '../src/core/quickGame.ts';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const repos = readFileSync(new URL('../src/data/repos.ts', import.meta.url), 'utf8');

describe('PS-01/02/05/06/08 placeholderRename', () => {
  test('singles: "Player B" + one person → the player\'s name and initials', () => {
    assert.deepEqual(placeholderRename({ name: 'Player B', adhoc: true }, ['Vivek  Chandra']), { name: 'Vivek Chandra', shortName: 'VC' });
  });
  test('doubles: "Pair A" + two people → the entry name the server recognises (full names, " / ")', () => {
    assert.deepEqual(placeholderRename({ name: 'Pair A', adhoc: true }, ['Ravi Kumar', 'Arjun Shah']), { name: 'Ravi Kumar / Arjun Shah', shortName: 'RKAS' });
  });
  test('masked names (as players_view shows a child to a stranger) stay masked', () => {
    assert.deepEqual(placeholderRename({ name: 'Player A', adhoc: true }, ['M. R.']), { name: 'M. R.', shortName: 'MR' });
  });
  test('a team placeholder keeps its name (only a name the user gives renames a team)', () => {
    assert.equal(placeholderRename({ name: 'Team A', adhoc: true }, ['Asha Rao']), null);
  });
  test('a real team named "Player B" (not ad hoc) is never renamed', () => {
    assert.equal(placeholderRename({ name: 'Player B', adhoc: false }, ['Asha Rao']), null);
    assert.equal(placeholderRename({ name: 'Player B' }, ['Asha Rao']), null);
  });
  test('an already-renamed side is never renamed again', () => {
    assert.equal(placeholderRename({ name: 'Asha Rao', adhoc: true }, ['Ben Lee']), null);
  });
  test('partial or odd rosters: no half names', () => {
    assert.equal(placeholderRename({ name: 'Pair A', adhoc: true }, ['Ravi Kumar']), null);
    assert.equal(placeholderRename({ name: 'Player B', adhoc: true }, ['A B', 'C D']), null);
    assert.equal(placeholderRename({ name: 'Player B', adhoc: true }, ['  ']), null);
    assert.equal(placeholderRename({ name: 'Pair B', adhoc: true }, ['Ravi', '']), null);
    assert.equal(placeholderRename({ name: 'Player B', adhoc: true }, []), null);
  });
  test('a renamed side is no longer a placeholder', () => {
    const r = placeholderRename({ name: 'Player B', adhoc: true }, ['Vivek C'])!;
    assert.equal(isQuickPlaceholder({ name: r.name, adhoc: true }), false);
  });
});

describe('PS-03/05/06 placeholderEntryIds (old matches)', () => {
  test('"Player B" with its one player → that player', () => {
    assert.deepEqual(placeholderEntryIds({ name: 'Player B', adhoc: true, roster: [P1] }), [P1]);
  });
  test('"Pair A" with both partners → both, in roster order', () => {
    assert.deepEqual(placeholderEntryIds({ name: 'Pair A', adhoc: true, roster: [P2, P1] }), [P2, P1]);
  });
  test('no roster, wrong size, duplicates, blanks, team, real team → none', () => {
    assert.equal(placeholderEntryIds({ name: 'Player B', adhoc: true, roster: [] }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Player B', adhoc: true, roster: null }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Pair A', adhoc: true, roster: [P1] }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Pair A', adhoc: true, roster: [P1, P1] }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Pair A', adhoc: true, roster: [P1, ''] }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Team A', adhoc: true, roster: [P1] }), undefined);
    assert.equal(placeholderEntryIds({ name: 'Player B', adhoc: false, roster: [P1] }), undefined);
  });
  test('looksQuickPlaceholder pre-filters by name only (Player / Pair)', () => {
    assert.equal(looksQuickPlaceholder('Player B'), true);
    assert.equal(looksQuickPlaceholder(' Pair A '), true);
    assert.equal(looksQuickPlaceholder('Team A'), false);
    assert.equal(looksQuickPlaceholder('Vivek C'), false);
  });
});

describe('wiring (repos.ts)', () => {
  test('PS-01/02/07: adding a player renames a placeholder side, best effort, after the roster write', () => {
    const add = repos.slice(repos.indexOf('const appendRoster = async'), repos.indexOf('const maybeSetCaptain'));
    assert.match(add, /renamePlaceholderSide\(/);
    const fn = repos.slice(repos.indexOf('async function renamePlaceholderSide'), repos.indexOf('async function renamePlaceholderSide') + 2000);
    assert.match(fn, /placeholderRename\(/);
    // PS-04: names come from players_view (what this viewer may see), never from client input
    assert.match(fn, /PLAYERS_READ/);
    assert.match(fn, /catch/);
  });
  test('PS-03/04/09: every read rebuilds a placeholder side\'s name from its roster through players_view', () => {
    const fn = repos.slice(repos.indexOf('async function revealEntryNames'), repos.indexOf('const revealMatchEntries'));
    assert.match(fn, /looksQuickPlaceholder\(/);
    assert.match(fn, /placeholderEntryIds\(/);
    assert.match(fn, /PLAYERS_READ/);
    assert.match(fn, /shortName/);
  });
});

describe('PS-11 the live screen (title, result card, share text, notifications) follows', () => {
  const live = readFileSync(new URL('../src/screens/LiveScoringScreen.tsx', import.meta.url), 'utf8');
  test('a placeholder side opened as "Player B" / "B" takes the loaded real name and short code', () => {
    assert.deepEqual(
      placeholderParamsPatch({ homeName: 'VC', awayName: 'B', homeTeamName: 'Vivek C', awayTeamName: 'Player B' },
        { home: { name: 'Vivek C', shortName: 'VC' }, away: { name: 'Abhra Chowdhury', shortName: 'AC' } }),
      { awayTeamName: 'Abhra Chowdhury', awayName: 'AC' });
  });
  test('nothing changes for real names, or a side still a placeholder', () => {
    assert.deepEqual(placeholderParamsPatch({ homeTeamName: 'Royal Smashers', awayTeamName: 'Player B' },
      { home: { name: 'Other', shortName: 'OT' }, away: { name: 'Player B', shortName: 'B' } }), {});
  });
  test('wired: the loaded match patches the route; adding a player reloads the match', () => {
    assert.match(live, /placeholderParamsPatch\(route\.params/);
    assert.match(live, /const bumpRoster = useCallback\(\(\) => \{ setRosterNonce\(\(n\) => n \+ 1\); setReloadTick/);
  });
});
