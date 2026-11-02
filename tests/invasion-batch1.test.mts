/**
 * Invasion batch 1 (docs/sport-expert/invasion.md fixes 1–3; break list
 * docs/security/breaks/invasion-batch1.md):
 *  B1 a saved / missed football penalty is a shot (saved = on target);
 *  B2 the grid's 🧤 Save logs the other side's shot on target (shooter optional);
 *  B3 a saved / missed hockey stroke is a shot (saved = on goal), new logs only;
 *  B4 confirm crosses, dribbles, offsides, handballs, penalties won / missed reach a career;
 *  B5 a red card is always recordable, "Cards" off hides only yellows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fa from '../src/sports/football/actions.ts';
import { init as fbInit, reducer as fbReducer, footballStats as fbTeamStats, type FootballState } from '../src/sports/football/engine.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import { footballStats as fbSchema } from '../src/sports/football/stats.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyTotals } from '../src/sports/hockey/totals.ts';
import { hockeyVoice } from '../src/sports/voiceParsers.ts';
import { rankPlayers } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

const fbRun = (as: ScoreAction[], s: FootballState = fbReducer(fbInit({ halfMinutes: 45 }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction)) => as.reduce(fbReducer, s);
const names = { home: 'Lions', away: 'Tigers' };

/* ------------------------------ B1: penalties ------------------------------ */

describe('B1 · a saved or missed penalty is a shot', () => {
  test('saved: the taker gets a shot on target, the keeper a save, after the penalty miss', () => {
    const as: ScoreAction[] = fa.penaltyMissActions('home', 'saved', { id: 'h9' }, { id: 'agk' });
    assert.deepEqual(as.map((a) => a.payload?.kind), ['penaltyMissed', 'save', 'shot']);
    const shot = as[2];
    assert.equal(shot.side, 'home');
    assert.equal(shot.payload?.onTarget, true);
    assert.equal(shot.payload?.pen, true);
    assert.deepEqual(shot.attribution && { id: shot.attribution.playerId, stat: shot.attribution.stat, extra: shot.attribution.extra }, { id: 'h9', stat: 'shots', extra: { shotsOnTarget: 1 } });
    const s = fbRun(as);
    const t = fbTeamStats(s, 0).totals;
    assert.equal(t.home.shots, 1); assert.equal(t.home.shotsOnTarget, 1); assert.equal(t.away.saves, 1);
  });
  test('missed: an off-target shot, no save', () => {
    const as = fa.penaltyMissActions('away', 'missed', { id: 'a9' }, { id: 'hgk' });
    assert.deepEqual(as.map((a) => a.payload?.kind), ['penaltyMissed', 'shot']);
    assert.equal(as[1].payload?.onTarget, false);
    const t = fbTeamStats(fbRun(as), 0).totals;
    assert.equal(t.away.shots, 1); assert.equal(t.away.shotsOnTarget, 0); assert.equal(t.home.saves, 0);
  });
  test('no taker named (team): a team shot, no credit', () => {
    const as = fa.penaltyMissActions('home', 'saved', undefined, undefined);
    assert.deepEqual(as.map((a) => a.payload?.kind), ['penaltyMissed', 'shot']);
    assert.equal(as[1].attribution, undefined);
    assert.equal(fbTeamStats(fbRun(as), 0).totals.home.shotsOnTarget, 1);
  });
  test('commentary: one line for a saved penalty (the shot folds in)', () => {
    const s = fbRun(fa.penaltyMissActions('home', 'saved', { id: 'h9' }, { id: 'agk' }));
    const feed = footballFeed(s, names, (id, legacy) => (id ? id.toUpperCase() : legacy ?? 'Player'));
    assert.equal(feed.length, 1, feed.map((f) => f.text).join(' | '));
    assert.match(feed[0].text, /Penalty saved!/);
  });
  test('old logs replay identically: a penalty miss with no shot keeps no shot', () => {
    const old: ScoreAction[] = [
      { type: 'STAT', side: 'home', payload: { kind: 'penaltyMissed', at: 1 }, attribution: { playerId: 'h9', stat: 'penaltiesMissed' } },
      { type: 'STAT', side: 'away', payload: { kind: 'save', at: 1 }, attribution: { playerId: 'agk', stat: 'saves' } },
    ];
    const s = fbRun(old);
    assert.equal(fbTeamStats(s, 0).totals.home.shots, 0);
    assert.ok(s.stats.every((st) => !('pen' in st)));
  });
});

/* ----------------------------- B2: grid saves ------------------------------ */

describe('B2 · the grid save logs the shot it stopped', () => {
  test('a named shooter: shot on target for the other side, then the save', () => {
    const as = fa.gridSaveActions('home', { id: 'hgk' }, { id: 'a7' });
    assert.deepEqual(as.map((a) => [a.payload?.kind, a.side]), [['shot', 'away'], ['save', 'home']]);
    assert.equal(as[0].payload?.onTarget, true);
    assert.equal(as[0].attribution?.playerId, 'a7');
    const s = fbRun(as);
    const t = fbTeamStats(s, 0).totals;
    assert.equal(t.away.shotsOnTarget, 1); assert.equal(t.home.saves, 1);
    // commentary: one line, the save folded into the shot
    const feed = footballFeed(s, names, (id, legacy) => (id ? id.toUpperCase() : legacy ?? 'Player'));
    assert.equal(feed.length, 1);
    assert.match(feed[0].text, /saved/);
  });
  test('"Not sure" (no shooter) and no keeper: a team shot and a team save', () => {
    const as = fa.gridSaveActions('away', undefined, null);
    assert.equal(as[0].attribution, undefined);
    assert.equal(as[1].attribution, undefined);
    const t = fbTeamStats(fbRun(as), 0).totals;
    assert.equal(t.home.shotsOnTarget, 1); assert.equal(t.away.saves, 1);
  });
  test('editing a save re-logs the save only (no second shot)', () => {
    const as = fa.gridSaveActions('home', { id: 'hgk' }, null, { edit: true });
    assert.deepEqual(as.map((a) => a.payload?.kind), ['save']);
  });
});

/* ------------------------------ B3: hockey ------------------------------- */

describe('B3 · a saved or missed hockey stroke is a shot (new logs)', () => {
  const start = (): hk.HockeyState => hk.reducer(hk.init({}), { type: 'CLOCK', payload: { run: true, at: 1 } } as ScoreAction);
  test('saved stroke: shots + shotsOnGoal for the taker, team figures too', () => {
    const a = hk.strokeAction('home', 'saved', 'h9', { uid: 'u1', sec: 60, period: 1 });
    assert.equal(a.payload?.shot, true);
    const s = hk.reducer(start(), a);
    const e = s.events.at(-1)!;
    assert.equal(e.shot, true);
    assert.deepEqual(hk.eventCredits(e).first?.stats, { strokesMissed: 1, shots: 1, shotsOnGoal: 1 });
    const f = hk.teamFigures(s, 'home');
    assert.equal(f.shots, 1); assert.equal(f.shotsOnGoal, 1); assert.equal(f.strokes, 1);
    const h9 = hockeyTotals(s).h9.stats;
    assert.deepEqual([h9.strokesMissed, h9.shots, h9.shotsOnGoal], [1, 1, 1]);
    // the live credit matches the replayed one
    assert.equal(a.attribution?.playerId, 'h9');
    const live = { [a.attribution!.stat]: a.attribution!.by ?? 1, ...a.attribution!.extra };
    assert.deepEqual(live, { strokesMissed: 1, shots: 1, shotsOnGoal: 1 });
  });
  test('missed stroke: a shot, not on goal', () => {
    const s = hk.reducer(start(), hk.strokeAction('away', 'missed', 'a9', { uid: 'u2', sec: 60, period: 1 }));
    assert.deepEqual(hk.eventCredits(s.events.at(-1)!).first?.stats, { strokesMissed: 1, shots: 1 });
    assert.equal(hk.teamFigures(s, 'away').shotsOnGoal, 0);
    assert.equal(hk.teamFigures(s, 'away').shots, 1);
  });
  test('old logs keep their figures: a STROKE with no flag is no shot', () => {
    const s = hk.reducer(start(), { type: 'STROKE', side: 'home', payload: { outcome: 'saved', uid: 'u3', sec: 60, period: 1 } } as ScoreAction);
    assert.equal(s.events.at(-1)!.shot, undefined);
    assert.deepEqual(hk.eventCredits(s.events.at(-1)!).first, undefined); // no player
    assert.equal(hk.teamFigures(s, 'home').shots, 0);
    const named = hk.reducer(start(), { type: 'STROKE', side: 'home', payload: { outcome: 'saved', uid: 'u4', pid: 'h9', sec: 60, period: 1 }, attribution: { playerId: 'h9', stat: 'strokesMissed' } } as ScoreAction);
    const h9 = hockeyTotals(named).h9.stats;
    assert.deepEqual([h9.strokesMissed, h9.shots, h9.shotsOnGoal], [1, 0, 0]);
    assert.equal(hk.teamFigures(named, 'home').shots, 0);
  });
  test('voice "stroke saved" logs the shot too', () => {
    const s = start();
    const P = (id: string, fullName: string) => ({ id, fullName }) as never;
    const ctx = { state: s, homeName: 'Lions', awayName: 'Tigers', homeRoster: [P('h9', 'Ravi Rao')], awayRoster: [P('agk', 'Kim Khan')], now: 30_000 } as VoiceContext;
    const as = hockeyVoice('stroke saved Rao', ctx) ?? [];
    const st = as.find((a) => a.type === 'STROKE');
    assert.equal(st?.payload?.shot, true);
    assert.equal(hk.teamFigures(as.reduce(hk.reducer, s), 'home').shotsOnGoal, 1);
  });
});

/* --------------------------- B4: career keys ------------------------------ */

describe('B4 · captured football stats reach a career (confirmation)', () => {
  const KEYS = ['crosses', 'dribbles', 'offsides', 'handballs', 'penaltiesWon', 'penaltiesMissed'];
  // the list the controls stamp (index.tsx trackedKeys, every toggle on):
  // none of the six keys is in it
  const STAMPED = ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'yellowCards', 'redCards', 'cleanSheets',
    'shots', 'shotsOnTarget', 'blocks', 'fouls', 'tackles', 'interceptions', 'saves', 'attackingContributions', 'defensiveContributions'];
  const lines: StatLine[] = [1, 2].map((n) => ({ id: `m${n}-p`, matchId: `m${n}`, playerId: 'p', sport: 'football', won: false,
    stats: { goals: 0, crosses: 3, dribbles: 2, offsides: 1, handballs: 1, penaltiesWon: 1, penaltiesMissed: 1 }, tracked: STAMPED } as StatLine));
  test('the career (careerSections) shows every one, summed, with no coverage note', () => {
    const rows = new Map(careerSections(fbSchema as never, lines).flatMap((s) => s.rows).map((r) => [r.key, r]));
    for (const k of KEYS) {
      assert.ok(rows.has(k), `${k} on the career`);
      assert.equal(rows.get(k)!.coverage, undefined, `${k}: no "N of M games" note`);
    }
    assert.equal(rows.get('crosses')!.value, '6');
    assert.equal(rows.get('penaltiesMissed')!.value, '2');
  });
  test('they rank on leaderboards too (their rows are plain sums, not optional)', () => {
    for (const k of KEYS) {
      const def = fbSchema.stats.find((d) => d.key === k)!;
      assert.equal(def.coverage, undefined, `${k} has no optional coverage`);
      const ranked = rankPlayers(fbSchema, def, lines);
      assert.equal(ranked.length, 1, `${k} ranked`);
    }
  });
});

/* ------------------------------ B5: red cards ------------------------------ */

describe('B5 · a red card is always recordable', () => {
  test('Cards on: yellow and red; Cards off: red only, the button still there', () => {
    assert.deepEqual(fa.cardChoices(true).colours, ['yellow', 'red']);
    const off = fa.cardChoices(false);
    assert.deepEqual(off.colours, ['red']);
    assert.match(off.label, /Red/);
  });
  test('the red still sends the player off with Cards off', () => {
    let s = fbReducer(fbInit({ halfMinutes: 45, trackCards: false }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
    assert.equal(s.track.cards, false);
    for (const a of fa.cardActions(s.events, 'home', 'red', { id: 'h4' })) s = fbReducer(s, a);
    assert.equal(s.events.filter((e) => e.type === 'red' && e.playerId === 'h4').length, 1);
  });
  test('the scorer UI keeps the Card button whatever the toggle', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/sports/football/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /foul: t\.fouls, offside: t\.offsides, handball: t\.handball, card: true/);
    assert.match(src, /cardChoices\(t\.cards\)/);
  });
});
