/** Run it again / copy a tournament (2026-10-27, migration 20261027140000_tournament_editions):
 *  the next edition keeps the set-up and moves the dates on; a copy of anyone's
 *  tournament keeps the set-up without its branding, contact or records; neither
 *  copies this edition's data; a meet's events come across as its programme. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import {
  addYears, yearsAhead, nextName, copyFormats, programmeFrom, readProgramme, pendingProgramme, programmeEventFor, planCopy, copyProblem,
  editionList, barSettings, shiftProgrammeDays, EDITION_KEYS, PROGRAMME_KEY, type CopySource, type ProgrammeEvent,
} from '../src/data/tournamentCopyPlan.ts';
import { barPlan, entryEvents } from '../src/data/results/index.ts';
import type { Tournament } from '../src/core/types.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dir = join(root, 'supabase', 'migrations');
const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('_tournament_editions'))!), 'utf8');

const meet: Tournament = {
  id: 't-2026', name: 'Greenwood Inter-House Athletics Meet 2026', hostName: 'Greenwood High', hostOrgId: 'org-g', hostIds: [],
  sports: ['athletics', 'football'], startDate: '2026-02-27', endDate: '2026-03-01', structure: 'league_knockout',
  knockoutFormat: { decider: 'penalties' }, participation: 'inter_house', scoring: { mode: 'position', positionPoints: [5, 3, 1] } as Tournament['scoring'],
  registrationDeadline: '2026-02-20T18:30:00.000Z', minTeams: 4, maxTeams: 8, isOpen: true,
  city: 'Bengaluru', grounds: ['Main ground', ' '], timeZone: 'Asia/Kolkata', eventCategory: 'school' as Tournament['eventCategory'],
  about: 'Spikes allowed. Call Mr Rao on 98450 00000.', logoUrl: 'https://x/logo.png', bannerUrl: 'https://x/banner.png',
  organiserPhone: '+919845000000', organiserEmail: 'sports@greenwood.example', ageVerification: 'confirmed', reminderLeadMinutes: [60],
  qualifiesTo: { tournamentId: 't-state', topN: 2, per: 'overall' },
  formats: {
    athletics: { positionPoints: '5,3,1', handTimed: true, records: JSON.stringify([{ scope: 'MR', discipline: 'ath.100m', value: 12.1 }, { scope: 'MR', discipline: 'ath.lj', value: 5.2 }]), meetEntries: '{"v":1,"ticks":{"p1":["ath.100m@U14-M"]}}', rulesSetAt: '2026-02-01T00:00:00Z' },
    football: { playersPerSide: 7, winPoints: 3, tieBreak: 'gd,gf', manualRows: '{"A":[]}', pointsAdj: '[{"teamId":"x","points":-3}]' },
  } as Tournament['formats'],
};

const phase = (sport: string, results: Record<string, unknown>) => ({ sport, format: { results } }) as unknown as CopySource['phases'][number];
const phases: CopySource['phases'] = [
  phase('athletics', { discipline: 'ath.100m', category: { age: 'U14', gender: 'M' }, phase: 'heat', phaseNo: 1, heats: 3, eventKey: 'e1', eventTitle: '100 m U14 Boys',
    plan: [{ phase: 'heat', heats: 3 }, { phase: 'final', heats: 1 }], handTimed: true, sched: { rounds: [{ phaseNo: 1, at: '2026-02-27T04:00:00.000Z', area: 'Track' }, { phaseNo: 2, at: '2026-02-27T10:00:00.000Z', area: 'Track' }] },
    recordsBefore: [{ scope: 'MR' }], fsWarned: [2] }),
  phase('athletics', { discipline: 'ath.100m', category: { age: 'U14', gender: 'M' }, phase: 'final', phaseNo: 2, heats: 1, eventKey: 'e1', eventTitle: '100 m U14 Boys' }),
  phase('athletics', { discipline: 'ath.hj', category: { age: 'U16', gender: 'F' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'e2', eventTitle: 'High jump U16 Girls', bar: [1.1, 1.15, 1.2, 1.25, 1.28, 1.31], noWindGauge: false }),
  phase('athletics', { discipline: 'ath.100m', category: { age: 'U17', gender: 'M' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'e3', eventTitle: 'Pentathlon U17 Boys',
    combined: { key: 'ath.ce_pen', table: 'M', events: ['ath.100m', 'ath.lj'], index: 0, implements: { 'ath.sp': '4 kg' } } }),
  { sport: 'golf', format: { golf: { holes: 18 } } } as unknown as CopySource['phases'][number],
];
const cats = [
  { id: 'c2', tournamentId: 't-2026', label: 'U16 Girls', ageGroup: 'U16', gender: 'girls', sort: 2 },
  { id: 'c1', tournamentId: 't-2026', label: 'U14 Boys', ageGroup: 'U14', gender: 'boys', sort: 1 },
] as CopySource['categories'];
const src: CopySource = { tournament: meet, categories: cats, phases };

describe('dates and names move on', () => {
  test('a year on, 29 Feb falls back to 28 Feb, a time of day is kept', () => {
    assert.equal(addYears('2026-07-14', 1), '2027-07-14');
    assert.equal(addYears('2028-02-29', 1), '2029-02-28');
    assert.equal(addYears('2028-02-29', 4), '2032-02-29');
    assert.equal(addYears('2026-02-20T18:30:00.000Z', 2), '2028-02-20T18:30:00.000Z');
    assert.equal(addYears('not a date', 1), 'not a date');
  });
  test('the next edition moves at least a year, and far enough to start from today', () => {
    assert.equal(yearsAhead('2026-02-27', '2026-10-27', 'next'), 1);
    assert.equal(yearsAhead('2024-02-27', '2026-10-27', 'next'), 3);
    assert.equal(yearsAhead('2026-12-01', '2026-10-27', 'clone'), 0, 'an upcoming tournament copies on its own dates');
    assert.equal(yearsAhead('2025-11-01', '2026-10-27', 'clone'), 1);
  });
  test('names: the year, a season, or the new year added', () => {
    assert.equal(nextName('Inter-School Meet 2026', 1, 2027, 'next'), 'Inter-School Meet 2027');
    assert.equal(nextName('Winter League 2025-26', 1, 2026, 'next'), 'Winter League 2026-27');
    assert.equal(nextName('Winter League 2025–2026', 2, 2027, 'next'), 'Winter League 2027–2028');
    assert.equal(nextName('Annual  Sports Day', 1, 2027, 'next'), 'Annual Sports Day 2027');
    assert.equal(nextName('Annual Sports Day', 1, 2027, 'clone'), 'Annual Sports Day', 'a copy never invents a year');
    assert.equal(nextName('U-19 Cup 2026', 0, 2026, 'clone'), 'U-19 Cup 2026');
  });
});

describe('formats: rules come across, this edition\'s data doesn\'t', () => {
  test('edition keys are dropped, rules kept, records only for the next edition', () => {
    const next = copyFormats(meet.formats, { records: true }) as Record<string, Record<string, unknown>>;
    for (const k of EDITION_KEYS) for (const f of Object.values(next)) assert.equal(f[k], undefined, k);
    assert.equal(next.football.tieBreak, 'gd,gf');
    assert.equal(next.football.playersPerSide, 7);
    assert.equal(next.athletics.handTimed, true);
    assert.ok(String(next.athletics.records).includes('ath.lj'), 'meet records stand until broken');
    const clone = copyFormats(meet.formats, { records: false }) as Record<string, Record<string, unknown>>;
    assert.equal(clone.athletics.records, undefined);
    assert.equal((meet.formats as Record<string, Record<string, unknown>>).football.manualRows, '{"A":[]}', 'the source is never changed');
  });
  test('Swiss keeps only the bye limit; prize categories lose the hand edits', () => {
    const f = copyFormats({ chess: { swissOps: JSON.stringify({ v: 1, withdrawn: { p1: 3 }, hpbLimit: 1 }), prizeCats: JSON.stringify({ v: 1, cats: [{ id: 'u12', label: 'U12', under: 12 }], add: { u12: ['p9'] }, drop: { u12: ['p2'] }, places: 3 }) } } as Tournament['formats'], { records: false }) as Record<string, Record<string, unknown>>;
    assert.deepEqual(JSON.parse(String(f.chess.swissOps)), { v: 1, hpbLimit: 1 });
    const prize = JSON.parse(String(f.chess.prizeCats));
    assert.equal(prize.add, undefined); assert.equal(prize.drop, undefined);
    assert.equal(prize.places, 3); assert.equal(prize.cats.length, 1);
    const none = copyFormats({ chess: { swissOps: JSON.stringify({ v: 1, withdrawn: { p1: 3 } }), prizeCats: '' } } as Tournament['formats'], { records: false }) as Record<string, Record<string, unknown>>;
    assert.equal(none.chess.swissOps, undefined); assert.equal(none.chess.prizeCats, undefined);
  });
});

describe('a meet\'s events become its programme', () => {
  const prog = programmeFrom(phases, 1);
  test('one item per event (its first round), golf rounds left out', () => {
    assert.deepEqual(Object.keys(prog), ['athletics']);
    assert.equal(prog.athletics!.length, 3);
    const e1 = prog.athletics!.find((e) => e.title === '100 m U14 Boys')!;
    assert.deepEqual(e1.rounds, ['heat', 'final']);
    assert.deepEqual(e1.settings, { handTimed: true });
    assert.equal(e1.sched!.rounds[0].at, '2027-02-27T04:00:00.000Z', 'the slot moves with the dates');
    assert.equal(e1.sched!.rounds[0].area, 'Track');
    assert.equal(JSON.stringify(e1).includes('recordsBefore') || JSON.stringify(e1).includes('fsWarned'), false, 'no results-time data');
  });
  test('a combined event keeps its own discipline and events; a vertical jump its bar', () => {
    const ce = prog.athletics!.find((e) => e.mode === 'combined')!;
    assert.equal(ce.discipline, 'ath.ce_pen');
    assert.deepEqual(ce.combined, { table: 'M', events: ['ath.100m', 'ath.lj'], implements: { 'ath.sp': '4 kg' } });
    const hj = prog.athletics!.find((e) => e.discipline === 'ath.hj')!;
    assert.deepEqual(hj.settings, { bar: [1.1, 1.15, 1.2, 1.25, 1.28, 1.31] });
  });
  test('events carried last time and never set up come along once', () => {
    const carried: Partial<Record<string, ProgrammeEvent[]>> = { athletics: [
      { sport: 'athletics', discipline: 'ath.100m', category: { age: 'U14', gender: 'M' }, title: '100 m U14 Boys' },
      { sport: 'athletics', discipline: 'ath.lj', category: { age: 'U14', gender: 'F' }, title: 'Long jump U14 Girls', sched: { rounds: [{ phaseNo: 1, at: '2026-02-28T05:00:00.000Z' }] } },
    ] };
    const out = programmeFrom(phases, 1, carried).athletics!;
    assert.equal(out.length, 4);
    assert.equal(out.find((e) => e.discipline === 'ath.lj')!.sched!.rounds[0].at, '2027-02-28T05:00:00.000Z');
  });
  test('read back, pending until set up, found by the set-up screen', () => {
    const fmt = { [PROGRAMME_KEY]: JSON.stringify(prog.athletics!.map(({ sport: _s, ...e }) => e)) };
    const list = readProgramme(fmt, 'athletics');
    assert.equal(list.length, 3);
    assert.ok(list.every((e) => e.sport === 'athletics'));
    assert.deepEqual(readProgramme({ [PROGRAMME_KEY]: '{broken' }, 'athletics'), []);
    assert.deepEqual(readProgramme({ [PROGRAMME_KEY]: JSON.stringify([{ title: 'no discipline' }, null]) }, 'athletics'), []);
    const pending = pendingProgramme(list, [{ discipline: 'ath.100m', category: { age: 'U14', gender: 'M' } }]);
    assert.equal(pending.length, 2);
    assert.equal(programmeEventFor(list, 'ath.hj', { age: 'U16', gender: 'F' })?.title, 'High jump U16 Girls');
    assert.equal(programmeEventFor(list, 'ath.hj', { age: 'U14', gender: 'F' }), undefined);
  });
  test('the entries desk shows a carried event as a column before its start list', () => {
    const cols = entryEvents('shooting', [], { age: 'U16', gender: 'F' }, [{ discipline: 'sh.10ar', category: { age: 'U16', gender: 'F' }, title: '10 m Air Rifle U16 Girls' }]);
    assert.equal(cols.length, 1);
    assert.equal(cols[0].label, '10 m Air Rifle U16 Girls');
    assert.equal(entryEvents('shooting', [], { age: 'U14', gender: 'F' }, [{ discipline: 'sh.10ar', category: { age: 'U16', gender: 'F' }, title: 'x' }]).length, 0);
  });
  test('bar heights round-trip into the set-up screen\'s settings', () => {
    const bar = [1.1, 1.15, 1.2, 1.25, 1.28, 1.31];
    const b = barSettings(bar);
    assert.deepEqual(b, { start: 1.1, step: 0.05, changeAt: 1.25, step2: 0.03 });
    assert.deepEqual(barPlan(b.start, b.step, b.changeAt, b.step2, bar.length), bar);
    assert.deepEqual(barSettings([2, 2.2, 2.4]), { start: 2, step: 0.2, changeAt: 2.4, step2: 0.2 });
  });
  test('other dates than the plan\'s move the slots too', () => {
    const moved = shiftProgrammeDays(prog, -2).athletics!.find((e) => e.title === '100 m U14 Boys')!;
    assert.equal(moved.sched!.rounds[1].at, '2027-02-25T10:00:00.000Z');
    assert.equal(shiftProgrammeDays(prog, 0), prog);
  });
});

describe('the plan', () => {
  const today = '2026-10-27';
  test('next edition: everything set-up, a year on, linked records and branding', () => {
    const p = planCopy(src, { mode: 'next', own: true, today });
    assert.equal(p.name, 'Greenwood Inter-House Athletics Meet 2027');
    assert.equal(p.startDate, '2027-02-27'); assert.equal(p.endDate, '2027-03-01');
    assert.equal(p.fields.registrationDeadline, '2027-02-20T18:30:00.000Z');
    assert.equal(p.fields.minTeams, 4); assert.equal(p.fields.maxTeams, 8);
    assert.deepEqual(p.fields.grounds, ['Main ground'], 'blank venues dropped');
    assert.equal(p.fields.logoUrl, meet.logoUrl); assert.equal(p.fields.organiserPhone, meet.organiserPhone);
    assert.equal(p.fields.about, meet.about);
    assert.equal(p.ageVerification, 'confirmed');
    assert.deepEqual(p.categories, [
      { label: 'U14 Boys', ageGroup: 'U14', gender: 'boys', sort: 0 },
      { label: 'U16 Girls', ageGroup: 'U16', gender: 'girls', sort: 1 },
    ]);
    assert.equal(p.summary.records, 2); assert.equal(p.summary.events, 3); assert.equal(p.summary.venues, 1);
    assert.ok(readProgramme((p.fields.formats as Record<string, Record<string, unknown>>).athletics, 'athletics').length === 3);
    for (const k of ['isOpen', 'qualifiesTo', 'hostOrgId', 'hostIds', 'id', 'deletedAt'] as const) assert.equal((p.fields as Record<string, unknown>)[k], undefined, k);
  });
  test('a copy of someone else\'s: no branding, contact, records or About unless asked; they name it', () => {
    const p = planCopy(src, { mode: 'clone', own: false, today });
    assert.equal(p.name, '');
    assert.equal(p.fields.logoUrl, undefined); assert.equal(p.fields.bannerUrl, undefined);
    assert.equal(p.fields.organiserPhone, undefined); assert.equal(p.fields.organiserEmail, undefined);
    assert.equal(p.fields.about, undefined);
    assert.equal((p.fields.formats as Record<string, Record<string, unknown>>).athletics.records, undefined);
    assert.equal(p.summary.records, 0);
    assert.deepEqual(p.fields.grounds, ['Main ground']);
    assert.equal(p.summary.events, 3, 'the events come across for anyone');
    assert.equal(planCopy(src, { mode: 'clone', own: false, withAbout: true, today }).fields.about, meet.about);
  });
  test('a copy of your own keeps your branding and names itself a copy when the dates don\'t move', () => {
    const upcoming = { ...src, tournament: { ...meet, startDate: '2026-12-01', endDate: '2026-12-02', name: 'Winter Cup' } };
    const p = planCopy(upcoming, { mode: 'clone', own: true, today });
    assert.equal(p.name, 'Winter Cup (copy)');
    assert.equal(p.startDate, '2026-12-01');
    assert.equal(p.fields.logoUrl, meet.logoUrl);
  });
  test('the dates and name are checked', () => {
    assert.equal(copyProblem({ name: ' ', startDate: '2027-01-01', endDate: '2027-01-02', mode: 'clone' }), 'Give the tournament a name.');
    assert.match(copyProblem({ name: 'X', startDate: '2027-01-03', endDate: '2027-01-02', mode: 'clone' })!, /end date/);
    assert.match(copyProblem({ name: 'X', startDate: '2026-02-27', endDate: '2026-03-01', mode: 'next', previousStart: '2026-02-27' })!, /start after/);
    assert.equal(copyProblem({ name: 'X', startDate: '2027-02-27', endDate: '2027-03-01', mode: 'next', previousStart: '2026-02-27' }), null);
  });
});

describe('editions', () => {
  test('oldest first, by year — month and year when two share one; deleted left out', () => {
    const list = editionList([
      { id: 'b', name: 'Meet 2026', startDate: '2026-02-27' },
      { id: 'a', name: 'Meet 2025', startDate: '2025-02-20' },
      { id: 'c', name: 'Autumn meet 2026', startDate: '2026-10-05' },
      { id: 'd', name: 'Deleted', startDate: '2024-02-01', deletedAt: '2024-03-01' },
    ]);
    assert.deepEqual(list.map((e) => [e.id, e.label]), [['a', '2025'], ['b', 'Feb 2026'], ['c', 'Oct 2026']]);
  });
});

describe('wired through the app and the database', () => {
  test('the migration links editions only for the earlier edition\'s organisers, forward in time, at creation', () => {
    assert.match(sql, /add column if not exists previous_edition_id uuid references tournaments\(id\) on delete set null/);
    assert.match(sql, /add column if not exists first_edition_id uuid/);
    assert.match(sql, /can_manage_tournament\(prev\.id\)/);
    assert.match(sql, /new\.start_date <= prev\.start_date/);
    assert.match(sql, /new\.first_edition_id := coalesce\(prev\.first_edition_id, prev\.id\)/);
    assert.match(sql, /tg_op = 'UPDATE'[\s\S]*is_client_request\(\)[\s\S]*raise exception/);
    assert.match(sql, /before insert or update on tournaments/);
  });
  test('creating degrades before the migration; the copy opens no registration; invites notify captains', () => {
    const repos = read('src/data/repos.ts');
    assert.match(repos, /withEdition && input\.previousEditionId \? \{ previous_edition_id: input\.previousEditionId \}/);
    assert.match(repos, /isMissingSchema\(error\)\) \{\s*\(\{ data, error \} = await insertRow\(false\)\)/);
    const copy = read('src/data/tournamentCopy.ts');
    assert.match(copy, /isOpen: false/);
    assert.match(copy, /addTournamentTeams\(tournamentId, ids, 'invited'/);
    assert.match(copy, /notify\(\{ title: `📨 You're invited/);
  });
  test('the screens: Manage › Run it again / Copy this setup, the editions card, the hub list', () => {
    const nav = read('src/navigation/RootNavigator.tsx');
    assert.match(nav, /name="CopyTournament"/);
    assert.match(nav, /'CopyTournament', 'CreateTournament'/);
    const page = read('src/screens/TournamentProfileScreen.tsx');
    assert.match(page, /title="Run it again"/);
    assert.match(page, /title="Copy this setup"/);
    assert.match(page, /<EditionsCard/);
    assert.match(page, /<RunAgainFooter/);
    const screen = read('src/screens/CopyTournamentScreen.tsx');
    assert.match(screen, /params\.mode === 'next' && own \? 'next' : 'clone'/, 'only organisers run a tournament again');
    assert.match(read('src/components/athletics/AthleticsHub.tsx'), /<CarriedProgramme/);
    assert.match(read('src/screens/AthleticsEventSetupScreen.tsx'), /preset=\{carried\?\.discipline === discipline \? carried\.sched : undefined\}/);
  });
});

describe('the guide', () => {
  test('guide tables render as tables (run-it-again and the verification guides), never as raw pipes', () => {
    execFileSync(process.execPath, [join(root, 'scripts', 'build-website.mjs')], { cwd: root, stdio: 'pipe' });
    for (const g of ['run-it-again', 'verify-your-school', 'verify-your-organisation']) {
      const html = read(`website/dist/guides/${g}/index.html`);
      assert.match(html, /<div class="table-wrap"><table>\n<thead><tr><th scope="col">/, g);
      assert.doesNotMatch(html, /<p>\|/, `${g} has no raw table text`);
    }
    assert.match(read('website/dist/guides/run-it-again/index.html'), /<td>Only if you tap <strong>＋ Also copy the About &amp; rules text<\/strong><\/td>/);
  });
});
