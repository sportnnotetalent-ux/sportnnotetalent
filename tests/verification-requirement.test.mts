/** Age & guardian verification, Phase 3: the organiser's requirement per
 *  tournament, and the one checklist (docs/verification/fast-lanes.md). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ageRequirementReason, canFieldPlayer, meetsAgeRequirement, TESTING_ALLOW_UNVERIFIED } from '../src/core/eligibility.ts';
import { checklistItems, nextStep } from '../src/core/verificationChecklist.ts';

const kid = (extra: Record<string, unknown> = {}) => ({ id: 'p1', fullName: 'A B', sports: [], dob: '2012-05-01', ...extra }) as never;

describe('the organiser\'s age requirement', () => {
  test('none / confirmed / verified', () => {
    assert.equal(meetsAgeRequirement(kid(), 'none'), true);
    assert.equal(meetsAgeRequirement(kid(), undefined), true);
    assert.equal(meetsAgeRequirement(kid(), 'confirmed'), false);
    assert.equal(meetsAgeRequirement(kid({ ageVerifiedBy: 'parent' }), 'confirmed'), true);
    assert.equal(meetsAgeRequirement(kid({ ageVerifiedBy: 'parent' }), 'verified'), false);
    assert.equal(meetsAgeRequirement(kid({ ageVerifiedBy: 'school' }), 'verified'), true);
    assert.equal(meetsAgeRequirement(kid({ ageVerifiedBy: 'document' }), 'verified'), true);
    // an approved document counts even before the view reports the level
    assert.equal(meetsAgeRequirement(kid({ verification: { status: 'approved' } }), 'verified'), true);
  });
  test('enforced even while the testing override relaxes everything else', () => {
    assert.equal(TESTING_ALLOW_UNVERIFIED, true); // Option A, until the founder decides
    assert.equal(canFieldPlayer(kid()), true);
    assert.equal(canFieldPlayer(kid(), 'confirmed'), false);
    assert.equal(canFieldPlayer(kid({ ageVerifiedBy: 'school' }), 'verified'), true);
  });
  test('the reason says what is needed', () => {
    assert.equal(ageRequirementReason(kid({ ageVerifiedBy: 'parent' }), 'confirmed'), undefined);
    assert.match(ageRequirementReason(kid(), 'verified')!, /school \/ club or a document/);
    assert.match(ageRequirementReason(kid(), 'confirmed')!, /parent/);
  });
  test('the migration: three values, default none', () => {
    const dir = join(import.meta.dirname, '..', 'supabase', 'migrations');
    const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('age_requirement'))!), 'utf8');
    assert.match(sql, /add column if not exists age_verification text not null default 'none'/);
    assert.match(sql, /check \(age_verification in \('none', 'confirmed', 'verified'\)\)/);
  });
  test('all three pick-points pass the tournament\'s requirement', () => {
    const root = join(import.meta.dirname, '..');
    for (const f of ['src/screens/MatchSquadScreen.tsx', 'src/screens/CricketLineupScreen.tsx', 'src/screens/LiveScoringScreen.tsx']) {
      const src = readFileSync(join(root, f), 'utf8');
      assert.match(src, /useAgeRequirement\(/, f);
      assert.doesNotMatch(src, /canFieldPlayer\(p\)/, f);
    }
  });
});

describe('the one checklist', () => {
  test('under 18: date of birth, parent, consent, parent contacts, age — next step skips what waits on others', () => {
    const items = checklistItems({ age: 13, hasDob: true, guardian: { added: true }, consent: 'pending' });
    assert.deepEqual(items.map((x) => x.key), ['dob', 'guardian', 'consent', 'g_phone', 'g_email', 'age']);
    assert.equal(items.find((x) => x.key === 'consent')!.waiting, true);
    assert.equal(nextStep(items)!.key, 'g_phone');
  });
  test('18+: own contacts; no date of birth comes first', () => {
    const adult = checklistItems({ age: 30, hasDob: true, phoneVerified: true, emailVerified: false });
    assert.deepEqual(adult.map((x) => x.key), ['dob', 'phone', 'email', 'age']);
    assert.equal(nextStep(adult)!.key, 'email');
    assert.equal(nextStep(checklistItems({ hasDob: false }))!.key, 'dob');
  });
  test('age verified by school or parent ticks it; a document under review waits', () => {
    const v = checklistItems({ age: 30, hasDob: true, phoneVerified: true, emailVerified: true, ageVerifiedBy: 'school' });
    assert.equal(nextStep(v), undefined);
    assert.match(v.at(-1)!.label, /by your school/);
    const w = checklistItems({ age: 30, hasDob: true, phoneVerified: true, emailVerified: true, documentStatus: 'pending' });
    assert.equal(w.at(-1)!.waiting, true);
  });
});
