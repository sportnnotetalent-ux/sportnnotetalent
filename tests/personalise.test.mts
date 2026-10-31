/**
 * Personalised Home (founder 2026-10-31) — the app's pure rules
 * (src/core/personalise.ts, SPORT_POSITIONS in src/data/sportProfileFields.ts):
 * which questions to ask, saving the answers straight into the player's profile
 * (so nothing is filled in twice), never getting in the way of someone at the
 * ground (skip, deep links), and the "Near you" labels.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  USES, personaliseSteps, sportsQuestion, mergeSports, mergeSportDetails, splitPositions, joinPositions,
  shouldAutoOpen, homeCard, roundCoord, viewsLabel, nearHeading, distanceLabel, MAX_POSITIONS, locationAllowed,
} from '../src/core/personalise.ts';
import { readFileSync } from 'node:fs';
import { isWriteRequest } from '../src/data/readCache.ts';
import { SPORT_POSITIONS, SPORT_SIDE_FIELDS } from '../src/data/sportProfileFields.ts';

describe('the questions', () => {
  test('five uses, as the server allows', () => {
    assert.deepEqual(USES.map((u) => u.id), ['play', 'organise', 'score', 'parent', 'fan']);
  });
  test('a player: uses → sports → a card per sport → city → location → done', () => {
    const s = personaliseSteps({ uses: ['play'], sports: ['football', 'cricket'], canAskLocation: true });
    assert.deepEqual(s.map((x) => x.kind === 'sport' ? `sport:${x.sport}` : x.kind),
      ['uses', 'sports', 'sport:football', 'sport:cricket', 'city', 'location', 'done']);
  });
  test('a parent or organiser who doesn\'t play gets no position cards', () => {
    const s = personaliseSteps({ uses: ['parent', 'organise'], sports: ['football'], canAskLocation: true });
    assert.ok(!s.some((x) => x.kind === 'sport'));
  });
  test('sports with nothing to ask (no positions, no sides) get no card', () => {
    const s = personaliseSteps({ uses: ['play'], sports: ['weightlifting'], canAskLocation: false });
    assert.ok(!s.some((x) => x.kind === 'sport'));
    assert.ok(!s.some((x) => x.kind === 'location'), 'no location step where it can\'t be asked');
  });
  test('the sports question fits who\'s answering', () => {
    assert.match(sportsQuestion(['play']), /play/);
    assert.match(sportsQuestion(['parent']), /follow|into/);
  });
});

describe('answers go straight into the profile', () => {
  test('sports are added to the ones already there, never removed', () => {
    assert.deepEqual(mergeSports(['tennis'], ['football', 'tennis']), ['tennis', 'football']);
  });
  test('position and sides are filled in; teams, ratings and handicap are kept', () => {
    const before = { football: { position: 'Goalkeeper', teams: [{ name: 'Lions' }] }, golf: { handicapIndex: 12.4 } } as const;
    const out = mergeSportDetails(before as never, {
      football: { positions: ['Striker', 'Winger'], sides: { foot: 'Left' } },
      cricket: { positions: [], sides: { bat: 'Right-handed' } },
    });
    assert.equal(out.football?.position, 'Striker, Winger');
    assert.deepEqual(out.football?.sides, { foot: 'Left' });
    assert.deepEqual(out.football?.teams, [{ name: 'Lions' }]);
    assert.equal(out.golf?.handicapIndex, 12.4);
    assert.equal(out.cricket?.position, undefined, 'no answer keeps no position');
    assert.deepEqual(out.cricket?.sides, { bat: 'Right-handed' });
  });
  test('an unanswered card keeps what the profile already says', () => {
    const out = mergeSportDetails({ football: { position: 'Goalkeeper', sides: { foot: 'Right' } } } as never,
      { football: { positions: [], sides: {} } });
    assert.equal(out.football?.position, 'Goalkeeper');
    assert.deepEqual(out.football?.sides, { foot: 'Right' });
  });
  test('positions: up to 3, stored as the profile\'s text and read back', () => {
    assert.equal(MAX_POSITIONS, 3);
    assert.equal(joinPositions(['Striker', 'Winger']), 'Striker, Winger');
    assert.deepEqual(splitPositions('Striker, Winger '), ['Striker', 'Winger']);
    assert.deepEqual(splitPositions(undefined), []);
  });
});

describe('never in the way', () => {
  const base = { available: true, signedIn: true, done: false, skipped: false, deepLinked: false };
  test('opens by itself only for a signed-in account that hasn\'t answered or skipped', () => {
    assert.equal(shouldAutoOpen(base), true);
    assert.equal(shouldAutoOpen({ ...base, done: true }), false);
    assert.equal(shouldAutoOpen({ ...base, skipped: true }), false, 'skip is remembered');
    assert.equal(shouldAutoOpen({ ...base, signedIn: false }), false);
    assert.equal(shouldAutoOpen({ ...base, available: false }), false, 'server not updated yet');
  });
  test('not over a match, invite or join link someone opened at the ground', () => {
    assert.equal(shouldAutoOpen({ ...base, deepLinked: true }), false);
  });
  test('until it\'s done, Home offers a small card instead', () => {
    assert.equal(homeCard({ available: true, done: false }), 'finish');
    assert.equal(homeCard({ available: true, done: true }), null);
    assert.equal(homeCard({ available: false, done: false }), null);
  });
});

describe('Near you', () => {
  test('location is rounded to about 1 km before it leaves the phone', () => {
    assert.equal(roundCoord(17.44012345), 17.44);
    assert.equal(roundCoord(-33.8678), -33.87);
  });
  test('view counts show from 25, shortened when big', () => {
    assert.equal(viewsLabel(24), null);
    assert.equal(viewsLabel(undefined), null);
    assert.equal(viewsLabel(25), '25 views');
    assert.equal(viewsLabel(1234), '1.2k views');
    assert.equal(viewsLabel(1000), '1k views');
    assert.equal(viewsLabel(2_500_000), '2.5M views');
  });
  test('headings say what they\'re based on', () => {
    assert.equal(nearHeading({ basis: 'near', section: 'live' }), 'Live near you');
    assert.equal(nearHeading({ basis: 'city', city: 'Hyderabad', section: 'live' }), 'Live in Hyderabad');
    assert.equal(nearHeading({ basis: 'city', city: 'Hyderabad', section: 'soon' }), 'Starting soon in Hyderabad');
    assert.equal(nearHeading({ basis: 'near', section: 'recent' }), 'Just finished near you');
  });
  test('distance only with a real location', () => {
    assert.equal(distanceLabel(0.3, 'near'), 'Under 1 km away');
    assert.equal(distanceLabel(3.24, 'near'), '3.2 km away');
    assert.equal(distanceLabel(27.6, 'near'), '28 km away');
    assert.equal(distanceLabel(12, 'city'), null);
  });
});

describe('position choices for every sport', () => {
  test('every sport has a list (empty where a position means nothing), short and unique', () => {
    for (const sport of Object.keys(SPORT_SIDE_FIELDS)) {
      const list = SPORT_POSITIONS[sport as keyof typeof SPORT_POSITIONS];
      assert.ok(Array.isArray(list), `${sport} has no position list`);
      assert.ok(list.length <= 12, sport);
      assert.equal(new Set(list).size, list.length, `${sport}: duplicate`);
      for (const p of list) assert.ok(p.length > 0 && p.length <= 32 && !p.includes(','), `${sport}: "${p}"`);
    }
  });
  test('the obvious ones are there', () => {
    assert.ok(SPORT_POSITIONS.football.includes('Striker'));
    assert.ok(SPORT_POSITIONS.cricket.includes('Wicket-keeper'));
    assert.ok(SPORT_POSITIONS.basketball.includes('Point guard'));
  });
});

describe('break-it fixes', () => {
  test('PH-10: under-18s, and anyone without a date of birth, are never asked for location', () => {
    const today = new Date('2026-10-31T10:00:00Z');
    assert.equal(locationAllowed('1990-01-01', today), true);
    assert.equal(locationAllowed('2008-10-31', today), true, '18 today');
    assert.equal(locationAllowed('2008-11-01', today), false);
    assert.equal(locationAllowed('2014-05-05', today), false);
    assert.equal(locationAllowed(undefined, today), false);
  });
  test('PH-03: the location goes in the request body, never the address; and these calls keep the read cache', () => {
    const src = readFileSync(new URL('../src/data/personalise.ts', import.meta.url), 'utf8');
    const call = src.slice(src.indexOf("rpc('near_matches'"), src.indexOf("rpc('near_matches'") + 400);
    assert.ok(call.length > 20 && !/get:\s*true/.test(call), 'near_matches must not be a GET');
    const REST = 'https://x.supabase.co/rest/v1';
    assert.equal(isWriteRequest('POST', `${REST}/rpc/near_matches`), false);
    assert.equal(isWriteRequest('POST', `${REST}/rpc/record_match_view`), false);
    assert.equal(isWriteRequest('POST', `${REST}/rpc/save_personalisation`), true, 'real writes still clear it');
  });
  test('PH-11: the location module is only loaded when its native side is there', () => {
    const src = readFileSync(new URL('../src/core/location.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /^import (?!type)[^\n]*from 'expo-location'/m);
    assert.match(src, /requireOptionalNativeModule\('ExpoLocation'\)/);
  });
});
