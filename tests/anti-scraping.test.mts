/** Anti-scraping hardening (migration 20261025150000_anti_scraping;
 *  docs/security/anti-scraping.md). The gate runs on EVERY API request, so its
 *  safety properties are pinned here. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_anti_scraping'))!), 'utf8');
const gate = sql.slice(sql.indexOf('create or replace function api_gate()'), sql.indexOf('create or replace function api_whoami()'));

describe('the API gate', () => {
  test('fails open: every check sits inside an exception block that clears the hit', () => {
    assert.match(gate, /begin\s+begin\s+claims :=/);
    assert.match(gate, /exception when others then\s+hit := null;/);
    // the refusal is raised only after (outside) that block
    assert.ok(gate.indexOf("raise sqlstate 'PT403'") > gate.indexOf('exception when others'));
  });
  test('never blocks service_role, the API root, or when switched off', () => {
    assert.match(gate, /if claims->>'role' = 'service_role' then return; end if;/);
    assert.match(gate, /current_setting\('request\.path', true\), '\/'\) in \('', '\/'\) then return;/);
    assert.match(gate, /coalesce\(\(select enabled from api_gate_settings where id\), false\) then return;/);
  });
  test('blocks by IP, account and User-Agent, with expiry; 403; reason not leaked', () => {
    assert.match(gate, /b\.kind = 'ip' and b\.value = ip/);
    assert.match(gate, /b\.kind = 'user' and b\.value = uid/);
    assert.match(gate, /b\.kind = 'agent' and ua ~\* b\.value/);
    assert.match(gate, /b\.expires_at is null or b\.expires_at > now\(\)/);
    assert.match(gate, /select b\.kind into hit/);
  });
  test('every API role can run it (a missing grant would break every request)', () => {
    assert.match(sql, /grant execute on function api_gate\(\) to anon, authenticated, service_role;/);
  });
  test('switched on as the pre-request, with the undo documented next to it', () => {
    assert.match(sql, /alter role authenticator set pgrst\.db_pre_request = 'public\.api_gate';\s+notify pgrst, 'reload config';\s*$/);
    assert.match(sql, /alter role authenticator reset pgrst\.db_pre_request;/);
  });
  test('the blocklist and settings are closed to clients; a bad regex is refused on insert', () => {
    assert.match(sql, /revoke all on api_blocklist from anon, authenticated;/);
    assert.match(sql, /revoke all on api_gate_settings from anon, authenticated;/);
    assert.match(sql, /perform '' ~\* new\.value;/);
  });
});

describe('the seeded User-Agent rules', () => {
  const rules = [...sql.matchAll(/\('agent', '([^']+)', 'scraping tool'\)/g)].map((m) => new RegExp(m[1], 'i'));
  const blocked = ['python-requests/2.31.0', 'Python-urllib/3.11', 'python-httpx/0.27.0', 'Python/3.11 aiohttp/3.9.1',
    'Scrapy/2.11.0 (+https://scrapy.org)', 'curl/8.4.0', 'Wget/1.21.4', 'libwww-perl/6.72'];
  const allowed = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
    'okhttp/4.12.0', 'SportnNote/1 CFNetwork/1568.100.1 Darwin/24.0.0', 'Deno/1.45.2', 'node', 'undici',
    'Go-http-client/2.0', 'Java/17.0.2', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ];
  test('they catch the common scraping tools', () => {
    assert.ok(rules.length >= 8);
    for (const ua of blocked) assert.ok(rules.some((r) => r.test(ua)), `not blocked: ${ua}`);
  });
  test('they never match browsers, the app, edge functions, Node, Go, Java or Google', () => {
    for (const ua of allowed) assert.ok(!rules.some((r) => r.test(ua)), `wrongly blocked: ${ua}`);
  });
});

describe('api_whoami', () => {
  test('shows only the caller their own IP / agent / role; anyone may call it', () => {
    const fn = sql.slice(sql.indexOf('create or replace function api_whoami()'), sql.indexOf('-- ---------- 3.'));
    assert.match(fn, /'ip', /);
    assert.match(fn, /'userAgent', hdr->>'user-agent'/);
    assert.doesNotMatch(fn, /api_blocklist/);
    assert.match(sql, /grant execute on function api_whoami\(\) to anon, authenticated;/);
  });
});

describe('trap records', () => {
  test('three adult players and one team, idempotent, registered privately', () => {
    const players = [...sql.matchAll(/\('([0-9a-f-]{36})', '([^']+)', \d+, array\['football'\], '(\d{4})-\d\d-\d\d', '(Male|Female)', false,/g)];
    assert.equal(players.length, 3);
    for (const p of players) assert.ok(2026 - Number(p[3]) >= 18, `${p[2]} must be an adult`);
    assert.match(sql, /'Kondapur Kestrels FC'/);
    const ins = (from: string, to: string) => sql.slice(sql.indexOf(from), sql.indexOf(to));
    assert.match(ins('insert into players', 'insert into teams'), /on conflict \(id\) do nothing;\s*$/);
    assert.match(ins('insert into teams', 'insert into canary_records'), /on conflict \(id\) do nothing;\s*$/);
    for (const p of players) assert.match(sql, new RegExp(`\\('players', '${p[1]}'`));
    assert.match(sql, /revoke all on canary_records from anon, authenticated;/);
  });
  test('no contact details on them', () => {
    const ins = sql.slice(sql.indexOf('insert into players'), sql.indexOf('insert into teams'));
    assert.doesNotMatch(ins, /phone|email|guardian|profile_id/);
  });
});

describe('weekly API traffic', () => {
  test('service_role only; a dry run does not save the snapshot', () => {
    assert.match(sql, /revoke all on function api_traffic_report\(boolean\) from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function api_traffic_report\(boolean\) to service_role;/);
    assert.match(sql, /if p_save then\s+insert into api_traffic_snapshots/);
    const fn = readFileSync(join(root, 'supabase', 'functions', 'weekly-report', 'index.ts'), 'utf8');
    assert.match(fn, /admin\.rpc\('api_traffic_report', \{ p_save: save \}\)/);
    assert.match(fn, /await build\(!body\.dry\)/);
    assert.match(fn, /\.\.\.traffic,/);
  });
});
