/**
 * Round 2 — baseball / softball (founder-approved):
 *  - GO-AO: a sacrifice bunt now counts as a ground out (a fielder's choice
 *    is still neither — the batter isn't out);
 *  - the house minimums stay: 10 at bats with RISP, 100 pitches for strike %,
 *    30 batters faced for first-pitch strike % (pinned here);
 *  - BATTED-BALL TYPE, an optional toggle (off by default): ground ball / line
 *    drive / fly ball / popup — a tap on the in-play sheets (`btype`, balls in
 *    play only, unknown values ignored), else what the out fixes (groundout =
 *    GB, lineout = LD, sac fly = FB, an infielder's fly out = PU …);
 *  - per team on the sheet, per batter and pitcher on the stat line (keyed:
 *    only games that tracked it), GB / LD / FB / PU % in careers (Statcast:
 *    over all typed batted balls; house minimum 30), pitcher GB % leaders;
 *  - commentary uses a tapped type; old logs replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, buildPlay, readConfig, battedBallOf, battedBallOfPlay, trackTracked, isBattedBall,
  BASEBALL_LIVE_SETTINGS, TRACK_FIELDS, BATTED_BALLS,
  type BaseballState, type BattedBall, type Outcome, type Zone,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals, BATTED_BALL_KEYS, DERIVED_KEYS } from '../src/sports/baseball/totals.ts';
import { batterFigures, pitcherFigures, teamSplit, GROUND_OUT, AIR_OUT } from '../src/sports/baseball/situational.ts';
import { baseballSheet, rowOf } from '../src/sports/baseball/sheet.ts';
import { baseballCommentary, paSentence } from '../src/sports/baseball/commentary.ts';
import { pitchingNotes } from '../src/sports/baseball/box.ts';
import { baseballStats } from '../src/sports/baseball/stats.ts';
import { baseballTimeline } from '../src/sports/baseball/timeline.ts';
import { validateSchema, type StatDef } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { assertContract, toRecords, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}`, name: `${p.toUpperCase()}${i + 1}` }));
const NAMES = { home: 'Hawks', away: 'Owls' };
function start(config?: Record<string, unknown>): BaseballState {
  let s = init(config);
  s = reducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp', name: 'HP' } } });
  s = reducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap', name: 'AP' } } });
  return s;
}
type Step = (s: BaseballState) => ScoreAction;
const P = (o: Outcome, x: { fielders?: string; zone?: Zone; btype?: BattedBall } = {}): Step => (s) => buildPlay(s, o, x);
function play(s: BaseballState, steps: Step[]): { s: BaseballState; actions: ScoreAction[] } {
  const actions: ScoreAction[] = [];
  for (const st of steps) { const a = st(s); actions.push(a); s = reducer(s, a); }
  return { s, actions };
}
const ON = { battedBallTypes: true };

/** top 1st: tapped liner single, 6-3 groundout, pop out to short, untapped double, lineout;
 *  bottom 1st: sac bunt, tapped fly-ball homer, sac fly (no runner on: the batter out), strikeout */
const GAME: Step[] = [
  P('1B', { btype: 'LD', zone: 'LF' }), P('GO', { fielders: '6-3' }), P('FO', { fielders: '6' }), P('2B'), P('LO'),
  P('SH'), P('HR', { btype: 'FB' }), P('SF'), P('K'),
];

/* ------------------------------------ GO-AO ------------------------------------ */

describe('round 2 · GO-AO: a sacrifice bunt is a ground out (founder)', () => {
  test('the lists: GO, DP, SH vs FO, LO, SF; a fielder\'s choice is neither', () => {
    assert.deepEqual(GROUND_OUT, ['GO', 'DP', 'SH']);
    assert.deepEqual(AIR_OUT, ['FO', 'LO', 'SF']);
    const fc = play(start(), [P('1B'), P('FC')]).s;
    const hp = pitcherFigures(fc).find((p) => p.key === 'hp')!;
    assert.deepEqual([hp.go, hp.ao], [0, 0], 'the batter reached: no ground out');
  });
  test('the pitcher\'s figures, the stat line, the sheet and the box notes count the bunt', () => {
    const s = play(start(), GAME).s;
    const ap = pitcherFigures(s).find((p) => p.key === 'ap')!;
    assert.deepEqual([ap.go, ap.ao], [1, 1], 'sac bunt + sac fly');
    assert.deepEqual([baseballTotals(s).ap.stats.pitchGroundOuts, baseballTotals(s).ap.stats.pitchFlyOuts], [1, 1]);
    assert.deepEqual([rowOf(baseballSheet(s), 'pitching', 'goao')!.home, rowOf(baseballSheet(s), 'pitching', 'goao')!.away], ['1-2', '1-1']);
    assert.ok(pitchingNotes(s).includes('Ground outs–fly outs: HP 1-2 · AP 1-1'));
  });
});

/* ------------------------------ house minimums -------------------------------- */

describe('round 2 · house minimums (unchanged, pinned)', () => {
  const den = (k: string) => { const a = (baseballStats.stats.find((d) => d.key === k) as StatDef).agg; return a?.kind === 'rate' ? a.qualifier?.den : undefined; };
  test('10 at bats with RISP, 100 pitches for strike %, 30 batters faced for first-pitch strike %', () => {
    assert.equal(den('rispAvg'), 10);
    assert.equal(den('strikePct'), 100);
    assert.equal(den('firstPitchStrikePct'), 30);
  });
  test('30 typed batted balls for every GB / LD / FB / PU % (batters and pitchers)', () => {
    for (const k of ['groundBallPct', 'lineDrivePct', 'flyBallPct', 'popupPct', 'pitchGroundBallPct', 'pitchLineDrivePct', 'pitchFlyBallPct', 'pitchPopupPct']) assert.equal(den(k), 30, k);
  });
});

/* ------------------------------ batted-ball type ------------------------------ */

describe('round 2 · batted-ball type: the tap, else what the out fixes', () => {
  test('the outcome fixes it for outs; hits and errors need the tap', () => {
    const t = (outcome: Outcome, fielders?: string, zone?: Zone) => battedBallOfPlay({ outcome, fielders, zone });
    assert.deepEqual(['GO', 'DP', 'SH', 'FC', 'LO', 'SF'].map((o) => t(o as Outcome)), ['GB', 'GB', 'GB', 'GB', 'LD', 'FB']);
    assert.deepEqual([t('FO', '6'), t('FO', '2'), t('FO', '8'), t('FO', undefined, 'SS'), t('FO', undefined, 'RC'), t('FO')], ['PU', 'PU', 'FB', 'PU', 'FB', 'FB']);
    assert.deepEqual(['1B', '2B', '3B', 'HR', 'E', 'K', 'BB', 'HBP'].map((o) => t(o as Outcome)), [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  });
  test('traditional letter notation: L6 liner, P4 / IF popup, F8 fly ball (F6 = popup), G6-3 grounder', () => {
    const t = (fielders: string, outcome: Outcome = 'FO') => battedBallOfPlay({ outcome, fielders });
    assert.deepEqual([t('L6'), t('P4'), t('IF'), t('IF4'), t('F8'), t('F6'), t('G6-3', 'GO'), t('l-5')], ['LD', 'PU', 'PU', 'PU', 'FB', 'PU', 'GB', 'LD']);
    assert.equal(t('E6', 'E'), undefined, 'an error is not a letter notation');
  });
  test('the scorer\'s tap wins; nothing outside a ball in play', () => {
    assert.equal(battedBallOf({ outcome: 'DP', btype: 'LD' }), 'LD', 'a line-drive double play');
    assert.equal(battedBallOf({ outcome: '1B', btype: 'GB' }), 'GB');
    assert.equal(battedBallOf({ outcome: 'K', btype: 'FB' }), undefined);
    assert.deepEqual([...BATTED_BALLS], ['GB', 'LD', 'FB', 'PU']);
    assert.deepEqual([isBattedBall('LD'), isBattedBall('ld'), isBattedBall('BUNT')], [true, false, false]);
  });
  test('the payload: on a ball in play only; unknown values ignored; none without the tap', () => {
    let s = start(ON);
    assert.equal(buildPlay(s, '1B').payload?.btype, undefined);
    assert.equal('btype' in buildPlay(s, '1B').payload!, false, 'no tap: the payload as before');
    assert.equal(buildPlay(s, 'K', { btype: 'LD' }).payload?.btype, undefined);
    s = reducer(s, buildPlay(s, '2B', { btype: 'LD' }));
    assert.equal(s.events.at(-1)!.btype, 'LD');
    const raw = buildPlay(s, 'GO');
    s = reducer(s, { ...raw, payload: { ...raw.payload, btype: 'BUNT' } });
    assert.equal('btype' in s.events.at(-1)!, false);
    const k = buildPlay(s, 'K');
    s = reducer(s, { ...k, payload: { ...k.payload, btype: 'FB' } });
    assert.equal('btype' in s.events.at(-1)!, false, 'a strikeout has no batted ball');
  });
});

/* ------------------------- counts, sheet, totals ------------------------------ */

describe('round 2 · batted balls per batter, pitcher and team (tracked games only)', () => {
  const s = play(start(ON), GAME).s;
  test('the figures: tapped and implied types; the untapped double has none', () => {
    const hp = pitcherFigures(s).find((p) => p.key === 'hp')!, ap = pitcherFigures(s).find((p) => p.key === 'ap')!;
    assert.deepEqual(hp.batted, { GB: 1, LD: 2, FB: 0, PU: 1 });
    assert.deepEqual(ap.batted, { GB: 1, LD: 0, FB: 2, PU: 0 });
    const away = teamSplit(s, 'away');
    assert.deepEqual([away.batted, away.untyped], [{ GB: 1, LD: 2, FB: 0, PU: 1 }, 1]);
    const b = Object.fromEntries(batterFigures(s).map((x) => [x.key, x.batted]));
    assert.deepEqual([b.a1.LD, b.a2.GB, b.a3.PU, b.h1.GB, b.h2.FB, b.h3.FB], [1, 1, 1, 1, 1, 1]);
    assert.deepEqual(b.a4, { GB: 0, LD: 0, FB: 0, PU: 0 });
  });
  test('the sheet: GB / LD / FB / PU with % of the typed balls, and the untyped count', () => {
    const sh = baseballSheet(s);
    const sec = sh.sections.find((x) => x.key === 'batted')!;
    assert.deepEqual(sec.rows.map((r) => [r.label, r.away, r.home]), [
      ['Ground balls', '1 (25%)', '1 (33%)'], ['Line drives', '2 (50%)', '0 (0%)'], ['Fly balls', '0 (0%)', '2 (67%)'], ['Popups', '1 (25%)', '0 (0%)'],
      ['Balls in play with no type', '1', '0'],
    ]);
    assert.ok(sec.note?.includes('hits need the tap'));
    assert.equal(rowOf(baseballSheet(s, 2), 'batted', 'bb:GB'), undefined, 'no ball in play in the 2nd yet: no section');
  });
  test('stat lines: every batter / pitcher of a tracked game carries the keys (true zeros)', () => {
    const t = baseballTotals(s);
    assert.deepEqual([t.a1.stats.lineDrives, t.a2.stats.groundBalls, t.a3.stats.popups, t.h2.stats.flyBalls], [1, 1, 1, 1]);
    assert.deepEqual([t.a4.stats.groundBalls, t.a4.stats.lineDrives, t.a4.stats.flyBalls, t.a4.stats.popups], [0, 0, 0, 0]);
    assert.deepEqual([t.hp.stats.pitchGroundBalls, t.hp.stats.pitchLineDrives, t.hp.stats.pitchFlyBalls, t.hp.stats.pitchPopups], [1, 2, 0, 1]);
    assert.equal('pitchGroundBalls' in t.h1.stats, false, 'a batter is not a pitcher');
  });
  test('untracked game: no keys, no section — even though the outs imply a type (never a false 0)', () => {
    const off = play(start(), GAME.map((st) => (x: BaseballState) => { const a = st(x); const { btype: _drop, ...payload } = a.payload ?? {}; return { ...a, payload }; })).s;
    assert.equal(trackTracked(off, 'battedBallTypes'), false);
    for (const l of Object.values(baseballTotals(off))) for (const k of BATTED_BALL_KEYS) assert.equal(k in l.stats, false, k);
    assert.ok(!baseballSheet(off).sections.some((x) => x.key === 'batted'));
    // a tapped type in a game with the toggle off still counts as tracked (as pitch types / zones do)
    assert.equal(trackTracked(play(start(), [P('1B', { btype: 'LD' })]).s, 'battedBallTypes'), true);
  });
  test('statTotals contract (SD-19 harness, every undo prefix): the new keys are derived and ≥ 0', () => {
    const SPORT: TotalsSport<BaseballState> = { name: 'baseball round 2', init: () => start(ON), reducer, statTotals: baseballTotals, partial: false, derived: DERIVED_KEYS };
    const t = assertContract(SPORT, toRecords(play(start(ON), GAME).actions));
    assert.equal(t.hp.stats.pitchLineDrives, 2);
    for (const k of BATTED_BALL_KEYS) assert.ok((DERIVED_KEYS as readonly string[]).includes(k), k);
  });
});

/* ---------------------------------- careers ----------------------------------- */

describe('round 2 · careers and leaders: GB / LD / FB / PU %', () => {
  const line = (stats: Record<string, number>, i: number) => ({ id: `l${i}`, playerId: 'p', matchId: `m${i}`, sport: 'baseball', stats } as unknown as StatLine);
  test('the schema stays valid; every new key is declared; pitcher GB % leads', () => {
    assert.deepEqual(validateSchema(baseballStats), []);
    const keys = new Set(baseballStats.stats.map((d) => d.key));
    for (const k of [...BATTED_BALL_KEYS, 'battedBalls', 'pitchBattedBalls', 'groundBallPct', 'lineDrivePct', 'flyBallPct', 'popupPct', 'pitchGroundBallPct']) assert.ok(keys.has(k), k);
    for (const k of BATTED_BALL_KEYS) assert.equal(baseballStats.stats.find((d) => d.key === k)?.coverage, 'keyed', k);
    assert.ok(baseballStats.leaders.includes('pitchGroundBallPct'));
  });
  test('batters: % of all typed batted balls, with how many games tracked them', () => {
    const c = careerSections(baseballStats, [
      line({ atBats: 4, groundBalls: 6, lineDrives: 2, flyBalls: 2, popups: 1 }, 1),
      line({ atBats: 4, groundBalls: 0, lineDrives: 2, flyBalls: 1, popups: 1 }, 2),
      line({ atBats: 4 }, 3), // an older game: not tracked, not a 0
    ]);
    const sec = c.find((x) => x.id === 'battedBalls')!;
    assert.deepEqual(sec.rows.map((r) => [r.label, r.value]), [['Batted balls (with a type)', '15'], ['GB %', '40.0%'], ['LD %', '26.7%'], ['FB %', '20.0%'], ['PU %', '13.3%']]);
    assert.deepEqual(sec.rows.find((r) => r.key === 'groundBallPct')!.coverage, { tracked: 2, total: 3 });
  });
  test('pitchers: batted balls allowed; both sections hidden when never tracked', () => {
    const c = careerSections(baseballStats, [line({ outsPitched: 9, gamesPitched: 1, pitchGroundBalls: 10, pitchLineDrives: 5, pitchFlyBalls: 4, pitchPopups: 1 }, 1)]);
    const sec = c.find((x) => x.id === 'battedBallsAllowed')!;
    assert.deepEqual(sec.rows.slice(0, 2).map((r) => [r.label, r.value]), [['Batted balls allowed (with a type)', '20'], ['GB %', '50.0%']]);
    const none = careerSections(baseballStats, [line({ atBats: 4, hits: 1 }, 1), line({ outsPitched: 9, gamesPitched: 1 }, 2)]);
    assert.ok(!none.some((x) => x.id === 'battedBalls' || x.id === 'battedBallsAllowed'));
  });
});

/* ----------------------------- commentary, timeline ---------------------------- */

describe('round 2 · commentary and the timeline use a tapped type', () => {
  const st = start();
  const pa = (x: Record<string, unknown>) => paSentence(st, { id: 'p', type: 'pa', side: 'away', batter: { name: 'Khan' }, ...x } as never);
  test('hits: "hits a line-drive single to left"; untapped hits read as before', () => {
    assert.equal(pa({ outcome: '1B', btype: 'LD', zone: 'LF' }), 'Khan hits a line-drive single to left.');
    assert.equal(pa({ outcome: '2B', btype: 'GB', zone: 'LF', ptype: 'SL' }), 'Khan hits a ground-ball double to left on a slider.');
    assert.equal(pa({ outcome: 'HR', btype: 'FB', rbi: 2 }), 'Khan hits a fly-ball home run — 2 RBI.');
    assert.equal(pa({ outcome: 'HR', btype: 'LD', rbi: 4, zone: 'LF' }), 'Khan hits a line-drive grand slam to left!');
    assert.equal(pa({ outcome: '1B', zone: 'LF' }), 'Khan singles to left.');
  });
  test('outs: a tapped type sets the verb ("lines out", "pops out"); an implied one changes nothing', () => {
    assert.equal(pa({ outcome: 'FO', btype: 'LD', zone: 'CF' }), 'Khan lines out to centre.');
    assert.equal(pa({ outcome: 'FO', btype: 'PU', zone: 'SS' }), 'Khan pops out to short.');
    assert.equal(pa({ outcome: 'DP', btype: 'LD', fielders: '6-3' }), 'Khan lines into a double play, shortstop to first (6-3).');
    assert.equal(pa({ outcome: 'FO', fielders: '6' }), 'Khan pops out to short (6).');
    assert.equal(pa({ outcome: 'GO', fielders: '6-3' }), 'Khan grounds out, shortstop to first (6-3).');
  });
  test('the feed of the scripted game, and the correction list detail', () => {
    const s = play(start(ON), GAME).s;
    const lines = baseballCommentary(s, NAMES).flatMap((g) => g.lines.map((l) => l.text));
    assert.ok(lines.includes('A1 hits a line-drive single to left.'));
    assert.ok(lines.includes('H2 hits a fly-ball home run.'));
    assert.match(baseballTimeline(s).find((r) => r.detail?.startsWith('A1'))?.detail ?? '', /→ LF · line drive/);
  });
});

/* ------------------------------ old logs, settings ----------------------------- */

describe('round 2 · old logs replay identically; the toggle', () => {
  test('the toggle never changes the game; untapped events carry no field', () => {
    const steps = GAME.map((st) => (x: BaseballState) => { const a = st(x); const { btype: _drop, ...payload } = a.payload ?? {}; return { ...a, payload }; });
    // the same dispatched actions (same uids) replayed with the toggle on
    const { s: plain, actions } = play(start(), steps);
    const typed = actions.reduce(reducer, start(ON));
    for (const k of ['score', 'line', 'hits', 'errors', 'lob', 'pitches', 'half', 'outs', 'next', 'decisions', 'ended', 'runs', 'ann'] as const) assert.deepEqual(typed.g[k], plain.g[k], k);
    assert.deepEqual(typed.events, plain.events);
    assert.ok(plain.events.every((e) => !('btype' in e)));
    assert.equal('battedBallTypes' in init().cfg, false);
    assert.equal(readConfig({ battedBallTypes: 'true' }).battedBallTypes, true);
  });
  test('live settings and the format carry it (off by default, "Stats to track")', () => {
    const f = TRACK_FIELDS.find((x) => x.key === 'battedBallTypes')!;
    assert.deepEqual([f.label, f.default, f.group], ['Batted-ball type', false, 'Stats to track']);
    assert.equal(BASEBALL_LIVE_SETTINGS.read(init(ON)).battedBallTypes, true);
    assert.equal(BASEBALL_LIVE_SETTINGS.defaults?.battedBallTypes, false);
  });
});
