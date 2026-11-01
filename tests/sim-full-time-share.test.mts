/**
 * Quality mandate step 6 for the result picture (docs/security/breaks/full-time-share.md):
 * 1,000 random matches (players of every age, some unknown; open disputes;
 * the player of the match on or off the rosters). A possible minor's full
 * name, or a disputed player, never reaches the card or the message; an adult
 * is named in full; the card line always fits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardStar, cardModel } from '../src/core/resultCard.ts';
import { matchShareText } from '../src/core/shareText.ts';

let seed = 113;
const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return Math.floor(seed / 65536) % k; }; // high bits (the low bit alternates)
const FIRST = ['Meera', 'Ravi', 'Asha', 'Arjun', 'Lakshmi', 'Venkata Subrahmanya'], LAST = ['Rao', 'Kumar', 'Das', 'Reddy', 'Chandrasekharan'];

test('1,000 full-time shares', () => {
  for (let i = 0; i < 1000; i++) {
    const players = Array.from({ length: 2 + rnd(10) }, (_, k) => ({
      id: `p${k}`, fullName: `${FIRST[rnd(FIRST.length)]} ${LAST[rnd(LAST.length)]}`, ...(rnd(4) ? { age: 8 + rnd(40) } : {}),
    }));
    const disputed = new Set(players.filter(() => rnd(8) === 0).map((p) => p.id));
    const onRoster = rnd(5) !== 0;
    const pick = onRoster ? players[rnd(players.length)] : { id: undefined, fullName: 'Visiting Player', age: undefined };
    const potm = rnd(10) ? { id: pick.id, name: pick.fullName } : undefined;
    const star = cardStar(potm, players, disputed);
    const text = matchShareText({ sportIcon: '⚽', status: 'final', home: 'A', away: 'B', homeScore: '1', awayScore: '0', winner: 'home', star, matchId: 'm' });
    const card = cardModel({ sportName: 'Football', status: 'final', home: 'A', away: 'B', homeScore: '1', awayScore: '0', winner: 'home', star });
    if (!potm || (pick.id && disputed.has(pick.id))) { assert.equal(star, undefined); assert.equal(card.star, ''); continue; }
    const adult = pick.age !== undefined && pick.age >= 18 && onRoster;
    if (adult) assert.equal(star, pick.fullName);
    else {
      assert.ok(!text.includes(pick.fullName) && !card.star.includes(pick.fullName), `a possible minor's full name leaked: ${pick.fullName}`);
      assert.match(star!, /^([A-Z]\. )*[A-Z]\.$/);
    }
    assert.ok(card.star.length <= 48);
  }
});
