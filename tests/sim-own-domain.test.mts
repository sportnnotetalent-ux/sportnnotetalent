/**
 * Quality mandate step 6 for L8 (docs/security/breaks/mvp-l8-own-domain.md):
 * 1,000 random requests (hosts, paths, methods, forged headers). The proxy only
 * ever fetches https://sportnnote.expo.app, only for the app host, never for
 * /.well-known or the marketing site, never with cookies; a match link (GET,
 * no ?full) is always the light page.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';

const ID = '6da23011-61fb-4c24-9a8c-7a29b2924c46';
let seed = 71;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'k', ASSETS: { fetch: async () => new Response('asset') } };
let calls: { url: string; init?: RequestInit }[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/rpc/share_match')) return new Response(JSON.stringify({ id: ID, sport: 'football', status: 'live', home: { name: 'A' }, away: { name: 'B' } }));
    return new Response('app');
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

test('1,000 random requests', async () => {
  const hosts = ['app.sportnnote.in', 'sportnnote.in', 'www.sportnnote.in'];
  const paths = ['/', '/LiveScoring?matchId=1', `/m/${ID}`, `/m/${ID}?full=1`, `/m/${ID}.json`, `/m/${ID}/`, '/m/abc', '/.well-known/assetlinks.json', '/_expo/static/js/x.js', '/guides/', '//evil.example/x', '/@evil.example'];
  for (let i = 0; i < 1000; i++) {
    const host = hosts[rnd(hosts.length)];
    const path = paths[rnd(paths.length)];
    const method = ['GET', 'HEAD', 'POST'][rnd(3)];
    calls = [];
    const req = new Request(`https://${host}${path}`, { method, headers: { cookie: 'sb=1', 'x-forwarded-host': 'evil.example' }, ...(method === 'POST' ? { body: 'x' } : {}) });
    const res = await worker.fetch(req, env as never);
    await res.text();
    const up = calls.filter((c) => !c.url.includes('/rpc/share_match'));
    for (const c of up) {
      assert.ok(c.url.startsWith('https://sportnnote.expo.app/'), c.url);
      assert.equal(new URL(c.url).host, 'sportnnote.expo.app');
      assert.equal(new Headers(c.init?.headers).get('cookie'), null);
    }
    const p = new URL(req.url).pathname;
    if (host !== 'app.sportnnote.in' || p.startsWith('/.well-known/')) assert.equal(up.length, 0, `${host}${path} must not be proxied`);
    const lightLink = /^\/m\/[0-9a-f-]{36}(\.json|\/)?$/.test(p) && !path.includes('full=1') && method !== 'POST';
    if (lightLink) assert.equal(up.length, 0, `${host}${path} ${method} is the light page`);
    if (host === 'app.sportnnote.in' && !p.startsWith('/.well-known/') && !lightLink) assert.equal(up.length, 1, `${path} ${method} is the app`);
  }
});
