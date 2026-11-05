/**
 * Follow-ups left by deep wave round 2 (golf-chess-carrom-round2.md §6 and
 * timed-races-round2.md "Follow-ups"):
 *   1. Chess — a tournament "Best performance rating" AWARD slot: the TPR
 *      leader's figure and minimum (5 rated games, organiser-editable),
 *      offered only where ratings exist.
 *   2. Golf — chip-ins (holed out from off the green), free from the
 *      up-and-down capture: a round stat, a career row and a "Most chip-ins"
 *      leader (a count, like birdies: no minimum). Scrambling by distance is
 *      NOT free (no card records the distance of a shot from off the green).
 *   3. Timed races — records SET by a combined event's total (on the holder's
 *      total line only), and RECORDS HELD: which of the records an athlete set
 *      still stand in the book now, matched by the holder's id.
 * Nothing untracked reads 0; old cards / lines replay exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player, StatLine } from '../src/core/types.ts';
import { withChessPerformance } from '../src/data/chessRatings.ts';
import { tprOf } from '../src/sports/chess/stats.ts';
import {
  TOURNAMENT_AWARD_SLOTS, tournamentAwardSlots, rankAwardCandidates, defaultAwards, awardFormula, awardIcon, awardSlotTracked,
} from '../src/data/ratings.ts';
import { categoryLeaders } from '../src/data/standings.ts';
import { minimumRows } from '../src/data/leaderMinimums.ts';
import { standardPar72, roundStats, chipIn, upAndDown, type GolfCard } from '../src/sports/golf/engine.ts';
import { golfStatSheet } from '../src/sports/golf/statSheet.ts';
import { golfLeaderCategories, GOLF_STROKE_LEADERS } from '../src/data/golfLeaders.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema, STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import {
  combinedKey, disciplineOf, combinedStandings, combinedRanked, combinedAwards, combinedEventLines, combinedLines, combinedFinalLines,
  rankEntries, phaseDiscipline, updateRecords, newRecordsSet, athleticsCareer, categoryKey,
  recordsSetBy, stillHeld, heldKey, recordsHeldText, recordHeldNote,
  type CombinedPhaseInput, type PhaseFormat, type PhaseInfo, type RecordMark,
} from '../src/data/results/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* --------------------------- 1. chess: TPR award slot --------------------------- */

describe('1 · chess — "Best performance rating" award slot', () => {
  const P = (id: string, fullName: string, rapid?: number): Player => ({ id, fullName, sports: [], ...(rapid ? { sportDetails: { chess: { ratings: { rapid } } } } : {}) } as unknown as Player);
  const players = [P('a', 'Asha', 1500), P('b', 'Bala', 1700), P('c', 'Chen', 1900), P('d', 'Dia'), P('e', 'Esha', 1600)];
  let n = 0;
  const L = (pid: string, mid: string, s: Record<string, number>): StatLine => ({ id: `l${++n}`, matchId: mid, playerId: pid, sport: 'chess', stats: s, won: !!s.wins });
  // the round-2 leader's fixture: Asha 5 rated games (1 v unrated Dia, 1 forfeit)
  const lines = [
    L('a', 'm1', { games: 1, wins: 1 }), L('b', 'm1', { games: 1, losses: 1 }),
    L('a', 'm2', { games: 1, wins: 1 }), L('c', 'm2', { games: 1, losses: 1 }),
    L('a', 'm3', { games: 1, draws: 1 }), L('e', 'm3', { games: 1, draws: 1 }),
    L('a', 'm4', { games: 1, losses: 1 }), L('c', 'm4', { games: 1, wins: 1 }),
    L('a', 'm5', { games: 1, wins: 1 }), L('d', 'm5', { games: 1, losses: 1 }),
    L('a', 'm6', { games: 1, wins: 1 }), L('b', 'm6', { games: 1, losses: 1 }),
    L('a', 'm7', { forfeitWins: 1 }), L('e', 'm7', { forfeitLosses: 1 }),
  ];
  const rated = withChessPerformance(lines, players, 'rapid');
  const slots = (ls: StatLine[]) => tournamentAwardSlots(ls, 'chess').map((s) => s.slot);

  test('the slot exists (after Best score %) and is offered only where ratings exist', () => {
    assert.deepEqual(TOURNAMENT_AWARD_SLOTS.chess.map((s) => [s.slot, s.label, s.icon]), [
      ['mvp', 'Player of the Tournament', '🏆'], ['scorePct', 'Best score %', '📈'], ['tpr', 'Best performance rating', '📊'],
    ]);
    assert.deepEqual(slots(lines), ['mvp', 'scorePct'], 'no ratings data on the lines: no slot');
    assert.deepEqual(slots(withChessPerformance(lines, players, 'classical')), ['mvp', 'scorePct'], 'nobody rated on the event\'s list');
    assert.deepEqual(slots(rated), ['mvp', 'scorePct', 'tpr']);
    assert.equal(awardSlotTracked('chess', 'tpr', rated), true);
    // a slot already holding an award stays listed (to see / clear it)
    assert.deepEqual(tournamentAwardSlots(lines, 'chess', {}, ['tpr']).map((s) => s.slot), ['mvp', 'scorePct', 'tpr']);
    assert.equal(awardIcon('chess', 'tpr'), '📊');
  });

  test('the same figure and minimum as the leader (5 rated games, the organiser can change it)', () => {
    const top = rankAwardCandidates(rated, players, 'chess', 'tpr');
    assert.deepEqual(top.map((c) => [c.name, c.value, c.display]), [['Asha', tprOf(5, 8800, 3.5), '1909']]);
    const leader = categoryLeaders(rated, players, 'chess').find((c) => c.key === 'tpr')!;
    assert.equal(top[0].value, leader.leaders[0].value, 'the award ranks the leader\'s figure');
    assert.equal(top[0].detail, '1909 TPR · 5 rated games · 7 matches');
    const low = rankAwardCandidates(rated, players, 'chess', 'tpr', 10, { mins: { tpr: 2 } });
    assert.deepEqual(low.map((c) => [c.name, c.value]), [['Asha', 1909], ['Chen', 1500], ['Bala', 700]], 'the leader\'s min-2 order');
    // the minimum row is shared with the leader (listed once)
    assert.equal(minimumRows('chess').filter((r) => r.key === 'tpr').length, 1);
  });

  test('ties: more games against rated opponents, then by name', () => {
    // Bala: 1 draw v Esha (1600) → TPR 1600; Chen: 2 draws v Esha → TPR 1600 over 2 rated games
    const T = [
      L('b', 't1', { games: 1, draws: 1 }), L('e', 't1', { games: 1, draws: 1 }),
      L('c', 't2', { games: 1, draws: 1 }), L('e', 't2', { games: 1, draws: 1 }),
      L('c', 't3', { games: 1, draws: 1 }), L('e', 't3', { games: 1, draws: 1 }),
    ];
    const r = rankAwardCandidates(withChessPerformance(T, players, 'rapid'), players, 'chess', 'tpr', 10, { mins: { tpr: 1 } });
    assert.deepEqual(r.filter((c) => c.name !== 'Esha').map((c) => [c.name, c.value]), [['Chen', 1600], ['Bala', 1600]]);
  });

  test('suggested awards: the TPR winner only where ratings exist; "How is this ranked?" names the minimum', () => {
    assert.equal(defaultAwards(lines, players, 'chess').some((a) => a.slot === 'tpr'), false);
    const s = defaultAwards(rated, players, 'chess').find((a) => a.slot === 'tpr')!;
    assert.deepEqual([s.label, s.playerName, s.value], ['Best performance rating', 'Asha', 1909]);
    assert.match(awardFormula('chess', 'tpr'), /unofficial/);
    assert.match(awardFormula('chess', 'tpr'), /at least 5 rated games/);
    assert.match(awardFormula('chess', 'tpr', { tpr: 3 }), /at least 3 rated games/);
  });

  test('the tournament page hands the award tab the same rated lines as the leader', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/screens/TournamentProfileScreen.tsx'), 'utf8');
    assert.match(src, /const leaderScope = useLeaderSplits\(activeSport, perfLines, matches, tourList\);/);
    assert.match(src, /<TournamentAwardsTab\n\s+tournament=\{tournament\} matches=\{matches\} lines=\{perfLines\}/);
  });
});

/* ------------------------------- 2. golf: chip-ins ------------------------------- */

describe('2 · golf — chip-ins', () => {
  const H = standardPar72(); // pars 4 4 3 5 4 4 3 4 5 | 4 4 3 5 4 4 3 4 5
  const zeros = H.map(() => 0);
  const card = (deltas: (number | null)[], extra: Partial<GolfCard> = {}): GolfCard =>
    ({ strokes: H.map((h, i) => (deltas[i] == null ? h.par : h.par + (deltas[i] as number))), ...extra });
  const arr = <T,>(vals: Record<number, T>): (T | null)[] => H.map((_, i) => (i in vals ? vals[i] : null));
  const flat = (d: number) => H.map(() => d);

  test('a chip-in: at least one shot from off the green, no putt — however many it took', () => {
    assert.equal(chipIn(1, 0), true);
    assert.equal(chipIn(3, 0), true, '3+ shots, then in: still a chip-in (not an up and down)');
    assert.equal(upAndDown(3, 0), false);
    assert.equal(chipIn(1, 1), false);
    assert.equal(chipIn(0, 0), null, 'no shot from off the green (holed the approach): not a chip-in');
    assert.equal(chipIn(null, 0), null);
    assert.equal(chipIn(1, null), null, 'putts not entered: not recorded');
  });

  test('roundStats: chipIns on a card kept with up and downs only (a true 0 there)', () => {
    // hole 1 (par 4) birdie: missed the green, chipped in (1 shot off, 0 putts)
    // hole 2 (par 4) par: chip, then chip-in (2 shots off, 0 putts)
    // hole 3 (par 3) par: chip + 2 putts (a chance, no up and down, no chip-in)
    const c = card([-1, 0, 0, ...new Array(15).fill(0)], {
      track: ['putts', 'upDown'],
      putts: H.map((_, i) => (i === 0 || i === 1 ? 0 : 2)),
      offGreen: arr({ 0: 1, 1: 2, 2: 1 }),
    });
    const s = roundStats(c, H, zeros);
    assert.equal(s.chipIns, 2);
    assert.equal(s.upDowns, 2, 'both chip-ins are up and downs (1 + 0, 2 + 0)');
    assert.equal(s.udChances, 3);
    // putts 0 on a hole with no off-green shot recorded (holed the approach): not a chip-in
    const holed = roundStats(card([-1], { track: ['putts', 'upDown'], putts: arr({ 0: 0 }) }), H, zeros);
    assert.equal(holed.chipIns, 0);
    // not kept with up and downs, or an SD-45 card: no key (never a false 0)
    assert.equal('chipIns' in roundStats(card([], { track: ['putts'], putts: flat(2) }), H, zeros), false);
    assert.equal('chipIns' in roundStats(card([], { putts: flat(2), firDir: H.map(() => 'hit' as const) }), H, zeros), false);
    assert.equal('chipIns' in roundStats(card([]), H, zeros), false);
    assert.equal(roundStats(card([], { track: ['putts', 'upDown'], putts: flat(2) }), H, zeros).chipIns, 0);
  });

  test('the round panel: a "Chip-ins" row once someone has one (mine vs the field)', () => {
    const kept = (puttsAt0: number) => card([puttsAt0 ? 0 : -1], { track: ['putts', 'upDown'], putts: H.map((_, i) => (i === 0 ? puttsAt0 : 2)), offGreen: arr({ 0: 1 }) });
    const around = (me: GolfCard, field: GolfCard[]) => golfStatSheet({ card: me, holes: H, received: zeros }, field.map((f) => ({ card: f, holes: H, received: zeros })))
      .find((x) => x.id === 'around')?.rows.map((r) => [r.label, r.home, r.away]) ?? [];
    assert.deepEqual(around(kept(0), []).find((r) => r[0] === 'Chip-ins'), ['Chip-ins', '1', '']);
    assert.deepEqual(around(kept(1), [kept(0)]).find((r) => r[0] === 'Chip-ins'), ['Chip-ins', '0', '1.0'], 'a true 0 beside the field');
    assert.equal(around(kept(1), [kept(1)]).some((r) => r[0] === 'Chip-ins'), false, 'nobody chipped in: no row');
    // my card didn't track it: no row even if the field chipped in
    assert.equal(around(card([], { track: ['putts'], putts: flat(2) }), [kept(0)]).some((r) => r[0] === 'Chip-ins'), false);
  });

  test('career: "Around the green" lists chip-ins once a round tracked them', () => {
    const schema = statSchema('golf')!;
    const L = (stats: Record<string, number>): StatLine => ({ id: 'x', matchId: '', eventId: 'e', playerId: 'p', sport: 'golf', stats, won: false });
    const around = careerSections(schema, [L({ rounds: 1, udChances: 8, upDowns: 5, chipIns: 2 }), L({ rounds: 1, udChances: 4, upDowns: 2, chipIns: 0 }), L({ rounds: 1 })]).find((x) => x.id === 'around')!;
    assert.equal(around.rows.find((r) => r.key === 'chipIns')?.value, '2');
    // a round-2 line without the key (kept before chip-ins existed): not a 0
    const older = careerSections(schema, [L({ rounds: 1, udChances: 8, upDowns: 5 })]).find((x) => x.id === 'around')!;
    assert.equal(older.rows.some((r) => r.key === 'chipIns'), false);
  });

  test('the leader: "Most chip-ins" — a count (no minimum), only players with one, stroke play after the par averages', () => {
    const players = [{ id: 'a', fullName: 'Asha' }, { id: 'b', fullName: 'Bilal' }, { id: 'c', fullName: 'Chitra' }] as Player[];
    const G = (pid: string, stats: Record<string, number>): StatLine => ({ id: `${pid}${Object.keys(stats).join()}`, matchId: '', eventId: 'r1', playerId: pid, sport: 'golf', stats, won: false });
    const lines = [G('a', { rounds: 1, birdies: 2, chipIns: 1 }), G('b', { rounds: 1, birdies: 1, chipIns: 2 }), G('c', { rounds: 1, birdies: 3, chipIns: 0 })];
    const cats = categoryLeaders(lines, players, 'golf');
    const ci = cats.find((c) => c.key === 'chipIns')!;
    assert.equal(ci.label, 'Most chip-ins');
    assert.equal(ci.qualifier, undefined);
    assert.deepEqual(ci.leaders.map((l) => [l.name, l.value]), [['Bilal', 2], ['Asha', 1]]);
    assert.equal(categoryLeaders([G('c', { rounds: 1, birdies: 1, chipIns: 0 })], players, 'golf').some((c) => c.key === 'chipIns'), false, 'nobody chipped in');
    assert.equal(categoryLeaders([G('c', { rounds: 1, birdies: 1 })], players, 'golf').some((c) => c.key === 'chipIns'), false, 'not tracked');
    assert.deepEqual(golfLeaderCategories(cats, { competition: 'stroke' }).map((c) => c.key), ['birdies', 'chipIns']);
    assert.ok((GOLF_STROKE_LEADERS as readonly string[]).includes('chipIns'));
    assert.equal(minimumRows('golf').some((r) => r.key === 'chipIns'), false, 'a count needs no minimum');
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as never), [], s.sport);
  });
});

/* --------------------- 3. timed races: combined totals + held --------------------- */

describe('3 · timed races — records set by a combined total; records held', () => {
  const EVENTS = ['ath.lj', 'ath.sp'];
  const KEY = combinedKey('x', 'F', EVENTS);
  const CAT = { age: 'U16', gender: 'F' as const };
  const fmt = (index: number, extra: Partial<PhaseFormat> = {}): PhaseFormat => ({
    discipline: EVENTS[index], phase: 'final', phaseNo: index + 1, heats: 1, eventKey: 'ce1', eventTitle: 'Combined event U16 Girls', category: CAT,
    combined: { key: KEY, table: 'F', events: EVENTS, index }, ...extra,
  });
  const ATH = [['g1', 'Asha', 5.2, 9.5], ['g2', 'Bina', 4.8, 8.9]] as const;
  const phases = (): CombinedPhaseInput[] => [0, 1].map((i) => ({
    format: fmt(i), status: 'completed',
    entries: ATH.map(([id, name, lj, sp]) => ({ id: `e${i}-${id}`, athleteId: id, name, heat: 1, result: { attempts: [{ mark: i === 0 ? lj : sp, ...(i === 0 ? { wind: 0.5 } : {}) }] } })),
  }));
  const rows = combinedStandings(phases(), { final: true });
  const last = phases()[1];
  const ranked = rankEntries(last.entries, phaseDiscipline(disciplineOf('ath.sp')!, last.format));
  const cdef = disciplineOf(KEY)!;
  const cat = categoryKey(CAT);

  test('the total breaks a record that stood → kept for the phase with the holder\'s id', () => {
    assert.ok(cdef, KEY);
    const stood: RecordMark = { scope: 'MR', discipline: KEY, category: cat, value: rows[0].total - 50, holder: 'Old', historic: true };
    const after = updateRecords(combinedRanked(rows, KEY), cdef, cat, [stood], '2026-10-23', ['MR'], 'ce1');
    assert.deepEqual(newRecordsSet([stood], after, 'MR', 'ce1'), [{ scope: 'MR', discipline: KEY, value: rows[0].total, holderId: 'g1' }]);
    // an empty book: the first total starts it — not a record set (as for single events)
    assert.deepEqual(newRecordsSet([], updateRecords(combinedRanked(rows, KEY), cdef, cat, [], '2026-10-23', ['MR'], 'ce1'), 'MR', 'ce1'), []);
  });

  test('combinedFinalLines: mrSet / srSet on the holder\'s TOTAL line only; no record → exactly the old lines', () => {
    const f = fmt(1);
    const awards = combinedAwards(rows);
    const old = [...combinedEventLines(f, ranked), ...combinedLines(f, rows, awards)];
    assert.deepEqual(combinedFinalLines(f, ranked, rows, awards), old);
    const set = combinedFinalLines({ ...f, recordsSet: [{ scope: 'MR', discipline: KEY, value: rows[0].total, holderId: 'g1' }, { scope: 'SR', discipline: KEY, value: rows[0].total, holderId: 'g1' }] }, ranked, rows, awards);
    const mine = set.filter((l) => l.playerId === 'g1');
    assert.equal(mine.length, 2, 'the last event\'s line and the total line');
    assert.deepEqual(mine.map((l) => [!!l.stats.combined, l.stats.mrSet ?? null, l.stats.srSet ?? null]), [[false, null, null], [true, 1, 1]]);
    assert.ok(set.filter((l) => l.playerId === 'g2').every((l) => !('mrSet' in l.stats) && !('srSet' in l.stats)));
  });

  test('the career counts it once and lists it as the combined event, in points', () => {
    const f = fmt(1, { recordsSet: [{ scope: 'MR', discipline: KEY, value: rows[0].total, holderId: 'g1' }] });
    const lines = combinedFinalLines(f, ranked, rows, combinedAwards(rows)).filter((l) => l.playerId === 'g1')
      .map((l) => ({ eventId: 'p2', date: '2026-10-23T15:00:00Z', stats: l.stats }));
    const infos = new Map<string, PhaseInfo>([['p2', { discipline: 'ath.sp', phase: 'final', title: 'Combined event U16 Girls — 2. Shot put', date: '2026-10-23', category: CAT, eventTitle: 'Combined event U16 Girls', combinedKey: KEY }]]);
    const c = athleticsCareer(lines, infos, '2026-01-01');
    assert.deepEqual([c.meetRecords, c.schoolRecords], [1, 0]);
    assert.deepEqual(c.records.map((r) => [r.scope, r.title, r.text]), [['MR', 'Combined event U16 Girls', `${rows[0].total} pts`]]);
  });

  test('store wiring: the lock keeps the total\'s records on the phase; the re-sync writes the same lines', () => {
    const store = fs.readFileSync(path.join(ROOT, 'src/data/resultsStore.ts'), 'utf8');
    assert.match(store, /if \(f\.combined\) return completeCombined\(phase, f, def, entries, nameOf, scopes, points, opts\);/);
    assert.match(store, /await writePhaseLines\(phase, f, combinedFinalLines\(fl, ranked, rows, awards\)\);/);
    assert.match(store, /const school = opts\.schoolBook\?\.length \? updateRecords\(totals, cdef, cat, opts\.schoolBook/);
    assert.match(store, /lines = combinedFinalLines\(f, ranked, rows, combinedAwards\(rows, points \?\? \{\}\)\);/);
    const screen = fs.readFileSync(path.join(ROOT, 'src/screens/ResultsEventScreen.tsx'), 'utf8');
    assert.match(screen, /completeFinal\(phase, merged, nameOf, \['MR'\], pts, \{ schoolBook: srBook \}\)/);
  });

  test('records held: the records an athlete set, still standing in the book now (by id, same mark)', () => {
    const c14 = { age: 'U14', gender: 'F' as const };
    const infos = new Map<string, PhaseInfo>([
      ['f1', { discipline: 'ath.100m', phase: 'final', title: '100 matches', date: '2026-03-01', category: c14, tournamentId: 't1', sport: 'athletics',
        recordsSet: [{ scope: 'MR', discipline: 'ath.100m', value: 12.3, holderId: 'p1' }, { scope: 'SR', discipline: 'ath.100m', value: 12.3, holderId: 'p1' }] }],
      ['f2', { discipline: 'ath.4x100', phase: 'final', title: '4×100 matches', date: '2026-03-01', category: c14, tournamentId: 't1', sport: 'athletics',
        recordsSet: [{ scope: 'MR', discipline: 'ath.4x100', value: 52.1, holderIds: ['p1', 'p2', 'p3', 'p4'] }] }],
      ['f3', { discipline: 'ath.200m', phase: 'final', title: '200 matches', date: '2026-03-01', category: c14, tournamentId: 't1', recordsSet: [{ scope: 'MR', discipline: 'ath.200m', value: 25.9, holderId: 'p9' }] }],
      ['f4', { discipline: 'ath.lj', phase: 'final', title: 'Long jump', date: '2026-03-01', category: c14 }],
    ]);
    const refs = recordsSetBy('p1', infos);
    assert.deepEqual(refs.map((r) => [r.eventId, r.scope, r.discipline, r.category, r.value, r.tournamentId]), [
      ['f1', 'MR', 'ath.100m', categoryKey(c14), 12.3, 't1'], ['f1', 'SR', 'ath.100m', categoryKey(c14), 12.3, 't1'], ['f2', 'MR', 'ath.4x100', categoryKey(c14), 52.1, 't1'],
    ]);
    assert.deepEqual(recordsSetBy('p9', new Map()), []);
    const k = categoryKey(c14);
    const mine: RecordMark = { scope: 'MR', discipline: 'ath.100m', category: k, value: 12.3, holder: 'Asha', holderId: 'p1' };
    assert.equal(stillHeld(refs[0], [mine], 'p1'), true);
    assert.equal(stillHeld(refs[0], [{ ...mine, value: 12.1, holder: 'Bina', holderId: 'p2' }], 'p1'), false, 'beaten since');
    assert.equal(stillHeld(refs[0], [{ ...mine, holderId: undefined }], 'p1'), false, 'no id: never claimed');
    assert.equal(stillHeld(refs[0], [{ ...mine, scope: 'SR' }], 'p1'), false, 'another scope');
    assert.equal(stillHeld(refs[0], [], 'p1'), false, 'rolled back / empty');
    assert.equal(stillHeld(refs[2], [{ scope: 'MR', discipline: 'ath.4x100', category: k, value: 52.1, holder: 'Red A', holderIds: ['p1', 'p2', 'p3', 'p4'] }], 'p1'), true, 'a relay member holds it');
  });

  test('records held: the card\'s words', () => {
    const recs = [{ eventId: 'f1', scope: 'MR' as const }, { eventId: 'f1', scope: 'SR' as const }];
    const all = new Set(recs.map(heldKey));
    assert.equal(heldKey(recs[0]), 'f1:MR');
    assert.equal(recordsHeldText(null, recs), '', 'until the books are read');
    assert.equal(recordsHeldText({ checked: all, held: all }, recs), 'all still held');
    assert.equal(recordsHeldText({ checked: all, held: new Set(['f1:MR']) }, recs), '1 still held');
    assert.equal(recordsHeldText({ checked: all, held: new Set() }, recs), 'none still held');
    assert.equal(recordsHeldText({ checked: new Set(['f1:MR']), held: new Set(['f1:MR']) }, recs.slice(0, 1)), 'still held');
    // one book couldn't be read: only a positive count is said
    assert.equal(recordsHeldText({ checked: new Set(['f1:MR']), held: new Set() }, recs), '');
    assert.equal(recordsHeldText({ checked: new Set(['f1:MR']), held: new Set(['f1:MR']) }, recs), '1 still held');
    assert.equal(recordHeldNote({ checked: all, held: new Set(['f1:MR']) }, recs[0]), ' · still held');
    assert.equal(recordHeldNote({ checked: all, held: new Set(['f1:MR']) }, recs[1]), ' · beaten since');
    assert.equal(recordHeldNote({ checked: new Set(), held: new Set() }, recs[1]), '');
  });

  test('records held: the careers hand the card the athlete and the phases', () => {
    for (const f of ['src/components/athletics/AthleticsCareer.tsx', 'src/components/results/CrewCareer.tsx', 'src/components/results/CyclingCareer.tsx']) {
      assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), /<RecordsSetCard c=\{c\} playerId=\{lines\[0\]\?\.playerId\} infos=\{infos\} \/>/, f);
    }
    const store = fs.readFileSync(path.join(ROOT, 'src/data/resultsStore.ts'), 'utf8');
    assert.match(store, /sport: e\.sport, \.\.\.\(e\.tournamentId \? \{ tournamentId: e\.tournamentId \} : \{\}\), \.\.\.\(f\.recordsSet\?\.length \? \{ recordsSet: f\.recordsSet \} : \{\}\)/);
    assert.match(store, /export async function getRecordsHeld\(playerId: string, infos: ReadonlyMap<string, PhaseInfo>\): Promise<RecordsHeld>/);
  });
});
