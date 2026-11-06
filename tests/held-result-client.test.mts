/** The app saves the held result with the board, and clears it otherwise (held-result-server.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heldResultColumn } from '../src/data/resultHold.ts';

test('the column: the winner and when the hold runs out (ISO)', () => {
  assert.deepEqual(heldResultColumn('home', Date.UTC(2026, 10, 7, 10, 0, 0)), { winner: 'home', until: '2026-11-07T10:00:00.000Z' });
  assert.deepEqual(heldResultColumn(null, Date.UTC(2026, 10, 7)), { winner: null, until: '2026-11-07T00:00:00.000Z' });
});

test('wiring: the live hook passes the hold to the snapshot; repos writes held_result, with a fallback for an old database', () => {
  const hook = readFileSync(new URL('../src/data/useLiveMatch.ts', import.meta.url), 'utf8');
  assert.match(hook, /hold\.sendsAt\(\)/);
  assert.match(hook, /liveSummaryOf\(plugin, s as never\), held\)/);
  const repos = readFileSync(new URL('../src/data/repos.ts', import.meta.url), 'utf8');
  assert.match(repos, /held_result/);
  assert.match(repos, /heldMissing/);
});
