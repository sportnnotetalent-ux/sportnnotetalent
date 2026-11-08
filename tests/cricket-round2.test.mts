/**
 * Cricket round 2 (the founder's answers to the deep wave): the "Fastest
 * ball" / "Best control %" leaders with minimums, organiser-chosen phases,
 * the wide / no-ball reason, direct-hit run outs, the bouncer warning, the
 * new-era career figures (dot %, boundary %, phase economy) and the WhatsApp
 * share card. Older logs replay byte-identically (cricket-legacy-replay) —
 * here: they also carry none of the new keys.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { statTotals, eraTotals, isNewEra, ERA_TOTAL_KEYS, DIRECT_HIT_KEY, boundaryOf } from '../src/sports/cricket/scorecard.ts';
import {
  rulesFromConfig, rulesToConfig, patchRules, describeRulesChange, isStandard, rulesChip, STANDARD_RULES,
  CRICKET_LIVE_SETTINGS, LOCAL_RULE_FIELDS, LOCAL_RULE_DEFAULTS, phasePPText, phaseDeathText, bouncerText,
} from '../src/sports/cricket/rules.ts';
import {
  applyDetailPatch, deliveryOrdinals, recStamp, trackingOf, extraWhyOf, extraWhyLabel, extraWhyPhrase, WIDE_WHY, NB_WHY,
} from '../src/sports/cricket/detail.ts';
import { phasePlan, phaseOf, phasePPBalls, inningsOvers } from '../src/sports/cricket/phases.ts';
import { teamBatting, compareSections, bowlingRows, fielding, extrasWhyText, phasePlan as phasePlanRe } from '../src/sports/cricket/matchStats.ts';
import { cricketCommentary, type ComBall, type ComNote } from '../src/sports/cricket/commentary.ts';
import { standardBouncers, bouncerLimit, bouncersInOver, bouncerStatus, bouncerWarning, bouncerSlot, bouncerNoteFor, overIndexOf } from '../src/sports/cricket/bouncers.ts';
import {
  shareStages, shareCardText, inningsShareText, resultShareText, resultText, overShareText, previewText, firstBatting,
} from '../src/sports/cricket/shareCard.ts';
import { cricketStats, DETAIL_QUALIFIERS } from '../src/sports/cricket/stats.ts';
import { aggregateValue, careerFromSchema, coverageOf, qualifierOf, qualifierText, rankPlayers, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { CRICKET_LEGACY_LOGS } from './cricketLegacyLogs.mts';
import type { BallRec } from '../src/sports/cricket/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';
import type { NameOf } from '../src/core/playerNames.ts';

const T0 = Date.UTC(2026, 9, 22, 9, 0, 0);
/** IDs-only scoring: the builder below sends player ids only (as the scorer
 *  UI does); a player's name here is their id upper-cased ('h3' → 'H3'). */
const UP: NameOf = (id, legacy) => (id ? id.toUpperCase() : legacy ?? 'Player');

/** A ball-by-ball builder (as cricket-deep-wave): names the crease, then scores. */
function live(cfg: Record<string, unknown> = {}, stamp = true) {
  let s = [
    { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1' } },
    { type: 'SET_CAPTAIN', payload: { side: 'away', id: 'a1' } },
    { type: 'SET_KEEPER', payload: { side: 'home', id: 'h2' } },
    { type: 'SET_KEEPER', payload: { side: 'away', id: 'a2' } },
  ].reduce(reducer, init({ overs: 20, ...cfg }));
  let clock = T0;
  const L = () => (s.superOver && !s.superOver.state.ended ? s.superOver.state : s);
  const api = {
    get s() { return s; },
    do(a: ScoreAction) { s = reducer(s, a); return s; },
    crease(st: string, ns: string, bw: string) {
      api.do({ type: 'SET_STRIKER', payload: { id: st, v: 2 } });
      api.do({ type: 'SET_NONSTRIKER', payload: { id: ns, v: 2 } });
      api.bowler(bw);
    },
    bowler(bw: string) { return api.do({ type: 'SET_BOWLER', payload: { id: bw, v: 2 } }); },
    ball(type: string, payload: Record<string, unknown> = {}) {
      const l = L();
      clock += 30_000;
      return api.do({ type, side: l.battingSide, payload: { strikerId: l.strikerId, bowlerId: l.bowlerId, ...(stamp ? { at: clock } : {}), ...payload } });
    },
    runs(...rs: number[]) { for (const r of rs) api.ball('RUNS', { runs: r, ...(r === 4 || r === 6 ? { boundary: true } : {}) }); return s; },
    rules(patch: Record<string, unknown>) { return api.do({ type: 'SET_RULES', payload: patch }); },
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

const names = { home: 'Home', away: 'Away' };
const allBalls = (s: CricketState) => cricketCommentary(s, names, UP).innings.flatMap((i) => i.overs.flatMap((o) => o.items.filter((x): x is ComBall => x.kind === 'ball')));
const allNotes = (s: CricketState) => cricketCommentary(s, names, UP).innings.flatMap((i) => i.overs.flatMap((o) => o.items.filter((x): x is ComNote => x.kind === 'note')));
let lineN = 0;
const L = (playerId: string, stats: Record<string, number>, matchId = `m${lineN}`): StatLine => ({ id: `l${lineN++}`, matchId, playerId, sport: 'cricket', stats, won: false });

/* ───────────────────────── 1. leaders ───────────────────────── */

describe('1 · Fastest ball and Best control % are tournament leaders, with minimums', () => {
  test('on the leader list, last, with their minimum', () => {
    assert.deepEqual(cricketStats.leaders.slice(-2), ['fastest', 'ctrlPct']);
    assert.deepEqual(validateSchema(cricketStats), []);
    const fastest = statDefIn(cricketStats, 'fastest')!;
    const ctrl = statDefIn(cricketStats, 'ctrlPct')!;
    assert.deepEqual(qualifierOf(fastest), DETAIL_QUALIFIERS.fastest);
    assert.equal(qualifierText(cricketStats, fastest, qualifierOf(fastest)), 'min 12 balls clocked');
    assert.equal(qualifierText(cricketStats, ctrl, qualifierOf(ctrl)), 'min 60 tracked balls faced');
  });
  test('the fastest ball ranks only bowlers with 12+ balls clocked; ties go to the faster average', () => {
    const def = statDefIn(cricketStats, 'fastest')!;
    const lines = [
      L('quick', { ballsBowled: 6, kphN: 6, kphSum: 840, kphMax: 151 }), // 6 clocked — not enough
      L('a', { ballsBowled: 24, kphN: 8, kphSum: 1040, kphMax: 140 }),
      L('a', { ballsBowled: 24, kphN: 6, kphSum: 780, kphMax: 135 }),
      L('b', { ballsBowled: 24, kphN: 12, kphSum: 1680, kphMax: 140 }),
      L('c', { ballsBowled: 24 }), // never clocked: no figure
    ];
    const v = aggregateValue(cricketStats, def, lines.filter((l) => l.playerId === 'a'));
    assert.deepEqual([v.value, v.den], [140, 14]);
    const ranked = rankPlayers(cricketStats, def, lines);
    assert.deepEqual(ranked.map((r) => [r.playerId, r.value]), [['b', 140], ['a', 140]], 'b: avg 140 beats a: 130');
    assert.equal(rankPlayers(cricketStats, def, lines, { qualifier: null }).length, 3, 'the organiser can drop the minimum');
  });
  test('control % ranks only batters with 60+ tracked balls faced', () => {
    const def = statDefIn(cricketStats, 'ctrlPct')!;
    const lines = [
      L('x', { runs: 30, innings: 1, notOut: 0, ballsFaced: 40, ctlBalls: 40, falseShots: 2 }),
      L('y', { runs: 30, innings: 1, notOut: 0, ballsFaced: 40, ctlBalls: 40, falseShots: 8 }),
      L('y', { runs: 30, innings: 1, notOut: 0, ballsFaced: 40, ctlBalls: 30, falseShots: 3 }),
    ];
    assert.deepEqual(rankPlayers(cricketStats, def, lines).map((r) => [r.playerId, Math.round(r.value)]), [['y', 84]]);
  });
});

/* ───────────────────────── 2. phases ───────────────────────── */

describe('2 · powerplay / death phases are organiser options (format defaults)', () => {
  test('rules keys: absent by default, sanitised, round-trip; not a playing rule', () => {
    assert.deepEqual(rulesFromConfig({ phasePP: 'auto', phaseDeath: 'auto', bouncerMax: 'auto' }), STANDARD_RULES);
    // defaults-on DOK2: the new-match defaults are the standard playing rules plus the four captures on
    assert.deepEqual(rulesFromConfig({ ...LOCAL_RULE_DEFAULTS }), { ...STANDARD_RULES, wagonWheel: true, pitchMap: true, bowlerType: true, extraWhy: true });
    const r = rulesFromConfig({ phasePP: 4, phaseDeath: '0' });
    assert.deepEqual([r.phasePP, r.phaseDeath], [4, 0]);
    assert.equal(isStandard(r), true, 'stats phases are not playing rules');
    assert.equal(rulesChip(r), '');
    assert.deepEqual(rulesFromConfig(rulesToConfig(r)), r);
    assert.equal(rulesFromConfig({ phasePP: -3 }).phasePP, undefined);
    assert.equal(rulesFromConfig({ phasePP: 99 }).phasePP, 50);
    const back = patchRules(r, { phasePP: 'auto' });
    assert.equal('phasePP' in back, false);
    assert.equal(describeRulesChange(r, back), 'Powerplay phase: the format’s');
    assert.equal(describeRulesChange(STANDARD_RULES, r), 'Powerplay phase: overs 1–4 · No death phase');
    assert.deepEqual([phasePPText(0), phaseDeathText(3), phaseDeathText(1)], ['No powerplay phase', 'Death phase: last 3 overs', 'Death phase: last 1 over']);
  });
  test('Match rules: choice fields with an "auto" default, read back as auto', () => {
    const f = LOCAL_RULE_FIELDS.find((x) => x.key === 'phasePP')!;
    assert.equal(f.type, 'choice');
    assert.equal(f.default, 'auto');
    assert.ok(f.options!.some((o) => o.value === 0) && f.options!.some((o) => o.value === 6));
    assert.equal(CRICKET_LIVE_SETTINGS.read(init({ overs: 20 })).phasePP, 'auto');
    assert.equal(CRICKET_LIVE_SETTINGS.read(init({ overs: 20, phaseDeath: 3 })).phaseDeath, 3);
    assert.equal(CRICKET_LIVE_SETTINGS.defaults!.phaseDeath, 'auto');
  });
  test('the plan follows the choice — default unchanged', () => {
    const def = phasePlan(init({ overs: 20, powerplayOvers: 6 }), 1)!;
    assert.deepEqual([def.pp, def.deathFrom, def.total, def.phases], [36, 90, 120, ['pp', 'middle', 'death']]);
    assert.equal(phasePlanRe, phasePlan, 'matchStats re-exports the phases');
    // a school T20 without fielding restrictions: no powerplay phase
    const noPP = phasePlan(init({ overs: 20, powerplayOvers: 6, phasePP: 0 }), 1)!;
    assert.deepEqual([noPP.pp, noPP.phases], [0, ['middle', 'death']]);
    const custom = phasePlan(init({ overs: 20, powerplayOvers: 6, phasePP: 4, phaseDeath: 3 }), 1)!;
    assert.deepEqual([custom.pp, custom.deathFrom], [24, 102]);
    assert.deepEqual(custom.labels, { pp: 'Powerplay · Overs 1–4', middle: 'Middle · Overs 5–17', death: 'Death · Overs 18–20' });
    const noDeath = phasePlan(init({ overs: 20, powerplayOvers: 6, phaseDeath: 0 }), 1)!;
    assert.deepEqual([noDeath.deathFrom, noDeath.phases], [120, ['pp', 'middle']]);
    assert.equal(phasePlan(init({ overs: 20, powerplayOvers: 6, phasePP: 0, phaseDeath: 0 }), 1), null, 'both none → no phases');
    // a custom phase works for a short game (3 overs) — the automatic one doesn't
    assert.equal(phasePlan(init({ overs: 3 }), 1), null);
    assert.deepEqual(phasePlan(init({ overs: 3, phaseDeath: 1 }), 1)!.phases, ['middle', 'death']);
    assert.equal(phasePlan(init({ overs: 999, phasePP: 10 }), 1), null, 'never for a timeless innings');
    assert.equal(phasePPBalls(init({ overs: 10, ballsPerOver: 10, hundred: true })), 25);
    assert.equal(phasePPBalls(init({ overs: 20, powerplayOvers: 6, phasePP: 2 })), 12);
    assert.equal(inningsOvers(init({ overs: 20 }), 2), 20);
    assert.equal(phaseOf({ legal: true, lb6: 30 } as BallRec, custom), 'middle');
  });
  test('a mid-match change re-splits the whole match (stats setting, not a rule)', () => {
    const m = live({ overs: 20, powerplayOvers: 6 });
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 4, 4, 4, 4, 4);
    m.bowler('a6');
    m.runs(1, 1, 1, 1, 1, 1);
    assert.equal(teamBatting(m.s, 'home', 'pp').runs, 30);
    m.rules({ phasePP: 2 });
    assert.equal(m.s.events.at(-1)!.detail, 'Powerplay phase: overs 1–2');
    assert.equal(teamBatting(m.s, 'home', 'pp').runs, 30, 'both overs still inside overs 1–2');
    m.rules({ phasePP: 0 });
    assert.equal(teamBatting(m.s, 'home', 'pp').runs, 0);
    assert.equal(teamBatting(m.s, 'home', 'middle').runs, 30);
  });
  test('the commentary\'s "End of the powerplay" follows the chosen powerplay', () => {
    const at = (cfg: Record<string, unknown>) => {
      const m = live({ overs: 20, ...cfg });
      m.crease('h3', 'h4', 'a5');
      m.runs(0, 0, 0, 0, 0, 0);
      m.bowler('a6');
      m.runs(0, 0, 0, 0, 0, 0);
      return allNotes(m.s).filter((n) => /End of the powerplay/.test(n.text)).length;
    };
    assert.equal(at({ powerplayOvers: 2 }), 1);
    assert.equal(at({ powerplayOvers: 2, phasePP: 0 }), 0);
    assert.equal(at({ powerplayOvers: 0, phasePP: 1 }), 1);
  });
});

/* ───────────────────────── 6a. wide / no-ball reason ───────────────────────── */

describe('6 · wide / no-ball reason (optional)', () => {
  test('vocabulary, words, the record', () => {
    assert.deepEqual([...WIDE_WHY], ['leg', 'off', 'high', 'other']);
    assert.deepEqual([...NB_WHY], ['foot', 'height', 'bouncer', 'field', 'other']);
    assert.equal(extraWhyOf('wd', 'leg'), 'leg');
    assert.equal(extraWhyOf('nb', 'leg'), undefined, 'a wide reason on a no-ball is ignored');
    assert.equal(extraWhyOf(undefined, 'foot'), undefined);
    assert.equal(extraWhyLabel('nb', 'foot'), 'Front foot');
    assert.equal(extraWhyPhrase('wd', 'leg'), 'down the leg side');
    assert.equal(extraWhyPhrase('nb', 'other'), '');
    const base = { v: 2, inn: 1, side: 'home', d: 2, at: '0.1' };
    assert.deepEqual(applyDetailPatch(undefined, { ...base, why: 'foot' }), [{ inn: 1, side: 'home', d: 2, at: '0.1', why: 'foot' }]);
    assert.equal(applyDetailPatch(undefined, { ...base, why: 'nonsense' }), null);
    assert.deepEqual(applyDetailPatch([{ inn: 1, side: 'home', d: 2, at: '0.1', why: 'foot' }], { ...base, why: null }), []);
  });
  test('a toggle in "Stats to track"; balls carry trk.why only while it is on', () => {
    assert.deepEqual(trackingOf({ extraWhy: true }), { why: true });
    assert.equal(rulesFromConfig({}).extraWhy, undefined);
    assert.equal(describeRulesChange(STANDARD_RULES, patchRules(STANDARD_RULES, { extraWhy: true })), 'Wide / no-ball reason on');
    const m = live({ extraWhy: true });
    m.crease('h3', 'h4', 'a5');
    m.ball('EXTRA', { kind: 'Wide' });
    assert.deepEqual(m.s.log!.at(-1)!.trk, { why: true });
    const off = live();
    off.crease('h3', 'h4', 'a5');
    off.ball('EXTRA', { kind: 'Wide' });
    assert.equal(off.s.log!.at(-1)!.trk, undefined);
  });
  test('commentary, compare and the bowler row', () => {
    const m = live({ extraWhy: true });
    m.crease('h3', 'h4', 'a5');
    m.ball('EXTRA', { kind: 'Wide' });
    m.detail({ why: 'leg' });
    m.ball('EXTRA', { kind: 'No ball', runs: 1 });
    m.detail({ why: 'foot' });
    m.ball('EXTRA', { kind: 'Wide' });
    m.runs(0);
    const balls = allBalls(m.s);
    assert.ok(balls.some((b) => b.text === 'A5 to H3, wide, down the leg side'), balls.map((b) => b.text).join(' | '));
    assert.ok(balls.some((b) => /no ball, 1 run off the bat, overstepped$/.test(b.text)), balls.map((b) => b.text).join(' | '));
    const sec = compareSections(m.s).find((x) => x.title.startsWith('Wides & no-balls'))!;
    assert.deepEqual(sec.rows.map((r) => [r.label, r.home, r.away]), [
      ['Wides / no-balls tagged', 'not tracked', '2 of 3'],
      ['Wide · down leg', '0', '1'],
      ['No-ball · front foot', '0', '1'],
    ]);
    assert.equal(bowlingRows(m.s, 'home')[0].extrasWhy, 'wd down leg 1 · nb front foot 1');
    assert.equal(extrasWhyText([]), '');
    // untracked → no section, no row text
    const plain = live();
    plain.crease('h3', 'h4', 'a5');
    plain.ball('EXTRA', { kind: 'Wide' });
    assert.equal(compareSections(plain.s).some((x) => x.title.startsWith('Wides & no-balls')), false);
    assert.equal(bowlingRows(plain.s, 'home')[0].extrasWhy, undefined);
  });
});

/* ───────────────────────── 6b. direct hits ───────────────────────── */

describe('6 · direct-hit run outs (credit the fielder, a career key)', () => {
  test('the run out records it; nothing else does', () => {
    const m = live();
    m.crease('h3', 'h4', 'a5');
    m.ball('WICKET', { kind: 'runout', fielderId: 'a7', batterOut: 'striker', end: 'striker', runs: 1, direct: true, newBatId: 'h5' });
    assert.equal(m.s.dismissals.at(-1)!.direct, true);
    m.ball('WICKET', { kind: 'caught', fielderId: 'a8', direct: true, newBatId: 'h6' });
    assert.equal(m.s.dismissals.at(-1)!.direct, undefined, 'only a run out');
    // off a no-ball (v:2 path)
    m.ball('EXTRA', { kind: 'No ball', wicket: 'runout', fielderId: 'a9', batterOut: 'nonstriker', end: 'bowler', direct: true, newBatId: 'h7' });
    assert.equal(m.s.dismissals.at(-1)!.direct, true);
    // no fielder → no direct hit
    m.ball('WICKET', { kind: 'runout', direct: true, batterOut: 'striker', end: 'striker', newBatId: 'h8' });
    assert.equal(m.s.dismissals.at(-1)!.direct, undefined);
    const t = statTotals(m.s);
    assert.equal(t.a7.stats[DIRECT_HIT_KEY], 1);
    assert.equal(t.a9.stats[DIRECT_HIT_KEY], 1);
    assert.equal(t.a8.stats[DIRECT_HIT_KEY], undefined, 'a catch is no direct hit — and no 0 is written');
    assert.deepEqual([fielding(m.s, 'away').directHits, fielding(m.s, 'home').directHits], [2, undefined]);
    const row = compareSections(m.s).find((x) => x.title === 'Fielding')!.rows.find((r) => r.label === 'Direct-hit run outs')!;
    assert.deepEqual([row.home, row.away], ['0', '2']);
    assert.ok(allBalls(m.s).some((b) => /OUT! Run out — direct hit from A7$/.test(b.text)), allBalls(m.s).map((b) => b.text).join(' | '));
  });
  test('the career row shows only once a player has one', () => {
    const lines = [L('p', { catches: 0, stumpings: 0, runouts: 1 }), L('p', { catches: 1, stumpings: 0, runouts: 0 })];
    assert.equal(careerFromSchema(cricketStats, lines).fielding.some((r) => r.key === 'directHits'), false);
    const c = careerFromSchema(cricketStats, [...lines, L('p', { catches: 0, stumpings: 0, runouts: 2, directHits: 2 })]);
    assert.equal(c.fielding.find((r) => r.key === 'directHits')?.value, '2');
    assert.equal(coverageOf(cricketStats, statDefIn(cricketStats, 'directHits')!, lines), undefined, 'no "x of y" note');
  });
});

/* ───────────────────────── 6c. bouncers ───────────────────────── */

describe('6 · bouncers-per-over warning (pitch map, organiser limit)', () => {
  test('the standard per format, the organiser\'s limit, none', () => {
    assert.equal(standardBouncers(init({ overs: 20 })), 1);
    assert.equal(standardBouncers(init({ overs: 10 })), 1);
    assert.equal(standardBouncers(init({ overs: 50 })), 2);
    assert.equal(standardBouncers(init({ overs: 999 })), 2);
    assert.equal(bouncerLimit(init({ overs: 20, bouncerMax: 2 })), 2);
    assert.equal(bouncerLimit(init({ overs: 20, bouncerMax: 0 })), 0);
    const r = rulesFromConfig({ bouncerMax: 2 });
    assert.equal(isStandard(r), false, 'a bouncer limit is a playing rule');
    assert.equal(rulesChip(r), '2 bouncers/over');
    assert.equal(rulesChip(rulesFromConfig({ bouncerMax: 0 })), 'no bouncer limit');
    assert.deepEqual([bouncerText(), bouncerText(0), bouncerText(1)], ['Bouncer limit: standard', 'No bouncer limit', 'Bouncers: 1 per over']);
  });
  test('counts tagged bouncers in the over; warns at and past the limit; a new over resets', () => {
    const m = live({ overs: 20, pitchMap: true });
    m.crease('h3', 'h4', 'a5');
    m.runs(0);
    assert.deepEqual(bouncerStatus(m.s), { count: 0, limit: 1, over: 1 });
    assert.equal(bouncerWarning(bouncerStatus(m.s)), null);
    m.detail({ len: 'bouncer' });
    const at = bouncerStatus(m.s)!;
    assert.deepEqual(at, { count: 1, limit: 1, over: 1 });
    assert.match(bouncerWarning(at)!, /limit reached .* another is a no-ball/);
    assert.equal(bouncerSlot(at), '⚠️ 1/1 bouncer this over — the next is a no-ball');
    assert.match(bouncerNoteFor(m.s, m.s.log!.at(-1)!, true)!, /limit reached/);
    assert.equal(bouncerNoteFor(m.s, m.s.log!.at(-1)!, false), null);
    m.runs(1);
    m.detail({ len: 'bouncer' });
    assert.equal(bouncerSlot(bouncerStatus(m.s)), '⚠️ 2 bouncers this over — over the limit of 1');
    m.runs(0, 0, 0, 0);
    assert.equal(bouncerStatus(m.s), null, 'over break: nothing bowled of the next over yet');
    m.bowler('a6');
    m.runs(0);
    assert.deepEqual(bouncerStatus(m.s), { count: 0, limit: 1, over: 2 });
    assert.deepEqual(bouncersInOver(m.s, 1, 'home', 0), { count: 2, limit: 1, over: 1 });
    assert.equal(overIndexOf({ legal: false, lb6: 6 }, 6), 1, 'a wide after 6 balls belongs to over 2');
  });
  test('no pitch map, or no limit → no warning', () => {
    const off = live({ overs: 20 });
    off.crease('h3', 'h4', 'a5');
    off.runs(0);
    assert.equal(bouncerStatus(off.s), null);
    const none = live({ overs: 20, pitchMap: true, bouncerMax: 0 });
    none.crease('h3', 'h4', 'a5');
    none.runs(0);
    none.detail({ len: 'bouncer' });
    assert.equal(bouncerStatus(none.s), null);
  });
});

/* ───────────────────────── 7. new-era careers ───────────────────────── */

describe('7 · dot %, boundary %, phase economy in careers — new-era matches only', () => {
  const play = (stamp: boolean, cfg: Record<string, unknown> = {}) => {
    const m = live({ overs: 4, powerplayOvers: 1, bowlerMaxOvers: 2, ...cfg }, stamp);
    m.crease('h3', 'h4', 'a5');
    m.runs(0, 4, 1, 0, 6, 2); // over 1 (powerplay) by a5: H3 0 4 1 · H4 0 6 2
    m.bowler('a6');
    m.ball('EXTRA', { kind: 'Wide' });
    m.runs(0, 0, 1, 0, 0, 0); // over 2 (middle) by a6
    m.bowler('a5');
    m.runs(1, 1, 1, 1, 1, 1); // over 3 (middle)
    m.bowler('a6');
    m.runs(4, 0, 0, 0, 0, 0); // over 4 (death: last 1 of 4) by a6
    return m.s;
  };
  test('the marker: stamped balls (this app) — never an older log', () => {
    assert.equal(isNewEra(play(true)), true);
    assert.equal(isNewEra(play(false)), false);
    for (const Lg of CRICKET_LEGACY_LOGS) {
      const s = Lg.actions.reduce(reducer, init(Lg.config));
      assert.equal(isNewEra(s), false, Lg.name);
      assert.deepEqual(eraTotals(s), {}, Lg.name);
      const keys = new Set(Object.values(statTotals(s)).flatMap((e) => Object.keys(e.stats)));
      for (const k of [...ERA_TOTAL_KEYS, DIRECT_HIT_KEY]) assert.equal(keys.has(k), false, `${Lg.name}: ${k}`);
    }
  });
  test('an unstamped match writes none of the keys', () => {
    const t = statTotals(play(false));
    for (const e of Object.values(t)) for (const k of ERA_TOTAL_KEYS) assert.equal(k in e.stats, false, k);
  });
  test('batters: dots faced and runs in boundaries; bowlers: balls / runs per phase; everyone: the marker', () => {
    const s = play(true);
    const t = statTotals(s);
    // H3 faced: 0 4 1 | (over 2) … — read the dots straight from the log
    const faced = (id: string) => (s.log ?? []).filter((r) => r.strikerId === id && (r.ext === 'nb' || (r.legal && r.ext !== 'wd')));
    for (const id of ['h3', 'h4']) {
      assert.equal(t[id].stats.dotsF, faced(id).filter((r) => r.bat === 0).length, id);
      assert.equal(t[id].stats.bndRuns, faced(id).reduce((a, r) => a + boundaryOf(r), 0), id);
      assert.equal(t[id].stats.newEra, 1);
    }
    assert.equal(t.h3.stats.bndRuns + t.h4.stats.bndRuns, 14, '4 + 6 + 4');
    // a5: over 1 (pp, 13 runs) + over 3 (middle, 6); a6: over 2 (middle, wide + 1) + over 4 (death, 4)
    assert.deepEqual(['ballsPP', 'runsPP', 'ballsMid', 'runsMid', 'ballsDeath', 'runsDeath'].map((k) => t.a5.stats[k]), [6, 13, 6, 6, 0, 0]);
    assert.deepEqual(['ballsPP', 'runsPP', 'ballsMid', 'runsMid', 'ballsDeath', 'runsDeath'].map((k) => t.a6.stats[k]), [0, 0, 6, 2, 6, 4]);
    assert.equal(t.a2.stats.newEra, 1, 'the keeper\'s line carries the marker too');
    assert.equal(t.a2.stats.ballsPP, undefined, 'not a bowler → no phase keys');
  });
  test('phase keys follow the organiser\'s phases (none → no keys)', () => {
    const t = statTotals(play(true, { phasePP: 0, phaseDeath: 0 }));
    assert.equal('ballsPP' in t.a5.stats || 'ballsMid' in t.a5.stats, false, 'no phases → no phase keys');
    assert.equal(t.a5.stats.newEra, 1);
    const t2 = statTotals(play(true, { phasePP: 2, phaseDeath: 0 }));
    assert.deepEqual([t2.a5.stats.ballsPP, t2.a6.stats.ballsPP, 'ballsDeath' in t2.a5.stats], [6, 6, false]);
  });
  test('careers: hidden on older lines, shown over the new-era ones with a coverage note', () => {
    const old = L('p', { runs: 30, innings: 1, notOut: 0, ballsFaced: 20, fours: 3, sixes: 1, wickets: 1, ballsBowled: 24, runsConceded: 20, dots: 10 });
    const c0 = careerFromSchema(cricketStats, [old]);
    for (const k of ['dotPct', 'bndPct']) assert.equal(c0.batting.some((r) => r.key === k), false, k);
    for (const k of ['bowlDotPct', 'econPP', 'econMid', 'econDeath']) assert.equal(c0.bowling.some((r) => r.key === k), false, k);
    const era = L('p', {
      runs: 40, innings: 1, notOut: 0, ballsFaced: 30, fours: 4, sixes: 2, newEra: 1, dotsF: 12, bndRuns: 28,
      wickets: 2, ballsBowled: 24, runsConceded: 30, dots: 12, ballsPP: 12, runsPP: 12, ballsMid: 0, runsMid: 0, ballsDeath: 12, runsDeath: 18,
    });
    const lines = [old, era];
    const c = careerFromSchema(cricketStats, lines);
    const val = (sec: string, k: string) => c[sec].find((r) => r.key === k)?.value;
    assert.equal(val('batting', 'dotPct'), '40%', '12 of 30 — the old line\'s 20 balls not counted');
    assert.equal(val('batting', 'bndPct'), '70%', '28 of 40');
    assert.equal(val('bowling', 'bowlDotPct'), '50%');
    assert.equal(val('bowling', 'econPP'), '6.00');
    assert.equal(val('bowling', 'econDeath'), '9.00');
    assert.equal(c.bowling.some((r) => r.key === 'econMid'), false, 'never bowled in the middle overs → hidden');
    assert.deepEqual(coverageOf(cricketStats, statDefIn(cricketStats, 'dotPct')!, lines), { tracked: 1, total: 2 });
    // the old totals are untouched
    assert.equal(careerFromSchema(cricketStats, lines).batting.find((r) => r.key === 'runs')?.value, '70');
  });
});

/* ───────────────────────── 5. share card ───────────────────────── */

describe('5 · the WhatsApp share card (end of innings, end of match, an over)', () => {
  const match = () => {
    const m = live({ overs: 1, powerplayOvers: 0 });
    m.crease('h3', 'h4', 'a5');
    m.runs(4, 1, 6, 0);
    m.ball('WICKET', { kind: 'bowled', newBatId: 'h5' });
    m.runs(2);
    return m;
  };
  const opts = { homeName: 'Red House', awayName: 'Blue House', matchId: 'm-1', tournamentName: 'Inter-house T1', nameOf: UP };
  test('stages: nothing mid-innings, the innings once the chase starts, the result at the end', () => {
    const m = live({ overs: 1 });
    m.crease('h3', 'h4', 'a5');
    m.runs(1);
    assert.deepEqual(shareStages(m.s), []);
    const x = match();
    assert.deepEqual(shareStages(x.s), ['innings1']);
    assert.equal(firstBatting(x.s), 'home');
    x.crease('a3', 'a4', 'h6');
    x.runs(6, 6, 0, 0, 0, 0);
    assert.equal(x.s.ended, true);
    assert.deepEqual(shareStages(x.s), ['innings1', 'result']);
  });
  test('end of innings: the total, the top batters and bowlers, the chase, the link', () => {
    const x = match();
    const text = inningsShareText(x.s, opts);
    assert.equal(text, [
      '🏏 END OF INNINGS · Inter-house T1',
      '*Red House 13/1* (1.0 ov · RR 13.00)',
      '🏏 H4 6 (3) · H3 5* (2) · H5 2* (1)',
      '🎯 Blue House: A5 1/13 (1.0)',
      '🎯 Blue House need 14 to win from 1 over',
      '',
      'Follow live on SportnNote: https://app.sportnnote.in/m/m-1',
    ].join('\n'));
    assert.equal(shareCardText(x.s, 'innings1', opts), text);
    // The Hundred counts balls; a revised target says so
    const h = { ...init({ overs: 10, ballsPerOver: 10, hundred: true }), innings: 2 as const, battingSide: 'away' as const, target: 131, revision: 'dls' as const };
    assert.match(inningsShareText(h, opts), /Blue House need 131 to win from 100 balls \(DLS\)/);
    assert.match(inningsShareText(x.s, { ...opts, nameOf: (id, n) => (id === 'h4' ? '•••' : UP(id, n)) }), /🏏 ••• 6 \(3\)/);
    // IDs-only: without a lookup the card can't name anyone (the state keeps ids)
    assert.match(inningsShareText(x.s, { ...opts, nameOf: undefined }), /🏏 Player 6 \(3\)/);
  });
  test('end of match: both totals, the result, each innings\' best, the Player of the Match', () => {
    const x = match();
    x.crease('a3', 'a4', 'h6');
    x.runs(6, 6, 0, 0, 0, 0);
    const text = resultShareText(x.s, { ...opts, potmName: 'H3' });
    assert.equal(text.split('\n').slice(0, 4).join('\n'), [
      '🏏 RESULT · Inter-house T1',
      '*Red House 13/1* (1.0 ov)',
      '*Blue House 12/0* (1.0 ov)',
      '🏆 Red House won by 1 run',
    ].join('\n'));
    assert.match(text, /\nBlue House batting\n🏏 A3 12\* \(6\)\n🎯 Red House: H6 0\/12 \(1\.0\)/);
    assert.match(text, /🏅 Player of the Match: H3\n\nFull scorecard on SportnNote: https:\/\/app\.sportnnote\.in\/m\/m-1$/);
    assert.equal(resultText(x.s, { ...opts, resultLine: 'Match abandoned — Rain' }), '🏁 Match abandoned — Rain');
    assert.equal(previewText('*Red House 13/1* (1.0 ov)'), 'Red House 13/1 (1.0 ov)');
  });
  test('an over (the commentary\'s "Share over")', () => {
    const x = match();
    const text = overShareText(x.s, { inn: 1, side: 'home', over: 1 }, opts)!;
    assert.equal(text, [
      '🏏 *Red House* · End of over 1 · 13 runs · 1 wkt · 13/1 · CRR 13.00',
      'This over: 4 1 6 0 W 2',
      '🏏 H5 2 (1) · H3 5 (2)',
      '🎯 A5 1.0-0-13-1',
      'Inter-house T1',
      '',
      'Follow live on SportnNote: https://app.sportnnote.in/m/m-1',
    ].join('\n'));
    assert.equal(overShareText(x.s, { inn: 2, side: 'away', over: 1 }, opts), null);
    assert.match(overShareText(x.s, { inn: 1, side: 'home', over: 1 }, { homeName: 'R', awayName: 'B', nameOf: UP })!, /Scored on SportnNote — /);
  });
});
