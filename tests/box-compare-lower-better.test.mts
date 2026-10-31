/**
 * Audit C item: the box score's team comparison highlighted the bigger number
 * even where less is better (fouls, cards, turnovers, errors), unlike the
 * other comparison views (compareSheet / statPanel honour lowerBetter).
 * Now a row is "lower is better" when its stat says so (format.better) or its
 * key is a clear count of mistakes or sanctions (LOWER_BETTER_KEYS).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaderOf, LOWER_BETTER_KEYS, comparisonRows } from '../src/sports/boxScore.ts';
import { footballStats as FOOTBALL_STATS } from '../src/sports/football/stats.ts';
import { basketballStats as BASKETBALL_STATS } from '../src/sports/basketball/stats.ts';

test('fewer fouls leads; more shots still leads', () => {
  assert.equal(leaderOf({ h: 12, a: 8, lowerBetter: true }), 'away');
  assert.equal(leaderOf({ h: 12, a: 8 }), 'home');
  assert.equal(leaderOf({ h: 5, a: 5, lowerBetter: true }), null);
});

test('the clear mistake / sanction counts are flagged; ambiguous ones are not', () => {
  for (const k of ['fouls', 'yellowCards', 'redCards', 'turnovers', 'teamErrors', 'missedTackles', 'penaltyMinutes', 'serveErrors']) assert.ok(LOWER_BETTER_KEYS.has(k), k);
  for (const k of ['shots', 'saves', 'timeouts', 'timeoutsUsed', 'strikeouts', 'oppErrors']) assert.ok(!LOWER_BETTER_KEYS.has(k), k);
});

const team = (stats: Record<string, number>) => ({ rows: [{ id: 'p', name: 'P', stats }] });
test('football: fouls and cards rows lead with the lower number', () => {
  const { rows } = comparisonRows(FOOTBALL_STATS as never, { home: team({ shots: 10, fouls: 14, yellowCards: 3 }), away: team({ shots: 6, fouls: 9, yellowCards: 1 }) } as never);
  const by = Object.fromEntries(rows.map((r) => [r.key, leaderOf(r)]));
  assert.equal(by.shots, 'home');
  assert.equal(by.fouls, 'away');
  assert.equal(by.yellowCards, 'away');
});
test('basketball: turnovers (already flagged on the stat) and fouls', () => {
  const { rows } = comparisonRows(BASKETBALL_STATS as never, { home: team({ rebounds: 40, turnovers: 15, fouls: 20 }), away: team({ rebounds: 35, turnovers: 10, fouls: 18 }) } as never);
  const by = Object.fromEntries(rows.map((r) => [r.key, leaderOf(r)]));
  assert.equal(by.rebounds, 'home');
  assert.equal(by.turnovers, 'away');
  assert.equal(by.fouls, 'away');
});
