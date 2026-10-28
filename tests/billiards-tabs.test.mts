/**
 * English billiards' match tabs and records — the PURE builders: commentary
 * (feed.ts), the CompareTable categories / frame sheet / break list
 * (matchStats.ts), records (records.ts), Undo's label (undo.ts) and the box
 * source (box.ts).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { billiardsScript } from './cue-script.mts';
import * as B from '../src/sports/billiards/engine.ts';
import { billiardsFeed } from '../src/sports/billiards/feed.ts';
import { billiardsMatchStats, billiardsFrameNumbers, frameSheet, breakList, BREAK_LIST_MIN } from '../src/sports/billiards/matchStats.ts';
import { billiardsMatchRecords } from '../src/sports/billiards/records.ts';
import { billiardsUndoLabel } from '../src/sports/billiards/undo.ts';
import { billiardsBox } from '../src/sports/billiards/box.ts';

const NAMES = { home: 'Asha', away: 'Ravi' };

/** 100-up, best of 3 */
function match() {
  const m = billiardsScript({ target: 100, bestOf: 3 });
  m.stroke({ potRed: true }, 4).stroke({ cannon: true }, 2).miss(); // Asha 16
  m.foul('push'); // Ravi: 2 to Asha
  m.stroke({ potRed: true, cannon: true }, 10).stroke({ inOffRed: true }, 10).safety(); // Asha 50 + 30 = 80 → 98
  m.stroke({ potWhite: true }); // Ravi 2
  m.miss();
  m.stroke({ cannon: true }); // Asha 100: frame 1
  m.quick(40, 100); // frame 2 (Ravi breaks): Ravi
  return m;
}

describe('commentary', () => {
  test('frames newest first; strokes summarised; the running score', () => {
    const g = billiardsFeed(match().state, NAMES, 'frame');
    assert.deepEqual(g.map((x) => x.title), ['Frame 3', 'Frame 2', 'Frame 1']);
    assert.deepEqual(g[1].items.map((i) => i.text), ['Frame 2 to Ravi, 100–40 · score only']);
    const f1 = g[2].items.map((i) => i.text);
    assert.equal(f1[0], 'Frame 1 to Asha, 100–2 · reached 100');
    assert.equal(f1[1], 'Asha — break of 2 (1 cannon)');
    assert.ok(f1.includes('Asha — break of 80 (10 red pots, 10 in-offs from the red, 10 cannons), then played safe'));
    assert.ok(f1.includes('Ravi fouled (push stroke): 2 to Asha'));
    assert.equal(f1[f1.length - 1], 'Asha — break of 16 (4 red pots, 2 cannons), then missed');
    assert.equal(g[2].items[g[2].items.length - 1].score, 'Asha leads 16–0');
    assert.ok(g[2].items.some((i) => i.icon === '🔥' && /break of 80/.test(i.text)));
  });
  test('a single game says game; a timed draw', () => {
    const d = billiardsScript({ format: 'timed', timedTie: 'draw' }).stroke({ potRed: true }).miss().stroke({ potRed: true }).time();
    const g = billiardsFeed(d.state, NAMES, 'game');
    assert.equal(g[0].title, 'Game 1');
    assert.equal(g[0].items[0].text, 'Game 1 drawn, 3–3 · a draw');
    assert.doesNotThrow(() => billiardsFeed({ frames: [null, { score: [1, 2], winner: 'x' }] } as never, NAMES, 'frame'));
  });
});

describe('stats tab', () => {
  test('categories, one frame, the sheet, the break list', () => {
    const s = match().state;
    assert.deepEqual(billiardsFrameNumbers(s), [1, 2, 3]);
    const cats = billiardsMatchStats(s);
    const row = (id: string, key: string) => cats.find((c) => c.id === id)!.rows.find((r) => r.key === key)!;
    assert.deepEqual([row('frames', 'framesWon').home, row('frames', 'framesWon').away], ['1', '1']);
    assert.equal(row('breaks', 'highest').home, '80');
    assert.equal(row('breaks', 'average').home, '32.7'); // 98 / 3 visits
    assert.equal(row('strokes', 'inOffRed').home, '10');
    assert.equal(row('fouls', 'fouls').away, '1');
    assert.deepEqual(billiardsMatchStats(s, 2).map((c) => c.id), ['score']);
    const sheet = frameSheet(s);
    assert.deepEqual(sheet.map((r) => [r.n, r.winner, r.score, r.how]), [[1, 'home', [100, 2], 'reached the target'], [2, 'away', [40, 100], 'score only'], [3, null, [0, 0], 'in play']]);
    assert.deepEqual(sheet[0].high, { home: 80, away: 2 });
    assert.equal(BREAK_LIST_MIN, 25);
    assert.deepEqual(breakList(s).map((b) => [b.side, b.pts]), [['home', 80]]);
  });
});

describe('records, undo, box', () => {
  test('records when finished', () => {
    const m = billiardsScript({ target: 150, bestOf: 1 });
    m.stroke({ potRed: true, cannon: true }, 21).miss(); // Asha 105
    m.stroke({ potRed: true }, 10).miss(); // Ravi 30
    m.stroke({ potRed: true }, 15); // Asha 150 → 150-30
    const r = billiardsMatchRecords(m.state)!;
    assert.deepEqual(r.items.map((i) => [i.type, i.value, i.text, i.side]), [
      ['highBreak', 105, '105', 'home'], ['highBreak', 30, '30', 'away'], ['century', 105, '105', 'home'], ['biggestFrame', 120150, '150–30', 'home'],
    ]);
    assert.equal(billiardsMatchRecords(match().state), null); // still in play
  });
  test('undo names the stroke', () => {
    const m = billiardsScript({ target: 100, bestOf: 3, hazardLimit: 2 });
    m.stroke({ potRed: true, cannon: true }).stroke({ potWhite: true }).stroke({ potWhite: true }).stroke({ potWhite: true });
    m.miss().foul().concede('home');
    const label = (i: number) => billiardsUndoLabel({ type: m.actions[i].type, prev: B.replay({ target: 100, bestOf: 3, hazardLimit: 2 }, m.actions.slice(0, i)), next: B.replay({ target: 100, bestOf: 3, hazardLimit: 2 }, m.actions.slice(0, i + 1)) });
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(label), [
      'pot red + cannon · break 5', 'pot white · break 7', 'pot white · break 9', 'foul (too many hazards)', 'missed', 'foul (2)', 'concession · frame 1',
    ]);
  });
  test('box: frames as periods', () => {
    const box = billiardsBox(match().state, 'frame');
    assert.deepEqual(box.periods.map((p) => p.label), ['Frame 1', 'Frame 2', 'Frame 3']);
    assert.deepEqual(box.data('all').home.teamStats, { framesWon: 1, points: 140, highestBreak: 80, fiftyPlus: 1, centuries: 0, fouls: 0 });
    assert.deepEqual(box.data(2).untracked, ['highestBreak', 'fiftyPlus', 'centuries', 'fouls']);
  });
});
