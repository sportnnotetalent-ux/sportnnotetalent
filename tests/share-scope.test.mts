/** Signed-out scope header from the page in view (docs/security/breaks/signed-out-scope.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeForRoute, setShareScope, getShareScope, overlayScope, withShareHeader } from '../src/core/shareScope.ts';

const U = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

test('each shared page names its item', () => {
  assert.equal(scopeForRoute('MatchLink', { matchId: U }), `m:${U}`);
  assert.equal(scopeForRoute('LiveScoring', { matchId: U }), `m:${U}`);
  assert.equal(scopeForRoute('Tournament', { tournamentId: U }), `t:${U}`);
  for (const r of ['Standings', 'Bracket', 'SportHub', 'TeamJourney']) assert.equal(scopeForRoute(r, { tournamentId: U }), `t:${U}`, r);
  for (const r of ['PlayerProfile', 'SportProfile', 'Invite']) assert.equal(scopeForRoute(r, { playerId: U }), `p:${U}`, r);
  assert.equal(scopeForRoute('GetApp', { from: U }), `p:${U}`);
  assert.equal(scopeForRoute('HeadToHead', { a: U }), `p:${U}`);
  assert.equal(scopeForRoute('Team', { teamId: U }), `team:${U}`);
  assert.equal(scopeForRoute('GolfRound', { eventId: U }), `e:${U}`);
  assert.equal(scopeForRoute('ResultsEvent', { phaseId: U }), `e:${U}`);
  assert.equal(scopeForRoute('HallOfFame', { orgId: U }), `h:${U}`);
});

test('anything else, or an id that isn’t a uuid, sends no header', () => {
  assert.equal(scopeForRoute('Auth', {}), null);
  assert.equal(scopeForRoute('MatchLink', { matchId: 'm1' }), null, 'demo ids');
  assert.equal(scopeForRoute('MatchLink', { matchId: `${U}' or 1=1` }), null);
  assert.equal(scopeForRoute('Tournament', undefined), null);
});

test('the stream overlay path', () => {
  assert.equal(overlayScope(`/o/${U}`), `m:${U}`);
  assert.equal(overlayScope('/o/nope'), null);
});

test('set reports a change (so the read cache is cleared) and the header rides on requests', () => {
  assert.equal(setShareScope(`m:${U}`), true);
  assert.equal(setShareScope(`m:${U}`), false);
  assert.equal(getShareScope(), `m:${U}`);
  const init = withShareHeader({ method: 'GET', headers: { apikey: 'k' } });
  assert.equal(new Headers(init.headers).get('x-share'), `m:${U}`);
  assert.equal(new Headers(init.headers).get('apikey'), 'k');
  setShareScope(null);
  assert.equal(new Headers(withShareHeader({ headers: { apikey: 'k' } }).headers).get('x-share'), null);
});
