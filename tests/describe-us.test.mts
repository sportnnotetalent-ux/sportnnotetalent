/**
 * Describe cards in US sports (docs/security/breaks/describe-us.md): the play
 * goes on the board at the scorer's tap, the detail is attached after by its
 * own action keyed to that play, in one shared DescribeCard (Done / Saved /
 * Edit). Old logs (detail inside the play) replay unchanged; an equivalent new
 * sequence gives the same events, stats, box, commentary and careers.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Player } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import { init as bkInit, reducer as bkReducer, type BasketballState } from '../src/sports/basketball/engine.ts';
import { foulAction, freeThrowAction, lineupAction, missAction, reboundAction, removeAction, scoreAction, statAction, blockAction } from '../src/sports/basketball/actions.ts';
import { pointsOf } from '../src/sports/basketball/events.ts';
import { basketballStatTotals } from '../src/sports/basketball/totals.ts';
import { bbDeepKeys } from '../src/sports/basketball/deep.ts';
import { basketballFeed } from '../src/sports/basketball/commentary.ts';
import { basketballPanel } from '../src/sports/basketball/panel.ts';
import { basketballUndoLabel } from '../src/sports/basketball/undoLabel.ts';
import { basketballBox } from '../src/sports/boxSources.ts';
import { buildBoxTable } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { withRosters } from '../src/sports/racketNames.ts';
import {
  init as afInit, reducer as afReducer, buildPlay as afPlay, credit as afCredit, eventCredits as afEventCredits, creditAttribution as afAttr, deepKeys as afDeepKeys,
  pointsOf as afPointsOf, type AFState, type Side as AFSide, type PlayInput,
} from '../src/sports/american_football/engine.ts';
import { afTotals } from '../src/sports/american_football/totals.ts';
import { afBox } from '../src/sports/american_football/box.ts';
import { afCommentary } from '../src/sports/american_football/commentary.ts';
import { afUndoLabel } from '../src/sports/american_football/timeline.ts';
import { init as bsInit, reducer as bsReducer, buildPlay as bsPlay, fieldersAction, type BaseballState, type Outcome } from '../src/sports/baseball/engine.ts';
import { baseballTotals } from '../src/sports/baseball/totals.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// the new pure modules are imported lazily, so each test fails on its own before they exist
const bkD = () => import('../src/sports/basketball/describe.ts');
const afD = () => import('../src/sports/american_football/describe.ts');
const bsD = () => import('../src/sports/baseball/describe.ts');

/* --------------------------------- basketball -------------------------------- */

type Side = 'home' | 'away';
const P = (id: string, fullName = id.toUpperCase()): Player => ({ id, fullName, sports: [] } as unknown as Player);
const H = ['h1', 'h2', 'h3', 'h4', 'h5'].map((x) => P(x)), A = ['a1', 'a2', 'a3', 'a4', 'a5'].map((x) => P(x));
const SQUADS = withRosters(undefined, H, A);
const BK = { periodMinutes: 10, regPeriods: 4, trackMisses: true, trackZones: true, trackFastBreak: true, trackFoulsDrawn: true, foulsForBonus: 4 };
const st = (a: ScoreAction, sec = 30): ScoreAction => ({ ...a, payload: { ...a.payload, quarter: 1, minute: Math.floor(sec / 60), sec, v: 2 } });
const bk = (...as: ScoreAction[]) => as.reduce(bkReducer, bkInit(BK));
const START: ScoreAction[] = [lineupAction('home', H), lineupAction('away', A), { type: 'KICKOFF', payload: { at: 1 } }];
const lastId = (s: BasketballState) => s.events[s.events.length - 1].id;
const box = (s: BasketballState) => JSON.stringify(buildBoxTable(STAT_SCHEMAS.basketball, basketballBox(s, { homeRoster: H, awayRoster: A }).data('all')));
const feed = (s: BasketballState) => JSON.stringify(basketballFeed(s, { home: 'H', away: 'A' }, SQUADS));

describe('basketball · the foul is logged at the tap, who drew it after (DU1, DU7)', () => {
  test('FOUL then FOUL_DRAWN equals the old one-step foul: events, stats, box, commentary, panel', async () => {
    const { foulDrawnAction } = await bkD();
    const old = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true, drawnBy: H[1] })));
    const s1 = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true })));
    const s2 = bkReducer(s1, foulDrawnAction('away', lastId(s1), H[1]));
    assert.deepEqual(s2, old);
    assert.deepEqual(basketballStatTotals(s2), basketballStatTotals(old));
    assert.equal(box(s2), box(old));
    assert.equal(feed(s2), feed(old));
    assert.deepEqual(basketballPanel(s2, { home: 'H', away: 'A' }), basketballPanel(old, { home: 'H', away: 'A' }));
    assert.equal(s2.seq, s1.seq, 'the detail pushes no event');
  });
  test('null clears it; a skipped foul writes no fouls-drawn zeros (DU15)', async () => {
    const { foulDrawnAction } = await bkD();
    const s1 = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true })));
    assert.equal(bbDeepKeys(s1).includes('foulsDrawn'), false);
    const s2 = bkReducer(s1, foulDrawnAction('away', lastId(s1), H[1]));
    assert.equal(bbDeepKeys(s2).includes('foulsDrawn'), true);
    const s3 = bkReducer(s2, foulDrawnAction('away', lastId(s1), null));
    assert.deepEqual(s3, s1);
  });
  test('DU4: wrong kind / junk changes nothing', async () => {
    const { foulDrawnAction } = await bkD();
    const s = bk(...START, st(scoreAction('home', 2, H[0], { fga: true })), st(foulAction('home', H[0], 'technical')), st(foulAction('away', null, 'technical', { bench: 'C' })));
    const [basket, tech, bench] = s.events.slice(-3);
    for (const id of [basket.id, tech.id, bench.id, 999, -1]) assert.deepEqual(bkReducer(s, foulDrawnAction('home', id, A[1])), s, `id ${id}`);
    const f = bk(...START, st(foulAction('away', A[0], 'personal')));
    for (const payload of [{ id: lastId(f), drawnPid: 7 }, { id: String(lastId(f)), drawnPid: 'h2' }, { drawnPid: 'h2' }, { id: lastId(f), drawnPid: '' }, null]) {
      assert.deepEqual(bkReducer(f, { type: 'FOUL_DRAWN', side: 'away', payload } as unknown as ScoreAction), f, JSON.stringify(payload));
    }
  });
  test('DU11: a player who is out cannot be named as fouled', async () => {
    const { foulDrawnAction } = await bkD();
    let s = bk(...START);
    for (let i = 0; i < 5; i++) s = bkReducer(s, st(foulAction('home', H[1], 'personal'), 10 + i)); // h2 fouls out
    s = bkReducer(s, st(foulAction('away', A[0], 'personal', { fdt: true }), 40));
    assert.deepEqual(bkReducer(s, foulDrawnAction('away', lastId(s), H[1])), s);
    assert.equal(bkReducer(s, foulDrawnAction('away', lastId(s), H[2])).events.at(-1)!.drawnPid, 'h3');
  });
  test('DU3: undo (dropping the newest action) takes the detail first, then the foul', async () => {
    const { foulDrawnAction } = await bkD();
    const log = [...START, st(foulAction('away', A[0], 'shooting', { fdt: true }))];
    const f = bk(...log);
    const withD = [...log, foulDrawnAction('away', lastId(f), H[3])];
    assert.equal(bk(...withD).events.at(-1)!.drawnPid, 'h4');
    assert.deepEqual(bk(...withD.slice(0, -1)), f);
    assert.equal(bk(...withD.slice(0, -2)).events.some((e) => e.type === 'foul'), false);
    // a detail for a foul that is gone is ignored
    assert.deepEqual(bkReducer(bk(...START), foulDrawnAction('away', lastId(f), H[3])), bk(...START));
  });
  test('DU5: timeline Edit keeps who drew it (it lives on the event); Remove reverses the foul', async () => {
    const { foulDrawnAction } = await bkD();
    const s1 = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true })));
    const s2 = bkReducer(s1, foulDrawnAction('away', lastId(s1), H[1]));
    const e = s2.events.at(-1)!;
    assert.equal(e.drawnPid, 'h2');
    const gone = bkReducer(s2, removeAction(e, 'a1', { halfCourt: false, tracked: true }));
    assert.equal(gone.events.some((x) => x.type === 'foul'), false);
    assert.equal(bbDeepKeys(gone).includes('foulsDrawn'), false);
  });
  test('DU16: Undo names the detail', async () => {
    const { foulDrawnAction } = await bkD();
    const s1 = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true })));
    const a = foulDrawnAction('away', lastId(s1), H[1]);
    assert.equal(basketballUndoLabel({ type: a.type, prev: s1, next: bkReducer(s1, a) }), 'who drew the foul');
  });
});

describe('basketball · each detail names its play (DU8, DU9, DU13)', () => {
  test('DU8: the fast-break tag names its basket by id, not "the side\'s latest"', async () => {
    const { tagAction } = await bkD();
    const s = bk(...START, st(scoreAction('home', 2, H[0], { fga: true, fbt: true })), st(scoreAction('home', 3, H[1], { fga: true, fbt: true }), 40));
    const first = s.events.at(-2)!.id;
    const t = bkReducer(s, tagAction('home', first, true));
    assert.equal(t.events.at(-2)!.fb, true);
    assert.equal(t.events.at(-1)!.fb, undefined);
    assert.equal(bkReducer(t, tagAction('home', first, false)).events.at(-2)!.fb, undefined);
  });
  test('DU9: a card goes stale once a newer play (tap or voice) is logged, not for its own detail', async () => {
    const { cardStale, assistOwn, foulOwn, blockOwn } = await bkD();
    let s = bk(...START, st(scoreAction('home', 2, H[0], { fga: true })));
    const basket = lastId(s);
    s = bkReducer(s, st(statAction('home', 'ASSIST', H[1], basket)));
    assert.equal(cardStale(s, basket, assistOwn(s, basket)), false, 'its own assist');
    const after = bkReducer(s, st(reboundAction('away', A[0], 'def')));
    assert.equal(cardStale(after, basket, assistOwn(after, basket)), true, 'a newer play');
    assert.equal(cardStale(bk(...START), basket, assistOwn(bk(...START), basket)), true, 'undone');
    // the foul's own free throws (and a forced ejection) keep its card open
    let f = bk(...START, st(foulAction('away', A[0], 'shooting', { fdt: true })));
    const fid = lastId(f);
    f = bkReducer(bkReducer(f, st(freeThrowAction('home', true, H[1]))), st(freeThrowAction('home', false, H[1])));
    assert.equal(cardStale(f, fid, foulOwn(f, fid)), false);
    assert.equal(cardStale(bkReducer(f, st(missAction('home', 2, H[0]))), fid, foulOwn(f, fid)), true);
    // a block's named shot
    let b = bk(...START, st(blockAction('home', H[0])));
    const bid = lastId(b);
    b = bkReducer(b, st(missAction('away', 3, A[1], undefined, bid)));
    assert.equal(cardStale(b, bid, blockOwn(b, bid)), false);
  });
  test('DU13 / DU14: the card reads its detail from the log (one assist, the tag, the shooter, who drew it)', async () => {
    const { assistCard, foulCard, blockCard } = await bkD();
    let s = bk(...START, st(scoreAction('home', 3, H[0], { fga: true, fbt: true })));
    const basket = lastId(s);
    assert.deepEqual(assistCard(s, basket), { assist: undefined, fb: false });
    s = bkReducer(s, st(statAction('home', 'ASSIST', H[1], basket)));
    s = bkReducer(s, { type: 'TAG', side: 'home', payload: { id: basket, fb: true } });
    const ac = assistCard(s, basket);
    assert.equal(ac.assist?.pid, 'h2'); assert.equal(ac.fb, true);
    const f = bk(...START, st(foulAction('away', A[0], 'personal', { fdt: true, drawnBy: H[2] })));
    assert.equal(foulCard(f, lastId(f)).drawnPid, 'h3');
    let b = bk(...START, st(blockAction('home', H[0])));
    const bid = lastId(b);
    assert.equal(blockCard(b, bid).shot, undefined);
    b = bkReducer(b, st(missAction('away', 3, A[1], undefined, bid)));
    assert.equal(blockCard(b, bid).shot?.points, 3);
  });
});

describe('basketball · the screen (source)', () => {
  const src = read('src/sports/basketball/index.tsx');
  test('US-DON-3 / DU14: the assist + fast-break card and the block card are DescribeCards', () => {
    assert.match(src, /import \{ DescribeCard, useDescribeMarks \} from '\.\.\/\.\.\/components\/DescribeCard'/);
    assert.ok((src.match(/<DescribeCard\b/g) ?? []).length >= 3, 'assist, block and fouled cards');
    assert.doesNotMatch(src, /label=\{mates\.length \? 'Skip' : 'Done'\}/, 'the old header Skip/Done is gone');
    assert.doesNotMatch(src, /🛡️ Block — whose shot\?[^\n]*\n[^\n]*<Button label="Skip"/, 'the block header Skip is gone');
  });
  test('DU8: the ⚡ chip tags its basket by id', () => {
    assert.match(src, /tagAction\(/);
    assert.doesNotMatch(src, /dispatch\(\{ type: 'TAG', side: assistFor\.side, payload: \{ fb: !assistFor\.fb \} \}\)/);
  });
  test('DU1 / US-DON-5: "who was fouled?" no longer blocks — no fouled-player step in the foul flow', () => {
    assert.doesNotMatch(src, /who was fouled\? \(\{teamOf\(opp\(flow\.side\)\)\}\)/);
    assert.doesNotMatch(src, /setFlow\(\{ \.\.\.flow, type: c\.type \}\)/, 'the type tap logs the foul');
    assert.match(src, /foulDrawnAction\(/);
  });
  test('DU12: the fouled-player card rides on the free-throw trip and pre-picks the shooter', () => {
    assert.match(src, /foulTrip/);
    assert.match(src, /shooter: p/);
  });
  test('DU9 / DU17: stale cards close from the log; edits open none', () => {
    assert.match(src, /cardStale\(/);
    assert.match(src, /if \(!edit && isFieldGoal/);
  });
});

/* ------------------------------ American football ----------------------------- */

const AFC = { preset: 'nfl', variant: 'tackle', rules: 'nfl', mode: 'pbp', trackTargets: true, trackDefence: true, trackTackles: true };
let au = 0;
const ast = (psec = 10) => ({ uid: `u${++au}`, period: 1, psec, sec: psec, at: 0 });
const W = (id: string) => ({ id });
const afRun = (...as: ScoreAction[]) => as.reduce(afReducer, afInit(AFC));
const kickoff = (): ScoreAction => ({ type: 'PLAY', side: 'home', payload: { play: 'kickoff', newSpot: 25, ...ast(0) } });
const detail = (type: 'TACKLE' | 'PASS_DEF' | 'FORCED_FUMBLE', side: AFSide, id: string, tfl = false): ScoreAction =>
  ({ type, side, payload: { ...ast(), ...(tfl ? { tfl: true } : {}) }, ...afCredit({ type: type === 'TACKLE' ? 'tackle' : type === 'PASS_DEF' ? 'pd' : 'ff', ...(tfl ? { tfl: true } : {}), playerId: id }) });
const AFN = { home: 'Lions', away: 'Bears' };
const afOut = (s: AFState) => JSON.stringify([afTotals(s), afBox(s, {}).data('all'), afCommentary(s, AFN, (id, l) => id ?? l ?? 'P'), afDeepKeys(s)]);

describe('American football · the incompletion is logged at the tap, its target after (DU1, DU7)', () => {
  test('PLAY inc then TARGET equals the old PLAY inc with the receiver: state, totals, box, commentary', async () => {
    const { targetAction } = await afD();
    const s0 = afRun(kickoff());
    const t = ast(20);
    const old = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1'), p2: W('h8'), tgt: true }, t));
    const s1 = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1') }, t));
    assert.equal(s1.events.at(-1)!.tgt, undefined);
    const s2 = afReducer(s1, targetAction('home', t.uid, W('h8')));
    assert.deepEqual(s2, old);
    assert.equal(afOut(s2), afOut(old));
    assert.equal(s2.seq, s1.seq);
  });
  test('null clears it; with every prompt skipped there are no target zeros (DU15)', async () => {
    const { targetAction } = await afD();
    const s0 = afRun(kickoff());
    const t = ast(20);
    const s1 = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1') }, t));
    assert.equal(afDeepKeys(s1).includes('targets'), false);
    const s2 = afReducer(s1, targetAction('home', t.uid, W('h8'), undefined));
    assert.deepEqual(afReducer(s2, targetAction('home', t.uid, null, 'h8')), s1);
  });
  test('DU4: TARGET on a run, a completion, a play wiped out by a penalty, junk: nothing', async () => {
    const { targetAction } = await afD();
    let s = afRun(kickoff());
    const ids: string[] = [];
    for (const inp of [{ play: 'run', p1: W('h2'), yards: 4 }, { play: 'pass', p1: W('h1'), p2: W('h8'), yards: 6 }, { play: 'inc', p1: W('h1'), pen: { foul: 'Holding', on: 'away', yards: 5, enf: 'off' } }] as PlayInput[]) {
      const t = ast(); ids.push(t.uid); s = afReducer(s, afPlay(s, 'home', inp, t));
    }
    for (const id of [...ids, 'nope']) assert.deepEqual(afReducer(s, targetAction('home', id, W('h9'))), s, id);
    const t = ast(); s = afReducer(s, afPlay(s, 'home', { play: 'inc', p1: W('h1') }, t));
    for (const payload of [{ id: t.uid, target: 7 }, { id: t.uid, target: '' }, { target: 'h9' }, { id: 5, target: 'h9' }]) {
      assert.deepEqual(afReducer(s, { type: 'TARGET', side: 'home', payload } as unknown as ScoreAction), s, JSON.stringify(payload));
    }
    assert.deepEqual(afReducer(s, targetAction('home', t.uid, W('h1'))), s, 'the passer is not his own target');
  });
  test('DU3 / DU5: undo drops the target first; Remove of the play reverses the target too', async () => {
    const { targetAction } = await afD();
    const s0 = afRun(kickoff());
    const t = ast(20);
    const s1 = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1') }, t));
    const s2 = afReducer(s1, targetAction('home', t.uid, W('h8')));
    const e = s2.events.at(-1)!;
    const cr = afEventCredits(e);
    assert.equal(cr.second?.stats.targets, 1, 'the removal reverses the target');
    const gone = afReducer(s2, { type: 'REMOVE_EVENT', side: e.side, payload: { id: e.id }, attribution: afAttr(cr.first, -1), attribution2: afAttr(cr.second, -1) });
    assert.equal(gone.events.some((x) => x.id === e.id), false);
    assert.deepEqual(afReducer(gone, targetAction('home', t.uid, W('h8'))), gone, 'a target for a play that is gone');
  });
  test('DU16: Undo names the target', async () => {
    const { targetAction } = await afD();
    const s0 = afRun(kickoff());
    const t = ast(20);
    const s1 = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1') }, t));
    const a = targetAction('home', t.uid, W('h8'));
    assert.equal(afUndoLabel({ type: a.type, prev: s1, next: afReducer(s1, a) }), 'intended receiver');
  });
});

describe('American football · one non-blocking card (DU2, DU9, DU13)', () => {
  test('afCardFor: which questions a play asks, by the toggles', async () => {
    const { afCardFor } = await afD();
    const s = afRun(kickoff());
    const card = (cfg: Record<string, unknown>, inp: PlayInput) => {
      const x = afReducer(afInit({ ...AFC, trackTargets: false, trackDefence: false, trackTackles: false, ...cfg }), kickoff());
      return afCardFor(x, inp, afPlay(x, 'home', inp, ast()));
    };
    assert.deepEqual(card({ trackTargets: true, trackDefence: true }, { play: 'inc', p1: W('h1') }), { target: true, pd: true, ff: false, tackle: false, loss: false });
    assert.deepEqual(card({ trackDefence: true }, { play: 'fumble', p1: W('h2'), p2: W('a3') }), { target: false, pd: false, ff: true, tackle: false, loss: false });
    assert.deepEqual(card({ trackTackles: true, trackDefence: true }, { play: 'run', p1: W('h2'), yards: -3 }), { target: false, pd: false, ff: false, tackle: true, loss: true });
    assert.deepEqual(card({ trackTackles: true }, { play: 'pass', p1: W('h1'), p2: W('h8'), yards: 7 }), { target: false, pd: false, ff: false, tackle: true, loss: false });
    assert.equal(card({}, { play: 'inc', p1: W('h1') }), null, 'nothing tracked');
    assert.equal(card({ trackTackles: true }, { play: 'run', p1: W('h2'), yards: 80 }), null, 'a touchdown is the score, not a card');
    assert.equal(card({ trackTargets: true, trackDefence: true }, { play: 'inc', p1: W('h1'), pen: { foul: 'Holding', on: 'away', yards: 5, enf: 'prev' } }), null, 'wiped out');
    assert.equal(card({ trackTargets: true }, { play: 'inc', p1: W('h1'), p2: W('h8') }), null, 'target already known (voice) and nothing else');
    void s;
  });
  test('afCardDetail / afCardStale read the log: its own breakup / forced fumble / tackle, closed by a newer play', async () => {
    const { afCardDetail, afCardStale } = await afD();
    const s0 = afRun(kickoff());
    const t = ast(20);
    let s = afReducer(s0, afPlay(s0, 'home', { play: 'inc', p1: W('h1') }, t));
    assert.equal(afCardStale(s, t.uid), false);
    s = afReducer(s, detail('PASS_DEF', 'away', 'a4'));
    assert.equal(afCardDetail(s, t.uid).pd?.playerId, 'a4');
    assert.equal(afCardStale(s, t.uid), false, 'its own breakup');
    const n = afReducer(s, afPlay(s, 'home', { play: 'run', p1: W('h2'), yards: 3 }, ast(30)));
    assert.equal(afCardStale(n, t.uid), true, 'a newer play');
    assert.equal(afCardStale(s0, t.uid), true, 'undone');
  });
  test('source: the blocking follow-up flows are gone; one DescribeCard under the pads', () => {
    const src = read('src/sports/american_football/index.tsx');
    for (const m of ["mode: 'tackle'", "mode: 'pd'", "mode: 'ff'", "step: 'target'", "'Pass incomplete — intended for'"]) assert.equal(src.includes(m), false, m);
    assert.match(src, /import \{ DescribeCard, useDescribeMarks \} from '\.\.\/\.\.\/components\/DescribeCard'/);
    assert.match(src, /<DescribeCard\b/);
    assert.match(src, /targetAction\(/);
    assert.match(src, /afCardStale\(/);
    assert.match(src, /afCardFor\(/);
  });
});

/* ----------------------------------- baseball ----------------------------------- */

const ORDER = (p: string) => Array.from({ length: 9 }, (_, i) => ({ id: `${p}${i + 1}` }));
const bsStart = (cfg: Record<string, unknown> = {}) => [
  { type: 'LINEUP', payload: { team: 'home', order: ORDER('h'), pitcher: { id: 'hp' } } },
  { type: 'LINEUP', payload: { team: 'away', order: ORDER('a'), pitcher: { id: 'ap' } } },
].reduce(bsReducer, bsInit({ askFielders: true, ...cfg }));

describe('baseball · Fielders? gets the Done finish (US-DON-3)', () => {
  test('source: the fielders card is a DescribeCard, no small header Skip/Done link', () => {
    const src = read('src/sports/baseball/index.tsx');
    assert.match(src, /import \{ DescribeCard, useDescribeMarks \} from '\.\.\/\.\.\/components\/DescribeCard'/);
    assert.match(src, /<DescribeCard\b/);
    assert.doesNotMatch(src, /\{fieldFor\.fielders \? 'Done' : 'Skip'\}/);
    assert.match(src, /fieldersStale\(/);
  });
  test('DU3 / DU9: fieldersStale — the out is gone, or a newer play is on the board', async () => {
    const { fieldersStale } = await bsD();
    let s = bsStart();
    const a = bsPlay(s, 'GO', { uid: 'go1' });
    s = bsReducer(s, a);
    assert.equal(fieldersStale(s, 'go1'), false);
    s = bsReducer(s, fieldersAction('go1', '6-3'));
    assert.equal(fieldersStale(s, 'go1'), false, 'its own note');
    assert.equal(fieldersStale(bsReducer(s, bsPlay(s, '1B', { uid: 'x' })), 'go1'), true);
    assert.equal(fieldersStale(bsStart(), 'go1'), true);
  });
  test('DU6: fielders inside the play (the advance sheet / old logs) equal the play + FIELDERS', () => {
    const s0 = bsStart();
    const old = bsReducer(s0, bsPlay(s0, 'GO', { uid: 'g', fielders: '6-3' }));
    const neu = bsReducer(bsReducer(s0, bsPlay(s0, 'GO', { uid: 'g' })), fieldersAction('g', '6-3'));
    assert.deepEqual(neu, old);
    assert.deepEqual(baseballTotals(neu), baseballTotals(old));
  });
});

/* --------------------------- 600-scorer simulation --------------------------- */

// mulberry32 — a seeded generator, so a failure replays
let seed = 20261108;
const rnd = (n: number) => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const pick = <T,>(xs: T[]): T => xs[rnd(xs.length)];
const SCORERS = 600;

describe(`sim · ${SCORERS} scorers per sport: plays on the tap, detail later or never, undos`, () => {
  test('basketball: score always right; state, stats, box, commentary equal the old one-step flow', async () => {
    const { foulDrawnAction, tagAction } = await bkD();
    let attached = 0, never = 0, undone = 0, rejected = 0;
    for (let g = 0; g < SCORERS; g++) {
      // a play = its old one-step actions and its new actions (play first, detail after)
      type Play = { old: ScoreAction[]; play: ScoreAction[]; detail: ScoreAction[] };
      const plays: Play[] = [];
      const oldLog = () => [...START, ...plays.flatMap((p) => p.old)];
      const newLog = () => [...START, ...plays.flatMap((p) => [...p.play, ...p.detail])];
      let cur = bk(...newLog());
      const push = (p: Play) => { plays.push(p); cur = [...p.play, ...p.detail].reduce(bkReducer, cur); };
      for (let i = 0; i < 50; i++) {
        if (cur.ended) break;
        const r = rnd(10);
        const side: Side = rnd(2) ? 'home' : 'away';
        const mine = side === 'home' ? H : A, theirs = side === 'home' ? A : H;
        const out = (p: Player, sd: Side) => cur.events.filter((e) => e.type === 'foul' && e.side === sd && e.pid === p.id).length >= 5;
        if (r < 4) {
          const scorer = pick(mine);
          const pts = rnd(2) ? 2 : 3;
          const make = st(scoreAction(side, pts, scorer, { fga: true, fbt: true }), 10 * i);
          const after = bkReducer(cur, make);
          if (after === cur) { rejected++; continue; }
          const id = lastId(after);
          const mate = rnd(3) ? pick(mine.filter((p) => p.id !== scorer.id && !out(p, side))) : undefined;
          const fb = rnd(3) === 0;
          const ast = mate ? [st(statAction(side, 'ASSIST', mate, id), 10 * i)] : [];
          const tagOld = fb ? [{ type: 'TAG', side, payload: { fb: true } } as ScoreAction] : [];
          const tagNew = fb ? [tagAction(side, id, true)] : [];
          push({ old: [make, ...tagOld, ...ast], play: [make], detail: [...ast, ...tagNew] });
          if (mate || fb) attached++; else never++;
        } else if (r < 7) {
          const fouler = pick(mine);
          const type = rnd(2) ? 'shooting' : 'personal';
          const drawn = rnd(3) ? pick(theirs.filter((p) => !out(p, side === 'home' ? 'away' : 'home'))) : undefined;
          const opp: Side = side === 'home' ? 'away' : 'home';
          const fts = type === 'shooting' ? [st(freeThrowAction(opp, rnd(2) === 1, drawn ?? pick(theirs)), 10 * i + 1), st(freeThrowAction(opp, rnd(2) === 1, drawn ?? pick(theirs)), 10 * i + 2)] : [];
          const oldFoul = st(foulAction(side, fouler, type, { fdt: true, drawnBy: drawn }), 10 * i);
          const newFoul = st(foulAction(side, fouler, type, { fdt: true }), 10 * i);
          const after = bkReducer(cur, newFoul);
          if (after === cur) { rejected++; push({ old: [oldFoul, ...fts], play: [newFoul, ...fts], detail: [] }); continue; }
          const d = drawn ? [foulDrawnAction(side, lastId(after), drawn)] : [];
          // the pick comes during the free throws (pre-picks the shooter) or after them
          if (rnd(2)) push({ old: [oldFoul, ...fts], play: [newFoul, ...d, ...fts], detail: [] });
          else push({ old: [oldFoul, ...fts], play: [newFoul, ...fts], detail: d });
          if (drawn) attached++; else never++;
        } else if (r < 9) {
          const a = st(missAction(side, rnd(2) ? 2 : 3, pick(mine)), 10 * i);
          const reb = st(reboundAction(side, pick(mine), 'off'), 10 * i + 1);
          push({ old: [a, reb], play: [a, reb], detail: [] });
        } else if (plays.length) {
          // undo: the scorer taps Undo once (newest action), or until the play is gone
          const last = plays[plays.length - 1];
          if (last.detail.length && rnd(2)) {
            last.detail.pop();
            // the old flow's equivalent: the same play without that detail
            last.old = rebuildOld(last);
          } else plays.pop();
          undone++;
          cur = bk(...newLog());
        }
        const n = cur;
        assert.equal(n.home, n.events.filter((e) => e.side === 'home').reduce((t, e) => t + pointsOf(e), 0), `g${g} home score`);
        assert.equal(n.away, n.events.filter((e) => e.side === 'away').reduce((t, e) => t + pointsOf(e), 0), `g${g} away score`);
        if (i % 10 === 9) assert.deepEqual(n, bk(...oldLog()), `g${g} i${i} state`);
      }
      const o = bk(...oldLog()), n = bk(...newLog());
      assert.deepEqual(n, o, `g${g} state`);
      assert.deepEqual(basketballStatTotals(n), basketballStatTotals(o), `g${g} totals`);
      if (g % 20 === 0) { assert.equal(box(n), box(o), `g${g} box`); assert.equal(feed(n), feed(o), `g${g} feed`); }
      // DU15: no fouls drawn named → no fouls-drawn column
      if (!n.events.some((e) => e.type === 'foul' && e.drawnPid)) assert.equal(bbDeepKeys(n).includes('foulsDrawn'), false);
      if (!n.events.some((e) => e.type === 'score' && e.fb)) assert.equal(bbDeepKeys(n).includes('fastBreakPoints'), false);
    }
    assert.ok(attached > 1000 && never > 500 && undone > 300, `coverage ${attached}/${never}/${undone}/${rejected}`);
    /** the old one-step actions for a play whose new detail list changed (undo of one detail) */
    function rebuildOld(p: { old: ScoreAction[]; play: ScoreAction[]; detail: ScoreAction[] }): ScoreAction[] {
      const head = p.play[0];
      if (head.type === 'SCORE') {
        const ast = p.detail.filter((a) => a.type === 'ASSIST');
        const tag = p.detail.some((a) => a.type === 'TAG') ? [{ type: 'TAG', side: head.side, payload: { fb: true } } as ScoreAction] : [];
        return [head, ...tag, ...ast];
      }
      // a foul: its detail undone → the old foul with nobody named (the new foul has none)
      return p.play;
    }
  });

  test('American football: score always right; state, totals, box, commentary equal the old flow', async () => {
    const { targetAction, afCardFor } = await afD();
    const HP = ['h1', 'h2', 'h3', 'h8', 'h9'], AP = ['a1', 'a2', 'a3', 'a4', 'a5'];
    let attached = 0, never = 0, undone = 0, cards = 0;
    for (let g = 0; g < SCORERS; g++) {
      type Play = { old: ScoreAction[]; play: ScoreAction[]; detail: ScoreAction[]; target?: { uid: string; side: AFSide; to: string } };
      const plays: Play[] = [];
      const base = [kickoff()];
      const oldLog = () => [...base, ...plays.flatMap((p) => p.old)];
      const newLog = () => [...base, ...plays.flatMap((p) => [...p.play, ...p.detail])];
      for (let i = 0; i < 40; i++) {
        const cur = afRun(...newLog());
        if (cur.ended || !cur.drive) break;
        const side = cur.drive.off;
        const def: AFSide = side === 'home' ? 'away' : 'home';
        const mine = side === 'home' ? HP : AP, theirs = side === 'home' ? AP : HP;
        const r = rnd(10);
        if (r < 8) {
          const kind = pick(['run', 'pass', 'inc', 'inc', 'fumble'] as const);
          const inp: PlayInput = kind === 'run' ? { play: 'run', p1: W(pick(mine)), yards: rnd(20) - 4 }
            : kind === 'pass' ? { play: 'pass', p1: W(mine[0]), p2: W(pick(mine.slice(1))), yards: rnd(25) - 2, tgt: true }
              : kind === 'inc' ? { play: 'inc', p1: W(mine[0]) }
                : { play: 'fumble', p1: W(pick(mine)), p2: W(pick(theirs)) };
          const t = ast(i * 20);
          const a = afPlay(cur, side, inp, t);
          const card = afCardFor(cur, inp, a);
          const det: ScoreAction[] = [];
          let oldPlay = a, target: Play['target'];
          if (card) {
            cards++;
            if (card.target && rnd(2)) {
              const to = pick(mine.slice(1));
              det.push(targetAction(side, t.uid, W(to)));
              oldPlay = afPlay(cur, side, { ...inp, p2: W(to), tgt: true }, t);
              target = { uid: t.uid, side, to };
            }
            if (card.pd && rnd(2)) det.push(detail('PASS_DEF', def, pick(theirs)));
            if (card.ff && rnd(2)) det.push(detail('FORCED_FUMBLE', def, pick(theirs)));
            if (card.tackle && rnd(2)) det.push(detail('TACKLE', def, pick(theirs), card.loss));
            if (det.length) attached++; else never++;
          }
          const later = det.filter((x) => x.type !== 'TARGET');
          plays.push({ old: [oldPlay, ...later], play: [a], detail: det, target });
        } else if (plays.length) {
          const last = plays[plays.length - 1];
          if (last.detail.length && rnd(2)) {
            const gone = last.detail.pop()!;
            if (gone.type === 'TARGET') { last.old[0] = last.play[0]; last.target = undefined; }
            else last.old = last.old.filter((x) => x !== gone);
          } else plays.pop();
          undone++;
        }
        const n = afRun(...newLog());
        assert.equal(n.home + n.away, n.events.reduce((t, e) => t + afPointsOf(e), 0), `g${g} score`);
      }
      const o = afRun(...oldLog()), n = afRun(...newLog());
      assert.deepEqual(n, o, `g${g} state`);
      if (g % 10 === 0) assert.equal(afOut(n), afOut(o), `g${g} outputs`);
      else assert.deepEqual(afTotals(n), afTotals(o), `g${g} totals`);
      // DU15: a column only once its kind was captured
      for (const [k, ty] of [['passDef', 'pd'], ['tackles', 'tackle']] as const) {
        if (!n.events.some((e) => e.type === ty)) for (const l of Object.values(afTotals(n))) assert.equal(k in l.stats, false, `g${g} ${k}`);
      }
    }
    assert.ok(cards > 5000 && attached > 2000 && never > 1000 && undone > 1000, `coverage ${cards}/${attached}/${never}/${undone}`);
  });

  test('baseball: fielders later or never, undos; old inside-the-play notes replay identically', async () => {
    const { fieldersStale } = await bsD();
    const OUT: Outcome[] = ['GO', 'FO', 'LO', 'GO', '1B', 'K', 'BB', '2B'];
    const NOTE = ['6-3', '4-3', '8', '5-3', '6-4-3', 'F9'];
    let noted = 0, undone = 0;
    for (let g = 0; g < SCORERS; g++) {
      type Play = { old: ScoreAction; play: ScoreAction; detail: ScoreAction[] };
      const plays: Play[] = [];
      const run = (as: ScoreAction[]) => as.reduce(bsReducer, bsStart());
      const oldLog = () => plays.map((p) => p.old);
      const newLog = () => plays.flatMap((p) => [p.play, ...p.detail]);
      for (let i = 0; i < 40; i++) {
        const cur: BaseballState = run(newLog());
        if (cur.g.ended) break;
        if (rnd(8) || !plays.length) {
          const o = pick(OUT);
          const uid = `g${g}p${i}`;
          const play = bsPlay(cur, o, { uid });
          const fielded = ['GO', 'FO', 'LO'].includes(o);
          const note = fielded && rnd(2) ? pick(NOTE) : '';
          const after = bsReducer(cur, play);
          assert.equal(fieldersStale(after, uid), false);
          plays.push({ old: note ? bsPlay(cur, o, { uid, fielders: note }) : play, play, detail: note ? [fieldersAction(uid, note)] : [] });
          if (note) noted++;
        } else {
          const last = plays[plays.length - 1];
          if (last.detail.length && rnd(2)) { last.detail = []; last.old = last.play; } else plays.pop();
          undone++;
        }
      }
      const o = run(oldLog()), n = run(newLog());
      assert.deepEqual(n, o, `g${g} state`);
      assert.deepEqual(n.g.score, o.g.score);
      if (g % 10 === 0) assert.deepEqual(baseballTotals(n), baseballTotals(o), `g${g} totals`);
    }
    assert.ok(noted > 2000 && undone > 1000, `coverage ${noted}/${undone}`);
  });
});
