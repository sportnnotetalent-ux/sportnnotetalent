/** Support console (2026-10-27, migration 20261027170000_support_console):
 *  every queue on one screen for SportnNote support — claims so two people don't
 *  check the same request (enforced by the server, not just shown), filters,
 *  keyboard shortcuts, and this week's reviews per person. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAIM_MS, NO_FILTER, OVER_DAY_MS, claimStateOf, claimedAgo, filterQueue, moveSelection, orgGroup, shortcutFor, type SupportClaim,
} from '../src/core/supportConsole.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_support_console'))!), 'utf8');

const NOW = Date.parse('2026-10-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const claims: SupportClaim[] = [
  { kind: 'org', ref: 'o1', by: 'me', byName: 'Rudy', at: ago(10 * 60_000) },
  { kind: 'org', ref: 'o2', by: 'priya', byName: 'Priya', at: ago(65 * 60_000) },
  { kind: 'org', ref: 'o3', by: 'priya', byName: 'Priya', at: ago(CLAIM_MS + 1) },
  { kind: 'age', ref: 'o1', by: 'priya', byName: 'Priya', at: ago(60_000) },
];

describe('claims', () => {
  test('mine, someone else\'s, stale (over 2 hours) or none — per queue', () => {
    assert.deepEqual(claimStateOf(claims, 'org', 'o1', 'me', NOW), { state: 'mine', at: claims[0].at });
    assert.deepEqual(claimStateOf(claims, 'org', 'o2', 'me', NOW), { state: 'theirs', byName: 'Priya', at: claims[1].at });
    assert.deepEqual(claimStateOf(claims, 'org', 'o3', 'me', NOW), { state: 'none' });
    assert.deepEqual(claimStateOf(claims, 'org', 'o9', 'me', NOW), { state: 'none' });
    assert.equal(claimStateOf(claims, 'age', 'o1', 'me', NOW).state, 'theirs', 'an org claim is not an age-proof claim');
  });
  test('how long it has been held', () => {
    assert.equal(claimedAgo(ago(20_000), NOW), 'just now');
    assert.equal(claimedAgo(ago(12 * 60_000), NOW), '12 min ago');
    assert.equal(claimedAgo(ago(65 * 60_000), NOW), '1 h 5 min ago');
    assert.equal(claimedAgo(ago(120 * 60_000), NOW), '2 h ago');
  });
});

describe('the queue', () => {
  type O = { id: string; name: string; type?: string; at?: number; city?: string };
  const items: O[] = [
    { id: 'o1', name: 'Greenwood High', type: 'School', at: NOW - 3 * 3_600_000, city: 'Bengaluru' },
    { id: 'o2', name: 'Lakeside FC', type: 'Sports club', at: NOW - 2 * OVER_DAY_MS },
    { id: 'o3', name: 'Acme Corp', type: 'Company', at: NOW - OVER_DAY_MS - 1 },
    { id: 'o4', name: 'New ITI', type: 'ITI' },
  ];
  const key = (o: O) => ({ ref: o.id, name: o.name, type: o.type, waitingSince: o.at, text: o.city });
  const ids = (f: Partial<typeof NO_FILTER>) => filterQueue(items, key, { ...NO_FILTER, ...f }, claims, 'org', 'me', NOW).map((o) => o.id);
  test('oldest first, an item with no time last', () => {
    assert.deepEqual(ids({}), ['o2', 'o3', 'o1', 'o4']);
  });
  test('over a day; kind of organisation; claimed / mine; search name or city', () => {
    assert.deepEqual(ids({ waiting: 'day' }), ['o2', 'o3']);
    assert.deepEqual(ids({ group: 'education' }), ['o1', 'o4']);
    assert.deepEqual(ids({ group: 'sports' }), ['o2']);
    assert.deepEqual(ids({ group: 'other' }), ['o3']);
    assert.deepEqual(ids({ claimed: 'unclaimed' }), ['o3', 'o4'], 'o3\'s claim is stale');
    assert.deepEqual(ids({ claimed: 'mine' }), ['o1']);
    assert.deepEqual(ids({ q: 'bengal' }), ['o1']);
  });
  test('kinds of organisation', () => {
    assert.equal(orgGroup('University'), 'education');
    assert.equal(orgGroup('Sports academy'), 'sports');
    assert.equal(orgGroup('NGO'), 'other');
    assert.equal(orgGroup(undefined), 'other');
  });
});

describe('keyboard on a desktop browser', () => {
  test('J / K / C / Esc, never while typing or with a modifier; arrows keep scrolling the page', () => {
    const plain = { typing: false, modified: false };
    assert.equal(shortcutFor('j', plain), 'next');
    assert.equal(shortcutFor('K', plain), 'prev');
    assert.equal(shortcutFor('c', plain), 'claim');
    assert.equal(shortcutFor('Escape', plain), 'close');
    assert.equal(shortcutFor('ArrowDown', plain), null);
    assert.equal(shortcutFor('j', { typing: true, modified: false }), null);
    assert.equal(shortcutFor('c', { typing: false, modified: true }), null);
  });
  test('moving stays inside the list', () => {
    assert.equal(moveSelection(-1, 3, 'next'), 0);
    assert.equal(moveSelection(0, 3, 'next'), 1);
    assert.equal(moveSelection(2, 3, 'next'), 2);
    assert.equal(moveSelection(0, 3, 'prev'), 0);
    assert.equal(moveSelection(0, 0, 'next'), -1);
  });
});

describe('the server enforces claims', () => {
  test('claims table closed to the app; claim / release through functions for the right people', () => {
    assert.match(sql, /create table if not exists support_claims/);
    assert.match(sql, /alter table support_claims enable row level security;/);
    assert.doesNotMatch(sql, /create policy[^;]*support_claims/);
    assert.match(sql, /case p_kind when 'org' then is_support\(\) when 'age' then is_verification_reviewer\(\) else false end/);
    assert.match(sql, /c\.claimed_by <> auth\.uid\(\) and c\.claimed_at > now\(\) - interval '2 hours' and not coalesce\(p_take_over, false\)/);
    assert.match(sql, /grant execute on function claim_support_item\(text, uuid, boolean\) to authenticated;/);
  });
  test('an organisation decision is refused while a colleague\'s claim is fresh, or just after their decision', () => {
    assert.match(sql, /create trigger guard_org_decision_claim before update of reviewed_at on org_verifications/);
    assert.match(sql, /raise exception 'Being checked by % — take it over first'/);
    assert.match(sql, /old\.reviewed_at > now\(\) - interval '10 minutes'[\s\S]*Already decided by % a moment ago/);
    assert.match(sql, /delete from support_claims where kind = 'org' and ref_id = new\.org_id;/);
  });
  test('the overview: support only for organisations, reports and the week; casts can\'t break it', () => {
    assert.match(sql, /not is_verification_reviewer\(\)[\s\S]*Only SportnNote support can open the console/);
    assert.match(sql, /'orgs', case when staff then/);
    assert.match(sql, /'week', case when staff then/);
    assert.match(sql, /case when e->>'at' ~ '\^\[0-9\]\{4\}-' then \(e->>'at'\)::timestamptz end/);
    assert.match(sql, /jsonb_typeof\(p\.verification->'history'\) = 'array'/);
  });
  test('age proofs: the decision function checks the same claim and releases it', () => {
    const fn = read('supabase/functions/verification-review/index.ts');
    assert.match(fn, /from\('support_claims'\)\.select\('claimed_by, claimed_at'\)[\s\S]*\.eq\('kind', 'age'\)/);
    assert.match(fn, /Being checked by \$\{name\} — take it over first/);
    assert.match(fn, /from\('support_claims'\)\.delete\(\)\.eq\('kind', 'age'\)\.eq\('ref_id', p\.id\)/);
  });
});

describe('in the app', () => {
  test('Settings › Support tools › Support console, support only', () => {
    assert.match(read('src/screens/SettingsScreen.tsx'), /label="Support console"[\s\S]*navigate\('SupportConsole'\)/);
    const screen = read('src/screens/SupportConsoleScreen.tsx');
    assert.match(screen, /const staff = isSupport\(profile\?\.role\)/);
    assert.match(screen, /SportnNote support only/);
    assert.match(screen, /import \{ OrgReview, Submission \} from '\.\/VerificationReviewScreen'/);
    assert.match(screen, /yesLabel: 'Yes, take it over'/);
    assert.match(read('src/navigation/RootNavigator.tsx'), /name="SupportConsole"/);
  });
});
