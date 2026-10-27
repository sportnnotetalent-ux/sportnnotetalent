/** Link earlier editions (2026-10-27, migration 20261027160000_link_editions):
 *  a tournament run before "Run it again" is linked as this one's earlier
 *  edition — only by someone who runs both, earlier in time, never a branch or
 *  a loop; the same event by name is suggested first. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { baseName, editionCandidates, previousEditionOf } from '../src/data/tournamentCopyPlan.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_link_editions'))!), 'utf8');

type T = { id: string; name: string; startDate: string; deletedAt?: string; mine?: boolean };
const current = { id: 'now', name: 'Annual Sports Meet 2026', startDate: '2026-02-10' };
const all: T[] = [
  { id: 'now', name: 'Annual Sports Meet 2026', startDate: '2026-02-10', mine: true },
  { id: 'a25', name: 'Annual Sports Meet – 2025', startDate: '2025-02-12', mine: true },
  { id: 'a24', name: 'annual sports meet 2024 (copy)', startDate: '2024-02-14', mine: true },
  { id: 'cup', name: 'Winter Cup 2025', startDate: '2025-12-01', mine: true },
  { id: 'later', name: 'Annual Sports Meet 2027', startDate: '2027-02-10', mine: true },
  { id: 'theirs', name: 'Annual Sports Meet 2025', startDate: '2025-02-01', mine: false },
  { id: 'gone', name: 'Annual Sports Meet 2023', startDate: '2023-02-01', mine: true, deletedAt: '2023-03-01' },
];
const opts = (o: Partial<{ inSeries: string[]; followed: string[] }> = {}) => ({
  canManage: (t: T) => !!t.mine, inSeries: new Set(o.inSeries ?? []), followed: new Set(o.followed ?? []),
});

describe('which tournaments can be linked', () => {
  test('names compare without the year, season, "(copy)" or punctuation', () => {
    assert.equal(baseName('Annual Sports Meet – 2025'), 'annual sports meet');
    assert.equal(baseName('annual sports meet 2024 (copy)'), 'annual sports meet');
    assert.equal(baseName('Winter League 2025-26'), 'winter league');
    assert.equal(baseName('U-19 Cup'), 'u 19 cup');
  });
  test('only ones you run, earlier, not deleted; the same event first, newest first', () => {
    const list = editionCandidates(current, all, opts());
    assert.deepEqual(list.map((c) => [c.t.id, c.sameName]), [['a25', true], ['a24', true], ['cup', false]]);
  });
  test('not already in this series, and not already followed by another edition', () => {
    assert.deepEqual(editionCandidates(current, all, opts({ inSeries: ['a24'], followed: ['a25'] })).map((c) => c.t.id), ['cup']);
  });
  test('the earlier edition in a series', () => {
    const eds = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.equal(previousEditionOf(eds, 'b')?.id, 'a');
    assert.equal(previousEditionOf(eds, 'a'), undefined);
    assert.equal(previousEditionOf(eds, 'x'), undefined);
  });
});

describe('the server keeps a series a single, honest line', () => {
  test('one function changes links; the caller runs both tournaments', () => {
    assert.match(sql, /create or replace function link_tournament_edition\(p_tournament uuid, p_previous uuid\)/);
    assert.match(sql, /not can_manage_tournament\(t\.id\)/);
    assert.match(sql, /not can_manage_tournament\(prev\.id\)/);
    assert.match(sql, /revoke all on function link_tournament_edition\(uuid, uuid\) from public, anon;/);
    assert.match(sql, /grant execute on function link_tournament_edition\(uuid, uuid\) to authenticated;/);
  });
  test('earlier in time, no branch, no loop; later editions move with it; the guard stays shut to the app', () => {
    assert.match(sql, /prev\.start_date >= t\.start_date/);
    assert.match(sql, /x\.previous_edition_id = prev\.id and x\.id <> t\.id and x\.deleted_at is null/);
    assert.match(sql, /with recursive later\(id\)[\s\S]*select 1 from later where later\.id = prev\.id/);
    assert.match(sql, /update tournaments set first_edition_id = root where id in \(select id from later\)/);
    assert.match(sql, /set_config\('app\.trusted_rpc', 'on', true\)[\s\S]*set_config\('app\.trusted_rpc', 'off', true\)/);
    assert.match(sql, /tg_op = 'UPDATE'[\s\S]*is_client_request\(\)[\s\S]*raise exception 'Link editions from the tournament''s Manage tab'/);
  });
  test('Run it again can no longer make a second next edition of the same tournament', () => {
    assert.match(sql, /-- INSERT[\s\S]*x\.previous_edition_id = prev\.id and x\.deleted_at is null[\s\S]*already has a next edition/);
  });
});

describe('in the app', () => {
  test('Manage › Link an earlier edition (or the earlier edition, once linked)', () => {
    const page = read('src/screens/TournamentProfileScreen.tsx');
    assert.match(page, /title=\{prevEdition \? 'Earlier edition' : 'Link an earlier edition'\}/);
    assert.match(page, /nav\.navigate\('LinkEdition', \{ tournamentId: tournament\.id \}\)/);
    const nav = read('src/navigation/RootNavigator.tsx');
    assert.match(nav, /name="LinkEdition"/);
    assert.match(nav, /'LinkEdition',/);
  });
  test('every link and unlink is confirmed, logged, and degrades before the migration', () => {
    const screen = read('src/screens/LinkEditionScreen.tsx');
    assert.match(screen, /yesLabel: 'Yes, link it'/);
    assert.match(screen, /yesLabel: 'Yes, unlink'/);
    assert.match(screen, /isNeedsDbUpdate\(e\)/);
    const data = read('src/data/tournamentCopy.ts');
    assert.match(data, /rpc\('link_tournament_edition', \{ p_tournament: tournamentId, p_previous: previousId \}\)/);
    assert.match(data, /action: previousId \? 'edition\.linked' : 'edition\.unlinked'/);
  });
});
