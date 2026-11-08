/**
 * Wave 3 (docs/sport-expert/defaults-on/PLAN.md) for cricket and the cue /
 * board sports: "Stats to track" on by default for NEW matches; an existing
 * match's Info shows what its engine really tracks; snooker / pool get an
 * event-mode Stats to track card; the carrom fouls row folds; chess reads its
 * card defaults from meta.ts. docs/security/breaks/defaults-on-cricket-cue.md
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FormatField, LiveSettings, ScoreAction } from '../src/sports/types.ts';
import { formatDefaults } from '../src/sports/formatPick.ts';
import { matchCaptures, existingFormatShown } from '../src/sports/matchRules.ts';
import { standardOf } from '../src/sports/liveSettings.ts';
// cricket
import { CRICKET_META } from '../src/sports/cricket/meta.ts';
import {
  LOCAL_RULE_FIELDS, LOCAL_RULE_DEFAULTS, CRICKET_LIVE_SETTINGS, CRICKET_TRACK_DEFAULTS, rulesFromConfig, STANDARD_RULES,
} from '../src/sports/cricket/rules.ts';
import { init as cInit, reducer as cReducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { statTotals, DEEP_TOTAL_KEYS } from '../src/sports/cricket/scorecard.ts';
// snooker
import * as S from '../src/sports/snooker/engine.ts';
import * as SC from '../src/sports/snooker/controls.ts';
import { SNOOKER_META } from '../src/sports/snooker/meta.ts';
import { snookerStatTotals, snookerLongRestCaptured } from '../src/sports/snooker/totals.ts';
import { snookerUndoLabel } from '../src/sports/snooker/undo.ts';
// pool
import * as M from '../src/sports/pool/match.ts';
import * as PC from '../src/sports/pool/controls.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';
import { POOL_CORE } from '../src/sports/pool/core.ts';
import { sideKeysFor } from '../src/sports/pool/totals.ts';
import { poolUndoLabel } from '../src/sports/pool/undo.ts';
// carrom / chess
import * as carrom from '../src/sports/carrom/engine.ts';
import { CARROM_META } from '../src/sports/carrom/meta.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { CHESS_META } from '../src/sports/chess/meta.ts';
import { BILLIARDS_META } from '../src/sports/billiards/meta.ts';
import { SINGLES_CTX } from './cue-script.mts';

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const fieldOf = (fields: readonly FormatField[], k: string) => fields.find((f) => f.key === k)!;
const newFmt = (fields: readonly FormatField[]) => formatDefaults(fields as FormatField[]);
const isStatsToggle = (f: FormatField) => f.type === 'toggle' && /stat/i.test(f.group ?? '');

/* ------------------------------- cricket -------------------------------- */
const C_ON = ['wagonWheel', 'pitchMap', 'bowlerType', 'extraWhy'];
const C_OFF = ['ballSpeed', 'shotCtrl'];
const C_TRACK = [...C_ON, ...C_OFF];

const SETUP: ScoreAction[] = [
  { type: 'SET_STRIKER', payload: { id: 'h1', v: 2 } },
  { type: 'SET_NONSTRIKER', payload: { id: 'h2', v: 2 } },
];
/** ~120 balls an innings, no optional tap at all: the scorer only scores. */
function cricketLog(): ScoreAction[] {
  const out: ScoreAction[] = [...SETUP];
  let s = cInit({ overs: 20 });
  for (const a of SETUP) s = cReducer(s, a);
  let bw = 0;
  let k = 0;
  for (let guard = 0; guard < 400 && !s.ended && s.innings === 1; guard++) {
    if (!s.bowlerId) { const a = { type: 'SET_BOWLER', payload: { id: `a${bw++ % 5}`, v: 2 } }; out.push(a); s = cReducer(s, a); }
    const base = { strikerId: s.strikerId, bowlerId: s.bowlerId };
    k += 1;
    const a: ScoreAction = k % 17 === 0 ? { type: 'EXTRA', side: s.battingSide, payload: { ...base, kind: 'Wide', runs: 0 } }
      : { type: 'RUNS', side: s.battingSide, payload: { ...base, runs: [0, 1, 0, 4, 2, 0, 6][k % 7] } };
    out.push(a);
    s = cReducer(s, a);
  }
  return out;
}
const runC = (cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(cReducer, cInit(cfg));

describe('DOK1/DOK2 · cricket: wagon wheel, pitch map, bowler type, extra reason on for a new match', () => {
  test('the field defaults: four on, ball speed and shot control off (DOK10)', () => {
    for (const k of C_ON) assert.equal(fieldOf(LOCAL_RULE_FIELDS, k).default, true, k);
    for (const k of C_OFF) assert.equal(fieldOf(LOCAL_RULE_FIELDS, k).default, false, k);
    for (const k of C_ON) assert.equal(fieldOf(CRICKET_META.formatFields!, k).default, true, k);
  });
  test('one constant: CRICKET_TRACK_DEFAULTS = the fields = LOCAL_RULE_DEFAULTS = the card defaults', () => {
    for (const k of C_TRACK) {
      assert.equal(CRICKET_TRACK_DEFAULTS[k as keyof typeof CRICKET_TRACK_DEFAULTS], fieldOf(LOCAL_RULE_FIELDS, k).default, k);
      assert.equal(LOCAL_RULE_DEFAULTS[k], fieldOf(LOCAL_RULE_FIELDS, k).default, k);
      assert.equal(CRICKET_LIVE_SETTINGS.defaults?.[k], fieldOf(LOCAL_RULE_FIELDS, k).default, k);
    }
  });
  test('a new match (format from the defaults) reads them on; a tournament too', () => {
    for (const fmt of [newFmt(CRICKET_META.formatFields!), formatDefaults(CRICKET_META.formatFields!, 'tournament')]) {
      const r = rulesFromConfig(fmt);
      for (const k of C_ON) assert.equal(r[k as keyof typeof r], true, k);
      for (const k of C_OFF) assert.notEqual(r[k as keyof typeof r], true, k);
    }
  });
  test('the replay fallbacks are untouched: a missing key reads off, STANDARD_RULES.wagonWheel stays false', () => {
    assert.equal(STANDARD_RULES.wagonWheel, false);
    const r = rulesFromConfig({ overs: 20 });
    for (const k of C_TRACK) assert.notEqual(r[k as keyof typeof r], true, k);
    assert.match(src('src/sports/cricket/rules.ts'), /trackOn\(\(k\) => bool\(c\[k\], false\)\)/);
  });
  test('an old match (no keys, or keys stored off) replays exactly as before', () => {
    const log = cricketLog();
    const old = runC({ overs: 20 }, log);
    assert.deepEqual(old, runC({ overs: 20, ...Object.fromEntries(C_TRACK.map((k) => [k, false])) }, log));
    assert.equal(rulesFromConfig({ overs: 20, pitchMap: false }).pitchMap, undefined, 'DOK12: a stored false stays off');
  });
});

describe('DOK3 · cricket Reset gives the new standard', () => {
  test('standardOf = the new defaults (Reset turns the four captures on, ball speed / control off)', () => {
    const s = runC(newFmt(CRICKET_META.formatFields!), cricketLog().slice(0, 10));
    const std = standardOf(CRICKET_LIVE_SETTINGS as never, s)!;
    for (const k of C_ON) assert.equal(std[k], true, k);
    for (const k of C_OFF) assert.equal(std[k], false, k);
  });
  test('the card says a reset turns the captures on from the next ball', () => {
    assert.match(CRICKET_LIVE_SETTINGS.hint ?? '', /Reset/i);
  });
});

describe('DOK8/DOK9 · cricket: ~120 untagged balls, no false zeros, nothing blocked', () => {
  test('the new defaults score exactly as the captures off, ball for ball', () => {
    const log = cricketLog();
    const on = runC(newFmt(CRICKET_META.formatFields!), log);
    const off = runC({ ...newFmt(CRICKET_META.formatFields!), ...Object.fromEntries(C_TRACK.map((k) => [k, false])) }, log);
    assert.ok((on.log ?? []).length >= 120, `balls: ${(on.log ?? []).length}`);
    assert.deepEqual(on.scores, off.scores);
    assert.equal(on.innings, off.innings);
    assert.equal(on.strikerId, off.strikerId);
  });
  test('no optional-depth career key from untagged balls', () => {
    const s = runC(newFmt(CRICKET_META.formatFields!), cricketLog());
    for (const e of Object.values(statTotals(s as CricketState))) for (const k of DEEP_TOTAL_KEYS) assert.equal(e.stats[k], undefined, k);
  });
});

/* -------------------------- DOK4 · Info = truth -------------------------- */
describe('DOK4 · an existing match: a missing stats key shows Off (every sport)', () => {
  const FIELDS: FormatField[] = [
    { key: 'len', label: 'Length', type: 'number', default: 10 },
    { key: 'deep', label: 'Deep stat', type: 'toggle', default: true, group: 'Stats to track' },
    { key: 'rule', label: 'A rule', type: 'toggle', default: true },
  ];
  test('existingFormatShown: stored over defaults; a stats switch never stored reads Off; a rule keeps its default', () => {
    const shown = existingFormatShown(FIELDS, formatDefaults(FIELDS), { len: 12 });
    assert.deepEqual(shown, { len: 12, deep: false, rule: true });
    assert.equal(existingFormatShown(FIELDS, formatDefaults(FIELDS), { deep: true }).deep, true);
    assert.equal(existingFormatShown(FIELDS, formatDefaults(FIELDS), null).deep, false);
  });
  test('matchCaptures: a format capture missing from the stored format is Off (synthetic sport)', () => {
    const caps = matchCaptures(undefined, {}, FIELDS, { len: 12 }).captures;
    assert.deepEqual(caps.map((c) => [c.key, c.on]), [['deep', false]]);
    assert.equal(matchCaptures(undefined, {}, FIELDS, { deep: true }).captures[0].on, true);
  });
  test('matchCaptures: a live-card toggle its read leaves out is Off, not the default', () => {
    const ls: LiveSettings<unknown> = { title: 't', mode: 'event', fields: [FIELDS[1]], read: () => ({}), defaults: { deep: true } };
    assert.equal(matchCaptures(ls, {}, [], {}).captures[0].on, false);
  });
  test('cricket: an old match without the keys shows them Off in Info', () => {
    const s = runC({ overs: 20 }, cricketLog().slice(0, 6));
    const caps = Object.fromEntries(matchCaptures(CRICKET_LIVE_SETTINGS as never, s, CRICKET_META.formatFields!, { overs: 20 }).captures.map((c) => [c.key, c.on]));
    for (const k of C_TRACK) assert.equal(caps[k], false, k);
  });
  test('cricket: a new match shows the four On', () => {
    const fmt = newFmt(CRICKET_META.formatFields!);
    const s = runC(fmt, cricketLog().slice(0, 6));
    const caps = Object.fromEntries(matchCaptures(CRICKET_LIVE_SETTINGS as never, s, CRICKET_META.formatFields!, fmt).captures.map((c) => [c.key, c.on]));
    for (const k of C_ON) assert.equal(caps[k], true, k);
    for (const k of C_OFF) assert.equal(caps[k], false, k);
  });
  test('the screen seeds Edit format with existingFormatShown (not defaults over config)', () => {
    const scr = src('src/screens/LiveScoringScreen.tsx');
    assert.match(scr, /existingFormatShown\(/);
    assert.doesNotMatch(scr, /const shown = \{ \.\.\.defaultsFor\(/);
  });
});

/* ------------------------------- snooker -------------------------------- */
describe('snooker: long pots and rest shots on for a new match; a Stats to track card (S2)', () => {
  test('the format field defaults it on', () => {
    assert.equal(fieldOf(SNOOKER_META.formatFields!, 'trackLongRest').default, true);
    assert.equal(S.createInitialState(newFmt(SNOOKER_META.formatFields!)).trackLR, true);
  });
  test('DOK1: an old match (no key / stored off) tracks nothing', () => {
    assert.equal(S.createInitialState({ reds: 15 }).trackLR, undefined);
    assert.equal(S.createInitialState({ reds: 15, trackLongRest: false }).trackLR, undefined);
  });
  test('DOK2/DOK5: SNOOKER_LIVE_SETTINGS — event mode, SET_TRACK, defaults from meta.ts, group Stats to track', () => {
    const ls = S.SNOOKER_LIVE_SETTINGS;
    assert.equal(ls.mode, 'event');
    assert.equal(ls.actionType, 'SET_TRACK');
    assert.equal(fieldOf(ls.fields, 'trackLongRest').default, fieldOf(SNOOKER_META.formatFields!, 'trackLongRest').default);
    assert.equal(ls.defaults?.trackLongRest, true);
    assert.equal(fieldOf(ls.fields, 'trackLongRest').group, 'Stats to track');
    assert.match(src('src/sports/snooker/index.tsx'), /liveSettings:\s*SNOOKER_LIVE_SETTINGS/);
  });
  test('DOK5: SET_TRACK off mid-frame hides the chips from the next shot; the score and the turn are untouched', () => {
    let s = S.createInitialState(newFmt(SNOOKER_META.formatFields!));
    s = S.reducer(s, SC.potAction(s, 'red', { long: true })!);
    const before = s;
    s = S.reducer(s, { type: 'SET_TRACK', payload: { trackLongRest: false } });
    assert.notEqual(s, before);
    assert.equal(s.trackLR, undefined);
    assert.deepEqual(s.frame, before.frame);
    assert.deepEqual(s.framesWon, before.framesWon);
    assert.deepEqual(S.SNOOKER_LIVE_SETTINGS.read(s), { trackLongRest: false });
    // a long tag sent after the switch-off is not counted
    const s2 = S.reducer(s, SC.potAction(s, 'black', { long: true })!);
    assert.equal(s2.frame?.visit.lp ?? 0, before.frame?.visit.lp ?? 0);
    // and back on
    assert.equal(S.reducer(s2, { type: 'SET_TRACK', payload: { trackLongRest: true } }).trackLR, true);
    assert.equal(snookerUndoLabel({ type: 'SET_TRACK', prev: before, next: s }), 'stats-to-track setting');
  });
  test('DOK6: what was tagged before the switch-off stays in the stats and careers', () => {
    let s = S.createInitialState(newFmt(SNOOKER_META.formatFields!));
    s = S.reducer(s, SC.potAction(s, 'red', { long: true, rest: true })!);
    s = S.reducer(s, { type: 'SET_TRACK', payload: { trackLongRest: false } });
    assert.deepEqual(snookerLongRestCaptured(s), { long: true, rest: true });
    const t = snookerStatTotals(s, SINGLES_CTX as never);
    assert.equal(t.h1.stats.longPots, 1);
    assert.equal(t.h1.stats.restShots, 1);
  });
  test('DOK4: Info on an old match reads Off; a new match On', () => {
    const on = (cfg: Record<string, unknown>) => matchCaptures(S.SNOOKER_LIVE_SETTINGS as never, S.createInitialState(cfg), SNOOKER_META.formatFields!, cfg).captures.find((c) => c.key === 'trackLongRest')?.on;
    assert.equal(on({ reds: 15 }), false);
    assert.equal(on(newFmt(SNOOKER_META.formatFields!)), true);
  });
  test('junk SET_TRACK payloads never throw and change nothing else', () => {
    const s = S.createInitialState(newFmt(SNOOKER_META.formatFields!));
    for (const p of [undefined, null, 1, 'x', { trackLongRest: 'yes' }, { other: true }]) {
      const n = S.reducer(s, { type: 'SET_TRACK', payload: p as never });
      assert.deepEqual(n.frame, s.frame);
    }
  });
});

/* --------------------------------- pool --------------------------------- */
function poolGame(config: Record<string, unknown>) {
  let s = M.poolInit(config);
  const tap = (a: ScoreAction) => { s = M.poolReducer(s, a); };
  return { get s() { return s; }, tap };
}
describe('pool: shot clock stays off; a Stats to track card', () => {
  test('DOK10: trackShotClock stays off for a new match', () => {
    assert.equal(fieldOf(POOL_META.formatFields!, 'trackShotClock').default, false);
    assert.notEqual(M.poolInit(newFmt(POOL_META.formatFields!)).opt?.shotClock, true);
  });
  test('DOK2/DOK5: POOL_LIVE_SETTINGS on the plugin core — event mode, SET_TRACK, defaults from meta.ts', () => {
    const ls = POOL_CORE.liveSettings;
    assert.equal(ls, M.POOL_LIVE_SETTINGS);
    assert.equal(ls.mode, 'event');
    assert.equal(ls.actionType, 'SET_TRACK');
    assert.equal(fieldOf(ls.fields, 'trackShotClock').default, false);
    assert.equal(ls.defaults?.trackShotClock, false);
    assert.equal(fieldOf(ls.fields, 'trackShotClock').group, 'Stats to track');
  });
  test('DOK5/DOK6: switched on mid-match, then off: extensions taken stay counted; the score is untouched', () => {
    const g = poolGame({ game: 'nine', raceTo: 3 });
    g.tap(PC.lagAction(g.s, 'home'));
    g.tap(PC.breakAction(g.s, { pots: [] }));
    assert.equal(PC.extensionReady(g.s), false);
    const pre = g.s;
    g.tap({ type: 'SET_TRACK', payload: { trackShotClock: true } });
    assert.deepEqual(g.s.current, pre.current);
    assert.deepEqual(g.s.rack, pre.rack);
    assert.deepEqual(M.POOL_LIVE_SETTINGS.read(g.s), { trackShotClock: true });
    assert.ok(PC.extensionReady(g.s));
    g.tap(PC.extensionAction(g.s)!);
    assert.equal(M.sideCounts(g.s, 'away').extensions, 1);
    const before = g.s;
    g.tap({ type: 'SET_TRACK', payload: { trackShotClock: false } });
    assert.equal(PC.extensionReady(g.s), false);
    assert.equal(poolUndoLabel({ type: 'SET_TRACK', prev: before, next: g.s }), 'stats-to-track setting');
    // the careers still get the extension taken while it was tracked
    assert.ok(sideKeysFor('nine', g.s).includes('extensions'));
    assert.equal(M.sideCounts(g.s, 'away').extensions, 1);
    // never switched on, nothing taken: no extensions key (no false zero)
    assert.ok(!sideKeysFor('nine', M.poolInit({ game: 'nine', raceTo: 3 })).includes('extensions'));
  });
  test('DOK1: an old pool match keeps the clock off; junk SET_TRACK changes nothing', () => {
    const s = M.poolInit({ game: 'nine', raceTo: 3 });
    assert.notEqual(s.opt?.shotClock, true);
    for (const p of [undefined, null, 'x', { trackShotClock: 'yes' }]) {
      const n = M.poolReducer(s, { type: 'SET_TRACK', payload: p as never });
      assert.notEqual(n.opt?.shotClock, true);
    }
  });
});

/* -------------------------------- carrom -------------------------------- */
describe('carrom: fouls on for a new match; the fouls row folds (C3)', () => {
  test('trackFouls defaults on; break and missed covers stay on; one source', () => {
    const f = CARROM_META.formatFields!;
    assert.equal(fieldOf(f, 'trackFouls').default, true);
    assert.equal(fieldOf(f, 'trackBreak').default, true);
    assert.equal(fieldOf(f, 'trackQueenMiss').default, true);
    assert.equal(carrom.CARROM_LIVE_SETTINGS.defaults?.trackFouls, true);
    assert.deepEqual(carrom.init(newFmt(f)).track, { fouls: true, brk: true, qMiss: true });
  });
  test('DOK1: an old match tracks no fouls', () => {
    assert.equal(carrom.init({ preset: 'icf', target: 25 }).track, undefined);
    assert.equal(carrom.init({ preset: 'icf', trackFouls: false }).track?.fouls, undefined);
  });
  test('DOK7: folded only while nothing is tapped; opens on the link, a foul this board, or a foul earlier in the match', () => {
    const s = carrom.init(newFmt(CARROM_META.formatFields!));
    assert.equal(carrom.carromFoulsOpen(s, { opened: false, boardFouls: 0 }), false);
    assert.equal(carrom.carromFoulsOpen(s, { opened: true, boardFouls: 0 }), true);
    assert.equal(carrom.carromFoulsOpen(s, { opened: false, boardFouls: 1 }), true, 'the end-foul chip logs a striker foul');
    const withFoul = carrom.reducer(s, { type: 'BOARD', side: 'home', payload: { coins: 3, queen: false, det: { fouls: { home: { touch: 1 }, away: {} }, dues: { home: 0, away: 0 }, split: true } } } as never);
    assert.ok(carrom.carromFoulsCaptured(withFoul.boards));
    assert.equal(carrom.carromFoulsOpen(withFoul, { opened: false, boardFouls: 0 }), true, 'from now on every board is a real count');
    assert.equal(carrom.carromFoulsOpen(carrom.init({ preset: 'icf' }), { opened: true, boardFouls: 0 }), false, 'not tracked: no row');
  });
  test('the board form uses the fold and a "Fouls ▾" link', () => {
    const ix = src('src/sports/carrom/index.tsx');
    assert.match(ix, /carromFoulsOpen\(/);
    assert.match(ix, /Fouls ▾/);
  });
});

/* -------------------------------- chess --------------------------------- */
describe('chess: moves and clock stay off; the card reads meta.ts (H1)', () => {
  test('CHESS_LIVE_SETTINGS lives in the pure engine; defaults = the format fields', () => {
    const ls = chess.CHESS_LIVE_SETTINGS;
    for (const k of ['trackMoves', 'trackClock']) {
      assert.equal(fieldOf(CHESS_META.formatFields!, k).default, false, k);
      assert.equal(fieldOf(ls.fields, k).default, fieldOf(CHESS_META.formatFields!, k).default, k);
      assert.equal(ls.defaults?.[k], fieldOf(CHESS_META.formatFields!, k).default, k);
      assert.equal(fieldOf(ls.fields, k).group, 'Stats to track', k);
    }
    const ix = src('src/sports/chess/index.tsx');
    assert.match(ix, /liveSettings:\s*CHESS_LIVE_SETTINGS/);
    assert.doesNotMatch(ix, /defaults: \{ trackMoves: false, trackClock: false \}/);
  });
});

/* ----------------------------- DOK11 groups ------------------------------ */
describe('DOK11 · every stats toggle carries group "Stats to track"', () => {
  test('format fields and live cards of cricket, snooker, pool, carrom, chess; billiards has none', () => {
    const TRACK = /^(track|wagonWheel$|pitchMap$|shotCtrl$|ballSpeed$|bowlerType$|extraWhy$)/;
    const sets: FormatField[][] = [
      CRICKET_META.formatFields!, LOCAL_RULE_FIELDS, SNOOKER_META.formatFields!, S.SNOOKER_LIVE_SETTINGS.fields,
      POOL_META.formatFields!, M.POOL_LIVE_SETTINGS.fields, CARROM_META.formatFields!, carrom.CARROM_LIVE_SETTINGS.fields,
      CHESS_META.formatFields!, chess.CHESS_LIVE_SETTINGS.fields,
    ];
    for (const fs of sets) for (const f of fs) if (f.type === 'toggle' && TRACK.test(f.key)) assert.equal(f.group, 'Stats to track', f.key);
    assert.ok(!(BILLIARDS_META.formatFields ?? []).some(isStatsToggle));
  });
});
