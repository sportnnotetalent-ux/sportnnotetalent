/**
 * Snooker's match tabs and records — the PURE builders behind the screen:
 *  - feed.ts: the commentary, visit by visit, newest first, grouped by frame,
 *    with the running frame score after each line;
 *  - matchStats.ts: the CompareTable categories (match or one frame), the
 *    frame-by-frame sheet and the break list;
 *  - records.ts: the match's record candidates (highest break, centuries,
 *    maximums, biggest frame win);
 *  - undo.ts: what Undo removes;
 *  - box.ts: the box source (team figures per frame).
 * Names come from the caller (ids-only scoring: the state holds sides).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { snookerScript } from './cue-script.mts';
import * as S from '../src/sports/snooker/engine.ts';
import { snookerFeed } from '../src/sports/snooker/feed.ts';
import { snookerMatchStats, snookerFrameNumbers, frameSheet, breakList, BREAK_LIST_MIN } from '../src/sports/snooker/matchStats.ts';
import { snookerMatchRecords } from '../src/sports/snooker/records.ts';
import { snookerUndoLabel } from '../src/sports/snooker/undo.ts';
import { snookerBox } from '../src/sports/snooker/box.ts';

const NAMES = { home: 'Asha', away: 'Ravi' };

/** best of 3: frame 1 shot by shot (fouls, a 54), frame 2 a century, conceded */
function match() {
  const m = snookerScript({ bestOf: 3 });
  m.pot('red', 'black', 'red', 'pink').miss(); // Asha 15
  m.safety(); // Ravi
  m.foul({ value: 4, kind: 'inOff', miss: true }); // Asha fouls: 4 to Ravi
  m.playAgain(); // Ravi makes Asha play again
  m.foul({ value: 5, byOther: true }); // Ravi (not at the table) penalised: 5 to Asha
  m.safety(); // Asha
  // Ravi: 54
  m.pot('red', 'black', 'red', 'black', 'red', 'black', 'red', 'black', 'red', 'black', 'red', 'black', 'red', 'blue').miss();
  m.concede('home'); // Ravi wins frame 1, 58-20
  // frame 2: Ravi breaks; Ravi misses, Asha makes 104 then concession
  m.miss();
  for (let k = 0; k < 13; k++) m.pot('red', 'black'); // Asha 104
  m.concede('away');
  return m;
}

describe('commentary', () => {
  test('newest frame first, newest visit first, with the running score', () => {
    const s = match().state;
    const g = snookerFeed(s, NAMES);
    assert.deepEqual(g.map((x) => x.title), ['Frame 3', 'Frame 2', 'Frame 1']);
    assert.equal(g[0].items.length, 0); // frame 3 not started
    const f1 = g[2];
    assert.match(f1.subtitle!, /Ravi won 58–20/);
    const texts = f1.items.map((i) => i.text);
    assert.match(texts[0], /Frame 1 to Ravi, 58–20 · Asha conceded/);
    assert.match(texts[1], /Ravi — break of 54/);
    assert.ok(texts.some((t) => /Ravi penalised while not at the table: 5 to Asha/.test(t)));
    assert.ok(texts.some((t) => /Asha fouled \(in-off.*\): 4 to Ravi · foul and a miss/i.test(t)));
    // cue batch 6: a break line carries its make-up
    assert.equal(texts[texts.length - 1], 'Asha — break of 15 (2 reds, 1 pink, 1 black), then missed a pot');
    assert.equal(f1.items[f1.items.length - 1].score, 'Asha leads 15–0');
    assert.equal(f1.items[1].score, 'Ravi leads 58–20');
    const f2 = g[1];
    assert.ok(f2.items.some((i) => i.big && /break of 104/.test(i.text)));
    // no name of the players beyond the ones given; nothing for a stranger
    assert.ok(!JSON.stringify(g).includes('undefined'));
  });

  test('a live visit, quick frames, a re-spotted black, a re-rack', () => {
    const m = snookerScript({ reds: 6, bestOf: 3 }).quick(60, 12);
    m.pot('red', 'black'); // Ravi at the table (frame 2: Ravi breaks)
    let g = snookerFeed(m.state, NAMES);
    assert.match(g[0].items[0].text, /Ravi at the table — break of 8 so far/);
    assert.match(g[0].subtitle!, /In play · Asha 0–8 Ravi/);
    assert.deepEqual(g[1].items.map((i) => i.text), ['Frame 1 to Asha, 60–12 · score only']);
    m.rerack();
    g = snookerFeed(m.state, NAMES);
    assert.match(g[0].subtitle!, /re-racked once/);
    assert.equal(g[0].items.length, 0);
  });

  test('hostile states give no groups and never throw', () => {
    for (const bad of [null, {}, { frames: 7 }, { sport: 'snooker', frames: [null, { n: 1, score: [1] }, { n: 2, score: [3, 1], winner: 'home', visits: [{ side: '__proto__', pts: 1 }], fouls: [{ by: 'x' }] }] }]) {
      assert.doesNotThrow(() => snookerFeed(bad as never, NAMES));
    }
  });
});

describe('match stats, frame sheet, break list', () => {
  test('match categories, one frame, quick frames', () => {
    const s = match().state;
    assert.deepEqual(snookerFrameNumbers(s), [1, 2, 3]);
    const cats = snookerMatchStats(s);
    const row = (id: string, key: string) => cats.find((c) => c.id === id)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('frames', 'framesWon').home, row('frames', 'framesWon').away], ['1', '1']);
    assert.deepEqual([row('breaks', 'highest').home, row('breaks', 'highest').away], ['104', '54']);
    assert.deepEqual([row('breaks', 'centuries').home, row('breaks', 'centuries').away], ['1', '0']);
    assert.equal(row('potting', 'potSuccess').home, '30/31 (97%)');
    assert.equal(row('fouls', 'fouls').home, '1');
    assert.equal(row('fouls', 'foulMisses').home, '1');
    const f1 = snookerMatchStats(s, 1);
    assert.equal(f1.find((c) => c.id === 'frames'), undefined); // one frame: no frames-won row
    assert.equal(f1.find((c) => c.id === 'breaks')!.rows.find((r) => r.key === 'highest')!.home, '15');
    const q = snookerScript({ bestOf: 3 }).quick(70, 40).state;
    assert.deepEqual(snookerMatchStats(q).map((c) => c.id), ['frames']);
  });

  test('the frame sheet and the break list', () => {
    const s = match().state;
    const sheet = frameSheet(s);
    assert.deepEqual(sheet.map((r) => [r.n, r.winner, r.score, r.how]), [[1, 'away', [20, 58], 'conceded'], [2, 'home', [104, 0], 'conceded'], [3, null, [0, 0], 'in play']]);
    assert.deepEqual(sheet[0].high, { home: 15, away: 54 });
    assert.equal(sheet[0].breaker, 'home');
    assert.equal(BREAK_LIST_MIN, 20);
    assert.deepEqual(breakList(s, 20).map((b) => [b.side, b.pts, b.frame]), [['home', 104, 2], ['away', 54, 1]]);
    assert.deepEqual(breakList(s, 100).map((b) => b.pts), [104]);
  });
});

describe('records, undo, box', () => {
  test('records: highest break per side, centuries, a maximum, the biggest frame win', () => {
    assert.equal(snookerMatchRecords(snookerScript().state), null); // not finished
    const s = match().state;
    assert.equal(s.ended, false);
    const m = snookerScript({ bestOf: 1 }).clearance();
    const r = snookerMatchRecords(m.state)!;
    assert.deepEqual(r.items.map((i) => [i.type, i.value, i.text, i.side, i.note]), [
      ['highBreak', 147, '147', 'home', 'frame 1'],
      ['century', 147, '147', 'home', 'frame 1'],
      ['maximum', 1, '147 maximum', 'home', 'frame 1'],
      ['biggestFrame', 147147, '147–0', 'home', 'frame 1'],
    ]);
    // a concession by the player ahead isn't a "frame win" margin
    const c = snookerScript({ bestOf: 1 }).pot('red', 'black').concede('home').state;
    assert.deepEqual(snookerMatchRecords(c)!.items.map((i) => i.type), ['highBreak']);
    assert.equal(snookerMatchRecords({} as never), null);
  });

  test('undo names the step', () => {
    const m = snookerScript({ bestOf: 3 });
    const label = (i: number) => {
      const prev = S.replay({ bestOf: 3 }, m.actions.slice(0, i));
      const next = S.replay({ bestOf: 3 }, m.actions.slice(0, i + 1));
      return snookerUndoLabel({ type: m.actions[i].type, prev, next });
    };
    m.pot('red').pot('black').reds(2).pot('pink').miss().foul({ value: 4, miss: true, freeBall: true }).replace();
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(label), ['red · break 1', 'black · break 8', '2 reds · break 10', 'pink · break 16', 'missed pot', 'foul and a miss (4)', 'balls replaced']);
    m.concede('away');
    assert.equal(label(7), 'concession · frame 1');
    m.quick(80, 3);
    assert.equal(label(8), 'frame 2 score 80–3');
    assert.equal(snookerUndoLabel(null), null);
    assert.equal(snookerUndoLabel({ type: 'POT', prev: {}, next: null }), 'pot');
  });

  test('the box source: frames as periods, team figures', () => {
    const s = match().state;
    const box = snookerBox(s);
    assert.deepEqual(box.periods.map((p) => p.label), ['Frame 1', 'Frame 2', 'Frame 3']);
    assert.equal(box.players, false);
    const all = box.data('all');
    assert.deepEqual(all.home.teamStats, { framesWon: 1, points: 124, highestBreak: 104, fiftyPlus: 1, centuries: 1, fouls: 1 });
    assert.deepEqual(box.data(1).away.teamStats, { framesWon: 1, points: 58, highestBreak: 54, fiftyPlus: 1, centuries: 0, fouls: 1 });
  });
});
