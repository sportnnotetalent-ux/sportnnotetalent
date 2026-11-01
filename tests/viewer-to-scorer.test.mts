/**
 * Viewers become scorers (docs/security/breaks/viewer-to-scorer.md): the light
 * score page and the app's guest bar lead straight to a game of your own, and
 * the steps are measured with the existing first-party onboarding_step event.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import worker from '../worker/index.ts';
import { scoreOwnHref } from '../worker/matchPage.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const ID = '6da23011-61fb-4c24-9a8c-7a29b2924c46';
const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'k', APP_ORIGIN: 'https://app.sportnnote.in', ASSETS: { fetch: async () => new Response('asset') } };
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = (async () => new Response(JSON.stringify({ id: ID, sport: 'football', status: 'live', home: { name: 'A' }, away: { name: 'B' }, summary: { h: '1', a: '0' } }))) as typeof fetch; });
after(() => { globalThis.fetch = realFetch; });

describe('V1: the light page', () => {
  test('the call to action opens a game of your own on our domain', () => {
    assert.equal(scoreOwnHref('https://app.sportnnote.in'), 'https://app.sportnnote.in/GuestGame?from=match_link');
  });
  test('every light page carries it', async () => {
    for (const p of [`/m/${ID}`]) {
      const html = await (await worker.fetch(new Request(`https://app.sportnnote.in${p}`), env as never)).text();
      assert.ok(html.includes('href="https://app.sportnnote.in/GuestGame?from=match_link"'), p);
      assert.match(html, /Score your own game, free/);
      assert.match(html, /Full match &amp; stats/, 'the match link is unchanged');
    }
  });
});

describe('V2 / V4: the app', () => {
  test('the guest bar offers a game of your own', () => {
    const src = read('src/components/GuestBar.tsx');
    assert.match(src, /navigate\('GuestGame', \{ from: 'guest_bar' \}\)/);
    assert.match(src, /Score your own game, free/);
  });
  test('a signed-in visitor gets the normal friendly instead', () => {
    assert.match(read('src/screens/GuestGameScreen.tsx'), /if \(authed\) nav\.replace\('ScheduleMatch', \{ sport \}\)/);
  });
});

describe('V3: measured, first-party, minimal', () => {
  test('open, start and save are steps of onboarding_step with step + from only', () => {
    const g = read('src/screens/GuestGameScreen.tsx');
    assert.match(g, /track\('onboarding_step', \{ step: 'guest_game_open', from \}\)/);
    assert.match(g, /track\('onboarding_step', \{ step: 'guest_game_start', from, sport \}\)/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /track\('onboarding_step', \{ step: 'guest_game_saved' \}\)/);
  });
  test('the founder’s weekly look is a read-only query', () => {
    const q = read('docs/ops/viewer-to-scorer-funnel.sql');
    assert.match(q, /onboarding_step/);
    assert.ok(!/\b(insert|update|delete|drop|alter)\b/i.test(q));
  });
});
