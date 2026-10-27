/**
 * Security Wave 1 — the edge-function and client fixes (W1-2 client part, W1-5,
 * W1-6, W1-8, W1-9, W1-10). Database fixes: tests/db-wave1.test.mts.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInviteLink } from '../supabase/functions/_shared/inviteLinks.ts';
import { safeWebUrl } from '../src/core/safeUrl.ts';
import { androidIntentUrl } from '../src/core/inviteText.ts';
import { bootDb } from './helpers/pgdb.mts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ID = '3f2b8c1e-5d4a-4e7b-9c1d-2a6f8e0b7c45';
const PREFIXES = ['https://x.supabase.co/functions/v1/', 'sportnnote://', 'https://app.sportnnote.in/', 'https://sportnnote.in/'];

describe('W1-6 (EF-04) invite emails carry only our invite links', () => {
  test('the invite link shapes the app sends', () => {
    for (const ok of [`https://app.sportnnote.in/i/${ID}`, `https://app.sportnnote.in/i/${ID}?notme=1`, `https://x.supabase.co/functions/v1/join?p=${ID}`, `sportnnote://i/${ID}`]) {
      assert.ok(isInviteLink(ok, PREFIXES), ok);
    }
  });
  test('anything else under our hosts is refused (redirect parameters, other paths, look-alikes)', () => {
    for (const bad of [
      `https://app.sportnnote.in/i/${ID}?to=https://evil.example`, 'https://app.sportnnote.in/redirect?to=https://evil.example',
      `https://app.sportnnote.in/i/${ID}/../../x`, 'https://sportnnote.in.evil.example/i/x', `https://app.sportnnote.in/i/${ID} `,
      `https://app.sportnnote.in/i/${ID}#@evil.example`, 'javascript:alert(1)', '', `https://app.sportnnote.in/t/${ID}`,
    ]) assert.equal(isInviteLink(bad, PREFIXES), false, bad);
  });
  test('send-invite uses it', () => {
    assert.match(read('supabase/functions/send-invite/index.ts'), /isInviteLink\(link, LINK_PREFIXES\)/);
  });
});

describe('W1-5 (EF-05) one cap per parent address, across every function that emails a parent', () => {
  test('each sender checks the destination cap before it sends', () => {
    for (const f of ['guardian-consent', 'guardian-link', 'message-notify', 'school-parent-request']) {
      const src = read(`supabase/functions/${f}/index.ts`);
      const at = src.indexOf('rateLimitTo(');
      assert.ok(at > 0, `${f} checks the address cap`);
      assert.ok(at < src.indexOf('await sendEmail('), `${f}: before sending`);
    }
    assert.match(read('supabase/functions/_shared/guard.ts'), /export async function rateLimitTo\(email: string/);
  });
});

describe('W1-2 (client) a number someone else\'s profile already has never breaks sign-up', () => {
  test('the new player is created without the number instead of failing', () => {
    assert.match(read('src/data/repos.ts'), /uq_players_phone[\s\S]{0,400}phone: null/);
  });
});

describe('W1-8 (CL-08) the web app never stores signed-in data on the device', () => {
  test('only logged-out (public) reads are cached, and only they are served offline', () => {
    const sw = read('public/sw.js');
    assert.match(sw, /const isPublicRead = /);
    assert.match(sw, /if \(!isPublicRead\(req\)\) return;/);
  });
});

describe('W1-9 (CL-13) the developer Results lab isn\'t in the live app', () => {
  test('registered only in the demo or a development build', () => {
    assert.match(read('src/navigation/RootNavigator.tsx'), /\{SHOW_DEV_SCREENS \? \(\s*<Stack\.Screen\s+name="ResultsLab"/);
    assert.match(read('src/navigation/RootNavigator.tsx'), /const SHOW_DEV_SCREENS = !isSupabaseConfigured \|\| __DEV__;/);
  });
});

describe('W1-10 (CL-11 / CL-12) links from other people\'s data open only as web pages', () => {
  test('https (a bare "youtu.be/x" gets it); never intent:, upi:, javascript:, data: or credentials', () => {
    assert.equal(safeWebUrl('youtu.be/abc'), 'https://youtu.be/abc');
    assert.equal(safeWebUrl('https://www.youtube.com/live/xyz?si=1'), 'https://www.youtube.com/live/xyz?si=1');
    assert.equal(safeWebUrl('http://twitch.tv/school'), 'https://twitch.tv/school');
    for (const bad of ['upi://pay?pa=a@upi&am=500', 'intent://x#Intent;end', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd',
      'https://user:pass@evil.example/', 'https://localhost', '', '   ', `https://x.com/${'a'.repeat(600)}`]) {
      assert.equal(safeWebUrl(bad), null, bad);
    }
  });
  test('the stream link is checked where it\'s saved and where it\'s opened', () => {
    assert.match(read('src/components/LiveStream.tsx'), /const safe = safeWebUrl\(raw\);/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /saveStream\(safeWebUrl\(streamInput\)\)/);
    assert.match(read('src/screens/ScheduleMatchScreen.tsx'), /streamUrl: safeWebUrl\(stream\) \?\? undefined,/);
  });
  test('"Open in the app" only builds an app link from a clean path', () => {
    assert.match(androidIntentUrl('join-club/JOIN-ABC12'), /^intent:\/\/join-club\/JOIN-ABC12#Intent;scheme=/);
    const hostile = 'join-club/X#Intent;scheme=https;package=evil.app;S.browser_fallback_url=https%3A%2F%2Fevil.example;end';
    assert.ok(!androidIntentUrl(hostile).startsWith('intent://'), 'a crafted token never becomes an intent');
  });
  test('the database cleans stream and map links from any app version', async () => {
    const db = await bootDb({ strict: true });
    const u = await db.signUp({ name: 'Scorer' });
    const [p] = await db.as<{ id: string }>(u, `insert into players (full_name, profile_id) values ('Scorer', $1) returning id`, [u]);
    const [m] = await db.as<{ id: string; stream_url: string | null; venue_maps_url: string | null }>(u,
      `insert into matches (sport, host_ids, stream_url, venue_maps_url) values ('football', $1, 'upi://pay?pa=a@upi', 'youtu.be/x') returning id, stream_url, venue_maps_url`, [[p.id]]);
    assert.equal(m.stream_url, null, 'a payment link is dropped');
    assert.equal(m.venue_maps_url, 'https://youtu.be/x', 'a bare link gets https');
    const [m2] = await db.as<{ stream_url: string | null }>(u, `update matches set stream_url = 'https://youtube.com/live/abc' where id = $1 returning stream_url`, [m.id]);
    assert.equal(m2.stream_url, 'https://youtube.com/live/abc');
  });
});
