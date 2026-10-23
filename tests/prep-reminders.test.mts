/** Prep reminders on the server (2026-10-23): "📋 Squad needed" for a side's
 *  leaders and "⚠️ No scorer yet" for a match's hosts — the rules notify-upcoming
 *  uses (supabase/functions/_shared/prepReminders.ts). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  PREP_WINDOWS, NO_SQUAD_SPORTS, freshlyDue, prepAllowed, sportHasSquads, isKnownAdult, routeRef, prepRefs, prepTargets,
  type PrepLookups, type PrepMatch, type PrepPlayer, type PrepTeam,
} from '../supabase/functions/_shared/prepReminders.ts';

const NOW = Date.parse('2026-10-23T10:00:00Z');
const MIN = 60_000;
const ADULT = '1990-05-01';
const CHILD = '2012-03-04';
const W1D = PREP_WINDOWS.filter((w) => w.key === '1d');

const player = (id: string, over: Partial<PrepPlayer> = {}): PrepPlayer =>
  ({ id, profileId: `acct-${id}`, fullName: id.toUpperCase(), dob: ADULT, guardianProfileId: null, ...over });
const team = (id: string, over: Partial<PrepTeam> = {}): PrepTeam =>
  ({ id, name: `${id.toUpperCase()} FC`, shortName: id.toUpperCase(), captainId: null, viceCaptainId: null, adminIds: [], staffProfileIds: [], ...over });
const match = (over: Partial<PrepMatch> = {}): PrepMatch => ({
  id: 'm1', sport: 'football', homeTeamId: 'red', awayTeamId: 'blu', tournamentId: null,
  hostIds: [], scorerIds: ['p-scorer'], squadSaved: { home: false, away: false }, ...over,
});
function lookups(o: { teams?: PrepTeam[]; players?: PrepPlayer[]; tours?: PrepLookups['tournaments']; orgMembers?: PrepLookups['orgMembers']; profileDob?: Record<string, string | null> } = {}): PrepLookups {
  const players = o.players ?? [];
  return {
    teams: new Map((o.teams ?? [team('red'), team('blu')]).map((t) => [t.id, t])),
    tournaments: o.tours ?? new Map(),
    orgMembers: o.orgMembers ?? [],
    players: new Map(players.map((p) => [p.id, p])),
    playerByProfile: new Map(players.filter((p) => p.profileId).map((p) => [p.profileId!, p])),
    profileDob: new Map(Object.entries(o.profileDob ?? {})),
  };
}

describe('windows + preference', () => {
  test('a window fires once its time arrives, within the cron slack — no late catch-up', () => {
    const start = NOW + 3 * 60 * MIN; // kickoff in exactly 3 h
    assert.deepEqual(freshlyDue(start, NOW, PREP_WINDOWS, 10 * MIN).map((w) => w.key), ['3h']);
    assert.deepEqual(freshlyDue(start, NOW + 9 * MIN, PREP_WINDOWS, 10 * MIN).map((w) => w.key), ['3h'], 'still in the slack');
    assert.deepEqual(freshlyDue(start, NOW + 11 * MIN, PREP_WINDOWS, 10 * MIN), [], 'slack passed → nothing until 1h');
    assert.deepEqual(freshlyDue(start, NOW - MIN, PREP_WINDOWS, 10 * MIN), [], 'not yet');
    // A match set up 2 h before kickoff: the 1d and 3h windows have long gone.
    assert.deepEqual(freshlyDue(NOW + 120 * MIN, NOW, PREP_WINDOWS, 10 * MIN), []);
    assert.deepEqual(freshlyDue(NOW + 60 * MIN, NOW, PREP_WINDOWS, 10 * MIN).map((w) => w.key), ['1h']);
  });

  test('only the master switch silences them (no prefs row = on)', () => {
    assert.equal(prepAllowed(undefined), true);
    assert.equal(prepAllowed([]), false);
    assert.equal(prepAllowed([15]), true, 'a 15-min-only user still hears about a missing squad a day ahead');
  });
});

describe('who counts as an adult (protect_minors rule)', () => {
  test('18+ by DOB; no DOB = possible minor', () => {
    assert.equal(isKnownAdult(ADULT, NOW), true);
    assert.equal(isKnownAdult(CHILD, NOW), false);
    assert.equal(isKnownAdult(null, NOW), false);
    assert.equal(isKnownAdult('2008-10-23', NOW), true, '18 today');
    assert.equal(isKnownAdult('2008-10-24', NOW), false, '18 tomorrow');
  });
});

describe('squad needed', () => {
  test('captain, vice-captain, team admins and staff of a side with no saved squad', () => {
    const lk = lookups({
      teams: [team('red', { captainId: 'cap', viceCaptainId: 'vc', adminIds: ['adm'], staffProfileIds: ['acct-coach'] }), team('blu')],
      players: [player('cap'), player('vc'), player('adm'), player('coach')],
    });
    const out = prepTargets(match(), W1D, lk, NOW);
    assert.deepEqual(out.map((t) => t.profileId).sort(), ['acct-adm', 'acct-cap', 'acct-coach', 'acct-vc']);
    assert.ok(out.every((t) => t.kind === 'squad' && t.leadKey === '1d' && t.matchId === 'm1'));
    const cap = out.find((t) => t.profileId === 'acct-cap')!;
    assert.equal(cap.title, '📋 Squad needed — RED FC');
    assert.equal(cap.body, 'Set your matchday squad for RED vs BLU — starts tomorrow.');
    assert.equal(cap.playerId, 'cap');
  });

  test('a saved XI (starters) stops it; so does a sport with no squads', () => {
    const lk = lookups({ teams: [team('red', { captainId: 'cap' }), team('blu', { captainId: 'cap2' })], players: [player('cap'), player('cap2')] });
    assert.deepEqual(prepTargets(match({ squadSaved: { home: true, away: false } }), W1D, lk, NOW).map((t) => t.profileId), ['acct-cap2']);
    assert.deepEqual(prepTargets(match({ sport: 'tennis' }), W1D, lk, NOW), []);
    assert.equal(sportHasSquads('cricket'), true);
    assert.equal(sportHasSquads('some_new_team_sport'), true);
  });

  test('one nudge per account: an admin of BOTH sides gets one, naming both teams', () => {
    const lk = lookups({ teams: [team('red', { adminIds: ['pe'] }), team('blu', { adminIds: ['pe'], captainId: 'pe' })], players: [player('pe')] });
    const out = prepTargets(match(), W1D, lk, NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0].title, '📋 Squads needed — RED vs BLU');
    assert.equal(out[0].body, 'Set the matchday squads for RED FC and BLU FC — starts tomorrow.');
  });

  test('every due window is its own nudge (the ledger dedups each)', () => {
    const lk = lookups({ teams: [team('red', { captainId: 'cap' }), team('blu')], players: [player('cap')] });
    assert.deepEqual(prepTargets(match(), PREP_WINDOWS, lk, NOW).map((t) => t.leadKey), ['1d', '3h', '1h']);
    assert.deepEqual(prepTargets(match(), [], lk, NOW), []);
  });
});

describe('no scorer yet', () => {
  const tours = new Map([['t1', { id: 't1', hostIds: ['th'], organizerId: 'acct-org', hostOrgId: 'school' }]]);
  const orgMembers = [
    { orgId: 'school', playerId: 'owner', role: 'Owner', until: null },
    { orgId: 'school', playerId: 'teacher', role: 'Organizer', until: null },
    { orgId: 'school', playerId: 'ex', role: 'Admin', until: '2026-01-01' },
    { orgId: 'school', playerId: 'sc', role: 'Scorer', until: null },
    { orgId: 'other', playerId: 'stranger', role: 'Owner', until: null },
  ];

  test('match hosts + tournament hosts + organiser + the org\'s active Owners/Admins/Organizers', () => {
    const lk = lookups({
      tours, orgMembers,
      players: ['mh', 'th', 'owner', 'teacher', 'ex', 'sc', 'stranger'].map((id) => player(id)),
      profileDob: { 'acct-org': ADULT },
    });
    const out = prepTargets(match({ scorerIds: [], hostIds: ['mh', 'th'], tournamentId: 't1' }), W1D, lk, NOW);
    assert.deepEqual(out.map((t) => t.profileId).sort(), ['acct-mh', 'acct-org', 'acct-owner', 'acct-teacher', 'acct-th']);
    assert.ok(out.every((t) => t.kind === 'host' && t.title === '⚠️ No scorer yet — RED vs BLU'));
    assert.equal(out[0].body, 'This match starts tomorrow and still has no scorer. Tap to assign one.');
  });

  test('a scorer (or co-scorer) assigned → no host nudge', () => {
    const lk = lookups({ players: [player('mh')] });
    assert.deepEqual(prepTargets(match({ scorerIds: ['x'], hostIds: ['mh'] }), W1D, lk, NOW), []);
    assert.equal(prepTargets(match({ scorerIds: [], hostIds: ['mh'] }), W1D, lk, NOW).length, 1);
  });

  test('the organiser is a PROFILE id: their own player row decides, else the account DOB', () => {
    const t = new Map([['t1', { id: 't1', hostIds: [], organizerId: 'acct-o', hostOrgId: null }]]);
    const m = match({ scorerIds: [], tournamentId: 't1' });
    assert.equal(prepTargets(m, W1D, lookups({ tours: t, profileDob: { 'acct-o': ADULT } }), NOW).length, 1, 'no player row, adult account');
    assert.equal(prepTargets(m, W1D, lookups({ tours: t, profileDob: {} }), NOW).length, 0, 'no DOB anywhere → possible minor, no guardian known');
    assert.equal(prepTargets(m, W1D, lookups({ tours: t, players: [player('o', { profileId: 'acct-o' })] }), NOW).length, 1);
  });

  test('one per account even when someone is host three ways', () => {
    const t = new Map([['t1', { id: 't1', hostIds: ['me'], organizerId: 'acct-me', hostOrgId: null }]]);
    const out = prepTargets(match({ scorerIds: [], hostIds: ['me'], tournamentId: 't1' }), W1D, lookups({ tours: t, players: [player('me')] }), NOW);
    assert.deepEqual(out.map((x) => x.profileId), ['acct-me']);
  });
});

describe('children: never pushed directly — their linked guardian instead', () => {
  test('a 14-year-old captain: the guardian hears it, worded about the child', () => {
    const kid = player('kid', { fullName: 'Aarav Rao', dob: CHILD, guardianProfileId: 'acct-mum' });
    const lk = lookups({ teams: [team('red', { captainId: 'kid' }), team('blu')], players: [kid] });
    const out = prepTargets(match(), W1D, lk, NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0].profileId, 'acct-mum');
    assert.notEqual(out[0].profileId, 'acct-kid');
    assert.equal(out[0].playerId, 'kid');
    assert.equal(out[0].title, '📋 Squad needed — RED FC');
    assert.equal(out[0].body, 'Aarav Rao is captain of RED FC, and its matchday squad for RED vs BLU isn\'t set yet — starts tomorrow.');
  });

  test('a child host → guardian copy; no guardian linked → nobody', () => {
    const kid = player('kid', { fullName: 'Aarav Rao', dob: CHILD, guardianProfileId: 'acct-mum' });
    const out = prepTargets(match({ scorerIds: [], hostIds: ['kid'] }), W1D, lookups({ players: [kid] }), NOW);
    assert.deepEqual(out.map((t) => [t.profileId, t.body]), [['acct-mum', 'Aarav Rao hosts this match. It starts tomorrow and still has no scorer.']]);
    const alone = player('kid', { dob: CHILD });
    assert.deepEqual(prepTargets(match({ scorerIds: [], hostIds: ['kid'] }), W1D, lookups({ players: [alone] }), NOW), []);
  });

  test('no DOB on the player or the account counts as a possible minor; the account DOB counts when the player has none', () => {
    const noDob = player('p', { dob: null, guardianProfileId: 'acct-g' });
    assert.deepEqual(routeRef({ playerId: 'p', role: 'host' }, lookups({ players: [noDob] }), NOW), { profileId: 'acct-g', viaGuardian: true, playerId: 'p', childName: 'P' });
    assert.deepEqual(routeRef({ playerId: 'p', role: 'host' }, lookups({ players: [noDob], profileDob: { 'acct-p': ADULT } }), NOW), { profileId: 'acct-p', viaGuardian: false, playerId: 'p' });
  });

  test('an adult who leads a team AND is the guardian of its child captain hears it as their own job', () => {
    const kid = player('kid', { dob: CHILD, guardianProfileId: 'acct-dad' });
    const dad = player('dad', { profileId: 'acct-dad' });
    const lk = lookups({ teams: [team('red', { captainId: 'kid', adminIds: ['dad'] }), team('blu')], players: [kid, dad] });
    const out = prepTargets(match(), W1D, lk, NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0].body, 'Set your matchday squad for RED vs BLU — starts tomorrow.');
  });

  test('unknown player ids and adults with no account reach nobody', () => {
    assert.equal(routeRef({ playerId: 'ghost', role: 'host' }, lookups(), NOW), null);
    assert.equal(routeRef({ playerId: 'typed', role: 'host' }, lookups({ players: [player('typed', { profileId: null })] }), NOW), null);
  });
});

describe('prepRefs (what the cron loads)', () => {
  test('names squad and host people by the right id kind', () => {
    const lk = lookups({ teams: [team('red', { captainId: 'cap', staffProfileIds: ['acct-coach'] }), team('blu')] });
    const r = prepRefs(match({ scorerIds: [], hostIds: ['h'] }), lk);
    assert.deepEqual(r.squad.map((x) => x.playerId ?? x.profileId), ['cap', 'acct-coach']);
    assert.deepEqual(r.host.map((x) => x.playerId), ['h']);
  });
});

describe('drift guards', () => {
  test('NO_SQUAD_SPORTS = every sport whose side is a person or a pair (participantKind individual / both)', () => {
    const nonTeam: string[] = [];
    for (const dir of readdirSync('src/sports', { withFileTypes: true })) {
      const f = `src/sports/${dir.name}/index.tsx`;
      if (!dir.isDirectory() || !existsSync(f)) continue;
      // (Speed Wave 3 moved id / participantKind into each sport's meta.ts)
      const meta = `src/sports/${dir.name}/meta.ts`;
      const src = readFileSync(f, 'utf8') + (existsSync(meta) ? readFileSync(meta, 'utf8') : '');
      const id = src.match(/^\s*id: '([a-z_]+)'/m)?.[1];
      const kind = src.match(/participantKind: '(\w+)'/)?.[1] ?? (src.includes('rallyCore') ? 'both' : 'team');
      if (id && kind !== 'team') nonTeam.push(id);
    }
    assert.deepEqual([...NO_SQUAD_SPORTS].sort(), nonTeam.sort());
  });

  test('the ledger accepts the prep kinds (migration widens reminder_sends.kind)', () => {
    const sql = readFileSync('supabase/migrations/20261023120000_prep_reminder_kinds.sql', 'utf8');
    for (const k of ['player', 'follower', 'scorer', 'squad', 'host']) assert.match(sql, new RegExp(`'${k}'`));
    assert.match(sql, /drop constraint if exists reminder_sends_kind_check/);
  });
});
