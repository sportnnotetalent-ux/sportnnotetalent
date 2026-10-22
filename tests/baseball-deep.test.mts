/**
 * Deep wave — baseball / softball at MLB / WBSC box-score depth (OBR 9.00):
 *  - old logs replay identically (same game; no toggle flags in the config,
 *    no pitch-count keys when pitch-by-pitch is off, no capture fields);
 *  - FREE figures derived from the log: RISP ("2-for-9"), two-out RBI, LOB
 *    per half-inning, GO-AO, double plays turned, inherited runners–scored;
 *    pitch-by-pitch only: pitches–strikes, strike %, first-pitch strikes;
 *  - optional capture: pitch types (the next pitch only) and spray zones (a
 *    tap, else the fielders' notation) → the sheet's pitch mix and spray;
 *  - statTotals: new keys are derived (contract harness, every undo prefix);
 *  - the sheet (scope = inning), the box (P-S column, MLB-style notes), the
 *    commentary by half-inning (sentences, running score, end-of-half lines,
 *    filters, corrections), schema / career / live settings.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, buildPitch, buildPlay, buildRunner, readConfig, withAnn, zoneOf, zoneOfNotation, pitchTypesFor, trackTracked,
  BASEBALL_LIVE_SETTINGS, TRACK_FIELDS,
  type BaseballState, type Outcome, type Move, type Zone, type PitchType,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals, DERIVED_KEYS, PITCH_COUNT_KEYS, SITUATIONAL_KEYS } from '../src/sports/baseball/totals.ts';
import { batterFigures, pitcherFigures, teamSplit } from '../src/sports/baseball/situational.ts';
import { baseballSheet, inningScopes, rowOf } from '../src/sports/baseball/sheet.ts';
import { baseballCommentary, paSentence, runnerSentence, BASEBALL_FEED_TAGS } from '../src/sports/baseball/commentary.ts';
import { baseballBox, baseballPitchingBox, battingNotes, pitchingNotes } from '../src/sports/baseball/box.ts';
import { baseballStats, baseballPitchingStats } from '../src/sports/baseball/stats.ts';
import { baseballTimeline } from '../src/sports/baseball/timeline.ts';
import { filterFeed, feedTags } from '../src/sports/feedGroups.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

/* ---------------------------------- helpers --------------------------------- */

const ORDER = (p: string, n = 9) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
const NAMES = { home: 'Hawks', away: 'Owls' };
function start(config?: Record<string, unknown>): BaseballState {
  let s = init(config);
  const n = readConfig(config).lineupSize;
  s = reducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h', n), pitcher: { id: 'hp', name: 'HP' } } });
  s = reducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a', n), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}
type Step = (s: BaseballState) => ScoreAction;
const P = (o: Outcome, x: { moves?: (s: BaseballState) => Move[]; fielders?: string; zone?: Zone; ptype?: PitchType; rbi?: number } = {}): Step =>
  (s) => buildPlay(s, o, { ...(x.moves ? { moves: x.moves(s) } : {}), ...(x.fielders ? { fielders: x.fielders } : {}), ...(x.zone ? { zone: x.zone } : {}), ...(x.ptype ? { ptype: x.ptype } : {}), ...(x.rbi !== undefined ? { rbi: x.rbi } : {}) });
const pitch = (k: 'ball' | 'called' | 'swinging' | 'foul', ptype?: string): Step => (s) => buildPitch(s, k, ptype ? { ptype } : {});
const runner = (k: Parameters<typeof buildRunner>[1]): Step => (s) => buildRunner(s, k);
const sub = (side: 'home' | 'away', payload: Record<string, unknown>): Step => () => ({ type: 'SUB', side, payload: { uid: `sub${Math.random()}`, ...payload } });
function play(s: BaseballState, steps: Step[]): { s: BaseballState; actions: ScoreAction[] } {
  const actions: ScoreAction[] = [];
  for (const st of steps) { const a = st(s); actions.push(a); s = reducer(s, a); }
  return { s, actions };
}
const outs = (n: number): Step[] => Array.from({ length: n }, () => P('GO'));

/** a scripted top 1st: double, single (RISP), 4-pitch strikeout, 6-3, steal, 2-out homer, F8 */
const TOP1: Step[] = [
  pitch('called', 'FB'), P('2B', { zone: 'RC', ptype: 'SL' }),
  P('1B', { zone: 'LF' }),
  pitch('ball'), pitch('swinging'), pitch('foul'), pitch('swinging', 'SL'),
  P('GO', { fielders: '6-3' }),
  runner('SB'),
  P('HR', { zone: 'LC' }),
  P('FO', { fielders: '8' }),
];

/* --------------------------------- old logs ---------------------------------- */

describe('deep wave · old logs replay identically', () => {
  const steps: Step[] = [...TOP1, P('BB'), P('1B'), ...outs(3), P('E', { fielders: 'E6' }), runner('WP'), P('DP')];
  const plain = play(start(), steps).s;
  const tracked = play(start({ pitchTypes: true, sprayZones: true }), steps).s;
  test('the toggles never change the game: same score, line, hits, errors, LOB, pitches, decisions', () => {
    for (const k of ['score', 'line', 'hits', 'errors', 'lob', 'pitches', 'half', 'outs', 'next', 'decisions', 'ended'] as const) assert.deepEqual(tracked.g[k], plain.g[k], k);
    assert.deepEqual([plain.g.score.away, plain.g.score.home], [3, 0]);
  });
  test('no toggle flags in an old config; the toggles appear only when on', () => {
    assert.equal('pitchTypes' in init().cfg, false);
    assert.equal('sprayZones' in init().cfg, false);
    assert.deepEqual([readConfig({ pitchTypes: true }).pitchTypes, readConfig({ sprayZones: 'true' }).sprayZones], [true, true]);
  });
  test('a game scored without pitch-by-pitch gets no pitch-count keys (never a false 0)', () => {
    const s = play(start({ pitches: false }), [P('1B'), P('K'), P('GO'), P('FO')]).s;
    const t = baseballTotals(s);
    for (const l of Object.values(t)) for (const k of PITCH_COUNT_KEYS) assert.equal(k in l.stats, false, k);
    // the free situational keys are there (true zeros)
    assert.deepEqual([t.hp.stats.pitchGroundOuts, t.hp.stats.pitchFlyOuts, t.a1.stats.rispAb], [1, 1, 0]);
    const sh = baseballSheet(s);
    assert.equal(rowOf(sh, 'pitching', 'ps'), undefined);
    assert.equal(rowOf(sh, 'pitching', 'fps'), undefined);
    assert.equal(sh.sections.find((x) => x.key === 'pitching')!.note, 'Pitch counts need pitch-by-pitch scoring.');
  });
  test('a state saved before the annotations existed is re-derived to the same figures', () => {
    const old = structuredClone(plain);
    for (const a of Object.values(old.g.ann)) { delete a.on; delete a.lob; delete a.fp; delete a.np; delete a.pk; delete a.inh; }
    assert.deepEqual(withAnn(old).g.ann, plain.g.ann);
    assert.deepEqual(baseballSheet(old), baseballSheet(plain));
    assert.deepEqual(baseballCommentary(old, NAMES), baseballCommentary(plain, NAMES));
  });
  test('no capture fields on events when the toggles are off; untracked sections stay hidden', () => {
    const s = play(start(), [P('1B'), P('GO', { fielders: '6-3' })]).s;
    assert.ok(s.events.every((e) => e.zone === undefined));
    const keys = baseballSheet(s).sections.map((x) => x.key);
    assert.ok(!keys.includes('mix') && !keys.includes('spray'));
  });
});

/* ------------------------------ free figures ---------------------------------- */

describe('deep wave · RISP, two-out RBI, LOB, GO-AO, double plays (derived)', () => {
  const s = play(start(), TOP1).s;
  test('RISP: a runner on 2nd or 3rd when the plate appearance ended — 2-for-4', () => {
    const t = teamSplit(s, 'away');
    assert.deepEqual([t.rispHits, t.rispAb], [2, 4]);
    const b = Object.fromEntries(batterFigures(s).map((x) => [x.key, x]));
    assert.deepEqual([b.a1.rispAb, b.a2.rispAb, b.a2.rispHits, b.a3.rispAb, b.a4.rispAb, b.a5.rispHits, b.a6.rispAb], [0, 1, 1, 1, 1, 1, 0]);
    assert.equal(rowOf(baseballSheet(s), 'situational', 'risp')!.away, '2-for-4');
  });
  test('two-out RBI: the homer with two out drives in 3', () => {
    assert.equal(batterFigures(s).find((b) => b.key === 'a5')!.twoOutRbi, 3);
    const t = baseballTotals(s);
    assert.deepEqual([t.a5.stats.twoOutRbi, t.a5.stats.rispAb, t.a5.stats.rispHits, t.a1.stats.twoOutRbi], [3, 1, 1, 0]);
  });
  test('LOB per half-inning: the play that made the 3rd out carries it', () => {
    const g = play(start(), [P('1B'), P('BB'), ...outs(3), P('3B'), ...outs(3)]).s;
    const lobs = g.events.map((e) => g.g.ann[e.id].lob).filter((x) => x !== undefined);
    assert.deepEqual(lobs, [2, 1]);
    assert.equal(teamSplit(g, 'away', 1).lob, 2);
    assert.equal(teamSplit(g, 'home', 1).lob, 1);
    assert.equal(teamSplit(g, 'away').lob, g.g.lob.away, 'the half-innings add up to the game');
  });
  test('GO-AO and double plays turned', () => {
    // top: groundout, single, double play (the side is out); bottom: flyout, triple, sac fly, lineout
    const g = play(start(), [P('GO'), P('1B'), P('DP'), P('FO'), P('3B'), P('SF'), P('LO')]).s;
    const hp = pitcherFigures(g).find((p) => p.key === 'hp')!;
    assert.deepEqual([hp.go, hp.ao], [2, 0]);
    assert.equal(teamSplit(g, 'home').dp, 1);
    const ap = pitcherFigures(g).find((p) => p.key === 'ap')!;
    assert.deepEqual([ap.go, ap.ao], [0, 3], 'the sac fly is a fly out');
    assert.equal(rowOf(baseballSheet(g), 'fielding', 'dp')!.home, '1');
    assert.equal(rowOf(baseballSheet(g), 'pitching', 'goao')!.home, '2-0');
  });
  test('inherited runners: the reliever inherits two, both score (charged to the starter)', () => {
    const g = play(start(), [P('1B'), P('BB'), sub('home', { kind: 'p', on: { id: 'hr1', name: 'HR1' }, off: { id: 'hp', name: 'HP' } }), P('2B'), P('SF')]).s;
    const t = baseballTotals(g);
    assert.deepEqual([t.hr1.stats.inheritedRunners, t.hr1.stats.inheritedScored], [2, 2]);
    assert.equal(t.hp.stats.runsAllowed, 2);
    assert.equal('inheritedRunners' in t.hp.stats, false, 'a starter inherits nobody');
    assert.equal(rowOf(baseballSheet(g), 'pitching', 'irs')!.home, '2-2');
    assert.ok(pitchingNotes(g).includes('Inherited runners–scored: HR1 2-2'));
  });
});

/* -------------------------- pitch by pitch figures --------------------------- */

describe('deep wave · pitches–strikes and first-pitch strikes (pitch by pitch)', () => {
  // PA1 called + single in play; PA2 four balls; PA3 three swinging strikes
  const s = play(start(), [pitch('called'), P('1B'), pitch('ball'), pitch('ball'), pitch('ball'), pitch('ball'), pitch('swinging'), pitch('swinging'), pitch('swinging')]).s;
  test('per pitcher: 9 pitches, 5 strikes, 4 balls; first-pitch strikes 2 of 3', () => {
    const t = baseballTotals(s).hp.stats;
    assert.deepEqual([t.pitches, t.strikesThrown, t.ballsThrown, t.firstPitchStrikes, t.firstPitches], [9, 5, 4, 2, 3]);
    assert.equal(t.strikesThrown + t.ballsThrown, t.pitches);
  });
  test('sheet: pitches–strikes, strike %, first-pitch strikes', () => {
    const sh = baseballSheet(s);
    assert.equal(rowOf(sh, 'pitching', 'ps')!.home, '9-5');
    assert.equal(rowOf(sh, 'pitching', 'strikePct')!.home, '56%');
    assert.equal(rowOf(sh, 'pitching', 'fps')!.home, '2/3 (67%)');
  });
  test('box: a P-S column replaces NP; outcomes only keeps NP', () => {
    const cols = buildBoxTable(baseballPitchingStats, baseballPitchingBox(s).data('all')).columns.map((c) => c.abbr);
    assert.ok(cols.includes('P-S') && !cols.includes('NP'));
    const hp = buildBoxTable(baseballPitchingStats, baseballPitchingBox(s).data('all')).home.rows[0];
    assert.equal(hp.cells[cols.indexOf('P-S')], '9-5');
    const off = play(start({ pitches: false }), [P('1B'), P('K')]).s;
    const offCols = buildBoxTable(baseballPitchingStats, baseballPitchingBox(off).data('all')).columns.map((c) => c.abbr);
    assert.ok(offCols.includes('NP') && !offCols.includes('P-S'));
  });
  test('a half-inning ending mid plate appearance restarts the first pitch', () => {
    // two out, a runner on; a pitch, then caught stealing ends the half
    const g = play(start(), [P('GO'), P('GO'), P('1B'), pitch('ball'), (st) => buildRunner(st, 'CS'), pitch('called')]).s;
    const firsts = g.events.filter((e) => g.g.ann[e.id].fp).length;
    assert.equal(firsts, 5, '4 plate appearances + the new half\'s first pitch');
  });
});

/* ----------------------------- optional capture ------------------------------- */

describe('deep wave · pitch types and spray zones (optional capture)', () => {
  test('a pitch type rides on one pitch (and a PA\'s final pitch); unknown types are ignored', () => {
    let s = start({ pitchTypes: true });
    s = reducer(s, buildPitch(s, 'called', { ptype: 'SL' }));
    assert.equal(s.events.at(-1)!.ptype, 'SL');
    s = reducer(s, buildPitch(s, 'ball', { ptype: 'SPITBALL' }));
    assert.equal(s.events.at(-1)!.ptype, undefined);
    for (let i = 0; i < 2; i++) s = reducer(s, buildPitch(s, 'ball'));
    s = reducer(s, buildPitch(s, 'ball', { ptype: 'CH' })); // ball four → the walk
    assert.deepEqual([s.events.at(-1)!.outcome, s.events.at(-1)!.ptype], ['BB', 'CH']);
    s = reducer(s, buildPlay(s, 'IBB', { ptype: 'FB' }));
    assert.equal(s.events.at(-1)!.ptype, undefined, 'no pitch, no type');
    assert.ok(trackTracked(s, 'pitchTypes'));
  });
  test('softball formats offer softball pitches', () => {
    assert.deepEqual(pitchTypesFor(readConfig({ preset: 'softball' })), ['RISE', 'DROP', 'CURVE', 'CH', 'SCREW']);
    assert.equal(pitchTypesFor(readConfig()).length, 8);
  });
  test('pitch mix: the sheet section and the box note', () => {
    const s = play(start({ pitchTypes: true }), [pitch('called', 'FB'), P('2B', { ptype: 'SL' }), pitch('swinging', 'SL'), P('GO')]).s;
    const mix = baseballSheet(s).sections.find((x) => x.key === 'mix')!;
    assert.deepEqual(mix.rows.map((r) => [r.label, r.home]), [['Slider', '2 (67%)'], ['Fastball', '1 (33%)']]);
    assert.ok(pitchingNotes(s).includes('Pitch mix · HP: SL 2 · FB 1'));
    assert.deepEqual(pitcherFigures(s).find((p) => p.key === 'hp')!.mix, { FB: 1, SL: 2 });
  });
  test('a zone on a ball in play only; the notation gives one too', () => {
    let s = start({ sprayZones: true });
    s = reducer(s, buildPlay(s, 'K', { zone: 'LF' }));
    assert.equal(s.events.at(-1)!.zone, undefined, 'a strikeout goes nowhere');
    s = reducer(s, buildPlay(s, '1B', { zone: 'RC' }));
    assert.equal(s.events.at(-1)!.zone, 'RC');
    assert.deepEqual(['6-3', 'F8', '8', 'E5', '1-3', '', undefined].map((f) => zoneOfNotation(f)), ['SS', 'CF', 'CF', '3B', 'P', undefined, undefined]);
    assert.equal(zoneOf({ outcome: 'GO', fielders: '4-3' }), '2B');
    assert.equal(zoneOf({ outcome: 'K', fielders: '2' }), undefined);
  });
  test('spray section: balls in play and hits by zone (taps + notation), only when tracked', () => {
    const steps = [P('1B', { zone: 'LF' }), P('2B', { zone: 'LF' }), P('GO', { fielders: '6-3' }), P('FO', { zone: 'CF' })];
    const s = play(start({ sprayZones: true }), steps).s;
    const spray = baseballSheet(s).sections.find((x) => x.key === 'spray')!;
    assert.deepEqual(spray.rows.map((r) => [r.label, r.away]), [['Left field', '2 · 2 H'], ['Centre field', '1 · 0 H'], ['Shortstop', '1 · 0 H']]);
    assert.ok(!baseballSheet(play(start({ askFielders: true }), [P('GO', { fielders: '6-3' })]).s).sections.some((x) => x.key === 'spray'), 'notation alone is not a spray chart');
  });
  test('live settings and the format carry the toggles (off by default)', () => {
    assert.deepEqual(TRACK_FIELDS.map((f) => [f.key, f.default, f.group]), [['pitchTypes', false, 'Stats to track'], ['sprayZones', false, 'Stats to track']]);
    assert.deepEqual(BASEBALL_LIVE_SETTINGS.read(init({ pitchTypes: true })), { pitches: true, askFielders: false, pitchTypes: true, sprayZones: false });
    assert.equal(BASEBALL_LIVE_SETTINGS.mode, 'config');
    assert.equal(BASEBALL_LIVE_SETTINGS.defaults?.sprayZones, false);
  });
});

/* ------------------------------ statTotals ----------------------------------- */

const SPORT: TotalsSport<BaseballState> = { name: 'baseball deep', init: () => start({ pitchTypes: true, sprayZones: true }), reducer, statTotals: baseballTotals, partial: false, derived: DERIVED_KEYS };

describe('deep wave · statTotals contract (SD-19 harness)', () => {
  const GAME: Step[] = [
    ...TOP1, P('BB'), P('1B'), sub('away', { kind: 'p', on: { id: 'ar', name: 'AR' }, off: { id: 'ap', name: 'AP' } }), P('2B'), P('GO'), P('GO'), P('K'),
    P('E', { fielders: 'E6' }), runner('WP'), P('DP'),
  ];
  test('clean log + every undo prefix: live keys = live sums; the new keys are derived and ≥ 0', () => {
    // two halves: the away pitcher changes mid-inning in the bottom 1st
    const actions = play(start({ pitchTypes: true, sprayZones: true }), GAME).actions;
    const t = assertContract(SPORT, toRecords(actions), { every: 1 });
    assert.equal(t.a5.stats.twoOutRbi, 3);
    assert.ok(t.ar.stats.inheritedRunners >= 1);
    for (const k of [...SITUATIONAL_KEYS, ...PITCH_COUNT_KEYS]) assert.ok((DERIVED_KEYS as readonly string[]).includes(k), k);
  });
  test('every new key is declared on the schema', () => {
    const keys = new Set(baseballStats.stats.map((d) => d.key));
    for (const k of [...SITUATIONAL_KEYS, ...PITCH_COUNT_KEYS, 'rispAvg', 'strikePct', 'firstPitchStrikePct', 'goAo']) assert.ok(keys.has(k), k);
  });
});

/* ------------------------------ sheet + box ---------------------------------- */

describe('deep wave · the match stats sheet and box notes', () => {
  const s = play(start(), [...TOP1, P('BB'), P('K'), P('GO'), P('E', { fielders: 'E5' }), P('FO'), P('3B'), ...outs(3)]).s;
  test('sections and rows: batting, situational, running, pitching, pitch mix, fielding, spray', () => {
    const sh = baseballSheet(s);
    // TOP1 recorded pitch types and zones, so those sections show (recorded = tracked)
    assert.deepEqual(sh.sections.map((x) => x.key), ['batting', 'situational', 'running', 'pitching', 'mix', 'fielding', 'spray']);
    assert.deepEqual([rowOf(sh, 'batting', 'runs')!.away, rowOf(sh, 'batting', 'hits')!.away, rowOf(sh, 'batting', 'hr')!.away], ['3', '4', '1']);
    assert.equal(rowOf(sh, 'batting', 'avg')!.away, '.400');
    assert.equal(rowOf(sh, 'running', 'sb')!.away, '1');
    assert.equal(rowOf(sh, 'fielding', 'errors')!.away, '1', 'the error the visitors made in the field');
    assert.deepEqual([rowOf(sh, 'situational', 'lob')!.home, rowOf(sh, 'situational', 'lob')!.away], ['2', '1']);
    const plainGame = baseballSheet(play(start(), [P('1B'), P('GO'), P('BB'), P('K')]).s);
    assert.deepEqual(plainGame.sections.map((x) => x.key), ['batting', 'situational', 'pitching', 'fielding']);
  });
  test('scope = one inning (both halves); the chips from two innings', () => {
    const one = baseballSheet(s, 1);
    assert.equal(rowOf(one, 'batting', 'runs')!.away, '3');
    const two = baseballSheet(s, 2);
    assert.equal(rowOf(two, 'batting', 'runs')!.away, '0');
    assert.deepEqual(inningScopes(s).map((x) => x.label), ['1st', '2nd']);
    assert.deepEqual(inningScopes(play(start(), [P('1B')]).s), []);
  });
  test('batting box notes: team RISP, two-out RBI', () => {
    const notes = battingNotes(s, { names: NAMES });
    assert.equal(notes[0], 'With RISP: Owls 2-for-7 · Hawks 0-for-1');
    assert.equal(notes[1], '2-out RBI: A5 3');
    assert.ok(baseballBox(s, { names: NAMES }).notes);
  });
  test('pitching box notes: first-pitch strikes–BF, GO–AO, BF', () => {
    const notes = pitchingNotes(s);
    assert.ok(notes.some((n) => n.startsWith('First-pitch strikes–batters faced: HP ')));
    assert.ok(notes.includes('Ground outs–fly outs: HP 4-1 · AP 1-1'));
    assert.ok(notes.includes('Batters faced: HP 10 · AP 5'));
  });
});

/* ------------------------------- commentary ---------------------------------- */

describe('deep wave · commentary by half-inning, newest first', () => {
  const s = play(start(), [...TOP1, P('BB'), sub('home', { kind: 'p', on: { id: 'ar', name: 'AR' } }), P('K'), P('GO'), P('E', { fielders: 'E5' }), P('3B'), P('FO')]).s;
  const feed = baseballCommentary(s, NAMES);
  test('groups: newest first, titled by half, with the half\'s summary', () => {
    assert.deepEqual(feed.map((g) => g.title), ['Bottom 1st', 'Top 1st']);
    assert.equal(feed[1].sub, 'Owls · 3 runs, 3 hits, 0 errors, 0 left on base');
    assert.equal(feed[0].sub, 'Hawks · 2 runs, 1 hit, 1 error, 1 left on base');
    assert.deepEqual([feed[1].scope, feed[1].side, feed[0].side], [1, 'away', 'home']);
  });
  test('sentences: hits with direction and runners, the count on a strikeout, the notation on outs, the homer', () => {
    const top = [...feed[1].lines].reverse().map((l) => l.text);
    assert.equal(top[0], 'A1 doubles to right-centre on a slider.');
    assert.equal(top[1], 'A2 singles to left. A1 to 3rd.');
    assert.equal(top[2], 'A3 strikes out swinging on a slider (1-2, 4 pitches).');
    assert.equal(top[3], 'A4 grounds out, shortstop to first (6-3).');
    assert.equal(top[4], 'A2 steals 2nd.');
    assert.equal(top[5], 'A5 homers to left-centre — 3 RBI. A1 and A2 score.');
    assert.equal(top[6], 'A6 flies out to centre (8).');
    assert.equal(top[7], 'Middle of the 1st: Owls 3, Hawks 0.');
  });
  test('the running score (visitors first) after every run; the stamp is the outs', () => {
    const hr = feed[1].lines.find((l) => l.text.startsWith('A5 homers'))!;
    assert.deepEqual([hr.score, hr.when, hr.key], ['3–0', '2 out', true]);
    assert.equal(feed[1].lines.find((l) => l.text.startsWith('A1 doubles'))!.score, undefined);
  });
  test('pitching change, error, triple; filters by tag and inning', () => {
    const bottom = feed[0].lines.map((l) => l.text);
    assert.ok(bottom.includes('Pitching change for Hawks: AR takes the mound.'));
    assert.ok(bottom.includes('H4 reaches on an error by the third baseman (E5). H1 to 2nd.'));
    assert.ok(bottom.includes('H5 triples. H1 and H4 score.'));
    assert.equal(feed[0].lines.find((l) => l.text.startsWith('H5 triples'))!.score, '3–2');
    assert.deepEqual(filterFeed(feed, { tag: 'k' }).flatMap((g) => g.lines.map((l) => l.text)), ['H2 strikes out swinging.', 'A3 strikes out swinging on a slider (1-2, 4 pitches).']);
    assert.deepEqual(filterFeed(feed, { tag: 'pitching' }).flatMap((g) => g.lines).length, 1);
    assert.ok(filterFeed(feed, { tag: 'key' }).flatMap((g) => g.lines).every((l) => l.key));
    assert.deepEqual(feedTags(feed, BASEBALL_FEED_TAGS).map((t) => t.key), ['key', 'score', 'hit', 'k', 'bb', 'pitching', 'run']);
  });
  test('a correction re-derives it (removing the homer)', () => {
    const hr = s.events.find((e) => e.outcome === 'HR')!;
    const t = reducer(s, { type: 'REMOVE_EVENT', payload: { id: hr.id } });
    const f = baseballCommentary(t, NAMES);
    assert.ok(!f.flatMap((g) => g.lines).some((l) => l.text.includes('homers')));
    assert.equal(f.find((g) => g.title === 'Top 1st')!.sub!.startsWith('Owls · 0 runs'), true);
  });
  test('the final: walk-off and extra innings', () => {
    const steps: Step[] = [];
    for (let i = 0; i < 8; i++) steps.push(...outs(3), ...outs(3));
    steps.push(...outs(3), P('HR'));
    const w = play(start(), steps).s;
    const f = baseballCommentary(w, NAMES);
    assert.equal(f[0].title, 'Bottom 9th');
    assert.equal(f[0].lines[0].text, 'Final: Owls 0, Hawks 1. Walk-off win for Hawks!');
    assert.equal(f[0].lines[1].text, 'H7 homers.');
    assert.equal(f[1].lines[0].text, 'Middle of the 9th: Owls 0, Hawks 0.');
    // extras: the tie-break runners are placed, not batted on
    const x: Step[] = [];
    for (let i = 0; i < 9; i++) x.push(...outs(3), ...outs(3));
    const e = play(start(), [...x, P('1B')]).s;
    const top10 = baseballCommentary(e, NAMES)[0];
    assert.equal(top10.title, 'Top 10th');
    assert.equal(top10.lines.at(-1)!.text, 'Tie-break: runners start on 1st and 2nd.');
  });
  test('runner plays and plate appearances read as sentences', () => {
    const e = (x: Record<string, unknown>) => ({ id: 'x', type: 'runner', side: 'away', ...x }) as never;
    assert.equal(runnerSentence(e({ kind: 'CS', moves: [{ from: 1, to: -1, name: 'Rao' }] }), 0), 'Rao is caught stealing 2nd.');
    assert.equal(runnerSentence(e({ kind: 'WP', moves: [{ from: 3, to: 4, name: 'Rao' }, { from: 1, to: 2, name: 'Iyer' }] }), 1), 'Wild pitch. Rao scores. Iyer to 2nd.');
    assert.equal(runnerSentence(e({ kind: 'PO', moves: [{ from: 1, to: -1, name: 'Rao' }] }), 0), 'Rao is picked off 1st.');
    const st = start();
    const pa = (x: Record<string, unknown>) => paSentence(st, { id: 'p', type: 'pa', side: 'away', batter: { name: 'Khan' }, ...x } as never);
    assert.equal(pa({ outcome: 'DP', fielders: '6-4-3' }), 'Khan grounds into a double play, shortstop to second to first (6-4-3).');
    assert.equal(pa({ outcome: 'FO', fielders: '6' }), 'Khan pops out to short (6).');
    assert.equal(pa({ outcome: 'GO', fielders: '3' }), 'Khan grounds out to first, unassisted (3).');
    assert.equal(pa({ outcome: 'HR', rbi: 4, zone: 'LF' }), 'Khan hits a grand slam to left!');
    assert.equal(pa({ outcome: 'K', pitch: 'called' }), 'Khan strikes out looking.');
    assert.equal(pa({ outcome: 'HBP', ptype: 'FB' }), 'Khan is hit by a fastball.');
    assert.equal(pa({ outcome: 'IBB' }), 'Khan is intentionally walked.');
  });
  test('the key-moments timeline still reads the plays (zone in the detail)', () => {
    const t = play(start({ sprayZones: true }), [P('1B', { zone: 'LF' })]).s;
    assert.match(baseballTimeline(t)[0].detail ?? '', /→ LF/);
  });
});

/* --------------------------- schema, career, leaders ------------------------- */

describe('deep wave · schema, career rows, leaders', () => {
  test('the schemas stay valid; P-S is a pitches-strikes pair', () => {
    assert.deepEqual(validateSchema(baseballStats), []);
    assert.deepEqual(validateSchema(baseballPitchingStats), []);
    const ps = baseballPitchingStats.box![0].columns.find((c) => typeof c !== 'string' && c.key === 'ps');
    assert.deepEqual(typeof ps === 'string' ? null : ps?.pair, ['pitches', 'strikesThrown']);
    for (const k of ['rispAvg', 'twoOutRbi', 'strikePct', 'firstPitchStrikePct']) assert.ok(baseballStats.leaders.includes(k), k);
  });
  const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'baseball', stats } as unknown as StatLine);
  test('career: AVG with RISP and two-out RBI, with how many games tracked them', () => {
    const c = careerSections(baseballStats, [
      line({ atBats: 4, hits: 2, rispAb: 2, rispHits: 1, twoOutRbi: 2 }, 1),
      line({ atBats: 4, hits: 1, rispAb: 2, rispHits: 1, twoOutRbi: 0 }, 2),
      line({ atBats: 4, hits: 1 }, 3), // an older line: not tracked, not a 0
    ]);
    const rows = c.flatMap((x) => x.rows);
    const r = rows.find((x) => x.key === 'rispAvg')!;
    assert.equal(r.value, '.500');
    assert.deepEqual(r.coverage, { tracked: 2, total: 3 });
    assert.equal(rows.find((x) => x.key === 'twoOutRbi')!.value, '2');
  });
  test('career: strike % and first-pitch strike % for pitchers; hidden when never tracked', () => {
    const c = careerSections(baseballStats, [
      line({ outsPitched: 18, gamesPitched: 1, strikesThrown: 60, ballsThrown: 40, firstPitchStrikes: 15, firstPitches: 24 }, 1),
      line({ outsPitched: 9, gamesPitched: 1 }, 2),
    ]);
    const rows = c.flatMap((x) => x.rows);
    assert.equal(rows.find((x) => x.key === 'strikePct')!.value, '60.0%');
    assert.equal(rows.find((x) => x.key === 'firstPitchStrikePct')!.value, '62.5%');
    const none = careerSections(baseballStats, [line({ outsPitched: 9, gamesPitched: 1 }, 1)]).flatMap((x) => x.rows);
    assert.ok(!none.some((x) => ['strikePct', 'firstPitchStrikePct', 'rispAvg', 'goAo'].includes(x.key)));
  });
});
