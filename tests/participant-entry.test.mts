/** Singles / doubles sides are REAL people: picking a partner reuses the person
 *  (and their existing entry), a typed name is the marked last resort; the
 *  invite a new player gets; Americano players keep their player ids. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryName, entryShortName, findEntryFor, entrantProblem, takenIds, slotName, slotId, allLinked,
  type EntrantSlot,
} from '../src/data/participantEntry.ts';
import { playerInviteText } from '../src/core/inviteText.ts';
import { addAmericanoPlayer, isLinkedAmericanoPlayer, newAmericanoPlayer, emptyAmericano } from '../src/data/americano.ts';

const asha: EntrantSlot = { kind: 'person', person: { id: 'p-asha', fullName: 'Asha Rao' } };
const ben: EntrantSlot = { kind: 'person', person: { id: 'p-ben', fullName: '  Ben   Lee ' } };
const rahul: EntrantSlot = { kind: 'name', name: ' Rahul ' };

describe('participant entry', () => {
  test('a side is named after its people', () => {
    assert.equal(entryName(['Asha Rao']), 'Asha Rao');
    assert.equal(entryName([slotName(asha), slotName(ben)]), 'Asha Rao / Ben Lee');
    assert.equal(entryName(['', ' Rahul ']), 'Rahul');
  });

  test('short code: initials, else letters', () => {
    assert.equal(entryShortName(['Asha Rao']), 'AR');
    assert.equal(entryShortName(['Asha Rao', 'Ben Lee']), 'ARBL');
    assert.equal(entryShortName(['Asha Kiran Rao', 'Ben']), 'ARB');
    assert.equal(entryShortName(['Rahul']), 'RAHU');
    assert.equal(entryShortName(['R']), 'RX');
    assert.equal(entryShortName([]), 'PL');
  });

  test('the same people reuse their existing entry (any order) — never a duplicate team', () => {
    const teams = [
      { id: 't-solo', roster: ['p-asha'] },
      { id: 't-pair', roster: ['p-ben', 'p-asha'] },
      { id: 't-other', roster: ['p-asha', 'p-cara'] },
      { id: 't-house' },
    ];
    assert.equal(findEntryFor(teams, ['p-asha'])?.id, 't-solo');
    assert.equal(findEntryFor(teams, ['p-asha', 'p-ben'])?.id, 't-pair');
    assert.equal(findEntryFor(teams, ['p-ben']), undefined);
    assert.equal(findEntryFor(teams, ['p-asha', 'p-asha']), undefined); // not a pair of two
    assert.equal(findEntryFor(teams, []), undefined);
  });

  test('slots: linked ids, the last-resort name, what still blocks the side', () => {
    assert.equal(slotId(asha), 'p-asha');
    assert.equal(slotId(rahul), undefined);
    assert.equal(slotName(rahul), 'Rahul');
    assert.deepEqual(takenIds([asha, null, rahul, ben]), ['p-asha', 'p-ben']);
    assert.equal(allLinked([asha, ben]), true);
    assert.equal(allLinked([asha, rahul]), false);
    assert.equal(allLinked([]), false);

    assert.equal(entrantProblem([asha, null], 2), 'Pick both partners.');
    assert.equal(entrantProblem([null], 1), 'Pick the player.');
    assert.equal(entrantProblem([asha, { kind: 'name', name: '  ' }], 2), 'Pick both partners.');
    assert.equal(entrantProblem([asha, asha], 2), 'Pick two different players.');
    assert.equal(entrantProblem([asha, rahul], 2), null);
    assert.equal(entrantProblem([asha, ben], 2), null);
    assert.equal(entrantProblem([asha], 1), null);
  });
});

describe('player invite', () => {
  test('exact text — names the sport and where, carries the privacy line', () => {
    assert.equal(
      playerInviteText({ name: 'Kiran', inviterName: 'Hrudhay', sportName: 'Tennis', context: 'Tournament Open Cup', link: 'https://app.sportnnote.in/t/t1' }),
      'Hi Kiran! Hrudhay added you as a Tennis player in Tournament Open Cup on SportnNote 🏅\n\n'
      + 'Open this link and sign up with this mobile number (1 minute, no password) so your matches and stats land on your profile:\nhttps://app.sportnnote.in/t/t1\n\n'
      + 'How we handle your details: https://sportnnote.in/privacy/',
    );
  });
  test('no name / no inviter / no context — and never greets an "Invited (…)" placeholder', () => {
    assert.match(playerInviteText({ link: 'L' }), /^Hi! A friend added you as a player on SportnNote 🏅\n\n.*\nL\n\n/s);
    assert.match(playerInviteText({ name: 'Invited (…1234)', link: 'L' }), /^Hi! /);
  });
});

describe('americano players are people', () => {
  test('a picked person keeps their player id; a typed name is an unlinked ap- id', () => {
    const linked = newAmericanoPlayer('Asha Rao', 'p-asha');
    assert.deepEqual(linked, { id: 'p-asha', name: 'Asha Rao' });
    assert.equal(isLinkedAmericanoPlayer(linked.id), true);
    const nameOnly = newAmericanoPlayer('  Rahul ');
    assert.match(nameOnly.id, /^ap-/);
    assert.equal(nameOnly.name, 'Rahul');
    assert.equal(isLinkedAmericanoPlayer(nameOnly.id), false);
  });
  test('the same person is never added twice', () => {
    const s0 = emptyAmericano();
    const s1 = addAmericanoPlayer(s0, newAmericanoPlayer('Asha Rao', 'p-asha'));
    const s2 = addAmericanoPlayer(s1, newAmericanoPlayer('Asha R.', 'p-asha'));
    assert.equal(s1.players.length, 1);
    assert.equal(s2, s1);
    const s3 = addAmericanoPlayer(s1, newAmericanoPlayer('Rahul'));
    assert.equal(s3.players.length, 2);
    assert.equal(addAmericanoPlayer(s3, newAmericanoPlayer('   ')), s3); // blank → unchanged
  });
});
