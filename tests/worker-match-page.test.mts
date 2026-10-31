/**
 * The live score link (MVP, founder 2026-10-31): app.sportnnote.in/m/<match>
 * is answered by the website's Cloudflare Worker (worker/index.ts) with a
 * ~15 KB page: link-preview robots (WhatsApp, Facebook, X…) read
 * "⚽ LIVE · Panthers 2–1 Cheetahs" from its tags, and people see the live
 * score at once (it refreshes itself) instead of loading the 7 MB app.
 * Everything else on the website is served as before.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import worker from '../worker/index.ts';
import { SPORTS } from '../worker/sports.ts';

const ID = '6da23011-61fb-4c24-9a8c-7a29b2924c46';
const env = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  ASSETS: { fetch: async (r: Request) => new Response(`asset:${new URL(r.url).pathname}`, { status: 200 }) },
};
type Share = Record<string, unknown> | null;
let answer: Share | 'error' | 'hang' = null;
let calls: { url: string; init?: RequestInit }[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (answer === 'error') return new Response('{"message":"boom"}', { status: 500 });
    if (answer === 'hang') return new Promise(() => {});
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });

const match = (o: Record<string, unknown> = {}) => ({
  id: ID, sport: 'football', status: 'live', starts_at: '2026-10-31T10:00:00Z', venue_name: 'Gachibowli Stadium', winner: null,
  summary: { h: '2', a: '1', s: '2nd Half', d: 'HT 1–0' }, result_score: null,
  home: { name: 'Panthers', short_name: 'PAN', color_hex: '#B98AFF' }, away: { name: 'Cheetahs', short_name: 'CHE', color_hex: '#3DDC97' },
  tournament: { id: 't1', name: 'Inter-School Championship' }, views: 340, ...o,
});
async function get(path: string, share: Share | 'error' | 'hang', host = 'app.sportnnote.in') {
  answer = share; calls = [];
  const res = await worker.fetch(new Request(`https://${host}${path}`, { headers: { 'user-agent': 'WhatsApp/2.23.20.0' } }), env as never);
  return { res, html: await res.text() };
}
const meta = (html: string, prop: string) => new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1];

describe('a live match', () => {
  test('the preview reads "⚽ LIVE · Panthers 2–1 Cheetahs", with the status and tournament, and a large image', async () => {
    const { res, html } = await get(`/m/${ID}`, match());
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(meta(html, 'og:title'), '⚽ LIVE · Panthers 2–1 Cheetahs');
    assert.match(meta(html, 'og:description') ?? '', /2nd Half.*Inter-School Championship/);
    assert.equal(meta(html, 'og:image'), 'https://sportnnote.in/share/football.png');
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'og:url'), `https://app.sportnnote.in/m/${ID}`);
  });
  test('people see the score straight away, a way into the full match, and it keeps itself up to date', async () => {
    const { res, html } = await get(`/m/${ID}`, match());
    assert.match(html, /Panthers/);
    assert.match(html, />2</);
    assert.match(html, />1</);
    assert.match(html, /HT 1–0/);
    assert.match(html, /340 views/);
    assert.ok(html.includes(`https://sportnnote.expo.app/m/${ID}`), 'full match link');
    assert.match(html, /setInterval|setTimeout/);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=(\d|10)\b/);
  });
  test('it\'s light: well under 20 KB', async () => {
    const { html } = await get(`/m/${ID}`, match());
    assert.ok(new TextEncoder().encode(html).length < 20_000, String(html.length));
  });
  test('it asks the database for this match only, with the public key, read-only (GET)', async () => {
    await get(`/m/${ID}`, match());
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://proj.supabase.co/rest/v1/rpc/share_match?p_id=${ID}`);
    assert.equal((calls[0].init?.method ?? 'GET').toUpperCase(), 'GET');
    assert.equal(new Headers(calls[0].init?.headers).get('apikey'), 'anon-key');
  });
});

describe('finished and upcoming matches', () => {
  test('a result: "RESULT", who won, and no refreshing; cached longer', async () => {
    const { res, html } = await get(`/m/${ID}`, match({ status: 'completed', winner: 'home', summary: { h: '3', a: '1', s: 'Full time' } }));
    assert.equal(meta(html, 'og:title'), '⚽ RESULT · Panthers 3–1 Cheetahs');
    assert.match(meta(html, 'og:description') ?? '', /Panthers won/);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=300/);
  });
  test('a draw says so', async () => {
    const { html } = await get(`/m/${ID}`, match({ status: 'completed', winner: 'draw', summary: { h: '1', a: '1', s: 'Full time' } }));
    assert.match(meta(html, 'og:description') ?? '', /Drawn/i);
  });
  test('a match closed by hand without a summary uses its result score', async () => {
    const { html } = await get(`/m/${ID}`, match({ status: 'completed', winner: 'home', summary: null, result_score: { home: 3, away: 0 } }));
    assert.equal(meta(html, 'og:title'), '⚽ RESULT · Panthers 3–0 Cheetahs');
  });
  test('upcoming: the two sides and when', async () => {
    const { html } = await get(`/m/${ID}`, match({ status: 'scheduled', summary: null }));
    assert.equal(meta(html, 'og:title'), '⚽ UPCOMING · Panthers vs Cheetahs');
    assert.match(meta(html, 'og:description') ?? '', /31 Oct/);
  });
  test('another sport gets its own symbol and picture', async () => {
    const { html } = await get(`/m/${ID}`, match({ sport: 'pickleball', summary: { h: '11', a: '7', s: 'Game 2' } }));
    assert.equal(meta(html, 'og:title'), '🥒 LIVE · Panthers 11–7 Cheetahs');
    assert.equal(meta(html, 'og:image'), 'https://sportnnote.in/share/pickleball.png');
  });
});

describe('never breaks, never leaks', () => {
  test('team and tournament names can\'t inject HTML or break the tags', async () => {
    const { html } = await get(`/m/${ID}`, match({ home: { name: '<script>alert(1)</script>', short_name: 'X' }, tournament: { id: 't', name: 'Cup "A" & <b>' } }));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(!/content="[^"]*"A"/.test(html), 'a quote can\'t end an attribute');
  });
  test('a match that doesn\'t exist: a friendly 404 page that still offers the app', async () => {
    const { res, html } = await get(`/m/${ID}`, null);
    assert.equal(res.status, 404);
    assert.match(html, /sportnnote\.expo\.app/);
  });
  test('the database down or slow: the page still answers, pointing to the full match', async () => {
    const down = await get(`/m/${ID}`, 'error');
    assert.equal(down.res.status, 200);
    assert.ok(down.html.includes(`https://sportnnote.expo.app/m/${ID}`));
    const t0 = Date.now();
    const slow = await get(`/m/${ID}`, 'hang');
    assert.equal(slow.res.status, 200);
    assert.ok(Date.now() - t0 < 4000, 'gives up within a few seconds');
  });
  // MVP L8: on app.sportnnote.in everything else is the web app (worker-own-domain.test.mts)
  test('anything that isn\'t a match link is the website as before (sportnnote.in)', async () => {
    for (const p of ['/', '/guides/', '/privacy/', '/m/not-a-uuid', `/m/${ID}/extra`]) {
      const { html } = await get(p, match(), 'sportnnote.in');
      assert.equal(html, `asset:${p}`, p);
    }
  });
});

describe('the sport list stays in step with the app', () => {
  test('every sport\'s name and symbol match src/sports/<id>/meta.ts', () => {
    const root = new URL('../src/sports/', import.meta.url);
    const ids = readdirSync(root).filter((d) => existsSync(new URL(`${d}/meta.ts`, root)));
    for (const id of ids) {
      const s = readFileSync(new URL(`${id}/meta.ts`, root), 'utf8');
      const icon = /^ {2}icon: '([^']+)'/m.exec(s)?.[1];
      const name = /^ {2}name: '([^']+)'/m.exec(s)?.[1];
      if (!icon || !name) continue;
      assert.deepEqual(SPORTS[id], { name, icon }, id);
    }
  });
});

describe('break-it fixes', () => {
  test('LL-01: open pages refresh from the Worker (one cached database read per match every 5 s), not the database', async () => {
    const { html } = await get(`/m/${ID}`, match());
    assert.ok(html.includes(`/m/${ID}.json`), 'polls the Worker');
    assert.ok(!html.includes('anon-key'), 'no database key in the page');
    assert.ok(!html.includes('/rest/v1/'), 'no database address in the page');
    const { res, html: body } = await get(`/m/${ID}.json`, match());
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    assert.match(res.headers.get('cache-control') ?? '', /max-age=5\b/);
    assert.equal(JSON.parse(body).summary.h, '2');
    // the database read itself is cached at Cloudflare's edge for 5 seconds
    assert.equal((calls[0].init as { cf?: { cacheTtl?: number } })?.cf?.cacheTtl, 5);
  });
  test('LL-01: the refresh answer has only what the page shows', async () => {
    const { html: body } = await get(`/m/${ID}.json`, match({ secret: 'x' }));
    assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['status', 'summary', 'winner']);
  });
  test('LL-05: a cancelled or postponed match says so', async () => {
    assert.match(meta((await get(`/m/${ID}`, match({ status: 'cancelled', summary: null }))).html, 'og:title') ?? '', /CANCELLED · Panthers vs Cheetahs/);
    assert.match(meta((await get(`/m/${ID}`, match({ status: 'postponed', summary: null }))).html, 'og:title') ?? '', /POSTPONED/);
  });
});

describe('Cloudflare config (found live, 2026-10-31)', () => {
  test('the Worker answers /m/* first, or a browser opening a link gets the website\'s 404 page', () => {
    // Cloudflare's static layer answers page navigations itself unless the Worker is asked to run first.
    const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const cfg = JSON.parse(raw);
    assert.equal(cfg.main, 'worker/index.ts');
    assert.equal(cfg.assets.binding, 'ASSETS');
    // MVP L8: `true` (every path) covers /m/* too
    assert.ok(cfg.assets.run_worker_first === true || (Array.isArray(cfg.assets.run_worker_first) && cfg.assets.run_worker_first.includes('/m/*')));
  });
});
