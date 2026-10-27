/** SMS spend cap (2026-10-27): every phone code is a paid SMS. One device asks
 *  for at most 5 a day and 3 for the same number (on top of Firebase's own
 *  limits); both send points check it; an optional hard stop detaches billing
 *  when the budget is used up. docs/ops/sms-spend-cap.md */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SMS_PER_DEVICE_PER_DAY, SMS_PER_NUMBER_PER_DAY, recentSends, smsRefusal, type SmsSend } from '../src/core/smsLimit.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const NOW = Date.parse('2026-10-27T12:00:00Z');
const H = 3_600_000;
const sends = (...xs: [number, string][]): SmsSend[] => xs.map(([hAgo, to]) => ({ at: NOW - hAgo * H, to }));

describe('the device limits', () => {
  test('3 codes for one number a day — the same number however it\'s written', () => {
    const log = sends([1, '+91 98450 00000'], [2, '+919845000000'], [3, '98450-00000 '.replace('98450', '+9198450')]);
    assert.match(smsRefusal(log, '+91 98450 00000', NOW)!, /That’s 3 codes for this number today/);
    assert.equal(smsRefusal(log.slice(0, 2), '+919845000000', NOW), null);
  });
  test('5 codes from one device a day, any numbers', () => {
    const log = sends([1, '+911'], [2, '+912'], [3, '+913'], [4, '+914'], [5, '+915']);
    assert.match(smsRefusal(log, '+916', NOW)!, /That’s 5 text codes from this device today/);
    assert.equal(SMS_PER_DEVICE_PER_DAY, 5);
    assert.equal(SMS_PER_NUMBER_PER_DAY, 3);
  });
  test('a day later they\'re forgotten; the fallback words follow the screen', () => {
    const old = sends([25, '+91'], [26, '+91'], [27, '+91']);
    assert.equal(smsRefusal(old, '+91', NOW), null);
    assert.equal(recentSends(old, NOW).length, 0);
    assert.match(smsRefusal(sends([1, '+9']), '+9', NOW) ?? 'ok', /ok/);
    assert.match(smsRefusal(sends([1, '+9'], [2, '+9'], [3, '+9']), '+9', NOW, 'verify by email instead')!, /or verify by email instead\.$/);
  });
});

describe('wired in', () => {
  test('both send points check before the SMS, and storage failing never blocks a code', () => {
    assert.match(read('src/core/phoneLogin.ts'), /await takeSms\(phone\);[^\n]*\n\s*await sendFirebaseCode\(phone\);/);
    assert.match(read('src/data/repos.ts'), /await takeSms\(number, 'verify by email instead'\);[^\n]*\n\s*await sendPhoneCode\(number\);/);
    const budget = read('src/core/smsBudget.ts');
    assert.match(budget, /catch \{ \/\* storage off: still send \*\/ \}/);
    assert.match(budget, /catch \{ return \[\]; \}/);
  });
  test('the hard stop only acts over budget, only on its own project', () => {
    const fn = read('ops/gcp/sms-billing-cap/index.js');
    assert.match(fn, /if \(!\(data\.costAmount > data\.budgetAmount\)\)/);
    assert.match(fn, /const name = `projects\/\$\{PROJECT_ID\}`;/);
    assert.match(fn, /billingAccountName: ''/);
    assert.match(read('docs/ops/sms-spend-cap.md'), /--trigger-topic=billing-cap --set-env-vars=PROJECT_ID=sportnnote-5c5e7/);
  });
});
