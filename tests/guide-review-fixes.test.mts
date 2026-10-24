/** Fixes found while writing the website guides (2026-10-24; migration
 *  20261025170000_guide_review_fixes). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAppLink } from '../src/core/appLinks.ts';
import { checklistItems, nextStep } from '../src/core/verificationChecklist.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_guide_review_fixes'))!), 'utf8');

describe('1. certificates: revoke with a reason, then issue again', () => {
  test('one per player per achievement counts live certificates only', () => {
    assert.match(sql, /drop index if exists certificates_unique_achievement;/);
    assert.match(sql, /create unique index if not exists certificates_unique_live_achievement[\s\S]*?where revoked_at is null;/);
  });
  test('the organiser screen asks why, and a revoked one can be issued again', () => {
    const s = read('src/screens/CertificatesScreen.tsx');
    assert.match(s, /new Set\(issued\.filter\(\(c\) => !c\.revokedAt\)\.map\(key\)\)/);
    assert.match(s, /if \(!revokeReason\.trim\(\)\) \{ setError/);
    assert.match(s, /await revokeCertificate\(c\.code, revokeReason\.trim\(\)\)/);
    assert.match(s, /pick the right one above and issue it again/);
  });
});

describe('2. reprinting from your profile names the real issuer', () => {
  test('the issuer comes from the certificate’s check record, not the tournament name', () => {
    const s = read('src/components/MyCertificatesCard.tsx');
    assert.match(s, /await verifyCertificate\(c\.code\)\.then\(\(v\) => v\.issuer\)/);
    assert.doesNotMatch(s, /issuer: c\.tournament/);
  });
});

describe('3. the in-app QR scanner opens SportnNote pages', () => {
  const ours = ['sportnnote://', 'https://sportnnote.in', 'https://app.sportnnote.in', 'https://sportnnote.expo.app'];
  test('certificate, passport, hall of fame and the share links', () => {
    assert.deepEqual(parseAppLink('https://app.sportnnote.in/c/ABCDE23456', ours), { screen: 'Certificate', params: { code: 'ABCDE23456' } });
    assert.deepEqual(parseAppLink('https://app.sportnnote.in/pp/ZZZZZ23456?x=1', ours), { screen: 'Passport', params: { code: 'ZZZZZ23456' } });
    assert.deepEqual(parseAppLink('https://sportnnote.expo.app/h/8d9dff8e-3198-474c-91fc-93b4cee69b7f', ours),
      { screen: 'HallOfFame', params: { orgId: '8d9dff8e-3198-474c-91fc-93b4cee69b7f' } });
    assert.equal(parseAppLink('https://app.sportnnote.in/t/abc', ours)?.screen, 'Tournament');
    assert.equal(parseAppLink('https://app.sportnnote.in/m/abc', ours)?.screen, 'MatchLink');
    assert.equal(parseAppLink('sportnnote://p/abc', ours)?.screen, 'PlayerProfile');
  });
  test('never someone else’s site, a look-alike host, or an unknown path', () => {
    assert.equal(parseAppLink('https://evil.example/c/ABCDE23456', ours), null);
    assert.equal(parseAppLink('https://app.sportnnote.in.evil.example/c/ABCDE23456', ours), null);
    assert.equal(parseAppLink('https://app.sportnnote.in/join-club/XYZ', ours), null);
    assert.equal(parseAppLink('https://app.sportnnote.in/c/', ours), null);
    assert.equal(parseAppLink('T-ABC123', ours), null);
  });
  test('wired into the scanner before the join codes', () => {
    const s = read('src/screens/ScanQRScreen.tsx');
    assert.ok(s.indexOf('parseAppLink(data') < s.indexOf('parseTournamentToken(data)'));
  });
});

describe('4. printing that can’t happen says so', () => {
  test('profile card, passport and hall of fame handle a failed print', () => {
    assert.match(read('src/components/MyCertificatesCard.tsx'), /if \(r === 'failed'\) notice\('Printing isn’t available here'/);
    assert.match(read('src/screens/PassportScreen.tsx'), /if \(r === 'failed'\) setError\('Printing isn’t available here/);
    assert.match(read('src/screens/HallOfFameScreen.tsx'), /if \(r === 'failed'\) setError\('Printing isn’t available here/);
  });
});

describe('5. the checklist never offers a consent link the server refuses', () => {
  const base = { age: 14, hasDob: true, guardian: { added: true, phoneVerified: true } };
  test('consent already confirmed: no "send the link"; the age step points elsewhere', () => {
    const items = checklistItems({ ...base, consent: 'confirmed' });
    assert.ok(!items.some((x) => !x.done && x.action === 'send_consent'));
    assert.ok(!items.some((x) => x.key === 'g_email'));
    const age = items.find((x) => x.key === 'age')!;
    assert.equal(age.action, 'upload_document');
    assert.match(age.hint!, /Settings → Link as a parent\/guardian → Manage/);
    assert.equal(nextStep(items)!.key, 'age');
  });
  test('self-declared at sign-up: the link is offered — and the server now accepts it', () => {
    const items = checklistItems({ ...base, consent: 'self_declared' });
    assert.equal(items.find((x) => x.key === 'age')!.action, 'send_consent');
    assert.match(sql, /not in \('pending', 'withdrawn', 'self_declared'\)/);
    assert.match(read('supabase/functions/guardian-consent/index.ts'), /status !== 'pending' && status !== 'withdrawn' && status !== 'self_declared'/);
  });
  test('pending: unchanged (send the link)', () => {
    assert.equal(checklistItems({ ...base, consent: 'pending' }).find((x) => x.key === 'age')!.action, 'send_consent');
  });
});

describe('6. privacy wording matches who sees a child’s name', () => {
  test('consent page and consent email', () => {
    assert.match(read('src/screens/GuardianConsentScreen.tsx'), /everyone else — signed in or not — sees only their initials/);
    const fn = read('supabase/functions/guardian-consent/index.ts');
    assert.match(fn, /Only you and people on their teams, clubs and tournaments see their full name; everyone else sees their initials\./);
    assert.doesNotMatch(fn, /only their own teams can see their profile/);
  });
});

describe('7. every school / club’s DOB confirmation is kept', () => {
  test('stored per organisation, plus the latest for the age badge; the list checks its own', () => {
    assert.match(sql, /'orgs', coalesce\(p\.dob_confirmations->'orgs', '\{\}'::jsonb\)/);
    assert.match(sql, /'org', jsonb_build_object\('orgId', p_org/);
    assert.match(sql, /p\.dob_confirmations->'orgs'->p_org::text->>'dob' = p\.dob::text/);
  });
});
