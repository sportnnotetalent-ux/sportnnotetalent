/** Tournament page, Stitch picks (docs/security/breaks/stitch-tournament-page.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countStrip, miniStandings } from '../src/core/tournamentPage.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('TP1/TP2: the count strip counts what the page lists, and skips zeros', () => {
  assert.deepEqual(countStrip({ fixtures: 23, sports: 4, teams: 8, fixturesWord: 'Fixtures' }), ['23 Fixtures', '4 Sports', '8 Teams']);
  assert.deepEqual(countStrip({ fixtures: 1, sports: 1, teams: 2, fixturesWord: 'Fixtures' }), ['1 Fixture', '2 Teams'], 'one sport: not worth saying');
  assert.deepEqual(countStrip({ fixtures: 0, sports: 1, teams: 0, fixturesWord: 'Fixtures' }), []);
  assert.deepEqual(countStrip({ fixtures: 3, sports: 2, teams: 4, fixturesWord: 'Fixtures', teamsWord: 'Houses' }), ['3 Fixtures', '2 Sports', '4 Houses']);
});

const row = (name: string, played: number, won: number, drawn: number, lost: number, points: number) =>
  ({ teamId: name, name, played, won, drawn, lost, points, nr: 0, for: 0, against: 0, diff: 0, forUnits: 0, againstUnits: 0 });

test('TP3/TP4/TP5: a real table only, top 4, Q only from decided marks', () => {
  const rows = [row('Red', 5, 4, 1, 0, 13), row('Blue', 5, 3, 1, 1, 10), row('Green', 4, 2, 0, 2, 6), row('Gold', 4, 0, 0, 4, 0), row('Teal', 3, 0, 0, 3, 0)];
  const t = miniStandings({ rows, marks: new Map([['Red', 'qualified']]) })!;
  assert.equal(t.rows.length, 4);
  assert.equal(t.more, true);
  assert.deepEqual(t.rows.map((r) => r.q), [true, false, false, false], 'second place is not "through" until decided');
  assert.deepEqual(t.rows[0].cells, [5, 4, 1, 0]);
  assert.equal(miniStandings({ rows: [row('A', 0, 0, 0, 0, 0)] }), null, 'no results yet: no card');
  assert.equal(miniStandings({ rows: [] }), null);
  const medal = miniStandings({ medal: [{ teamId: 'r', name: 'Red House', total: 31, golds: 3, silvers: 1, bronzes: 0 }] })!;
  assert.equal(medal.kind, 'medal');
  assert.equal(medal.rows[0].pts, 31);
});

test('TP6 + wiring: the live card says "Live scorecard", the page shows the strip and the card', () => {
  assert.match(read('src/components/MatchCard.tsx'), /live && !onStart \? <Text style=\{s\.cta\}>Live scorecard ›/);
  const p = read('src/screens/TournamentProfileScreen.tsx');
  assert.match(p, /countStrip\(/);
  assert.match(p, /<MiniStandingsCard/);
});
