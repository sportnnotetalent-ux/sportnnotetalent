/**
 * The live score link (MVP, founder 2026-10-31): every save of a match also
 * saves a tiny public summary from the sport's own score lines, so the link
 * preview and the light spectator page can show the score without the app.
 * Pure part: src/core/liveSummary.ts. Wiring: useLiveMatch → updateMatchSnapshot.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactSummary, liveSummaryOf, SUMMARY_MAX_CHARS } from '../src/core/liveSummary.ts';

describe('compactSummary', () => {
  test('the sport\'s score lines, in four short keys', () => {
    assert.deepEqual(compactSummary({ homeScore: '2', awayScore: '1', statusLine: '2nd Half', detailLine: 'HT 1–0' }),
      { h: '2', a: '1', s: '2nd Half', d: 'HT 1–0' });
    assert.deepEqual(compactSummary({ homeScore: '15/2', awayScore: '0', statusLine: 'Set 1' }), { h: '15/2', a: '0', s: 'Set 1' });
  });
  test('always fits the database\'s 600-character limit, whatever the sport returns', () => {
    const long = 'x'.repeat(5000);
    const s = compactSummary({ homeScore: long, awayScore: long, statusLine: long, detailLine: long });
    assert.ok(JSON.stringify(s).length <= SUMMARY_MAX_CHARS, String(JSON.stringify(s).length));
    // quotes and backslashes grow when written as JSON: still within the limit
    const nasty = '"\\'.repeat(2000);
    const t = compactSummary({ homeScore: nasty, awayScore: nasty, statusLine: nasty, detailLine: nasty });
    assert.ok(JSON.stringify(t).length <= SUMMARY_MAX_CHARS);
  });
  test('control characters and surrounding spaces are dropped; a missing line is left out', () => {
    assert.deepEqual(compactSummary({ homeScore: ' 3\n', awayScore: '\u0000 1 ', statusLine: '  Final  ', detailLine: '   ' }),
      { h: '3', a: '1', s: 'Final' });
  });
});

describe('liveSummaryOf', () => {
  test('a sport that throws on a broken state gives null, never an error', () => {
    assert.equal(liveSummaryOf({ summary: () => { throw new Error('bad state'); } }, {}), null);
    assert.deepEqual(liveSummaryOf({ summary: () => ({ homeScore: '1', awayScore: '0', statusLine: 'Q1' }) }, {}), { h: '1', a: '0', s: 'Q1' });
  });
});

describe('the wiring', () => {
  const live = readFileSync(new URL('../src/data/useLiveMatch.ts', import.meta.url), 'utf8');
  const repos = readFileSync(new URL('../src/data/repos.ts', import.meta.url), 'utf8');
  test('every save of the match passes the sport\'s summary along', () => {
    assert.match(live, /updateMatchSnapshot\(id, withMatchRecords\(plugin, s as never, completed\), completed, liveSummaryOf\(plugin, s as never\)\)/);
  });
  test('the summary goes into both of the snapshot\'s writes, and a database without the column still saves the match', () => {
    const fn = repos.slice(repos.indexOf('export async function updateMatchSnapshot'), repos.indexOf('export async function updateMatchSnapshot') + 4000);
    assert.equal((fn.match(/\.\.\.summaryCol\(summary\)/g) ?? []).length, 2);
    assert.match(repos, /summaryMissing/);
  });
});
