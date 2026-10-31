/**
 * Security Wave 4B — the low findings in the edge functions and the app.
 * Pure helpers run here; the Deno functions' wiring is checked in source.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripLinks, clip } from '../supabase/functions/_shared/text.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');

describe('EF-13 — relayed text carries no links, bare domains included', () => {
  test('urls, www, bare domains and shorteners go; ordinary words stay', () => {
    assert.equal(stripLinks('Win a prize at https://evil.example/x now'), 'Win a prize at now');
    assert.equal(stripLinks('see www.evil.example'), 'see');
    assert.equal(stripLinks('visit evil-site.com/claim today'), 'visit today');
    assert.equal(stripLinks('bit.ly/abc and wa.me/919800000000'), 'and');
    assert.equal(stripLinks('Great game, e.g. the 3.5 overs and Dr. Rao'), 'Great game, e.g. the 3.5 overs and Dr. Rao');
    assert.equal(clip('  hello  ', 3), 'hel');
  });
});

describe('the functions', () => {
  test('EF-16: POST-only functions refuse other methods', () => {
    for (const f of ['guardian-link', 'invite-joined', 'message-notify', 'notify-followers', 'push-send', 'verify-phone-firebase', 'notify-upcoming', 'privacy-retention', 'verification-reminders']) {
      assert.match(read(`supabase/functions/${f}/index.ts`), /req\.method !== 'POST'/, f);
    }
  });
  test('EF-17: reminder emails clean the venue and team names', () => {
    assert.match(read('supabase/functions/notify-upcoming/index.ts'), /Where: \$\{stripLinks\(clip\(m\.venue_name, 80\)\)\}/);
  });
  test('EF-14: the email / SMS limits fail closed', () => {
    const g = read('supabase/functions/_shared/guard.ts');
    assert.match(g, /failClosed/);
    assert.match(g, /rateLimitTo[\s\S]*failClosed: true/);
    assert.match(read('supabase/functions/send-contact-otp/index.ts'), /rateLimit\('contact-otp', [^)]*\{ failClosed: true \}\)/);
    assert.match(read('supabase/functions/guardian-consent/index.ts'), /rateLimit\('guardian-consent', [^)]*\{ failClosed: true \}\)/);
  });
  test('EF-19: verification-submit asks the database whether the caller runs the community', () => {
    const src = read('supabase/functions/verification-submit/index.ts');
    assert.match(src, /caller\.asUser\.rpc\('org_is_admin', \{ p_org: orgId \}\)/);
    assert.doesNotMatch(src, /from\('org_members'\)/);
  });
});

describe('CL-27 — exported files can\'t carry formulas or extra calendar lines', async () => {
  const { csvCell, icsText } = await import('../src/core/exportCells.ts');
  test('CSV', () => {
    assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvCell('+91 98000'), "'+91 98000");
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvCell('Ground 2, Pune'), '"Ground 2, Pune"');
    assert.equal(csvCell('Lords'), 'Lords');
  });
  test('iCalendar', () => {
    assert.equal(icsText('Venue\r\nATTENDEE:evil'), 'Venue\\nATTENDEE:evil');
    assert.equal(icsText('a;b,c\\d'), 'a\\;b\\,c\\\\d'); // AB-01: the semicolon is escaped too
  });
  test('the writers use them', () => {
    assert.match(read('src/data/scheduleImport.ts'), /import \{ csvCell \} from '\.\.\/core\/exportCells\.ts'/);
    assert.match(read('src/core/ics.ts'), /icsText/);
  });
});

describe('CL-25 — console helpers only in development, the demo, or for support', async () => {
  const { exposeGlobal, allowGlobals } = await import('../src/core/devGlobals.ts');
  const G = globalThis as unknown as Record<string, unknown>;
  test('a test hook appears only when allowed; admin tools only for support', () => {
    exposeGlobal('__w4Test', { a: 1 });
    exposeGlobal('__w4Admin', { b: 2 }, 'admin');
    assert.equal(G.__w4Test, undefined);
    assert.equal(G.__w4Admin, undefined);
    allowGlobals('test', true);
    assert.deepEqual(G.__w4Test, { a: 1 });
    assert.equal(G.__w4Admin, undefined);
    allowGlobals('admin', true);
    exposeGlobal('__w4Admin', { c: 3 }, 'admin');
    assert.deepEqual(G.__w4Admin, { b: 2, c: 3 }, 'merged');
    allowGlobals('admin', false);
    allowGlobals('test', false);
    assert.equal(G.__w4Admin, undefined);
    assert.equal(G.__w4Test, undefined);
  });
  test('no module sets a console global directly', () => {
    for (const f of ['src/sports/voiceParsers.ts', 'src/sports/cricket/lineup.ts', 'src/data/fixtures.ts', 'src/data/matchOutbox.ts', 'src/data/groups.ts',
      'src/data/reminders.ts', 'src/data/organizerStats.ts', 'src/data/pendingResults.ts', 'src/data/elimDraws.ts', 'src/data/repos.ts', 'src/data/matchRecordsBackfill.ts']) {
      assert.doesNotMatch(read(f), /\(globalThis as unknown as Record<string, unknown>\)\.__s[a-zA-Z]+ =/, f);
    }
  });
});

describe('CL-22 / CL-30 — asked, and told', () => {
  test('an invite link asks before following its sender', () => {
    const src = read('src/data/referral.ts');
    assert.match(src, /askConfirm\(\{\s*title: `Follow \$\{name\}\?`/);
    assert.ok(src.indexOf('askConfirm(') < src.indexOf("setFollow('player', from, true"), 'asked before following');
  });
  test('web voice scoring says where the audio goes', () => {
    assert.match(read('src/sports/VoiceScorer.tsx'), /speech service/);
  });
});
