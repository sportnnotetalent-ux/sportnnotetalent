/**
 * Scoring safety net (2026-10-27, founder "2A"; migration
 * 20261027200000_match_names_safety_net): an older app version that still
 * saves full names into public match data (match_events payload / attribution,
 * matches.state) has every possible minor's name stored as initials — the
 * same rule as the entry / POTM / awards triggers. Nothing is refused and
 * nothing fails: today's app sends ids only, so its data passes unchanged.
 *
 * The regex semantics were checked on the live database (read-only SELECTs):
 * whole names only ("Ram Kumar" not inside "Shriram Kumar"), any case and
 * spacing, keys untouched, punctuation and Devanagari names handled.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_match_names_safety_net'))!), 'utf8');
const fn = (name: string) => {
  const i = sql.indexOf(`create or replace function ${name}(`);
  assert.ok(i >= 0, name);
  return sql.slice(i, sql.indexOf('$$;', sql.indexOf('$$', i) + 2) + 3);
};

describe('who counts', () => {
  test('the possible minors linked to the match: both squads, rosters, entries, and every id in the data', () => {
    const f = fn('match_linked_player_ids');
    assert.match(f, /team_members tm on tm\.team_id in \(m\.home_team_id, m\.away_team_id\)/);
    assert.match(f, /jsonb_array_elements_text\(case when jsonb_typeof\(t\.roster\) = 'array'/);
    assert.match(f, /unnest\(t\.entry_ids\)/);
    assert.match(f, /jsonb_path_query\(coalesce\(p_data, 'null'::jsonb\), 'strict \$\.\*\*'\)/);
    assert.match(fn('mask_minor_names_json'), /not player_is_known_adult\(dob, profile_id\)/, 'the players_view rule — adults unchanged');
  });
});

describe('how a name is masked', () => {
  const f = fn('mask_minor_names_json');
  test('the whole name, literally, any spacing — never a JSON key', () => {
    assert.match(f, /regexp_replace\(r\.n, '\(\[\^\[:alnum:\]\[:space:\]\]\)', '\\\\\\1', 'g'\)/, 'every other character escaped');
    assert.ok(f.includes(`'(?<![[:alnum:]_])' || replace(pat, ' ', '\\s+') || '(?![[:alnum:]_])(?!"\\s*:)'`));
    assert.match(f, /regexp_replace\(t, pat, name_initials\(r\.n\), 'gi'\)/);
    assert.match(f, /order by length\(n\) desc/, 'longest names first');
  });
  test('it never blocks a save', () => {
    assert.match(f, /exception when others then\s+return p_data;/);
    assert.match(fn('match_events_mask_minor_names'), /exception when others then\s+return new;/);
    assert.match(fn('matches_mask_state_names'), /exception when others then\s+return new;/);
  });
});

describe('where it runs', () => {
  test('every match event (payload and attribution) and every live snapshot', () => {
    assert.match(sql, /create trigger match_events_mask_minor_names before insert or update of payload, attribution on match_events/);
    assert.match(sql, /create trigger matches_mask_state_names before insert or update of state on matches/);
    assert.match(fn('matches_mask_state_names'), /new\.state is not distinct from old\.state\) then\s+return new;/, 'unchanged snapshots skip the work');
  });
  test('internal only: clients can\'t call the helpers', () => {
    for (const f of ['match_linked_player_ids(uuid, jsonb)', 'mask_minor_names_json(jsonb, uuid[])']) {
      assert.ok(sql.includes(`revoke all on function ${f} from public, anon, authenticated;`), f);
    }
  });
});
