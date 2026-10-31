/**
 * MVP L8 (docs/security/breaks/mvp-l8-own-domain.md) — the web app on
 * app.sportnnote.in: the Worker serves it from sportnnote.expo.app, so viewers
 * never leave our domain. The light score page keeps /m/<id>; its "Full match"
 * link is /m/<id>?full=1 once APP_ORIGIN says the app lives here (switched on
 * after the founder's Cloudflare change). The marketing site is untouched.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.ts';

const ID = '6da23011-61fb-4c24-9a8c-7a29b2924c46';
const base = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key',
  ASSETS: { fetch: async (r: Request) => new Response(`asset:${new URL(r.url).pathname}`, { status: 200 }) },
};
const share = {
  id: ID, sport: 'football', status: 'live', starts_at: '2026-10-31T10:00:00Z', winner: null, summary: { h: '1', a: '0', s: '1st Half' },
  home: { name: 'Panthers', short_name: 'PAN' }, away: { name: 'Cheetahs', short_name: 'CHE' }, views: 0,
};
let calls: { url: string; init?: RequestInit }[] = [];
let upstream: () => Response = () => new Response('app', { status: 200, headers: { 'content-type': 'text/html' } });
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (url: string | Request, init?: RequestInit) => {
    const u = String(typeof url === 'string' ? url : url.url);
    calls.push({ url: u, init });
    if (u.includes('/rpc/share_match')) return new Response(JSON.stringify(share), { status: 200 });
    return upstream();
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });
const go = async (url: string, init: RequestInit = {}, env: Record<string, unknown> = base) => {
  calls = [];
  const res = await worker.fetch(new Request(url, init), env as never);
  return { res, body: await res.text() };
};

describe('D1: the app is served on app.sportnnote.in', () => {
  for (const p of ['/', '/LiveScoring?matchId=x&homeName=A', '/_expo/static/js/web/index-abc.js', `/m/${ID}?full=1`, '/sw.js']) {
    test(p, async () => {
      const { body } = await go(`https://app.sportnnote.in${p}`);
      assert.equal(body, 'app');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, `https://sportnnote.expo.app${p}`);
    });
  }
});

describe('D2 / D4: the light page and its "Full match" link', () => {
  test('/m/<id> is still the light page on the app host', async () => {
    const { body } = await go(`https://app.sportnnote.in/m/${ID}`);
    assert.match(body, /Full match &amp; stats/);
  });
  test('before the switch (no APP_ORIGIN): the link goes to the hosting address, as today', async () => {
    const { body } = await go(`https://app.sportnnote.in/m/${ID}`);
    assert.ok(body.includes(`https://sportnnote.expo.app/m/${ID}"`));
  });
  test('after the switch: /m/<id>?full=1 on our own domain, never a loop', async () => {
    const { body } = await go(`https://app.sportnnote.in/m/${ID}`, {}, { ...base, APP_ORIGIN: 'https://app.sportnnote.in' });
    assert.ok(body.includes(`https://app.sportnnote.in/m/${ID}?full=1"`));
  });
});

describe('D3: redirects stay on our domain', () => {
  test('an upstream redirect to the hosting address is rewritten', async () => {
    upstream = () => new Response(null, { status: 302, headers: { location: 'https://sportnnote.expo.app/LiveScoring?matchId=1' } });
    const { res } = await go('https://app.sportnnote.in/m/x');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'https://app.sportnnote.in/LiveScoring?matchId=1');
    upstream = () => new Response('app', { status: 200 });
  });
});

describe('D5: the marketing site and app links are untouched', () => {
  for (const u of ['https://sportnnote.in/', 'https://sportnnote.in/guides/', 'https://app.sportnnote.in/.well-known/assetlinks.json', 'https://sportnnote.in/LiveScoring']) {
    test(u, async () => {
      const { body } = await go(u);
      assert.equal(body, `asset:${new URL(u).pathname}`);
      assert.equal(calls.length, 0);
    });
  }
  test('the Worker runs first for every path (so the app host is never answered by the website)', () => {
    assert.match(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"run_worker_first": true/);
  });
});

describe('D6: only ever our hosting address, no cookies', () => {
  test('a forged host header changes nothing', async () => {
    await go('https://app.sportnnote.in/x', { headers: { 'x-forwarded-host': 'evil.example', host: 'evil.example', cookie: 'sb=secret' } });
    assert.equal(calls[0].url, 'https://sportnnote.expo.app/x');
    const h = new Headers(calls[0].init?.headers);
    assert.equal(h.get('cookie'), null);
    assert.equal(h.get('host'), null);
  });
  test('POST bodies pass through; GET has none', async () => {
    await go('https://app.sportnnote.in/api', { method: 'POST', body: 'x=1' });
    assert.equal(calls[0].init?.method, 'POST');
    assert.ok(calls[0].init?.body);
    await go('https://app.sportnnote.in/');
    assert.equal(calls[0].init?.body ?? null, null);
  });
});

test('/m/<id>/ (trailing slash) stays the light page on the app host', async () => {
  const { body } = await go(`https://app.sportnnote.in/m/${ID}/`);
  assert.match(body, /Full match &amp; stats/);
});

test('switched on: wrangler.jsonc sets APP_ORIGIN to our domain', () => {
  const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(JSON.parse(raw).vars.APP_ORIGIN, 'https://app.sportnnote.in');
});
