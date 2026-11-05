/**
 * MVP loop at scale (quality mandate step 6; founder 2026-10-31): 500 matches
 * of every sport and status, with hostile team and tournament names, some in
 * deleted tournaments, go through share_match() (the database) and the
 * Worker's live link page and refresh; plus 500 messy pasted team lists through
 * the quick tournament's parser. Every answer is checked against a plain
 * recomputation.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootDb, type TestDb } from './helpers/pgdb.mts';
import worker from '../worker/index.ts';
import { SPORTS } from '../worker/sports.ts';
import { parseEntrantList, matchCount, MAX_ENTRANTS, NAME_MAX } from '../src/core/quickTournament.ts';

let db: TestDb;
before(async () => { db = await bootDb(); });
let seed = 20261031;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const NASTY = ['<b>', '"', "'", '&', '</script>', '<img src=x onerror=alert(1)>', 'é', '🏆', '\\', '  '];
const name = (base: string) => (rnd() < 0.3 ? `${base} ${pick(NASTY)}` : base);

const shared = new Map<string, unknown>();
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (url: string) => {
    const id = new URL(String(url)).searchParams.get('p_id')!.replace(/^eq\./, '');
    return new Response(JSON.stringify(shared.get(id) ?? null), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; });
const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'k', ASSETS: { fetch: async () => new Response('asset') } };

test('500 matches through the database read and the live link page', { timeout: 600_000 }, async () => {
  const sports = Object.keys(SPORTS);
  const [gone] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name, deleted_at) values ('Gone Cup', 'Org', now()) returning id`);
  const [cup] = await db.sql<{ id: string }>(`insert into tournaments (name, host_name) values ($1, 'Org') returning id`, [name('Turf Cup')]);
  type Truth = { id: string; sport: string; status: string; deleted: boolean; home: string; away: string; summary: Record<string, string> | null; winner: string | null };
  const truth: Truth[] = [];
  for (let i = 0; i < 500; i++) {
    const sport = pick(sports);
    const status = pick(['live', 'live', 'completed', 'scheduled', 'cancelled', 'postponed']);
    const home = name(`Home ${i}`); const away = name(`Away ${i}`);
    const [h] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ($1, 'H', $2) returning id`, [home, sport]);
    const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ($1, 'A', $2) returning id`, [away, sport]);
    const summary = status === 'live' || status === 'completed' ? { h: String(Math.floor(rnd() * 30)), a: String(Math.floor(rnd() * 30)), s: name('Q2') } : null;
    const winner = status === 'completed' ? pick(['home', 'away', 'draw']) : null;
    const deleted = rnd() < 0.1;
    const [m] = await db.sql<{ id: string }>(
      `insert into matches (sport, status, home_team_id, away_team_id, tournament_id, summary, winner) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [sport, status, h.id, a.id, deleted ? gone.id : rnd() < 0.5 ? cup.id : null, summary ? JSON.stringify(summary) : null, winner]);
    truth.push({ id: m.id, sport, status, deleted, home, away, summary, winner });
  }

  for (const t of truth) {
    const [{ r }] = await db.asAnonWith<{ r: Record<string, any> | null }>({ 'x-share': `m:${t.id}` }, `select share_match($1) as r`, [t.id]);
    if (t.deleted) { assert.equal(r, null, 'deleted tournament hidden'); continue; }
    assert.ok(r, t.id);
    assert.deepEqual([r.sport, r.status, r.home.name, r.away.name, r.winner], [t.sport, t.status, t.home, t.away, t.winner]);
    assert.deepEqual(r.summary, t.summary);
    shared.set(t.id, r);
  }

  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const t of truth) {
    const res = await worker.fetch(new Request(`https://app.sportnnote.in/m/${t.id}`), env as never);
    const html = await res.text();
    if (t.deleted) { assert.equal(res.status, 404); continue; }
    assert.equal(res.status, 200);
    assert.ok(new TextEncoder().encode(html).length < 20_000, `${html.length} bytes`);
    const badge = t.status === 'completed' ? 'RESULT' : t.status === 'live' ? 'LIVE' : t.status === 'cancelled' ? 'CANCELLED' : t.status === 'postponed' ? 'POSTPONED' : 'UPCOMING';
    const title = t.summary ? `${SPORTS[t.sport].icon} ${badge} · ${t.home} ${t.summary.h}–${t.summary.a} ${t.away}` : `${SPORTS[t.sport].icon} ${badge} · ${t.home} vs ${t.away}`;
    assert.ok(html.includes(`<meta property="og:title" content="${esc(title)}">`), `title for ${t.status}: ${title}`);
    // a name with special characters only ever appears escaped
    // (a raw "&" is a prefix of its own "&amp;", so check the characters that can break out: < > " ')
    for (const nm of [t.home, t.away]) if (/[<>"']/.test(nm)) assert.ok(!html.includes(nm), `raw name leaked: ${nm}`);
    const json = await worker.fetch(new Request(`https://app.sportnnote.in/m/${t.id}.json`), env as never);
    assert.deepEqual(Object.keys(await json.json()).sort(), ['status', 'summary', 'winner']);
  }
});

test('500 messy pasted lists become the right names', () => {
  for (let i = 0; i < 500; i++) {
    const n = 1 + Math.floor(rnd() * 80);
    const names = Array.from({ length: n }, (_, k) => `${pick(['Lions', 'Tigers', 'FC', 'United', 'Rovers', 'Stars'])} ${i}-${k}`);
    const want: string[] = [];
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const [k, nm] of names.entries()) {
      const deco = pick(['', `${k + 1}. `, `${k + 1}) `, '- ', '• ', '   ']);
      lines.push(`${deco}${nm}${pick(['', '  ', ' '])}`);
      if (rnd() < 0.15) lines.push(pick(['', '   ', `${nm.toUpperCase()}`])); // blanks and repeats
      const key = nm.slice(0, NAME_MAX).toLowerCase();
      if (!seen.has(key) && want.length < MAX_ENTRANTS) { seen.add(key); want.push(nm.slice(0, NAME_MAX)); }
    }
    const got = parseEntrantList(lines.join('\n'));
    assert.deepEqual(got, want, `list ${i}`);
    assert.equal(matchCount('league', got.length), (got.length * (got.length - 1)) / 2);
    assert.equal(matchCount('knockout', got.length), Math.max(0, got.length - 1));
  }
});
