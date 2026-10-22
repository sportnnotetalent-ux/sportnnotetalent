/**
 * Deep wave (cricket) — optional "Stats to track" (pitch map, shot control,
 * ball speed, bowler type, catch position), the Cricinfo-style commentary, the
 * broadcast match-stats selectors and the new career keys. Older logs replay
 * byte-identically (cricket-legacy-replay.test.mts) — here: they also give a
 * full commentary and no deep keys.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, snapshotState, type CricketState, type BallRec } from '../src/sports/cricket/engine.ts';
import { statTotals, deepTotals } from '../src/sports/cricket/scorecard.ts';
import {
  rulesFromConfig, rulesToConfig, patchRules, describeRulesChange, isStandard, rulesChip, STANDARD_RULES, CRICKET_LIVE_SETTINGS, LOCAL_RULE_FIELDS,
} from '../src/sports/cricket/rules.ts';
import {
  applyDetailPatch, detailByRec, deliveryOrdinals, recStamp, bowlTypeCode, bowlTypeFromProfile, bowlKindOf, isLeftArm, isPace,
  pitchPhrase, fieldPosition, asKph, trackingOf, asBowlType, type BallDetailRec,
} from '../src/sports/cricket/detail.ts';
import {
  cricketCommentary, ballEventMatches, outcomeOf, shotPhrase, clockText, filterItems, overHeadline, type ComBall, type ComNote,
} from '../src/sports/cricket/commentary.ts';
import {
  phasePlan, phaseOf, teamBatting, compareSections, battingRows, bowlingRows, matchups, pitchDots, pitchGrid, minutesBatted,
  inningsTop, fielding, worm, trackedKinds, inningsOvers, boundaryOf, howOut,
} from '../src/sports/cricket/matchStats.ts';
import { cricketStats } from '../src/sports/cricket/stats.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { cricketUndoLabel } from '../src/sports/cricket/undo.ts';
import { CRICKET_LEGACY_LOGS } from './cricketLegacyLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

const T0 = Date.UTC(2026, 9, 22, 9, 0, 0);

/** A ball-by-ball builder: names the crease, then scores with the current striker / bowler. */
function live(cfg: Record<string, unknown> = {}) {
  let s = [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1', name: 'H1' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1', name: 'A1' } },
    { type: 'SET_KEEPER', payload: { side: 'home', id: 'h2', name: 'H2' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'a2', name: 'A2' } },
  ].reduce(reducer, init({ overs: 20, ...cfg }));
  let clock = T0;
  const L = () => (s.superOver && !s.superOver.state.ended ? s.superOver.state : s);
  const api = {
    get s() { return s; },
    do(a: ScoreAction) { const prev = s; s = reducer(s, a); return { type: a.type, prev, next: s }; },
    crease(st: string, ns: string, bw: string, extra: Record<string, unknown> = {}) {
      api.do({ type: 'SET_STRIKER', payload: { id: st, name: st.toUpperCase(), v: 2 } });
      api.do({ type: 'SET_NONSTRIKER', payload: { id: ns, name: ns.toUpperCase(), v: 2 } });
      api.bowler(bw, extra);
    },
    bowler(bw: string, extra: Record<string, unknown> = {}) {
      return api.do({ type: 'SET_BOWLER', payload: { id: bw, name: bw.toUpperCase(), v: 2, ...extra } });
    },
    /** a ball, stamped 30 s after the last (`at`, like the live controls) */
    ball(type: string, payload: Record<string, unknown> = {}, stamp = true) {
      const l = L();
      clock += 30_000;
      return api.do({ type, side: l.battingSide, payload: { strikerId: l.strikerId, strikerName: l.strikerName, bowlerId: l.bowlerId, bowlerName: l.bowlerName, ...(stamp ? { at: clock } : {}), ...payload } });
    },
    runs(...rs: number[]) { let last; for (const r of rs) last = api.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) }); return last!; },
    rules(patch: Record<string, unknown>) { return api.do({ type: 'SET_RULES', payload: patch }); },
    /** tag the last delivery's detail */
    detail(patch: Record<string, unknown>) {
      const l = L();
      const log = l.log ?? [];
      const ords = deliveryOrdinals(log);
      let i = log.length - 1;
      while (i >= 0 && !ords[i]) i--;
      const r = log[i];
      return api.do({ type: 'BALL_DETAIL', payload: { v: 2, inn: r.inn, side: r.side, d: ords[i], at: recStamp(r, l.ballsPerOver), batterId: r.strikerId, bowlerId: r.bowlerId, ...patch } });
    },
  };
  return api;
}

const items = (s: CricketState) => cricketCommentary(s, { home: 'Home', away: 'Away' });
const allBalls = (s: CricketState) => items(s).innings.flatMap((i) => i.overs.flatMap((o) => o.items.filter((x): x is ComBall => x.kind === 'ball')));
const allNotes = (s: CricketState) => items(s).innings.flatMap((i) => [...i.pre, ...i.overs.flatMap((o) => o.items.filter((x): x is ComNote => x.kind === 'note'))]);

/* ───────────────────────── legacy logs ───────────────────────── */

describe('older logs: a full commentary, no deep keys, nothing tracked', () => {
  for (const Lg of CRICKET_LEGACY_LOGS) {
    test(Lg.name, () => {
      const s = Lg.actions.reduce(reducer, init(Lg.config));
      const log = s.log ?? [];
      // every ball-log record finds its own timeline entry, in order
      const ev = [...s.events].sort((a, b) => a.id - b.id);
      let ei = 0;
      for (const r of log) {
        let f = -1;
        for (let j = ei; j < ev.length; j++) if (ballEventMatches(ev[j], r, s.ballsPerOver)) { f = j; break; }
        assert.ok(f >= 0, `record without its event: ${JSON.stringify(r)}`);
        ei = f + 1;
      }
      // one commentary ball per delivery (regulation), every one with a sentence + score
      const dels = log.filter((r) => r.sym !== undefined && !r.cross).length;
      const balls = allBalls(s);
      assert.equal(balls.length, dels);
      for (const b of balls) { assert.match(b.text, / to |runs out/); assert.match(b.score, /^-?\d+\/\d+$/); assert.equal(b.t, undefined); }
      assert.deepEqual(deepTotals(s), {});
      assert.ok(log.every((r) => r.t === undefined && r.trk === undefined));
      assert.deepEqual(trackedKinds(s), { pitch: false, control: false, speed: false, types: false, shots: trackedKinds(s).shots });
    });
  }
});

/* ───────────────────────── rules: Stats to track ───────────────────────── */

describe('"Stats to track" toggles', () => {
  test('absent unless on — the rules keep their exact shape', () => {
    assert.deepEqual(rulesFromConfig({}), STANDARD_RULES);
    assert.deepEqual(rulesFromConfig({ pitchMap: false, shotCtrl: false }), STANDARD_RULES);
    const r = rulesFromConfig({ pitchMap: true, ballSpeed: 'true' });
    assert.equal(r.pitchMap, true);
    assert.equal(r.ballSpeed, true);
    assert.equal('shotCtrl' in r, false);
    assert.equal(isStandard(r), true, 'a capture setting is not a playing rule');
    assert.equal(rulesChip(r), '');
    assert.deepEqual(rulesFromConfig(rulesToConfig(r)), r);
  });
  test('patched mid-match from the next ball, with a timeline line', () => {
    const on = patchRules(STANDARD_RULES, { shotCtrl: true, bowlerType: true });
    assert.equal(describeRulesChange(STANDARD_RULES, on), 'Shot control on · Bowler type on');
    const off = patchRules(on, { shotCtrl: false });
    assert.equal(off.shotCtrl, undefined);
    assert.equal(off.bowlerType, true);
    assert.equal(describeRulesChange(on, off), 'Shot control off');
  });
  test('live settings read every toggle; the fields sit in one "Stats to track" group', () => {
    const s = init({ overs: 20, pitchMap: true });
    const v = CRICKET_LIVE_SETTINGS.read(s);
    assert.equal(v.pitchMap, true);
    assert.equal(v.shotCtrl, false);
    const grouped = LOCAL_RULE_FIELDS.filter((f) => f.group === 'Stats to track').map((f) => f.key);
    // round 2 appended the wide / no-ball reason
    assert.deepEqual(grouped, ['wagonWheel', 'pitchMap', 'shotCtrl', 'ballSpeed', 'bowlerType', 'extraWhy']);
    assert.deepEqual(trackingOf(s.rules), { pitch: true });
    assert.equal(trackingOf(STANDARD_RULES), undefined);
  });
});

/* ───────────────────────── detail.ts ───────────────────────── */

describe('ball detail records', () => {
  const base = { v: 2, inn: 1, side: 'home', d: 3, at: '0.3' };
  test('merge, clear, refuse', () => {
    let list = applyDetailPatch(undefined, { ...base, len: 'good', batterId: 'h3' })!;
    assert.deepEqual(list, [{ inn: 1, side: 'home', d: 3, at: '0.3', batterId: 'h3', len: 'good' }]);
    list = applyDetailPatch(list, { ...base, line: 'off', kph: 131.6 })!;
    assert.deepEqual(list[0], { inn: 1, side: 'home', d: 3, at: '0.3', batterId: 'h3', len: 'good', line: 'off', kph: 132 });
    assert.equal(applyDetailPatch(list, { ...base, line: 'off' }), null, 'no change → null');
    list = applyDetailPatch(list, { ...base, len: null, line: null, kph: null })!;
    assert.deepEqual(list, [], 'a record left with nothing goes');
    assert.equal(applyDetailPatch([], { ...base, v: undefined, len: 'good' }), null);
    assert.equal(applyDetailPatch([], { ...base, len: 'beamer' }), null);
    assert.equal(applyDetailPatch([], { ...base, kph: 20 }), null);
    assert.equal(applyDetailPatch([], { ...base, d: 0, len: 'good' }), null);
    // a catch spot; clearing it clears deep too
    list = applyDetailPatch([], { ...base, cz: 8, cdeep: true })!;
    assert.deepEqual([list[0].cz, list[0].cdeep], [8, true]);
    assert.deepEqual(applyDetailPatch(list, { ...base, cz: null }), []);
  });
  test('joined to the log by delivery ordinal; a stamp that no longer matches is ignored', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(0);
    m.ball('EXTRA', { kind: 'Wide' });
    m.ball('EXTRA', { kind: 'Wide' });
    m.runs(1);
    const log = m.s.log!;
    assert.deepEqual(deliveryOrdinals(log), [1, 2, 3, 4]);
    assert.deepEqual(log.map((r) => recStamp(r)), ['0.1', '0.2', '0.2', '0.2']);
    const det: BallDetailRec[] = [
      { inn: 1, side: 'home', d: 2, at: '0.2', line: 'wideOff' },
      { inn: 1, side: 'home', d: 3, at: '0.2', line: 'wideLeg' },
      { inn: 1, side: 'home', d: 4, at: '0.9', len: 'full' }, // drifted
    ];
    assert.deepEqual(detailByRec(log, det).map((x) => x?.line ?? x?.len ?? null), [null, 'wideOff', 'wideLeg', null]);
  });
  test('bowler types, words, positions', () => {
    assert.equal(bowlTypeCode('fast', false), 'RF');
    assert.equal(bowlTypeCode('finger', true), 'SLA');
    assert.equal(bowlTypeCode('wrist', true), 'LWS');
    assert.equal(bowlKindOf('SLA'), 'finger');
    assert.equal(isLeftArm('SLA'), true);
    assert.equal(isPace('RM'), true);
    assert.equal(isPace('LB'), false);
    assert.equal(bowlTypeFromProfile({ bowl: 'Left-arm', bowlType: 'Wrist spin' }), 'LWS');
    assert.equal(bowlTypeFromProfile({ bowl: "Doesn't bowl", bowlType: 'Fast' }), null);
    assert.equal(bowlTypeFromProfile({ bowl: 'Right-arm' }), null);
    assert.equal(asBowlType('XX'), null);
    assert.equal(pitchPhrase({ len: 'short', line: 'off' }), 'short of a length outside off');
    assert.equal(pitchPhrase({ len: 'yorker' }), 'a yorker');
    assert.equal(pitchPhrase(undefined), '');
    assert.equal(fieldPosition(7, true), 'deep mid-wicket');
    assert.equal(fieldPosition(4, false), 'the slips');
    assert.equal(asKph('145'), 145);
    assert.equal(asKph(200), null);
  });
});

/* ───────────────────────── engine ───────────────────────── */

describe('engine: BALL_DETAIL, SET_BOWL_TYPE, btype, stamps', () => {
  test('BALL_DETAIL is score-neutral, needs v:2, works after the match ended', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(4);
    const before = m.s;
    assert.equal(m.do({ type: 'BALL_DETAIL', payload: { inn: 1, side: 'home', d: 1, at: '0.1', len: 'good' } }).next, before);
    m.detail({ len: 'good', line: 'stumps' });
    assert.deepEqual(m.s.scores, before.scores);
    assert.deepEqual(m.s.events, before.events);
    assert.deepEqual(m.s.log, before.log);
    assert.equal(m.s.detail!.length, 1);
    m.do({ type: 'END' });
    m.detail({ kph: 120 });
    assert.equal(m.s.detail![0].kph, 120);
  });
  test('bowler type: on the pick (profile, never overwriting), by SET_BOWL_TYPE, cleared', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5', { btype: 'RF' });
    assert.deepEqual(m.s.bowlTypes, { a5: 'RF' });
    m.runs(0, 0, 0, 0, 0, 0);
    m.bowler('a6', { btype: 'nonsense' });
    assert.deepEqual(m.s.bowlTypes, { a5: 'RF' });
    m.do({ type: 'SET_BOWL_TYPE', payload: { v: 2, id: 'a6', btype: 'OB' } });
    assert.deepEqual(m.s.bowlTypes, { a5: 'RF', a6: 'OB' });
    m.runs(0, 0, 0, 0, 0, 0);
    m.bowler('a5', { btype: 'LM' }); // already typed → kept
    assert.equal(m.s.bowlTypes!.a5, 'RF');
    m.do({ type: 'SET_BOWL_TYPE', payload: { v: 2, id: 'a6', btype: null } });
    assert.deepEqual(m.s.bowlTypes, { a5: 'RF' });
    const s0 = m.s;
    assert.equal(m.do({ type: 'SET_BOWL_TYPE', payload: { id: 'a6', btype: 'OB' } }).next, s0, 'v:2 only');
    // a refused pick (bowled the last over) carries no type
    m.runs(0, 0, 0, 0, 0, 0);
    m.bowler('a7');
    m.runs(0, 0, 0, 0, 0, 0);
    const before = m.s;
    assert.equal(m.bowler('a7', { btype: 'OB' }).next, before);
    assert.equal(m.s.bowlTypes!.a7, undefined);
  });
  test('a ball carries the device time and what was tracked on it — only then', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(1);
    m.ball('RUNS', { runs: 0 }, false);
    m.rules({ shotCtrl: true, pitchMap: true });
    m.runs(2);
    const [a, b, c] = m.s.log!;
    assert.equal(a.t, T0 + 30_000);
    assert.equal(a.trk, undefined);
    assert.equal(b.t, undefined);
    assert.deepEqual(c.trk, { ctrl: true, pitch: true });
  });
  test('a Super Over ball\'s detail goes to that innings', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1, 1, 1, 1, 1, 1);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 1, 1, 1, 1, 1);
    m.do({ type: 'START_SUPER_OVER', payload: { v: 2 } });
    m.crease('a3', 'a4', 'h6');
    m.runs(6);
    m.detail({ len: 'full' });
    assert.equal(m.s.detail, undefined);
    assert.equal(m.s.superOver!.state.detail!.length, 1);
  });
  test('named undo', () => {
    assert.equal(cricketUndoLabel({ type: 'BALL_DETAIL', prev: null, next: null }), 'ball detail');
    assert.equal(cricketUndoLabel({ type: 'SET_BOWL_TYPE', prev: null, next: null }), 'bowler type');
  });
});

/* ───────────────────────── commentary ───────────────────────── */

describe('commentary', () => {
  test('Cricinfo sentences from the captured detail', () => {
    const m = live({ wagonWheel: true, pitchMap: true, ballSpeed: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(4);
    m.do({ type: 'SHOT', payload: { v: 2, inn: 1, side: 'home', at: '0.1', batterId: 'h3', runs: 4, zone: 7, deep: true, shot: 'Pull' } });
    m.detail({ len: 'short', line: 'off', kph: 138 });
    m.runs(0);
    m.ball('EXTRA', { kind: 'Wide', runs: 1 });
    m.ball('EXTRA', { kind: 'No ball', runs: 4, boundary: true });
    m.ball('LEGBYES', { runs: 2 });
    m.ball('RUNS', { runs: 5, overthrows: 4, boundary: false });
    const b = allBalls(m.s).reverse();
    assert.equal(b[0].text, 'A5 to H3, FOUR, short of a length outside off, 138 km/h, pulled to deep mid-wicket');
    assert.equal(b[0].tone, 'four');
    assert.equal(b[0].stamp, '0.1');
    assert.equal(b[0].score, '4/0');
    assert.equal(b[0].t, T0 + 30_000);
    assert.equal(b[1].text, 'A5 to H3, no run');
    assert.equal(b[2].outcome, '2 wides');
    assert.equal(b[3].outcome, 'no ball, 4 runs off the bat');
    assert.equal(b[4].outcome, '2 leg byes');
    assert.equal(b[5].outcome, '5 runs (overthrows)');
    assert.equal(shotPhrase({ zone: 8, deep: true, shot: 'Lofted' }, 6), 'lofted over long-on');
    assert.equal(outcomeOf({ sym: '4r', bat: 4, b: 0, lb: 0, wd: 0, nb: 0 } as BallRec).outcome, '4 runs, all run');
  });
  test('a wicket: how, where caught, and the batter\'s line', () => {
    const m = live({ wagonWheel: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 1, 6);
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7', fielderName: 'A7', newBatId: 'h5', newBatName: 'H5' });
    m.detail({ cz: 8, cdeep: true });
    const balls = allBalls(m.s);
    assert.equal(balls[0].text, 'A5 to H4, OUT! Caught at long-on');
    assert.equal(balls[0].wicketLine, 'H4 c A7 b A5 6 (2b 1x6) SR 300.00');
    const notes = allNotes(m.s).map((n) => n.text);
    assert.ok(notes.includes('H3 and H4 open the batting · A5 to bowl'));
  });
  test('over blocks: summary, maiden, the chase; newest first', () => {
    const m = live({ overs: 2 });
    m.crease('h3', 'h4', 'a5');
    m.runs(0, 0, 0, 0, 0, 0);
    m.bowler('a6');
    m.runs(1, 2, 0, 4, 0, 1);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 1, 0, 0, 1, 0);
    const c = items(m.s);
    assert.deepEqual(c.innings.map((i) => i.team), ['Away', 'Home']);
    const [home] = c.innings.slice(1);
    assert.deepEqual(home.overs.map((o) => o.over), [2, 1]);
    const o1 = home.overs[1];
    assert.equal(o1.maiden, true);
    assert.equal(o1.bowlerFigs, 'A5 1.0-1-0-0');
    assert.equal(overHeadline(o1), 'End of over 1 · 0 runs · maiden · 0/0 · CRR 0.00');
    // H3 faced the maiden and most of over 2; H4 the single that opened it
    assert.deepEqual(home.overs[0].batters, ['H3 7 (11)', 'H4 1 (1)']);
    const away = c.innings[0];
    assert.equal(away.pre[0].text, 'Away need 9 to win from 2 overs');
    assert.equal(away.overs[0].chase, 'Need 6 from 6 balls · RRR 6.00');
    assert.equal(away.overs[0].items[0].kind, 'ball');
    assert.equal((away.overs[0].items[0] as ComBall).stamp, '0.6');
  });
  test('milestones, new batters, the powerplay, rain in its place', () => {
    const m = live({ overs: 20, powerplayOvers: 1, dls: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(6, 6, 6, 6, 6, 6);
    m.bowler('a6');
    m.runs(1, 6, 6, 4); // H4's single, then H3 to 52
    m.do({ type: 'RAIN', payload: { v: 2, overs: 15 } });
    m.runs(0);
    const notes = allNotes(m.s).map((n) => n.text);
    assert.ok(notes.includes('End of the powerplay — Home 36/0'), notes.join(' | '));
    assert.ok(notes.includes('FIFTY for H3 — 52 off 9 balls'), notes.join(' | '));
    assert.ok(notes.some((n) => n.startsWith('50 partnership — ')), notes.join(' | '));
    // newest first in over 2: 1.5, the rain, the fifty (after 1.4), 1.4
    const o2 = items(m.s).innings[0].overs[0].items;
    const ix = o2.findIndex((x) => x.kind === 'note' && x.text.startsWith('Rain — overs cut to 15'));
    assert.ok(ix > 0, o2.map((x) => (x.kind === 'ball' ? x.stamp : x.text)).join(' | '));
    assert.equal((o2[ix - 1] as ComBall).stamp, '1.5');
    // then the milestones of ball 1.4 (partnership 50 + H3's fifty), then 1.4 itself
    assert.deepEqual(o2.slice(ix + 1, ix + 4).map((x) => (x.kind === 'ball' ? x.stamp : x.text)),
      ['50 partnership — H3 and H4 (10 balls)', 'FIFTY for H3 — 52 off 9 balls', '1.4']);
  });
  test('every newer kind of ball record finds its own timeline entry (v:2 paths)', () => {
    const m = live({ overs: 20, dls: true, retireAt: 10 });
    m.crease('h3', 'h4', 'a5');
    m.ball('RUNS', { runs: 1, v: 2, pen: { runs: 5, against: 'fielding', reason: 'ball hit helmet' } });
    m.do({ type: 'ADJUST', side: 'home', payload: { side: 'home', runs: 2, reason: 'hit the net' } });
    m.do({ type: 'ADJUST', side: 'away', payload: { side: 'away', runs: -3, reason: 'slow over rate' } });
    m.do({ type: 'FIELD_NOTE', payload: { kind: 'drop', fielderId: 'a7', fielderName: 'A7' } });
    m.do({ type: 'SET_KEEPER', payload: { side: 'away', id: 'a8', name: 'A8' } });
    m.runs(6, 4);
    m.ball('WICKET', { kind: 'retired', v: 2, limit: true, newBatId: 'h5', newBatName: 'H5' });
    m.ball('EXTRA', { kind: 'Wide', wicket: 'stumped', newBatId: 'h6', newBatName: 'H6' });
    m.ball('WICKET', { kind: 'mankad', newBatId: 'h7', newBatName: 'H7' });
    m.ball('PENALTY', { runs: 5, against: 'batting', reason: 'running on the pitch', teamName: 'Home' });
    m.runs(1, 2);
    m.do({ type: 'RAIN_END_INNINGS', payload: { v: 2, chaseOvers: 10 } });
    m.crease('a3', 'a4', 'h9');
    m.runs(1, 0, 4);
    const s = m.s;
    const ev = [...s.events].sort((a, b) => a.id - b.id);
    let ei = 0;
    for (const r of s.log!) {
      let f = -1;
      for (let j = ei; j < ev.length; j++) if (ballEventMatches(ev[j], r, s.ballsPerOver)) { f = j; break; }
      assert.ok(f >= 0, `record without its event: ${JSON.stringify(r)}`);
      ei = f + 1;
    }
    const texts = allNotes(s).map((n) => n.text);
    for (const want of [/^5 penalty runs to the batting side — ball hit helmet/, /^Bonus 2 — the batting side \(hit the net\)/, /^3 deducted/, /^Dropped — A7/, /^NEW KEEPER/,
      /^RETIRED — H\d retired not out on 1\d \(run limit\) — 1\d off \d balls · \d+\/0$/, /^Rain — innings ended at /, /^Away chase a target of \d+ \(DLS\)/]) {
      assert.ok(texts.some((t) => want.test(t)), `${want} not in ${texts.join(' | ')}`);
    }
    const balls = allBalls(s).map((b) => b.text);
    assert.ok(balls.some((t) => /wide and OUT! Stumped$/.test(t)), balls.join(' | '));
    assert.ok(balls.some((t) => /runs out H\d at the non-striker's end/.test(t)), balls.join(' | '));
  });
  test('filters and clock', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 0, 6);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h5', newBatName: 'H5' });
    const over = items(m.s).innings[0].overs[0];
    assert.deepEqual(filterItems(over.items, 'boundaries').map((x) => (x as ComBall).outcome), ['SIX', 'FOUR']);
    assert.deepEqual(filterItems(over.items, 'wickets').map((x) => (x as ComBall).outcome), ['OUT']);
    assert.deepEqual(filterItems(over.items, 'overs'), []);
    const d = new Date(T0);
    assert.equal(clockText(T0), `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  });
  test('a persisted snapshot (no log, no per-ball detail) has no commentary', () => {
    const m = live({ pitchMap: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(1);
    m.detail({ len: 'full' });
    const snap = snapshotState(m.s);
    assert.equal(snap.log, undefined);
    assert.equal(snap.detail, undefined);
    assert.equal(items(snap).hasLog, false);
    assert.equal(m.s.detail!.length, 1, 'the live state keeps it');
  });
  test('the chase\'s first moments before its first ball get their own innings entry', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1, 1, 1, 1, 1, 1);
    const c = items(m.s);
    assert.equal(c.innings[0].team, 'Away');
    assert.equal(c.innings[0].overs.length, 0);
    assert.equal(c.innings[0].pre[0].text, 'Away need 7 to win from 1 over');
  });
});

/* ───────────────────────── match stats ───────────────────────── */

describe('match stats', () => {
  test('phases per ICC / CricViz practice', () => {
    const t20 = init({ overs: 20, powerplayOvers: 6 });
    const p = phasePlan(t20, 1)!;
    assert.deepEqual([p.pp, p.deathFrom], [36, 90]);
    assert.deepEqual(p.labels, { pp: 'Powerplay · Overs 1–6', middle: 'Middle · Overs 7–15', death: 'Death · Overs 16–20' });
    assert.deepEqual([phasePlan(init({ overs: 50, powerplayOvers: 10 }), 1)!.pp, phasePlan(init({ overs: 50, powerplayOvers: 10 }), 1)!.deathFrom], [60, 240]);
    assert.equal(phasePlan(init({ overs: 10, powerplayOvers: 3 }), 1)!.labels.death, 'Death · Overs 8–10');
    const h = phasePlan(init({ overs: 10, ballsPerOver: 10, hundred: true }), 1)!;
    assert.deepEqual([h.pp, h.deathFrom, h.labels.pp], [25, 75, 'Powerplay · Balls 1–25']);
    assert.equal(phasePlan(init({ overs: 999 }), 1), null);
    assert.equal(phasePlan(init({ overs: 3 }), 1), null);
    assert.equal(phaseOf({ legal: true, lb6: 36 } as BallRec, p), 'pp');
    assert.equal(phaseOf({ legal: false, lb6: 36 } as BallRec, p), 'middle');
    assert.equal(phaseOf({ legal: true, lb6: 91 } as BallRec, p), 'death');
    assert.equal(inningsOvers(init({ overs: 20 }), 1), 20);
  });
  test('team batting: dots, boundaries, scoring shots, extras — by phase', () => {
    const m = live({ overs: 20, powerplayOvers: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(0, 4, 1, 0, 6, 2);
    m.bowler('a6');
    m.ball('EXTRA', { kind: 'Wide' });
    m.ball('BYES', { runs: 1 });
    m.runs(0);
    const all = teamBatting(m.s, 'home');
    assert.deepEqual([all.runs, all.legal, all.dots, all.fours, all.sixes, all.boundaryRuns, all.scoring, all.faced], [15, 8, 3, 1, 1, 10, 4, 8]);
    assert.deepEqual(all.extras, { b: 1, lb: 0, wd: 1, nb: 0, pen: 0 });
    assert.equal(all.control, null, 'not tracked → null, never 0');
    const pp = teamBatting(m.s, 'home', 'pp');
    assert.equal(pp.runs, 13);
    assert.equal(teamBatting(m.s, 'home', 'middle').runs, 2);
    assert.equal(boundaryOf({ sym: '4nb', ext: 'nb', bat: 4, b: 0, lb: 0 } as BallRec), 4);
  });
  test('compare: team columns, tracked sections only when tracked', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 0, 0, 1, 0, 0);
    m.crease('a3', 'a4', 'h5');
    m.runs(1, 0);
    const secs = compareSections(m.s);
    assert.deepEqual(secs.map((x) => x.title), ['Batting', 'Bowling', 'Fielding']);
    const runs = secs[0].rows.find((r) => r.label === 'Runs')!;
    assert.deepEqual([runs.home, runs.away], ['5', '1']);
    const eco = secs[1].rows.find((r) => r.label === 'Economy')!;
    assert.deepEqual([eco.home, eco.away], ['3.00', '5.00'], 'home bowled at away');
    m.rules({ shotCtrl: true, ballSpeed: true });
    m.runs(0);
    m.detail({ ctrl: 'edged', kph: 101 });
    m.runs(1);
    const t = compareSections(m.s).map((x) => x.title);
    assert.ok(t.includes('Shot control (tracked)') && t.includes('Pace (speed gun)'), t.join());
    const ctl = compareSections(m.s).find((x) => x.title === 'Shot control (tracked)')!.rows[0];
    assert.deepEqual([ctl.home, ctl.away], ['not tracked', '50%']);
    const pace = compareSections(m.s).find((x) => x.title === 'Pace (speed gun)')!.rows[0];
    assert.deepEqual([pace.home, pace.away], ['101', 'not tracked']);
  });
  test('batting and bowling rows: dot %, control, pace vs spin, phase economy, speed, minutes', () => {
    const m = live({ overs: 20, powerplayOvers: 1, shotCtrl: true, ballSpeed: true });
    m.crease('h3', 'h4', 'a5', { btype: 'RF' });
    m.runs(0);
    m.detail({ ctrl: 'beaten', kph: 140 });
    m.runs(4);
    m.detail({ kph: 136 });
    m.runs(1, 0, 0, 0);
    m.bowler('a6', { btype: 'LB' });
    m.runs(6, 0);
    const bat = battingRows(m.s, 'home');
    // H3: 0 4 1 | 6 0 (over 2 after the swap) — H4 blocked out the rest of over 1
    const h3 = bat.find((b) => b.id === 'h3')!;
    assert.deepEqual([h3.runs, h3.balls, h3.dots], [11, 5, 2]);
    assert.equal(h3.dotPct, '40%');
    assert.equal(h3.boundaryPct, '91%');
    assert.equal(h3.control, '80%');
    assert.equal(h3.vsPace, '5 (3)');
    assert.equal(h3.vsSpin, '6 (2)');
    const h4 = bat.find((b) => b.id === 'h4')!;
    assert.equal(h4.vsPace, '0 (3)');
    assert.equal(h4.vsSpin, '–');
    assert.equal(h3.minutes, 4); // in at the first ball (+30 s), the last ball at +4 min → 3.5 → 4
    const bowl = bowlingRows(m.s, 'home');
    const a5 = bowl.find((b) => b.id === 'a5')!;
    assert.equal(a5.type, 'Right-arm fast');
    assert.equal(a5.phaseEcon.pp, '5.00');
    assert.equal(a5.phaseEcon.death, '–');
    assert.equal(a5.falseShotPct, '17%');
    assert.deepEqual(a5.speed, { avg: '138.0', max: 140, n: 2 });
    assert.equal(a5.maidens, 0);
    const mu = matchups(m.s, 'home');
    assert.deepEqual(mu.h3.map((x) => [x.bowlerId, x.runs, x.balls, x.dots, x.sixes]), [['a5', 5, 3, 1, 0], ['a6', 6, 2, 1, 1]]);
    assert.deepEqual(mu.h4.map((x) => [x.bowlerId, x.runs, x.balls, x.dots]), [['a5', 0, 3, 3]]);
  });
  test('pitch map grid, fielding, worm, innings summary', () => {
    const m = live({ overs: 2, pitchMap: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(0);
    m.detail({ len: 'good', line: 'off' });
    m.runs(4);
    m.detail({ len: 'short', line: 'leg' });
    m.ball('WICKET', { kind: 'caught', fielderId: 'a7', fielderName: 'A7', newBatId: 'h5', newBatName: 'H5' });
    m.detail({ len: 'good', line: 'off' });
    const dots = pitchDots(m.s, 'home');
    assert.deepEqual(dots.map((d) => d.tone), ['dot', 'boundary', 'wicket']);
    assert.deepEqual(pitchGrid(dots), { 'good:off': 2, 'short:leg': 1 });
    assert.equal(teamBatting(m.s, 'home').pitch!.tagged, 3);
    assert.deepEqual(fielding(m.s, 'away'), { catches: 1, runOuts: 0, stumpings: 0, drops: 0, saved: 0, missed: 0, notes: 0 });
    assert.equal(howOut(m.s, 'home'), 'c 1');
    assert.equal(howOut(m.s, 'away'), '–');
    const how = compareSections(m.s).find((x) => x.title === 'Bowling')!.rows.find((r) => r.label === 'How the wickets fell')!;
    assert.deepEqual([how.home, how.away], ['–', 'c 1'], 'away took the catch');
    assert.deepEqual(worm(m.s, 'home').map((p) => [p.over, p.cum, p.wkts]), [[1, 4, 1]]);
    const top = inningsTop(m.s, 'home');
    assert.equal(top.total, '4/1 (0.3 ov)');
    assert.deepEqual(top.bat.map((b) => b.line), ['4 (3)'], 'the new batter has not faced yet');
    assert.deepEqual(top.bowl.map((b) => b.line), ['1/4 (0.3)']);
    assert.equal(trackedKinds(m.s).pitch, true);
  });
  test('minutes at the crease only when every ball is stamped', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.runs(1);
    m.ball('RUNS', { runs: 0 }, false);
    assert.deepEqual(minutesBatted(m.s, 'home'), {});
  });
});

/* ───────────────────────── careers ───────────────────────── */

describe('career keys — only when tracked', () => {
  test('statTotals: pace / spin, control, speed', () => {
    const m = live({ overs: 20, shotCtrl: true, ballSpeed: true });
    m.crease('h3', 'h4', 'a5', { btype: 'RM' });
    m.runs(0);
    m.detail({ ctrl: 'edged', kph: 120 });
    m.runs(2);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h5', newBatName: 'H5' });
    m.detail({ kph: 126 });
    const t = statTotals(m.s);
    assert.deepEqual(
      ['bPace', 'rPace', 'oPace', 'bSpin', 'rSpin', 'oSpin', 'ctlBalls', 'falseShots'].map((k) => t.h3.stats[k]),
      [3, 2, 1, 0, 0, 0, 3, 1],
    );
    assert.equal(t.h4.stats.bPace, 0, 'every batter carries the pace / spin keys once types are known');
    assert.equal(t.h4.stats.ctlBalls, undefined, 'no tracked ball faced → no control keys');
    assert.deepEqual(['ctlBowled', 'fsInduced', 'kphN', 'kphSum', 'kphMax'].map((k) => t.a5.stats[k]), [3, 1, 2, 246, 126]);
    // without any of it: none of the keys
    const plain = live();
    plain.crease('h3', 'h4', 'a5');
    plain.runs(1, 2);
    const p = statTotals(plain.s);
    assert.equal(Object.keys(p.h3.stats).some((k) => ['bPace', 'ctlBalls', 'kphN'].includes(k)), false);
  });
  test('the schema: valid, rows hidden for untracked lines, shown from tracked ones', () => {
    assert.deepEqual(validateSchema(cricketStats), []);
    const L = (id: string, stats: Record<string, number>): StatLine => ({ id, matchId: id, playerId: 'p', sport: 'cricket', stats, won: false });
    const old = [L('1', { runs: 30, innings: 1, notOut: 0, ballsFaced: 20, wickets: 1, ballsBowled: 24, runsConceded: 20 })];
    const c0 = careerFromSchema(cricketStats, old);
    for (const k of ['srPace', 'srSpin', 'avgPace', 'ctrlPct']) assert.equal(c0.batting.some((r) => r.key === k), false, k);
    for (const k of ['fsPct', 'fastest', 'avgKph']) assert.equal(c0.bowling.some((r) => r.key === k), false, k);
    const tracked = [...old, L('2', {
      runs: 40, innings: 1, notOut: 0, ballsFaced: 30, bPace: 20, rPace: 30, oPace: 1, bSpin: 10, rSpin: 10, oSpin: 0,
      ctlBalls: 25, falseShots: 5, ballsBowled: 12, runsConceded: 10, wickets: 0, ctlBowled: 12, fsInduced: 3, kphN: 6, kphSum: 780, kphMax: 134,
    })];
    const c = careerFromSchema(cricketStats, tracked);
    const val = (sec: string, k: string) => c[sec].find((r) => r.key === k)?.value;
    assert.equal(val('batting', 'srPace'), '150.0');
    assert.equal(val('batting', 'srSpin'), '100.0');
    assert.equal(val('batting', 'avgPace'), '30.0');
    assert.equal(val('batting', 'avgSpin'), '–');
    assert.equal(val('batting', 'ctrlPct'), '80%');
    assert.equal(val('bowling', 'fsPct'), '25%');
    assert.equal(val('bowling', 'fastest'), '134');
    assert.equal(val('bowling', 'avgKph'), '130.0');
  });
});
