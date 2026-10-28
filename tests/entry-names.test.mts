/** Singles / doubles entry names (migration entry_names, 2026-10-24): a child's
 *  full name is never stored in a public team name; the app rebuilds the name
 *  from the entry's players as the viewer may see them. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { entryName, entryNameFromPlayers } from '../src/data/participantEntry.ts';

describe('entryNameFromPlayers', () => {
  const circle = new Map([['kid', 'Meera Rao'], ['adult', 'Ravi Kumar']]);
  const stranger = new Map([['kid', 'M. R.'], ['adult', 'Ravi Kumar']]);
  test('the circle sees full names, a stranger the initials players_view gives', () => {
    assert.equal(entryNameFromPlayers(['kid', 'adult'], (id) => circle.get(id)), 'Meera Rao / Ravi Kumar');
    assert.equal(entryNameFromPlayers(['kid', 'adult'], (id) => stranger.get(id)), 'M. R. / Ravi Kumar');
    assert.equal(entryNameFromPlayers(['kid'], (id) => circle.get(id)), entryName(['Meera Rao']));
  });
  test('any unknown player: keep the stored name (undefined)', () => {
    assert.equal(entryNameFromPlayers(['kid', 'nobody'], (id) => circle.get(id)), undefined);
    assert.equal(entryNameFromPlayers([], (id) => circle.get(id)), undefined);
  });
});

describe('entry_names migration', () => {
  const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
  const files = readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  const sql = readFileSync(join(dir, files.find((x) => x.endsWith('_entry_names.sql'))!), 'utf8');
  // the newest body of the trigger function (Wave 3 DB-11 decides on masked names)
  const latest = readFileSync(join(dir, [...files].reverse()
    .find((x) => /create or replace function teams_entry_names\(\)/.test(readFileSync(join(dir, x), 'utf8')))!), 'utf8');
  test('entries are masked on save and stat-line opponents too', () => {
    assert.match(latest, /new\.name := mask_minor_names\(new\.name, ids\)/);
    assert.match(sql, /create trigger teams_entry_names before insert or update of name, roster on teams/);
    assert.match(sql, /new\.opponent := mask_minor_names\(new\.opponent, ids\)/);
    // the possible-minor rule is players_view's
    assert.match(latest, /not player_is_known_adult\(dob, profile_id\)/);
  });
  test('home_feed hands the app each side\'s entry players', () => {
    assert.match(sql, /'entry_ids', ht\.entry_ids/);
    assert.match(sql, /'entry_ids', at\.entry_ids/);
  });
});
