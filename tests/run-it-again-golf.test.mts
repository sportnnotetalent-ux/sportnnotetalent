/**
 * Run it again — golf (2026-10-27): a golf tournament's rounds come across as
 * the round plan (formats.golf.roundPlan) — each round's course, tees, format,
 * team rule, cut and stats to track, its tee time moved on, and how the groups
 * went off. Players, cards and results stay with last edition. The hub lists
 * the rounds; "Set up round N" opens each one filled in.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  copyFormats, golfGroupsOf, golfRoundsFrom, pendingGolfRounds, planCopy, readGolfRounds, shiftGolfRoundDays,
  GOLF_ROUNDS_KEY, GOLF_ROUND_EDITION_KEYS, type CopySource, type GolfRoundPlan,
} from '../src/data/tournamentCopyPlan.ts';
import type { Tournament } from '../src/core/types.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const champs: Tournament = {
  id: 't-golf-2026', name: 'Inter-School Golf Championship 2026', hostName: 'Hyderabad Golf Club', hostIds: [],
  sports: ['golf'], startDate: '2026-02-14', endDate: '2026-02-15', isOpen: false,
  formats: { golf: { competition: 'stroke', holes: '18', prizeCats: JSON.stringify({ cats: [{ id: 'u15', label: 'Boys U-15' }] }) } } as Tournament['formats'],
};
const r1Format = {
  competition: 'stroke', preset: 'stroke', holes: '18', allowance: 95, netScoring: 'net', net: true, tieBreak: 'countback', prizes: 'both',
  courseId: 'course-hgc', tee: 'Blue', track: ['putts', 'fir'], distUnit: 'm', team: { count: 3, basis: 'gross', mode: 'round' },
  entryTees: { p1: 'Red' }, playoffWinner: 'p1', courseSnap: { holes: [] }, alert: { text: 'x' }, highlights: ['y'],
};
const rounds: NonNullable<CopySource['golf']>['rounds'] = [
  { id: 'r2', roundNo: 2, title: 'Round 2', startsAt: '2026-02-15T01:30:00.000Z', format: { ...r1Format, cut: { type: 'top', n: 40 }, cutAfterRound: 1 } },
  { id: 'r1', roundNo: 1, title: 'Round 1', startsAt: '2026-02-14T01:30:00.000Z', format: r1Format },
];
const tee = (min: number) => new Date(Date.parse('2026-02-14T01:30:00.000Z') + min * 60_000).toISOString();
const entries = [
  ...['p1', 'p2', 'p3', 'p4'].map((id) => ({ eventId: 'r1', groupNo: 1, teeTime: tee(0), id })),
  ...['p5', 'p6', 'p7', 'p8'].map((id) => ({ eventId: 'r1', groupNo: 2, teeTime: tee(10), id })),
  ...['p9', 'p10'].map((id) => ({ eventId: 'r1', groupNo: 3, teeTime: tee(20), id })),
  ...['p1', 'p2', 'p3'].map((id) => ({ eventId: 'r2', groupNo: 1, teeTime: tee(1440) })),
  ...['p4', 'p5', 'p6'].map((id) => ({ eventId: 'r2', groupNo: 2, teeTime: tee(1452) })),
];
const src: CopySource = { tournament: champs, categories: [], phases: [], golf: { rounds, entries } };

describe('the groups', () => {
  test('the largest group and the gap between tee times', () => {
    assert.deepEqual(golfGroupsOf(entries.filter((e) => e.eventId === 'r1')), { groupSize: 4, interval: 10 });
    assert.deepEqual(golfGroupsOf(entries.filter((e) => e.eventId === 'r2')), { groupSize: 3, interval: 12 });
  });
  test('only the set-up screen\'s choices (2–4 ball, 8 / 10 / 12 min); no tee times, no gap', () => {
    assert.deepEqual(golfGroupsOf([{ groupNo: 1 }, { groupNo: 1 }, { groupNo: 1 }, { groupNo: 1 }, { groupNo: 1 }]), {});
    assert.deepEqual(golfGroupsOf([{ groupNo: 1, teeTime: tee(0) }, { groupNo: 2, teeTime: tee(9) }]), {});
    assert.deepEqual(golfGroupsOf([]), {});
  });
});

describe('the round plan', () => {
  const plan = golfRoundsFrom(rounds, entries, 1);
  test('every round in order, a year on, with how its groups went off', () => {
    assert.deepEqual(plan.map((r) => [r.roundNo, r.title, r.startsAt, r.groupSize, r.interval]), [
      [1, 'Round 1', '2027-02-14T01:30:00.000Z', 4, 10],
      [2, 'Round 2', '2027-02-15T01:30:00.000Z', 3, 12],
    ]);
  });
  test('the rules come across; the round\'s own data doesn\'t', () => {
    const f = plan[0].format;
    for (const k of ['courseId', 'tee', 'competition', 'holes', 'allowance', 'netScoring', 'tieBreak', 'prizes', 'team', 'track', 'distUnit']) assert.ok(k in f, k);
    for (const k of GOLF_ROUND_EDITION_KEYS) assert.equal(k in f, false, k);
    assert.deepEqual(plan[1].format.cut, { type: 'top', n: 40 }, 'the cut rule stays');
    assert.equal('cutAfterRound' in plan[1].format, false);
    assert.equal(JSON.stringify(plan).includes('p1'), false, 'no player comes across');
  });
  test('match play isn\'t a round; a replayed round number counts once; rounds never set up last time come along', () => {
    assert.deepEqual(golfRoundsFrom([{ id: 'm', roundNo: 1, title: 'R1', startsAt: '2026-01-01T00:00:00Z', format: { competition: 'match' } }], [], 1), []);
    const twice = golfRoundsFrom([...rounds, { id: 'r1b', roundNo: 1, title: 'Round 1 (replayed)', startsAt: '2026-02-16T01:30:00.000Z', format: r1Format }], [], 1);
    assert.deepEqual(twice.map((r) => r.title), ['Round 1', 'Round 2']);
    const carried: GolfRoundPlan[] = [{ roundNo: 3, title: 'Final round', startsAt: '2026-02-16T01:30:00.000Z', format: { courseId: 'course-hgc' } }];
    const withCarried = golfRoundsFrom(rounds, [], 1, [...carried, { ...carried[0], roundNo: 1, title: 'old round 1' }]);
    assert.deepEqual(withCarried.map((r) => [r.roundNo, r.title, r.startsAt.slice(0, 10)]), [[1, 'Round 1', '2027-02-14'], [2, 'Round 2', '2027-02-15'], [3, 'Final round', '2027-02-16']]);
  });
  test('read back (bad items dropped), pending until set up, moved with other dates', () => {
    const fmt = { [GOLF_ROUNDS_KEY]: JSON.stringify([...plan, { roundNo: 0, title: 'x', startsAt: '', format: {} }, { title: 'no number' }, null]) };
    assert.deepEqual(readGolfRounds(fmt), plan);
    assert.deepEqual(readGolfRounds({ [GOLF_ROUNDS_KEY]: 'not json' }), []);
    assert.deepEqual(readGolfRounds(undefined), []);
    assert.deepEqual(pendingGolfRounds(plan, [{ roundNo: 1 }]).map((r) => r.roundNo), [2]);
    assert.deepEqual(shiftGolfRoundDays(plan, 7).map((r) => r.startsAt), ['2027-02-21T01:30:00.000Z', '2027-02-22T01:30:00.000Z']);
    assert.equal(shiftGolfRoundDays(plan, 0), plan);
  });
});

describe('in the copy', () => {
  const today = '2026-10-27';
  test('the next edition carries the rounds into formats.golf; the tournament\'s golf rules stay', () => {
    const p = planCopy(src, { mode: 'next', own: true, today });
    assert.equal(p.summary.golfRounds, 2);
    assert.equal(p.golfRounds.length, 2);
    const golf = (p.fields.formats as Record<string, Record<string, unknown>>).golf;
    assert.deepEqual(readGolfRounds(golf), p.golfRounds);
    assert.equal(golf.competition, 'stroke');
    assert.ok(typeof golf.prizeCats === 'string', 'divisions are rules');
  });
  test('a copy of someone else\'s carries the rounds too (they\'re set-up, not people)', () => {
    assert.equal(planCopy(src, { mode: 'clone', own: false, today }).summary.golfRounds, 2);
  });
  test('an edition that never set its rounds up passes the plan on; no golf, no rounds', () => {
    const carriedOnly: CopySource = { tournament: { ...champs, formats: { golf: { competition: 'stroke', [GOLF_ROUNDS_KEY]: JSON.stringify(golfRoundsFrom(rounds, entries, 0)) } } as Tournament['formats'] }, categories: [], phases: [] };
    const p = planCopy(carriedOnly, { mode: 'next', own: true, today });
    assert.deepEqual(p.golfRounds.map((r) => r.startsAt.slice(0, 10)), ['2027-02-14', '2027-02-15']);
    assert.equal(planCopy({ ...src, tournament: { ...champs, sports: ['football'] } }, { mode: 'next', own: true, today }).golfRounds.length, 0);
  });
  test('a format copied without a plan loses the old one', () => {
    const out = copyFormats({ golf: { competition: 'stroke', [GOLF_ROUNDS_KEY]: '[]' } } as Tournament['formats'], { records: false });
    assert.equal(GOLF_ROUNDS_KEY in (out as Record<string, Record<string, unknown>>).golf, false);
  });
});

describe('wired through the app', () => {
  test('the copy reads the golf rounds and moves their tee times with other dates', () => {
    const data = read('src/data/tournamentCopy.ts');
    assert.match(data, /tournament\.sports\.includes\('golf'\) \? loadGolfRounds\(tournamentId\)/);
    assert.match(data, /golfRounds: shiftGolfRoundDays\(plan\.golfRounds, shiftDays\)/);
    assert.match(read('src/screens/CopyTournamentScreen.tsx'), /s\.golfRounds \? \[`⛳ \$\{s\.golfRounds\} golf round/);
  });
  test('the hub lists them for the organisers — including a tournament\'s own hosts', () => {
    assert.match(read('src/components/golf/GolfTournamentHub.tsx'), /canOrganize && !loading && <CarriedRounds/);
    assert.match(read('src/screens/SportHubScreen.tsx'), /canOrganize=\{canOrganize\(profile\?\.role\) \|\| \(!!tournament && canManageTournament\(tournament, orgs, me, profile\?\.id\)\)\}/);
  });
  test('setting a round up fills it in from the plan; this year\'s last round wins for later rounds', () => {
    const screen = read('src/screens/GolfRoundSetupScreen.tsx');
    assert.match(screen, /readGolfRounds\(tournament\?\.formats\?\.golf/);
    assert.match(screen, /if \(params\?\.nextOf && !prev\) return;/);
    assert.match(screen, /<CarriedNote title=\{carriedTitle\} who="players" \/>/);
    assert.match(screen, /setCourseId\(\(cur\) => cur \?\? cs\[0\]\.id\)/, 'the course list never overwrites a carried course');
  });
});
