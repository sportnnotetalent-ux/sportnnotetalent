/** QR-verified certificates (migration 20261025090000_certificates). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  awardItems, certificateUrl, certificatesHtml, dedupeItems, formatCode, medalItems, participationItems, placementItems,
} from '../src/core/certificates.ts';
import { detectPlaces } from '../src/data/certificatePlaces.ts';

const rosters = new Map([['t1', ['a', 'b']], ['t2', ['c']], ['t3', ['d']]]);
const teamName = (id: string) => ({ t1: 'Red House', t2: 'Blue House', t3: 'Gold House' } as Record<string, string>)[id] ?? 'Team';

describe('codes and links', () => {
  test('printed in groups of four; the verify link is /c/CODE', () => {
    assert.equal(formatCode('abcde23456'), 'ABCD-E234-56');
    assert.equal(certificateUrl('ABCD-E234-56', 'https://app.sportnnote.in/'), 'https://app.sportnnote.in/c/ABCDE23456');
  });
});

describe('who gets what', () => {
  test('every squad member of the champion / runner-up / third team', () => {
    const items = placementItems({ tournamentName: 'Cup 2026', sport: 'football', sportName: 'Football', eventDate: '2026-11-02', rosters, teamName, champion: 't1', runnerUp: 't2', third: 't3' });
    assert.deepEqual(items.map((i) => [i.playerId, i.kind, i.title]), [
      ['a', 'champion', 'Champions'], ['b', 'champion', 'Champions'], ['c', 'runner_up', 'Runners-up'], ['d', 'third', 'Third place'],
    ]);
    assert.equal(items[0].detail, 'Cup 2026 · Football');
    assert.equal(items[0].teamName, 'Red House');
  });
  test('awards, medals (every relay member), participation (each player once)', () => {
    const aw = awardItems([{ playerId: 'a', label: 'Player of the Tournament', sport: 'football', detail: '7 goals' }, { playerId: '', label: 'x', sport: 'football' }], { tournamentName: 'Cup', sportName: () => 'Football' });
    assert.equal(aw.length, 1);
    assert.equal(aw[0].detail, 'Cup · Football · 7 goals');
    const md = medalItems([{ playerIds: ['a', 'b', 'c', 'd'], medal: 'gold', event: '4×100 m U14 Boys', sport: 'athletics', teamName: 'Red House' }], { tournamentName: 'Sports Day' });
    assert.equal(md.length, 4);
    assert.equal(md[0].title, 'Gold — 4×100 m U14 Boys');
    const pp = participationItems({ tournamentName: 'Cup', sport: 'football', sportName: 'Football', rosters: new Map([['t1', ['a', 'b']], ['t2', ['b', 'c']]]), teamName, teamIds: ['t1', 't2'] });
    assert.deepEqual(pp.map((i) => i.playerId), ['a', 'b', 'c']);
    assert.equal(dedupeItems([...aw, ...aw]).length, 1);
  });
  test('places from the knockout: final winner, loser, third-place winner', () => {
    const team = (id: string) => ({ id, name: id, shortName: id, sport: 'football' }) as never;
    const m = (id: string, stage: string, h: string, a: string, winner: 'home' | 'away') =>
      ({ id, stage, status: 'completed', winner, homeTeam: team(h), awayTeam: team(a), sport: 'football', startsAt: '2026-11-01T10:00:00Z' }) as never;
    const p = detectPlaces([m('sf1', 'sf', 't1', 't3', 'home'), m('sf2', 'sf', 't2', 't4', 'home'), m('f', 'final', 't1', 't2', 'away'), m('3p', 'third', 't3', 't4', 'home')]);
    assert.deepEqual(p, { champion: 't2', runnerUp: 't1', third: 't3' });
    assert.deepEqual(detectPlaces([]), { champion: undefined, runnerUp: undefined, third: undefined });
  });
});

describe('the printable sheet', () => {
  const certs = [
    { code: 'ABCDE23456', playerId: 'a', kind: 'champion' as const, title: 'Champions', detail: 'Cup · Football', teamName: 'Red <House>', eventDate: '2026-11-02', issuedAt: '2026-11-03T10:00:00Z', holderName: 'Meera & Rao', issuer: 'Greenwood High' },
    { code: 'ZZZZZ23456', playerId: 'b', kind: 'participation' as const, title: 'Participation', detail: 'Cup · Football', issuedAt: '2026-11-03T10:00:00Z', holderName: 'Asha', issuer: 'Greenwood High', revokedAt: '2026-11-04T00:00:00Z' },
  ];
  const html = certificatesHtml(certs, { appUrl: 'https://app.sportnnote.in' });
  test('one landscape A4 page each, with a QR, the code and the verify link', () => {
    assert.match(html, /@page \{ size: A4 landscape/);
    assert.equal((html.match(/<section class="cert">/g) ?? []).length, 2);
    assert.equal((html.match(/<svg /g) ?? []).length, 2);
    assert.match(html, /ABCD-E234-56/);
    assert.match(html, /app\.sportnnote\.in\/c\/ABCDE23456/);
    assert.match(html, /Certificate of Participation/);
    assert.match(html, /REVOKED/);
  });
  test('names and text are escaped', () => {
    assert.match(html, /Meera &amp; Rao/);
    assert.match(html, /Red &lt;House&gt;/);
    assert.doesNotMatch(html, /Red <House>/);
  });
});

describe('the server rules', () => {
  const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_certificates'))!), 'utf8');
  test('no names stored; only organisers issue; anyone verifies; minors as initials', () => {
    assert.doesNotMatch(sql.slice(sql.indexOf('create table if not exists certificates'), sql.indexOf('create unique index')), /full_name|player_name|holder/);
    assert.match(sql, /if not can_manage_tournament\(p_tournament\) then/);
    assert.match(sql, /grant execute on function verify_certificate\(text\) to anon, authenticated/);
    assert.match(sql, /'holder', public_person_name\(c\.player_id, pl\.full_name\)/);
    assert.match(sql, /revoke all on certificates from anon, authenticated/);
  });
});
