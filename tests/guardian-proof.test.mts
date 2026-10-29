/**
 * CL-03 parental proof — the app's pure rules (src/core/guardianProof.ts): the
 * child's Home card, the parent's form, where files go, and the reviewer's
 * reasons. Founder 2026-10-29: own account, limited = plays but hidden,
 * "We'll check this within 2 days".
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RELATIONSHIPS, REJECT_REASONS, REVIEW_PROMISE, childCardState, guardianDocPath, validateProofForm,
} from '../src/core/guardianProof.ts';

describe('the child\'s Home card', () => {
  const base = { limited: true, consent: 'pending' as const, proof: null, emailedTo: null };
  test('nothing for a confirmed or adult account', () => {
    assert.equal(childCardState({ ...base, limited: false }), null);
  });
  test('waiting: says what the parent needs and what the child can still do', () => {
    const c = childCardState({ ...base, emailedTo: 'meera@example.com' })!;
    assert.equal(c.kind, 'waiting');
    assert.match(c.body, /meera@example\.com/);
    assert.match(c.body, /photo ID/i);
    assert.match(c.body, /play/i);
    assert.match(c.body, /hidden/i);
  });
  test('in review: the 2-day promise', () => {
    const c = childCardState({ ...base, proof: { status: 'pending', reason: null } })!;
    assert.equal(c.kind, 'in_review');
    assert.match(c.body, /2 days/);
  });
  test('rejected: the reviewer\'s reason and what to do', () => {
    const c = childCardState({ ...base, proof: { status: 'rejected', reason: 'The ID is hard to read' } })!;
    assert.equal(c.kind, 'rejected');
    assert.match(c.body, /The ID is hard to read/);
    assert.match(c.body, /send new/i);
  });
  test('withdrawn: locked', () => {
    assert.equal(childCardState({ ...base, consent: 'withdrawn' })!.kind, 'locked');
  });
});

describe('the parent\'s form', () => {
  const doc = { uri: 'file:///x.jpg', name: 'x.jpg', mimeType: 'image/jpeg', size: 1000 };
  const ok = { relationship: 'mother', name: 'Meera Rao', idDoc: doc, relationDoc: { ...doc, name: 'birth.pdf' } };
  test('complete → no error', () => assert.equal(validateProofForm(ok), null));
  test('each missing piece is named', () => {
    assert.match(validateProofForm({ ...ok, relationship: null }) ?? '', /mother, father or legal guardian/i);
    assert.match(validateProofForm({ ...ok, name: '  ' }) ?? '', /name/i);
    assert.match(validateProofForm({ ...ok, idDoc: null }) ?? '', /photo ID/i);
    assert.match(validateProofForm({ ...ok, relationDoc: null }) ?? '', /relationship|parent/i);
  });
  test('too large a file is refused before uploading (10 MB, as the bucket)', () => {
    assert.match(validateProofForm({ ...ok, idDoc: { ...doc, size: 11 * 1024 * 1024 } }) ?? '', /10 MB/);
  });
  test('three relationships, as the database allows', () => {
    assert.deepEqual(RELATIONSHIPS.map((r) => r.id), ['mother', 'father', 'legal_guardian']);
  });
});

describe('where the files go', () => {
  test('the parent\'s own folder, per child, a safe extension', () => {
    assert.equal(guardianDocPath('u1', 'c1', 'id', 'Scan 1.JPG', 1700000000000), 'u1/guardian-c1/id-1700000000000.jpg');
    assert.equal(guardianDocPath('u1', 'c1', 'relation', 'birth.p d/f', 5), 'u1/guardian-c1/relation-5.pdf');
    assert.equal(guardianDocPath('u1', 'c1', 'id', 'noext', 5), 'u1/guardian-c1/id-5.bin');
  });
});

describe('the reviewer', () => {
  test('reason presets, each telling the parent what to fix', () => {
    assert.ok(REJECT_REASONS.length >= 4);
    for (const r of REJECT_REASONS) assert.ok(r.length > 15, r);
  });
  test('the promise shown to parents', () => assert.match(REVIEW_PROMISE, /within 2 days/));
});

describe('leaderboards leave out a child whose parent isn\'t approved yet', async () => {
  const { leadersByKey } = await import('../src/data/standings.ts');
  const line = (id: string, playerId: string, goals: number, hidden?: boolean) =>
    ({ id, matchId: `m-${id}`, playerId, sport: 'football', stats: { goals }, won: false, ...(hidden ? { publicHidden: true } : {}) });
  const players = [{ id: 'kid', fullName: 'Asha Rao' }, { id: 'adult', fullName: 'Ravi Rao' }] as never[];
  test('a line marked publicHidden never ranks; the others do', () => {
    const lines = [line('1', 'kid', 9, true), line('2', 'adult', 2)] as never[];
    const names = leadersByKey(lines, players, 'football', 'goals').map((l: { playerId: string }) => l.playerId);
    assert.deepEqual(names, ['adult']);
  });
});

describe('sign-up asks every under-18 for a parent\'s email (the approval link goes there)', () => {
  test('no "I consent" checkbox any more; the guardian email is required for every minor', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /I consent to them creating/);
    assert.doesNotMatch(src, /guardianMustConfirm/);
    assert.match(src, /if \(minor && !\/\^\[\^\\s@\]\+@/);
  });
});
