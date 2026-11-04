/** 600 people open links and sign up (docs/security/breaks/signup-source.md):
 *  on-device rules for every journey, then the server for every account. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceFromUrl, landingToKeep, landingToSend, type Landing } from '../src/core/signupSource.ts';
import { bootDb } from './helpers/pgdb.mts';

let seed = 4242;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const DAY = 86_400_000;
const SECRET = 'TOKENSECRET9';
const LINKS = [
  (id: string) => `https://app.sportnnote.in/m/${id}?sport=pool`, (id: string) => `https://app.sportnnote.in/t/${id}`,
  (id: string) => `https://app.sportnnote.in/get/${id}`, (id: string) => `sportnnote://i/${id}`,
  () => `https://app.sportnnote.in/join/${SECRET}`, () => `https://app.sportnnote.in/join-tournament/${SECRET}`,
  () => `https://app.sportnnote.in/guardian-consent?c=${SECRET}`, (id: string) => `https://app.sportnnote.in/p/${id}`,
  () => 'https://app.sportnnote.in/', () => 'https://app.sportnnote.in/Tabs/Discover',
];

test('600 device journeys: first fresh link wins, secrets never kept, stale links never sent', () => {
  const sent: (Landing | null)[] = [];
  for (let u = 0; u < 600; u++) {
    let saved: unknown = rnd(10) === 0 ? 'corrupt{' : null;
    let now = 1_800_000_000_000 + rnd(1000) * DAY;
    let first: { at: number; kind: string } | null = null;
    for (let k = rnd(5); k >= 0; k--) {
      now += rnd(20) * DAY;
      const url = LINKS[rnd(LINKS.length)](`id${rnd(50)}`);
      const keep = landingToKeep(saved, sourceFromUrl(url), now);
      if (keep) { saved = keep; first = { at: keep.at, kind: keep.kind }; }
      assert.doesNotMatch(JSON.stringify(saved ?? ''), new RegExp(SECRET), 'SS1');
    }
    now += rnd(40) * DAY; // sign-up day
    const out = landingToSend(saved, now);
    if (out) {
      assert.ok(now - out.at <= 30 * DAY, 'SS8: fresh only');
      assert.equal(out.kind, first?.kind);
    } else if (first) assert.ok(now - first.at > 30 * DAY);
    sent.push(out);
  }
  assert.ok(sent.filter(Boolean).length > 150, 'plenty of journeys end in a source');
});

test('600 sign-ups on the server: one row each, refs only when real, counts add up', async () => {
  const db = await bootDb({ strict: true });
  const support = await db.signUp({ name: 'Sam Support' });
  await db.sql(`update profiles set role = 'support' where id = $1`, [support]);
  const [a] = await db.sql<{ id: string }>(`insert into teams (name, short_name, sport) values ('A', 'A', 'pool') returning id`);
  const [game] = await db.sql<{ id: string }>(`insert into matches (sport, home_team_id, away_team_id, status) values ('pool', $1, $1, 'scheduled') returning id`, [a.id]);
  const [pl] = await db.sql<{ id: string }>(`insert into players (full_name) values ('Inviter') returning id`);
  const kinds = ['game', 'invite', 'team', 'tournament', 'parent', 'direct'];
  const want: Record<string, number> = {};
  let withRef = 0;
  for (let u = 0; u < 600; u++) {
    const minor = rnd(6) === 0;
    const uid = await db.signUp({ name: `User ${u}`, dob: minor ? '2012-06-06' : '1990-06-06' });
    const kind = kinds[rnd(kinds.length)];
    want[kind] = (want[kind] ?? 0) + 1;
    if (kind === 'direct') continue;
    const ref = kind === 'game' ? game.id : kind === 'invite' ? pl.id : kind === 'tournament' ? 'made-up-id' : null;
    const tries = 1 + rnd(3);
    for (let i = 0; i < tries; i++) {
      const r = (await db.as<{ r: string }>(uid, `select record_signup_source($1, $2) as r`, [kind, ref]))[0].r;
      assert.equal(r, i === 0 ? 'saved' : 'already', 'SS3');
    }
    if (!minor && (kind === 'game' || kind === 'invite')) withRef++;
  }
  const [{ n, refs }] = await db.sql<{ n: number; refs: number }>(`select count(*)::int as n, count(ref)::int as refs from signup_sources`);
  assert.equal(n, 600 - want.direct);
  assert.equal(refs, withRef, 'SS5/SS7: refs only real ones, never minors');
  const d = (await db.as<{ d: { weeks: { from_links: number }[]; by_source: { kind: string; signups: number }[] } }>(support, `select usage_dashboard(1) as d`))[0].d;
  assert.equal(Number(d.weeks[0].from_links), 600 - want.direct);
  const by = Object.fromEntries(d.by_source.map((x) => [x.kind, Number(x.signups)]));
  for (const k of kinds.filter((x) => x !== 'direct')) assert.equal(by[k], want[k], k);
  assert.equal(by.direct, want.direct + 1, 'plus the support account');
});
