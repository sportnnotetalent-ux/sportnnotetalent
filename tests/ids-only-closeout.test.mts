/** IDs-only scoring close-out (docs/privacy/ids-only-scoring.md): the shared
 *  surfaces outside the sport engines. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { recreditAction } from '../src/sports/amendCredit.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('post-match corrections re-credit by id only', () => {
  test('a legacy named record → the new player\'s id, no name anywhere', () => {
    const a = recreditAction({
      type: 'GOAL', side: 'home',
      payload: { playerName: 'Zebedee Quartermaine', name: 'Zebedee Quartermaine', playerId: 'old', pid: 'old', minute: 12 },
      attribution: { playerId: 'old', stat: 'goals', playerName: 'Zebedee Quartermaine' },
    } as never, 'new');
    assert.doesNotMatch(JSON.stringify(a), /Zebedee/);
    const p = a.payload as Record<string, unknown>;
    assert.equal(p.playerId, 'new');
    assert.equal(p.pid, 'new');
    assert.equal(p.minute, 12);
    assert.equal(a.attribution?.playerId, 'new');
  });
  test('a chess opening\'s name is not a player\'s', () => {
    const a = recreditAction({ type: 'OPENING', payload: { name: 'Sicilian Defence', opening: 'B20' }, attribution: { playerId: 'x', stat: 's' } } as never, 'y');
    assert.equal((a.payload as Record<string, unknown>).name, 'Sicilian Defence');
  });
  test('the change lines (public) use publicName; the corrector\'s name too', () => {
    const list = read('src/components/EventCorrectionList.tsx');
    assert.match(list, /publicName\(\{ fullName: p\.fullName, age: ageOf\(p\) \}\)/);
    assert.doesNotMatch(list, /attribution\?\.playerName \?\? 'someone else'/);
    assert.match(read('src/screens/CorrectMatchScreen.tsx'), /const byName = publicName\(/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /amend\(liveOps\.ops, liveOps\.lines, publicName\(/);
  });
});

describe('tournament records resolve players by id', () => {
  test('TournamentRecords looks names up for record ids', () => {
    const src = read('src/components/TournamentRecords.tsx');
    assert.match(src, /usePlayerNameOf\(recordIds\)/);
    assert.match(src, /nameOf\(it\.playerId, it\.playerName\)/);
  });
});

describe('the remaining public name copies are masked on write (minor_names_misc)', () => {
  const dir = join(root, 'supabase', 'migrations');
  const f = readdirSync(dir).find((x) => x.includes('minor_names_misc'))!;
  const sql = readFileSync(join(dir, f), 'utf8');
  test('a trigger on every copy', () => {
    for (const t of [
      'create trigger matches_mask_minor_names before insert or update of potm, result on matches',
      'create trigger tournaments_mask_award_names before insert or update of awards on tournaments',
      'create trigger match_disputes_mask_names before insert or update on match_disputes',
      'create trigger activity_log_mask_names before insert or update on activity_log',
      'create trigger field_entries_mask_member_names before insert or update of result on field_entries',
    ]) assert.ok(sql.includes(t), t);
  });
  test('a possible minor (players_view rule) → initials; adults untouched', () => {
    assert.match(sql, /not player_is_known_adult\(p\.dob, p\.profile_id\)\)\s+then coalesce\(\(select name_initials\(p\.full_name\)/);
  });
  test('the app shows the viewer\'s name by id for POTM and awards', () => {
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /name: viewerNameOf\(storedPotm\.playerId, storedPotm\.name\)/);
    const awards = read('src/components/TournamentAwardsTab.tsx');
    assert.match(awards, /usePlayerNameOf\(/);
    assert.doesNotMatch(awards, /\{i\.playerName\}|\{item\.playerName\}/);
  });
});

describe('line-ups (lineup_names)', () => {
  test('public slots mask a possible minor; the editor re-reads names from the squad', () => {
    const dir = join(root, 'supabase', 'migrations');
    const sql = readFileSync(join(dir, readdirSync(dir).find((x) => x.includes('lineup_names'))!), 'utf8');
    assert.match(sql, /create trigger match_lineups_mask_names before insert or update on match_lineups/);
    assert.match(sql, /public_person_name\(json_uuid\(sl->>'playerId'\), sl->>'playerName'\)/);
    assert.match(read('src/screens/LineupEditorScreen.tsx'), /byId\.get\(sl\.playerId\) !== sl\.playerName/);
  });
});
