/**
 * Invasion batch 5 (docs/sport-expert/invasion.md fixes 5, 6, 9, 10, 11 and
 * the Batch 1 B4 side note; break list docs/security/breaks/invasion-batch5.md):
 *  S  football stoppage reason (injury / VAR / cooling break / other), optional, after the tap;
 *  P  football penalty: who conceded it (optional) → the foul (when tracked) and the card step;
 *  T  union / league penalty try: an optional card for the offender;
 *  L  league: a penalty to the side with the ball (against the defence) as its own set ending;
 *  H  hockey: second green / yellow warnings, team-official cards;
 *  R  football tracked keys: crosses, dribbles, offsides, handballs, penalties won / missed;
 *  O  old logs replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fa from '../src/sports/football/actions.ts';
import { init as fbInit, reducer as fbReducer, footballStats as fbTeamStats, type FootballState } from '../src/sports/football/engine.ts';
import { footballFeed } from '../src/sports/football/feed.ts';
import { footballStats as fbSchema } from '../src/sports/football/stats.ts';
import { rankPlayers } from '../src/sports/statSchema.ts';
import * as hk from '../src/sports/hockey/engine.ts';
import { hockeyFeed, hockeyFacts } from '../src/sports/hockey/feed.ts';
import { hockeyTimeline } from '../src/sports/hockey/timeline.ts';
import { hockeyTotals } from '../src/sports/hockey/totals.ts';
import { hockeyDepthFigures } from '../src/sports/hockey/depth.ts';
import { HOCKEY_DISCIPLINE } from '../src/sports/hockey/discipline.ts';
import * as rl from '../src/sports/rugby_league/engine.ts';
import { setFigures } from '../src/sports/rugby_league/sets.ts';
import { leagueSheet } from '../src/sports/rugby_league/sheet.ts';
import { leagueCommentary } from '../src/sports/rugby_league/commentary.ts';
import { leagueTotals } from '../src/sports/rugby_league/totals.ts';
import * as ru from '../src/sports/rugby/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { StatLine } from '../src/core/types.ts';

const names = { home: 'Lions', away: 'Tigers' };
const src = (p: string) => readFileSync(new URL(`../src/sports/${p}`, import.meta.url), 'utf8');
const kicked = (): FootballState => fbReducer(fbInit({ halfMinutes: 45 }), { type: 'KICKOFF', payload: { at: 1 } } as ScoreAction);
const fbRun = (as: ScoreAction[], s: FootballState = kicked()) => as.reduce(fbReducer, s);
const withMin = (a: ScoreAction, minute: number): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half: 1 } });

/* ------------------------- S: football stoppage reason ------------------------- */

describe('S · football stoppage reason', () => {
  test('S1 every reason reaches the event and its commentary line', () => {
    const want: Record<string, RegExp> = { injury: /injury/i, var: /VAR/, cooling: /Cooling break/, other: /Delay in match/ };
    for (const r of fa.STOPPAGE_REASONS) {
      const s = fbRun([withMin(fa.stoppageAction('home', r), 30)]);
      const ev = s.events.find((e) => e.type === 'stoppage')!;
      assert.equal(ev.playerName, r);
      const line = footballFeed(s, names).find((f) => f.id === `e${ev.id}`)!;
      assert.match(line.text, want[r], r);
    }
  });
  test('S1 the reason added after the tap (STOPPAGE_REASON) reaches the line', () => {
    let s = fbRun([withMin(fa.stoppageAction('home'), 30)]);
    const ev = s.events.find((e) => e.type === 'stoppage')!;
    assert.match(footballFeed(s, names).find((f) => f.id === `e${ev.id}`)!.text, /^Delay in match/);
    s = fbReducer(s, fa.stoppageReasonAction(ev.id, 'var'));
    assert.match(footballFeed(s, names).find((f) => f.id === `e${ev.id}`)!.text, /VAR check/);
    // a second answer replaces the first (the scorer changed their mind)
    s = fbReducer(s, fa.stoppageReasonAction(ev.id, 'cooling'));
    assert.equal(s.events.find((e) => e.id === ev.id)!.playerName, 'cooling');
    assert.equal(s.events.length, 1, 'no new row');
  });
  test('S2 the stoppage uses fire() (a backfilled stoppage keeps its minute) and stays one tap', () => {
    const ui = src('football/index.tsx');
    assert.doesNotMatch(ui, /dispatch\(\{ type: 'STOPPAGE'/);
    assert.match(ui, /fire\(fa?\.?stoppageAction\(|fire\(stoppageAction\(/);
    // the reason is asked after the stoppage is on the log: an inline chip row, never a panel / gate
    assert.match(ui, /setStopAsk\(state\.seq \+ 1\); fire\(stoppageAction\(/);
    assert.doesNotMatch(ui, /mode: 'stoppage'/);
    assert.match(ui, /stoppageReasonAction\(/);
    const s = fbRun([withMin(fa.stoppageAction('home'), 12)]);
    assert.equal(s.events[0].minute, 12);
  });
  test('S3 a hostile reason is ignored', () => {
    for (const bad of ['x'.repeat(5000), '<script>', { a: 1 }, 7, '', 'VAR']) {
      const s = fbRun([{ type: 'STOPPAGE', side: 'home', payload: { reason: bad, minute: 3, half: 1 } } as ScoreAction]);
      assert.equal(s.events.length, 1);
      assert.equal(s.events[0].playerName, undefined, String(bad).slice(0, 20));
    }
  });
  test('S5 the reason amend touches only a stoppage row, and only with a known reason', () => {
    const base = fbRun([
      withMin(fa.goalAction('home', { id: 'h9' }, 'open'), 5),
      withMin(fa.stoppageAction('away'), 9),
    ]);
    const goal = base.events.find((e) => e.type === 'goal')!;
    const stop = base.events.find((e) => e.type === 'stoppage')!;
    for (const a of [
      fa.stoppageReasonAction(goal.id, 'injury'),
      { type: 'STOPPAGE_REASON', payload: { ref: stop.id, reason: 'hacked' } },
      { type: 'STOPPAGE_REASON', payload: { ref: String(stop.id), reason: 'injury' } },
      { type: 'STOPPAGE_REASON', payload: { ref: 999, reason: 'injury' } },
      { type: 'STOPPAGE_REASON', payload: {} },
    ] as ScoreAction[]) assert.deepEqual(fbReducer(base, a), base, JSON.stringify(a.payload));
  });
  test('O an old stoppage (no reason) replays exactly as before', () => {
    const old = [{ type: 'STOPPAGE', side: 'home', payload: { minute: 4, half: 1 } }] as ScoreAction[];
    const s = fbRun(old);
    assert.deepEqual(s.events, [{ id: 1, minute: 4, half: 1, type: 'stoppage', side: 'home', playerName: undefined }]);
  });
});

/* ------------------------- P: football penalty conceded ------------------------- */

describe('P · football penalty: who conceded it', () => {
  test('P1 the conceded foul is the defender\'s, flagged pen, the fouled player the one who won it; penalty won logged first', () => {
    const as = fa.penaltyConcededActions('home', { id: 'a4' }, { id: 'h7' }, { fouls: true, tracked: ['fouls'] });
    assert.deepEqual(as.map((a) => [a.type, a.side, a.payload?.kind]), [['STAT', 'home', 'penaltyWon'], ['STAT', 'away', 'foul']]);
    const foul = as[1];
    assert.equal(foul.payload?.pen, true);
    assert.equal(foul.payload?.secondId, 'h7');
    assert.equal(foul.payload?.possSide, 'home');
    assert.deepEqual([foul.attribution?.playerId, foul.attribution?.stat], ['a4', 'fouls']);
    const s = fbRun(as);
    assert.equal(fbTeamStats(s, 0).totals.away.fouls, 1);
    assert.equal(s.stats[1].pen, true);
  });
  test('P2 Fouls not tracked: no foul logged (only the penalty won), the card step still offered', () => {
    const as = fa.penaltyConcededActions('home', { id: 'a4' }, { id: 'h7' }, { fouls: false });
    assert.deepEqual(as.map((a) => a.payload?.kind), ['penaltyWon']);
    assert.deepEqual(fa.penaltyConcededActions('home', { id: 'a4' }, null, { fouls: false }), []);
    assert.match(src('football/index.tsx'), /step: 'card'; side: 'home' \| 'away'; conceder: Player/);
  });
  test('P3 the commentary reads "Penalty conceded by …", not a free kick', () => {
    const s = fbRun(fa.penaltyConcededActions('home', { id: 'a4' }, { id: 'h7' }, { fouls: true }).map((a) => withMin(a, 20)));
    const nameOf = (id?: string, legacy?: string) => (id ? id.toUpperCase() : legacy);
    const texts = footballFeed(s, names, nameOf as never).map((f) => f.text);
    assert.ok(texts.some((t) => /Penalty conceded by A4 \(Tigers\)/.test(t)), texts.join(' | '));
    assert.ok(!texts.some((t) => /wins a free kick/.test(t)), texts.join(' | '));
  });
  test('P4 the steps: optional, skipped when the defending side lists nobody', () => {
    const next = fa.penaltyStepAfter;
    assert.equal(next('team', { attackers: true, defenders: true }), 'wonBy');
    assert.equal(next('team', { attackers: false, defenders: true }), 'concededBy');
    assert.equal(next('team', { attackers: false, defenders: false }), 'outcome');
    assert.equal(next('wonBy', { attackers: true, defenders: true }), 'concededBy');
    assert.equal(next('wonBy', { attackers: true, defenders: false }), 'takenBy');
    assert.equal(next('concededBy', { attackers: true, defenders: true }), 'takenBy');
    assert.equal(next('concededBy', { attackers: false, defenders: true }), 'outcome');
    const ui = src('football/index.tsx');
    assert.match(ui, /Who gave it away\? \(optional\)/);
    assert.match(ui, /penaltyConcededActions\(/);
  });
  test('P5 an old penalty (no conceded step) replays the same', () => {
    const old = fa.penaltyMissActions('home', 'saved', { id: 'h9' }, { id: 'agk' });
    const s = fbRun([fa.statAction('penaltyWon', 'home', { id: 'h7' }), ...old]);
    assert.equal(s.stats.filter((x) => x.kind === 'foul').length, 0);
    assert.ok(s.stats.every((x) => x.kind !== 'foul' || !x.pen));
  });
  test('P an old foul (no pen flag) still reads as a free kick', () => {
    const s = fbRun([withMin(fa.foulAction('away', { id: 'a4' }, { id: 'h7' }), 10)]);
    const nameOf = (id?: string, legacy?: string) => (id ? id.toUpperCase() : legacy);
    assert.match(footballFeed(s, names, nameOf as never)[0].text, /Foul by A4 \(Tigers\)\. H7 \(Lions\) wins a free kick\./);
  });
});

/* ------------------------ R: football tracked keys ------------------------ */

describe('R · football tracked keys cover every captured stat', () => {
  const allOn = { shots: true, fouls: true, tackles: true, interceptions: true, saves: true, passes: true, attackContribution: true, defenceContribution: true,
    cards: true, offsides: true, corners: true, crosses: true, dribbles: true, handball: true } as Record<string, boolean>;
  test('R1 with the toggles on: crosses, dribbles, offsides, handballs; penalties won / missed always', () => {
    const k = fa.footballTrackedKeys(allOn, {});
    for (const key of ['crosses', 'dribbles', 'offsides', 'handballs', 'penaltiesWon', 'penaltiesMissed']) assert.ok(k.includes(key), key);
    const off = fa.footballTrackedKeys({ ...allOn, crosses: false, dribbles: false, offsides: false, handball: false }, {});
    for (const key of ['crosses', 'dribbles', 'offsides', 'handballs']) assert.ok(!off.includes(key), key);
    assert.ok(off.includes('penaltiesWon') && off.includes('penaltiesMissed'));
  });
  test('R1 the leader rail no longer reads them as "N of M games" on new lines', () => {
    const tracked = fa.footballTrackedKeys(allOn, {});
    const lines: StatLine[] = [1, 2].map((n) => ({ id: `m${n}-p`, matchId: `m${n}`, playerId: 'p', sport: 'football', won: false,
      stats: { crosses: 3, dribbles: 2, offsides: 1, handballs: 1, penaltiesWon: 1, penaltiesMissed: 1 }, tracked } as StatLine));
    for (const key of ['crosses', 'dribbles', 'offsides', 'handballs', 'penaltiesWon', 'penaltiesMissed']) {
      const r = rankPlayers(fbSchema, fbSchema.stats.find((d) => d.key === key)!, lines)[0];
      assert.equal(r.trackedGames, r.totalGames, key);
    }
  });
  test('R the controls stamp footballTrackedKeys', () => {
    assert.match(src('football/index.tsx'), /footballTrackedKeys\(t, deep\)/);
  });
});

/* ---------------------- T: penalty try card (union, league) ---------------------- */

describe('T · penalty try: an optional card for the offender', () => {
  test('T1 union: after the penalty try, the card step opens for the other side, with "No card"', () => {
    const ui = src('rugby/index.tsx');
    assert.match(ui, /PENALTY_TRY', side: sd \}\); if \(!editAt && !isSuddenDeath\(s, s\.period\)\) setFlow\(\{ mode: 'card', side: other\(sd\), step: 'kind', pt: true \}\)/);
    assert.match(ui, /No card/);
  });
  test('T1 union: the offender\'s card is an ordinary CARD (sin-bin / red), the try 7 points', () => {
    let s = ru.reducer(ru.init({}), { type: 'PENALTY_TRY', side: 'home', payload: { uid: 'p1', sec: 600, psec: 600, period: 1 } });
    s = ru.reducer(s, { type: 'CARD', side: 'away', payload: { card: 'yellow', uid: 'c1', sec: 600, psec: 600, period: 1 }, attribution: { playerId: 'a3', stat: 'yellowCards' } });
    assert.equal(s.home, 7);
    assert.deepEqual(s.events.map((e) => [e.type, e.side]), [['pentry', 'home'], ['card', 'away']]);
  });
  test('T1 / T2 league: the sanction step for the other side, then the conversion (golden point still ends it)', () => {
    const ui = src('rugby_league/index.tsx');
    assert.match(ui, /if \(editAt \|\| isGoldenPoint\(s, s\.period\)\) conversionNext\(sd\);\s+else setFlow\(\{ mode: 'sanction', side: other\(sd\), step: 'kind', pt: sd \}\);/);
    assert.match(ui, /No sanction/);
    // the sanction (or No sanction / Cancel) goes on to the conversion
    assert.match(ui, /const ptNext = \(\) => \{ if \(flow\?\.mode === 'sanction' && flow\.pt\) conversionNext\(flow\.pt\); else setFlow\(null\); \};/);
    assert.match(ui, /flow\.mode === 'sanction' && flow\.pt \? ptNext\(\) : setFlow\(null\)/);
  });
});

/* ---------------- L: league penalty to the side with the ball ---------------- */

describe('L · league: a penalty against the defending side', () => {
  let n = 0;
  const A = (type: string, side: rl.Side | undefined, sec: number, payload: Record<string, unknown> = {}, attribution?: ScoreAction['attribution']): ScoreAction =>
    ({ type, ...(side ? { side } : {}), payload: { ...payload, uid: `u${++n}`, sec, psec: sec, period: 1 }, ...(attribution ? { attribution } : {}) });
  const base = (cfg: Record<string, unknown>) => [A('SET_BALL', 'home', 10), A('TACKLE', undefined, 20), A('TACKLE', undefined, 30)].reduce(rl.reducer, rl.init(cfg));
  test('L1 / L2 "Penalty to {side}": a completed set, a fresh set for the side with the ball', () => {
    const s = rl.reducer(base({ trackSets: true }), A('SET_END', undefined, 40, { how: 'penWon' }));
    const { sets, open } = rl.walkSets(s);
    assert.deepEqual(sets.map((x) => [x.side, x.tackles, x.end]), [['home', 2, 'penWon']]);
    assert.equal(open?.side, 'home');
    assert.equal(open?.tackles, 0);
    const f = setFigures(s, 'home');
    assert.deepEqual([f.completed, f.decided], [1, 1]);
    assert.ok(rl.TAP_ENDS.includes('penWon'));
    assert.ok(rl.COMPLETE_ENDS.includes('penWon'));
  });
  test('L3 with "Errors & penalties" on, the penalty is the DEFENCE\'s (credited to the defender)', () => {
    const s = rl.reducer(base({ trackSets: true, trackErrors: true }),
      A('SET_END', undefined, 40, { how: 'penWon', detail: 'penalty' }, { playerId: 'a8', stat: 'penaltiesGivenAway' }));
    const d = s.events.find((e) => e.type === 'detail')!;
    assert.deepEqual([d.side, d.detail, d.playerId], ['away', 'penalty', 'a8']);
    assert.equal(rl.walkSets(s).sets[0].det, d.id);
    const sh = leagueSheet(s);
    const pc = sh.sections.find((x) => x.key === 'discipline')!.rows.find((r) => r.key === 'penaltiesConceded')!;
    assert.deepEqual([pc.home, pc.away], ['0', '1']);
    const tot = leagueTotals(s);
    assert.equal(tot.a8?.stats.penaltiesGivenAway, 1);
  });
  test('L1 the commentary: "Penalty to Lions" with the defender, told once', () => {
    const s = rl.reducer(base({ trackSets: true, trackErrors: true }),
      A('SET_END', undefined, 40, { how: 'penWon', detail: 'penalty' }, { playerId: 'a8', playerName: 'Sam', stat: 'penaltiesGivenAway' }));
    const lines = leagueCommentary(s, names).flatMap((g) => g.lines).map((l) => l.text);
    assert.equal(lines.filter((t) => /Penalty to Lions/.test(t)).length, 1, lines.join(' | '));
    assert.ok(lines.some((t) => /Sam/.test(t)), lines.join(' | '));
    assert.ok(!lines.some((t) => /Penalty conceded by/.test(t)), 'the detail row is told with the set ending');
  });
  test('L1 sets only (errors off): the sheet counts penalties to each side', () => {
    const s = rl.reducer(base({ trackSets: true }), A('SET_END', undefined, 40, { how: 'penWon' }));
    const row = leagueSheet(s).sections.find((x) => x.key === 'sets')!.rows.find((r) => r.key === 'end:penWon');
    assert.equal(row?.home, '1');
  });
  test('L4 a hostile / unknown ending is ignored; with no set running nothing happens', () => {
    const b = base({ trackSets: true });
    for (const how of ['penwon', 'PENWON', 'score', 'sixth', 'other', 'period', 42, null]) assert.deepEqual(rl.reducer(b, A('SET_END', undefined, 40, { how })), b, String(how));
    const none = rl.init({ trackSets: true });
    assert.deepEqual(rl.reducer(none, A('SET_END', undefined, 40, { how: 'penWon' })), none);
  });
  test('L the scorer UI offers the ending, the defender optional', () => {
    const ui = src('rugby_league/index.tsx');
    assert.match(ui, /Penalty to \{name\(sd\)\}|`📣 Penalty to \$\{name\(sd\)\}`/);
    assert.match(ui, /how: 'penWon'/);
  });
});

/* ------------------------------ H: hockey cards ------------------------------ */

describe('H · hockey: card warnings and team-official cards', () => {
  let n = 0;
  const A = (type: string, side: hk.Side, sec: number, payload: Record<string, unknown> = {}, attribution?: ScoreAction['attribution']): ScoreAction =>
    ({ type, side, payload: { ...payload, uid: `h${++n}`, sec, period: 1 }, ...(attribution ? { attribution } : {}) });
  const card = (side: hk.Side, c: 'green' | 'yellow' | 'red', who: string, sec: number) => A('CARD', side, sec, { card: c }, { playerId: who, stat: `${c}Cards` });
  test('H1 the players already on a green (for a green) / on a yellow (for a yellow) are flagged', () => {
    const s = [card('home', 'green', 'h1', 60), card('home', 'yellow', 'h2', 120), card('away', 'green', 'a1', 130)].reduce(hk.reducer, hk.init({}));
    assert.deepEqual(hk.cardWarnIds(s, 'home', 'green'), ['h1']);
    assert.deepEqual(hk.cardWarnIds(s, 'home', 'yellow'), ['h2']);
    assert.deepEqual(hk.cardWarnIds(s, 'home', 'red'), []);
    assert.deepEqual(hk.cardWarnIds(s, 'away', 'green'), ['a1']);
    assert.match(hk.cardWarning('green'), /at least a yellow/);
    assert.match(src('hockey/index.tsx'), /cardWarnIds\(/);
  });
  test('H2 / H3 an official\'s card: listed, no player, nobody short, not a player card', () => {
    let s = hk.reducer(hk.init({}), A('CARD', 'home', 300, { card: 'red', official: 'Head coach' }));
    s = hk.reducer(s, A('CARD', 'home', 320, { card: 'green', minutes: 2, official: '  ' }));
    const [r, g] = s.events;
    assert.deepEqual([r.type, r.card, r.official, r.playerId, r.playerName], ['card', 'red', 'Head coach', undefined, undefined]);
    assert.equal(g.official, 'Team official');
    assert.equal(g.minutes, undefined, 'an official\'s card carries no suspension');
    const f = hk.teamFigures(s, 'home');
    assert.deepEqual([f.greenCards, f.yellowCards, f.redCards], [0, 0, 0]);
    assert.equal(hockeyFacts(s).home.length, 0, 'no red in the result facts');
    assert.deepEqual(hockeyTotals(s), {});
    assert.equal(hockeyDepthFigures(s, 'home', 'all', 0).suspensionMinutes ?? 0, 0);
    const feed = hockeyFeed(s, names).map((x) => x.text);
    assert.ok(feed.some((t) => /Red card to Head coach \(Lions official\)/.test(t)), feed.join(' | '));
    const tl = hockeyTimeline(s);
    assert.ok(JSON.stringify(tl).includes('Head coach (official)'));
    const marks = HOCKEY_DISCIPLINE.marks({ state: s } as never);
    assert.deepEqual(marks.map((m) => [m.official, m.off]), [['Head coach', undefined], ['Team official', undefined]]);
    assert.match(src('hockey/index.tsx'), /Or a team official/);
  });
  test('H4 a hostile official name is capped / ignored; the old player card is unchanged', () => {
    const s = hk.reducer(hk.init({}), A('CARD', 'home', 300, { card: 'yellow', official: 'x'.repeat(500) }));
    assert.ok((s.events[0].official ?? '').length <= 40);
    const t = hk.reducer(hk.init({}), A('CARD', 'home', 300, { card: 'yellow', official: { a: 1 } }, { playerId: 'h3', stat: 'yellowCards' }));
    assert.equal(t.events[0].official, undefined);
    assert.equal(t.events[0].playerId, 'h3');
    assert.equal(t.events[0].minutes, 5);
  });
  test('O an old hockey card replays exactly as before', () => {
    const s = hk.reducer(hk.init({}), card('home', 'yellow', 'h3', 90));
    assert.deepEqual(Object.keys(s.events[0]).sort(), ['card', 'id', 'minutes', 'period', 'playerId', 'sec', 'side', 'type']);
  });
});
