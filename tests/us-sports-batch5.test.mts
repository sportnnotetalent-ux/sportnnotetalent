/**
 * US sports batch 5 (docs/security/breaks/us-sports-batch5.md):
 *  - basketball: team rebound / team turnover (24 s …), turnover types,
 *    steal → the other side's turnover, block → the shooter's missed shot
 *    (the second player optional), the team-rebounds row, "and the ball"
 *    after a U / D / flagrant foul, NBA offensive fouls not team fouls;
 *  - baseball: WP / PB / balks / pick-offs / intentional walks reach a stat
 *    line; fielders noted AFTER the play (non-blocking), on for new matches;
 *  - American football: tackles / breakups in the commentary, Kneel, tackle
 *    presets play by play, Scores-only hides the stats toggles, "Standard"
 *    follows the ruleset.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bbInit, reducer as bbReducer, teamFoulsThisQuarter, ballAfterFoul, type BasketballState } from '../src/sports/basketball/engine.ts';
import {
  blockAction, foulAction, lineupAction, missAction, removeAction, scoreAction, statAction, stealAction, teamReboundAction, turnoverAction,
} from '../src/sports/basketball/actions.ts';
import { eventCredits as bbCredits } from '../src/sports/basketball/credits.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbTeamFigures, pairedPlays, possessionTags } from '../src/sports/basketball/deep.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballFeed, describePlay } from '../src/sports/basketball/commentary.ts';
import { TO_TYPES } from '../src/sports/basketball/events.ts';
import { BASKETBALL_META } from '../src/sports/basketball/meta.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import {
  init as bsInit, reducer as bsReducer, buildPlay as bsPlay, buildRunner, readConfig, BASEBALL_LIVE_SETTINGS, fieldersAction,
  type BaseballState,
} from '../src/sports/baseball/engine.ts';
import { baseballTotals, DERIVED_KEYS } from '../src/sports/baseball/totals.ts';
import { teamSplit } from '../src/sports/baseball/situational.ts';
import { baseballSheet } from '../src/sports/baseball/sheet.ts';
import { BASEBALL_META } from '../src/sports/baseball/meta.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { init as afInit, reducer as afReducer, buildPlay as afPlay, AF_LIVE_SETTINGS, type AFState } from '../src/sports/american_football/engine.ts';
import { AMERICAN_FOOTBALL_META, AF_PRESETS } from '../src/sports/american_football/meta.ts';
import { afCommentary } from '../src/sports/american_football/commentary.ts';
import { customCount } from '../src/sports/liveSettings.ts';
import { isHidden } from '../src/sports/formatPick.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* -------------------------------- basketball -------------------------------- */

type Side = 'home' | 'away';
const P = (id: string, fullName: string): Player => ({ id, fullName, sports: [] } as Player);
const ARJUN = P('p-arjun', 'Arjun'), BEN = P('p-ben', 'Ben'), XAVI = P('p-xavi', 'Xavi'), YUSUF = P('p-yusuf', 'Yusuf');
const SQUADS = withRosters(undefined, [ARJUN, BEN], [XAVI, YUSUF]);
let clock = 0;
const at = (a: ScoreAction, sec = ++clock): ScoreAction => ({ ...a, payload: { ...a.payload, quarter: 1, minute: Math.floor(sec / 60), sec, v: 2 } });
const run = (s: BasketballState, ...as: ScoreAction[]) => as.reduce(bbReducer, s);
const startBB = (cfg: Record<string, unknown> = {}) =>
  run(bbInit({ periodMinutes: 10, regPeriods: 4, trackMisses: true, ...cfg }), lineupAction('home', [ARJUN, BEN]), lineupAction('away', [XAVI, YUSUF]), { type: 'KICKOFF', payload: { at: 1 } });
const last = (s: BasketballState) => s.events.at(-1)!;
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

describe('basketball · team rebound and team turnover (BK1, BK2, BK6)', () => {
  test('BK1: a team rebound credits nobody and counts in the team REB and the team-rebounds row', () => {
    const a = teamReboundAction('home', 'def');
    assert.equal(a.attribution, undefined);
    assert.equal(a.payload?.team, true);
    const s = run(startBB(), at(missAction('away', 2, XAVI)), at(a));
    const e = last(s);
    assert.equal(e.type, 'rebound');
    assert.equal(e.team, true);
    assert.equal(e.pid, undefined);
    assert.equal(e.reboundType, 'def');
    const f = bbTeamFigures(s, 'home');
    assert.deepEqual([f.reb, f.dreb, f.teamReb], [1, 1, 1]);
    assert.equal(basketballStatTotals(s)['p-arjun']?.stats.rebounds ?? 0, 0, 'no player credited');
    const rows = basketballPanel(s).categories.flatMap((c) => c.rows);
    const tr = rows.find((r) => r.key === 'teamReb');
    assert.ok(tr, 'team-rebounds row');
    assert.deepEqual([tr!.home, tr!.away], ['1', '0']);
    assert.match(describePlay(s, e, 'Reds', {}, SQUADS), /^Defensive team rebound — Reds$/);
  });
  test('BK6: no team-rebounds row on a match without one (never a false row)', () => {
    const s = run(startBB(), at(missAction('away', 2, XAVI)));
    assert.equal(basketballPanel(s).categories.flatMap((c) => c.rows).some((r) => r.key === 'teamReb'), false);
  });
  test('BK2: a team turnover (24-second violation) counts in the team TO, credits nobody', () => {
    const a = turnoverAction('away', null, { toType: '24s' });
    assert.equal(a.attribution, undefined);
    const s = run(startBB(), at(a));
    const e = last(s);
    assert.deepEqual([e.type, e.team, e.toType, e.pid], ['turnover', true, '24s', undefined]);
    assert.equal(bbTeamFigures(s, 'away').tov, 1);
    assert.equal(describePlay(s, e, 'Blues', {}, SQUADS), 'Shot-clock violation — Blues');
    const box = basketballBox(s).data('all');
    assert.equal(box.away.team?.stats.turnovers, 1, 'box Team row');
  });
  test('BK3: a player turnover carries an optional type; commentary says it', () => {
    const s = run(startBB(), at(turnoverAction('home', ARJUN, { toType: 'travel' })));
    const e = last(s);
    assert.deepEqual([e.toType, e.pid, e.team], ['travel', 'p-arjun', undefined]);
    assert.equal(describePlay(s, e, 'Reds', {}, SQUADS), 'Turnover — Arjun (travelling)');
    assert.deepEqual(bbCredits(e, false), { turnovers: 1 });
    assert.ok(TO_TYPES.includes('badPass') && TO_TYPES.includes('24s'));
  });
});

describe('basketball · steal → turnover, block → missed shot (BK4, BK5, BK11, BK12, BK14)', () => {
  test('BK4: a new steal is the other side\'s turnover (team), exactly one', () => {
    const s = run(startBB(), at(stealAction('home', ARJUN)));
    assert.equal(last(s).pair, true);
    assert.equal(bbTeamFigures(s, 'away').tov, 1);
    assert.equal(bbTeamFigures(s, 'home').stl, 1);
    assert.deepEqual(pairedPlays(s).map((x) => [x.side, x.kind]), [['away', 'tov']]);
    assert.equal(basketballBox(s).data('all').away.team?.stats.turnovers, 1, 'box Team row');
  });
  test('BK4: naming the ball-handler moves the turnover to the player — still one', () => {
    let s = run(startBB(), at(stealAction('home', ARJUN)));
    const steal = last(s);
    const to = turnoverAction('away', XAVI, { ref: steal.id });
    s = run(s, at(to));
    assert.equal(last(s).ref, steal.id);
    assert.equal(bbTeamFigures(s, 'away').tov, 1);
    assert.equal(pairedPlays(s).length, 0);
    assert.equal(basketballStatTotals(s)['p-xavi'].stats.turnovers, 1);
    const box = basketballBox(s).data('all').away;
    assert.equal(box.team?.stats.turnovers, 0);
    // the feed reads one line: the steal from the ball-handler
    const rows = basketballFeed(s, { home: 'Reds', away: 'Blues' }, SQUADS).flatMap((g) => g.rows);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].text, 'Arjun steals the ball from Xavi');
  });
  test('BK4: an unlinked steal reads "· turnover" in the feed', () => {
    const s = run(startBB(), at(stealAction('home', ARJUN)));
    assert.equal(describePlay(s, last(s), 'Reds', { opp: 'Blues' }, SQUADS), 'Arjun steals the ball · Blues turnover');
  });
  test('BK5: a new block is the other side\'s missed shot; naming the shooter keeps it one', () => {
    let s = run(startBB(), at(blockAction('home', BEN)));
    const blk = last(s);
    assert.equal(blk.pair, true);
    let f = bbTeamFigures(s, 'away');
    assert.deepEqual([f.fga, f.fgx], [1, 1]);
    s = run(s, at(missAction('away', 3, YUSUF, undefined, blk.id)));
    f = bbTeamFigures(s, 'away');
    assert.deepEqual([f.fga, f.fgx, f.tpa], [1, 1, 1]);
    const t = basketballStatTotals(s)['p-yusuf'].stats;
    assert.deepEqual([t.fgAtt, t.fgMissed, t.threesAtt], [1, 1, 1]);
    const rows = basketballFeed(s, { home: 'Reds', away: 'Blues' }, SQUADS).flatMap((g) => g.rows);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].text, 'Ben blocks Yusuf\'s 3-pointer');
  });
  test('BK11: removing the steal / block takes the paired figure away; removing the linked play brings the team figure back', () => {
    let s = run(startBB(), at(stealAction('home', ARJUN)));
    const steal = last(s);
    s = run(s, at(turnoverAction('away', XAVI, { ref: steal.id })));
    const linked = last(s);
    const noLinked = run(s, removeAction(linked, linked.pid, { halfCourt: false, tracked: true }));
    assert.equal(bbTeamFigures(noLinked, 'away').tov, 1, 'the steal still makes a team TO');
    const noSteal = run(noLinked, removeAction(steal, steal.pid, { halfCourt: false, tracked: true }));
    assert.equal(bbTeamFigures(noSteal, 'away').tov, 0);
    const b = run(startBB(), at(blockAction('home', BEN)));
    const gone = run(b, removeAction(last(b), 'p-ben', { halfCourt: false, tracked: true }));
    assert.equal(bbTeamFigures(gone, 'away').fga, 0);
  });
  test('BK10: hostile links are dropped (missing / wrong side / already linked / not paired)', () => {
    let s = run(startBB(), at(stealAction('home', ARJUN)));
    const steal = last(s);
    const n = s.events.length;
    for (const bad of [
      turnoverAction('away', XAVI, { ref: 999 }), // missing
      turnoverAction('home', BEN, { ref: steal.id }), // the stealer's own side
      missAction('away', 2, XAVI, undefined, steal.id), // a miss can't link a steal
    ]) assert.equal(run(s, at(bad)).events.length, n, JSON.stringify(bad.payload));
    s = run(s, at(turnoverAction('away', XAVI, { ref: steal.id })));
    assert.equal(run(s, at(turnoverAction('away', YUSUF, { ref: steal.id }))).events.length, s.events.length, 'already linked');
    // an old (unpaired) steal can't be linked: it never made a turnover
    const old = run(startBB(), at(statAction('home', 'STEAL', ARJUN)));
    assert.equal(run(old, at(turnoverAction('away', XAVI, { ref: last(old).id }))).events.length, old.events.length);
    // team with a player: the player wins, no team stamp; unknown type dropped
    const t = run(startBB(), at({ type: 'REBOUND', side: 'home', payload: { pid: 'p-arjun', team: true } }), at({ type: 'TURNOVER', side: 'home', payload: { toType: '<script>' } }));
    assert.equal(t.events[0].team, undefined);
    assert.equal(t.events[1].toType, undefined);
    // pair on a turnover / rebound is ignored
    const p = run(startBB(), at({ type: 'TURNOVER', side: 'home', payload: { pid: 'p-arjun', pair: true } }));
    assert.equal(last(p).pair, undefined);
    assert.equal(bbTeamFigures(p, 'away').tov, 0);
  });
  test('BK12: live credits = statTotals for team and linked plays', () => {
    const acts: ScoreAction[] = [];
    let s = startBB();
    const go = (a: ScoreAction) => { const x = at(a); acts.push(x); s = bbReducer(s, x); };
    go(teamReboundAction('home', 'off')); go(turnoverAction('away', null, { toType: '8s' }));
    go(stealAction('home', ARJUN)); go(turnoverAction('away', XAVI, { ref: last(s).id, toType: 'badPass' }));
    go(blockAction('away', XAVI)); go(missAction('home', 2, BEN, 'paint', last(s).id));
    const totals = basketballStatTotals(s);
    const live = liveSum(acts);
    for (const [id, l] of Object.entries(live)) for (const [k, v] of Object.entries(l)) assert.equal(totals[id].stats[k], v, `${id} ${k}`);
  });
  test('BK14: points off turnovers open once after a steal and its linked turnover', () => {
    let s = run(startBB(), at(stealAction('home', ARJUN)));
    s = run(s, at(turnoverAction('away', XAVI, { ref: last(s).id })), at(scoreAction('home', 2, ARJUN)));
    assert.equal(bbTeamFigures(s, 'home').offTo, 2);
    assert.equal([...possessionTags(s).values()].filter((x) => x.offTo).length, 1);
  });
  test('BK13: an old log (unpaired steal / block, no-player rebound) keeps its figures', () => {
    const s = run(startBB(), at(statAction('home', 'STEAL', ARJUN)), at(statAction('home', 'BLOCK', BEN)),
      at({ type: 'REBOUND', side: 'home', payload: {} }), at({ type: 'TURNOVER', side: 'away', payload: {} }));
    assert.equal(s.events[0].pair, undefined);
    const a = bbTeamFigures(s, 'away');
    assert.deepEqual([a.tov, a.fga, a.fgx], [1, 0, 0]);
    const h = bbTeamFigures(s, 'home');
    assert.deepEqual([h.reb, h.teamReb], [1, 0], 'an old no-player rebound is not stamped a team rebound');
    assert.equal(pairedPlays(s).length, 0);
    assert.equal(s.events[2].team, undefined);
  });
});

describe('basketball · fouls (BK7, BK8)', () => {
  test('BK7: U / D / flagrant give the ball back; commentary says so', () => {
    for (const t of ['unsportsmanlike', 'disqualifying', 'flagrant'] as const) assert.equal(ballAfterFoul(t), true, t);
    for (const t of ['personal', 'shooting', 'offensive', 'technical'] as const) assert.equal(ballAfterFoul(t), false, t);
    const s = run(startBB(), at(foulAction('home', ARJUN, 'unsportsmanlike')));
    assert.match(describePlay(s, last(s), 'Reds', {}, SQUADS), /free throws and the ball/);
    assert.match(src('src/sports/basketball/index.tsx'), /ballAfterFoul\(type\)/);
  });
  test('BK8: NBA preset — offensive fouls are not team fouls; old formats count them', () => {
    const nba = BASKETBALL_META.formatFields!.find((f) => f.key === 'preset')!.options!.find((o) => o.value === 'nba')!;
    assert.equal(nba.set!.offTeamFoul, false);
    const fiba = BASKETBALL_META.formatFields!.find((f) => f.key === 'preset')!.options!.find((o) => o.value === 'fiba')!;
    assert.equal(fiba.set!.offTeamFoul, true);
    const nbaS = run(startBB({ offTeamFoul: false }), at(foulAction('home', ARJUN, 'offensive')), at(foulAction('home', BEN, 'personal')));
    assert.equal(teamFoulsThisQuarter(nbaS, 'home'), 1);
    assert.equal(bbTeamFigures(nbaS, 'home').teamFouls, 1);
    const old = run(startBB(), at(foulAction('home', ARJUN, 'offensive')), at(foulAction('home', BEN, 'personal')));
    assert.equal(teamFoulsThisQuarter(old, 'home'), 2);
    assert.equal('offTeamFoul' in old, false, 'an old format keeps its state shape');
  });
});

describe('basketball · the scorer\'s taps (source checks)', () => {
  const ui = src('src/sports/basketball/index.tsx');
  test('Team row: team rebound and the shot-clock violation, one tap each', () => {
    assert.match(ui, /teamReboundAction\(/);
    assert.match(ui, /turnoverAction\(side, null, \{ toType: '24s' \}\)/);
  });
  test('Rebound? prompt after a miss; Who lost it? after a steal; Whose shot? after a block — each with Skip', () => {
    assert.match(ui, /reboundFor/);
    assert.match(ui, /stealFor/);
    assert.match(ui, /blockFor/);
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

describe('baseball · runner plays and intentional walks reach a stat line (BS8, BS12)', () => {
  test('BS8: WP / BK / PO to the pitcher, PB to the catcher, IBB to batter and pitcher', () => {
    let s = startBS();
    s = go(s, bsPlay(s, '1B'));
    s = go(s, buildRunner(s, 'WP'));
    s = go(s, buildRunner(s, 'PB'));
    s = go(s, buildRunner(s, 'BK'));
    s = go(s, bsPlay(s, 'IBB'));
    s = go(s, buildRunner(s, 'PO', undefined));
    const t = baseballTotals(s);
    assert.deepEqual([t.hp.stats.wildPitches, t.hp.stats.balks, t.hp.stats.pickoffs, t.hp.stats.ibbAllowed], [1, 1, 1, 1]);
    assert.equal(t.h2.stats.passedBalls, 1, 'the home catcher (pos C)');
    assert.equal(t.a2.stats.intentionalWalks, 1);
    let z = startBS();
    z = go(z, bsPlay(z, 'GO'));
    const tz = baseballTotals(z);
    assert.deepEqual([tz.hp.stats.wildPitches, tz.hp.stats.balks, tz.hp.stats.pickoffs, tz.hp.stats.ibbAllowed, tz.h2.stats.passedBalls, tz.a1.stats.intentionalWalks], [0, 0, 0, 0, 0, 0], 'a tracked 0');
    const sh = baseballSheet(s).sections.flatMap((x) => x.rows);
    assert.ok(sh.some((r) => r.key === 'ibb'), 'Stats tab: intentional walks');
    assert.ok(sh.some((r) => r.key === 'pickoffs'), 'Stats tab: pick-offs (pitching)');
    assert.equal(teamSplit(s, 'away').ibb, 1);
    assert.equal(teamSplit(s, 'home').pickoffs, 1);
  });
  test('BS12: the new keys are statTotals-owned and declared on the schema', () => {
    const keys = ['wildPitches', 'balks', 'pickoffs', 'passedBalls', 'intentionalWalks', 'ibbAllowed'];
    const sch = STAT_SCHEMAS.baseball!;
    for (const k of keys) {
      assert.ok((DERIVED_KEYS as readonly string[]).includes(k), k);
      assert.ok(sch.stats.some((d) => d.key === k), `schema ${k}`);
    }
  });
});

describe('baseball · fielders after the play (BS9, BS10, BS11)', () => {
  test('BS9: a fielded out is recorded at once; the fielders note lands on it after', () => {
    let s = startBS({ askFielders: true });
    const a = bsPlay(s, 'GO');
    s = go(s, a);
    const id = s.events.at(-1)!.id;
    assert.equal(s.g.outs, 1, 'recorded before any fielder tap');
    s = go(s, fieldersAction(id, '6'));
    s = go(s, fieldersAction(id, '6-3'));
    assert.equal(s.events.at(-1)!.fielders, '6-3');
    assert.equal(s.events.length, 1, 'no new event');
    const t = baseballTotals(s);
    assert.equal(t.h3.stats.putouts, 1);
    assert.equal(t.h6.stats.fieldAssists, 1);
    s = go(s, fieldersAction(id, ''));
    assert.equal(s.events.at(-1)!.fielders, undefined, 'cleared');
    assert.doesNotMatch(src('src/sports/baseball/index.tsx'), /\(askFielders && FIELDED\.includes\(o\)\)/, 'no blocking sheet');
    assert.match(src('src/sports/baseball/index.tsx'), /fieldFor/);
  });
  test('BS10: hostile notes, other plays and unknown ids are ignored; a finished game still takes it', () => {
    let s = startBS({ askFielders: true });
    s = go(s, bsPlay(s, '1B'));
    const hit = s.events.at(-1)!.id;
    const before = JSON.stringify(s.events);
    assert.equal(JSON.stringify(go(s, fieldersAction(hit, '6-3')).events), before, 'a hit takes no note');
    const k = go(s, bsPlay(s, 'FO'));
    const fo = k.events.at(-1)!.id;
    assert.equal(JSON.stringify(go(k, fieldersAction('nope', '8')).events), JSON.stringify(k.events), 'unknown id');
    for (const f of ['<script>', 'x'.repeat(40), '6-3-4-5-6-3-4-5-6', 7, null, 'E5; drop', 'abc']) {
      assert.equal(go(k, { type: 'FIELDERS', payload: { ref: fo, fielders: f } }).events.at(-1)!.fielders, undefined, String(f));
    }
    assert.equal(go(k, fieldersAction(fo, 'F8')).events.at(-1)!.fielders, 'F8');
    // the last out of the game: FIELDERS still applies
    let g = startBS({ innings: 1, askFielders: true });
    g = go(g, bsPlay(g, 'HR'));
    for (let i = 0; i < 6; i++) g = go(g, bsPlay(g, 'GO'));
    assert.equal(g.g.ended, true);
    const lastOut = g.events.at(-1)!.id;
    g = go(g, fieldersAction(lastOut, '4-3'));
    assert.equal(g.events.at(-1)!.fielders, '4-3');
  });
  test('BS11: Ask for fielders is on for a new match only', () => {
    const f = BASEBALL_META.formatFields!.find((x) => x.key === 'askFielders')!;
    assert.equal(f.default, true);
    assert.equal(BASEBALL_LIVE_SETTINGS.defaults?.askFielders, true);
    assert.equal(bsInit({ innings: 9 }).cfg.askFielders, false, 'an old format without the key reads off');
    assert.equal(bsInit({ askFielders: false }).cfg.askFielders, false);
    assert.equal(bsInit({ askFielders: true }).cfg.askFielders, true);
  });
});

/* ------------------------------ American football ------------------------------ */

const afStart = (cfg: Record<string, unknown>): AFState => {
  let s = afInit(cfg);
  s = afReducer(s, { type: 'SET_DRIVE', payload: { off: 'home', spot: 25, down: 1, toGo: 10 } });
  return s;
};

describe('American football (AF1–AF5)', () => {
  test('AF1: a tackle and a pass breakup read in the commentary', () => {
    let s = afStart({ preset: 'nfl', mode: 'pbp', trackTackles: true, trackDefence: true });
    s = afReducer(s, afPlay(s, 'home', { play: 'run', yards: 4, p1: { id: 'h1' } }));
    s = afReducer(s, { type: 'TACKLE', side: 'away', attribution: { playerId: 'a7', stat: 'tackles', playerName: 'Lee' } });
    s = afReducer(s, afPlay(s, 'home', { play: 'inc', p1: { id: 'h2' } }));
    s = afReducer(s, { type: 'PASS_DEF', side: 'away', attribution: { playerId: 'a8', stat: 'passDef', playerName: 'Kim' } });
    const lines = afCommentary(s, { home: 'Lions', away: 'Bears' }).flatMap((g) => g.lines).map((l) => l.text).join(' | ');
    assert.match(lines, /Tackle by Lee\./);
    assert.match(lines, /Broken up by Kim\./);
  });
  test('AF2: a Kneel button logs a kneel-down', () => {
    assert.match(src('src/sports/american_football/index.tsx'), /play: 'kneel'/);
  });
  test('AF3: tackle presets default to play by play; flag stays Scores only; old formats unchanged', () => {
    for (const k of ['nfl', 'ncaa', 'nfhs']) assert.equal(AF_PRESETS[k].set.mode, 'pbp', k);
    for (const k of ['flag', 'flagSchool']) assert.equal(AF_PRESETS[k].set.mode, 'score', k);
    assert.equal(afInit({ preset: 'nfl' }).mode, 'score', 'an old NFL match without a mode key keeps Scores only');
    assert.equal(afInit({ preset: 'nfl', mode: 'pbp' }).mode, 'pbp');
  });
  test('AF4: the stats toggles hide in Scores only (format and the live card)', () => {
    const fields = AMERICAN_FOOTBALL_META.formatFields!;
    for (const k of ['trackTackles', 'trackTargets', 'trackDefence']) {
      const f = fields.find((x) => x.key === k)!;
      assert.equal(isHidden(f, { mode: 'score' }), true, k);
      assert.equal(isHidden(f, { mode: 'pbp' }), false, k);
      const lf = AF_LIVE_SETTINGS.fields.find((x) => x.key === k)!;
      assert.equal(isHidden(lf, { mode: false }), true, `live ${k}`);
    }
    assert.match(src('src/components/LiveSettingsCard.tsx'), /isHidden\(/);
  });
  test('AF5: "Standard" follows the ruleset — a standard flag game reads Standard', () => {
    const flag = afInit({ preset: 'flag' });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(flag), flag), 0);
    const nfl = afInit({ preset: 'nfl', mode: 'pbp' });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(nfl), nfl), 0);
    const nfhs = afInit({ preset: 'nfhs', mode: 'pbp' });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(nfhs), nfhs), 0);
    const odd = afInit({ preset: 'flag', periodMinutes: 25 });
    assert.equal(customCount(AF_LIVE_SETTINGS, AF_LIVE_SETTINGS.read(odd), odd), 1);
  });
});
