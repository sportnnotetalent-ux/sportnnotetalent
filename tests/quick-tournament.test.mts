/**
 * Quick tournament (MVP, founder 2026-10-31): the full form has ~17 sections;
 * a community organiser needs a name, a sport, the teams (pasted from a
 * WhatsApp list) and a format, then the fixtures. The quick screen makes the
 * tournament and its teams, then opens the fixtures screen with everything
 * picked, so the bar of 8 teams → fixtures in ≤ 5 minutes is one more tap.
 * Pure part: src/core/quickTournament.ts; screen: QuickTournamentScreen.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEntrantList, suggestFormat, matchCount, structureFor, quickName, MAX_ENTRANTS, NAME_MAX } from '../src/core/quickTournament.ts';

describe('a pasted list becomes clean names', () => {
  test('numbering, bullets, blank lines and repeats are tidied away', () => {
    assert.deepEqual(parseEntrantList('1. Lions\n2) Tigers\n- Panthers\n• Cheetahs\n\nlions\n  Eagles  \n3 - Hawks'),
      ['Lions', 'Tigers', 'Panthers', 'Cheetahs', 'Eagles', 'Hawks']);
  });
  test('one line with commas is split; names with commas over several lines are kept', () => {
    assert.deepEqual(parseEntrantList('Lions, Tigers,Panthers'), ['Lions', 'Tigers', 'Panthers']);
    assert.deepEqual(parseEntrantList('Ravi, Arjun\nSita, Gita'), ['Ravi, Arjun', 'Sita, Gita']);
  });
  test('long names are cut, and there\'s a sensible maximum', () => {
    assert.equal(parseEntrantList('x'.repeat(200))[0].length, NAME_MAX);
    const many = Array.from({ length: 200 }, (_, i) => `Team ${i}`).join('\n');
    assert.equal(parseEntrantList(many).length, MAX_ENTRANTS);
  });
});

describe('the format', () => {
  test('a small field plays everyone; a bigger one is a knockout; under 2 there\'s nothing to play', () => {
    assert.equal(suggestFormat(1), null);
    assert.equal(suggestFormat(4), 'league');
    assert.equal(suggestFormat(5), 'league');
    assert.equal(suggestFormat(8), 'knockout');
  });
  test('how many matches each format makes', () => {
    assert.equal(matchCount('league', 6), 15);
    assert.equal(matchCount('knockout', 8), 7);
    assert.equal(matchCount('knockout', 6), 5);
    assert.equal(matchCount('groups', 8), 12 + 3); // 2 groups of 4 (6 each), then semis + final
  });
  test('saved as the tournament structure the rest of the app knows', () => {
    assert.deepEqual([structureFor('league'), structureFor('knockout'), structureFor('groups')], ['league', 'knockout', 'league_knockout']);
  });
  test('a ready-made name to change or keep', () => {
    assert.equal(quickName('Pickleball', new Date('2026-11-07T10:00:00Z')), 'Pickleball Cup · Nov 2026');
  });
});

describe('the wiring', () => {
  const screen = readFileSync(new URL('../src/screens/QuickTournamentScreen.tsx', import.meta.url), 'utf8');
  test('creates the tournament, a team per name, enters them, then opens the fixtures with the format picked, over the tournament page', () => {
    assert.match(screen, /await createTournament\(/);
    assert.match(screen, /await createTeam\(/);
    assert.match(screen, /await addTournamentTeams\(/);
    assert.match(screen, /replace\('Tournament', \{ tournamentId: created\.id \}\)/, 'lands on the tournament after the fixtures');
    assert.match(screen, /navigate\('GenerateFixtures', \{ tournamentId: created\.id, sport, structure: fmt, groups: fmt === 'groups' \? groupCount\(entrants\.length\) : undefined \}\)/);
    assert.match(screen, /navigate\('CreateTournament'/, 'More options opens the full form');
  });
  test('the fixtures screen starts on the chosen format', () => {
    const gen = readFileSync(new URL('../src/screens/GenerateFixturesScreen.tsx', import.meta.url), 'utf8');
    assert.match(gen, /params\.structure/);
  });
  test('people starting a tournament land on the quick screen (organisations keep the full form)', () => {
    const organize = readFileSync(new URL('../src/screens/OrganizeScreen.tsx', import.meta.url), 'utf8');
    assert.match(organize, /activeOrg \? nav\.navigate\('CreateTournament', \{ orgId: activeOrg\.id \}\) : nav\.navigate\('QuickTournament'/);
    for (const f of ['PersonaliseScreen.tsx', 'TryNewSportScreen.tsx']) {
      assert.match(readFileSync(new URL(`../src/screens/${f}`, import.meta.url), 'utf8'), /'QuickTournament'/, f);
    }
  });
});

describe('break-it fixes', () => {
  test('QT-01: if some teams fail to save, the organiser still lands on the tournament, told what to do', () => {
    const screen = readFileSync(new URL('../src/screens/QuickTournamentScreen.tsx', import.meta.url), 'utf8');
    assert.match(screen, /createdId/);
    assert.match(screen, /notice\(/);
    assert.match(screen, /add the rest/i);
  });
});
