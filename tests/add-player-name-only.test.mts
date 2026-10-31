/**
 * MVP F6 / B9 — adding a friend mid-match needed their mobile number. The
 * Scoring tab's "Add / invite a player" box now offers, for a typed name that
 * isn't on SportnNote, "＋ Add <name> without a number": a name-only player on
 * that side's squad (claimable later, as clubs already allow). No message is
 * sent. A name of under 2 letters isn't offered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nameOnlyOk } from '../src/core/contactQuery.ts';

test('a name of 2+ letters qualifies; numbers, emails and blanks do not', () => {
  assert.equal(nameOnlyOk('Ravi'), true);
  assert.equal(nameOnlyOk('  Al '), true);
  assert.equal(nameOnlyOk('R'), false);
  assert.equal(nameOnlyOk(''), false);
  assert.equal(nameOnlyOk('9876543210'), false);
  assert.equal(nameOnlyOk('ravi@x.in'), false);
});
test('the box creates the person without a number, then adds them to the side (no invite sent)', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/components/AddInvitePlayer.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('const addNameOnly = async'), src.indexOf('};', src.indexOf('const addNameOnly = async')));
  assert.match(fn, /invitePerson\(\{ name: typed, sport \}\)/);
  assert.match(fn, /invitePlayer\(\{ teamId, teamName, sport, matchId, name: typed, player \}\)/);
  assert.doesNotMatch(fn, /openWhatsApp|openSms/);
  assert.match(src, /without a number/);
});
