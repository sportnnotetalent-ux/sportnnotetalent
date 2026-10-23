/**
 * Timed races round 2 (athletics, swimming, rowing, canoe sprint, cycling) —
 * the founder's answers to the deep wave's open questions:
 *  1. the heats of a TIMED FINAL count as heats won;
 *  2. athletics lap times at the finish-line passes (default) OR every 400 m
 *     from the start (Diamond League style), an organiser choice — each result
 *     keeps the points it was read at;
 *  3. followers hear about heat wins and PBs (format.highlights → the
 *     notify-followers function), respecting each follow's alert choices;
 *  4. "Records set" on profiles: record-book entries carry the holder's id,
 *     a final's broken records go on the holders' lines (mrSet / srSet);
 *  5. "Stats to track" meet-wide AND per event (PhaseFormat.track).
 * Old results (no lapsFrom, no holder ids, no overrides) read exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  disciplineOf, rankEntries, rankByHeat, categoryKey, groupMeet, deriveRecordBook, updateRecords,
  heatWinnerIds, isTimedFinalRows, phaseLines, crewLines,
  athLapDistances, athSplitDistances, lapPointsDiffer, lapPointsOf, lapPointsLabel, LAP_POINT_CHOICES,
  splitDistancesFor, entryLapPoints, entrySplitDistances, resultWithSplits, splitPoints, splitPlacesFor, splitPlaces, winnerSplitStory, fastestFinish, heatAnalysis,
  raceTracking, trackOptions, setTrackOverride, trackDefaults, trackEffective, reactionOffered, splitsOffered, takeoversOffered, chipOffered, TRACK_KEYS,
  recordHolderIds, recordPlayerIds, newRecordsSet, withRecordKeys, recordsSetText, athleticsCareer, crewCareer, cyclingCareer,
  raceHighlights, goldPbIds,
  type DisciplineDef, type EntryResult, type ResultEntry, type RankedEntry, type RecordMark, type PhaseInfo, type MeetPhase, type ResultFlag,
} from '../src/data/results/index.ts';
import { finalAlert } from '../src/data/results/alerts.ts';
import { parseAlert, alertText } from '../supabase/functions/_shared/resultAlert.ts';
import { parseHighlights, itemsFor, highlightText, highlightTargets, highlightPhrase, type Prefs } from '../supabase/functions/_shared/resultHighlights.ts';
import { ALERTS } from '../src/data/followPrefs.ts';
import { STAT_SCHEMAS, statDef } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const run = (id: string, name: string, result: EntryResult, heat = 1, athleteId: string | undefined = `p_${id}`): ResultEntry => ({ id, athleteId, name, heat, result });
const P = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/* ------------------------- 1. heats of a timed final ------------------------- */

describe('1 · heats won — a timed final\'s heats count', () => {
  const M100 = D('ath.100m');
  // a 100 m timed final in 2 heats: heat 2 the fast one
  const tf = rankEntries([
    run('a', 'A', { mark: 12.9 }, 1), run('b', 'B', { mark: 13.1 }, 1), run('c', 'C', { mark: 12.9 }, 1),
    run('d', 'D', { mark: 12.2 }, 2), run('e', 'E', { mark: 12.5 }, 2), run('f', 'F', { status: 'DNS' }, 2),
  ], M100);
  test('each heat\'s fastest wins it (equal marks share); the overall winner won theirs too', () => {
    assert.ok(isTimedFinalRows({ phase: 'final' }, tf));
    assert.deepEqual([...heatWinnerIds({ phase: 'final' }, tf)].sort(), ['a', 'c', 'd']);
  });
  test('a heat round: first in each heat; a single final / lettered finals: nobody', () => {
    const byHeat = [...rankByHeat(tf.map((r) => r.entry), M100).values()].flat();
    assert.deepEqual([...heatWinnerIds({ phase: 'heat' }, byHeat)].sort(), ['a', 'c', 'd']);
    const single = rankEntries([run('x', 'X', { mark: 12 }), run('y', 'Y', { mark: 12.4 })], M100);
    assert.equal(heatWinnerIds({ phase: 'final' }, single).size, 0);
    assert.equal(heatWinnerIds({ phase: 'final', races: ['A', 'B'] }, tf).size, 0);
    const X1 = D('row.1x.2000');
    const lettered = rankEntries([run('a', 'A', { mark: 420, race: 'A' }, 1), run('b', 'B', { mark: 410, race: 'B' }, 2)], X1);
    assert.ok(!isTimedFinalRows({ phase: 'final' }, lettered));
    assert.equal(heatWinnerIds({ phase: 'final' }, lettered).size, 0);
  });
  test('phaseLines / crewLines write heatWins for a timed final\'s heat winners only', () => {
    const lines = phaseLines({ discipline: 'ath.100m', phase: 'final' }, tf);
    const won = (id: string) => lines.find((l) => l.playerId === `p_${id}`)?.stats.heatWins;
    assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map(won), [1, undefined, 1, 1, undefined]);
    const X1 = D('row.1x.2000');
    const crews = crewLines({ discipline: 'row.1x.2000', phase: 'final' }, rankEntries([run('a', 'A', { mark: 430 }, 1), run('b', 'B', { mark: 440 }, 1), run('c', 'C', { mark: 420 }, 2)], X1));
    assert.deepEqual(crews.filter((l) => l.stats.heatWins === 1).map((l) => l.playerId).sort(), ['p_a', 'p_c']);
  });
});

/* ------------------------------- 2. lap points ------------------------------- */

describe('2 · lap points — finish-line passes or every 400 m from the start', () => {
  const M1500 = D('ath.1500m');
  test('the two choices; they differ only for 1000 m, 1500 m and 3000 m', () => {
    assert.deepEqual(athLapDistances('ath.1500m'), [300, 700, 1100]);
    assert.deepEqual(athLapDistances('ath.1500m', 'start'), [400, 800, 1200]);
    assert.deepEqual(athLapDistances('ath.1000m', 'start'), [400, 800]);
    assert.deepEqual(athLapDistances('ath.3000m', 'start'), [400, 800, 1200, 1600, 2000, 2400, 2800]);
    assert.deepEqual(athLapDistances('ath.800m', 'start'), [400]); // the bell is 400 m from the start
    assert.deepEqual(athLapDistances('ath.400m', 'start'), athSplitDistances('ath.400m'));
    assert.deepEqual(athLapDistances('ath.4x400', 'start'), [400, 800, 1200]); // relays: the changeovers
    assert.deepEqual(['ath.800m', 'ath.1000m', 'ath.1500m', 'ath.3000m', 'ath.400m', 'ath.4x400'].map(lapPointsDiffer), [false, true, true, true, false, false]);
    assert.deepEqual([lapPointsOf('start'), lapPointsOf(undefined), lapPointsOf('x')], ['start', 'finish', 'finish']);
    assert.deepEqual(LAP_POINT_CHOICES.map(lapPointsLabel), ['Finish-line passes', 'Every 400 m from the start']);
  });
  test('the meet choice and the event override; other sports read finish', () => {
    assert.equal(raceTracking('athletics', {}).lapPoints, 'finish');
    assert.equal(raceTracking('athletics', { lapPoints: 'start' }).lapPoints, 'start');
    assert.equal(raceTracking('athletics', { lapPoints: 'start' }, { lapPoints: 'finish' }).lapPoints, 'finish');
    assert.equal(raceTracking('swimming', { lapPoints: 'start' }).lapPoints, 'finish');
  });
  test('each result keeps its own points: lapsFrom only on laps read from the start', () => {
    const old: EntryResult = { mark: 290, splits: [55, 125, 200] };
    assert.deepEqual(splitDistancesFor('ath.1500m', old), [300, 700, 1100]);
    assert.deepEqual(splitDistancesFor('ath.1500m', { lapsFrom: 'start' }), [400, 800, 1200]);
    assert.deepEqual(splitDistancesFor('swim.200free', { lapsFrom: 'start' }), [50, 100, 150]); // not athletics: ignored
    const start = raceTracking('athletics', { lapPoints: 'start' });
    assert.equal(entryLapPoints(old, start), 'finish'); // already typed at the finish line
    assert.equal(entryLapPoints({ mark: 290 }, start), 'start');
    assert.deepEqual(entrySplitDistances(M1500, { mark: 290 }, start), [400, 800, 1200]);
    assert.deepEqual(entrySplitDistances(D('ath.4x400'), {}, start), [400, 800, 1200]);
    const w = resultWithSplits({ mark: 290 }, [62, 128, 196], 'start');
    assert.deepEqual(w, { mark: 290, splits: [62, 128, 196], lapsFrom: 'start' });
    assert.deepEqual(resultWithSplits(w, undefined, 'start'), { mark: 290, splits: undefined });
    assert.ok(!('lapsFrom' in resultWithSplits({ mark: 290, lapsFrom: 'start' }, [55], 'finish')));
  });
  test('splits read from the start: points, places among those timed at the same point, the winner\'s race', () => {
    const pts = splitPoints(M1500, { mark: 240, splits: [62, 128, 194], lapsFrom: 'start' });
    assert.deepEqual(pts.map((p) => [p.label, p.time, p.seg]), [['400 m', 62, 62], ['800 m', 128, 66], ['1200 m', 194, 66], ['1500 m', 240, 46]]);
    const rows = rankEntries([
      run('a', 'Asha', { mark: 240, splits: [62, 128, 194], lapsFrom: 'start' }),
      run('b', 'Bina', { mark: 242, splits: [61, 127, 195], lapsFrom: 'start' }),
      run('c', 'Chitra', { mark: 244, splits: [47, 108, 175] }), // typed at the finish line before the switch
    ], M1500);
    const pl = splitPlacesFor(M1500, rows.map((r) => ({ id: r.id, result: r.entry.result })));
    assert.deepEqual(pl.get('a'), [2, 2, 1]);
    assert.deepEqual(pl.get('b'), [1, 1, 2]);
    assert.deepEqual(pl.get('c'), [1, 1, 1]); // alone at 300 / 700 / 1100 m
    assert.equal(winnerSplitStory(M1500, rows), 'took the lead by 1200 m');
    // like with like: the 300 m last segment two rows share, not Chitra's 400 m
    assert.deepEqual(fastestFinish(M1500, rows), { id: 'a', name: 'Asha', seg: 46, label: '300 m' });
    const a = heatAnalysis(M1500, 1, rows);
    assert.deepEqual(a.splitLabels, ['300 m', '400 m', '700 m', '800 m', '1100 m', '1200 m', '1500 m']);
    assert.deepEqual(a.splits.find((s) => s.id === 'c')!.points.map((p) => p.label), ['300 m', '700 m', '1100 m', '1500 m']);
  });
  test('old results read exactly as before (index-based places unchanged)', () => {
    const rows = [{ id: 'a', result: { splits: [55, 125, 200] } }, { id: 'b', result: { splits: [54, 124, 199] } }];
    assert.deepEqual([...splitPlacesFor(M1500, rows)], [...splitPlaces(rows, 3)]);
  });
  test('the athletics settings offer the choice under "Stats to track", finish-line passes by default', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/sports/athletics/index.tsx'), 'utf8') + fs.readFileSync(path.join(ROOT, 'src/sports/athletics/meta.ts'), 'utf8');
    assert.match(src, /key: 'lapPoints', label: 'Lap points', type: 'choice', default: 'finish', advanced: true, group: 'Stats to track'/);
    assert.match(src, /\{ value: 'finish', label: 'Finish-line passes' \}, \{ value: 'start', label: 'Every 400 m from the start' \}/);
  });
});

/* ------------------------- 5. Stats to track per event ------------------------ */

describe('5 · "Stats to track" — meet-wide, with per-event overrides', () => {
  test('an override wins over the meet; a key that isn\'t the sport\'s stays off', () => {
    assert.equal(raceTracking('athletics', { lapSplits: false }, { lapSplits: true }).lapSplits, true);
    assert.equal(raceTracking('athletics', { lapSplits: true }, { lapSplits: false }).lapSplits, false);
    assert.equal(raceTracking('athletics', { lapSplits: true }, {}).lapSplits, true); // absent → the meet
    assert.equal(raceTracking('athletics', {}, { cycSplits: true }).cycSplits, false);
    assert.equal(raceTracking('swimming', {}, { splits: false }).splits, false);
    assert.equal(raceTracking('rowing', {}, { splits: true }).splits, true);
    assert.deepEqual(TRACK_KEYS.length, 7);
  });
  test('the options an event offers', () => {
    const keys = (k: string, f?: Parameters<typeof trackOptions>[1]) => trackOptions(D(k), f).map((o) => o.key);
    assert.deepEqual(keys('ath.1500m'), ['reaction', 'lapSplits', 'lapPoints']);
    assert.deepEqual(keys('ath.800m'), ['reaction', 'lapSplits']);
    assert.deepEqual(keys('ath.100m'), ['reaction']);
    assert.deepEqual(keys('ath.4x400'), ['reaction', 'relayLegs']);
    assert.deepEqual(keys('ath.lj'), []);
    assert.deepEqual(keys('swim.4x100free'), ['splits', 'reaction', 'takeovers']);
    assert.deepEqual(keys('swim.50free'), ['reaction']);
    assert.deepEqual(keys('row.1x.2000'), ['splits']);
    assert.deepEqual(keys('cyc.ip.4000'), ['cycSplits']);
    const road = DISC_ROAD();
    if (road) {
      assert.deepEqual(keys(road), ['chipTimes']);
      assert.deepEqual(keys(road, { road: { timing: 'chip' } as never }), []);
    }
    assert.ok(trackOptions(D('ath.1500m')).every((o) => o.label && o.hint));
  });
  test('setting a value: the meet\'s own value drops the override; none left → undefined', () => {
    const base = raceTracking('athletics', { lapSplits: false });
    const on = setTrackOverride(undefined, 'lapSplits', true, base);
    assert.deepEqual(on, { lapSplits: true });
    assert.deepEqual(setTrackOverride(on, 'lapPoints', 'start', base), { lapSplits: true, lapPoints: 'start' });
    assert.equal(setTrackOverride(on, 'lapSplits', false, base), undefined);
    assert.deepEqual(setTrackOverride({ lapSplits: true, lapPoints: 'start' }, 'lapPoints', 'finish', base), { lapSplits: true });
  });
  test('defaults use the phase\'s own flags; effective = defaults + overrides', () => {
    assert.equal(trackDefaults('athletics', {}, { reaction: true }).reaction, true); // set at creation (SD-90)
    assert.equal(trackDefaults('swimming', { splits: true }, { splits: false }).splits, false); // SD-94 per phase
    assert.equal(trackDefaults('rowing', {}, { splits: true }).splits, true);
    const eff = trackEffective('athletics', { lapSplits: true }, { track: { lapSplits: false, reaction: true, lapPoints: 'start' } });
    assert.deepEqual([eff.lapSplits, eff.reaction, eff.lapPoints], [false, true, 'start']);
    assert.equal(trackEffective('athletics', {}, { track: { takeovers: true } }).takeovers, false);
  });
  test('the entry screen follows the event: reaction, splits, take-overs, chip times', () => {
    const t = (fmt: Record<string, unknown>, own?: object) => raceTracking('athletics', fmt, own as never);
    assert.equal(reactionOffered(D('ath.100m'), { reaction: true }, t({})), true); // the phase's flag, as before
    assert.equal(reactionOffered(D('ath.100m'), {}, t({ reaction: true })), true); // the meet switched it on later
    assert.equal(reactionOffered(D('ath.100m'), { reaction: true, track: { reaction: false } }, t({}, { reaction: false })), false);
    assert.equal(reactionOffered(D('ath.lj'), { reaction: true }, t({})), false); // a field event has no reaction
    assert.equal(reactionOffered(D('ath.road.5000'), {}, t({ reaction: true })), false); // nor a road race
    assert.equal(splitsOffered(D('ath.1500m'), {}, t({}, { lapSplits: true })), true);
    assert.equal(splitsOffered(D('swim.200free'), { splits: true, track: { splits: false } }, raceTracking('swimming', {})), false);
    assert.equal(splitsOffered(D('row.1x.2000'), { track: { splits: true } }, raceTracking('rowing', {})), true);
    assert.equal(takeoversOffered(D('swim.4x100free'), raceTracking('swimming', {}, { takeovers: true })), true);
    const road = DISC_ROAD();
    if (road) assert.equal(chipOffered(D(road), {}, t({}, { chipTimes: true })), true);
  });
});

/** A road race discipline key, when the catalogue has one ('ath.road.10000' …). */
function DISC_ROAD(): string | undefined {
  for (const k of ['ath.road.5000', 'ath.road.10000', 'ath.road.21097']) if (disciplineOf(k)) return k;
  return undefined;
}

/* -------------------------------- 4. records set ------------------------------ */

describe('4 · records set — holder ids on the book, mrSet / srSet on the lines', () => {
  const M100 = D('ath.100m');
  const cat = categoryKey({ age: 'U14', gender: 'F' });
  test('a new record carries its holder\'s id (an athlete) or the members\' ids (a relay)', () => {
    const rows = rankEntries([run('a', 'Asha', { mark: 12.3, wind: 0.5 }, 1, P(1)), run('b', 'Bina', { mark: 12.6, wind: 0.5 }, 1, P(2))], M100);
    const [rec] = updateRecords(rows, M100, cat, [], '2026-10-22', ['MR'], 'ev1');
    assert.equal(rec.holder, 'Asha');
    assert.equal(rec.holderId, P(1));
    assert.deepEqual(recordPlayerIds(rec), [P(1)]);
    const R4 = D('ath.4x100');
    const members = [P(1), P(2), P(3), P(4)].map((playerId, i) => ({ playerId, name: `M${i}` }));
    const relay = rankEntries([{ id: 'r', name: 'Red A', heat: 1, result: { mark: 52.1, members } }], R4);
    const [rr] = updateRecords(relay, R4, cat, [], '2026-10-22', ['MR'], 'ev2');
    assert.deepEqual(rr.holderIds, [P(1), P(2), P(3), P(4)]);
    assert.equal(rr.holderId, undefined);
    assert.deepEqual(recordHolderIds({ result: { members: [{ name: 'No id' }] } }), {});
    assert.deepEqual(recordPlayerIds({ holder: 'Old', scope: 'MR' } as Pick<RecordMark, 'holderId' | 'holderIds'>), []); // an older entry: none
  });
  test('the derived school book (SR) carries ids too', () => {
    const ph: MeetPhase = { id: 'ph', status: 'completed', date: '2025-10-01T09:00:00Z', format: { discipline: 'ath.100m', category: { age: 'U14', gender: 'F' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'old' }, entries: [run('a', 'Asha', { mark: 12.5, wind: 0.1 }, 1, P(1))] };
    const [sr] = deriveRecordBook(groupMeet([ph]), 'SR');
    assert.equal(sr.holderId, P(1));
  });
  test('newRecordsSet: only a record that STOOD and was beaten, by this event, in this scope', () => {
    const stood: RecordMark = { scope: 'MR', discipline: 'ath.100m', category: cat, value: 12.5, holder: 'Old', year: 2019, historic: true };
    const rows = rankEntries([run('a', 'Asha', { mark: 12.3, wind: 0.5 }, 1, P(1))], M100);
    const after = updateRecords(rows, M100, cat, [stood], '2026-10-22', ['MR'], 'ev1');
    assert.deepEqual(newRecordsSet([stood], after, 'MR', 'ev1'), [{ scope: 'MR', discipline: 'ath.100m', value: 12.3, holderId: P(1) }]);
    assert.deepEqual(newRecordsSet([stood], after, 'SR', 'ev1'), []);
    assert.deepEqual(newRecordsSet([stood], after, 'MR', 'other'), []);
    // an empty book: the first mark starts it — not a record broken
    assert.deepEqual(newRecordsSet([], updateRecords(rows, M100, cat, [], '2026-10-22', ['MR'], 'ev1'), 'MR', 'ev1'), []);
    // not beaten: nothing
    const slow = rankEntries([run('a', 'Asha', { mark: 12.7, wind: 0.5 }, 1, P(1))], M100);
    assert.deepEqual(newRecordsSet([stood], updateRecords(slow, M100, cat, [stood], '2026-10-22', ['MR'], 'ev1'), 'MR', 'ev1'), []);
  });
  test('withRecordKeys: mrSet / srSet on the holders\' lines only; no record → the lines as they were', () => {
    const lines = [{ playerId: P(1), stats: { races: 1, place: 1 }, won: true }, { playerId: P(2), stats: { races: 1, place: 2 }, won: false }];
    assert.equal(withRecordKeys(lines, undefined), lines);
    assert.equal(withRecordKeys(lines, []), lines);
    const out = withRecordKeys(lines, [{ scope: 'MR', discipline: 'ath.100m', value: 12.3, holderId: P(1) }, { scope: 'SR', discipline: 'ath.100m', value: 12.3, holderId: P(1) }]);
    assert.deepEqual(out[0].stats, { races: 1, place: 1, mrSet: 1, srSet: 1 });
    assert.equal(out[1], lines[1]);
    const relay = withRecordKeys(lines, [{ scope: 'MR', discipline: 'ath.4x100', value: 52, holderIds: [P(1), P(2)] }]);
    assert.deepEqual(relay.map((l) => l.stats.mrSet), [1, 1]);
  });
  test('careers count and list them (athletics, crews, cycling); none → nothing shown', () => {
    const infos = new Map<string, PhaseInfo>([['f1', { discipline: 'ath.100m', category: { age: 'U14', gender: 'F' }, phase: 'final', title: '100 m U14 Girls — Final', date: '2026-10-22', eventTitle: '100 m U14 Girls' }]]);
    const c = athleticsCareer([{ eventId: 'f1', date: '2026-10-22', stats: { races: 1, place: 1, golds: 1, mark: 12.3, m_100m: 12.3, mrSet: 1, srSet: 1 } }], infos, '2026-01-01');
    assert.deepEqual([c.meetRecords, c.schoolRecords], [1, 1]);
    assert.deepEqual(c.records.map((r) => [r.scope, r.title, r.text, r.eventId]), [['MR', '100 m U14 Girls', '12.30', 'f1'], ['SR', '100 m U14 Girls', '12.30', 'f1']]);
    assert.deepEqual(c.history[0].flags, ['MR', 'SR']);
    assert.equal(recordsSetText(c), '1 meet record · 1 school record');
    const none = athleticsCareer([{ eventId: 'x', stats: { races: 1, place: 1, mark: 12.5, m_100m: 12.5 } }], new Map(), '2026-01-01');
    assert.deepEqual([none.meetRecords, none.schoolRecords, none.records.length, recordsSetText(none)], [0, 0, 0, '']);
    const cc = crewCareer([{ eventId: 'r', stats: { races: 1, place: 1, mark: 420, m_row_1x_2000: 420, mrSet: 1 } }], new Map(), '2026-01-01');
    assert.deepEqual([cc.meetRecords, cc.records[0].scope, cc.history[0].flags.includes('MR')], [1, 'MR', true]);
    const cy = cyclingCareer([{ eventId: 'k', stats: { races: 1, place: 1, srSet: 2 } }], new Map(), '2026-01-01');
    assert.deepEqual([cy.schoolRecords, recordsSetText(cy)], [2, '2 school records']);
  });
  test('career records read newest first, a final\'s meet record before its school record', () => {
    const c = athleticsCareer([
      { eventId: 'f1', date: '2026-03-01', stats: { races: 1, place: 1, mark: 12.5, m_100m: 12.5, srSet: 1 } },
      { eventId: 'f2', date: '2026-10-22', stats: { races: 1, place: 1, mark: 12.3, m_100m: 12.3, mrSet: 1, srSet: 1 } },
    ], new Map(), '2026-01-01');
    assert.deepEqual(c.records.map((r) => [r.eventId, r.scope]), [['f2', 'MR'], ['f2', 'SR'], ['f1', 'SR']]);
  });
  test('the lock keeps the records on the phase and writes the keys from it (a re-sync writes the same)', () => {
    const store = fs.readFileSync(path.join(ROOT, 'src/data/resultsStore.ts'), 'utf8');
    assert.match(store, /newRecordsSet\(book, next, sc, f\.eventKey\)/);
    assert.match(store, /newRecordsSet\(opts\.schoolBook \?\? \[\], school, 'SR', f\.eventKey\)/);
    assert.match(store, /isTimedRaceSport\(def\.sport\) \? withRecordKeys\(lines, f\.recordsSet\) : lines/);
    assert.match(store, /recordsSet: fl\.recordsSet/);
    // the event's own Stats to track go on every phase; new rounds copy the format
    assert.match(store, /export async function setEventTracking\(eventKey: string, track: TrackOverrides \| undefined\)/);
    assert.match(store, /track: input\.track/);
    // heat wins / PBs saved before the round turns completed (the trigger reads them)
    assert.match(store, /await saveHighlights\(phase, raceHighlights\(f, def, \[\.\.\.byHeat\.values\(\)\]\.flatMap\(\(rows\) => withQualification\(rows, q\)\), \{ final: false, flags: opts\.flags \}\)\);\n  await setPhaseStatus\(phase\.id, 'completed'\);/);
  });
  test('schemas declare mrSet / srSet with one shared label', () => {
    for (const sp of ['athletics', 'swimming', 'rowing', 'canoe', 'cycling'] as const) {
      assert.deepEqual(validateSchema(STAT_SCHEMAS[sp]), [], sp);
      assert.ok(STAT_SCHEMAS[sp].stats.some((d) => d.key === 'mrSet') && STAT_SCHEMAS[sp].stats.some((d) => d.key === 'srSet'), sp);
    }
    assert.equal(statDef('mrSet')?.label, 'Meet records set');
    assert.equal(statDef('srSet')?.label, 'School records set');
  });
});

/* ---------------------------- 3. heat-win / PB alerts ------------------------- */

describe('3 · follower alerts for heat wins and PBs', () => {
  const M100 = D('ath.100m');
  const f = { discipline: 'ath.100m', phase: 'heat' as const, heats: 2, phaseNo: 1, eventTitle: '100 m U14 Girls' };
  const heatRows = (): RankedEntry[] => [...rankByHeat([
    run('a', 'Asha', { mark: 12.4, wind: 0.2 }, 1, P(1)), run('b', 'Bina', { mark: 12.6, wind: 0.2 }, 1, P(2)), run('x', 'Xena', { mark: 12.9, wind: 0.2 }, 1, P(9)),
    run('c', 'Chitra', { mark: 12.5, wind: 0.2 }, 2, P(3)), run('d', 'Divya', { mark: 12.8, wind: 0.2 }, 2, undefined),
  ], M100).values()].flat();
  test('a round: heat winners (a PB rides on it) and PBs of the rest', () => {
    const flags = new Map<string, ResultFlag[]>([['a', ['PB']], ['b', ['PB', 'Q']], ['x', ['SB']]]);
    const h = raceHighlights(f, M100, heatRows(), { final: false, flags })!;
    assert.equal(h.event, '100 m U14 Girls');
    assert.deepEqual(h.items, [
      { kind: 'heat', playerId: P(1), name: 'Asha', mark: '12.40', heat: 'Heat 1', pb: true },
      { kind: 'pb', playerId: P(2), name: 'Bina', mark: '12.60', heat: 'Heat 1' },
      { kind: 'heat', playerId: P(3), name: 'Chitra', mark: '12.50', heat: 'Heat 2' },
    ]);
  });
  test('nothing to tell → null; not a timed race / a combined event → null', () => {
    const one = rankEntries([run('a', 'Asha', { mark: 12.4 }, 1, P(1))], M100);
    assert.equal(raceHighlights({ ...f, phase: 'final', heats: 1 }, M100, one, { final: true }), null); // the gold has her own push
    assert.equal(raceHighlights(f, D('wl.total'), heatRows(), { final: false }), null);
    assert.equal(raceHighlights({ ...f, combined: { key: 'ath.ce_dec' } as never }, M100, heatRows(), { final: false }), null);
  });
  test('a timed final: the other heats\' winners and PBs; the gold is left to the medal push (with "— PB")', () => {
    const rows = rankEntries([
      run('a', 'Asha', { mark: 12.9, wind: 0.1 }, 1, P(1)), run('b', 'Bina', { mark: 13.2, wind: 0.1 }, 1, P(2)),
      run('c', 'Chitra', { mark: 12.2, wind: 0.1 }, 2, P(3)), run('d', 'Divya', { mark: 12.6, wind: 0.1 }, 2, P(4)),
    ], M100);
    const flags = new Map<string, ResultFlag[]>([['c', ['PB']], ['d', ['PB']]]);
    const h = raceHighlights({ ...f, phase: 'final' }, M100, rows, { final: true, flags })!;
    // in overall order: Divya 2nd (a PB), Asha 3rd (won heat 1)
    assert.deepEqual(h.items.map((i) => [i.kind, i.name, i.heat]), [['pb', 'Divya', 'Final, heat 2'], ['heat', 'Asha', 'Final, heat 1']]);
    assert.deepEqual([...goldPbIds(rows, flags)], [P(3)]);
    const alert = finalAlert(rows, '100 m U14 Girls', goldPbIds(rows, flags));
    assert.equal(alert.medals[0].pb, true);
    assert.equal(alert.medals[1].pb, undefined);
    const parsed = parseAlert(JSON.parse(JSON.stringify(alert)))!;
    assert.equal(parsed.medals[0].pb, true);
    assert.equal(alertText({ kind: 'final', event: '100 m U14 Girls', medals: parsed.medals })!.title, '🥇 Chitra won 100 m U14 Girls in 12.20 — PB');
    // a record of theirs says more than a PB
    assert.equal(alertText({ kind: 'final', event: 'X', medals: parsed.medals, records: [{ scope: 'MR' }] })!.title, '🥇 Chitra won X in 12.20 — meet record');
  });
  test('a relay / crew heat win reaches the members\' followers', () => {
    const R4 = D('ath.4x100');
    const members = [P(5), P(6), P(7), P(8)].map((playerId, i) => ({ playerId, name: `M${i}` }));
    const rows = [...rankByHeat([{ id: 'r', name: 'Red A', heat: 1, team: { id: P(50), name: 'Red' }, result: { mark: 52.1, members } }], R4).values()].flat();
    const h = raceHighlights({ ...f, discipline: 'ath.4x100' }, R4, rows, { final: false })!;
    assert.deepEqual(h.items[0], { kind: 'heat', teamId: P(50), memberIds: [P(5), P(6), P(7), P(8)], name: 'Red A', mark: '52.10', heat: 'Heat 1' });
    assert.deepEqual(highlightTargets(h.items[0]), [P(5), P(6), P(7), P(8)]);
  });
  test('the function validates what it reads; the app\'s highlights round-trip', () => {
    const flags = new Map<string, ResultFlag[]>([['a', ['PB']], ['b', ['PB']]]);
    const h = raceHighlights(f, M100, heatRows(), { final: false, flags })!;
    assert.deepEqual(parseHighlights(JSON.parse(JSON.stringify(h))), h);
    const bad = parseHighlights({ event: 'E https://x.y', items: [
      { kind: 'heat', playerId: 'nope', name: 'A' }, { kind: 'gold', playerId: P(1), name: 'B' },
      { kind: 'pb', playerId: P(1), name: 'C  https://evil.example', mark: '<b>12</b>', heat: 'Heat 1' },
      { kind: 'heat', memberIds: [P(2), 'x', P(2)], teamId: 'bad', name: 'Relay', pb: true },
    ] })!;
    assert.deepEqual(bad.items, [
      { kind: 'pb', playerId: P(1), name: 'C', heat: 'Heat 1' },
      { kind: 'heat', memberIds: [P(2)], name: 'Relay', pb: true },
    ]);
    assert.equal(bad.event, 'E');
    assert.equal(parseHighlights({ items: [] }), null);
    assert.equal(parseHighlights(null), null);
  });
  test('each follower hears what their choices allow (heat win = Result, PB = big moments)', () => {
    const items = parseHighlights({ items: [
      { kind: 'heat', playerId: P(1), name: 'Asha', mark: '12.40', heat: 'Heat 1', pb: true },
      { kind: 'pb', playerId: P(2), name: 'Bina', mark: '12.60', heat: 'Heat 1' },
    ] })!.items;
    const F = (o: Record<string, Prefs>) => new Map(Object.entries(o));
    assert.deepEqual(itemsFor(items, F({ [P(1)]: null })).map((h) => [h.kind, h.pb]), [['heat', true]]);
    assert.deepEqual(itemsFor(items, F({ [P(1)]: { scores: false } })).map((h) => [h.kind, h.pb]), [['heat', undefined]]);
    assert.deepEqual(itemsFor(items, F({ [P(1)]: { result: false } })).map((h) => [h.kind, h.pb]), [['pb', undefined]]); // the PB still reaches them
    assert.deepEqual(itemsFor(items, F({ [P(1)]: { result: false, scores: false } })), []);
    assert.deepEqual(itemsFor(items, F({ [P(2)]: { scores: false } })), []);
    assert.deepEqual(itemsFor(items, F({ [P(3)]: null })), []); // follows nobody here
    assert.equal(itemsFor(items, F({ [P(1)]: null, [P(2)]: null })).length, 2);
  });
  test('one push per follower: a heat win, a PB, or several athletes in one message', () => {
    const heat = { kind: 'heat' as const, playerId: P(1), name: 'Asha Rao', mark: '12.40', heat: 'Heat 2', pb: true };
    const pb = { kind: 'pb' as const, playerId: P(2), name: 'Bina Iyer', mark: '12.60', heat: 'Heat 1' };
    assert.deepEqual(highlightText([heat], 'U14 Girls 100 m', 'Sports Day 2026'), { title: '🏁 Asha Rao won Heat 2 — U14 Girls 100 m', body: '12.40 · PB · Sports Day 2026' });
    assert.deepEqual(highlightText([pb], 'U14 Girls 100 m'), { title: '📈 PB for Bina Iyer — U14 Girls 100 m', body: '12.60 (Heat 1)' });
    assert.deepEqual(highlightText([{ ...pb, heat: undefined, mark: '5.42 m' }], 'U14 Girls Long jump'), { title: '📈 PB for Bina Iyer — U14 Girls Long jump', body: '5.42 m' });
    assert.deepEqual(highlightText([heat, pb], 'U14 Girls 100 m', 'Sports Day 2026'), {
      title: '🏁 U14 Girls 100 m — Asha Rao and Bina Iyer',
      body: 'Asha Rao won Heat 2 in 12.40 (PB) · Bina Iyer: PB 12.60 (Heat 1) · Sports Day 2026',
    });
    assert.equal(highlightText([], 'X'), null);
    assert.equal(highlightPhrase({ kind: 'heat', name: 'Red A', mark: '52.10' }), 'Red A won the heat in 52.10');
  });
  test('the follow switches say heat wins and PBs now push (players only)', () => {
    const p = ALERTS.player;
    assert.match(p.find((a) => a.key === 'result')!.hint, /a heat they won/);
    assert.match(p.find((a) => a.key === 'scores')!.hint, /personal bests/);
    assert.doesNotMatch(ALERTS.team.find((a) => a.key === 'result')!.hint, /heat/);
  });
  test('the edge function reads the highlights on every completed round, with its own ledger key', () => {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/notify-followers/index.ts'), 'utf8');
    assert.match(src, /parseHighlights\(\(ev\.format as Record<string, unknown> \| null\)\?\.highlights\)/);
    assert.match(src, /lead_key: 'highlights'/);
    assert.match(src, /if \(!kind && !hasHighlights\) return json\(\{ skipped: 'not a final' \}\)/);
    assert.match(src, /followersOf\('player', \[\.\.\.new Set\(named\.flatMap\(highlightTargets\)\)\]\)/);
  });
});
