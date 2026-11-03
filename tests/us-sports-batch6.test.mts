/**
 * US sports batch 6 (docs/security/breaks/us-sports-batch6.md) — P2 depth:
 *  - basketball: NBA last-2-minutes / overtime bonus, jump ball / held ball /
 *    alternating-possession arrow, coach (C) and bench (B) technicals with the
 *    coach-disqualification count;
 *  - baseball: pitch types hidden without pitch-by-pitch, dropped third
 *    strike, catcher's interference, triple play;
 *  - American football: flag school "Standard", returns (kickoff / punt /
 *    interception) with the returner, blocked punt / field goal, onside kick,
 *    fumble kept by the offence, forced fumble, penalty on a play (accepted /
 *    declined / offsetting / enforced at the end).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import {
  init as bbInit, reducer as bbReducer, inBonus, freeThrowsFor, arrowSide, coachTechnicals, coachDisqualified, countsAsTeamFoul, teamFoulsThisQuarter,
  type BasketballState,
} from '../src/sports/basketball/engine.ts';
import { foulAction, jumpBallAction, lineupAction } from '../src/sports/basketball/actions.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures } from '../src/sports/basketball/deep.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballFeed, describePlay } from '../src/sports/basketball/commentary.ts';
import { BASKETBALL_META } from '../src/sports/basketball/meta.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import {
  init as bsInit, reducer as bsReducer, buildPlay as bsPlay, readConfig, TRACK_FIELDS as BS_TRACK, BASEBALL_LIVE_SETTINGS, OUTCOME_LABEL,
  type BaseballState,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';
import { baseballCommentary } from '../src/sports/baseball/commentary.ts';
import { BASEBALL_META } from '../src/sports/baseball/meta.ts';
import {
  init as afInit, reducer as afReducer, buildPlay as afPlay, AF_LIVE_SETTINGS, teamFigures, eventCredits as afCredits, type AFState,
} from '../src/sports/american_football/engine.ts';
import { afTotals } from '../src/sports/american_football/totals.ts';
import { afCommentary } from '../src/sports/american_football/commentary.ts';
import { afSheet } from '../src/sports/american_football/sheet.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { customCount } from '../src/sports/liveSettings.ts';
import { isHidden } from '../src/sports/formatPick.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const presetSet = (meta: typeof BASKETBALL_META, v: string) => meta.formatFields!.find((f) => f.key === 'preset')!.options!.find((o) => o.value === v)!.set!;

/* -------------------------------- basketball -------------------------------- */

const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), XAVI = P('p-xavi', 'Xavi'), YUSUF = P('p-yusuf', 'Yusuf');
const SQUADS = withRosters(undefined, [ARJUN, BEN], [XAVI, YUSUF]);
/** a play at second `sec` of quarter `q` (game clock) */
const at = (a: ScoreAction, sec: number, q = 1): ScoreAction => ({ ...a, payload: { ...a.payload, quarter: q, minute: Math.floor(sec / 60), sec, v: 2 } });
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bbReducer, s);
const startBB = (cfg: Record<string, unknown> = {}) =>
  run(bbInit({ periodMinutes: 12, regPeriods: 4, foulsForBonus: 4, gameClock: true, ...cfg }), lineupAction('home', [ARJUN, BEN]), lineupAction('away', [XAVI, YUSUF]), { type: 'KICKOFF', payload: { at: 1 } });
const last = (s: BasketballState) => s.events.at(-1)!;
const quarter = (s: BasketballState, q: number): BasketballState => { let x = s; while (x.quarter < q) x = bbReducer(x, { type: 'NEXT_QUARTER' }); return x; };

describe('basketball · NBA last-2-minutes bonus (BK15)', () => {
  const LATE = 12 * 60 - 100; // 1:40 left
  test('the NBA preset carries the key; FIBA does not', () => {
    assert.equal(presetSet(BASKETBALL_META, 'nba').nbaBonus, true);
    assert.notEqual(presetSet(BASKETBALL_META, 'fiba').nbaBonus, true);
    assert.equal('nbaBonus' in bbInit({ foulsForBonus: 4 }), false, 'an older format keeps its state shape');
  });
  test('NBA: one free team foul in the last 2:00, the 2nd is in the penalty', () => {
    let s = startBB({ nbaBonus: true });
    s = run(s, at(foulAction('home', ARJUN), 60));
    assert.equal(inBonus(s, 'away', LATE + 5), false, 'no late foul yet: the next one is free');
    assert.equal(freeThrowsFor(s, 'home', 'personal', LATE + 5), 0);
    s = run(s, at(foulAction('home', BEN), LATE));
    assert.equal(inBonus(s, 'away', LATE + 10), true, 'the 2nd late foul gives free throws');
    assert.equal(freeThrowsFor(s, 'home', 'personal', LATE + 10), 2);
    // before 2:00 the late rule doesn't apply
    assert.equal(inBonus(s, 'away', 300), false);
  });
  test('NBA overtime: the bonus from the 4th team foul (quota 3)', () => {
    let s = quarter(startBB({ nbaBonus: true, otFoulsCarry: false }), 4);
    s = { ...s, home: 50, away: 50 };
    s = bbReducer(s, { type: 'START_OVERTIME' });
    assert.equal(s.quarter, 5);
    s = run(s, ...[10, 20, 30].map((t) => at(foulAction('home', ARJUN), t, 5)));
    assert.equal(inBonus(s, 'away', 40), true);
    const fiba = run(bbReducer({ ...quarter(startBB({ otFoulsCarry: false }), 4), home: 50, away: 50 }, { type: 'START_OVERTIME' }), ...[10, 20, 30].map((t) => at(foulAction('home', ARJUN), t, 5)));
    assert.equal(inBonus(fiba, 'away', 40), false, 'FIBA / old formats: the quota is the format\'s');
  });
  test('without the key the bonus reads exactly as before (old NBA matches replay the same)', () => {
    let s = startBB();
    s = run(s, at(foulAction('home', ARJUN), LATE), at(foulAction('home', BEN), LATE + 10));
    assert.equal(inBonus(s, 'away', LATE + 20), false);
  });
  test('commentary: the late foul in the penalty reads "free throws"', () => {
    let s = startBB({ nbaBonus: true });
    s = run(s, at(foulAction('home', ARJUN), 60), at(foulAction('home', BEN), LATE), at(foulAction('home', ARJUN), LATE + 10));
    const rows = basketballFeed(s, { home: 'Reds', away: 'Blues' }, SQUADS).flatMap((g) => g.rows);
    assert.match(rows[0].text, /team foul 3, free throws/);
    assert.doesNotMatch(rows[1].text, /free throws/);
  });
});

describe('basketball · jump ball and the possession arrow (BK16, BK17)', () => {
  test('the FIBA family carries the arrow; NBA and 3×3 do not', () => {
    assert.equal(presetSet(BASKETBALL_META, 'fiba').possArrow, true);
    assert.equal(presetSet(BASKETBALL_META, 'nba').possArrow, false);
    assert.equal(presetSet(BASKETBALL_META, '3x3').possArrow, false);
    assert.equal('possArrow' in bbInit({}), false);
  });
  test('opening tip won by home → the arrow points to away; a held ball gives away the ball and flips it', () => {
    let s = startBB({ possArrow: true });
    assert.equal(arrowSide(s), null);
    s = run(s, at(jumpBallAction('home'), 1));
    assert.equal(arrowSide(s), 'away');
    s = run(s, at(jumpBallAction('home', true), 100)); // a hostile side: the arrow decides
    assert.equal(last(s).side, 'away');
    assert.equal(last(s).ap, true);
    assert.equal(arrowSide(s), 'home');
    // every later period starts with the arrow (and flips it)
    s = quarter(s, 2);
    assert.equal(arrowSide(s), 'away');
    s = run(s, at(jumpBallAction('away', true), 30, 2));
    assert.equal(last(s).side, 'away');
    assert.equal(arrowSide(s), 'home');
  });
  test('hostile: a second opening tip under the arrow, a non-side, a finished game — ignored', () => {
    let s = run(startBB({ possArrow: true }), at(jumpBallAction('home'), 1));
    const n = s.events.length;
    s = run(s, at(jumpBallAction('away'), 50));
    assert.equal(s.events.length, n, 'a 2nd tip is ignored under the arrow');
    s = run(s, { type: 'JUMP_BALL', side: 'nobody' as never, payload: { held: 'yes' } });
    assert.equal(s.events.length, n);
    const done = run(s, { type: 'END', payload: { at: 2 } }, at(jumpBallAction('home', true), 60));
    assert.equal(done.events.length, n);
  });
  test('no arrow (NBA): a held ball is a jump ball the scorer gives to the winner', () => {
    let s = run(startBB(), at(jumpBallAction('away'), 1), at(jumpBallAction('home', true), 90));
    assert.equal(last(s).side, 'home');
    assert.equal(last(s).ap, undefined);
    assert.equal(arrowSide(s), null);
    const rows = basketballFeed(s, { home: 'Reds', away: 'Blues' }, SQUADS).flatMap((g) => g.rows);
    assert.match(rows[0].text, /Held ball — jump ball won by Reds/);
    assert.match(rows[1].text, /Jump ball — Blues win the tip/);
  });
  test('chain: commentary, a Stats row, nobody credited, the score untouched', () => {
    let s = run(startBB({ possArrow: true }), at(jumpBallAction('home'), 1), at(jumpBallAction('home', true), 80));
    assert.match(describePlay(s, last(s), 'Blues', {}, SQUADS), /Held ball — Blues' ball \(alternating possession\)/);
    const rows = basketballPanel(s).categories.flatMap((c) => c.rows);
    const jr = rows.find((r) => r.key === 'jump');
    assert.ok(jr, 'jump balls row');
    assert.deepEqual([jr!.home, jr!.away], ['1', '1']);
    assert.deepEqual([s.home, s.away], [0, 0]);
    assert.deepEqual(basketballStatTotals(s), basketballStatTotals(startBB()));
    assert.equal(basketballPanel(startBB()).categories.flatMap((c) => c.rows).some((r) => r.key === 'jump'), false, 'never a false row');
  });
});

describe('basketball · coach and bench technicals (BK18, BK19)', () => {
  test('a coach technical: 1 free throw, not a team foul, counted for the coach', () => {
    let s = startBB({ techIsTeamFoul: true });
    const a = foulAction('home', null, 'technical', { bench: 'C' });
    assert.equal(a.payload?.bench, 'C');
    s = run(s, at(a, 10));
    assert.equal(last(s).bench, 'C');
    assert.equal(countsAsTeamFoul(s, last(s)), false);
    assert.equal(teamFoulsThisQuarter(s, 'home'), 0);
    assert.equal(freeThrowsFor(s, 'home', 'technical'), 1);
    assert.deepEqual(coachTechnicals(s, 'home'), { c: 1, b: 0 });
    assert.equal(coachDisqualified(s, 'home'), undefined);
    assert.match(describePlay(s, last(s), 'Reds', {}, SQUADS), /^Coach technical \(C\) — Reds/);
  });
  test('2 C, or 3 with a B, disqualify the head coach (FIBA Art. 36.3.3)', () => {
    let s = run(startBB(), at(foulAction('home', null, 'technical', { bench: 'C' }), 10), at(foulAction('home', null, 'technical', { bench: 'C' }), 20));
    assert.equal(coachDisqualified(s, 'home'), '2C');
    assert.match(describePlay(s, last(s), 'Reds', {}, SQUADS), /coach disqualified/);
    let b = startBB();
    for (const [i, k] of (['B', 'B', 'C'] as const).entries()) b = run(b, at(foulAction('away', null, 'technical', { bench: k }), 10 + i));
    assert.equal(coachDisqualified(b, 'away'), '3B');
    const two = run(startBB(), at(foulAction('away', null, 'technical', { bench: 'B' }), 10), at(foulAction('away', null, 'technical', { bench: 'B' }), 11));
    assert.equal(coachDisqualified(two, 'away'), undefined);
  });
  test('Stats: a coach / bench technicals row; not in the personal-foul total', () => {
    const s = run(startBB(), at(foulAction('home', null, 'technical', { bench: 'B' }), 10), at(foulAction('home', ARJUN, 'personal'), 20));
    const f = bbTeamFigures(s, 'home');
    assert.equal(f.benchTech, 1);
    assert.equal(f.pf, 1);
    const row = basketballPanel(s).categories.flatMap((c) => c.rows).find((r) => r.key === 'benchTech');
    assert.ok(row);
    assert.equal(row!.home, '1');
  });
  test('hostile bench values are ignored; an old team technical keeps counting as a team foul', () => {
    let s = startBB({ techIsTeamFoul: true });
    s = run(s, at({ type: 'FOUL', side: 'home', payload: { foulType: 'technical', bench: 'X' } }, 10));
    assert.equal(last(s).bench, undefined);
    assert.equal(teamFoulsThisQuarter(s, 'home'), 1, 'old team technical: a team foul as before');
    s = run(s, at({ type: 'FOUL', side: 'home', payload: { foulType: 'personal', bench: 'C' } }, 11));
    assert.equal(last(s).bench, undefined, 'only a technical');
    s = run(s, at({ ...foulAction('home', ARJUN, 'technical'), payload: { ...foulAction('home', ARJUN, 'technical').payload, bench: 'C' } }, 12));
    assert.equal(last(s).bench, undefined, 'never with a player');
  });
  test('UI: coach / bench chips in the team-foul panel, the arrow and jump-ball buttons', () => {
    const ui = src('src/sports/basketball/index.tsx');
    assert.match(ui, /recordFoul\(flow\.side, null, 'technical', null, 'C'\)/);
    assert.match(ui, /recordFoul\(flow\.side, null, 'technical', null, 'B'\)/);
    assert.match(ui, /jumpBallAction\(/);
    assert.match(ui, /arrowSide\(/);
  });
});

/* --------------------------------- baseball --------------------------------- */

const ORDER = (p: string, n = 9) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}`, pos: ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'][i] }));
function startBS(config?: Record<string, unknown>): BaseballState {
  let s = bsInit(config);
  s = bsReducer(s, { type: 'LINEUP', payload: { team: 'home', order: ORDER('h', readConfig(config).lineupSize), pitcher: { id: 'hp' } } });
  s = bsReducer(s, { type: 'LINEUP', payload: { team: 'away', order: ORDER('a', readConfig(config).lineupSize), pitcher: { id: 'ap' } } });
  return s;
}
const go = (s: BaseballState, a: ScoreAction) => bsReducer(s, a);
const feedText = (s: BaseballState) => baseballCommentary(s, { home: 'Hawks', away: 'Owls' }).flatMap((g) => g.lines ?? (g as unknown as { rows: { text: string }[] }).rows).map((l) => l.text).join(' | ');

describe('baseball · pitch types need pitch-by-pitch (BS14)', () => {
  test('hidden in the format and the live card while pitch-by-pitch is off', () => {
    const f = BS_TRACK.find((x) => x.key === 'pitchTypes')!;
    assert.equal(isHidden(f, { pitches: false }), true);
    assert.equal(isHidden(f, { pitches: true }), false);
    const lf = BASEBALL_LIVE_SETTINGS.fields.find((x) => x.key === 'pitchTypes')!;
    assert.equal(isHidden(lf, { pitches: false }), true);
    const mf = BASEBALL_META.formatFields!.find((x) => x.key === 'pitchTypes')!;
    assert.equal(isHidden(mf, { pitches: false }), true);
  });
});

describe('baseball · dropped third strike (BS15, BS18)', () => {
  test('K + wild pitch: the batter reaches 1st, the pitcher keeps the K and is charged the WP', () => {
    let s = startBS();
    s = go(s, bsPlay(s, 'K', { d3: 'WP' }));
    const e = s.events.at(-1)!;
    assert.equal(e.d3, 'WP');
    assert.equal(s.g.outs, 0);
    assert.ok(s.g.bases[0], 'batter on 1st');
    const t = baseballTotals(s);
    assert.equal(t.a1.stats.strikeouts, 1);
    assert.equal(t.a1.stats.atBats, 1);
    assert.equal(t.hp.stats.kPitched, 1);
    assert.equal(t.hp.stats.wildPitches, 1);
    assert.equal(t.hp.stats.outsPitched ?? 0, 0);
    assert.match(feedText(s), /strikes out .*reaches first on a wild pitch/);
  });
  test('K + passed ball: the catcher; K + error: a team error and the runner unearned', () => {
    let s = startBS();
    s = go(s, bsPlay(s, 'K', { d3: 'PB' }));
    assert.equal(baseballTotals(s).h2.stats.passedBalls, 1);
    let e = startBS();
    e = go(e, bsPlay(e, 'K', { d3: 'E' }));
    assert.equal(e.g.errors.home, 1);
    e = go(e, bsPlay(e, 'HR'));
    const runs = e.g.runs;
    assert.equal(runs.length, 2);
    assert.equal(runs.filter((r) => !r.earned).length, 1, 'the runner who reached on the error is unearned');
  });
  test('hostile: d3 on a hit, an unknown d3, d3 with the batter out — dropped', () => {
    let s = startBS();
    const h = bsPlay(s, '1B');
    s = go(s, { ...h, payload: { ...h.payload, d3: 'WP' } });
    assert.equal(s.events.at(-1)!.d3, undefined);
    const k = bsPlay(s, 'K', { d3: 'WP' });
    const bad = go(s, { ...k, payload: { ...k.payload, d3: 'ZZ' } });
    assert.equal(bad.events.at(-1)!.d3, undefined);
    const k2 = bsPlay(s, 'K');
    const out = go(s, { ...k2, payload: { ...k2.payload, d3: 'WP' } });
    assert.equal(out.events.at(-1)!.d3, undefined, 'batter out: no d3');
  });
});

describe('baseball · catcher\'s interference and triple play (BS16, BS17, BS19)', () => {
  test('CI: batter to 1st, E2, a PA but no AB, unearned', () => {
    assert.ok(OUTCOME_LABEL.CI);
    let s = startBS();
    s = go(s, bsPlay(s, 'CI'));
    const e = s.events.at(-1)!;
    assert.equal(e.outcome, 'CI');
    assert.equal(e.fielders, 'E2');
    assert.ok(s.g.bases[0]);
    assert.equal(s.g.errors.home, 1);
    const t = baseballTotals(s);
    assert.equal(t.a1.stats.plateAppearances, 1);
    assert.equal(t.a1.stats.atBats ?? 0, 0);
    assert.equal(t.h2.stats.fieldErrors, 1, 'the catcher');
    s = go(s, bsPlay(s, 'HR'));
    assert.equal(s.g.runs.filter((r) => !r.earned).length, 1);
    assert.match(feedText(s), /catcher's interference/i);
  });
  test('TP: three outs on one play; the half ends; the batter is not credited a GIDP', () => {
    let s = startBS();
    s = go(s, bsPlay(s, '1B'));
    s = go(s, bsPlay(s, '1B'));
    assert.ok(s.g.bases[0] && s.g.bases[1]);
    s = go(s, bsPlay(s, 'TP'));
    const e = s.events.at(-1)!;
    assert.equal(e.outcome, 'TP');
    assert.equal(e.outs, 3);
    assert.equal(s.g.half, 1, 'the half is over');
    const t = baseballTotals(s);
    assert.equal(t.a3.stats.atBats, 1);
    assert.equal(t.a3.stats.gidp ?? 0, 0);
    assert.equal(t.hp.stats.outsPitched, 3);
    assert.match(feedText(s), /triple play/i);
  });
  test('UI: the buttons exist', () => {
    const ui = src('src/sports/baseball/index.tsx');
    assert.match(ui, /'TP'/);
    assert.match(ui, /'CI'/);
    assert.match(ui, /d3:/);
  });
});

/* ------------------------------ American football ------------------------------ */

const afStart = (cfg: Record<string, unknown> = { preset: 'nfl', mode: 'pbp' }): AFState => {
  let s = afInit(cfg);
  s = afReducer(s, { type: 'SET_DRIVE', payload: { off: 'home', spot: 25, down: 1, toGo: 10 } });
  return s;
};
const lines = (s: AFState) => afCommentary(s, { home: 'Lions', away: 'Bears' }, (id, legacy) => legacy ?? (id ? `P-${id}` : 'Player')).flatMap((g) => g.lines).map((l) => l.text).join(' | ');
function liveSum(as: ScoreAction[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const a of as) for (const x of [a.attribution, a.attribution2]) {
    if (!x) continue;
    const l = (out[x.playerId] ??= {});
    l[x.stat] = (l[x.stat] ?? 0) + (x.by ?? 1);
    for (const [k, v] of Object.entries(x.extra ?? {})) l[k] = (l[k] ?? 0) + (v as number);
  }
  return out;
}

describe('American football · flag school reads Standard (AF7)', () => {
  test('a standard flag-school game (2 × 15, 1 timeout) shows Standard', () => {
    const fs = afInit({ preset: 'flagSchool' });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(fs), fs), 0);
    const flag = afInit({ preset: 'flag' });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(flag), flag), 0);
  });
});

describe('American football · returns (AF8)', () => {
  test('kickoff: the returner and the return yards', () => {
    let s = afInit({ preset: 'nfl', mode: 'pbp' });
    const a = afPlay(s, 'away', { play: 'kickoff', newSpot: 32, ret: 27, p1: { id: 'a20' } });
    s = afReducer(s, a);
    assert.deepEqual(s.drive && [s.drive.off, s.drive.spot], ['away', 32]);
    const t = afTotals(s);
    assert.deepEqual([t.a20.stats.kickRet, t.a20.stats.kickRetYds], [1, 27]);
    assert.deepEqual(liveSum([a]).a20, { kickRet: 1, kickRetYds: 27 });
    assert.match(lines(s), /returned 27 yds by/);
  });
  test('punt: the returner (the other side) and the return yards', () => {
    let s = afStart();
    const a = afPlay(s, 'home', { play: 'punt', yards: 45, p1: { id: 'h9' }, p2: { id: 'a21' }, ret: 8 });
    s = afReducer(s, a);
    const t = afTotals(s);
    assert.equal(t.a21.side, 'away');
    assert.deepEqual([t.a21.stats.puntRet, t.a21.stats.puntRetYds], [1, 8]);
    assert.equal(a.attribution2?.side, 'away');
  });
  test('interception: return yards to the defender', () => {
    let s = afStart();
    const a = afPlay(s, 'home', { play: 'int', p1: { id: 'h1' }, p2: { id: 'a24' }, newSpot: 40, ret: 15 });
    s = afReducer(s, a);
    assert.equal(afTotals(s).a24.stats.intRetYds, 15);
  });
  test('hostile return yards: non-numbers ignored, huge values clamped; old plays carry no return keys', () => {
    let s = afInit({ preset: 'nfl', mode: 'pbp' });
    s = afReducer(s, { type: 'PLAY', side: 'away', payload: { play: 'kickoff', newSpot: 25, ret: 'lots' }, attribution: { playerId: 'a20', stat: 'kickRet', by: 1 } });
    assert.equal(s.events.at(-1)!.ret, undefined);
    s = afReducer(afInit({ preset: 'nfl', mode: 'pbp' }), { type: 'PLAY', side: 'away', payload: { play: 'kickoff', newSpot: 25, ret: 9999 } });
    assert.ok((s.events.at(-1)!.ret ?? 0) <= 110);
    const old = afReducer(afStart(), { type: 'PLAY', side: 'home', payload: { play: 'punt', yards: 40, ret: 5 } });
    assert.equal('kickRet' in (afTotals(old).h9?.stats ?? {}), false);
    assert.equal(STAT_SCHEMAS.american_football!.stats.some((d) => d.key === 'kickRetYds'), true);
  });
});

describe('American football · fumbles, blocked kicks, onside (AF9, AF10, AF11)', () => {
  test('fumble kept by the offence: no turnover, the drive goes on, fumbler and recoverer credited', () => {
    let s = afStart();
    const a = afPlay(s, 'home', { play: 'fumble', kept: true, yards: 3, p1: { id: 'h4' }, p2: { id: 'h5' } });
    s = afReducer(s, a);
    assert.equal(s.drive?.off, 'home');
    assert.equal(s.drive?.down, 2);
    assert.equal(s.drive?.spot, 28);
    const f = teamFigures(s, 'home');
    assert.equal(f.turnovers, 0);
    assert.equal(f.fumblesLost, 0);
    const t = afTotals(s);
    assert.equal(t.h4.stats.fumKept, 1);
    assert.equal(t.h5.stats.fumRec, 1);
    assert.equal(t.h5.side, 'home');
    assert.match(lines(s), /recovered by .*\(Lions keep it\)/);
  });
  test('forced fumble: an optional credit joined to the fumble line', () => {
    let s = afStart();
    s = afReducer(s, afPlay(s, 'home', { play: 'fumble', p1: { id: 'h4' }, p2: { id: 'a5' }, newSpot: 60 }));
    s = afReducer(s, { type: 'FORCED_FUMBLE', side: 'away', attribution: { playerId: 'a9', stat: 'forcedFum', playerName: 'Ray' } });
    assert.equal(afTotals(s).a9.stats.forcedFum, 1);
    assert.match(lines(s), /Forced by Ray\./);
  });
  test('blocked punt and blocked field goal credit the blocker', () => {
    let s = afStart();
    const a = afPlay(s, 'home', { play: 'punt', blocked: true, p1: { id: 'h9' }, p2: { id: 'a50' }, newSpot: 70 });
    s = afReducer(s, a);
    assert.equal(s.drive?.off, 'away');
    assert.equal(s.drive?.spot, 70);
    assert.equal(afTotals(s).a50.stats.kicksBlocked, 1);
    assert.equal(afTotals(s).h9.stats.punts, 1);
    assert.match(lines(s), /blocked by/);
    let g = afStart();
    g = afReducer(g, { type: 'FG', side: 'home', payload: { good: false, blocked: true, yards: 40 }, attribution: { playerId: 'h3', stat: 'fgAtt', by: 1 }, attribution2: { playerId: 'a51', stat: 'kicksBlocked', by: 1 } });
    assert.equal(g.events.at(-1)!.blocked, true);
    assert.equal(afTotals(g).a51.stats.kicksBlocked, 1);
    assert.equal(afTotals(g).a51.side, 'away');
    // a made field goal can't be "blocked"
    const made = afReducer(afStart(), { type: 'FG', side: 'home', payload: { good: true, blocked: true } });
    assert.equal(made.events.at(-1)!.blocked, undefined);
  });
  test('onside kick recovered by the kicking team: their ball', () => {
    let s = afInit({ preset: 'nfl', mode: 'pbp' });
    s = afReducer(s, afPlay(s, 'away', { play: 'kickoff', onside: true, kept: true, newSpot: 55 }));
    assert.deepEqual(s.drive && [s.drive.off, s.drive.spot], ['home', 55]);
    assert.match(lines(s), /Onside kick — recovered by Lions/);
    const kept = afReducer(afStart(), { type: 'PLAY', side: 'home', payload: { play: 'run', yards: 4, kept: true, onside: true } });
    assert.equal(kept.events.at(-1)!.kept, undefined);
    assert.equal(kept.events.at(-1)!.onside, undefined);
  });
});

describe('American football · penalty on a play (AF12, AF13)', () => {
  test('accepted, previous spot: a 15-yard run wiped out by offensive holding — no rushing yards', () => {
    let s = afStart();
    const a = afPlay(s, 'home', { play: 'run', yards: 15, p1: { id: 'h2' }, pen: { foul: 'Holding (offence)', on: 'home', yards: 10, enf: 'prev', by: { id: 'h70' } } });
    assert.equal(a.attribution, undefined, 'a nullified play credits nobody');
    s = afReducer(s, a);
    assert.deepEqual(s.drive && [s.drive.spot, s.drive.down], [15, 1]);
    const f = teamFigures(s, 'home');
    assert.deepEqual([f.rushYds, f.rushAtt, f.penalties, f.penaltyYds], [0, 0, 1, 10]);
    assert.equal(afTotals(s).h2?.stats.rushYds ?? 0, 0);
    assert.match(lines(s), /Holding \(offence\).*play nullified/);
  });
  test('declined: the play stands, nothing enforced, not a team penalty', () => {
    let s = afStart();
    s = afReducer(s, afPlay(s, 'home', { play: 'pass', yards: 12, p1: { id: 'h1' }, p2: { id: 'h8' }, pen: { foul: 'Offside', on: 'away', yards: 5, enf: 'dec' } }));
    assert.equal(s.drive?.spot, 37);
    assert.equal(teamFigures(s, 'away').penalties, 0);
    assert.equal(afTotals(s).h8.stats.recYds, 12);
    assert.match(lines(s), /declined/);
  });
  test('offsetting: the down is replayed, the play wiped out', () => {
    let s = afStart();
    s = afReducer(s, afPlay(s, 'home', { play: 'run', yards: 6, p1: { id: 'h2' }, pen: { foul: 'Offsetting fouls', on: 'home', yards: 0, enf: 'off' } }));
    assert.deepEqual(s.drive && [s.drive.spot, s.drive.down], [25, 1]);
    assert.equal(teamFigures(s, 'home').rushYds, 0);
    assert.match(lines(s), /offsetting/);
  });
  test('enforced at the end: a 12-yard catch + 15 yards (personal foul on the defence), the catch stands', () => {
    let s = afStart();
    s = afReducer(s, afPlay(s, 'home', { play: 'pass', yards: 12, p1: { id: 'h1' }, p2: { id: 'h8' }, pen: { foul: 'Personal foul (defence)', on: 'away', yards: 15, enf: 'end', autoFirst: true } }));
    assert.equal(s.drive?.spot, 52);
    assert.equal(s.drive?.down, 1);
    assert.equal(afTotals(s).h8.stats.recYds, 12);
    assert.deepEqual([teamFigures(s, 'away').penalties, teamFigures(s, 'away').penaltyYds], [1, 15]);
  });
  test('hostile pen payloads are ignored (the play reads as a plain play)', () => {
    for (const pen of [{ enf: 'zap', on: 'home', yards: 5, foul: 'x' }, { enf: 'prev', on: 'nobody', yards: 5, foul: 'x' }, 'str', 5, { enf: 'prev', on: 'home', yards: 'ten', foul: 'x' }]) {
      const s = afReducer(afStart(), { type: 'PLAY', side: 'home', payload: { play: 'run', yards: 4, pen } });
      assert.equal(s.events.at(-1)!.pen, undefined, JSON.stringify(pen));
      assert.equal(s.drive?.spot, 29);
    }
    const long = afReducer(afStart(), { type: 'PLAY', side: 'home', payload: { play: 'run', yards: 4, pen: { enf: 'dec', on: 'away', yards: 5, foul: 'y'.repeat(500) } } });
    assert.ok((long.events.at(-1)!.pen?.foul.length ?? 0) <= 60);
    // a nullified play's credits are none even if the action carries some (statTotals is the log's)
    const forged = afReducer(afStart(), { type: 'PLAY', side: 'home', payload: { play: 'run', yards: 40, pen: { enf: 'prev', on: 'home', yards: 10, foul: 'Holding' } }, attribution: { playerId: 'h2', stat: 'rushYds', by: 40 } });
    assert.equal(afTotals(forged).h2?.stats.rushYds ?? 0, 0);
    assert.deepEqual(afCredits(forged.events.at(-1)!), {});
  });
  test('UI: penalty-on-a-play, returner, blocked, onside, fumble kept and forced fumble taps exist', () => {
    const ui = src('src/sports/american_football/index.tsx');
    for (const re of [/pen:/, /retBy|returner/i, /blocked: true/, /onside: true/, /kept: true/, /FORCED_FUMBLE/]) assert.match(ui, re);
  });
  test('Stats tab: returns / blocked kicks rows once recorded', () => {
    let s = afStart();
    s = afReducer(s, afPlay(s, 'home', { play: 'punt', yards: 45, p1: { id: 'h9' }, p2: { id: 'a21' }, ret: 8 }));
    const rows = afSheet(s).sections.flatMap((x) => x.rows).map((r) => r.key);
    assert.ok(rows.includes('kicksBlocked') === false);
    let b = afStart();
    b = afReducer(b, afPlay(b, 'home', { play: 'punt', blocked: true, p1: { id: 'h9' }, p2: { id: 'a50' }, newSpot: 70 }));
    assert.ok(afSheet(b).sections.flatMap((x) => x.rows).some((r) => r.key === 'kicksBlocked'));
  });
});
