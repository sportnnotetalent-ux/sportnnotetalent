/** Run it again, part 2 (2026-10-27): "Set up ›" on a carried event opens every
 *  event sport's setup as last edition left it — shooting, archery, rowing /
 *  canoe, cycling, weightlifting, road / cross-country and combined events
 *  (athletics track / field and swimming were part 1). Each event's format
 *  goes through programmeFrom (what the copy stores) and back through the
 *  screen's seed, and must come out as the same choices. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { programmeFrom, programmeSlot, type ProgrammeEvent } from '../src/data/tournamentCopyPlan.ts';
import { shootingSeed, archerySeed, crewSeed, cyclingSeed, liftingSeed, roadSeed, combinedSeed } from '../src/data/carriedSetup.ts';
import { slotKey } from '../src/data/results/index.ts';

const root = join(import.meta.dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** One event as the copy stores it: its first round's format through programmeFrom. */
const carry = (sport: string, results: Record<string, unknown>): ProgrammeEvent => {
  const prog = programmeFrom([{ sport, format: { results: { phase: 'final', phaseNo: 1, heats: 1, eventKey: 'k', ...results } } } as never], 1);
  const e = prog[sport]?.[0];
  assert.ok(e, `${sport} carried`);
  return e!;
};
const qualThenFinal = (fillTo: number) => ({ phase: 'qualification', plan: [{ phase: 'qualification', heats: 1, progression: { fillTo } }, { phase: 'final', heats: 1 }] });

describe('shooting', () => {
  test('the event, age, gender, match length, scoring and last time\'s final of 6', () => {
    const e = carry('shooting', { discipline: 'shoot.10mar', category: { age: 'School', gender: 'F', shots: 40 }, eventTitle: '10 m Air Rifle School Girls · 40 shots', shootEntry: 'shot', shootFinal: true, ...qualThenFinal(6) });
    assert.equal(e.fieldSize, 6);
    assert.deepEqual(shootingSeed(e), { evKey: 'shoot.10mar', of3: false, age: 'School', gender: 'F', shots: 40, mode: 'shot', finalists: 6 });
  });
  test('no final last time → none again; a team of 3 → the individual event with "team of 3"; a mixed team keeps its medal matches', () => {
    assert.equal(shootingSeed(carry('shooting', { discipline: 'shoot.10map', category: { age: 'Junior', gender: 'M' } }))?.finalists, 0);
    const t3 = shootingSeed(carry('shooting', { discipline: 'shoot.10mar.team', category: { age: 'Junior', gender: 'M' } }))!;
    assert.equal(t3.evKey, 'shoot.10mar'); assert.equal(t3.of3, true); assert.equal(t3.finalists, undefined);
    assert.deepEqual(shootingSeed(carry('shooting', { discipline: 'shoot.10marx', category: { age: 'Junior', gender: 'X' }, shootMatch: true, ...qualThenFinal(4) }))?.matches, true);
    assert.equal(shootingSeed(carry('shooting', { discipline: 'arch.r70' })), null);
  });
});

describe('archery', () => {
  test('bow, round, indoor, age, gender and the bracket of 16; a ranking round only → no matches', () => {
    const e = carry('archery', { discipline: 'arch.r30', category: { age: 'School', gender: 'F' }, ...qualThenFinal(16) });
    assert.deepEqual(archerySeed(e), { bow: 'R', indoor: false, roundKey: 'arch.r30', mode: 'ind', age: 'School', gender: 'F', bracket: 16 });
    assert.equal(archerySeed(carry('archery', { discipline: 'arch.c50', category: { age: 'U18', gender: 'M' } }))?.bracket, 0);
  });
  test('team and mixed-team events come back as their round + mode', () => {
    const t = archerySeed(carry('archery', { discipline: 'arch.r70.team', category: { age: 'Senior', gender: 'M' } }))!;
    assert.equal(t.roundKey, 'arch.r70'); assert.equal(t.mode, 'team');
    assert.equal(archerySeed(carry('archery', { discipline: 'arch.r70.mixed', category: { age: 'Senior', gender: 'X' } }))?.mode, 'mixed');
  });
});

describe('rowing and canoe', () => {
  test('boat, distance, category, lightweight class, the venue\'s lanes and splits', () => {
    const e = carry('rowing', { discipline: 'row.1x.1000', category: { age: 'Junior', gender: 'F', weightClass: 'Lightweight' }, lanes: 6, splits: true });
    assert.deepEqual(crewSeed(e), { boat: '1x', distance: 1000, age: 'Junior', gender: 'F', cls: 'Lightweight', lanes: 6, splits: true });
    assert.deepEqual(crewSeed(carry('canoe', { discipline: 'cs.k2.500', category: { age: 'U16', gender: 'M' } })), { boat: 'k2', distance: 500, age: 'U16', gender: 'M', cls: 'Open' });
  });
});

describe('cycling', () => {
  test('a 10 km time trial with its start gap; a points race with its laps and sprints', () => {
    const itt = cyclingSeed(carry('cycling', { discipline: 'cyc.itt.10', category: { age: 'U16', gender: 'F' }, cyc: { interval: 30 } }))!;
    assert.equal(itt.setting, 'road'); assert.equal(itt.kind, 'itt'); assert.equal(itt.dist.itt, 10); assert.equal(itt.interval, 30);
    const pts = cyclingSeed(carry('cycling', { discipline: 'cyc.points', category: { age: 'Junior', gender: 'M' }, cyc: { laps: 30, sprintEvery: 5 } }))!;
    assert.deepEqual([pts.setting, pts.kind, pts.laps, pts.every], ['track', 'points', '30', '5']);
    const stage = cyclingSeed(carry('cycling', { discipline: 'cyc.stage', cyc: { stages: ['road', 'road', 'itt'], interval: 60, km: 42 } }))!;
    assert.deepEqual(stage.stages, ['road', 'road', 'itt']); assert.equal(stage.km, '42');
    assert.equal(cyclingSeed(carry('cycling', { discipline: 'cyc.ip.3000' }))?.dist.ip, 3000);
  });
});

describe('weightlifting, road / cross-country, combined events', () => {
  test('a bodyweight category', () => {
    assert.deepEqual(liftingSeed(carry('weightlifting', { discipline: 'wl.total', category: { age: 'Youth', gender: 'F', weightClass: '49 kg' } })), { age: 'Youth', gender: 'F', cls: '49 kg' });
  });
  test('a cross-country race with its team scoring; an odd distance comes back as "other distance"; a track walk', () => {
    const xc = roadSeed(carry('athletics', { discipline: 'ath.xc.4000', category: { age: 'U16', gender: 'F' }, road: { kind: 'xc', team: { scorers: 3, size: 5, basis: 'teams', points: true } } }))!;
    assert.deepEqual([xc.kind, xc.metres, xc.custom, xc.team], ['xc', 4000, '', { on: true, scorers: 3, size: 5, basis: 'teams', points: true }]);
    assert.equal(roadSeed(carry('athletics', { discipline: 'ath.xc.2500', road: { kind: 'xc' } }))?.custom, '2.5');
    const walk = roadSeed(carry('athletics', { discipline: 'ath.walk.t3000', road: { kind: 'walk', penaltyZone: true } }))!;
    assert.deepEqual([walk.trackWalk, walk.penaltyZone, walk.team.on], [true, true, false]);
    const half = roadSeed(carry('athletics', { discipline: 'ath.road.hm', road: { kind: 'road', certified: true, timing: 'chip' } }))!;
    assert.deepEqual([half.certified, half.timing, half.custom], [true, 'chip', '']);
  });
  test('a preset combined event and a house list keep their events, day 2 and implements', () => {
    const pen = combinedSeed(carry('athletics', { discipline: 'ath.100m', category: { age: 'U16', gender: 'F' }, handTimed: true,
      combined: { key: 'ath.ce_pen', table: 'F', events: ['ath.100mh', 'ath.hj', 'ath.sp', 'ath.lj', 'ath.800m'], index: 0, implements: { 'ath.sp': '3 kg' } } }))!;
    assert.deepEqual([pen.kind, pen.gender, pen.age, pen.events.length, pen.implements['ath.sp'], pen.handTimed], ['pen', 'F', 'U16', 5, '3 kg', true]);
    const house = combinedSeed(carry('athletics', { discipline: 'ath.100m', category: { age: 'U14', gender: 'M' },
      combined: { key: 'ath.ce_x_100m_lj_sp', table: 'M', events: ['ath.100m', 'ath.lj', 'ath.sp'], day2: 2, index: 0 } }))!;
    assert.deepEqual([house.kind, house.day2, house.events], ['x', 2, ['ath.100m', 'ath.lj', 'ath.sp']]);
  });
});

describe('the slot ties the hub, the entries desk and the setup together', () => {
  test('programmeSlot is the entries desk\'s slot key', () => {
    const e: ProgrammeEvent = { sport: 'shooting', discipline: 'shoot.10mar', category: { age: 'School', gender: 'F', shots: 40 }, title: 'x' };
    assert.equal(programmeSlot(e), slotKey(e.discipline, e.category));
  });
  test('every setup starts from its seed, keeps last time\'s timetable slot, and doesn\'t reset it on opening', () => {
    const screens: [string, string][] = [
      ['ShootingEventSetup', 'shootingSeed'], ['ArcheryEventSetup', 'archerySeed'], ['CrewEventSetup', 'crewSeed'], ['CyclingEventSetup', 'cyclingSeed'],
      ['WeightliftingEventSetup', 'liftingSeed'], ['RoadEventSetup', 'roadSeed'], ['CombinedEventSetup', 'combinedSeed'],
    ];
    for (const [file, fn] of screens) {
      const src = read(`src/screens/${file}.tsx`);
      assert.match(src, new RegExp(`const \\[seed\\] = useState\\(\\(\\) => \\(carried \\? ${fn}\\(carried\\) : null\\)\\)`), file);
      assert.match(src, /useTournamentById\(tournamentId\) \?\? preloaded \?\? null/, file);
      assert.match(src, /preset=\{seed(ed)? \? carried\?\.sched : undefined\}/, file);
      assert.match(src, /<CarriedNote title=/, file);
    }
    // the effects that reset a choice on opening skip that first run when pre-filled
    assert.match(read('src/screens/ShootingEventSetup.tsx'), /useEffectAfterSeed\(!!seed, \(\) => \{ setShots\(defaultShots/);
    assert.match(read('src/screens/ArcheryEventSetup.tsx'), /useEffectAfterSeed\(!!seed, \(\) => \{ setRoundKey/);
    assert.match(read('src/screens/CyclingEventSetup.tsx'), /useEffectAfterSeed\(!!seed, \(\) => \{ setKind/);
    assert.equal((read('src/screens/RoadEventSetup.tsx').match(/useEffectAfterSeed\(seeded,/g) ?? []).length, 4);
    assert.equal((read('src/screens/CombinedEventSetup.tsx').match(/useEffectAfterSeed\(!!seed,/g) ?? []).length, 2);
  });
  test('the hub and the entries desk open the setup on the exact event; the dispatcher waits for it', () => {
    assert.match(read('src/components/athletics/AthleticsHub.tsx'), /slot: programmeSlot\(e\)/);
    assert.match(read('src/screens/MeetEntriesScreen.tsx'), /slot: ev\.slot/);
    const disp = read('src/screens/AthleticsEventSetupScreen.tsx');
    assert.match(disp, /useCarriedEvent\(params\?\.tournamentId, params\?\.sport \?\? 'athletics', ownSetup \? params\?\.slot : undefined\)/);
    assert.match(disp, /if \(pre\.loading\) return <LoadingState \/>/);
    assert.equal((disp.match(/\{\.\.\.seed\} \/>/g) ?? []).length, 7);
  });
});
