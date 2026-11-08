/**
 * Court-team round 2 — the founder's answers to the deep wave's open
 * questions (docs/sport-depth/deep-wave/court-team-round2.md):
 *  - basketball: fast-break points include the and-one free throw (NBA),
 *    derived from play order, so a match tagged before recomputes;
 *  - basketball: the shot-zone buttons are the default layout for a NEW
 *    match; a format without the key (every older match) stays plain;
 *  - netball: 2-point super shots as organiser presets (Super Netball, the
 *    UK Super League, the ANZ Premiership, a custom window), default off;
 *  - netball: centre pass receives on by default with International 4 × 15.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init, reducer, BB_TRACK_DEFAULTS, scoringLayout, type BasketballState } from '../src/sports/basketball/engine.ts';
import { creditAttribution, ftCredits, makeCredits } from '../src/sports/basketball/credits.ts';
import { foulAction, freeThrowAction, scoreAction, statAction, type StatPlay } from '../src/sports/basketball/actions.ts';
import { andOneFreeThrows, bbDeepKeys, bbDeepRows, bbTeamFigures, fastBreakPlays, possessionTags } from '../src/sports/basketball/deep.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import {
  init as nbInit, reducer as nbReducer, superShotConfig, superShotLive, superShotText,
  NETBALL_PRESETS, NETBALL_LIVE_SETTINGS, SUPER_SHOT_PRESETS, SUPER_SHOT_RULE_OPTIONS, type NetballState,
} from '../src/sports/netball/engine.ts';
import { customCount } from '../src/sports/liveSettings.ts';

/* -------------------------------- basketball -------------------------------- */

type Side = 'home' | 'away';
const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), CHEN = P('p-chen', 'Chen');
const XAVI = P('p-xavi', 'Xavi'), YUSUF = P('p-yusuf', 'Yusuf');
const at = (q: number, sec: number) => ({ quarter: q, minute: Math.floor(sec / 60), sec, v: 2 });
// IDs-only scoring: the actions the controls send (actions.ts — the player by id), stamped like `fire`
const stamp = (a: ScoreAction, q: number, sec: number, extra: Record<string, unknown> = {}): ScoreAction => ({ ...a, payload: { ...a.payload, ...at(q, sec), ...extra } });
const make = (side: Side, p: Player | undefined, pts: number, q: number, sec: number, extra: Record<string, unknown> = {}): ScoreAction =>
  stamp(scoreAction(side, pts, p), q, sec, extra);
const ft = (side: Side, p: Player | undefined, made: boolean, q: number, sec: number): ScoreAction => stamp(freeThrowAction(side, made, p), q, sec);
const foul = (side: Side, p: Player, q: number, sec: number, foulType: 'shooting' | 'personal' = 'shooting'): ScoreAction => stamp(foulAction(side, p, foulType), q, sec);
const simple = (type: StatPlay) => (side: Side, p: Player, q: number, sec: number): ScoreAction => stamp(statAction(side, type, p), q, sec);
const ast = simple('ASSIST'), stl = simple('STEAL');
const tag = (id: number, fb = true): ScoreAction => ({ type: 'TAG', payload: { id, fb } });
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: 1 } };
const FB = { trackFastBreak: true };

describe('round 2 · basketball: the and-one free throw of a basket (derived from play order)', () => {
  test('pairs a basket with the one free throw that follows it in the same possession', () => {
    const s = run(init(FB), KO,
      make('home', ARJUN, 2, 1, 10), foul('away', XAVI, 1, 10), ft('home', ARJUN, true, 1, 11), // 1 → 3 (the foul between is fine)
      make('away', XAVI, 3, 1, 20), ast('away', YUSUF, 1, 20), ft('away', XAVI, false, 1, 21), // 4 → 6 (missed — still the and-one)
      make('home', BEN, 2, 1, 30), ft('home', BEN, true, 1, 40), ft('home', BEN, true, 1, 40), // 7: a 2-shot trip is another foul's
      make('home', CHEN, 2, 1, 50), ft('home', BEN, true, 1, 51), // 10: another shooter's free throw
      make('away', XAVI, 2, 1, 60), stl('home', ARJUN, 1, 61), ft('away', XAVI, true, 1, 62), // 12: the other side had the ball
    );
    const pairs = [...andOneFreeThrows(s).entries()].map(([b, f]) => [b, f.id]);
    assert.deepEqual(pairs, [[1, 3], [4, 6]]);
  });
  test('a new period closes it; a team-credited basket takes anyone\'s free throw; 3×3 baskets too', () => {
    const q = run(init({}), KO, make('home', ARJUN, 2, 1, 599), { type: 'NEXT_QUARTER' }, ft('home', ARJUN, true, 2, 0));
    assert.equal(andOneFreeThrows(q).size, 0);
    const team = run(init({}), KO, make('home', undefined, 3, 1, 10), ft('home', BEN, true, 1, 11));
    assert.equal(andOneFreeThrows(team).get(1)?.id, 2);
    const half = run(init({ targetPoints: 21, regPeriods: 1 }), KO, make('home', ARJUN, 1, 1, 10), ft('home', ARJUN, true, 1, 11));
    assert.equal(andOneFreeThrows(half).get(1)?.id, 2);
    const legacyFt = run(init({}), KO, make('home', ARJUN, 2, 1, 10), { type: 'SCORE', side: 'home', payload: { points: 1, ...at(1, 11) } });
    assert.equal(andOneFreeThrows(legacyFt).size, 0, 'a full-court "+1" basket is not a free throw');
  });
});

describe('round 2 · basketball: fast-break points include the and-one free throw (NBA)', () => {
  // Arjun's tagged fast break + the and-one; Xavi's untagged and-one; Ben's tagged 3, and-one missed
  const game = (): BasketballState => run(init(FB), KO,
    make('home', ARJUN, 2, 1, 10, { fbt: true, fb: true }), foul('away', XAVI, 1, 10), ft('home', ARJUN, true, 1, 11),
    make('away', XAVI, 2, 1, 30, { fbt: true }), ft('away', XAVI, true, 1, 31),
    make('home', BEN, 3, 1, 50, { fbt: true, fb: true }), ft('home', BEN, false, 1, 51),
  );
  test('fastBreakPlays: the tagged basket\'s points and its made and-one free throw', () => {
    assert.deepEqual([...fastBreakPlays(game()).entries()], [[1, 2], [3, 1], [6, 3]]);
  });
  test('team figures, the panel row, and the box / career lines (the free throw goes to its shooter)', () => {
    const s = game();
    assert.deepEqual([bbTeamFigures(s, 'home').fastBreak, bbTeamFigures(s, 'away').fastBreak], [6, 0]);
    const row = basketballPanel(s, 'all').categories.find((c) => c.key === 'scoring')!.rows.find((r) => r.key === 'fastBreak')!;
    assert.deepEqual([row.h, row.a], [6, 0]);
    const t = basketballStatTotals(s);
    assert.deepEqual([t['p-arjun'].stats.fastBreakPoints, t['p-ben'].stats.fastBreakPoints, t['p-xavi'].stats.fastBreakPoints], [3, 3, 0]);
    assert.ok(bbDeepKeys(s).includes('fastBreakPoints'));
  });
  test('an unnamed and-one free throw counts for the team (box team row), never for someone else', () => {
    const s = run(init(FB), KO, make('home', ARJUN, 2, 1, 10, { fbt: true, fb: true }), ft('home', undefined, true, 1, 11));
    assert.equal(bbTeamFigures(s, 'home').fastBreak, 3);
    assert.deepEqual(bbDeepRows(s).home.team, { fastBreakPoints: 1 });
    assert.equal(basketballStatTotals(s)['p-arjun'].stats.fastBreakPoints, 2);
  });
  test('derived: a basket tagged before (or after) its free throw recomputes — no replayed state changes', () => {
    // an older-style log (no `v: 2`, minute stamps, names from the attribution) whose fast break was tagged
    const old = run(init({}), KO,
      { type: 'SCORE', side: 'home', payload: { points: 2, quarter: 1, minute: 3, fbt: true }, attribution: creditAttribution('p-arjun', 'Arjun', makeCredits(2, false, false)) },
      { type: 'TAG', side: 'home', payload: { fb: true } },
      { type: 'FREE_THROW', side: 'home', payload: { made: true, quarter: 1, minute: 3 }, attribution: creditAttribution('p-arjun', 'Arjun', ftCredits(true)) },
    );
    assert.equal(bbTeamFigures(old, 'home').fastBreak, 3);
    // tag the basket once its free throw is already in the log
    let s = run(init(FB), KO, make('home', ARJUN, 2, 1, 10, { fbt: true }), ft('home', ARJUN, true, 1, 11));
    assert.equal(bbTeamFigures(s, 'home').fastBreak, 0);
    s = reducer(s, tag(1));
    assert.equal(bbTeamFigures(s, 'home').fastBreak, 3);
    assert.deepEqual([s.home, s.events.length], [3, 2], 'the tag changes no score and adds no play');
  });
  test('possession tags are unchanged by the shared "same possession" rule (the and-one stays in it)', () => {
    const s = run(init({}), KO, stl('home', ARJUN, 1, 5), make('home', ARJUN, 2, 1, 10), foul('away', XAVI, 1, 10), ft('home', ARJUN, true, 1, 11), make('away', XAVI, 2, 1, 20));
    const t = possessionTags(s);
    assert.deepEqual([t.get(2), t.get(4), t.has(5)], [{ offTo: true }, { offTo: true }, false]);
  });
});

describe('round 2 · basketball: shot-zone buttons are the default layout for a new match', () => {
  test('the standards: shot zones on (batch 3: missed shots on too; defaults-on wave 3: fast breaks and fouls drawn on)', () => {
    // defaults-on DOU2: fast breaks and fouls drawn on for NEW matches (an old format without the key still reads off)
    assert.deepEqual(BB_TRACK_DEFAULTS, { trackMisses: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true });
  });
  test('a new match (its format seeded with the defaults) scores with the zone buttons', () => {
    const s = init({ preset: 'fiba', ...BB_TRACK_DEFAULTS });
    assert.equal(scoringLayout(s), 'zones');
    assert.equal(s.trackZones, true);
  });
  test('an existing match keeps what it used: no key = plain +2 / +3 (state shape unchanged); switched off = plain', () => {
    const old = init({ preset: 'fiba', trackMisses: false });
    assert.equal('trackZones' in old, false);
    assert.equal(scoringLayout(old), 'plain');
    assert.equal(scoringLayout(init({ trackZones: false })), 'plain');
  });
  const src = (readFileSync(new URL('../src/sports/basketball/index.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/sports/basketball/meta.ts', import.meta.url), 'utf8'));
  test('the format offers the switch back without Customize; no preset overrides it; the controls read scoringLayout', () => {
    const line = src.split('\n').find((l) => l.includes("{ key: 'trackZones', label: 'Shot-zone scoring buttons'"));
    assert.ok(line && !line.includes('advanced: true'), 'shown in the format card');
    assert.match(line!, /default: BB_TRACK_DEFAULTS\.trackZones/);
    assert.equal(/set: \{[^}]*trackZones/.test(src), false, 'presets keep the organiser\'s choice');
    assert.match(src, /const zones = scoringLayout\(state\) === 'zones';/);
    assert.match(src, /defaults: \{ \.\.\.BB_TRACK_DEFAULTS \}/);
  });
});

/* ---------------------------------- netball ---------------------------------- */

describe('round 2 · netball: centre pass receives on by default for International 4 × 15', () => {
  test('the international preset switches CPR on; school and halves switch it off (a preset switch never carries it)', () => {
    assert.equal(NETBALL_PRESETS.international.set.trackCpr, true);
    assert.equal(NETBALL_PRESETS.school.set.trackCpr, false);
    assert.equal(NETBALL_PRESETS.halves.set.trackCpr, false);
    assert.equal(nbInit({ preset: 'international', ...NETBALL_PRESETS.international.set }).trackCpr, true);
    assert.equal(nbInit({ preset: 'school', ...NETBALL_PRESETS.school.set }).trackCpr, false);
  });
  test('an existing match keeps what it had (no key: not on the state); still switchable off', () => {
    assert.equal('trackCpr' in nbInit({ preset: 'international', periods: 4, periodMinutes: 15 }), false);
    assert.equal(nbInit({ ...NETBALL_PRESETS.international.set, trackCpr: false }).trackCpr, false);
  });
  test('the live settings call the international set-up "Standard" (CPR on)', () => {
    assert.equal(NETBALL_LIVE_SETTINGS.defaults?.trackCpr, true);
    const intl = nbInit({ ...NETBALL_PRESETS.international.set });
    assert.equal(customCount(NETBALL_LIVE_SETTINGS, NETBALL_LIVE_SETTINGS.read(intl)), 0);
  });
});

describe('round 2 · netball: 2-point super shots as organiser presets (default off)', () => {
  test('the choices: off first (World Netball), the three league presets, a custom window', () => {
    assert.deepEqual(SUPER_SHOT_RULE_OPTIONS.map((o) => o.value), ['off', 'ssn', 'nsl', 'anz', 'custom']);
    assert.deepEqual(Object.values(SUPER_SHOT_PRESETS).map((p) => [p.minutes, p.extraTime]), [[5, true], [5, true], [5, false]]);
  });
  test('superShotConfig: a preset, a custom window, off; the deep wave\'s plain toggle still replays alike', () => {
    assert.deepEqual(superShotConfig({}), {});
    assert.deepEqual(superShotConfig({ superShotRule: 'off' }), {});
    assert.deepEqual(superShotConfig({ superShotRule: 'ssn', ssMinutes: 2 }), { superShot: true, ssMinutes: 5, ssEt: true, ssRule: 'ssn' }, 'a preset ignores the custom window');
    assert.deepEqual(superShotConfig({ superShotRule: 'nsl' }), { superShot: true, ssMinutes: 5, ssEt: true, ssRule: 'nsl' });
    assert.deepEqual(superShotConfig({ superShotRule: 'anz' }), { superShot: true, ssMinutes: 5, ssRule: 'anz' });
    assert.deepEqual(superShotConfig({ superShotRule: 'custom', ssMinutes: 3, ssExtraTime: true }), { superShot: true, ssMinutes: 3, ssEt: true, ssRule: 'custom' });
    assert.deepEqual(superShotConfig({ superShotRule: 'custom' }), { superShot: true, ssMinutes: 5, ssRule: 'custom' });
    assert.deepEqual(superShotConfig({ superShot: true, ssMinutes: 4 }), { superShot: true, ssMinutes: 4 }, 'legacy: exactly the old state fields');
    assert.deepEqual(superShotConfig({ superShotRule: 'off', superShot: true }), {}, 'a chosen rule decides');
    assert.deepEqual(superShotConfig({ superShotRule: 'mystery', superShot: true }), { superShot: true, ssMinutes: 5 }, 'an unknown rule falls back to the toggle');
  });
  test('init: off by default (no super-shot fields on the state); a preset puts them there', () => {
    const plain = nbInit({ superShotRule: 'off' });
    assert.equal(['superShot', 'ssMinutes', 'ssEt', 'ssRule'].some((k) => k in plain), false);
    const ssn = nbInit({ superShotRule: 'ssn' });
    assert.deepEqual([ssn.superShot, ssn.ssMinutes, ssn.ssEt, ssn.ssRule], [true, 5, true, 'ssn']);
  });
  test('the window: last 5 minutes of a quarter; all of extra time (and the play-on) only where the rule says', () => {
    const T = 1_700_000_000_000;
    const live = (cfg: Record<string, unknown>) => nbReducer(nbInit(cfg), { type: 'CLOCK', payload: { run: true, at: T } });
    assert.equal(superShotLive(live({ superShotRule: 'anz' }), T + 9 * 60_000), false);
    assert.equal(superShotLive(live({ superShotRule: 'anz' }), T + 10 * 60_000), true);
    const et = (cfg: Record<string, unknown>, period: number): NetballState => ({ ...nbInit({ decider: 'et', ...cfg }), et: true, period });
    assert.equal(superShotLive(et({ superShotRule: 'ssn' }, 5)), true, 'SSN: the first extra-time half, from its first second');
    assert.equal(superShotLive(et({ superShotRule: 'nsl' }, 7)), true, 'UK Super League: the play-on too');
    assert.equal(superShotLive(et({ superShotRule: 'anz' }, 5)), false);
    assert.equal(superShotLive(et({ superShot: true }, 5)), false, 'the deep wave toggle: regular quarters only, as before');
    assert.equal(superShotLive(et({ superShotRule: 'custom', ssExtraTime: true }, 6)), true);
    assert.equal(superShotLive(et({ superShotRule: 'off' }, 5)), false);
  });
  test('a 2-point goal counts 2 under any preset, 1 when off', () => {
    const goal: ScoreAction = { type: 'GOAL', side: 'home', payload: { pos: 'GS', points: 2, sec: 850, period: 1 } };
    assert.equal(nbReducer(nbInit({ superShotRule: 'anz' }), goal).home, 2);
    assert.equal(nbReducer(nbInit({ superShotRule: 'off' }), goal).home, 1);
  });
  test('the scorer\'s chip names the league\'s shot and zone', () => {
    assert.deepEqual(superShotText(nbInit({ superShotRule: 'anz' })), { name: '2-point shot', zone: '3.5 m or further from the post' });
    assert.equal(superShotText(nbInit({ superShotRule: 'ssn' })).name, 'Super shot');
    assert.deepEqual(superShotText(nbInit({ superShot: true })), { name: 'Super shot', zone: 'the super-shot zone' });
  });
  const src = (readFileSync(new URL('../src/sports/netball/index.tsx', import.meta.url), 'utf8') + readFileSync(new URL('../src/sports/netball/meta.ts', import.meta.url), 'utf8'));
  test('the format: one choice (default off) with the presets; the custom window fields; no plain toggle any more', () => {
    assert.match(src, /key: 'superShotRule', label: '2-point super shots', type: 'choice', default: 'off', advanced: true, options: SUPER_SHOT_RULE_OPTIONS/);
    assert.match(src, /key: 'ssMinutes'/);
    assert.match(src, /key: 'ssExtraTime'[^\n]*type: 'toggle', default: false/);
    assert.equal(/key: 'superShot',/.test(src), false);
  });
});
