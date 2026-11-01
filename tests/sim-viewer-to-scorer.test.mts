/**
 * Quality mandate step 6 for viewers become scorers
 * (docs/security/breaks/viewer-to-scorer.md): 1,000 random light pages (every
 * status, database up or down) all carry the call to action to our own domain,
 * once; 1,000 random (and hostile) "from" values always become a short,
 * harmless analytics tag.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { cleanFrom } from '../src/core/guestMatch.ts';

let seed = 131;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const ID = '6da23011-61fb-4c24-9a8c-7a29b2924c46';
let answer: unknown = null;
const realFetch = globalThis.fetch;
before(() => { globalThis.fetch = (async () => (answer === 'error' ? new Response('x', { status: 500 }) : new Response(JSON.stringify(answer)))) as typeof fetch; });
after(() => { globalThis.fetch = realFetch; });

test('1,000 light pages carry the call to action, once, on our domain', async () => {
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'k', APP_ORIGIN: 'https://app.sportnnote.in', ASSETS: { fetch: async () => new Response('asset') } };
  for (let i = 0; i < 1000; i++) {
    const r = rnd(5);
    answer = r === 0 ? 'error' : r === 1 ? null : { id: ID, sport: ['football', 'tennis', 'kabaddi'][rnd(3)], status: ['live', 'completed', 'scheduled'][rnd(3)], home: { name: 'A' }, away: { name: 'B' }, summary: { h: '1', a: '0' } };
    const html = await (await worker.fetch(new Request(`https://app.sportnnote.in/m/${ID}`), env as never)).text();
    assert.equal(html.split('href="https://app.sportnnote.in/GuestGame?from=match_link"').length - 1, 1);
  }
});

test('1,000 "from" values become a harmless tag', () => {
  const chars = 'abcxyz_ABC09<>"\'/:;. &?=%é漢😀';
  for (let i = 0; i < 1000; i++) {
    const raw = rnd(10) === 0 ? undefined : Array.from({ length: rnd(60) }, () => chars[rnd(chars.length)]).join('');
    const t = cleanFrom(raw);
    assert.match(t, /^[a-z_]{1,24}$/);
  }
});
