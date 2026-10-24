/** School hall of fame (migration 20261025130000_hall_of_fame). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  certEntries, entryMeta, filterBySport, hallCounts, hallEntries, hallHtml, hallSports, hallUrl, hallYears, honourIcon, peopleLine,
  type HallCert, type HallManual,
} from '../src/core/hallOfFame.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const certs: HallCert[] = [
  // a team title: every squad member's certificate → one honour
  { kind: 'champion', title: 'Champions', detail: 'Inter-school Cup · Football', sport: 'football', teamName: 'Greenwood U14', date: '2026-11-02', tournamentId: 't1', tournament: 'Inter-school Cup', playerId: 'a' },
  { kind: 'champion', title: 'Champions', detail: 'Inter-school Cup · Football', sport: 'football', teamName: 'Greenwood U14', date: '2026-11-02', tournamentId: 't1', tournament: 'Inter-school Cup', playerId: 'b' },
  // the school's own sports day
  { kind: 'medal', title: 'Gold — 100 m U14 Boys', detail: 'Sports Day · Athletics', sport: 'athletics', date: '2026-12-01', tournamentId: 't2', tournament: 'Sports Day', home: true, playerId: 'c' },
  { kind: 'award', title: 'Player of the Tournament', detail: 'Inter-school Cup · Football', sport: 'football', date: '2026-11-02', tournamentId: 't1', playerId: 'a' },
  { kind: 'runner_up', title: 'Runners-up', detail: 'Zonal Cup · Basketball', sport: 'basketball', date: '2025-08-10', tournamentId: 't3', playerId: 'd' },
];
const manual: HallManual[] = [
  { id: 'h1', year: 2019, kind: 'champion', title: 'District Football Champions', sport: 'football', level: 'district', teamLabel: 'U17 Boys', playerIds: [], note: 'Won 2–1 in the final' },
  { id: 'h2', year: 2026, kind: 'third', title: 'State Chess — Third', sport: 'chess', level: 'state', playerIds: ['e'] },
];

describe('honours', () => {
  const all = hallEntries(certs, manual);
  test('a team title is one honour with all its players; relay / tie medals likewise', () => {
    const e = certEntries(certs);
    assert.equal(e.length, 4);
    assert.deepEqual(e.find((x) => x.kind === 'champion')!.playerIds, ['a', 'b']);
    assert.equal(e.find((x) => x.kind === 'champion')!.event, 'Inter-school Cup · Football');
  });
  test('newest year first; titles, podiums, medals, awards in a year; school entries tagged', () => {
    assert.deepEqual(hallYears(all).map((y) => y.year), [2026, 2025, 2019]);
    assert.deepEqual(hallYears(all)[0].entries.map((x) => x.kind), ['champion', 'third', 'medal', 'award']);
    assert.equal(all.find((x) => x.id === 'h1')!.source, 'school');
    assert.equal(all.find((x) => x.kind === 'medal')!.home, true);
  });
  test('counts and the sport filter', () => {
    assert.deepEqual(hallCounts(all), { titles: 2, podiums: 2, medals: 1, awards: 1 });
    assert.deepEqual(hallSports(all), ['football', 'athletics', 'basketball', 'chess']);
    assert.equal(filterBySport(all, 'football').length, 3);
    assert.equal(filterBySport(all, null).length, all.length);
  });
  test('icons, people line, meta', () => {
    assert.equal(honourIcon('champion'), '🏆');
    assert.equal(honourIcon('medal', 'Silver — Long jump'), '🥈');
    assert.equal(honourIcon('medal', 'Gold — 100 m'), '🥇');
    const names = new Map([['a', 'A. K.'], ['b', 'Riya Sharma']]);
    assert.equal(peopleLine(['a', 'b', 'zz'], (id) => names.get(id)), 'A. K., Riya Sharma');
    assert.equal(peopleLine(['a', 'b', 'a', 'b'], (id) => names.get(id), 2), 'A. K., Riya Sharma +2');
    const name = (s: string) => ({ football: 'Football' } as Record<string, string>)[s] ?? s;
    assert.equal(entryMeta(all.find((x) => x.id === 'h1')!, name), 'Football · U17 Boys · District level');
    assert.equal(entryMeta(all.find((x) => x.kind === 'medal')!, name), 'Sports Day · Athletics · School event');
  });
  test('the link', () => {
    assert.equal(hallUrl('org-1', 'https://app.sportnnote.in/'), 'https://app.sportnnote.in/h/org-1');
  });
});

describe('the printable honours board', () => {
  const html = hallHtml({
    orgName: 'Greenwood <High>', orgId: 'org-1', appUrl: 'https://app.sportnnote.in', verified: true, city: 'Bengaluru',
    entries: hallEntries(certs, manual), hostedCount: 3, nameOf: (id) => ({ a: 'A. K.', b: 'Riya & Co' } as Record<string, string>)[id], sportName: (s) => s,
  });
  test('A4 portrait, QR to the live page, years, tags', () => {
    assert.match(html, /@page \{ size: A4 portrait/);
    assert.equal((html.match(/<svg /g) ?? []).length, 1);
    assert.match(html, /app\.sportnnote\.in\/h\/org-1/);
    assert.match(html, /<h2>2026<\/h2>[\s\S]*<h2>2025<\/h2>[\s\S]*<h2>2019<\/h2>/);
    assert.match(html, /✓ Verified on SportnNote/);
    assert.match(html, /Added by the school/);
    assert.match(html, /<div class="v">3<\/div><div class="muted">Events hosted/);
  });
  test('escaped', () => {
    assert.match(html, /Greenwood &lt;High&gt;/);
    assert.match(html, /Riya &amp; Co/);
    assert.doesNotMatch(html, /Greenwood <High>/);
  });
});

describe('the server rules', () => {
  const dir = join(root, 'supabase', 'migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_hall_of_fame'))!), 'utf8');
  test('private until published; members / admins / support always; people as ids', () => {
    assert.match(sql, /add column if not exists hall_public boolean not null default false/);
    assert.match(sql, /visible := o\.hall_public or can_edit or member or \(auth\.uid\(\) is not null and is_support\(\)\)/);
    assert.match(sql, /if not visible then return base; end if;/);
    assert.match(sql, /grant execute on function org_hall_of_fame\(uuid\) to anon, authenticated/);
    const fn = sql.slice(sql.indexOf('create or replace function org_hall_of_fame'));
    assert.doesNotMatch(fn, /full_name/);
  });
  test('verified = certificates earned while a member; revoked / participation / deleted events left out', () => {
    assert.match(sql, /c\.revoked_at is null and c\.kind <> 'participation'/);
    assert.match(sql, /m\.since is null or m\.since <= coalesce\(c\.event_date, c\.issued_at::date\)/);
    assert.match(sql, /m\.until is null or m\.until >= coalesce\(c\.event_date, c\.issued_at::date\)/);
    assert.match(sql, /t\.deleted_at is null/);
  });
  test('only Owners / Admins write; table closed to clients; linked students must be members; typed minor names masked', () => {
    assert.match(sql, /has_org_role\(p_org, array\['Owner', 'Admin'\]\)/);
    assert.match(sql, /revoke all on org_honours from anon, authenticated/);
    for (const f of ['set_hall_public', 'save_org_honour', 'delete_org_honour']) {
      assert.doesNotMatch(sql, new RegExp(`grant execute on function ${f}\\([^)]*\\) to anon`));
    }
    assert.match(sql, /where x is not null and x = any\(members\)/);
    assert.match(sql, /t := mask_minor_names\(nullif\(trim\(p->>'title'\), ''\), members\)/);
  });
});

describe('the app', () => {
  test('public page h/:orgId; entry on the school page', () => {
    const navSrc = read('src/navigation/RootNavigator.tsx');
    assert.match(navSrc, /HallOfFame: 'h\/:orgId'/);
    const pub = navSrc.slice(navSrc.indexOf('const publicScreens'), navSrc.indexOf('</>', navSrc.indexOf('const publicScreens')));
    assert.match(pub, /name="HallOfFame"/);
    assert.match(read('src/screens/OrganizationScreen.tsx'), /nav\.navigate\('HallOfFame', \{ orgId: org\.id \}\)/);
  });
  test('publishing asks first; admin controls only for editors; names resolved per viewer', () => {
    const s = read('src/screens/HallOfFameScreen.tsx');
    assert.match(s, /askConfirm\(\{ title: 'Publish the hall of fame\?'/);
    assert.match(s, /\{hall\.canEdit \? \(/);
    assert.match(read('src/data/hallOfFame.ts'), /names: await getPlayerNamesById\(entries\.flatMap\(\(e\) => e\.playerIds\)\)/);
  });
});
