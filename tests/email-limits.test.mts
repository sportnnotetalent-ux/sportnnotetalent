/**
 * Audit AS-06 (docs/security/breaks/audit-security-2026-10-31.md): the two
 * functions that email an address the caller types.
 *  - send-invite: 20 a day per sender, but the limit failed OPEN and nothing
 *    capped one recipient (many accounts could flood one inbox).
 *  - org-verify: 5 an hour per community only, failing open — one person with
 *    many communities could send many.
 * Both now fail closed (W4 rule for anything that sends email) and cap each
 * recipient; org-verify also caps each sender. Checked on source (Deno).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(import.meta.dirname, '..', 'supabase/functions', f, 'index.ts'), 'utf8');
const limits = (src: string) => [...src.matchAll(/rateLimit\('([^']+)', ([^,]+), (\d+), (\d+)(, \{ failClosed: true \})?\)/g)]
  .map((m) => ({ bucket: m[1], subject: m[2], max: Number(m[3]), window: Number(m[4]), closed: !!m[5] }));

test('send-invite: per sender and per recipient, both failing closed, before sending', () => {
  const src = read('send-invite');
  const l = limits(src);
  assert.ok(l.find((x) => x.bucket === 'send-invite' && x.subject === 'caller.user.id' && x.closed), 'per sender, closed');
  assert.ok(l.find((x) => x.bucket === 'send-invite-to' && /to/.test(x.subject) && x.closed && x.max <= 5), 'per recipient, closed');
  assert.ok(src.lastIndexOf('rateLimit(') < src.indexOf('await sendEmail('));
});

test('org-verify: per community, per sender and per recipient, all failing closed', () => {
  const src = read('org-verify');
  const l = limits(src);
  assert.ok(l.find((x) => x.bucket === 'org-verify' && x.subject === 'orgId' && x.closed), 'per community, closed');
  assert.ok(l.find((x) => x.bucket === 'org-verify-by' && x.subject === 'caller.user.id' && x.closed), 'per sender, closed');
  assert.ok(l.find((x) => x.bucket === 'org-verify-to' && /email/.test(x.subject) && x.closed), 'per recipient, closed');
});
