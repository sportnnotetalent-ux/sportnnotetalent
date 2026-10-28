/**
 * Security Wave 3D — the edge functions (EF-06 to EF-12). The pure helpers run
 * here; the functions themselves are Deno, so their wiring is checked in source
 * (as tests/security-wave1.test.mts does).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clientIp, readCapped } from '../supabase/functions/_shared/net.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('clientIp', () => {
  test('the proxy\'s address first, then the first forwarded one', () => {
    assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.1.1.1' })), '203.0.113.5');
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': ' 198.51.100.2 , 10.0.0.1' })), '198.51.100.2');
    assert.equal(clientIp(new Headers({ 'x-real-ip': '192.0.2.9' })), '192.0.2.9');
    assert.equal(clientIp(new Headers({})), 'unknown');
  });
  test('junk in the header is never a bucket key', () => {
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': 'x'.repeat(500) })), 'unknown');
  });
});

describe('readCapped (EF-07)', () => {
  test('a body under the cap is read whole; over it, null', async () => {
    assert.equal(await readCapped(new Response('hello'), 10), 'hello');
    assert.equal(await readCapped(new Response('x'.repeat(5000)), 1000), null);
    assert.equal(await readCapped(new Response(null), 10), '');
  });
});

describe('the functions', () => {
  test('EF-06: send-contact-otp never returns a provider\'s error text', () => {
    const src = read('supabase/functions/send-contact-otp/index.ts');
    assert.doesNotMatch(src, /json\(\{[^}]*\bdetail\b/);
  });
  test('EF-07: register-lookup doesn\'t follow redirects and caps the page it reads', () => {
    const src = read('supabase/functions/register-lookup/index.ts');
    assert.match(src, /redirect: 'manual'/);
    assert.match(src, /readCapped\(res, /);
    assert.doesNotMatch(src, /await res\.text\(\)/);
  });
  test('EF-08: support-assistant has an overall hourly budget and a smaller context', () => {
    const src = read('supabase/functions/support-assistant/index.ts');
    assert.match(src, /rateLimit\('support-assistant:all', 'all', \d+, 3600\)/);
    assert.match(src, /body\.context\.slice\(0, 6000\)/);
  });
  test('EF-11: report-invite and join are limited per address', () => {
    for (const f of ['report-invite', 'join']) {
      const src = read(`supabase/functions/${f}/index.ts`);
      assert.match(src, /rateLimit\('[a-z-]+-ip', clientIp\(req\.headers\)/, f);
    }
  });
});
