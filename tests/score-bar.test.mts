/** Shared score bar + live highlight (docs/security/breaks/score-bar.md). */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreBarRows, inPlayText, changedSide, lastAction, dueText } from '../src/core/scoreBar.ts';
import { servingInPlay, topPressure } from '../src/sports/inPlaySets.ts';
import { footballInPlay } from '../src/sports/football/inPlay.ts';
import { cricketInPlay } from '../src/sports/cricket/inPlay.ts';
import * as TN from '../src/sports/tennis/engine.ts';
import * as FB from '../src/sports/football/engine.ts';
import { cueInPlay, poolInPlay } from '../src/sports/cue/inPlay.ts';
import { badmintonInPlay } from '../src/sports/badminton/inPlay.ts';
import * as SN from '../src/sports/snooker/engine.ts';
import * as BD from '../src/sports/badminton/engine.ts';
import * as M from '../src/sports/pool/match.ts';
import { withDoubles } from '../src/sports/cue/doubles.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const A1 = 'a1a1a1a1-0000-4000-8000-000000000001', A2 = 'a2a2a2a2-0000-4000-8000-000000000002';
const B1 = 'b1b1b1b1-0000-4000-8000-000000000003', B2 = 'b2b2b2b2-0000-4000-8000-000000000004';
const R = { home: [A1, A2], away: [B1, B2] };
const NAMES: Record<string, string> = { [A1]: 'Aarav', [A2]: 'Rohan Nair', [B1]: 'Rohan Pai', [B2]: 'Rohan Bhatt' };
const nameOf = (id: string) => NAMES[id];
const sum = { homeScore: '3', awayScore: '1', statusLine: 'Frame 1' };

describe('the bar', () => {
  test('two rows, names in ink, the in-play side marked with who', () => {
    const rows = scoreBarRows(sum, { home: 'Aarav / Rohan', away: 'Rohan P / Rohan B' }, { side: 'home', playerId: A2, verb: 'at the table' }, nameOf);
    assert.deepEqual(rows.map((r) => [r.side, r.name, r.score, r.active]), [['home', 'Aarav / Rohan', '3', true], ['away', 'Rohan P / Rohan B', '1', false]]);
    assert.equal(rows[0].who, 'Rohan Nair at the table');
    assert.equal(rows[1].who, null);
  });
  test('SB2/SB3: no player → the side; nothing in play → no highlight', () => {
    assert.equal(inPlayText({ side: 'away', verb: 'serving' }, { home: 'Red', away: 'Green' }, nameOf), 'Green serving');
    assert.equal(inPlayText({ side: 'away', playerId: 'stranger', verb: 'serving' }, { home: 'Red', away: 'Green' }, nameOf), 'Green serving');
    assert.equal(inPlayText(null, { home: 'Red', away: 'Green' }, nameOf), null);
    assert.ok(scoreBarRows(sum, { home: 'Red', away: 'Green' }, null, nameOf).every((r) => !r.active));
    assert.equal(scoreBarRows(sum, { home: 'Red', away: 'Green' }, { side: 'away', verb: 'on the ball' }, nameOf)[1].who, 'On the ball', 'no repeat of the name');
  });
  test('SB6: flash only the side whose score changed', () => {
    assert.equal(changedSide(null, { home: '0', away: '0' }), null);
    assert.equal(changedSide({ home: '0', away: '0' }, { home: '1', away: '0' }), 'home');
    assert.equal(changedSide({ home: '1', away: '0' }, { home: '1', away: '0' }), null);
    assert.equal(changedSide({ home: '1', away: '0' }, { home: '0', away: '0' }), 'home', 'an undo flashes too');
  });
  test('the last action line drops "Undo:"', () => {
    assert.equal(lastAction('Undo: red · break 1'), 'red · break 1');
    assert.equal(lastAction(null), null);
    assert.equal(lastAction(''), null);
  });
});

describe('who is in play, per sport (real engines)', () => {
  const sn = withDoubles(SN.createInitialState, SN.reducer as any);
  test('snooker doubles: the striker side, partners alternate visits', () => {
    let s: any = sn.init({ playersPerSide: 2 });
    assert.deepEqual(cueInPlay(s, R), { side: 'home', playerId: A1, verb: 'at the table' });
    s = sn.reduce(s, { type: 'MISS', side: 'home', payload: { pid: A1 } });
    assert.equal(cueInPlay(s, R)!.side, 'away');
    s = sn.reduce(s, { type: 'MISS', side: 'away', payload: { pid: B1 } });
    assert.deepEqual(cueInPlay(s, R), { side: 'home', playerId: A2, verb: 'at the table' }, 'the partner is next');
  });
  test('snooker singles: the side only, its one player', () => {
    const s: any = sn.init({});
    assert.deepEqual(cueInPlay(s, { home: [A1], away: [B1] }), { side: 'home', playerId: A1, verb: 'at the table' });
  });
  test('pool doubles: breaker first, then the rotation', () => {
    let s: any = M.poolInit({ playersPerSide: 2 });
    assert.equal(poolInPlay(s, R), null, 'SB3: no breaker before the lag');
    s = M.poolReducer(s, { type: 'LAG', side: 'home' } as any);
    const p = poolInPlay(s, R)!;
    assert.equal(p.side, 'home');
    assert.equal(p.verb, 'to break');
    assert.ok(R.home.includes(p.playerId!));
  });
  test('badminton: nothing before the toss; then the serving side', () => {
    let s: any = BD.init({});
    assert.equal(badmintonInPlay(s, { home: [A1], away: [B1] }), null, 'SB3');
    s = BD.reducer(s, { type: 'SET_FIRST_SERVER', payload: { side: 'away' } } as any);
    const p = badmintonInPlay(s, { home: [A1], away: [B1] });
    assert.equal(p?.side, 'away');
    assert.equal(p?.verb, 'serving');
    assert.equal(p?.playerId, B1, 'singles: their one player');
  });
  test('SB1: junk states never throw', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { frame: { striker: 'nobody' } }, { rack: 'x' }, { ended: true, frame: { striker: 'home' } }]) {
      assert.doesNotThrow(() => { cueInPlay(junk, R); poolInPlay(junk, R); badmintonInPlay(junk as any, R); });
    }
    assert.equal(cueInPlay({ ended: true, frame: { striker: 'home' } }, R), null, 'SB3: match over');
  });
});

describe('step 1b: serving sports, football, due notes', () => {
  test('due note names the side when it has one', () => {
    assert.equal(dueText({ side: 'home', verb: 'serving', due: { side: 'away', text: 'MATCH POINT' } }, { home: 'Red', away: 'Green' }), 'MATCH POINT · Green');
    assert.equal(dueText({ side: 'home', verb: '', due: { text: 'Added time due' } }, { home: 'Red', away: 'Green' }), 'Added time due');
    assert.equal(dueText(null, { home: 'Red', away: 'Green' }), null);
    assert.ok(scoreBarRows(sum, { home: 'Red', away: 'Green' }, { side: 'home', verb: '' }, nameOf).every((r) => !r.active), 'no verb → no band');
  });
  test('cricket: the batting side; the striker only if on that side', () => {
    assert.deepEqual(cricketInPlay({ battingSide: 'away', strikerId: B1 }, R), { side: 'away', playerId: B1, verb: 'on strike' });
    assert.deepEqual(cricketInPlay({ battingSide: 'away', strikerId: A1 }, R), { side: 'away', playerId: null, verb: 'batting' }, 'SB2');
    assert.equal(cricketInPlay({ battingSide: 'away', ended: true }, R), null);
  });
  test('match point beats game point', () => {
    assert.equal(topPressure([{ side: 'home', kind: 'GAME POINT' }, { side: 'away', kind: 'MATCH POINT' }])!.kind, 'MATCH POINT');
    assert.equal(topPressure([]), null);
  });
  test('tennis: nothing before the toss, then the server (singles names them)', () => {
    const serving = (x: any) => (!x.serverPicked && x.events.length === 0 ? null : TN.serveInfo(x).side);
    let s: any = TN.init({});
    assert.equal(servingInPlay(s, { home: [A1], away: [B1] }, serving, TN.reducer as any), null);
    s = TN.reducer(s, { type: 'SET_FIRST_SERVER', payload: { side: 'home' } } as any);
    const p = servingInPlay(s, { home: [A1], away: [B1] }, serving, TN.reducer as any)!;
    assert.equal(p.side, 'home');
    assert.equal(p.playerId, A1);
  });
  test('football: added time due near the end of a half', () => {
    const s: any = FB.init({});
    assert.doesNotThrow(() => footballInPlay(s));
    const late = { ...s, startedAt: Date.now() - 44 * 60_000, clockRunning: true };
    const p = footballInPlay(late as any);
    if (p?.due) assert.match(p.due.text, /Added time/);
    assert.equal(footballInPlay({ ...s, ended: true } as any), null);
  });
});

describe('wiring', () => {
  test('the scoring tab uses the shared bar; plugins expose inPlay', () => {
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /<LiveScoreBar/);
    for (const f of ['pool', 'snooker', 'billiards', 'badminton', 'tennis', 'padel', 'volleyball', 'football', 'cricket']) assert.match(read(`src/sports/${f}/index.tsx`), /inPlay:/, f);
    assert.match(read('src/sports/types.ts'), /inPlay\?:/);
    assert.match(read('src/sports/rallyCore.tsx'), /inPlay:/, 'table tennis, squash, pickleball');
  });
});
