/** Career passport (migration 20261025110000_career_passport). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { honourCounts, passportHtml, passportUrl } from '../src/core/passport.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the link', () => {
  test('/pp/CODE, typed codes cleaned up', () => {
    assert.equal(passportUrl('abcd-e234-56', 'https://app.sportnnote.in/'), 'https://app.sportnnote.in/pp/ABCDE23456');
  });
});

describe('the printable passport', () => {
  const honours = [
    { code: 'ABCDE23456', kind: 'champion', title: 'Champions', detail: 'Cup · Football', teamName: 'Red <House>', eventDate: '2026-11-02', issuer: 'Greenwood High' },
    { code: 'BBBBB23456', kind: 'medal', title: 'Gold — 100 m U14', eventDate: '2026-12-01' },
    { code: 'CCCCC23456', kind: 'runner_up', title: 'Runners-up' },
    { code: 'DDDDD23456', kind: 'award', title: 'Player of the Tournament' },
  ];
  const html = passportHtml({
    name: 'Meera & Rao', code: 'ZZZZZ23456', appUrl: 'https://app.sportnnote.in', ageVerifiedBy: 'school', since: '2026-08-01T00:00:00Z',
    official: { matches: 11, record: '8W 2D 1L' },
    sports: [{ icon: '⚽', name: 'Football', matches: 11, record: '8W 2D 1L', summary: '12 goals · 4 assists' }],
    honours,
  });
  test('counts: titles, podiums & medals, awards', () => {
    assert.deepEqual(honourCounts(honours), { titles: 1, medals: 2, awards: 1 });
  });
  test('A4 portrait, QR to the live passport, record + honours with their codes', () => {
    assert.match(html, /@page \{ size: A4 portrait/);
    assert.equal((html.match(/<svg /g) ?? []).length, 1);
    assert.match(html, /app\.sportnnote\.in\/pp\/ZZZZZ23456/);
    assert.match(html, /ZZZZ-Z234-56/);
    assert.match(html, /Official matches<\/div><div class="muted">8W 2D 1L/);
    assert.match(html, /12 goals · 4 assists/);
    assert.match(html, /ABCD-E234-56/);
    assert.match(html, /2 Nov 2026 · Greenwood High/);
    assert.match(html, /Age confirmed by their school \/ club/);
    assert.match(html, /On SportnNote since 2026/);
  });
  test('escaped', () => {
    assert.match(html, /Meera &amp; Rao/);
    assert.match(html, /Red &lt;House&gt;/);
    assert.doesNotMatch(html, /Red <House>/);
  });
  test('no sports / honours → those sections are left out', () => {
    const empty = passportHtml({ name: 'A', code: 'ZZZZZ23456', appUrl: 'https://x', official: { matches: 0, record: '' }, sports: [], honours: [] });
    assert.doesNotMatch(empty, /Official record by sport|<h2>Honours/);
  });
});

describe('the server rules', () => {
  const dir = join(root, 'supabase', 'migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_career_passport'))!), 'utf8');
  test('only the player or their parent makes / resets the code; clients can’t write it', () => {
    assert.match(sql, /pl\.profile_id = auth\.uid\(\) or pl\.guardian_profile_id = auth\.uid\(\)/);
    assert.match(sql, /perform passport_owner_or_raise\(p_player\)/);
    assert.match(sql, /pl := passport_owner_or_raise\(p_player\)/);
    assert.match(sql, /if is_client_request\(\) then\s+new\.passport_code := case when tg_op = 'INSERT' then null else old\.passport_code end/);
    assert.match(sql, /revoke all on function passport_owner_or_raise\(uuid\) from public, anon, authenticated/);
    assert.doesNotMatch(sql, /grant execute on function (passport_code|reset_passport_code)\(uuid\) to anon/);
  });
  test('anyone with the code: minors by initials (the owner sees the full name); no opponents; official only', () => {
    assert.match(sql, /grant execute on function resolve_passport\(text\) to anon, authenticated/);
    assert.match(sql, /'name', case when mine then pl\.full_name else public_person_name\(pl\.id, pl\.full_name\) end/);
    const lines = sql.slice(sql.indexOf("'lines'"), sql.indexOf("'honours'"));
    assert.doesNotMatch(lines, /opponent/);
    assert.match(lines, /coalesce\(e\.tournament_id, m\.tournament_id\) is not null/);
    assert.match(sql, /c\.revoked_at is null and c\.kind <> 'participation'/);
  });
});

describe('the app', () => {
  test('public page pp/:code; profile + parent entry points', () => {
    const navSrc = read('src/navigation/RootNavigator.tsx');
    assert.match(navSrc, /Passport: 'pp\/:code\?'/);
    const pub = navSrc.slice(navSrc.indexOf('const publicScreens'), navSrc.indexOf('</>', navSrc.indexOf('const publicScreens')));
    assert.match(pub, /name="Passport"/);
    assert.match(read('src/components/ProfileView.tsx'), /ownProfile \? <CareerPassportCard playerId=\{player\.id\} \/> : null/);
    assert.match(read('src/screens/ManageChildScreen.tsx'), /nav\.navigate\('Passport', \{ playerId: child\.playerId \}\)/);
  });
  test('owner actions only for the owner; reset asks first', () => {
    const s = read('src/screens/PassportScreen.tsx');
    assert.match(s, /\{pp\.owner \? \(/);
    assert.match(s, /await askConfirm\(\{ title: 'Make a new link\?'/);
  });
});
