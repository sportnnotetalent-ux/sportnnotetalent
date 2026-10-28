/**
 * Cue sports — the four usability follow-ups from the guide review (founder
 * approved 2026-10-28):
 *   (a) pool's setup says "Scotch doubles", not "Doubles";
 *   (b) a pool foul is picked first and recorded with its own button;
 *   (c) the live "Correct a finished frame" link waits for a finished frame;
 *   (d) snooker and billiards say when the toss wasn't recorded.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { structureLabels } from '../src/sports/structureLabels.ts';
import { POOL_META } from '../src/sports/pool/meta.ts';
import { TENNIS_META } from '../src/sports/tennis/meta.ts';
import { PADEL_META } from '../src/sports/padel/meta.ts';
import * as S from '../src/sports/snooker/engine.ts';
import * as B from '../src/sports/billiards/engine.ts';
import { snookerPanel } from '../src/sports/snooker/controls.ts';
import { billiardsPanel } from '../src/sports/billiards/controls.ts';
import { hasFinishedFrame, tossNote } from '../src/sports/cue/uiState.ts';

const read = (p: string) => readFileSync(join(import.meta.dirname, '..', p), 'utf8');
const NAMES = { home: 'Asha', away: 'Ravi' };

describe('(a) the setup chips use the sport\'s own words', () => {
  test('pool: Singles / Scotch doubles; the racket sports keep Doubles', () => {
    assert.deepEqual(structureLabels(POOL_META), { one: 'Singles', two: 'Scotch doubles' });
    assert.deepEqual(structureLabels(TENNIS_META), { one: 'Singles', two: 'Doubles' });
    assert.deepEqual(structureLabels(PADEL_META), { one: 'Singles', two: 'Doubles' });
    assert.deepEqual(structureLabels(undefined), { one: 'Singles', two: 'Doubles' }, 'a sport since removed');
  });
  test('the match setup reads them', () => {
    const src = read('src/screens/ScheduleMatchScreen.tsx');
    assert.match(src, /structureLabels\(getSportMeta\(sport\)\)/);
    assert.doesNotMatch(src, /label="👥 Doubles"/);
    assert.match(read('src/screens/CreateTournamentScreen.tsx'), /structureLabels\(getSportMeta\(s\)\)\.two/, 'and the tournament setup');
  });
});

describe('(b) a pool foul: pick the kind, then record it', () => {
  const src = read('src/sports/pool/index.tsx');
  test('a foul chip only picks; the Record button sends', () => {
    assert.doesNotMatch(src, /<SelectChip[^>]*onPress=\{\(\) => void send\(foulAction/, 'a play-foul chip sends on the first tap');
    assert.doesNotMatch(src, /<SelectChip[^>]*onPress=\{\(\) => void send\(breakAction/, 'a break-foul chip sends on the first tap');
    assert.match(src, /active=\{foulKind === k\}/);
    assert.match(src, /label=\{foulKind \? `Record foul · \$\{FOUL_LABEL\[foulKind\]\}` : 'Pick the foul'\}/);
    assert.match(src, /label=\{foulKind \? `Record foul on the break · \$\{FOUL_LABEL\[foulKind\]\}` : 'Pick the foul'\}/);
  });
  test('the pick clears when the match moves', () => {
    assert.match(src, /setFoulKind\(null\)/);
  });
  test('break-it: "played out of turn" is not a chip under "Foul by <the player at the table>" (it would charge the wrong player); its own button stays', async () => {
    const C = await import('../src/sports/pool/controls.ts');
    assert.ok(!C.PLAY_FOULS.includes('outOfTurn'));
    assert.match(src, /foulAction\(s, 'outOfTurn', \{ by: other\(sh\) \}, opts\(other\(sh\)\)\)/);
  });
});

describe('(c) the live correction link waits for a finished frame', () => {
  test('hasFinishedFrame', () => {
    assert.equal(hasFinishedFrame(S.createInitialState()), false);
    const one = B.createInitialState({ format: 'points', target: 100, bestOf: 1 });
    assert.equal(hasFinishedFrame(B.reducer(one, { type: 'SCORE', payload: { potRed: true } } as never)), false, 'a one-game match in play has nothing to correct');
    const s = S.reducer(S.createInitialState({ bestOf: 3 }), { type: 'CONCEDE', side: 'away', payload: { frame: 1 } } as never);
    assert.equal(hasFinishedFrame(s), true);
    for (const junk of [null, undefined, 7, {}, { frames: '__proto__' }]) assert.equal(hasFinishedFrame(junk), false);
  });
  test('the plugins and the live screen use it', () => {
    assert.match(read('src/sports/types.ts'), /liveCorrection\?: \(state: S\) => boolean;/);
    assert.match(read('src/screens/LiveScoringScreen.tsx'), /\(plugin\.liveCorrection\?\.\(state\) \?\? true\)/);
    for (const f of ['src/sports/snooker/index.tsx', 'src/sports/billiards/index.tsx']) assert.match(read(f), /liveCorrection: hasFinishedFrame,/, f);
  });
});

describe('(d) the toss: recorded or not', () => {
  for (const [name, E, panel] of [['snooker', S, snookerPanel], ['billiards', B, billiardsPanel]] as const) {
    test(`${name}: tapping who won the toss records it, even the player set to break; a second tap changes nothing`, () => {
      const s0 = (E.createInitialState as (c?: unknown) => never)();
      assert.equal(E.tossRecorded(s0), false);
      assert.equal((panel as (s: never) => { tossed: boolean } | null)(s0)!.tossed, false);
      assert.ok((panel as (s: never) => { toss: { home: unknown } | null } | null)(s0)!.toss!.home, 'the player already set to break can be tapped');
      const s1 = (E.reducer as (s: never, a: unknown) => never)(s0, { type: 'BREAK_OFF', side: 'home', payload: { side: 'home', frame: 1 } });
      assert.equal(E.tossRecorded(s1), true);
      assert.equal((s1 as { seq: number }).seq, 1);
      assert.equal((panel as (s: never) => { tossed: boolean } | null)(s1)!.tossed, true);
      assert.equal((E.reducer as (s: never, a: unknown) => never)(s1, { type: 'BREAK_OFF', side: 'home', payload: { side: 'home', frame: 1 } }), s1, 'B-15: a duplicate tap');
      const s2 = (E.reducer as (s: never, a: unknown) => never)(s0, { type: 'BREAK_OFF', side: 'away', payload: { side: 'away', frame: 1 } });
      assert.equal(E.tossRecorded(s2), true);
      assert.equal((s2 as { firstBreak: string }).firstBreak, 'away');
      assert.equal(E.tossRecorded(null as never), false);
    });
  }
  test('tossNote: what the frame sheet says when nobody tapped the toss', () => {
    const s0 = S.createInitialState();
    assert.equal(tossNote(s0, NAMES), 'Toss not recorded: Asha was set to break off first.');
    const away = S.createInitialState({ firstBreak: 'away' });
    assert.match(tossNote(away, NAMES) ?? '', /Ravi was set/);
    const s1 = S.reducer(s0, { type: 'BREAK_OFF', side: 'home', payload: { side: 'home', frame: 1 } } as never);
    assert.equal(tossNote(s1, NAMES), null);
    for (const junk of [null, 7, { firstBreak: '__proto__' }]) assert.equal(tossNote(junk, NAMES), null);
  });
  test('the screens: the toss row marks nobody until the toss is tapped; the frame sheet shows the note', () => {
    const parts = read('src/sports/cue/parts.tsx');
    assert.match(parts, /recorded/);
    assert.match(parts, /Not recorded yet/);
    assert.match(parts, /note\?: string \| null/);
    for (const f of ['src/sports/snooker/index.tsx', 'src/sports/billiards/index.tsx']) {
      const src = read(f);
      assert.match(src, /recorded=\{p\.tossed\}/, f);
      assert.match(src, /note=\{tossNote\(s, names\)\}/, f);
    }
  });
});
