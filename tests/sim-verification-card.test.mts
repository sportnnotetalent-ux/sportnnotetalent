/**
 * Simulation (quality mandate step 6): 600 random verification records and
 * histories, owner and reviewer views. The compact card's summary is always one
 * clean sentence, the action only when the owner must act, and the history rows
 * are complete, dated, and never show a file name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificationSummary, historyRows, canSeeVerification } from '../src/core/verificationReview.ts';

let seed = 20261103;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; };
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)];

const STATUSES = [undefined, 'pending', 'approved', 'rejected', 'weird', '', null] as const;
const FAST = [undefined, 'school', 'parent', 'document', 'bogus'] as const;
const ACTIONS = ['submitted', 'approved', 'rejected', 'odd'] as const;
const NAMES = [undefined, '', '  ', 'Asha', 'Dr. R. K. Nair', 'Support'];
const NOTES = [undefined, '', '  ', 'Blurry', 'DOB doesn’t match. Please upload again.'];
const DOCS = [undefined, 'IMG_SECRET_Ravi.jpg', 'birth cert FINAL.PDF', 'scan.heic', 'notes.docx'];
const ATS = [Date.UTC(2026, 0, 1), Date.UTC(2025, 11, 31, 23), Number.NaN, 0, Date.UTC(2026, 10, 3, 12)];

test('600 random records: one clean sentence, the right action, complete history', () => {
  let runs = 0;
  for (let i = 0; i < 600; i++) {
    const status = pick(STATUSES) as never;
    const confirmedBy = pick(FAST) as never;
    const viewer = rnd(3) === 0 ? 'reviewer' : 'owner';
    const s = verificationSummary({ status, confirmedBy, viewer });

    // the line: one short sentence, no holes
    assert.equal(typeof s.next, 'string');
    assert.ok(s.next.length > 10 && s.next.length <= 90, s.next);
    assert.doesNotMatch(s.next, /undefined|null|NaN|\[object|\n|  /, s.next);
    assert.match(s.next, /^[A-Z].*\.$/, s.next);
    assert.equal(s.next.match(/[.!?](\s|$)/g)?.length, 1, s.next);
    assert.ok(['Verified', 'Pending', 'Rejected', 'Not started'].includes(s.chip));

    // the action: only the owner, only when they must act
    const st = status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined;
    const fast = confirmedBy === 'school' || confirmedBy === 'parent';
    const mustAct = viewer === 'owner' && st !== 'approved' && !fast && (st === undefined || st === 'rejected');
    assert.equal(!!s.action, mustAct, `${String(status)}/${String(confirmedBy)}/${viewer}`);
    if (s.action) assert.match(s.action.label, /^📎 (Upload|Re-submit) proof$/);
    if (st === 'approved' || fast) assert.equal(s.chip, 'Verified');
    if (viewer === 'reviewer') assert.doesNotMatch(s.next, /^Upload/);

    // the history: every entry, dated or "—", never a file name
    const n = rnd(7);
    const history = Array.from({ length: n }, () => ({
      action: pick(ACTIONS), at: pick(ATS), byName: pick(NAMES), note: pick(NOTES), docName: pick(DOCS),
    }));
    const rows = historyRows(history);
    assert.equal(rows.length, n);
    for (const r of rows) {
      assert.match(r.when, /^(\d{1,2} [A-Z][a-z]{2} \d{4}|—)$/);
      assert.match(r.line, /^((Photo|PDF|File|Proof) submitted|(Approved|Rejected) by \S.*)$/);
      assert.doesNotMatch(JSON.stringify(r), /SECRET|FINAL|undefined|Invalid/);
      if (r.action !== 'rejected') assert.equal(r.note, undefined);
      if (r.note !== undefined) assert.ok(r.note.trim().length > 0);
    }

    // who may see it: owner or support only
    const me = pick(['p1', 'p2', null, undefined]);
    const sup = rnd(2) === 0;
    assert.equal(canSeeVerification({ playerId: 'p1', myPlayerId: me, viewerIsSupport: sup }), sup || me === 'p1');
    runs++;
  }
  assert.equal(runs, 600);
});
