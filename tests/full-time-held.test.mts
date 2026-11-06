/** Viewers see FULL TIME, not LIVE, while a result is held (docs/security/breaks/full-time-held.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveSummaryOf, SUMMARY_MAX_CHARS } from '../src/core/liveSummary.ts';
import { renderMatchPage, previewText } from '../worker/matchPage.ts';

const plugin = (done: boolean) => ({ summary: () => ({ homeScore: '5', awayScore: '3', statusLine: done ? 'Full Time' : 'Half 2 · 12\'' }), isComplete: () => done });

test('the summary is marked once the board says the match is decided; FT1: not otherwise', () => {
  assert.equal(liveSummaryOf(plugin(true), {})?.f, 1);
  assert.equal(liveSummaryOf(plugin(false), {})?.f, undefined);
  assert.equal(liveSummaryOf({ summary: plugin(true).summary }, {})?.f, undefined, 'FT5: a sport without isComplete is unchanged');
});

test('FT3: still within the size limit', () => {
  const big = { summary: () => ({ homeScore: '9'.repeat(40), awayScore: '8'.repeat(40), statusLine: 'x'.repeat(80), detailLine: '"'.repeat(400) }), isComplete: () => true };
  const s = liveSummaryOf(big, {})!;
  assert.ok(JSON.stringify(s).length <= SUMMARY_MAX_CHARS);
  assert.equal(s.f, 1);
});

const m = (status: string, f?: 1) => ({ id: 'abc', sport: 'kabaddi', status, summary: { h: '5', a: '3', s: 'Full Time', ...(f ? { f } : {}) },
  home: { name: 'Demo Golds' }, away: { name: 'Demo Panthers' }, tournament: { name: 'Demo Kabaddi League' } });

test('a held result reads FULL TIME, not LIVE, in the preview and on the page', () => {
  assert.match(previewText(m('live', 1)).title, /FULL TIME · Demo Golds 5–3 Demo Panthers/);
  const html = renderMatchPage(m('live', 1));
  assert.match(html, /FULL TIME/);
  assert.doesNotMatch(html, /● LIVE<\/span>|● FULL TIME/);
  assert.match(html, /setInterval/, 'keeps refreshing until the result lands');
});

test('a live match without the mark is still LIVE; a completed one is RESULT', () => {
  assert.match(previewText(m('live')).title, /LIVE ·/);
  assert.match(previewText(m('completed')).title, /RESULT ·/);
});

test('the page\'s refresh script shows FULL TIME for a marked live match', () => {
  const html = renderMatchPage(m('live'));
  assert.match(html, /s\.f\?"FULL TIME"|FULL TIME/);
});

test('web: closing or reloading the tab sends a held result (pagehide)', () => {
  const src = readFileSync(new URL('../src/data/useLiveMatch.ts', import.meta.url), 'utf8');
  assert.match(src, /'pagehide'/);
  assert.match(src, /removeEventListener\('pagehide'/);
});
