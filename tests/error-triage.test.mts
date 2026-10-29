/**
 * The daily email's errors, labelled (founder 2026-10-29: "9 errors in today's
 * email — do you not have a way to track these?"). Each error is NEW (look at
 * it), from an OLDER version of the web app than the one live now, or known
 * NOISE that isn't an app bug. Pure: supabase/functions/_shared/errorTriage.ts.
 * The example is the real 29 Oct digest: 9 errors, all handled that day.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyError, summariseErrors, webBundleOf } from '../supabase/functions/_shared/errorTriage.ts';

const at = (b: string) => `TypeError at x (https://sportnnote.expo.app/_expo/static/js/web/index-${b}e4def6d67d8f195741b6e989.js:1020:3127)`;
const OCT29 = [
  { message: "SyntaxError: Unexpected token '<'", stack: null, platform: 'web', screen: 'Auth' },
  { message: "SyntaxError: Unexpected token '<'", stack: null, platform: 'web', screen: 'Auth' },
  { message: 'TypeError: c.default.State.currentlyFocusedInput is not a function', stack: at('1867cbe0'), platform: 'web', screen: 'Auth' },
  { message: 'TypeError: c.default.State.currentlyFocusedInput is not a function', stack: at('1867cbe0'), platform: 'web', screen: 'Auth' },
  ...Array.from({ length: 4 }, () => ({ message: 'Error: cannot execute INSERT in a read-only transaction', stack: 'ct@https://sportnnote.expo.app/_expo/static/js/web/index-fdf3a05e98643cd7e35114a97083b725.js:654:122472', platform: 'web', screen: 'ScheduleMatch' })),
  { message: 'Error: Script error.', stack: null, platform: 'web', screen: 'Home' },
];

describe('which version an error came from', () => {
  test('the web build from the stack; nothing for a stack without one', () => {
    assert.equal(webBundleOf(at('1867cbe0')), '1867cbe0');
    assert.equal(webBundleOf(null), null);
    assert.equal(webBundleOf('at foo (index.android.bundle:1:2)'), null);
  });
});

describe('each error is new, from an older version, or noise', () => {
  const live = { web: 'f6dee86e' };
  test('noise: the hosting service briefly refusing ("Unexpected token <") and the browser\'s detail-less "Script error."', () => {
    assert.equal(classifyError(OCT29[0], live), 'noise');
    assert.equal(classifyError(OCT29[8], live), 'noise');
  });
  test('older: a web build that isn\'t the live one', () => {
    assert.equal(classifyError(OCT29[2], live), 'older');
    assert.equal(classifyError(OCT29[4], live), 'older');
  });
  test('new: the live web build, the phone app, or when the live build is unknown', () => {
    assert.equal(classifyError({ ...OCT29[4], stack: OCT29[4].stack.replace('fdf3a05e', 'f6dee86e') }, live), 'new');
    assert.equal(classifyError({ message: 'TypeError: x is undefined', stack: 'at y (index.android.bundle:1:2)', platform: 'android' }, live), 'new');
    assert.equal(classifyError(OCT29[4], { web: null }), 'new');
  });
  test('a real error that merely mentions "<" is not noise', () => {
    assert.equal(classifyError({ message: 'TypeError: a < b failed', stack: at('f6dee86e'), platform: 'web' }, live), 'new');
  });
  test('the app reading a web page as JSON is a real bug, not noise (only the bare script-load message is)', () => {
    assert.equal(classifyError({ message: 'SyntaxError: Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON', stack: at('f6dee86e'), platform: 'web' }, live), 'new');
    assert.equal(classifyError({ message: 'SyntaxError: JSON Parse error: Unrecognized token \'<\'', stack: at('f6dee86e'), platform: 'web' }, live), 'new');
    assert.equal(classifyError({ message: "SyntaxError: Unexpected token '<'", stack: at('f6dee86e'), platform: 'web' }, live), 'new');
  });
  test('"Script error." is noise even with a stack: the stack is our own reporter\'s (live data, 29 Oct), not the error\'s', () => {
    const reporter = 'M@https://sportnnote.expo.app/_expo/static/js/web/index-f6dee86e98643cd7e35114a97083b725.js:16196:3458\n@https://sportnnote.expo.app/_expo/static/js/web/index-f6dee86e98643cd7e35114a97083b725.js:16196:873';
    assert.equal(classifyError({ message: 'Error: Script error.', stack: reporter, platform: 'web' }, live), 'noise');
  });
});

describe('the email', () => {
  test('29 Oct: "0 new · 6 on an older version · 3 noise", new ones first, each group explained', () => {
    const s = summariseErrors(OCT29, { web: 'f6dee86e' });
    assert.deepEqual(s.counts, { new: 0, older: 6, noise: 3 });
    assert.equal(s.headline, '0 new · 6 on an older version · 3 noise');
    const text = s.lines.join('\n');
    assert.match(text, /On an older version of the web app/);
    assert.match(text, /4× Error: cannot execute INSERT in a read-only transaction \(on ScheduleMatch\)/);
    assert.match(text, /Noise/);
    assert.doesNotMatch(text, /New — look at these/);
  });
  test('new errors are listed first, with crashes marked', () => {
    const s = summariseErrors([...OCT29, { message: 'TypeError: boom', stack: at('f6dee86e'), platform: 'web', screen: 'Standings', fatal: true }], { web: 'f6dee86e' });
    assert.equal(s.counts.new, 1);
    const text = s.lines.join('\n');
    assert.ok(text.indexOf('New — look at these') < text.indexOf('On an older version'));
    assert.match(text, /1× \[CRASH\] TypeError: boom \(on Standings\)/);
  });
  test('no errors: one line', () => {
    assert.deepEqual(summariseErrors([], { web: 'f6dee86e' }).lines, ['  None 🎉']);
  });
});

describe('500 users\' errors in one day', () => {
  test('every error lands in exactly one group, the right one, and the email stays short', () => {
    let seed = 20261029;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const kinds = ['live', 'older', 'android', 'hiccup', 'script', 'json'] as const;
    const want = { live: 'new', older: 'older', android: 'new', hiccup: 'noise', script: 'noise', json: 'new' } as const;
    const rows: { message: string; stack: string | null; platform: string; screen: string; truth: string }[] = [];
    for (let u = 0; u < 500; u++) {
      for (let k = Math.floor(rnd() * 4); k > 0; k--) {
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        const n = Math.floor(rnd() * 40);
        const row = {
          live: { message: `TypeError: bug ${n}`, stack: at('f6dee86e'), platform: 'web' },
          older: { message: `TypeError: old bug ${n}`, stack: at(['1867cbe0', 'fdf3a05e', '88fa35d1'][n % 3]), platform: 'web' },
          android: { message: `Error: phone bug ${n}`, stack: 'at y (index.android.bundle:1:2)', platform: 'android' },
          hiccup: { message: "SyntaxError: Unexpected token '<'", stack: rnd() < 0.5 ? null : "SyntaxError: Unexpected token '<'", platform: 'web' },
          script: { message: 'Error: Script error.', stack: at('f6dee86e'), platform: 'web' },
          json: { message: 'SyntaxError: Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON', stack: at('f6dee86e'), platform: 'web' },
        }[kind];
        rows.push({ ...row, screen: `Screen${n % 7}`, truth: want[kind] });
      }
    }
    const live = { web: 'f6dee86e' };
    for (const r of rows) assert.equal(classifyError(r, live), r.truth, `${r.message} / ${r.stack}`);
    const s = summariseErrors(rows, live);
    const truth = (l: string) => rows.filter((r) => r.truth === l).length;
    assert.deepEqual(s.counts, { new: truth('new'), older: truth('older'), noise: truth('noise') });
    assert.ok(rows.length > 500, `${rows.length} errors`);
    assert.ok(s.lines.length <= 3 + 10 + 5 + 3, `${s.lines.length} lines`);
  });
});

describe('the daily report uses it', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'supabase/functions/weekly-report/index.ts'), 'utf8');
  test('reads the stack, learns the live web build, labels the errors, and the subject counts new ones', () => {
    assert.match(src, /select\('message, fatal, screen, platform, stack'\)/);
    assert.match(src, /liveWebBundle\(/);
    assert.match(src, /summariseErrors\(/);
    assert.match(src, /new errors/);
  });
});
