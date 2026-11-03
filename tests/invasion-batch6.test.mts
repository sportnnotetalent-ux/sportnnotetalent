/**
 * Invasion batch 6 (docs/sport-expert/invasion.md P2 fixes 12–17, plus the
 * Batch 5 "Not done" items; break list docs/security/breaks/invasion-batch6.md):
 *  G  football: Shot → On target → Goal straight to the assist panel; goal situation (corner / set piece / indirect FK / fast break);
 *  C  football: concussion substitutes (outside the limit, at most 2);
 *  K  football: "penalties conceded" on careers (keyed);
 *  V  voice: football stoppage reason, league "penalty to" the side with the ball;
 *  I  ice hockey: shoot-out saved / missed + the goalie; penalty "served by";
 *  R  hockey / ice hockey / union / league: goal / try ruled out (toggle, off by default);
 *  X  union / league: restart and penalty-use depth (toggle, off by default);
 *  O  old logs replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fa from '../src/sports/football/actions.ts';
import * as fe from '../src/sports/football/events.ts';
import { init as fbInit, reducer as fbReducer, MAX_CONCUSSION_SUBS, type FootballState } from '../src/sports/football/engine.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import { footballDepthTeamStats } from '../src/sports/football/depth.ts';
import { footballStatTotals, FOOTBALL_DERIVED_KEYS } from '../src/sports/football/totals.ts';
import { footballStats as fbSchema } from '../src/sports/football/stats.ts';
import { parseIntent } from '../src/sports/football/voiceCommands.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyFeed } from '../src/sports/hockey/feed.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { hockeyTotals } from '../src/sports/hockey/totals.ts';
import * as ice from '../src/sports/ice_hockey/engine.ts';
import { iceHockeyCommentary } from '../src/sports/ice_hockey/commentary.ts';
import { iceHockeyTimeline, describeEvent as iceDescribe } from '../src/sports/ice_hockey/timeline.ts';
import { iceHockeyTotals } from '../src/sports/ice_hockey/totals.ts';
import { iceHockeyStats } from '../src/sports/ice_hockey/stats.ts';
import * as ru from '../src/sports/rugby/engine.ts';
import { rugbyCommentary } from '../src/sports/rugby/commentary.ts';
import { rugbyTimeline } from '../src/sports/rugby/timeline.ts';
import { rugbySheet } from '../src/sports/rugby/sheet.ts';
import { rugbyTotals } from '../src/sports/rugby/totals.ts';
import * as rl from '../src/sports/rugby_league/engine.ts';
import { leagueCommentary } from '../src/sports/rugby_league/commentary.ts';
import { leagueTimeline } from '../src/sports/rugby_league/timeline.ts';
import { leagueSheet } from '../src/sports/rugby_league/sheet.ts';
import { leagueTotals } from '../src/sports/rugby_league/totals.ts';
import { leagueVoice } from '../src/sports/rugby_league/voice.ts';
import * as ro from '../src/sports/invasion/ruledOut.ts';
import * as rs from '../src/sports/invasion/restarts.ts';
import { matchCaptures } from '../src/sports/matchRules.ts';
import { HOCKEY_LIVE_SETTINGS } from '../src/sports/hockey/engine.ts';
import { ICE_HOCKEY_LIVE_SETTINGS } from '../src/sports/ice_hockey/engine.ts';
import { RUGBY_LIVE_SETTINGS } from '../src/sports/rugby/engine.ts';
import { LEAGUE_LIVE_SETTINGS } from '../src/sports/rugby_league/engine.ts';
import { HOCKEY_META } from '../src/sports/hockey/meta.ts';
import { ICE_HOCKEY_META } from '../src/sports/ice_hockey/meta.ts';
import { RUGBY_META } from '../src/sports/rugby/meta.ts';
import { RUGBY_LEAGUE_META } from '../src/sports/rugby_league/meta.ts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import type { FeedGroup } from '../src/sports/invasion/feed.ts';

const names = { home: 'Lions', away: 'Tigers' };
const src = (p: string) => readFileSync(new URL(`../src/sports/${p}`, import.meta.url), 'utf8');
const HOSTILE: unknown[] = ['x'.repeat(5000), '<script>', { a: 1 }, [1], 7, null, '', 'OFFSIDE', true];
const kicked = (cfg: Record<string, unknown> = { halfMinutes: 45 }): FootballState => fbReducer(fbInit(cfg), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
const fbRun = (as: ScoreAction[], s: FootballState = kicked()) => as.reduce(fbReducer, s);
const at = (a: ScoreAction, minute: number): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half: 1 } });
const lines = (g: FeedGroup[]) => g.flatMap((x) => x.lines.map((l) => l.text));

/* ---------------------------------- G ---------------------------------- */

describe('G · football: fast Shot → Goal and the goal situation', () => {
  test('G1 Shot → On target → ⚽ Goal goes straight to the assist panel (no forced type / body steps)', () => {
    const ui = src('football/index.tsx');
    assert.doesNotMatch(ui, /setFlow\(\{ mode: 'goal', side, step: 'type', scorer: player \}\)/);
    // the goal is on the board at the tap (as from the Goal button) and the panel opens on the assist
    assert.match(ui, /label="⚽ Goal" variant="home" style=\{ctrl\.flex\} onPress=\{\(\) => \(player \? shotGoal\(side, player\) : recordTeamGoal\(side\)\)\}/);
    assert.match(ui, /const shotGoal = \(side: 'home' \| 'away', player: Player\) => \{ recordGoal\(side, player, 'open'\); setFlow\(\{ mode: 'goal', side, step: 'assist', scorer: player, goalType: 'open', logged: true, fromSeq: state\.seq \}\); \}/);
  });
  test('G2 the zone / big chance picked on the shot ride on the goal (recordGoal reads mods); one goal', () => {
    const s = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'open', { zone: 'box', bigChance: true }), 10)]);
    assert.equal(s.events.length, 1);
    assert.equal(s.events[0].zone, 'box');
    assert.equal(s.events[0].bigChance, true);
    assert.equal(s.home, 1);
  });
  test('G3 every situation reaches the goal and its commentary; Direct free kick stays the goal type', () => {
    const want: Record<string, RegExp> = { corner: /from a corner/i, setpiece: /set piece/i, ifk: /indirect free kick/i, fastbreak: /counter-attack|fast break/i };
    for (const sit of fe.GOAL_SITUATIONS) {
      const s = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'open', { situation: sit }), 20)]);
      assert.equal(s.events[0].situation, sit);
      const line = footballFeed(s, names).find((f) => f.id === `e${s.events[0].id}`)!;
      assert.match(line.text, want[sit], sit);
    }
    // set later, from the assist panel (GOAL_DETAIL), and cleared with null
    let s = fbRun([at(fa.goalAction('away', { id: 'p2' }, 'open'), 5)]);
    s = fbReducer(s, fa.goalDetailAction('away', { situation: 'corner' }));
    assert.equal(s.events[0].situation, 'corner');
    s = fbReducer(s, fa.goalDetailAction('away', { situation: null }));
    assert.equal('situation' in s.events[0], false);
  });
  test('G3 a hostile situation is ignored (GOAL and GOAL_DETAIL)', () => {
    for (const bad of HOSTILE) {
      const s = fbRun([{ type: 'GOAL', side: 'home', payload: { goalType: 'open', pid: 'p1', situation: bad, minute: 3, half: 1 } } as ScoreAction]);
      assert.equal('situation' in s.events[0], false, String(bad).slice(0, 20));
      const t = fbReducer(s, { type: 'GOAL_DETAIL', side: 'home', payload: { situation: bad } } as ScoreAction);
      assert.equal('situation' in t.events[0], false);
    }
  });
  test('G4 a penalty or a direct free kick never carries a situation', () => {
    for (const gt of ['penalty', 'freekick'] as const) {
      const s = fbRun([at(fa.goalAction('home', { id: 'p9' }, gt, { situation: 'corner' }), 20)]);
      assert.equal('situation' in s.events[0], false, gt);
      const t = fbReducer(s, fa.goalDetailAction('home', { situation: 'fastbreak' }));
      assert.equal('situation' in t.events[0], false, gt);
    }
    // a header from a corner is fine
    const h = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'open', { bodyPart: 'head', situation: 'corner' }), 20)]);
    assert.equal(h.events[0].situation, 'corner');
  });
  test('G5 GOAL_DETAIL without the key keeps the situation; zone edits keep it', () => {
    let s = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'open', { situation: 'setpiece' }), 20)]);
    s = fbReducer(s, { type: 'GOAL_DETAIL', side: 'home', payload: { zone: 'out', bigChance: false } } as ScoreAction);
    assert.equal(s.events[0].situation, 'setpiece');
    assert.equal(s.events[0].zone, 'out');
  });
  test('G5 the set-piece / fast-break team rows show only once a goal carries a situation', () => {
    const plain = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'freekick'), 3), at(fa.goalAction('away', { id: 'p2' }, 'open', { zone: 'box' }), 9)], kicked({ halfMinutes: 45, trackShotDetail: true }));
    const d0 = footballDepthTeamStats(plain);
    assert.equal('setPieceGoals' in d0.home, false);
    assert.equal('fastBreakGoals' in d0.away, false);
    const s = fbRun([at(fa.goalAction('home', { id: 'p9' }, 'open', { situation: 'corner' }), 3), at(fa.goalAction('home', { id: 'p8' }, 'freekick'), 5), at(fa.goalAction('away', { id: 'p2' }, 'open', { situation: 'fastbreak' }), 9)]);
    const d = footballDepthTeamStats(s);
    assert.deepEqual([d.home.setPieceGoals, d.away.setPieceGoals, d.home.fastBreakGoals, d.away.fastBreakGoals], [2, 0, 0, 1]);
    const keys = fbSchema.stats.map((x) => x.key);
    assert.ok(keys.includes('setPieceGoals') && keys.includes('fastBreakGoals'));
  });
  test('G the assist panel offers the situation chips under Shot detail, and refine keeps / drops them', () => {
    const ui = src('football/index.tsx');
    assert.match(ui, /GOAL_SITUATIONS\.map\(/);
    assert.match(ui, /goalDetailAction\(flow\.side, \{ situation:/);
    assert.match(ui, /Direct free kick/);
  });
});

/* ---------------------------------- C ---------------------------------- */

describe('C · football concussion substitutes', () => {
  const fixed = () => kicked({ halfMinutes: 45, subType: 'fixed', maxSubs: 1 });
  test('C1 a concussion sub is outside the limit and marked', () => {
    let s = fbRun([at(fa.subAction('home', { id: 'a' }, { id: 'b' }), 10)], fixed());
    assert.equal(s.subsUsed.home, 1);
    // the limit is reached — an ordinary sub is refused, a concussion sub is not
    const refused = fbReducer(s, at(fa.subAction('home', { id: 'c' }, { id: 'd' }), 20));
    assert.equal(refused, s);
    s = fbReducer(s, at(fa.subAction('home', { id: 'c' }, { id: 'd' }, { concussion: true }), 20));
    const ev = s.events.at(-1)!;
    assert.equal(ev.type, 'sub');
    assert.equal(ev.concussion, true);
    assert.equal(s.subsUsed.home, 1, 'not counted against the limit');
    assert.deepEqual(s.concussionSubs, { home: 1, away: 0 });
    assert.ok(s.subbedOff.home.includes('c'), 'permanent: the player cannot return');
  });
  test('C2 at most MAX_CONCUSSION_SUBS per side; a hostile flag is an ordinary sub', () => {
    assert.equal(MAX_CONCUSSION_SUBS, 2);
    let s = kicked({ halfMinutes: 45, subType: 'fixed', maxSubs: 5 });
    for (let i = 0; i < 4; i++) s = fbReducer(s, at(fa.subAction('away', { id: `o${i}` }, { id: `n${i}` }, { concussion: true }), 10 + i));
    assert.equal(s.concussionSubs!.away, 2);
    assert.equal(s.events.filter((e) => e.concussion).length, 2);
    for (const bad of ['true', 1, { a: 1 }, 'yes']) {
      const t = fbRun([{ type: 'SUB', side: 'home', payload: { offId: 'x', onId: 'y', concussion: bad, minute: 4, half: 1 } } as ScoreAction]);
      assert.equal(t.events[0].concussion, undefined);
      assert.equal(t.subsUsed.home, 1);
      assert.equal('concussionSubs' in t, false);
    }
    assert.equal(fa.concussionLeft(s, 'away'), 0);
    assert.equal(fa.concussionLeft(s, 'home'), 2);
  });
  test('C3 removing a concussion sub gives back the concussion sub, not an ordinary one', () => {
    let s = fbRun([at(fa.subAction('home', { id: 'a' }, { id: 'b' }), 10), at(fa.subAction('home', { id: 'c' }, { id: 'd' }, { concussion: true }), 20)], fixed());
    const ev = s.events.find((e) => e.concussion)!;
    for (const a of fa.eventRemoval(ev)) s = fbReducer(s, a);
    assert.equal(s.subsUsed.home, 1);
    assert.equal(s.concussionSubs!.home, 0);
    assert.equal(s.subbedOff.home.includes('c'), false);
  });
  test('C4 the sub panel offers the concussion option (optional, one chip), and the feed says so', () => {
    const ui = src('football/index.tsx');
    assert.match(ui, /concussion/i);
    assert.match(ui, /subAction\(sub\.side, sub\.off!, p, sub\.concussion \? \{ concussion: true \} : \{\}\)/);
    const s = fbRun([at(fa.subAction('home', { id: 'a' }, { id: 'b' }, { concussion: true }), 10)]);
    const line = footballFeed(s, names).find((f) => f.id === `e${s.events[0].id}`)!;
    assert.match(line.text, /concussion/i);
  });
});

/* ---------------------------------- K ---------------------------------- */

describe('K · football penalties conceded on careers', () => {
  test('K1 the conceding defender gets penaltiesGivenAway (keyed); nobody else', () => {
    const s = fbRun([
      ...fa.penaltyConcededActions('home', { id: 'def' }, { id: 'att' }, { fouls: true, at: 1 }).map((a) => at(a, 30)),
      at(fa.foulAction('away', { id: 'def2' }, null), 31),
    ]);
    const t = footballStatTotals(s);
    assert.equal(t.def.stats.penaltiesGivenAway, 1);
    assert.equal(t.def2.stats.penaltiesGivenAway, undefined, 'an ordinary foul does not');
    assert.equal(t.att.stats.penaltiesGivenAway, undefined);
    assert.ok(FOOTBALL_DERIVED_KEYS.includes('penaltiesGivenAway' as never));
    const row = fbSchema.stats.find((x) => x.key === 'penaltiesGivenAway')!;
    assert.equal(row.coverage, 'keyed');
  });
  test('K2 an old match (no pen flag) never carries the key', () => {
    const s = fbRun([at(fa.foulAction('away', { id: 'd' }, { id: 'v' }), 5), at(fa.goalAction('home', { id: 'p' }, 'penalty'), 6)]);
    for (const l of Object.values(footballStatTotals(s))) assert.equal('penaltiesGivenAway' in l.stats, false);
  });
});

/* ---------------------------------- V ---------------------------------- */

describe('V · voice commands for the batch 5 taps', () => {
  test('V1 football: stoppage with a reason', () => {
    assert.deepEqual(parseIntent('stoppage injury'), { kind: 'stoppage', reason: 'injury' });
    assert.deepEqual(parseIntent('player injured, stoppage'), { kind: 'stoppage', reason: 'injury' });
    assert.deepEqual(parseIntent('VAR check'), { kind: 'stoppage', reason: 'var' });
    assert.deepEqual(parseIntent('cooling break'), { kind: 'stoppage', reason: 'cooling' });
    assert.deepEqual(parseIntent('drinks break'), { kind: 'stoppage', reason: 'cooling' });
    assert.deepEqual(parseIntent('stoppage'), { kind: 'stoppage' });
    const ui = src('football/index.tsx');
    assert.match(ui, /case 'stoppage': \{[\s\S]{0,120}fire\(stoppageAction\(state\.possession\.side \?\? 'home', intent\.reason\)\)/);
  });
  test('V2 "injury time" is added time, not a stoppage; other commands are unchanged', () => {
    assert.notEqual(parseIntent('two minutes injury time').kind, 'stoppage');
    assert.equal(parseIntent('goal').kind, 'goal');
    assert.equal(parseIntent('yellow card').kind, 'card');
    assert.equal(parseIntent('full time').kind, 'fullTime');
  });
  test('V3 league: "penalty to the attack" ends the set as penWon (only with a set running)', () => {
    let s = rl.init({ trackSets: true, trackErrors: true });
    s = rl.reducer(s, { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
    const ctx = (st: rl.LeagueState): VoiceContext => ({ state: st, homeRoster: [], awayRoster: [], homeName: 'Lions', awayName: 'Tigers', now: 5000 } as unknown as VoiceContext);
    assert.equal(leagueVoice('penalty to the attack', ctx(s)), null, 'no set running');
    s = rl.reducer(s, { type: 'SET_BALL', side: 'home', payload: { at: 2000 } } as ScoreAction);
    const out = leagueVoice('penalty to the attack', ctx(s))!;
    assert.equal(out.length, 1);
    assert.equal(out[0].type, 'SET_END');
    assert.equal(out[0].payload?.how, 'penWon');
    assert.equal(out[0].payload?.detail, 'penalty');
    const after = out.reduce(rl.reducer, s);
    const pen = after.events.find((e) => e.type === 'detail')!;
    assert.equal(pen.side, 'away', 'conceded by the defence');
    assert.equal(leagueVoice('penalty won', ctx(s))![0].payload?.how, 'penWon');
  });
});

/* ---------------------------------- I ---------------------------------- */

const iceSo = (): ice.IceHockeyState => {
  let s = ice.init({ decider: 'otso', otMinutes: 0 });
  s = ice.reducer(s, { type: 'END', payload: { at: 1 } } as ScoreAction);
  return ice.reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } } as ScoreAction);
};

describe('I · ice hockey: shoot-out saves and "served by"', () => {
  test('I1 saved and missed are separate, with the goalie; shoot-out save figures', () => {
    let s = iceSo();
    s = ice.reducer(s, ice.soAction('home', 'saved', { id: 'h1' }, { id: 'agk' }));
    s = ice.reducer(s, ice.soAction('away', 'scored', { id: 'a1' }, { id: 'hgk' }));
    s = ice.reducer(s, ice.soAction('home', 'missed', { id: 'h2' }, { id: 'agk' }));
    assert.deepEqual(s.shootout!.home.map((k) => k.outcome), ['saved', 'missed']);
    assert.equal(s.shootout!.home[0].gkId, 'agk');
    assert.equal(s.shootout!.away[0].scored, true);
    const t = iceHockeyTotals(s);
    assert.deepEqual([t.agk.stats.soShotsFaced, t.agk.stats.soSaves], [2, 1]);
    assert.deepEqual([t.hgk.stats.soShotsFaced, t.hgk.stats.soSaves], [1, 0]);
    assert.equal(t.agk.side, 'away');
    // live credits = totals: the shooter's soTaken (+ soGoals), the goalie's faced (+ saves)
    const a = ice.soAction('home', 'saved', { id: 'h1' }, { id: 'agk' });
    assert.equal(a.attribution?.playerId, 'h1');
    assert.equal(a.attribution2?.playerId, 'agk');
    assert.equal(a.attribution2?.side, 'away');
    const keys = iceHockeyStats.stats.map((x) => x.key);
    assert.ok(keys.includes('soSaves') && keys.includes('soShotsFaced'));
    const text = lines(iceHockeyCommentary(s, names)).join('\n');
    assert.match(text, /saved by/i);
    assert.match(text, /miss(es)? the net/i);
    const ui = src('ice_hockey/index.tsx');
    assert.match(ui, /soAction\(nextSide, 'saved'/);
    assert.match(ui, /soAction\(nextSide, 'missed'/);
  });
  test('I2 a hostile outcome / goalie is ignored; a scored shot carries no outcome', () => {
    for (const bad of HOSTILE) {
      const s = ice.reducer(iceSo(), { type: 'SO', side: 'home', payload: { scored: false, outcome: bad, gkId: bad } } as ScoreAction);
      const k = s.shootout!.home[0];
      assert.equal('outcome' in k, false, String(bad).slice(0, 20));
      assert.equal('gkId' in k, false);
    }
    const g = ice.reducer(iceSo(), { type: 'SO', side: 'home', payload: { scored: true, outcome: 'saved' } } as ScoreAction);
    assert.equal('outcome' in g.shootout!.home[0], false);
  });
  test('I3 the result is unchanged; an old shoot-out replays identically', () => {
    const old: ScoreAction[] = [
      { type: 'SO', side: 'home', payload: { scored: false } },
      { type: 'SO', side: 'away', payload: { scored: true }, attribution: { playerId: 'a1', stat: 'soTaken', extra: { soGoals: 1 } } },
    ] as ScoreAction[];
    const s = old.reduce(ice.reducer, iceSo());
    assert.deepEqual(s.shootout!.home[0], { scored: false });
    assert.deepEqual(s.shootout!.away[0], { scored: true, playerId: 'a1' });
    const t = iceHockeyTotals(s);
    assert.equal('soSaves' in (t.a1?.stats ?? {}), false);
    let n = iceSo();
    for (const o of ['saved', 'missed', 'scored'] as const) n = ice.reducer(n, ice.soAction('home', o, null, null));
    assert.equal(ice.soScore(n).home, 1);
  });
  test('I4 penalty served by a team-mate: stored, shown, no minutes for him', () => {
    let s = ice.init({});
    s = ice.reducer(s, { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
    s = ice.reducer(s, { type: 'PEN', side: 'home', payload: { pen: 'bench', servedId: 'h7', sec: 60, period: 1, at: 2000 } } as ScoreAction);
    s = ice.reducer(s, { type: 'PEN', side: 'away', payload: { pen: 'minor', servedId: 'a9', sec: 70, period: 1, at: 2100 }, attribution: { playerId: 'agk', stat: 'penaltyMinutes', by: 2, extra: { minors: 1 } } } as ScoreAction);
    assert.equal(s.events[0].servedId, 'h7');
    assert.equal(s.events[1].servedId, 'a9');
    assert.match(iceDescribe(ice.reducer(s, { type: 'END', payload: {} } as ScoreAction).events[0]).detail ?? '', /served by/i);
    const nm = (id: string) => ({ h7: 'Sam', a9: 'Kai', agk: 'Lee' } as Record<string, string>)[id] ?? id;
    const text = lines(iceHockeyCommentary(s, names, nm)).join('\n');
    assert.match(text, /served by Sam/i);
    assert.match(text, /served by Kai/i);
    const t = iceHockeyTotals(s);
    assert.equal(t.h7, undefined, 'the server gets no PIM');
    assert.equal(t.a9, undefined);
    const ui = src('ice_hockey/index.tsx');
    assert.match(ui, /step: 'served'/);
    assert.match(ui, /Served by/);
  });
  test('I5 a hostile "served by", or the penalised player himself, is ignored', () => {
    // (an id-shaped string such as "OFFSIDE" can't be told from an id in a pure reducer — the controls only offer team-mates)
    for (const bad of [...HOSTILE.filter((v) => v !== 'OFFSIDE'), 'p1', 'a b', '../x']) {
      const s = ice.reducer(ice.init({}), { type: 'PEN', side: 'home', payload: { pen: 'minor', servedId: bad, sec: 5, period: 1 }, attribution: { playerId: 'p1', stat: 'penaltyMinutes', by: 2 } } as ScoreAction);
      assert.equal('servedId' in s.events[0], false, String(bad).slice(0, 20));
    }
  });
});

/* ---------------------------------- R ---------------------------------- */

type Sport = { id: ro.RuledOutSport; init: (c?: Record<string, unknown>) => unknown; reducer: (s: never, a: ScoreAction) => unknown; score: (s: never) => [number, number];
  feed: (s: never) => string[]; timeline: (s: never) => string[]; ls: { fields: { key: string }[]; read: (s: never) => Record<string, unknown> }; meta: { formatFields: { key: string; default?: unknown }[] } };
const SPORTS: Sport[] = [
  { id: 'hockey', init: hk.init, reducer: hk.reducer as never, score: (s: hk.HockeyState) => [s.home, s.away],
    feed: (s: hk.HockeyState) => hockeyFeed(s, names).map((f) => f.text), timeline: (s: hk.HockeyState) => hockeyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`), ls: HOCKEY_LIVE_SETTINGS as never, meta: HOCKEY_META as never } as never,
  { id: 'ice_hockey', init: ice.init, reducer: ice.reducer as never, score: (s: ice.IceHockeyState) => [s.home, s.away],
    feed: (s: ice.IceHockeyState) => lines(iceHockeyCommentary(s, names)), timeline: (s: ice.IceHockeyState) => iceHockeyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`), ls: ICE_HOCKEY_LIVE_SETTINGS as never, meta: ICE_HOCKEY_META as never } as never,
  { id: 'rugby', init: ru.init, reducer: ru.reducer as never, score: (s: ru.RugbyState) => [s.home, s.away],
    feed: (s: ru.RugbyState) => lines(rugbyCommentary(s, names)), timeline: (s: ru.RugbyState) => rugbyTimeline(s, names).map((r) => `${r.label} ${r.detail ?? ''}`), ls: RUGBY_LIVE_SETTINGS as never, meta: RUGBY_META as never } as never,
  { id: 'rugby_league', init: rl.init, reducer: rl.reducer as never, score: (s: rl.LeagueState) => [s.home, s.away],
    feed: (s: rl.LeagueState) => lines(leagueCommentary(s, names)), timeline: (s: rl.LeagueState) => leagueTimeline(s).map((r) => `${r.label} ${r.detail ?? ''}`), ls: LEAGUE_LIVE_SETTINGS as never, meta: RUGBY_LEAGUE_META as never } as never,
];
const started = (sp: Sport, cfg: Record<string, unknown> = {}) => sp.reducer(sp.init(cfg) as never, { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
const UI: Record<ro.RuledOutSport, string> = { hockey: 'hockey/index.tsx', ice_hockey: 'ice_hockey/index.tsx', rugby: 'rugby/index.tsx', rugby_league: 'rugby_league/index.tsx' };

describe('R · goal / try ruled out (hockey, ice hockey, union, league)', () => {
  for (const sp of SPORTS) {
    test(`R1 ${sp.id}: a toggle, off by default, in Info and the format; the button only when on`, () => {
      const f = sp.ls.fields.find((x) => x.key === 'trackRuledOut');
      assert.ok(f, 'live settings field');
      const mf = sp.meta.formatFields.find((x) => x.key === 'trackRuledOut');
      assert.ok(mf, 'format field');
      assert.equal(mf!.default, false);
      const off = sp.init({});
      assert.equal(matchCaptures(sp.ls as never, off).captures.find((c) => c.key === 'trackRuledOut')?.on, false);
      const on = sp.init({ trackRuledOut: true });
      assert.equal(matchCaptures(sp.ls as never, on).captures.find((c) => c.key === 'trackRuledOut')?.on, true);
      const ui = src(UI[sp.id]);
      assert.match(ui, /ruledOutAction\(/);
      assert.match(ui, /ruledOutOn/);
    });
    test(`R2 ${sp.id}: every reason, with or without the review — the score never moves, the feed and timeline say it`, () => {
      for (const reason of [undefined, ...ro.RULED_OUT_REASONS[sp.id]]) {
        for (const review of [false, true]) {
          let s = started(sp, { trackRuledOut: true });
          s = sp.reducer(s as never, ro.ruledOutAction(sp.id, 'home', { reason, review }));
          assert.deepEqual(sp.score(s as never), [0, 0]);
          const ev = (s as { events: { type: string; reason?: string; review?: boolean; playerId?: string }[] }).events.at(-1)!;
          assert.equal(ev.type, 'ruledout');
          assert.equal(ev.reason, reason);
          assert.equal(ev.review, review ? true : undefined);
          assert.equal(ev.playerId, undefined);
          const feed = sp.feed(s as never).join('\n');
          assert.match(feed, new RegExp(`${ro.RULED_OUT_WHAT[sp.id]} ruled out`, 'i'));
          if (review) assert.match(feed, new RegExp(ro.RULED_OUT_REVIEW[sp.id].replace(/[’']/g, '.'), 'i'));
          assert.match(sp.timeline(s as never).join('\n'), /ruled out/i);
        }
      }
    });
    test(`R3 ${sp.id}: a hostile reason / review / side is ignored`, () => {
      for (const bad of HOSTILE) {
        const s = sp.reducer(started(sp) as never, { type: 'RULED_OUT', side: 'home', payload: { reason: bad, review: bad === true ? 'yes' : bad } } as ScoreAction);
        const ev = (s as { events: { reason?: unknown; review?: unknown }[] }).events.at(-1)!;
        assert.equal('reason' in ev, false, String(bad).slice(0, 20));
        assert.equal('review' in ev, false);
        const t = sp.reducer(started(sp) as never, { type: 'RULED_OUT', side: bad, payload: {} } as unknown as ScoreAction);
        assert.equal((t as { events: unknown[] }).events.length, 0);
      }
    });
    test(`R4 ${sp.id}: an old match's state has no new key (init without the toggle)`, () => {
      const s = sp.init({}) as Record<string, unknown>;
      assert.equal('trackRuledOut' in s, false);
      if (sp.id === 'hockey') assert.equal((s.track as Record<string, unknown> | undefined)?.ruledOut, undefined);
    });
  }
  test('R5 the ruled-out row credits nobody (totals unchanged) and can be removed', () => {
    let h = started(SPORTS[0], { trackRuledOut: true }) as hk.HockeyState;
    h = hk.reducer(h, ro.ruledOutAction('hockey', 'away', { reason: 'foul' }));
    assert.deepEqual(hockeyTotals(h), hockeyTotals(started(SPORTS[0]) as hk.HockeyState));
    h = hk.reducer(h, { type: 'REMOVE_EVENT', payload: { id: h.events[0].id } } as ScoreAction);
    assert.equal(h.events.length, 0);
    let r = started(SPORTS[2], { trackRuledOut: true }) as ru.RugbyState;
    r = ru.reducer(r, ro.ruledOutAction('rugby', 'home', { reason: 'forwardPass', review: true }));
    assert.deepEqual(rugbyTotals(r), {});
    assert.ok(rugbySheet(r).sections.flatMap((x) => x.rows).some((row) => row.key === 'triesRuledOut'));
    let l = started(SPORTS[3], { trackRuledOut: true }) as rl.LeagueState;
    l = rl.reducer(l, ro.ruledOutAction('rugby_league', 'home', { reason: 'obstruction', review: true }));
    assert.deepEqual(leagueTotals(l), {});
    assert.ok(leagueSheet(l).sections.flatMap((x) => x.rows).some((row) => row.key === 'triesRuledOut'));
    let i = started(SPORTS[1], { trackRuledOut: true }) as ice.IceHockeyState;
    i = ice.reducer(i, ro.ruledOutAction('ice_hockey', 'home', { reason: 'offside', review: true }));
    assert.deepEqual(iceHockeyTotals(i), {});
  });
});

/* ---------------------------------- X ---------------------------------- */

describe('X · union / league restart and penalty-use depth', () => {
  test('X1 union: penalty to touch / scrum / tap and 50:22 — rows and commentary', () => {
    let s = ru.reducer(ru.init({ trackRestarts: true }), { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
    assert.deepEqual([...rs.UNION_RESTARTS], ['penTouch', 'penScrum', 'penTap', 'fiftyTwentyTwo']);
    for (const k of rs.UNION_RESTARTS) s = ru.reducer(s, rs.restartAction('home', k));
    s = ru.reducer(s, rs.restartAction('away', 'penTouch'));
    const rows = rugbySheet(s).sections.find((x) => x.key === 'restarts')!.rows;
    assert.deepEqual(rows.map((r) => [r.key, r.h, r.a]), [['restart:penTouch', 1, 1], ['restart:penScrum', 1, 0], ['restart:penTap', 1, 0], ['restart:fiftyTwentyTwo', 1, 0]]);
    const text = lines(rugbyCommentary(s, names)).join('\n');
    assert.match(text, /kick for touch/i);
    assert.match(text, /scrum/i);
    assert.match(text, /tap/i);
    assert.match(text, /50:22/);
    assert.equal(s.home + s.away, 0);
    assert.deepEqual(rugbyTotals(s), {});
    assert.ok(rugbyTimeline(s, names).some((r) => /50:22/.test(r.label)));
  });
  test('X2 league: 40/20, 20/40, goal-line drop-out, penalty to touch / tap', () => {
    let s = rl.reducer(rl.init({ trackRestarts: true }), { type: 'CLOCK', payload: { run: true, at: 1000 } } as ScoreAction);
    assert.deepEqual([...rs.LEAGUE_RESTARTS], ['penTouch', 'penTap', 'fortyTwenty', 'twentyForty', 'dropOut']);
    for (const k of rs.LEAGUE_RESTARTS) s = rl.reducer(s, rs.restartAction('away', k));
    const rows = leagueSheet(s).sections.find((x) => x.key === 'restarts')!.rows;
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r.h === 0 && r.a === 1));
    const text = lines(leagueCommentary(s, names)).join('\n');
    assert.match(text, /40\/20/);
    assert.match(text, /20\/40/);
    assert.match(text, /drop-out/i);
    assert.deepEqual(leagueTotals(s), {});
  });
  test('X3 a hostile kind / side, or a kind of the other code, is ignored', () => {
    for (const bad of [...HOSTILE, 'fortyTwenty']) {
      const s = ru.reducer(ru.init({}), { type: 'RESTART', side: 'home', payload: { kind: bad } } as ScoreAction);
      assert.equal(s.events.length, 0, String(bad).slice(0, 20));
    }
    for (const bad of [...HOSTILE, 'fiftyTwentyTwo', 'penScrum']) {
      const s = rl.reducer(rl.init({}), { type: 'RESTART', side: 'home', payload: { kind: bad } } as ScoreAction);
      assert.equal(s.events.length, 0, String(bad).slice(0, 20));
    }
    assert.equal(ru.reducer(ru.init({}), { type: 'RESTART', side: 'up', payload: { kind: 'penTap' } } as unknown as ScoreAction).events.length, 0);
  });
  test('X4 no restart section on a match that never tracked them; the toggle is in Info, off by default', () => {
    assert.equal(rugbySheet(ru.init({})).sections.some((x) => x.key === 'restarts'), false);
    assert.equal(leagueSheet(rl.init({})).sections.some((x) => x.key === 'restarts'), false);
    assert.ok(rugbySheet(ru.init({ trackRestarts: true })).sections.some((x) => x.key === 'restarts'));
    for (const [ls, meta, st] of [[RUGBY_LIVE_SETTINGS, RUGBY_META, ru.init({})], [LEAGUE_LIVE_SETTINGS, RUGBY_LEAGUE_META, rl.init({})]] as const) {
      assert.ok(ls.fields.some((f) => f.key === 'trackRestarts'));
      assert.equal(meta.formatFields.find((f) => f.key === 'trackRestarts')?.default, false);
      assert.equal(matchCaptures(ls as never, st).captures.find((c) => c.key === 'trackRestarts')?.on, false);
      assert.equal('trackRestarts' in st, false);
    }
    assert.match(src('rugby/index.tsx'), /restartAction\(/);
    assert.match(src('rugby_league/index.tsx'), /restartAction\(/);
  });
});

/* ---------------------------------- O ---------------------------------- */

describe('O · old logs replay identically', () => {
  test('O1 an old football goal / sub / foul log gives the same state as before (no new keys)', () => {
    const old: ScoreAction[] = [
      { type: 'GOAL', side: 'home', payload: { goalType: 'open', pid: 'p1', minute: 3, half: 1 } },
      { type: 'GOAL_DETAIL', side: 'home', payload: { zone: 'box', bigChance: true } },
      { type: 'SUB', side: 'home', payload: { offId: 'a', onId: 'b', minute: 50, half: 2 } },
      { type: 'SUB', side: 'away', payload: { offName: 'Old', onName: 'New', minute: 60, half: 2 } },
    ] as ScoreAction[];
    const s = fbRun(old);
    assert.deepEqual(s.events.map((e) => Object.keys(e).filter((k) => (e as Record<string, unknown>)[k] !== undefined).sort().join()), [
      'bigChance,goalType,half,id,minute,playerId,side,type,zone',
      'half,id,minute,playerId,secondId,side,type',
      'half,id,minute,playerName,secondName,side,type',
    ]);
    assert.equal('concussionSubs' in s, false);
    assert.deepEqual(s.subsUsed, { home: 1, away: 1 });
  });
  test('O1 old hockey / union / league / ice states keep their shape', () => {
    for (const [st, keys] of [[hk.init({}), 'track'], [ru.init({}), 'trackRestarts'], [rl.init({}), 'trackRestarts'], [ice.init({}), 'trackRuledOut']] as const) {
      assert.equal(keys in (st as object), false);
    }
  });
});
