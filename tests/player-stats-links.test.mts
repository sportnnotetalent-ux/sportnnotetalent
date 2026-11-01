/**
 * "Your stats from today's game" (docs/security/breaks/player-stats-links.md):
 * a push to players with an account, and a ready WhatsApp message (sent by the
 * scorer) for players added by mobile number.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { statsPushes, statsWhatsApps, type StatsMatch } from '../src/core/playerStatsMessage.ts';
import type { Player, StatLine } from '../src/core/types.ts';

const m: StatsMatch = { matchId: 'm1', sport: 'football', sportName: 'Football', home: 'Panthers', away: 'Cheetahs', homeScore: '2', awayScore: '1' };
const P = (id: string, o: Partial<Player> = {}): Player => ({ id, fullName: `${id} Kumar`, sports: ['football'], ...o });
const L = (playerId: string, stats: Record<string, number>): StatLine => ({ id: `l-${playerId}`, matchId: 'm1', playerId, sport: 'football', stats } as StatLine);

const players = [
  P('ravi', { profileId: 'pr1', age: 30 }),
  P('asha', { profileId: 'pr2', age: 25 }),
  P('me', { profileId: 'pr0', age: 40 }),
  P('arjun', { phone: '9876543210', age: 28 }),
  P('kid', { phone: '9000000001', age: 13, guardian: { name: 'Mom', phone: '9111111111' } }),
  P('kid2', { phone: '9000000002', age: 12 }),
  P('anon', { phone: '9222222222' }),
  P('nophone', { age: 30 }),
];
const lines = [L('ravi', { goals: 2, assists: 1 }), L('asha', { goals: 0 }), L('me', { goals: 1 }), L('arjun', { goals: 1 }), L('kid', { goals: 1 }), L('kid2', { goals: 3 }), L('anon', { assists: 1 }), L('nophone', { goals: 1 })];

describe('PS1 / PS4 / PS6: pushes to players with an account', () => {
  const pushes = statsPushes(m, lines, players, { me: 'me', disputed: new Set() });
  test('only players with an account and something to say, never the scorer', () => {
    assert.deepEqual(pushes.map((p) => p.playerId), ['ravi']);
  });
  test('their own figures and the score', () => {
    assert.equal(pushes[0].title, 'Your stats from today’s game');
    assert.match(pushes[0].body, /^2 goals · 1 assist · Panthers 2–1 Cheetahs$/);
    assert.equal(pushes[0].matchId, 'm1');
  });
});

describe('PS3 / PS4: WhatsApp messages for players without an account', () => {
  const msgs = statsWhatsApps(m, lines, players, { disputed: new Set(), link: 'https://app.sportnnote.in/m/m1' });
  const by = (id: string) => msgs.find((x) => x.playerId === id);
  test('an adult: their own number', () => assert.equal(by('arjun')?.phone, '9876543210'));
  test('a child: the guardian’s number, addressed to the parent', () => {
    assert.equal(by('kid')?.phone, '9111111111');
    assert.match(by('kid')!.text, /^Hi Mom! kid’s stats from today’s football game/);
  });
  test('a child with no guardian number: nobody', () => assert.equal(by('kid2'), undefined));
  test('age unknown: their own number (the scorer typed it)', () => assert.equal(by('anon')?.phone, '9222222222'));
  test('no number: not listed', () => assert.equal(by('nophone'), undefined));
  test('players with an account get the push instead', () => assert.equal(by('ravi'), undefined));
  test('the message: figures, score, the match link, the sign-up line', () => {
    const t = by('arjun')!.text;
    assert.match(t, /^Hi arjun! Your stats from today’s football game: 1 goal\./);
    assert.match(t, /Panthers 2–1 Cheetahs/);
    assert.match(t, /https:\/\/app\.sportnnote\.in\/m\/m1/);
    assert.match(t, /Sign up on SportnNote with this number to keep your stats on your profile\./);
  });
});

test('PS5: a disputed player gets nothing', () => {
  assert.deepEqual(statsPushes(m, lines, players, { me: 'me', disputed: new Set(['ravi']) }), []);
  assert.equal(statsWhatsApps(m, lines, players, { disputed: new Set(['arjun']), link: 'x' }).some((x) => x.playerId === 'arjun'), false);
});

describe('PS2 / PS6: the screen', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'src/screens/LiveScoringScreen.tsx'), 'utf8');
  test('pushes once the result is final, once per match, never for a guest game', () => {
    assert.match(src, /if \(!matchId \|\| !complete \|\| resultSendsAt != null \|\| !canScore\) return;/);
    assert.match(src, /STATS_PUSHED_KEY/);
  });
  test('the scorer sends the rest on WhatsApp, one tap each', () => {
    assert.match(src, /Send players their stats/);
    assert.match(src, /openWhatsApp\(w\.phone, w\.text\)/);
  });
});
